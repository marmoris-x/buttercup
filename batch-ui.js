/**
 * Batch Processing UI Component
 * User interface for managing batch video processing
 */

class BatchUI {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.videos = { pending: [], processing: [], completed: [], failed: [] };
        this.stats = {};
        this.isRunning = false;
        this.isPaused = false;

        this.init();
    }

    async init() {
        if (!this.container) {
            console.error('[BatchUI] Container not found');
            return;
        }

        this.createUI();
        await this.loadBatchState();
        this.attachEventListeners();
    }

    createUI() {
        this.container.innerHTML = `
            <div class="batch-ui-container" style="display: flex; flex-direction: column; gap: 12px;">
                <!-- Statistics -->
                <div class="stats shadow" style="display: grid; grid-template-columns: repeat(3, 1fr);">
                    <div class="stat place-items-center">
                        <div class="stat-title">Queued</div>
                        <div class="stat-value text-sm text-primary" id="batch-queued">0</div>
                    </div>
                    <div class="stat place-items-center">
                        <div class="stat-title">Completed</div>
                        <div class="stat-value text-sm text-success" id="batch-completed">0</div>
                    </div>
                    <div class="stat place-items-center">
                        <div class="stat-title">Failed</div>
                        <div class="stat-value text-sm text-error" id="batch-failed">0</div>
                    </div>
                </div>

                <!-- Add Videos Section -->
                <div class="form-control">
                    <label class="label">
                        <span class="label-text font-semibold">➕ Add Videos to Batch</span>
                    </label>
                    <textarea id="batch-urls" class="textarea textarea-bordered h-20 text-xs"
                              placeholder="Paste YouTube URLs (one per line)&#10;https://www.youtube.com/watch?v=...&#10;https://youtu.be/...&#10;or just video IDs"></textarea>
                </div>

                <div class="grid grid-cols-2 gap-2">
                    <button id="batch-add" class="btn btn-sm btn-primary">
                        Add to Queue
                    </button>
                    <button id="batch-paste" class="btn btn-sm btn-outline">
                        📋 Paste from Clipboard
                    </button>
                </div>

                <!-- Control Buttons -->
                <div class="grid grid-cols-3 gap-2">
                    <button id="batch-start" class="btn btn-sm btn-success" disabled>
                        ▶️ Start
                    </button>
                    <button id="batch-pause" class="btn btn-sm btn-warning" disabled>
                        ⏸️ Pause
                    </button>
                    <button id="batch-clear" class="btn btn-sm btn-error btn-outline">
                        🗑️ Clear All
                    </button>
                </div>

                <!-- Progress Info -->
                <div id="batch-progress-info" class="alert alert-info text-xs hidden">
                    <span id="batch-progress-text">Ready to process videos</span>
                </div>

                <!-- Video List -->
                <div class="divider my-0">Video Queue</div>
                <div id="batch-video-list" style="max-height: 300px; overflow-y: auto;
                     background: var(--fallback-b2,oklch(var(--b2)));
                     border-radius: 8px; padding: 8px;">
                    <div class="text-center text-sm opacity-50 py-4">
                        No videos in queue
                    </div>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        // Add videos button
        const addBtn = document.getElementById('batch-add');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.addVideos());
        }

        // Paste from clipboard button
        const pasteBtn = document.getElementById('batch-paste');
        if (pasteBtn) {
            pasteBtn.addEventListener('click', () => this.pasteFromClipboard());
        }

        // Start button
        const startBtn = document.getElementById('batch-start');
        if (startBtn) {
            startBtn.addEventListener('click', () => this.start());
        }

        // Pause button
        const pauseBtn = document.getElementById('batch-pause');
        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => this.togglePause());
        }

        // Clear button
        const clearBtn = document.getElementById('batch-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearAll());
        }

        // Listen for batch updates from content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                // Poll for updates every second
                this.updateInterval = setInterval(() => {
                    this.loadBatchState();
                }, 1000);
            }
        });
    }

    async addVideos() {
        const textarea = document.getElementById('batch-urls');
        const urls = textarea.value
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        if (urls.length === 0) {
            this.showAlert('Please enter at least one video URL', 'warning');
            return;
        }

        // Execute in content script context
        const results = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!results[0]) return;

        const result = await chrome.scripting.executeScript({
            target: { tabId: results[0].id },
            func: async (urls) => {
                if (!window.batchProcessor) {
                    return { success: false, error: 'Batch processor not available' };
                }

                try {
                    const added = await window.batchProcessor.addVideos(urls);
                    return { success: true, count: added.length };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
            args: [urls]
        });

        if (result[0]?.result?.success) {
            this.showAlert(`Added ${result[0].result.count} videos to queue`, 'success');
            textarea.value = '';
            await this.loadBatchState();
        } else {
            this.showAlert(`Failed to add videos: ${result[0]?.result?.error}`, 'error');
        }
    }

    async pasteFromClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            const textarea = document.getElementById('batch-urls');
            textarea.value = text;
            this.showAlert('Pasted from clipboard', 'success');
        } catch (error) {
            this.showAlert('Failed to paste from clipboard', 'error');
        }
    }

    async start() {
        const results = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!results[0]) return;

        await chrome.scripting.executeScript({
            target: { tabId: results[0].id },
            func: async () => {
                if (window.batchProcessor) {
                    await window.batchProcessor.start();
                }
            }
        });

        await this.loadBatchState();
    }

    async togglePause() {
        const results = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!results[0]) return;

        const action = this.isPaused ? 'resume' : 'pause';

        await chrome.scripting.executeScript({
            target: { tabId: results[0].id },
            func: async (action) => {
                if (window.batchProcessor) {
                    if (action === 'pause') {
                        await window.batchProcessor.pause();
                    } else {
                        await window.batchProcessor.resume();
                    }
                }
            },
            args: [action]
        });

        await this.loadBatchState();
    }

    async clearAll() {
        if (!confirm('Are you sure you want to clear all videos? This cannot be undone.')) {
            return;
        }

        const results = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!results[0]) return;

        await chrome.scripting.executeScript({
            target: { tabId: results[0].id },
            func: async () => {
                if (window.batchProcessor) {
                    await window.batchProcessor.clearAll();
                }
            }
        });

        await this.loadBatchState();
        this.showAlert('Cleared all videos', 'success');
    }

    async loadBatchState() {
        try {
            const result = await chrome.storage.local.get(['buttercup_batch_processor']);
            const saved = result.buttercup_batch_processor;

            if (saved) {
                this.videos = {
                    pending: saved.queue || [],
                    processing: [],
                    completed: saved.completed || [],
                    failed: saved.failed || []
                };

                this.stats = saved.stats || {};
                this.isRunning = saved.isRunning || false;
                this.isPaused = saved.isPaused || false;

                this.updateUI();
            }
        } catch (error) {
            console.error('[BatchUI] Failed to load batch state:', error);
        }
    }

    updateUI() {
        // Update statistics
        const queuedEl = document.getElementById('batch-queued');
        const completedEl = document.getElementById('batch-completed');
        const failedEl = document.getElementById('batch-failed');

        if (queuedEl) queuedEl.textContent = this.videos.pending.length + this.videos.processing.length;
        if (completedEl) completedEl.textContent = this.videos.completed.length;
        if (failedEl) failedEl.textContent = this.videos.failed.length;

        // Update buttons
        const startBtn = document.getElementById('batch-start');
        const pauseBtn = document.getElementById('batch-pause');

        const hasVideos = this.videos.pending.length > 0 || this.videos.processing.length > 0;

        if (startBtn) {
            startBtn.disabled = !hasVideos || (this.isRunning && !this.isPaused);
            startBtn.textContent = this.isRunning && !this.isPaused ? '▶️ Running...' : '▶️ Start';
        }

        if (pauseBtn) {
            pauseBtn.disabled = !this.isRunning;
            pauseBtn.textContent = this.isPaused ? '▶️ Resume' : '⏸️ Pause';
        }

        // Update progress info
        const progressInfo = document.getElementById('batch-progress-info');
        const progressText = document.getElementById('batch-progress-text');

        if (this.isRunning && !this.isPaused) {
            progressInfo.classList.remove('hidden');
            progressInfo.classList.remove('alert-info');
            progressInfo.classList.add('alert-success');
            progressText.textContent = `Processing... ${this.videos.completed.length} completed, ${this.videos.pending.length} pending`;
        } else if (this.isPaused) {
            progressInfo.classList.remove('hidden');
            progressInfo.classList.remove('alert-success');
            progressInfo.classList.add('alert-warning');
            progressText.textContent = 'Paused';
        } else if (hasVideos) {
            progressInfo.classList.remove('hidden');
            progressInfo.classList.remove('alert-warning');
            progressInfo.classList.add('alert-info');
            progressText.textContent = 'Ready to process videos';
        } else {
            progressInfo.classList.add('hidden');
        }

        // Update video list
        this.displayVideos();
    }

    displayVideos() {
        const listEl = document.getElementById('batch-video-list');
        if (!listEl) return;

        const allVideos = [
            ...this.videos.processing.map(v => ({ ...v, status: 'processing' })),
            ...this.videos.pending.map(v => ({ ...v, status: 'pending' })),
            ...this.videos.completed.map(v => ({ ...v, status: 'completed' })),
            ...this.videos.failed.map(v => ({ ...v, status: 'failed' }))
        ];

        if (allVideos.length === 0) {
            listEl.innerHTML = `
                <div class="text-center text-sm opacity-50 py-4">
                    No videos in queue
                </div>
            `;
            return;
        }

        listEl.innerHTML = allVideos.map(video => {
            const statusIcon = {
                pending: '⏳',
                processing: '🔄',
                completed: '✅',
                failed: '❌'
            }[video.status];

            const statusColor = {
                pending: '#868e96',
                processing: '#339af0',
                completed: '#51cf66',
                failed: '#ff6b6b'
            }[video.status];

            const progress = video.progress || 0;
            const currentStep = video.currentStep || '';

            return `
                <div class="video-item mb-2 p-2 rounded"
                     style="border-left: 3px solid ${statusColor};
                            background: var(--fallback-b1,oklch(var(--b1)));
                            font-size: 11px;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 4px;">
                        <div style="display: flex; gap: 6px; align-items: center; flex: 1;">
                            <span>${statusIcon}</span>
                            <span style="font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(video.title || video.videoId)}</span>
                        </div>
                    </div>
                    ${video.status === 'processing' ? `
                        <div class="progress-bar" style="width: 100%; height: 4px; background: rgba(0,0,0,0.2); border-radius: 2px; overflow: hidden; margin-bottom: 4px;">
                            <div style="width: ${progress}%; height: 100%; background: ${statusColor}; transition: width 0.3s;"></div>
                        </div>
                        <div style="opacity: 0.7; font-size: 10px;">${currentStep}</div>
                    ` : ''}
                    ${video.error ? `
                        <div style="opacity: 0.7; font-size: 10px; color: #ff6b6b; margin-top: 4px;">
                            Error: ${this.escapeHtml(video.error)}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showAlert(message, type) {
        const alertDiv = document.getElementById('alert');
        if (alertDiv) {
            alertDiv.textContent = message;
            alertDiv.className = `alert alert-${type} mb-4`;
            alertDiv.classList.remove('hidden');
            setTimeout(() => alertDiv.classList.add('hidden'), 3000);
        }
    }

    async refresh() {
        await this.loadBatchState();
    }

    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }
}

// Export for use in popup
if (typeof window !== 'undefined') {
    window.BatchUI = BatchUI;
}
