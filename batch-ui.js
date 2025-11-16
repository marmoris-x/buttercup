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
                        <span class="label-text font-semibold">Add Videos to Batch</span>
                    </label>
                    <textarea id="batch-urls" class="textarea textarea-bordered h-20 text-xs"
                              placeholder="Paste YouTube URLs (one per line)&#10;https://www.youtube.com/watch?v=...&#10;https://youtu.be/...&#10;or just video IDs"></textarea>
                </div>

                <div class="grid grid-cols-2 gap-2">
                    <button id="batch-add" class="btn btn-sm btn-primary">
                        Add to Queue
                    </button>
                    <button id="batch-paste" class="btn btn-sm btn-outline">
                        Paste from Clipboard
                    </button>
                </div>

                <!-- Control Buttons -->
                <div class="grid grid-cols-3 gap-2">
                    <button id="batch-start" class="btn btn-sm btn-success" disabled>
                        Start
                    </button>
                    <button id="batch-pause" class="btn btn-sm btn-warning" disabled>
                        Pause
                    </button>
                    <button id="batch-clear" class="btn btn-sm btn-error btn-outline">
                        Clear All
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

    async findYouTubeTab() {
        // First, check if active tab is a YouTube video tab
        const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTabs[0] && activeTabs[0].url) {
            const url = activeTabs[0].url;
            // Check if it's a video page (watch, shorts, or embed)
            if (url.includes('youtube.com/watch') || url.includes('youtube.com/shorts') || url.includes('youtube.com/embed')) {
                return activeTabs[0];
            }
        }

        // Otherwise, find any YouTube video tab
        const youtubeTabs = await chrome.tabs.query({ url: "*://*.youtube.com/*" });
        for (const tab of youtubeTabs) {
            if (tab.url && (tab.url.includes('/watch') || tab.url.includes('/shorts') || tab.url.includes('/embed'))) {
                return tab;
            }
        }

        // No video tab found, return any YouTube tab
        if (youtubeTabs.length > 0) {
            return youtubeTabs[0];
        }

        return null;
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

        // Extract video IDs directly in popup context
        const videos = [];
        for (const url of urls) {
            const videoId = this.extractVideoId(url);
            if (videoId) {
                videos.push({
                    videoId: videoId,
                    url: url,
                    title: `Video ${videoId}`,
                    status: 'pending',
                    progress: 0,
                    currentStep: '',
                    options: {},
                    addedAt: Date.now(),
                    startedAt: null,
                    completedAt: null,
                    error: null,
                    result: null,
                    retries: 0,
                    maxRetries: 2
                });
            } else {
                console.warn('[BatchUI] Invalid video URL:', url);
            }
        }

        if (videos.length === 0) {
            this.showAlert('No valid video URLs found', 'error');
            return;
        }

        // Load existing batch state
        const result = await chrome.storage.local.get(['buttercup_batch_processor']);
        const batchState = result.buttercup_batch_processor || {
            queue: [],
            completed: [],
            failed: [],
            stats: {
                totalVideos: 0,
                completedVideos: 0,
                failedVideos: 0,
                totalDuration: 0,
                averageDuration: 0,
                startTime: null,
                endTime: null
            },
            isRunning: false,
            isPaused: false
        };

        // Check for duplicates and add new videos
        let addedCount = 0;
        for (const video of videos) {
            const exists = batchState.queue.some(v => v.videoId === video.videoId) ||
                          batchState.completed.some(v => v.videoId === video.videoId) ||
                          batchState.failed.some(v => v.videoId === video.videoId);

            if (!exists) {
                batchState.queue.push(video);
                addedCount++;
            }
        }

        // Update stats
        batchState.stats.totalVideos = batchState.queue.length + batchState.completed.length + batchState.failed.length;

        // Save back to storage
        await chrome.storage.local.set({ buttercup_batch_processor: batchState });

        if (addedCount > 0) {
            this.showAlert(`Added ${addedCount} video(s) to queue`, 'success');
            textarea.value = '';
            await this.loadBatchState();
        } else {
            this.showAlert('All videos already in queue', 'warning');
        }
    }

    // Extract video ID from URL (copied from batch-processor.js)
    extractVideoId(url) {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]+)/,
            /^([a-zA-Z0-9_-]{10,13})$/ // Direct video ID
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }

        return null;
    }

    async pasteFromClipboard() {
        const textarea = document.getElementById('batch-urls');

        // Focus the textarea
        textarea.focus();

        try {
            // Try navigator.clipboard API
            const text = await navigator.clipboard.readText();
            if (text) {
                // Append to existing content or replace
                if (textarea.value.trim()) {
                    textarea.value += '\n' + text;
                } else {
                    textarea.value = text;
                }
                this.showAlert('Pasted from clipboard', 'success');
            }
        } catch (error) {
            // If clipboard API fails, show instruction
            console.log('[BatchUI] Clipboard API access denied:', error.message);
            this.showAlert('Focused field - now press Ctrl+V (or Cmd+V) to paste', 'info');
        }
    }

    async start() {
        // Load batch state first
        const result = await chrome.storage.local.get(['buttercup_batch_processor']);
        const batchState = result.buttercup_batch_processor;

        if (!batchState || batchState.queue.length === 0) {
            this.showAlert('No videos in queue to process', 'warning');
            return;
        }

        const youtubeTab = await this.findYouTubeTab();
        if (!youtubeTab) {
            this.showAlert('Please open a YouTube video tab to start batch processing', 'warning');
            return;
        }

        // Check if it's a video tab
        const isVideoTab = youtubeTab.url && (
            youtubeTab.url.includes('/watch') ||
            youtubeTab.url.includes('/shorts') ||
            youtubeTab.url.includes('/embed')
        );

        if (!isVideoTab) {
            this.showAlert('Please open a YouTube VIDEO page (not just the homepage) to start batch processing', 'warning');
            return;
        }

        // Set running state in storage first
        batchState.isRunning = true;
        batchState.isPaused = false;
        await chrome.storage.local.set({ buttercup_batch_processor: batchState });

        try {
            // Use message passing instead of executeScript to avoid permission issues
            await chrome.tabs.sendMessage(youtubeTab.id, {
                type: 'BATCH_COMMAND',
                command: 'start'
            });

            this.showAlert('Batch processing started', 'success');
        } catch (error) {
            console.error('[BatchUI] Failed to start batch processing:', error);
            this.showAlert(`Failed to start: ${error.message}. Make sure the YouTube page is fully loaded.`, 'error');
            // Reset running state
            batchState.isRunning = false;
            await chrome.storage.local.set({ buttercup_batch_processor: batchState });
        }

        await this.loadBatchState();
    }

    async togglePause() {
        const youtubeTab = await this.findYouTubeTab();
        if (!youtubeTab) {
            this.showAlert('Please open a YouTube tab first', 'warning');
            return;
        }

        const action = this.isPaused ? 'resume' : 'pause';

        try {
            // Use message passing instead of executeScript
            await chrome.tabs.sendMessage(youtubeTab.id, {
                type: 'BATCH_COMMAND',
                command: action
            });
        } catch (error) {
            console.error('[BatchUI] Failed to toggle pause:', error);
            this.showAlert(`Failed to ${action}: ${error.message}`, 'error');
        }

        await this.loadBatchState();
    }

    async clearAll() {
        if (!confirm('Are you sure you want to clear all videos? This cannot be undone.')) {
            return;
        }

        // Clear directly in storage since we're in popup context
        const emptyState = {
            queue: [],
            completed: [],
            failed: [],
            stats: {
                totalVideos: 0,
                completedVideos: 0,
                failedVideos: 0,
                totalDuration: 0,
                averageDuration: 0,
                startTime: null,
                endTime: null
            },
            isRunning: false,
            isPaused: false
        };

        await chrome.storage.local.set({ buttercup_batch_processor: emptyState });

        // Also notify any YouTube tabs to update their batch processor
        const tabs = await chrome.tabs.query({ url: "*://*.youtube.com/*" });
        for (const tab of tabs) {
            try {
                // Use message passing instead of executeScript
                await chrome.tabs.sendMessage(tab.id, {
                    type: 'BATCH_COMMAND',
                    command: 'reload'
                });
            } catch (err) {
                console.log('[BatchUI] Could not notify tab:', err);
            }
        }

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
                    processing: saved.currentlyProcessing || [],
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
            startBtn.textContent = this.isRunning && !this.isPaused ? 'Running...' : 'Start';
        }

        if (pauseBtn) {
            pauseBtn.disabled = !this.isRunning;
            pauseBtn.textContent = this.isPaused ? 'Resume' : 'Pause';
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
                pending: '[P]',
                processing: '[R]',
                completed: '[C]',
                failed: '[F]'
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
        // Use the progress info area to show alerts
        const progressInfo = document.getElementById('batch-progress-info');
        const progressText = document.getElementById('batch-progress-text');

        if (progressInfo && progressText) {
            progressInfo.classList.remove('hidden', 'alert-info', 'alert-success', 'alert-warning', 'alert-error');
            progressInfo.classList.add(`alert-${type}`);
            progressText.textContent = message;

            // Auto-hide after 3 seconds
            setTimeout(() => {
                if (!this.isRunning) {
                    progressInfo.classList.add('hidden');
                }
            }, 3000);
        } else {
            // Fallback to console
            console.log(`[BatchUI] ${type}: ${message}`);
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
