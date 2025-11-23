/**
 * Groq API handler for Buttercup
 * Handles transcription and translation of audio files using Groq API
 *
 * Features:
 * - Transcription (audio to text in original language)
 * - Translation (audio to English text)
 * - Word-level and segment-level timestamps
 * - Quality validation using metadata (avg_logprob, no_speech_prob, compression_ratio) - ENABLED BY DEFAULT
 * - Support for multiple Whisper models
 */

class GroqAPI {
    constructor(apiKey = null) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.groq.com/openai/v1/audio';
        this.model = 'whisper-large-v3'; // Default model

        // Quality validation thresholds (based on Groq API documentation)
        this.qualityThresholds = {
            avgLogProbThreshold: -0.5,      // Values below this indicate low confidence
            noSpeechProbThreshold: 0.6,     // Values above this indicate likely non-speech
            compressionRatioMin: 1.0,       // Healthy range: 1.5-2.5
            compressionRatioMax: 3.0,       // Healthy range: 1.5-2.5
            lowConfidencePercent: 0.2,      // Warn if > 20% segments have low confidence
            highNoSpeechPercent: 0.1,       // Warn if > 10% segments are likely non-speech
            unusualCompressionPercent: 0.15 // Warn if > 15% segments have unusual compression
        };
    }

    /**
     * Retry a function with exponential backoff
     * @param {Function} fn - The function to retry
     * @param {number} maxRetries - Maximum number of retries (default: 3)
     * @param {number} baseDelay - Base delay in milliseconds (default: 1000)
     * @returns {Promise} - The result of the function
     */
    async retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
        let lastError;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;

                // Don't retry on certain errors
                if (this.shouldNotRetry(error)) {
                    console.warn(`[Buttercup] Error is not retryable: ${error.message}`);
                    throw error;
                }

                // If this was the last attempt, throw the error
                if (attempt === maxRetries) {
                    console.error(`[Buttercup] Max retries (${maxRetries}) reached. Giving up.`);
                    throw error;
                }

                // Calculate delay with exponential backoff
                const delay = baseDelay * Math.pow(2, attempt);
                console.warn(`[Buttercup] Attempt ${attempt + 1} failed. Retrying in ${delay}ms... Error: ${error.message}`);

                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError;
    }

    /**
     * Check if an error should not be retried
     * @param {Error} error - The error to check
     * @returns {boolean} - True if the error should not be retried
     */
    shouldNotRetry(error) {
        const message = error.message.toLowerCase();

        // Don't retry on authentication errors
        if (message.includes('401') || message.includes('unauthorized') || message.includes('invalid api key')) {
            return true;
        }

        // Don't retry on invalid request errors (400, 422)
        if (message.includes('400') || message.includes('422') || message.includes('invalid')) {
            return true;
        }

        // Don't retry on file errors
        if (message.includes('file is empty') || message.includes('invalid audio file')) {
            return true;
        }

        return false;
    }

    /**
     * Parse API error and provide user-friendly message
     * @param {Response} response - The fetch response
     * @param {string} errorText - The error text from the response
     * @returns {Error} - A formatted error with helpful message
     */
    parseApiError(response, errorText) {
        const status = response.status;
        let message = '';
        let suggestion = '';

        // Try to parse JSON error
        try {
            const errorData = JSON.parse(errorText);
            if (errorData.error && errorData.error.message) {
                message = errorData.error.message;
            }
        } catch (e) {
            // Not JSON, use raw text
            message = errorText;
        }

        // Provide specific messages based on status code
        switch (status) {
            case 400:
                suggestion = 'Check your request parameters. The audio file might be corrupted or in an unsupported format.';
                break;
            case 401:
                suggestion = 'Your API key is invalid or expired. Please check your Groq API key in the extension settings.';
                break;
            case 403:
                suggestion = 'Access forbidden. Your API key might not have permission for this operation.';
                break;
            case 404:
                suggestion = 'API endpoint not found. This might be a temporary issue with the Groq API.';
                break;
            case 413:
                suggestion = 'Audio file is too large. Try a shorter video or reduce the audio quality.';
                break;
            case 429:
                suggestion = 'Rate limit exceeded. Please wait a few moments before trying again.';
                break;
            case 500:
            case 502:
            case 503:
            case 504:
                suggestion = 'Groq API server error. This is usually temporary - please try again in a few moments.';
                break;
            default:
                suggestion = 'An unexpected error occurred. Please try again.';
        }

        const fullMessage = `Groq API Error (${status}): ${message}\n\n💡 ${suggestion}`;
        const error = new Error(fullMessage);
        error.status = status;
        error.originalMessage = message;
        error.suggestion = suggestion;

        return error;
    }

    /**
     * Set the API key
     * @param {string} apiKey - The API key for Groq
     */
    setApiKey(apiKey) {
        this.apiKey = apiKey;
    }

    /**
     * Get the API key
     * @returns {string} The API key
     */
    getApiKey() {
        return this.apiKey;
    }

    /**
     * Check if the API key is set
     * @returns {boolean} True if the API key is set, false otherwise
     */
    hasApiKey() {
        return this.apiKey !== null && this.apiKey !== '';
    }

    /**
     * Set the model to use for transcription/translation
     * @param {string} model - The model to use (whisper-large-v3, whisper-large-v3-turbo, distil-whisper-large-v3-en)
     */
    setModel(model) {
        const validModels = ['whisper-large-v3', 'whisper-large-v3-turbo', 'distil-whisper-large-v3-en'];
        if (validModels.includes(model)) {
            this.model = model;
        } else {
            console.warn(`[Buttercup] Invalid model: ${model}. Using default model: whisper-large-v3`);
        }
    }

    /**
     * Get the current model
     * @returns {string} The current model
     */
    getModel() {
        return this.model;
    }

    /**
     * Prepare a file for upload
     * @param {Blob|string} audioFile - The audio file as a Blob or URL
     * @returns {Promise<Blob>} - The prepared file
     */
    async prepareFile(audioFile) {
        // If it's already a Blob, return it
        if (audioFile instanceof Blob) {
            return audioFile;
        }
        
        // If it's a string (URL), download it with retry logic
        if (typeof audioFile === 'string') {
            try {
                return await this.retryWithBackoff(async () => {
                    const response = await fetch(audioFile);
                    if (!response.ok) {
                        const error = new Error(`Failed to download file: ${response.status} ${response.statusText}`);
                        error.status = response.status;
                        throw error;
                    }
                    return await response.blob();
                }, 3, 1000); // 3 retries with 1 second base delay
            } catch (error) {
                console.error('[Buttercup] Error downloading file after retries:', error);
                throw new Error(`Failed to download audio file: ${error.message}. Please check your network connection.`);
            }
        }
        
        throw new Error('Invalid audio file format. Must be URL string or Blob');
    }

    /**
     * Transcribe audio file
     * @param {string|Blob} audioFile - URL or Blob of the audio file
     * @param {Object} options - Additional options
     * @param {string} options.language - Language code (optional)
     * @param {string} options.prompt - Prompt to guide the model (optional, max 224 tokens)
     * @param {boolean} options.validateQuality - If true, validate transcription quality using metadata (default: true)
     * @returns {Promise<Object>} - Transcription result
     * @throws {Error} - If the transcription fails
     */
    async transcribe(audioFile, options = {}) {
        if (!this.hasApiKey()) {
            throw new Error('Groq API key not set');
        }

        try {
            const formData = new FormData();

            // Handle file input (URL or Blob)
            const preparedFile = await this.prepareFile(audioFile);

            // Validate audio file
            if (!preparedFile || preparedFile.size === 0) {
                throw new Error('Invalid audio file: file is empty or null');
            }

            console.info('[Buttercup] Audio file prepared for transcription:', {
                size: `${(preparedFile.size / 1024 / 1024).toFixed(2)} MB`,
                type: preparedFile.type || 'unknown',
                sizeBytes: preparedFile.size
            });

            // Add file with a proper filename to ensure correct MIME type detection
            const filename = 'audio.mp3'; // Default filename
            formData.append('file', preparedFile, filename);
            
            // Add required parameters
            formData.append('model', this.model);
            formData.append('response_format', options.responseFormat || 'verbose_json');
            formData.append('temperature', options.temperature !== undefined ? String(options.temperature) : '0');

            // Add optional parameters
            const params = {
                model: this.model,
                language: options.language && options.language !== 'auto' ? options.language : 'auto-detect',
                prompt: options.prompt || 'none',
                wordTimestamps: options.wordTimestamps || false,
                responseFormat: options.responseFormat || 'verbose_json',
                temperature: options.temperature !== undefined ? options.temperature : 0
            };

            if (options.language && options.language !== 'auto') {
                formData.append('language', options.language);
            }

            if (options.prompt) {
                formData.append('prompt', options.prompt);
            }

            // Add timestamp granularities - always include segment
            // Note: Must use response_format=verbose_json for this to work
            if (options.responseFormat === 'verbose_json') {
                formData.append('timestamp_granularities[]', 'segment');

                // Add word-level timestamps if enabled
                if (options.wordTimestamps) {
                    formData.append('timestamp_granularities[]', 'word');
                }
            }

            console.info('[Buttercup] Sending transcription request with parameters:', params);

            // Use rate limiter if available, otherwise fall back to direct call
            const executeRequest = async () => {
                // Wrap API call in retry logic
                return await this.retryWithBackoff(async () => {
                    const response = await fetch(`${this.baseUrl}/transcriptions`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`
                        },
                        body: formData
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        console.error('[Buttercup] Groq API error response:', {
                            status: response.status,
                            statusText: response.statusText,
                            error: errorText
                        });

                    // Parse error with helpful message
                    throw this.parseApiError(response, errorText);
                }

                return await response.json();
                }, 3, 2000); // 3 retries, starting with 2 second delay
            };

            // Execute through rate limiter if available
            const result = window.rateLimiterManager
                ? await window.rateLimiterManager.execute('groq', executeRequest, {
                    priority: 'high',
                    estimatedTokens: 7000 // Typical transcription token usage
                })
                : await executeRequest();

            // Log detailed response information
            console.info('[Buttercup] Groq API transcription response:', {
                language: result.language || 'unknown',
                duration: result.duration ? `${result.duration.toFixed(2)}s` : 'unknown',
                textLength: result.text ? result.text.length : 0,
                textPreview: result.text ? result.text.substring(0, 150) + '...' : 'no text',
                segmentCount: result.segments ? result.segments.length : 0,
                wordCount: result.words ? result.words.length : 0
            });

            // Validate quality (enabled by default, set validateQuality: false to disable)
            const shouldValidate = options.validateQuality !== false; // Default: true
            if (shouldValidate && result.segments) {
                result.qualityReport = this.validateTranscriptionQuality(result.segments);
            }

            return result;
        } catch (error) {
            console.error('[Buttercup] Groq API transcription error:', error);
            throw error;
        }
    }

    /**
     * Translate audio file to English
     * @param {string|Blob} audioFile - URL or Blob of the audio file
     * @param {Object} options - Additional options
     * @param {string} options.prompt - Prompt to guide the model (optional, max 224 tokens)
     * @param {boolean} options.validateQuality - If true, validate translation quality using metadata (default: true)
     * @returns {Promise<Object>} - Translation result
     * @throws {Error} - If the translation fails
     */
    async translate(audioFile, options = {}) {
        if (!this.hasApiKey()) {
            throw new Error('Groq API key not set');
        }

        // Only whisper-large-v3 supports translation
        if (this.model !== 'whisper-large-v3') {
            console.warn('[Buttercup] Translation is only supported with whisper-large-v3 model. Switching to whisper-large-v3.');
            this.model = 'whisper-large-v3';
        }

        try {
            const formData = new FormData();

            // Handle file input (URL or Blob)
            const preparedFile = await this.prepareFile(audioFile);

            // Validate audio file
            if (!preparedFile || preparedFile.size === 0) {
                throw new Error('Invalid audio file: file is empty or null');
            }

            console.info('[Buttercup] Audio file prepared for translation:', {
                size: `${(preparedFile.size / 1024 / 1024).toFixed(2)} MB`,
                type: preparedFile.type || 'unknown',
                sizeBytes: preparedFile.size
            });

            // Add file with a proper filename to ensure correct MIME type detection
            const filename = 'audio.mp3'; // Default filename
            formData.append('file', preparedFile, filename);
            
            // Add required parameters
            formData.append('model', 'whisper-large-v3'); // Only this model supports translation
            formData.append('response_format', options.responseFormat || 'verbose_json');
            formData.append('temperature', options.temperature !== undefined ? String(options.temperature) : '0');

            // Add optional parameters
            const params = {
                model: 'whisper-large-v3',
                mode: 'translation to English',
                prompt: options.prompt || 'none',
                wordTimestamps: options.wordTimestamps || false,
                responseFormat: options.responseFormat || 'verbose_json',
                temperature: options.temperature !== undefined ? options.temperature : 0
            };

            if (options.prompt) {
                formData.append('prompt', options.prompt);
            }

            console.info('[Buttercup] Sending translation request with parameters:', params);

            // Use rate limiter if available, otherwise fall back to direct call
            const executeRequest = async () => {
                // Wrap API call in retry logic
                return await this.retryWithBackoff(async () => {
                    const response = await fetch(`${this.baseUrl}/translations`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`
                        },
                        body: formData
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        console.error('[Buttercup] Groq API error response:', {
                            status: response.status,
                            statusText: response.statusText,
                            error: errorText
                        });

                        // Parse error with helpful message
                        throw this.parseApiError(response, errorText);
                    }

                    return await response.json();
                }, 3, 2000); // 3 retries, starting with 2 second delay
            };

            // Execute through rate limiter if available
            const result = window.rateLimiterManager
                ? await window.rateLimiterManager.execute('groq', executeRequest, {
                    priority: 'high',
                    estimatedTokens: 7000 // Typical translation token usage
                })
                : await executeRequest();

            // Log detailed response information
            console.info('[Buttercup] Groq API translation response:', {
                language: result.language || 'unknown',
                duration: result.duration ? `${result.duration.toFixed(2)}s` : 'unknown',
                textLength: result.text ? result.text.length : 0,
                textPreview: result.text ? result.text.substring(0, 150) + '...' : 'no text',
                segmentCount: result.segments ? result.segments.length : 0,
                wordCount: result.words ? result.words.length : 0
            });

            // Validate quality (enabled by default, set validateQuality: false to disable)
            const shouldValidate = options.validateQuality !== false; // Default: true
            if (shouldValidate && result.segments) {
                result.qualityReport = this.validateTranscriptionQuality(result.segments);
            }

            return result;
        } catch (error) {
            console.error('[Buttercup] Groq API translation error:', error);
            throw error;
        }
    }

    /**
     * Validate transcription quality using metadata fields
     * Based on Groq API documentation recommendations
     * @param {Array} segments - Array of transcription segments with metadata
     */
    validateTranscriptionQuality(segments) {
        if (!segments || segments.length === 0) {
            console.warn('[Buttercup] No segments to validate');
            return null;
        }

        let lowConfidenceCount = 0;
        let highNoSpeechCount = 0;
        let unusualCompressionCount = 0;
        const issues = [];

        segments.forEach((segment, index) => {
            const segmentIssues = [];

            // Check avg_logprob (Average Log Probability)
            // Values closer to 0 = better confidence
            if (segment.avg_logprob !== undefined && segment.avg_logprob < this.qualityThresholds.avgLogProbThreshold) {
                lowConfidenceCount++;
                segmentIssues.push(`Low confidence (avg_logprob: ${segment.avg_logprob.toFixed(3)})`);
            }

            // Check no_speech_prob (No Speech Probability)
            // Values closer to 1 = likely not speech
            if (segment.no_speech_prob !== undefined && segment.no_speech_prob > this.qualityThresholds.noSpeechProbThreshold) {
                highNoSpeechCount++;
                segmentIssues.push(`Possible non-speech (no_speech_prob: ${segment.no_speech_prob.toFixed(3)})`);
            }

            // Check compression_ratio
            // Healthy values are typically between 1.5 and 2.5
            if (segment.compression_ratio !== undefined) {
                if (segment.compression_ratio > this.qualityThresholds.compressionRatioMax ||
                    segment.compression_ratio < this.qualityThresholds.compressionRatioMin) {
                    unusualCompressionCount++;
                    segmentIssues.push(`Unusual speech pattern (compression_ratio: ${segment.compression_ratio.toFixed(3)})`);
                }
            }

            // Log segment-specific issues
            if (segmentIssues.length > 0) {
                issues.push({
                    segment: index,
                    time: `${segment.start?.toFixed(2)}s - ${segment.end?.toFixed(2)}s`,
                    text: segment.text?.substring(0, 50),
                    issues: segmentIssues
                });
            }
        });

        // Log summary
        console.info('[Buttercup] 📊 Transcription Quality Report:', {
            totalSegments: segments.length,
            lowConfidenceSegments: lowConfidenceCount,
            highNoSpeechSegments: highNoSpeechCount,
            unusualCompressionSegments: unusualCompressionCount,
            issuesFound: issues.length
        });

        // Log detailed issues if any
        if (issues.length > 0) {
            console.warn('[Buttercup] ⚠️ Quality Issues Detected:');
            issues.forEach((issue) => {
                console.warn(`  Segment ${issue.segment} (${issue.time}):`, issue.issues.join(', '));
                console.warn(`    Text: "${issue.text}..."`);
            });

            // Provide recommendations based on thresholds
            if (lowConfidenceCount > segments.length * this.qualityThresholds.lowConfidencePercent) {
                console.warn('[Buttercup] 💡 Recommendation: High number of low-confidence segments detected. Consider:');
                console.warn('   - Improving audio quality (reduce background noise)');
                console.warn('   - Using a more specific prompt');
                console.warn('   - Checking for strong accents or unclear pronunciation');
            }

            if (highNoSpeechCount > segments.length * this.qualityThresholds.highNoSpeechPercent) {
                console.warn('[Buttercup] 💡 Recommendation: Possible non-speech segments detected. Consider:');
                console.warn('   - Trimming silence periods');
                console.warn('   - Reducing background music/noise');
                console.warn('   - Checking for non-verbal sounds');
            }

            if (unusualCompressionCount > segments.length * this.qualityThresholds.unusualCompressionPercent) {
                console.warn('[Buttercup] 💡 Recommendation: Unusual speech patterns detected. Consider:');
                console.warn('   - Checking for stuttering or word repetition');
                console.warn('   - Verifying speaker is not talking unusually fast/slow');
                console.warn('   - Improving audio quality');
            }
        } else {
            console.info('[Buttercup] ✅ Transcription quality looks good!');
        }

        // Return quality data for UI display
        const hasWarnings = issues.length > 0;
        const warnings = [];

        if (lowConfidenceCount > segments.length * this.qualityThresholds.lowConfidencePercent) {
            warnings.push(`${lowConfidenceCount} segments have low confidence scores`);
        }

        if (highNoSpeechCount > segments.length * this.qualityThresholds.highNoSpeechPercent) {
            warnings.push(`${highNoSpeechCount} segments may contain non-speech audio`);
        }

        if (unusualCompressionCount > segments.length * this.qualityThresholds.unusualCompressionPercent) {
            warnings.push(`${unusualCompressionCount} segments have unusual speech patterns`);
        }

        return {
            hasWarnings,
            warnings,
            stats: {
                totalSegments: segments.length,
                lowConfidenceSegments: lowConfidenceCount,
                noSpeechSegments: highNoSpeechCount,
                unusualCompressionSegments: unusualCompressionCount
            }
        };
    }

    /**
     * Convert Groq API response to YouTube caption format
     * @param {Object} response - The Groq API response
     * @param {Object} options - Formatting options
     * @param {boolean} options.useWordTimestamps - Whether to use word-level timestamps
     * @param {number} options.wordsPerLine - Number of words per line (default: 12)
     * @param {number} options.maxLineLength - Maximum words before inserting a line break (default: 6, 0 to disable)
     * @returns {Object} - YouTube caption format object
     */
    convertToYouTubeFormat(response, options = {}) {
        try {
            console.info('[Buttercup] Converting to YouTube format with options:', options);
            console.info('[Buttercup] Response has words:', !!response.words, 'segments:', !!response.segments);

            const jsonSubtitles = { events: [] };
            const useWordTimestamps = options.useWordTimestamps || false;
            const wordsPerLine = options.wordsPerLine || 12;
            const maxLineLength = options.maxLineLength !== undefined ? options.maxLineLength : 6;
            
            // Insert newlines after specified number of words
            function insertNewlines(text) {
                // If maxLineLength is 0, don't insert any newlines
                if (maxLineLength === 0) {
                    return text.trim();
                }
                
                let newText = '';
                let wordCount = 0;
                
                // Trim leading and trailing spaces before processing
                text = text.trim();
                
                text.split(' ').forEach((word) => {
                    if (word === '') return; // Skip empty words
                    
                    if (wordCount < maxLineLength) {
                        newText += (wordCount > 0 ? ' ' : '') + word;
                        wordCount++;
                    } else {
                        newText += '\n' + word;
                        wordCount = 1;
                    }
                });
                
                return newText;
            }
            
            // Process using word-level timestamps if available and enabled
            if (useWordTimestamps && response.words && response.words.length > 0) {
                // Group words into lines based on wordsPerLine setting
                const words = response.words;
                let currentLine = [];
                let lineStartTime = 0;
                
                for (let i = 0; i < words.length; i++) {
                    const word = words[i];
                    
                    // Start a new line if this is the first word or if we've reached the words per line limit
                    if (currentLine.length === 0) {
                        lineStartTime = word.start;
                        currentLine.push(word);
                    } else if (currentLine.length < wordsPerLine) {
                        // Add to current line if we haven't reached the words per line limit
                        currentLine.push(word);
                    } else {
                        // Process the current line
                        const lineEndTime = currentLine[currentLine.length - 1].end;
                        let lineText = currentLine.map(w => w.word).join(' ').trim();
                        
                        // Apply line breaks based on maxLineLength if it's not 0
                        if (maxLineLength > 0) {
                            lineText = insertNewlines(lineText);
                        }
                        
                        jsonSubtitles.events.push({
                            tStartMs: Math.round(lineStartTime * 1000),
                            dDurationMs: Math.round((lineEndTime - lineStartTime) * 1000),
                            segs: [{ utf8: lineText }]
                        });
                        
                        // Start a new line with the current word
                        currentLine = [word];
                        lineStartTime = word.start;
                    }
                }
                
                // Process the last line if there are any words left
                if (currentLine.length > 0) {
                    const lineEndTime = currentLine[currentLine.length - 1].end;
                    let lineText = currentLine.map(w => w.word).join(' ').trim();
                    
                    // Apply line breaks based on maxLineLength if it's not 0
                    if (maxLineLength > 0) {
                        lineText = insertNewlines(lineText);
                    }
                    
                    jsonSubtitles.events.push({
                        tStartMs: Math.round(lineStartTime * 1000),
                        dDurationMs: Math.round((lineEndTime - lineStartTime) * 1000),
                        segs: [{ utf8: lineText }]
                    });
                }
            }
            // Fall back to segment-level timestamps
            else if (response.segments && response.segments.length > 0) {
                response.segments.forEach(segment => {
                    const startTimeMs = Math.round(segment.start * 1000);
                    const durationMs = Math.round((segment.end - segment.start) * 1000);
                    const text = insertNewlines(segment.text.trim());

                    jsonSubtitles.events.push({
                        tStartMs: startTimeMs,
                        dDurationMs: durationMs,
                        segs: [{ utf8: text }]
                    });
                });
            }

            // Validate that we have events
            if (jsonSubtitles.events.length === 0) {
                console.error('[Buttercup] No subtitle events generated!');
                throw new Error('No subtitle events generated from transcription response');
            }

            console.info('[Buttercup] Successfully generated', jsonSubtitles.events.length, 'subtitle events');
            return jsonSubtitles;
        } catch (error) {
            console.error('[Buttercup] Error converting Groq response to YouTube format:', error);
            throw error;
        }
    }

    /**
     * Convert YouTube caption format to SRT format
     * @param {Object} jsonSubtitles - YouTube caption format object
     * @returns {string} - SRT format string
     */
    convertToSRT(jsonSubtitles) {
        try {
            function msToSRTTime(ms) {
                // Round to nearest millisecond to avoid floating point precision issues
                const roundedMs = Math.round(ms);
                const hours = String(Math.floor(roundedMs / 3600000)).padStart(2, '0');
                const minutes = String(Math.floor((roundedMs % 3600000) / 60000)).padStart(2, '0');
                const seconds = String(Math.floor((roundedMs % 60000) / 1000)).padStart(2, '0');
                const milliseconds = String(roundedMs % 1000).padStart(3, '0');
                return `${hours}:${minutes}:${seconds},${milliseconds}`;
            }
            
            let srtContent = '';
            jsonSubtitles.events.forEach((event, index) => {
                const startTime = msToSRTTime(event.tStartMs);
                const endTime = msToSRTTime(event.tStartMs + event.dDurationMs);
                const text = event.segs.map(seg => seg.utf8).join('\n');
                
                srtContent += `${index + 1}\n${startTime} --> ${endTime}\n${text}\n\n`;
            });
            
            return srtContent.trim();
        } catch (error) {
            console.error('[Buttercup] Error converting to SRT format:', error);
            throw error;
        }
    }
}

// Export the class
window.GroqAPI = GroqAPI;