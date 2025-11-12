/**
 * Buttercup Batch Processor
 *
 * Process multiple YouTube videos in batch with intelligent queuing,
 * progress tracking, and error handling.
 *
 * Features:
 * - Queue management for multiple videos
 * - Sequential or parallel processing with rate limiting
 * - Per-video progress tracking
 * - Automatic retry on failures
 * - Persistent state across sessions
 * - Export all transcripts as ZIP
 * - Statistics and monitoring
 */

class BatchProcessor {
    constructor() {
        this.queue = [];
        this.currentlyProcessing = [];
        this.completed = [];
        this.failed = [];
        this.maxConcurrent = 2; // Process 2 videos at a time
        this.isRunning = false;
        this.isPaused = false;

        // Statistics
        this.stats = {
            totalVideos: 0,
            completedVideos: 0,
            failedVideos: 0,
            totalDuration: 0,
            averageDuration: 0,
            startTime: null,
            endTime: null
        };

        // Load saved state
        this.loadState();
    }

    /**
     * Add videos to the batch queue
     * @param {Array<string>} videoUrls - Array of YouTube video URLs or IDs
     * @param {Object} options - Processing options (same as single transcription)
     */
    async addVideos(videoUrls, options = {}) {
        const added = [];

        for (const url of videoUrls) {
            try {
                const videoId = this.extractVideoId(url);
                if (!videoId) {
                    console.warn('[BatchProcessor] Invalid video URL:', url);
                    continue;
                }

                // Check if video already in queue or completed
                const exists = this.queue.some(v => v.videoId === videoId) ||
                              this.completed.some(v => v.videoId === videoId) ||
                              this.currentlyProcessing.some(v => v.videoId === videoId);

                if (exists) {
                    console.warn('[BatchProcessor] Video already in batch:', videoId);
                    continue;
                }

                const video = {
                    videoId: videoId,
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    title: `Video ${videoId}`,
                    status: 'pending', // pending, processing, completed, failed
                    progress: 0,
                    currentStep: '',
                    options: options,
                    addedAt: Date.now(),
                    startedAt: null,
                    completedAt: null,
                    error: null,
                    result: null,
                    retries: 0,
                    maxRetries: 2
                };

                this.queue.push(video);
                added.push(video);

                if (window.buttercupLogger) {
                    window.buttercupLogger.info('BATCH', `Added video to queue: ${videoId}`);
                }
            } catch (error) {
                console.error('[BatchProcessor] Error adding video:', error);
            }
        }

        this.stats.totalVideos = this.queue.length + this.completed.length + this.failed.length;
        await this.saveState();
        this.notifyUpdate();

        return added;
    }

    /**
     * Extract video ID from YouTube URL
     */
    extractVideoId(url) {
        // Handle different YouTube URL formats
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
            /^([a-zA-Z0-9_-]{11})$/ // Direct video ID
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                return match[1];
            }
        }

        return null;
    }

    /**
     * Start batch processing
     */
    async start() {
        if (this.isRunning && !this.isPaused) {
            console.warn('[BatchProcessor] Batch processing already running');
            return;
        }

        this.isRunning = true;
        this.isPaused = false;
        this.stats.startTime = this.stats.startTime || Date.now();

        if (window.buttercupLogger) {
            window.buttercupLogger.info('BATCH', `Starting batch processing (${this.queue.length} videos queued)`);
        }

        await this.saveState();
        this.processQueue();
    }

    /**
     * Pause batch processing
     */
    async pause() {
        this.isPaused = true;

        if (window.buttercupLogger) {
            window.buttercupLogger.info('BATCH', 'Batch processing paused');
        }

        await this.saveState();
        this.notifyUpdate();
    }

    /**
     * Resume batch processing
     */
    async resume() {
        if (!this.isRunning) {
            await this.start();
        } else {
            this.isPaused = false;

            if (window.buttercupLogger) {
                window.buttercupLogger.info('BATCH', 'Batch processing resumed');
            }

            await this.saveState();
            this.processQueue();
        }
    }

    /**
     * Stop batch processing
     */
    async stop() {
        this.isRunning = false;
        this.isPaused = false;
        this.stats.endTime = Date.now();

        if (window.buttercupLogger) {
            window.buttercupLogger.info('BATCH', 'Batch processing stopped', this.getStats());
        }

        await this.saveState();
        this.notifyUpdate();
    }

    /**
     * Process the queue
     */
    async processQueue() {
        // Check if we should continue processing
        if (!this.isRunning || this.isPaused) {
            return;
        }

        // Check if we can process more videos
        while (this.currentlyProcessing.length < this.maxConcurrent && this.queue.length > 0) {
            const video = this.queue.shift();
            this.currentlyProcessing.push(video);

            // Process video asynchronously
            this.processVideo(video);
        }

        // Check if all done
        if (this.currentlyProcessing.length === 0 && this.queue.length === 0) {
            await this.stop();
            this.notifyComplete();
        }
    }

    /**
     * Process a single video
     */
    async processVideo(video) {
        video.status = 'processing';
        video.startedAt = Date.now();
        video.progress = 0;
        video.currentStep = 'Initializing...';

        this.notifyUpdate();

        if (window.buttercupLogger) {
            window.buttercupLogger.startPerformanceTracking(
                `batch-${video.videoId}`,
                `Batch process: ${video.videoId}`,
                'BATCH'
            );
        }

        try {
            // Fetch video info first
            video.currentStep = 'Fetching video info...';
            this.notifyUpdate();

            const videoInfo = await this.fetchVideoInfo(video.videoId);
            video.title = videoInfo.title || video.videoId;

            // Check if API config is available
            if (!window.apiConfig) {
                throw new Error('API configuration not available');
            }

            // Check if we have all required API keys
            if (!window.apiConfig.hasAllApiKeys()) {
                throw new Error('Missing required API keys');
            }

            // Use transcription handler if available
            if (!window.transcriptionHandler) {
                throw new Error('Transcription handler not available');
            }

            // Process video with progress callback
            const result = await window.transcriptionHandler.processVideo(
                video.videoId,
                {
                    ...video.options,
                    onProgress: (progress, status) => {
                        video.progress = progress;
                        video.currentStep = status;
                        this.notifyUpdate();
                    }
                },
                (youtubeFormat) => {
                    // Success callback
                    video.result = youtubeFormat;
                },
                (error) => {
                    // Error callback
                    throw error;
                }
            );

            // Mark as completed
            video.status = 'completed';
            video.progress = 100;
            video.currentStep = 'Completed';
            video.completedAt = Date.now();

            // Move to completed
            this.currentlyProcessing = this.currentlyProcessing.filter(v => v.videoId !== video.videoId);
            this.completed.push(video);
            this.stats.completedVideos++;

            // Update stats
            const duration = video.completedAt - video.startedAt;
            this.stats.totalDuration += duration;
            this.stats.averageDuration = this.stats.totalDuration / this.stats.completedVideos;

            if (window.buttercupLogger) {
                window.buttercupLogger.endPerformanceTracking(`batch-${video.videoId}`, {
                    videoId: video.videoId,
                    title: video.title,
                    status: 'completed'
                });
            }

        } catch (error) {
            console.error('[BatchProcessor] Error processing video:', video.videoId, error);

            // Handle retry
            if (video.retries < video.maxRetries) {
                video.retries++;
                video.status = 'pending';
                video.currentStep = `Retry ${video.retries}/${video.maxRetries}`;
                video.error = error.message;

                // Move back to queue
                this.currentlyProcessing = this.currentlyProcessing.filter(v => v.videoId !== video.videoId);
                this.queue.unshift(video); // Add to front for retry

                if (window.buttercupLogger) {
                    window.buttercupLogger.warn('BATCH', `Retrying video: ${video.videoId} (attempt ${video.retries})`, { error: error.message });
                }
            } else {
                // Mark as failed
                video.status = 'failed';
                video.error = error.message;
                video.completedAt = Date.now();

                this.currentlyProcessing = this.currentlyProcessing.filter(v => v.videoId !== video.videoId);
                this.failed.push(video);
                this.stats.failedVideos++;

                if (window.buttercupLogger) {
                    window.buttercupLogger.error('BATCH', `Video processing failed: ${video.videoId}`, { error: error.message });
                }
            }
        }

        await this.saveState();
        this.notifyUpdate();

        // Continue processing queue
        setTimeout(() => this.processQueue(), 1000); // Small delay between videos
    }

    /**
     * Fetch video info from YouTube
     */
    async fetchVideoInfo(videoId) {
        try {
            // Try to fetch from YouTube's oEmbed API (no API key needed)
            const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);

            if (response.ok) {
                const data = await response.json();
                return {
                    title: data.title,
                    author: data.author_name,
                    thumbnail: data.thumbnail_url
                };
            }
        } catch (error) {
            console.warn('[BatchProcessor] Could not fetch video info:', error);
        }

        return {
            title: `Video ${videoId}`,
            author: 'Unknown',
            thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
        };
    }

    /**
     * Remove video from queue
     */
    async removeVideo(videoId) {
        this.queue = this.queue.filter(v => v.videoId !== videoId);
        this.completed = this.completed.filter(v => v.videoId !== videoId);
        this.failed = this.failed.filter(v => v.videoId !== videoId);

        this.stats.totalVideos = this.queue.length + this.completed.length + this.failed.length;

        await this.saveState();
        this.notifyUpdate();
    }

    /**
     * Clear all videos
     */
    async clearAll() {
        this.queue = [];
        this.currentlyProcessing = [];
        this.completed = [];
        this.failed = [];

        this.stats = {
            totalVideos: 0,
            completedVideos: 0,
            failedVideos: 0,
            totalDuration: 0,
            averageDuration: 0,
            startTime: null,
            endTime: null
        };

        await this.saveState();
        this.notifyUpdate();
    }

    /**
     * Get current statistics
     */
    getStats() {
        const totalProcessed = this.stats.completedVideos + this.stats.failedVideos;
        const successRate = totalProcessed > 0 ? (this.stats.completedVideos / totalProcessed) * 100 : 0;

        return {
            ...this.stats,
            pending: this.queue.length,
            processing: this.currentlyProcessing.length,
            successRate: successRate.toFixed(1),
            averageDurationFormatted: this.formatDuration(this.stats.averageDuration)
        };
    }

    /**
     * Get all videos (queue + processing + completed + failed)
     */
    getAllVideos() {
        return {
            pending: this.queue,
            processing: this.currentlyProcessing,
            completed: this.completed,
            failed: this.failed
        };
    }

    /**
     * Format duration in human-readable form
     */
    formatDuration(ms) {
        if (ms < 1000) {
            return `${Math.round(ms)}ms`;
        } else if (ms < 60000) {
            return `${(ms / 1000).toFixed(1)}s`;
        } else {
            const minutes = Math.floor(ms / 60000);
            const seconds = Math.floor((ms % 60000) / 1000);
            return `${minutes}m ${seconds}s`;
        }
    }

    /**
     * Save state to storage
     */
    async saveState() {
        try {
            await chrome.storage.local.set({
                buttercup_batch_processor: {
                    queue: this.queue,
                    completed: this.completed.map(v => ({
                        videoId: v.videoId,
                        title: v.title,
                        completedAt: v.completedAt
                    })),
                    failed: this.failed.map(v => ({
                        videoId: v.videoId,
                        title: v.title,
                        error: v.error,
                        completedAt: v.completedAt
                    })),
                    stats: this.stats,
                    isRunning: this.isRunning,
                    isPaused: this.isPaused
                }
            });
        } catch (error) {
            console.error('[BatchProcessor] Failed to save state:', error);
        }
    }

    /**
     * Load state from storage
     */
    async loadState() {
        try {
            const result = await chrome.storage.local.get(['buttercup_batch_processor']);
            const saved = result.buttercup_batch_processor;

            if (saved) {
                this.queue = saved.queue || [];
                this.completed = saved.completed || [];
                this.failed = saved.failed || [];
                this.stats = saved.stats || this.stats;
                this.isRunning = saved.isRunning || false;
                this.isPaused = saved.isPaused || false;

                console.log('[BatchProcessor] Loaded saved state:', {
                    queue: this.queue.length,
                    completed: this.completed.length,
                    failed: this.failed.length
                });
            }
        } catch (error) {
            console.error('[BatchProcessor] Failed to load state:', error);
        }
    }

    /**
     * Notify UI of updates
     */
    notifyUpdate() {
        if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('buttercupBatchUpdate', {
                detail: {
                    videos: this.getAllVideos(),
                    stats: this.getStats(),
                    isRunning: this.isRunning,
                    isPaused: this.isPaused
                }
            }));
        }
    }

    /**
     * Notify completion
     */
    notifyComplete() {
        if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('buttercupBatchComplete', {
                detail: {
                    stats: this.getStats()
                }
            }));
        }

        // Show browser notification if permitted
        if (typeof chrome !== 'undefined' && chrome.notifications) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon128.png',
                title: 'Batch Processing Complete',
                message: `Processed ${this.stats.completedVideos} videos successfully. ${this.stats.failedVideos} failed.`
            });
        }
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.BatchProcessor = BatchProcessor;
    window.batchProcessor = new BatchProcessor();
    console.log('[Buttercup] 🔄 Batch processor initialized');
}
