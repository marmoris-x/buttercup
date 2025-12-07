/**
 * Buttercup Advanced Logging System
 *
 * Features:
 * - Multiple log levels (DEBUG, INFO, WARN, ERROR)
 * - Structured logging with timestamps and categories
 * - Persistent storage with rotation
 * - Performance tracking for API calls
 * - Export logs as JSON or TXT
 * - UI viewer with filtering
 */

class ButtercupLogger {
    constructor() {
        this.LOG_LEVELS = {
            DEBUG: { value: 0, label: 'DEBUG', icon: '[D]', color: '#868e96' },
            INFO: { value: 1, label: 'INFO', icon: '[I]', color: '#339af0' },
            WARN: { value: 2, label: 'WARN', icon: '[W]', color: '#ffd43b' },
            ERROR: { value: 3, label: 'ERROR', icon: '[E]', color: '#ff6b6b' },
            SUCCESS: { value: 1, label: 'SUCCESS', icon: '[S]', color: '#51cf66' }
        };

        this.currentLevel = this.LOG_LEVELS.INFO; // Default level
        this.maxLogs = 500; // Max logs to keep in storage
        this.categories = new Set(['GENERAL', 'API', 'TRANSCRIPTION', 'TRANSLATION', 'EXPORT', 'UI', 'STORAGE']);

        // Performance tracking
        this.performanceTrackers = new Map();

        this.init();
    }

    async init() {
        // Detect context: Extension (has chrome.storage) vs Page (no chrome.storage)
        this.isExtensionContext = typeof chrome !== 'undefined' &&
                                  chrome.storage &&
                                  chrome.storage.local;

        this.isPageContext = !this.isExtensionContext && typeof window !== 'undefined';

        if (this.isPageContext) {
            // Page context: Use window.postMessage to send logs to content script
            this.storageMethod = 'postMessage';
            console.log('[Logger] 📝 Running in PAGE context - using postMessage bridge');

            // Simple init log in page context
            this.info('GENERAL', 'Logger initialized in page context (using message bridge)')
                .catch(() => {/* silent */});

        } else if (this.isExtensionContext) {
            // Extension context: Direct chrome.storage access
            this.storageMethod = 'chromeStorage';
            console.log('[Logger] 📝 Running in EXTENSION context - using chrome.storage directly');

            // Load log level from settings
            try {
                if (chrome.storage && chrome.storage.sync) {
                    chrome.storage.sync.get(['buttercup_log_level'], (result) => {
                        if (chrome.runtime.lastError) {
                            console.error('[Logger] Failed to load log level:', chrome.runtime.lastError);
                            return;
                        }

                        if (result.buttercup_log_level) {
                            this.currentLevel = this.LOG_LEVELS[result.buttercup_log_level] || this.LOG_LEVELS.INFO;
                        }

                        // Write a test log to verify functionality
                        this.info('GENERAL', 'Logger initialized in extension context')
                            .catch(err => console.error('[Logger] Failed to write init log:', err));
                    });
                } else {
                    this.info('GENERAL', 'Logger initialized in extension context')
                        .catch(err => console.error('[Logger] Failed to write init log:', err));
                }
            } catch (error) {
                console.error('[Logger] Failed to load log level:', error);
            }
        } else {
            // Unknown context - disable logging
            this.storageMethod = 'none';
            console.warn('[Logger] ⚠️ Running in UNKNOWN context - logging disabled');
        }
    }

    /**
     * Set the minimum log level
     * @param {string} level - 'DEBUG', 'INFO', 'WARN', or 'ERROR'
     */
    setLevel(level) {
        if (this.LOG_LEVELS[level]) {
            const oldLevel = this.currentLevel.label;
            this.currentLevel = this.LOG_LEVELS[level];

            console.log(`[Logger] 📝 Log level changed: ${oldLevel} → ${level}`);

            // Save to chrome.storage if available (extension context)
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                chrome.storage.sync.set({ buttercup_log_level: level }, () => {
                    if (chrome.runtime.lastError) {
                        console.error('[Logger] Failed to save log level:', chrome.runtime.lastError);
                    } else {
                        console.log(`[Logger] ✅ Log level saved to storage: ${level}`);
                    }
                });
            }
        } else {
            console.warn(`[Logger] ⚠️ Invalid log level: ${level}`);
        }
    }

    /**
     * Create a structured log entry
     */
    createLogEntry(level, category, message, data = null) {
        return {
            timestamp: Date.now(),
            timestampFormatted: new Date().toISOString(),
            level: level.label,
            levelValue: level.value,
            category: category,
            message: message,
            data: data,
            icon: level.icon,
            color: level.color
        };
    }

    /**
     * Check if a log should be recorded based on current level
     */
    shouldLog(level) {
        return level.value >= this.currentLevel.value;
    }

    /**
     * Save log entry to storage
     * Routes to appropriate storage method based on context
     */
    async saveLog(entry) {
        if (this.storageMethod === 'postMessage') {
            // Page context: Send via window.postMessage to content script
            this.saveLogViaPostMessage(entry);
        } else if (this.storageMethod === 'chromeStorage') {
            // Extension context: Direct chrome.storage access
            await this.saveLogViaChromeStorage(entry);
        }
        // 'none' context: silently skip logging
    }

    /**
     * Save log via window.postMessage (Page Context)
     * Sends log to content script which has chrome.storage access
     */
    saveLogViaPostMessage(entry) {
        try {
            window.postMessage({
                type: 'BUTTERCUP_LOG_SAVE',
                source: 'buttercup-logger',
                log: entry
            }, '*');
        } catch (error) {
            // Silent failure - don't spam console
            // This can happen if window is not available or postMessage fails
        }
    }

    /**
     * Save log via chrome.storage (Extension Context)
     * Direct storage access when running in extension context
     */
    async saveLogViaChromeStorage(entry) {
        // Double-check chrome.storage exists before each call (can become undefined)
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            this.storageMethod = 'none';
            return;
        }

        try {
            // Use callback-based API for better compatibility
            return new Promise((resolve, reject) => {
                chrome.storage.local.get(['buttercup_logs'], (result) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                        return;
                    }

                    let logs = result.buttercup_logs || [];

                    // Add new log
                    logs.push(entry);

                    // Rotate logs if exceeding max
                    if (logs.length > this.maxLogs) {
                        logs = logs.slice(-this.maxLogs);
                    }

                    // Save back to storage
                    chrome.storage.local.set({ buttercup_logs: logs }, () => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve();
                        }
                    });
                });
            });
        } catch (error) {
            // Silent failure - don't spam console
            this.storageMethod = 'none';
        }
    }

    /**
     * Main logging method
     */
    async log(level, category, message, data = null) {
        if (!this.shouldLog(level)) {
            return;
        }

        const entry = this.createLogEntry(level, category, message, data);

        // Console output with styling
        const consoleMethod = level.value >= this.LOG_LEVELS.ERROR.value ? 'error' :
                            level.value >= this.LOG_LEVELS.WARN.value ? 'warn' : 'log';

        const consoleMessage = `[Buttercup ${entry.level}] [${category}] ${message}`;

        if (data) {
            console[consoleMethod](consoleMessage, data);
        } else {
            console[consoleMethod](consoleMessage);
        }

        // Save to storage
        await this.saveLog(entry);
    }

    // Convenience methods for different log levels
    async debug(category, message, data = null) {
        await this.log(this.LOG_LEVELS.DEBUG, category, message, data);
    }

    async info(category, message, data = null) {
        await this.log(this.LOG_LEVELS.INFO, category, message, data);
    }

    async warn(category, message, data = null) {
        await this.log(this.LOG_LEVELS.WARN, category, message, data);
    }

    async error(category, message, data = null) {
        await this.log(this.LOG_LEVELS.ERROR, category, message, data);
    }

    async success(category, message, data = null) {
        await this.log(this.LOG_LEVELS.SUCCESS, category, message, data);
    }

    /**
     * Performance tracking - start a timer
     */
    startPerformanceTracking(operationId, operationName, category = 'PERFORMANCE') {
        this.performanceTrackers.set(operationId, {
            name: operationName,
            category: category,
            startTime: performance.now(),
            startTimestamp: Date.now()
        });

        this.debug(category, `Started: ${operationName}`, { operationId });
    }

    /**
     * Performance tracking - end a timer and log duration
     */
    async endPerformanceTracking(operationId, additionalData = null) {
        const tracker = this.performanceTrackers.get(operationId);
        if (!tracker) {
            this.warn('PERFORMANCE', `No performance tracker found for: ${operationId}`);
            return null;
        }

        const endTime = performance.now();
        const duration = endTime - tracker.startTime;
        const durationFormatted = this.formatDuration(duration);

        const performanceData = {
            operationId: operationId,
            operationName: tracker.name,
            duration: duration,
            durationFormatted: durationFormatted,
            startTime: tracker.startTimestamp,
            endTime: Date.now(),
            ...additionalData
        };

        await this.info(tracker.category, `Completed: ${tracker.name} (${durationFormatted})`, performanceData);

        this.performanceTrackers.delete(operationId);
        return performanceData;
    }

    /**
     * Format duration in human-readable form
     */
    formatDuration(ms) {
        if (ms < 1000) {
            return `${Math.round(ms)}ms`;
        } else if (ms < 60000) {
            return `${(ms / 1000).toFixed(2)}s`;
        } else {
            const minutes = Math.floor(ms / 60000);
            const seconds = ((ms % 60000) / 1000).toFixed(0);
            return `${minutes}m ${seconds}s`;
        }
    }

    /**
     * Get all logs from storage
     * Note: Only works in extension context (popup, content script)
     * Returns empty array in page context
     */
    async getLogs(filters = {}) {
        // Only works in extension context
        if (this.storageMethod !== 'chromeStorage') {
            console.warn('[Logger] getLogs() only works in extension context');
            return [];
        }

        // Double-check chrome.storage exists
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            return [];
        }

        try {
            return new Promise((resolve) => {
                chrome.storage.local.get(['buttercup_logs'], (result) => {
                    if (chrome.runtime.lastError) {
                        resolve([]);
                        return;
                    }

                    let logs = result.buttercup_logs || [];

                    // Apply filters
                    if (filters.level) {
                        logs = logs.filter(log => log.level === filters.level);
                    }
                    if (filters.category) {
                        logs = logs.filter(log => log.category === filters.category);
                    }
                    if (filters.startTime) {
                        logs = logs.filter(log => log.timestamp >= filters.startTime);
                    }
                    if (filters.endTime) {
                        logs = logs.filter(log => log.timestamp <= filters.endTime);
                    }
                    if (filters.searchText) {
                        const searchLower = filters.searchText.toLowerCase();
                        logs = logs.filter(log =>
                            log.message.toLowerCase().includes(searchLower) ||
                            (log.data && JSON.stringify(log.data).toLowerCase().includes(searchLower))
                        );
                    }

                    resolve(logs);
                });
            });
        } catch (error) {
            return [];
        }
    }

    /**
     * Clear all logs from storage
     * Note: Only works in extension context (popup, content script)
     * Returns false in page context
     */
    async clearLogs() {
        // Only works in extension context
        if (this.storageMethod !== 'chromeStorage') {
            console.warn('[Logger] clearLogs() only works in extension context');
            return false;
        }

        // Double-check chrome.storage exists
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            return false;
        }

        try {
            return new Promise((resolve, reject) => {
                chrome.storage.local.set({ buttercup_logs: [] }, () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        this.info('STORAGE', 'All logs cleared')
                            .catch(() => {/* silent */});
                        resolve(true);
                    }
                });
            });
        } catch (error) {
            return false;
        }
    }

    /**
     * Export logs as JSON
     */
    async exportLogsJSON(filters = {}) {
        const logs = await this.getLogs(filters);
        return JSON.stringify({
            exportDate: new Date().toISOString(),
            totalLogs: logs.length,
            filters: filters,
            logs: logs
        }, null, 2);
    }

    /**
     * Export logs as plain text
     */
    async exportLogsTXT(filters = {}) {
        const logs = await this.getLogs(filters);
        let txt = `Buttercup Logs Export\n`;
        txt += `Export Date: ${new Date().toISOString()}\n`;
        txt += `Total Logs: ${logs.length}\n`;
        txt += `${'='.repeat(80)}\n\n`;

        for (const log of logs) {
            txt += `[${log.timestampFormatted}] ${log.icon} ${log.level} [${log.category}]\n`;
            txt += `${log.message}\n`;
            if (log.data) {
                txt += `Data: ${JSON.stringify(log.data, null, 2)}\n`;
            }
            txt += `${'-'.repeat(80)}\n`;
        }

        return txt;
    }

    /**
     * Download logs as a file
     */
    downloadLogs(content, format = 'json') {
        const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `buttercup-logs-${Date.now()}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Get log statistics
     */
    async getStats() {
        const logs = await this.getLogs();

        const stats = {
            total: logs.length,
            byLevel: {},
            byCategory: {},
            timeRange: {
                oldest: logs.length > 0 ? new Date(logs[0].timestamp).toISOString() : null,
                newest: logs.length > 0 ? new Date(logs[logs.length - 1].timestamp).toISOString() : null
            }
        };

        // Count by level
        for (const level of Object.keys(this.LOG_LEVELS)) {
            stats.byLevel[level] = logs.filter(log => log.level === level).length;
        }

        // Count by category
        for (const log of logs) {
            stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
        }

        return stats;
    }

    /**
     * Intercept console methods to capture all Buttercup logs
     * Works in both page and extension contexts
     */
    interceptConsole() {
        // Skip if storage method is 'none'
        if (this.storageMethod === 'none') {
            console.warn('[Logger] Console interception disabled (unknown context)');
            return;
        }

        // Store original methods
        const originalInfo = console.info.bind(console);
        const originalWarn = console.warn.bind(console);
        const originalError = console.error.bind(console);

        // Helper to extract Buttercup messages
        const isButtercupLog = (args) => {
            const firstArg = args[0];
            return typeof firstArg === 'string' &&
                   (firstArg.startsWith('[Buttercup]') ||
                    firstArg.startsWith('[CaptionOverlay]') ||
                    firstArg.startsWith('[LLMTranslation]') ||
                    firstArg.startsWith('[TranscriptStorage]') ||
                    firstArg.startsWith('[TranscriptSearch]') ||
                    firstArg.startsWith('[SummarySidebar]') ||
                    firstArg.startsWith('[ProgressIndicator]'));
        };

        const parseMessage = (args) => {
            const text = String(args[0]);
            const match = text.match(/\[(.*?)\]\s*(.*)/);
            if (match) {
                let category = match[1]
                    .replace('Buttercup', 'GENERAL')
                    .replace('CaptionOverlay', 'UI')
                    .replace('LLMTranslation', 'TRANSLATION')
                    .replace('TranscriptStorage', 'STORAGE')
                    .replace('TranscriptSearch', 'UI')
                    .replace('SummarySidebar', 'UI')
                    .replace('ProgressIndicator', 'UI')
                    .toUpperCase();

                return {
                    category: category,
                    message: match[2].trim() || text
                };
            }
            return { category: 'GENERAL', message: text };
        };

        // Safe log wrapper
        const safeLog = (level, args) => {
            try {
                if (isButtercupLog(args)) {
                    const parsed = parseMessage(args);
                    const data = args.length > 1 ? args[1] : null;

                    // Call log method without await to avoid blocking
                    level.call(this, parsed.category, parsed.message, data)
                        .catch(err => {
                            // Silent failure - don't spam console with errors
                        });
                }
            } catch (err) {
                // Silent failure
            }
        };

        // Override console.info
        console.info = (...args) => {
            originalInfo(...args);
            safeLog(this.info, args);
        };

        // Override console.warn
        console.warn = (...args) => {
            originalWarn(...args);
            safeLog(this.warn, args);
        };

        // Override console.error
        console.error = (...args) => {
            originalError(...args);
            safeLog(this.error, args);
        };

        console.log('[Buttercup] 🎯 Console interception active');
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.ButtercupLogger = ButtercupLogger;
    window.buttercupLogger = new ButtercupLogger();

    // Auto-intercept console after a short delay to let logger initialize
    setTimeout(() => {
        window.buttercupLogger.interceptConsole();
    }, 100);

    // Listen for log level changes from content script
    window.addEventListener('message', (event) => {
        // Security: Only accept messages from same origin
        if (event.source !== window) {
            return;
        }

        // Handle log level changes
        if (event.data &&
            event.data.type === 'BUTTERCUP_LOG_LEVEL_CHANGE' &&
            event.data.source === 'buttercup-content-script' &&
            event.data.level) {

            console.log(`[Logger] 📝 Received log level change request: ${event.data.level}`);
            window.buttercupLogger.setLevel(event.data.level);
        }
    }, false);

    console.log('[Buttercup] 📝 Advanced logging system initialized');
}
