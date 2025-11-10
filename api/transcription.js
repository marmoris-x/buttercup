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
     * @param {string} videoId - The YouTube video ID
     * @param {boolean} translate - Whether to translate the subtitles
     * @param {function} onProgress - Callback for progress updates
     * @param {function} onSuccess - Callback for successful transcription
     * @param {function} onError - Callback for errors
     */
    async processVideo(videoId, translate, onProgress, onSuccess, onError) {
        if (this.isProcessing) {
            onError(new Error('Already processing a video'));
            return;
        }

        if (!this.hasRequiredApiKeys()) {
            const errorMsg = 'Groq API key not set. Please set up the Groq API key in the extension settings.';
            onError(new Error(errorMsg));
            return;
        }

        if (this.isDuplicateRequest(videoId, translate)) {
            onError(new Error('This video has already been processed with the same settings.'));
            return;
        }

        // Check if translation is requested but not supported by the model
        if (translate && !this.apiConfig.supportsTranslation()) {
            onError(new Error(`The selected model (${this.apiConfig.getGroqModel()}) does not support translation. Please select whisper-large-v3 for translation.`));
            return;
        }

        this.isProcessing = true;
        this.setLastRequest(videoId, translate);

        try {
            // Step 1: Notify progress - Starting download
            onProgress('Downloading audio...');

            // Step 2: Download audio using the local yt-dlp server
            const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
            console.info('[Buttercup] Downloading audio from:', videoUrl);
            const audioResult = await this.cobaltAPI.downloadAudio(videoUrl);

            if (!audioResult || !audioResult.url) {
                throw new Error('Failed to download audio');
            }

            console.info('[Buttercup] Audio download complete, processing blob...');

            // Step 3: The audio file is now a blob URL from the local server.
            onProgress('Processing audio file...');
            const response = await fetch(audioResult.url);
            const audioBlob = await response.blob();

            // Validate audio blob
            if (!audioBlob || audioBlob.size === 0) {
                throw new Error('Downloaded audio file is empty or invalid');
            }

            console.info('[Buttercup] Audio blob created:', {
                size: `${(audioBlob.size / 1024 / 1024).toFixed(2)} MB`,
                type: audioBlob.type || 'unknown',
                sizeBytes: audioBlob.size
            });

            URL.revokeObjectURL(audioResult.url); // Clean up the blob URL

            // Step 4: Notify progress - Starting transcription
            onProgress(translate ? 'Translating audio...' : 'Transcribing audio...');

            // Step 5: Transcribe or translate using Groq API with the downloaded file
            // Prepare options for transcription/translation
            const language = this.apiConfig.getLanguage();
            const options = {
                wordTimestamps: this.apiConfig.getUseWordTimestamps(),
                language: language,
                temperature: this.apiConfig.getTemperature(),
                responseFormat: this.apiConfig.getResponseFormat()
            };

            console.info('[Buttercup] Transcription options:', options);

            // Add prompt if available
            const prompt = this.apiConfig.getPrompt();
            if (prompt && prompt.trim() !== '') {
                options.prompt = prompt;
                console.info('[Buttercup] Using prompt:', prompt.substring(0, 50) + '...');
            }

            let transcriptionResult;
            if (translate) {
                console.info('[Buttercup] Using translation mode');
                transcriptionResult = await this.groqAPI.translate(audioBlob, options);
            } else {
                console.info('[Buttercup] Using transcription mode with language:', language);
                transcriptionResult = await this.groqAPI.transcribe(audioBlob, options);
            }

            console.info('[Buttercup] Transcription completed, text:', transcriptionResult.text ? transcriptionResult.text.substring(0, 100) + '...' : 'N/A');

            // Step 6: Convert to YouTube format with word-level timestamps if enabled
            const formatOptions = {
                useWordTimestamps: this.apiConfig.getUseWordTimestamps(),
                wordsPerLine: this.apiConfig.getWordsPerLine(),
                maxLineLength: this.apiConfig.getMaxLineLength()
            };
            
            const youtubeFormat = this.groqAPI.convertToYouTubeFormat(transcriptionResult, formatOptions);
            
            // Step 7: Notify success
            onSuccess(youtubeFormat);
        } catch (error) {
            console.error('[Buttercup] Transcription error:', error);
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