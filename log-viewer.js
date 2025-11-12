/**
 * Log Viewer UI Component
 * Displays logs in a filterable, searchable interface
 */

class LogViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.logs = [];
        this.filteredLogs = [];
        this.currentFilters = {
            level: 'ALL',
            category: 'ALL',
            searchText: ''
        };

        this.init();
    }

    async init() {
        if (!this.container) {
            console.error('[LogViewer] Container not found');
            return;
        }

        this.createUI();
        await this.loadLogs();
    }

    createUI() {
        this.container.innerHTML = `
            <div class="log-viewer-container" style="display: flex; flex-direction: column; gap: 12px; height: 100%;">
                <!-- Header with stats -->
                <div id="log-stats" class="stats shadow" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));">
                    <div class="stat place-items-center">
                        <div class="stat-title">Total</div>
                        <div class="stat-value text-sm" id="total-logs">0</div>
                    </div>
                    <div class="stat place-items-center">
                        <div class="stat-title">Errors</div>
                        <div class="stat-value text-sm text-error" id="error-logs">0</div>
                    </div>
                    <div class="stat place-items-center">
                        <div class="stat-title">Warnings</div>
                        <div class="stat-value text-sm text-warning" id="warn-logs">0</div>
                    </div>
                </div>

                <!-- Filters -->
                <div class="form-control">
                    <label class="label">
                        <span class="label-text font-semibold">🔍 Search Logs</span>
                    </label>
                    <input type="text" id="log-search" placeholder="Search messages..."
                           class="input input-bordered input-sm w-full" />
                </div>

                <div class="grid grid-cols-2 gap-2">
                    <div class="form-control">
                        <label class="label py-1">
                            <span class="label-text text-xs">Log Level</span>
                        </label>
                        <select id="log-level-filter" class="select select-bordered select-sm">
                            <option value="ALL">All Levels</option>
                            <option value="DEBUG">🔍 Debug</option>
                            <option value="INFO">ℹ️ Info</option>
                            <option value="SUCCESS">✅ Success</option>
                            <option value="WARN">⚠️ Warnings</option>
                            <option value="ERROR">❌ Errors</option>
                        </select>
                    </div>

                    <div class="form-control">
                        <label class="label py-1">
                            <span class="label-text text-xs">Category</span>
                        </label>
                        <select id="log-category-filter" class="select select-bordered select-sm">
                            <option value="ALL">All Categories</option>
                            <option value="GENERAL">General</option>
                            <option value="API">API</option>
                            <option value="TRANSCRIPTION">Transcription</option>
                            <option value="TRANSLATION">Translation</option>
                            <option value="EXPORT">Export</option>
                            <option value="UI">UI</option>
                            <option value="STORAGE">Storage</option>
                            <option value="PERFORMANCE">Performance</option>
                        </select>
                    </div>
                </div>

                <!-- Action buttons -->
                <div class="grid grid-cols-3 gap-2">
                    <button id="export-logs-json" class="btn btn-sm btn-outline">
                        📄 JSON
                    </button>
                    <button id="export-logs-txt" class="btn btn-sm btn-outline">
                        📝 TXT
                    </button>
                    <button id="clear-logs" class="btn btn-sm btn-outline btn-error">
                        🗑️ Clear
                    </button>
                </div>

                <!-- Log Level Setting -->
                <div class="form-control">
                    <label class="label py-1">
                        <span class="label-text text-xs font-semibold">⚙️ Minimum Log Level</span>
                    </label>
                    <select id="log-level-setting" class="select select-bordered select-sm">
                        <option value="DEBUG">Debug (Show Everything)</option>
                        <option value="INFO" selected>Info (Default)</option>
                        <option value="WARN">Warnings Only</option>
                        <option value="ERROR">Errors Only</option>
                    </select>
                    <label class="label">
                        <span class="label-text-alt">Controls which logs are saved</span>
                    </label>
                </div>

                <!-- Logs display -->
                <div class="divider my-0">Recent Logs</div>
                <div id="logs-display" style="flex: 1; overflow-y: auto; max-height: 300px;
                     background: var(--fallback-b2,oklch(var(--b2)));
                     border-radius: 8px; padding: 8px;">
                    <div class="text-center text-sm opacity-50 py-4">
                        Loading logs...
                    </div>
                </div>
            </div>
        `;

        this.attachEventListeners();
    }

    attachEventListeners() {
        // Search
        const searchInput = document.getElementById('log-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.currentFilters.searchText = e.target.value;
                this.applyFilters();
            });
        }

        // Level filter
        const levelFilter = document.getElementById('log-level-filter');
        if (levelFilter) {
            levelFilter.addEventListener('change', (e) => {
                this.currentFilters.level = e.target.value;
                this.applyFilters();
            });
        }

        // Category filter
        const categoryFilter = document.getElementById('log-category-filter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', (e) => {
                this.currentFilters.category = e.target.value;
                this.applyFilters();
            });
        }

        // Export JSON
        const exportJsonBtn = document.getElementById('export-logs-json');
        if (exportJsonBtn) {
            exportJsonBtn.addEventListener('click', () => this.exportLogs('json'));
        }

        // Export TXT
        const exportTxtBtn = document.getElementById('export-logs-txt');
        if (exportTxtBtn) {
            exportTxtBtn.addEventListener('click', () => this.exportLogs('txt'));
        }

        // Clear logs
        const clearBtn = document.getElementById('clear-logs');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearLogs());
        }

        // Log level setting
        const logLevelSetting = document.getElementById('log-level-setting');
        if (logLevelSetting) {
            // Load current setting
            chrome.storage.sync.get(['buttercup_log_level'], (result) => {
                if (result.buttercup_log_level) {
                    logLevelSetting.value = result.buttercup_log_level;
                }
            });

            logLevelSetting.addEventListener('change', (e) => {
                chrome.storage.sync.set({ buttercup_log_level: e.target.value });

                // Notify content script to update logger
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs[0]) {
                        chrome.scripting.executeScript({
                            target: { tabId: tabs[0].id },
                            func: (level) => {
                                if (window.buttercupLogger) {
                                    window.buttercupLogger.setLevel(level);
                                }
                            },
                            args: [e.target.value]
                        });
                    }
                });

                this.showAlert(`Log level set to ${e.target.value}`, 'success');
            });
        }
    }

    async loadLogs() {
        try {
            const result = await chrome.storage.local.get(['buttercup_logs']);
            this.logs = result.buttercup_logs || [];
            this.applyFilters();
            this.updateStats();
        } catch (error) {
            console.error('[LogViewer] Failed to load logs:', error);
            this.displayLogs([]);
        }
    }

    applyFilters() {
        let filtered = [...this.logs];

        // Level filter
        if (this.currentFilters.level !== 'ALL') {
            filtered = filtered.filter(log => log.level === this.currentFilters.level);
        }

        // Category filter
        if (this.currentFilters.category !== 'ALL') {
            filtered = filtered.filter(log => log.category === this.currentFilters.category);
        }

        // Search filter
        if (this.currentFilters.searchText) {
            const searchLower = this.currentFilters.searchText.toLowerCase();
            filtered = filtered.filter(log =>
                log.message.toLowerCase().includes(searchLower) ||
                (log.data && JSON.stringify(log.data).toLowerCase().includes(searchLower))
            );
        }

        this.filteredLogs = filtered;
        this.displayLogs(filtered);
    }

    displayLogs(logs) {
        const display = document.getElementById('logs-display');
        if (!display) return;

        if (logs.length === 0) {
            display.innerHTML = `
                <div class="text-center text-sm opacity-50 py-4">
                    No logs found
                </div>
            `;
            return;
        }

        // Show most recent logs first
        const recentLogs = logs.slice(-50).reverse();

        display.innerHTML = recentLogs.map(log => {
            const time = new Date(log.timestamp).toLocaleTimeString();
            const hasData = log.data && Object.keys(log.data).length > 0;

            return `
                <div class="log-entry mb-2 p-2 rounded"
                     style="border-left: 3px solid ${log.color};
                            background: var(--fallback-b1,oklch(var(--b1)));
                            font-size: 11px;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 4px;">
                        <div style="display: flex; gap: 6px; align-items: center;">
                            <span>${log.icon}</span>
                            <span style="font-weight: 600; color: ${log.color};">${log.level}</span>
                            <span class="badge badge-xs badge-outline">${log.category}</span>
                        </div>
                        <span class="opacity-50" style="font-size: 10px;">${time}</span>
                    </div>
                    <div style="margin-left: 24px; line-height: 1.4;">
                        ${this.escapeHtml(log.message)}
                    </div>
                    ${hasData ? `
                        <details style="margin-left: 24px; margin-top: 4px;">
                            <summary style="cursor: pointer; opacity: 0.7; font-size: 10px;">
                                Show data
                            </summary>
                            <pre style="margin-top: 4px; padding: 4px; background: rgba(0,0,0,0.2);
                                        border-radius: 4px; font-size: 10px; overflow-x: auto;">${this.escapeHtml(JSON.stringify(log.data, null, 2))}</pre>
                        </details>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    updateStats() {
        const totalEl = document.getElementById('total-logs');
        const errorEl = document.getElementById('error-logs');
        const warnEl = document.getElementById('warn-logs');

        if (totalEl) totalEl.textContent = this.logs.length;
        if (errorEl) errorEl.textContent = this.logs.filter(log => log.level === 'ERROR').length;
        if (warnEl) warnEl.textContent = this.logs.filter(log => log.level === 'WARN').length;
    }

    async exportLogs(format) {
        try {
            const filters = this.currentFilters.level === 'ALL' && this.currentFilters.category === 'ALL'
                ? {}
                : {
                    level: this.currentFilters.level !== 'ALL' ? this.currentFilters.level : undefined,
                    category: this.currentFilters.category !== 'ALL' ? this.currentFilters.category : undefined
                };

            // Execute in content script context
            const results = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!results[0]) return;

            const result = await chrome.scripting.executeScript({
                target: { tabId: results[0].id },
                func: async (format, filters) => {
                    if (!window.buttercupLogger) {
                        return { success: false, error: 'Logger not available' };
                    }

                    try {
                        let content;
                        if (format === 'json') {
                            content = await window.buttercupLogger.exportLogsJSON(filters);
                        } else {
                            content = await window.buttercupLogger.exportLogsTXT(filters);
                        }

                        window.buttercupLogger.downloadLogs(content, format);
                        return { success: true };
                    } catch (error) {
                        return { success: false, error: error.message };
                    }
                },
                args: [format, filters]
            });

            if (result[0]?.result?.success) {
                this.showAlert(`Logs exported as ${format.toUpperCase()}`, 'success');
            } else {
                this.showAlert('Failed to export logs', 'error');
            }
        } catch (error) {
            console.error('[LogViewer] Export failed:', error);
            this.showAlert('Failed to export logs', 'error');
        }
    }

    async clearLogs() {
        if (!confirm('Are you sure you want to clear all logs? This cannot be undone.')) {
            return;
        }

        try {
            await chrome.storage.local.set({ buttercup_logs: [] });
            this.logs = [];
            this.applyFilters();
            this.updateStats();
            this.showAlert('All logs cleared', 'success');
        } catch (error) {
            console.error('[LogViewer] Failed to clear logs:', error);
            this.showAlert('Failed to clear logs', 'error');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showAlert(message, type) {
        // Use existing alert system if available
        const alertDiv = document.getElementById('alert');
        if (alertDiv) {
            alertDiv.textContent = message;
            alertDiv.className = `alert alert-${type} mb-4`;
            alertDiv.classList.remove('hidden');
            setTimeout(() => alertDiv.classList.add('hidden'), 3000);
        }
    }

    // Refresh logs (call this when tab becomes visible)
    async refresh() {
        await this.loadLogs();
    }
}

// Export for use in popup
if (typeof window !== 'undefined') {
    window.LogViewer = LogViewer;
}
