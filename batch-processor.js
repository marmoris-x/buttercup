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
        this.maxConcurrent = 1; // Process videos one at a time (sequential)
        this.isRunning = false;
        this.isPaused = false;
        this.isInitialized = false;
        this.initPromise = null;
        this.keyPool = null; // Groq API key pool for multi-key support

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
        this.initPromise = this.loadState().then(() => {
            this.isInitialized = true;
        });
    }

    /**
     * Wait for initialization to complete
     */
    async waitForInit() {
        if (!this.isInitialized && this.initPromise) {
            await this.initPromise;
        }
    }

    /**
     * Add videos to the batch queue
     * @param {Array<string>} videoUrls - Array of YouTube video URLs or IDs
     * @param {Object} options - Processing options (same as single transcription)
     */
    async addVideos(videoUrls, options = {}) {
        await this.waitForInit();
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
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]+)/,
            /^([a-zA-Z0-9_-]{10,13})$/ // Direct video ID (10-13 chars)
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }

        return null;
    }

    /**
     * Initialize Groq API key pool with all available keys
     * Uses event-based storage access for MAIN world compatibility
     */
    async initializeKeyPool() {
        try {
            // Use storage bridge to communicate with content script
            const result = await new Promise((resolve, reject) => {
                const requestId = `batch_groq_keys_${Date.now()}`;
                const timeout = 5000;

                const handler = (e) => {
                    if (e.detail.requestId === requestId) {
                        document.removeEventListener('buttercupStorageResponse', handler);
                        if (e.detail.error) {
                            reject(new Error(e.detail.error));
                        } else {
                            resolve(e.detail.data || {});
                        }
                    }
                };

                document.addEventListener('buttercupStorageResponse', handler);

                document.dispatchEvent(new CustomEvent('buttercupStorageRequest', {
                    detail: {
                        action: 'get',
                        key: ['buttercup_groq_keys', 'buttercup_groq_api_key'],
                        storageType: 'sync', // CRITICAL: Use sync storage
                        requestId: requestId
                    }
                }));

                // Timeout after 5 seconds
                setTimeout(() => {
                    document.removeEventListener('buttercupStorageResponse', handler);
                    reject(new Error('Storage request timeout'));
                }, timeout);
            });

            let apiKeys = [];

            // result contains the full object since we requested an array of keys
            // result = {buttercup_groq_keys: [...], buttercup_groq_api_key: '...'}

            // Load from new multi-key format
            if (result.buttercup_groq_keys && result.buttercup_groq_keys.length > 0) {
                apiKeys = result.buttercup_groq_keys;
            }
            // Backward compatibility: single key
            else if (result.buttercup_groq_api_key) {
                apiKeys = [result.buttercup_groq_api_key];
            }

            if (apiKeys.length === 0) {
                throw new Error('No Groq API keys configured. Please add at least one API key in the settings.');
            }

            // Initialize key pool
            if (window.GroqKeyPool) {
                this.keyPool = new window.GroqKeyPool(apiKeys);
                console.log(`[BatchProcessor] ✓ Initialized key pool with ${apiKeys.length} key(s)`);

                if (window.buttercupLogger) {
                    window.buttercupLogger.info('BATCH', `Key pool initialized with ${apiKeys.length} key(s)`);
                }
            } else {
                console.warn('[BatchProcessor] GroqKeyPool not available, using first key only');
                // Fallback to single key if key pool not available
                this.keyPool = null;
            }
        } catch (error) {
            console.error('[BatchProcessor] Error initializing key pool:', error);
            throw error;
        }
    }

    /**
     * Start batch processing
     */
    async start() {
        await this.waitForInit();

        // Remember current in-memory running state before loading from storage
        const wasRunning = this.isRunning;
        const wasActuallyProcessing = this.currentlyProcessing.length > 0;

        // IMPORTANT: Reload state from storage before starting
        // This ensures we have the latest queue from the popup
        await this.loadState();
        console.log('[BatchProcessor] After reloading state, queue length:', this.queue.length);
        console.log('[BatchProcessor] State after reload - isRunning:', this.isRunning, 'currentlyProcessing:', this.currentlyProcessing.length);

        // Check if we're actually processing something (not just a stale flag)
        if (wasActuallyProcessing && this.currentlyProcessing.length > 0) {
            console.warn('[BatchProcessor] Batch processing already running with active videos');
            return;
        }

        // If we were already running before (not a fresh start from UI),
        // and isRunning is true but nothing is being processed, it's a stale state
        if (wasRunning && this.isRunning && this.currentlyProcessing.length === 0 && this.queue.length > 0) {
            console.log('[BatchProcessor] Resetting stale running state from previous session');
            this.isRunning = false;
        }

        if (this.queue.length === 0) {
            console.warn('[BatchProcessor] No videos in queue to process');
            this.isRunning = false;
            await this.saveState();
            return;
        }

        // Initialize key pool for multi-key support
        await this.initializeKeyPool();

        this.isRunning = true;
        this.isPaused = false;
        this.stats.startTime = this.stats.startTime || Date.now();

        console.log('[BatchProcessor] Starting batch processing with', this.queue.length, 'videos');

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
        await this.waitForInit();
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
        await this.waitForInit();
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
        await this.waitForInit();
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
        console.log('[BatchProcessor] processQueue called, isRunning:', this.isRunning, 'isPaused:', this.isPaused);
        console.log('[BatchProcessor] Queue length:', this.queue.length, 'Currently processing:', this.currentlyProcessing.length);

        // Check if we should continue processing
        if (!this.isRunning || this.isPaused) {
            console.log('[BatchProcessor] Not processing - isRunning:', this.isRunning, 'isPaused:', this.isPaused);
            return;
        }

        // Check if we can process more videos
        while (this.currentlyProcessing.length < this.maxConcurrent && this.queue.length > 0) {
            const video = this.queue.shift();
            this.currentlyProcessing.push(video);
            console.log('[BatchProcessor] Starting to process video:', video.videoId);

            // Process video asynchronously
            this.processVideo(video);
        }

        // Check if all done
        if (this.currentlyProcessing.length === 0 && this.queue.length === 0) {
            console.log('[BatchProcessor] All videos processed, stopping');
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

            // Select optimal Groq API key from pool
            let selectedKeyTracker = null;
            if (this.keyPool) {
                video.currentStep = 'Selecting API key...';
                this.notifyUpdate();

                selectedKeyTracker = this.keyPool.getNextAvailable();

                if (!selectedKeyTracker) {
                    const minWaitTime = this.keyPool.getMinWaitTime();
                    const message = minWaitTime > 0
                        ? `All API keys rate limited. Wait ${minWaitTime}s for next available key.`
                        : 'No API keys available with quota. Please add more keys or wait for quota reset.';

                    throw new Error(message);
                }

                console.log(`[BatchProcessor] ✓ Selected Key ${selectedKeyTracker.index + 1} (${selectedKeyTracker.getRemaining()}s quota remaining)`);
                video.selectedKeyIndex = selectedKeyTracker.index;
            }

            // Initialize or wait for API config
            video.currentStep = 'Loading API configuration...';
            this.notifyUpdate();

            // If apiConfig doesn't exist, initialize it
            if (!window.apiConfig && window.APIConfig) {
                // Request API settings and wait for response
                const apiSettings = await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('API settings request timeout'));
                    }, 5000);

                    document.addEventListener('responseButtercupApiSettings', function handler(e) {
                        clearTimeout(timeout);
                        document.removeEventListener('responseButtercupApiSettings', handler);
                        resolve(e.detail);
                    });

                    document.dispatchEvent(new CustomEvent('requestButtercupApiSettings', {}));
                });

                // Initialize API config with received settings
                window.apiConfig = new window.APIConfig();
                window.apiConfig.initFromSettings(apiSettings);
            }

            // Update apiConfig with selected key from pool
            if (selectedKeyTracker && window.apiConfig && window.apiConfig.groqAPI) {
                window.apiConfig.groqAPI.setApiKey(selectedKeyTracker.apiKey);
                console.log(`[BatchProcessor] Updated API config with Key ${selectedKeyTracker.index + 1}`);
            }

            // Wait for API config to have all required keys (with timeout)
            const maxWaitTime = 5000; // 5 seconds
            const startWait = Date.now();

            while ((Date.now() - startWait) < maxWaitTime) {
                if (window.apiConfig && window.apiConfig.hasAllApiKeys && window.apiConfig.hasAllApiKeys()) {
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 200));
            }

            // Final check if API config is available
            if (!window.apiConfig) {
                throw new Error('API configuration not available. Please open a YouTube video page and try again.');
            }

            // Check if we have all required API keys
            if (!window.apiConfig.hasAllApiKeys()) {
                throw new Error('Missing required API keys. Please configure your Groq API key in the API tab of the extension settings.');
            }

            // Use transcription handler if available
            if (!window.transcriptionHandler) {
                throw new Error('Transcription handler not available. Please reload the page.');
            }

            // Process video with correct parameter order:
            // processVideo(videoId, translate, onProgress, onSuccess, onError)
            // IMPORTANT: We pass FALSE for Whisper translation - we want transcription only!
            // LLM translation is handled separately after transcription completes.
            // Whisper translation only translates to English, which is not what we want.
            const useWhisperTranslation = false; // Always use transcription mode
            const translateOption = video.options.translate || false; // This is for LLM translation

            // Pass full URL if available (for non-YouTube platforms), otherwise video ID
            const videoUrlOrId = video.url || video.videoId;

            await new Promise((resolve, reject) => {
                window.transcriptionHandler.processVideo(
                    videoUrlOrId, // Pass URL for multi-platform support
                    useWhisperTranslation, // Use transcription, not Whisper translation
                    // onProgress callback - transcription.js only passes status string as first param
                    (statusText) => {
                        video.currentStep = statusText || 'Processing...';
                        // Map status to approximate progress percentage
                        if (statusText && statusText.includes('Downloading')) {
                            video.progress = 20;
                        } else if (statusText && statusText.includes('Processing')) {
                            video.progress = 40;
                        } else if (statusText && (statusText.includes('Transcribing') || statusText.includes('Translating'))) {
                            video.progress = 60;
                        } else {
                            video.progress = Math.min((video.progress || 0) + 10, 90);
                        }
                        this.notifyUpdate();
                        this.saveState();
                    },
                    // onSuccess callback
                    (youtubeFormat) => {
                        console.log('[BatchProcessor] onSuccess called, youtubeFormat:', youtubeFormat ? 'received' : 'NULL');
                        if (youtubeFormat && youtubeFormat.events) {
                            console.log('[BatchProcessor] Transcript has', youtubeFormat.events.length, 'caption events');
                        }
                        video.result = youtubeFormat;
                        resolve(youtubeFormat);
                    },
                    // onError callback
                    (error) => {
                        reject(error);
                    }
                );
            });

            // Apply LLM translation if enabled and configured
            let finalCaptionData = video.result;
            if (translateOption && video.options.llmApiKey && video.options.llmModel && video.options.targetLanguage) {
                try {
                    console.log('[BatchProcessor] 🌐 Starting LLM translation to:', video.options.targetLanguage);
                    console.log('[BatchProcessor] Translation settings:', {
                        provider: video.options.provider || 'openai',
                        model: video.options.llmModel,
                        targetLanguage: video.options.targetLanguage,
                        hasApiKey: !!video.options.llmApiKey,
                        videoTitle: video.title,
                        eventCount: video.result.events ? video.result.events.length : 0
                    });

                    video.currentStep = `Translating to ${video.options.targetLanguage}...`;
                    video.progress = 80;
                    this.notifyUpdate();
                    this.saveState();

                    if (!window.LLMTranslation) {
                        throw new Error('LLMTranslation class not available. Make sure llm-translation.js is loaded.');
                    }

                    // Create LLM translation instance
                    const translator = new window.LLMTranslation(
                        video.options.provider || 'openai',
                        video.options.llmApiKey,
                        video.options.llmModel
                    );

                    // Build video context for better translation
                    const videoContext = {
                        title: video.title || 'Unknown',
                        duration: video.result.events && video.result.events.length > 0
                            ? `${Math.round(video.result.events[video.result.events.length - 1].tStartMs / 1000)}s`
                            : 'Unknown'
                    };

                    console.log('[BatchProcessor] Video context for translation:', videoContext);

                    // Translate with retry logic for rate limits
                    let translatedEvents = null;
                    let translationRetries = 0;
                    const maxTranslationRetries = 3;

                    while (translationRetries <= maxTranslationRetries) {
                        try {
                            if (translationRetries > 0) {
                                const retryDelay = Math.min(2 ** translationRetries * 1000, 60000); // Exponential backoff, max 60s
                                console.log(`[BatchProcessor] Retry ${translationRetries}/${maxTranslationRetries} - waiting ${retryDelay/1000}s before retry...`);
                                video.currentStep = `Translation retry ${translationRetries}/${maxTranslationRetries} (waiting ${retryDelay/1000}s)...`;
                                this.notifyUpdate();
                                await new Promise(resolve => setTimeout(resolve, retryDelay));
                            }

                            video.currentStep = `Translating to ${video.options.targetLanguage}...`;
                            this.notifyUpdate();

                            // Translate the caption events
                            translatedEvents = await translator.translateCaptions(
                                video.result.events,
                                video.options.targetLanguage,
                                videoContext
                            );

                            // Success - break out of retry loop
                            break;
                        } catch (translateError) {
                            // Check if it's a rate limit error
                            const isRateLimitError = translateError.message && (
                                translateError.message.includes('429') ||
                                translateError.message.includes('rate limit') ||
                                translateError.message.includes('Rate limit') ||
                                translateError.message.includes('quota') ||
                                translateError.status === 429
                            );

                            if (isRateLimitError && translationRetries < maxTranslationRetries) {
                                translationRetries++;
                                console.warn(`[BatchProcessor] Translation rate limit hit, retry ${translationRetries}/${maxTranslationRetries}:`, translateError.message);

                                if (window.buttercupLogger) {
                                    window.buttercupLogger.warn('BATCH', `LLM translation rate limit - retry ${translationRetries}/${maxTranslationRetries}`, {
                                        videoId: video.videoId,
                                        provider: video.options.provider,
                                        error: translateError.message
                                    });
                                }
                            } else {
                                // Not a rate limit error or max retries reached - throw to outer catch
                                throw translateError;
                            }
                        }
                    }

                    // Log sample of translated events for debugging
                    if (translatedEvents && translatedEvents.length > 0) {
                        console.log('[BatchProcessor] Sample translated event:', {
                            original: video.result.events[0].segs.map(s => s.utf8).join(''),
                            translated: translatedEvents[0].segs.map(s => s.utf8).join('')
                        });

                        // Update caption data with translations
                        finalCaptionData = {
                            ...video.result,
                            events: translatedEvents
                        };

                        // Update video.result with translated data
                        video.result = finalCaptionData;

                        console.log('[BatchProcessor] ✓ LLM translation complete for:', video.videoId);
                    } else {
                        console.warn('[BatchProcessor] Translation returned empty results, using original transcript');
                    }
                } catch (translationError) {
                    console.error('[BatchProcessor] ⚠️ LLM translation failed after retries:', translationError);
                    console.log('[BatchProcessor] Continuing with untranslated transcript');
                    // Continue with untranslated transcript

                    if (window.buttercupLogger) {
                        window.buttercupLogger.warn('BATCH', `LLM translation failed for ${video.videoId}`, {
                            error: translationError.message,
                            provider: video.options.provider
                        });
                    }
                }
            } else if (translateOption) {
                console.log('[BatchProcessor] Translation requested but LLM settings incomplete:', {
                    hasApiKey: !!video.options.llmApiKey,
                    hasModel: !!video.options.llmModel,
                    targetLanguage: video.options.targetLanguage
                });
            }

            // IMPORTANT: Save transcript to persistent storage for later use
            // This allows the transcript to be loaded when visiting the video page
            console.log('[BatchProcessor] video.result after transcription:', video.result ? 'exists' : 'NULL');
            if (video.result && window.transcriptStorage) {
                try {
                    console.log('[BatchProcessor] Saving transcript to storage...');
                    // Generate SRT data from captionData for the view/edit modal
                    const srtData = window.transcriptStorage.generateSRT(video.result);
                    console.log('[BatchProcessor] Generated SRT data:', srtData ? `${srtData.length} chars` : 'FAILED');

                    await window.transcriptStorage.saveTranscript(video.videoId, {
                        captionData: video.result,
                        srtData: srtData,  // Include generated SRT data
                        videoTitle: video.title,
                        videoUrl: video.url,  // Original URL for any platform
                        platform: video.platform || 'Video',  // Platform name
                        source: 'batch',  // Mark as batch-processed
                        translationEnabled: translateOption,
                        targetLanguage: video.options.targetLanguage || '',
                        provider: video.options.provider || ''
                    });
                    console.log('[BatchProcessor] ✓ Transcript saved to storage for:', video.videoId);
                } catch (storageError) {
                    console.error('[BatchProcessor] Failed to save transcript to storage:', storageError);
                    // Continue processing even if storage fails
                }
            } else if (!video.result) {
                console.error('[BatchProcessor] ✗ No transcript data to save! video.result is null/undefined');
            } else if (!window.transcriptStorage) {
                console.error('[BatchProcessor] ✗ transcriptStorage not available on window!');
            }

            // Track API usage for key pool (if available)
            if (selectedKeyTracker && video.result) {
                // Try to get audio duration from the transcription result
                // Groq API returns duration in seconds
                let audioDuration = 0;

                // Parse from result if available
                if (video.result.duration) {
                    audioDuration = Math.ceil(video.result.duration);
                } else if (video.result.events && video.result.events.length > 0) {
                    // Estimate from last event timestamp
                    const lastEvent = video.result.events[video.result.events.length - 1];
                    audioDuration = Math.ceil((lastEvent.tStartMs + lastEvent.dDurationMs) / 1000);
                }

                if (audioDuration > 0) {
                    selectedKeyTracker.trackUsage(audioDuration);
                    console.log(`[BatchProcessor] ✓ Tracked ${audioDuration}s usage for Key ${selectedKeyTracker.index + 1}`);
                }
            }

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

            // Check if this is a 429 rate limit error
            const is429Error = error.message && (
                error.message.includes('429') ||
                error.message.includes('Rate limit') ||
                error.message.includes('rate limit') ||
                error.status === 429
            );

            // Handle 429 error with key rotation
            if (is429Error && selectedKeyTracker && this.keyPool) {
                console.log(`[BatchProcessor] 🚫 Rate limit hit on Key ${selectedKeyTracker.index + 1}`);

                // Update key tracker with 429 error details
                selectedKeyTracker.updateFrom429Error(error.message);

                // Try to get alternative key
                const nextKey = this.keyPool.handle429Error(selectedKeyTracker, error.message);

                if (nextKey) {
                    console.log(`[BatchProcessor] 🔄 Auto-switching to Key ${nextKey.index + 1} - retrying video immediately`);

                    // Retry immediately with new key without incrementing retry counter
                    video.status = 'pending';
                    video.currentStep = `Switching to Key ${nextKey.index + 1}...`;
                    video.error = null;

                    // Move back to queue for immediate retry
                    this.currentlyProcessing = this.currentlyProcessing.filter(v => v.videoId !== video.videoId);
                    this.queue.unshift(video); // Add to front for immediate retry

                    if (window.buttercupLogger) {
                        window.buttercupLogger.info('BATCH', `Auto-rotated to Key ${nextKey.index + 1} for video: ${video.videoId}`);
                    }

                    await this.saveState();
                    this.notifyUpdate();

                    // Continue processing queue immediately
                    setTimeout(() => this.processQueue(), 500);
                    return; // Exit early to avoid normal retry logic
                } else {
                    // All keys are rate limited - wait for next available
                    const minWaitTime = this.keyPool.getMinWaitTime();
                    const waitMessage = `All ${this.keyPool.keys.length} API keys rate limited. Retry in ${minWaitTime}s.`;

                    console.log(`[BatchProcessor] ⏸️ ${waitMessage}`);
                    video.error = waitMessage;
                    video.currentStep = `Waiting ${minWaitTime}s...`;

                    if (window.buttercupLogger) {
                        window.buttercupLogger.warn('BATCH', waitMessage);
                    }

                    // Don't increment retries for rate limit - just wait and retry
                    video.status = 'pending';

                    // Move back to queue
                    this.currentlyProcessing = this.currentlyProcessing.filter(v => v.videoId !== video.videoId);
                    this.queue.unshift(video);

                    await this.saveState();
                    this.notifyUpdate();

                    // Wait for the specified time before continuing
                    setTimeout(() => this.processQueue(), minWaitTime * 1000);
                    return; // Exit early
                }
            }

            // Handle regular retry (non-429 errors or 429 without key pool)
            if (video.retries < video.maxRetries) {
                video.retries++;
                video.status = 'pending';
                video.currentStep = `Retry ${video.retries}/${video.maxRetries}`;
                video.error = error.message;

                // Move back to queue
                this.currentlyProcessing = this.currentlyProcessing.filter(v => v.videoId !== video.videoId);
                this.queue.unshift(video); // Add to front for retry

                if (window.buttercupLogger) {
                    window.buttercupLogger.warn('BATCH', `Retrying video: ${video.videoId} (attempt ${video.retries}) - ${error.message}`, {
                        videoId: video.videoId,
                        error: error.message,
                        retries: video.retries,
                        maxRetries: video.maxRetries
                    });
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
                    window.buttercupLogger.error('BATCH', `Video processing failed: ${video.videoId} - ${error.message}`, {
                        videoId: video.videoId,
                        error: error.message,
                        stack: error.stack
                    });
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
            console.log('[BatchProcessor] Fetching video info for:', videoId);

            // Try to fetch from YouTube's oEmbed API (no API key needed)
            const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
            console.log('[BatchProcessor] oEmbed URL:', oembedUrl);

            const response = await fetch(oembedUrl);
            console.log('[BatchProcessor] oEmbed response status:', response.status);

            if (response.ok) {
                const data = await response.json();
                console.log('[BatchProcessor] ✓ Video info fetched:', {
                    title: data.title,
                    author: data.author_name
                });
                return {
                    title: data.title,
                    author: data.author_name,
                    thumbnail: data.thumbnail_url
                };
            } else {
                console.warn('[BatchProcessor] oEmbed request failed with status:', response.status);
            }
        } catch (error) {
            console.error('[BatchProcessor] Could not fetch video info:', error);
        }

        console.warn('[BatchProcessor] Using fallback title for:', videoId);
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
        await this.waitForInit();
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
            const data = {
                queue: this.queue,
                currentlyProcessing: this.currentlyProcessing,
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
            };

            // Use storage bridge to communicate with content script
            return new Promise((resolve) => {
                const requestId = `batch_save_${Date.now()}`;

                const handler = (e) => {
                    if (e.detail.requestId === requestId) {
                        document.removeEventListener('buttercupStorageResponse', handler);
                        resolve();
                    }
                };

                document.addEventListener('buttercupStorageResponse', handler);

                document.dispatchEvent(new CustomEvent('buttercupStorageRequest', {
                    detail: {
                        action: 'set',
                        key: 'buttercup_batch_processor',
                        data: data,
                        requestId: requestId
                    }
                }));

                // Timeout after 5 seconds
                setTimeout(() => {
                    document.removeEventListener('buttercupStorageResponse', handler);
                    resolve();
                }, 5000);
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
            // Use storage bridge to communicate with content script
            return new Promise((resolve) => {
                const requestId = `batch_load_${Date.now()}`;

                const handler = (e) => {
                    if (e.detail.requestId === requestId) {
                        document.removeEventListener('buttercupStorageResponse', handler);

                        const saved = e.detail.data;

                        if (saved && Object.keys(saved).length > 0) {
                            this.queue = saved.queue || [];
                            this.currentlyProcessing = saved.currentlyProcessing || [];
                            this.completed = saved.completed || [];
                            this.failed = saved.failed || [];
                            this.stats = saved.stats || this.stats;
                            this.isRunning = saved.isRunning || false;
                            this.isPaused = saved.isPaused || false;

                            console.log('[BatchProcessor] Loaded saved state:', {
                                queue: this.queue.length,
                                processing: this.currentlyProcessing.length,
                                completed: this.completed.length,
                                failed: this.failed.length
                            });
                        }

                        resolve();
                    }
                };

                document.addEventListener('buttercupStorageResponse', handler);

                document.dispatchEvent(new CustomEvent('buttercupStorageRequest', {
                    detail: {
                        action: 'get',
                        key: 'buttercup_batch_processor',
                        requestId: requestId
                    }
                }));

                // Timeout after 5 seconds
                setTimeout(() => {
                    document.removeEventListener('buttercupStorageResponse', handler);
                    resolve();
                }, 5000);
            });
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
    console.log('[Buttercup] Batch processor initialized');

    // Listen for commands from content script (which receives them from popup)
    document.addEventListener('buttercupBatchCommand', async (e) => {
        if (!e.detail || !e.detail.command) return;

        const command = e.detail.command;
        console.log('[BatchProcessor] Received command:', command);

        try {
            switch (command) {
                case 'start':
                    await window.batchProcessor.start();
                    break;
                case 'pause':
                    await window.batchProcessor.pause();
                    break;
                case 'resume':
                    await window.batchProcessor.resume();
                    break;
                case 'stop':
                    await window.batchProcessor.stop();
                    break;
                case 'reload':
                    await window.batchProcessor.loadState();
                    break;
                default:
                    console.warn('[BatchProcessor] Unknown command:', command);
            }
        } catch (error) {
            console.error('[BatchProcessor] Error executing command:', command, error);
        }
    });
}

