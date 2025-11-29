/**
 * Transcription handler for Buttercup
 * Manages the process of downloading audio and transcribing it
 */

class TranscriptionHandler {
    constructor(apiConfig) {
        this.apiConfig = apiConfig;
        this.cobaltAPI = new CobaltAPI();
        this.groqAPI = apiConfig.getGroqAPI();
        this.isProcessing = false;
        this.lastVideoId = null;
        this.lastTranslate = false;
    }

    /**
     * Check if the handler is currently processing a transcription
     * @returns {boolean} True if processing, false otherwise
     */
    isCurrentlyProcessing() {
        return this.isProcessing;
    }

    /**
     * Check if the handler has all required API keys
     * @returns {boolean} True if all required API keys are set, false otherwise
     */
    hasRequiredApiKeys() {
        return this.apiConfig.hasAllApiKeys();
    }

    /**
     * Check if the current request is a duplicate of the last one
     * @param {string} videoId - The YouTube video ID
     * @param {boolean} translate - Whether to translate the subtitles
     * @returns {boolean} True if duplicate, false otherwise
     */
    isDuplicateRequest(videoId, translate) {
        return this.lastVideoId === videoId && this.lastTranslate === translate;
    }

    /**
     * Set the last request details
     * @param {string} videoId - The YouTube video ID
     * @param {boolean} translate - Whether to translate the subtitles
     */
    setLastRequest(videoId, translate) {
        this.lastVideoId = videoId;
        this.lastTranslate = translate;
    }

    /**
     * Process a video for transcription
     * @param {string} videoIdOrUrl - Video ID or full URL (supports YouTube, Vimeo, etc.)
     * @param {boolean} translate - Whether to translate the subtitles
     * @param {function} onProgress - Callback for progress updates
     * @param {function} onSuccess - Callback for successful transcription
     * @param {function} onError - Callback for errors
     */
    async processVideo(videoIdOrUrl, translate, onProgress, onSuccess, onError) {
        if (this.isProcessing) {
            onError(new Error('Already processing a video'));
            return;
        }

        if (!this.hasRequiredApiKeys()) {
            const errorMsg = 'Groq API key not set. Please set up the Groq API key in the extension settings.';
            onError(new Error(errorMsg));
            return;
        }

        // Determine if input is URL or video ID
        const isUrl = videoIdOrUrl.startsWith('http');
        const videoId = isUrl ? this.extractVideoIdFromUrl(videoIdOrUrl) : videoIdOrUrl;

        // Check for duplicate only if currently processing or recently succeeded
        if (this.isProcessing && this.isDuplicateRequest(videoId, translate)) {
            onError(new Error('This video is already being processed.'));
            return;
        }

        // Check if translation is requested but not supported by the model
        if (translate && !this.apiConfig.supportsTranslation()) {
            onError(new Error(`The selected model (${this.apiConfig.getGroqModel()}) does not support translation. Please select whisper-large-v3 for translation.`));
            return;
        }

        this.isProcessing = true;

        try {
            // Construct full video URL if needed
            const videoUrl = isUrl ? videoIdOrUrl : `https://www.youtube.com/watch?v=${videoIdOrUrl}`;
            console.info('[Buttercup] Processing video:', videoUrl);

            // Prepare transcription options
            const language = this.apiConfig.getLanguage();
            const options = {
                apiKey: this.apiConfig.getGroqApiKey(),
                model: this.apiConfig.getGroqModel(),
                language: language,
                temperature: this.apiConfig.getTemperature(),
                responseFormat: this.apiConfig.getResponseFormat(),
                wordTimestamps: this.apiConfig.getUseWordTimestamps(),
                translate: translate  // Pass translate parameter to server
            };

            // Add prompt if available
            const prompt = this.apiConfig.getPrompt();
            if (prompt && prompt.trim() !== '') {
                options.prompt = prompt;
                console.info('[Buttercup] Using prompt:', prompt.substring(0, 50) + '...');
            }

            console.info('[Buttercup] Using server-side transcription with chunking support');
            console.info('[Buttercup] Options:', {
                model: options.model,
                language: options.language,
                wordTimestamps: options.wordTimestamps
            });

            // Use server-side transcription with automatic chunking
            // This handles: download → M4A conversion → chunking (if needed) → transcription → merge
            const youtubeFormat = await this.cobaltAPI.transcribeVideo(
                videoUrl,
                options,
                (progressMessage) => {
                    console.info(`[Buttercup] ${progressMessage}`);
                    onProgress(progressMessage);
                }
            );

            console.info('[Buttercup] Server-side transcription completed');
            console.info('[Buttercup] Result events:', youtubeFormat.events ? youtubeFormat.events.length : 0);

            // Validate result
            if (!youtubeFormat || !youtubeFormat.events || youtubeFormat.events.length === 0) {
                throw new Error('Transcription returned no subtitle events');
            }

            // Mark as successfully processed (to prevent duplicate processing)
            this.setLastRequest(videoId, translate);

            // Notify success
            onSuccess(youtubeFormat);
        } catch (error) {
            console.error('[Buttercup] Transcription error:', error);
            // Clear last request on error to allow retry
            this.lastVideoId = null;
            this.lastTranslate = false;
            onError(error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Sanitize filename by removing special characters and limiting length
     * @param {string} filename - The original filename
     * @returns {string} - Sanitized filename
     */
    sanitizeFilename(filename) {
        // Remove file extension if present
        let name = filename.replace(/\.srt$/i, '');

        // ONLY remove truly dangerous filesystem characters that Windows cannot handle
        // Remove: / \ : * ? " < >
        // Keep EVERYTHING else including | and all Unicode characters
        name = name.replace(/[\/\\:*?"<>]/g, '');

        // Replace multiple spaces with single space
        name = name.replace(/\s+/g, ' ');

        // Trim whitespace
        name = name.trim();

        // Limit to 200 characters (increased to accommodate longer titles)
        if (name.length > 200) {
            name = name.substring(0, 200).trim();
        }

        // If name is empty after sanitization, use default
        if (!name || name === '') {
            name = 'buttercup_subtitles';
        }

        return name + '.srt';
    }

    /**
     * Extract video ID from URL (supports multiple platforms)
     * @param {string} url - Video URL
     * @returns {string} - Video ID or hash of URL
     */
    extractVideoIdFromUrl(url) {
        // YouTube
        const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]+)/);
        if (youtubeMatch) return youtubeMatch[1];

        // Vimeo
        const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
        if (vimeoMatch) return vimeoMatch[1];

        // Dailymotion
        const dailymotionMatch = url.match(/(?:dailymotion\.com\/video\/|dai\.ly\/)([a-zA-Z0-9]+)/);
        if (dailymotionMatch) return dailymotionMatch[1];

        // Twitter/X
        const twitterMatch = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
        if (twitterMatch) return twitterMatch[1];

        // TikTok
        const tiktokMatch = url.match(/tiktok\.com\/@[\w.-]+\/video\/(\d+)/);
        if (tiktokMatch) return tiktokMatch[1];

        // Instagram
        const instagramMatch = url.match(/instagram\.com\/(?:p|reels?|tv)\/([a-zA-Z0-9_-]+)/);
        if (instagramMatch) return instagramMatch[1];

        // Fallback: generate hash from URL
        let hash = 0;
        for (let i = 0; i < url.length; i++) {
            hash = ((hash << 5) - hash) + url.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Generate SRT file from YouTube format subtitles
     * @param {Object} youtubeFormat - YouTube format subtitles
     * @param {string} filename - Filename for the SRT file
     */
    generateSRT(youtubeFormat, filename) {
        try {
            const sanitizedFilename = this.sanitizeFilename(filename);
            const srtContent = this.groqAPI.convertToSRT(youtubeFormat);

            const blob = new Blob([srtContent], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = sanitizedFilename;
            a.click();
            URL.revokeObjectURL(url);

            console.info('[Buttercup] SRT file downloaded as:', sanitizedFilename);
            return true;
        } catch (error) {
            console.error('[Buttercup] Error generating SRT:', error);
            return false;
        }
    }
}

// Export the class
window.TranscriptionHandler = TranscriptionHandler;