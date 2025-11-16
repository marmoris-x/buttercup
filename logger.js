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
        // Load log level from settings
        try {
            // Check if chrome.storage.sync is available
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                const result = await chrome.storage.sync.get(['buttercup_log_level']);
                if (result.buttercup_log_level) {
                    this.currentLevel = this.LOG_LEVELS[result.buttercup_log_level] || this.LOG_LEVELS.INFO;
                }
            }
        } catch (error) {
            console.error('[Logger] Failed to load log level:', error);
        }
    }

    /**
     * Set the minimum log level
     * @param {string} level - 'DEBUG', 'INFO', 'WARN', or 'ERROR'
     */
    async setLevel(level) {
        if (this.LOG_LEVELS[level]) {
            this.currentLevel = this.LOG_LEVELS[level];
            try {
                await chrome.storage.sync.set({ buttercup_log_level: level });
            } catch (error) {
                console.error('[Logger] Failed to save log level:', error);
            }
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
     */
    async saveLog(entry) {
        try {
            // Get existing logs
            const result = await chrome.storage.local.get(['buttercup_logs']);
            let logs = result.buttercup_logs || [];

            // Add new log
            logs.push(entry);

            // Rotate logs if exceeding max
            if (logs.length > this.maxLogs) {
                logs = logs.slice(-this.maxLogs); // Keep only the last maxLogs entries
            }

            // Save back to storage
            await chrome.storage.local.set({ buttercup_logs: logs });
        } catch (error) {
            console.error('[Logger] Failed to save log:', error);
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
     */
    async getLogs(filters = {}) {
        try {
            const result = await chrome.storage.local.get(['buttercup_logs']);
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

            return logs;
        } catch (error) {
            console.error('[Logger] Failed to get logs:', error);
            return [];
        }
    }

    /**
     * Clear all logs from storage
     */
    async clearLogs() {
        try {
            await chrome.storage.local.set({ buttercup_logs: [] });
            this.info('STORAGE', 'All logs cleared');
            return true;
        } catch (error) {
            this.error('STORAGE', 'Failed to clear logs', error);
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
}

// Create global instance
if (typeof window !== 'undefined') {
    window.ButtercupLogger = ButtercupLogger;
    window.buttercupLogger = new ButtercupLogger();
    console.log('[Buttercup] 📝 Advanced logging system initialized');
}
