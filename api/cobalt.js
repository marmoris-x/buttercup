/**
 * Localhost yt-dlp handler for Buttercup
 * Handles downloading audio from YouTube videos using a local Python server.
 */
class CobaltAPI {
    constructor() {
        // The base URL of our local server
        this.apiBase = 'http://127.0.0.1:8675';
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

        // Don't retry on invalid URL errors
        if (message.includes('invalid url') || message.includes('invalid video')) {
            return true;
        }

        // Don't retry on video not available
        if (message.includes('video unavailable') || message.includes('not available')) {
            return true;
        }

        // Don't retry on age-restricted or private videos
        if (message.includes('age-restricted') || message.includes('private video')) {
            return true;
        }

        return false;
    }

    /**
     * Parse local server error and provide user-friendly message
     * @param {number} status - The HTTP status code
     * @param {string} errorMessage - The error message from the server
     * @returns {Error} - A formatted error with helpful message
     */
    parseServerError(status, errorMessage) {
        let suggestion = '';

        if (errorMessage.includes('Connection refused') || errorMessage.includes('ECONNREFUSED')) {
            suggestion = 'Local server is not running. Please start the Python server (run: python server.py) and try again.';
        } else if (errorMessage.includes('timeout')) {
            suggestion = 'Request timed out. The video might be very long. Try a shorter video or increase the timeout.';
        } else if (errorMessage.includes('unavailable')) {
            suggestion = 'This video is not available. It might be private, deleted, or region-restricted.';
        } else if (errorMessage.includes('age-restricted')) {
            suggestion = 'This video is age-restricted and cannot be downloaded automatically.';
        } else if (status === 404) {
            suggestion = 'Invalid video URL or video not found.';
        } else if (status === 500) {
            suggestion = 'Server error. The local Python server encountered an issue processing this video.';
        } else {
            suggestion = 'Please check the video URL and try again.';
        }

        const fullMessage = `Download Error: ${errorMessage}\n\n💡 ${suggestion}`;
        const error = new Error(fullMessage);
        error.status = status;
        error.originalMessage = errorMessage;
        error.suggestion = suggestion;

        return error;
    }

    /**
     * Download audio from YouTube video by calling the local server.
     * @param {string} videoUrl - The YouTube video URL
     * @returns {Promise<Blob>} - A Blob object containing the audio data.
     * @throws {Error} - If the download fails.
     */
    async downloadAudio(videoUrl) {
        try {
            // Construct the request URL for our local server
            const requestUrl = `${this.apiBase}/get-audio?url=${encodeURIComponent(videoUrl)}`;

            console.info(`[Buttercup] Requesting audio from local server: ${requestUrl}`);

            // Wrap download in retry logic
            const result = await this.retryWithBackoff(async () => {
                // Fetch the audio from our local server
                const response = await fetch(requestUrl);

                if (!response.ok) {
                    let errorMessage = `${response.status} ${response.statusText}`;
                    try {
                        const errorData = await response.json();
                        errorMessage = errorData.error || errorMessage;
                    } catch (e) {
                        // Failed to parse JSON, use status text
                    }

                    // Parse error with helpful message
                    throw this.parseServerError(response.status, errorMessage);
                }

                // Get filename from Content-Disposition header
                let filename = 'audio.webm'; // Default
                const contentDisposition = response.headers.get('Content-Disposition');
                if (contentDisposition) {
                    const match = contentDisposition.match(/filename="?([^";\s]+)"?/);
                    if (match) {
                        filename = match[1];
                    }
                }

                // The response from our server is the audio file itself
                const blob = await response.blob();

                // Validate the audio blob
                if (!blob || blob.size === 0) {
                    throw new Error('Received empty or invalid audio from local server');
                }

                // Fallback: determine extension from MIME type if no header
                if (filename === 'audio.webm' && blob.type) {
                    const mimeToExt = {
                        'audio/webm': 'audio.webm',
                        'audio/mp4': 'audio.m4a',
                        'audio/ogg': 'audio.ogg',
                        'audio/opus': 'audio.opus',
                        'audio/mpeg': 'audio.mp3',
                        'audio/wav': 'audio.wav',
                    };
                    filename = mimeToExt[blob.type] || filename;
                }

                return { blob, filename };
            }, 3, 2000); // 3 retries, starting with 2 second delay

            const audioBlob = result.blob;
            const filename = result.filename;

            console.info('[Buttercup] Audio successfully received from local server:', {
                size: `${(audioBlob.size / 1024 / 1024).toFixed(2)} MB`,
                type: audioBlob.type || 'unknown',
                sizeBytes: audioBlob.size,
                filename: filename
            });

            // The TranscriptionHandler expects an object with a `url` property,
            // but since we now have a Blob, we need to adapt the workflow.
            // For simplicity, we'll return the Blob directly.
            // The TranscriptionHandler will need to be adjusted to handle a Blob instead of a URL.
            // Let's modify the TranscriptionHandler to accept a Blob directly.
            // We will return an object that looks like the original one, but with a blob URL.
            return {
                url: URL.createObjectURL(audioBlob),
                filename: filename
            };

        } catch (error) {
            console.error('[Buttercup] Local server request error after retries:', error);
            throw error;
        }
    }
}

// Export the class
window.CobaltAPI = CobaltAPI;