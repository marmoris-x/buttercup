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

            // Fetch the audio from our local server
            const response = await fetch(requestUrl);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Local server error: ${errorData.error || response.status}`);
            }

            // The response from our server is the audio file itself
            const audioBlob = await response.blob();
            
            console.info('[Buttercup] Audio successfully received from local server.');

            // The TranscriptionHandler expects an object with a `url` property, 
            // but since we now have a Blob, we need to adapt the workflow.
            // For simplicity, we'll return the Blob directly.
            // The TranscriptionHandler will need to be adjusted to handle a Blob instead of a URL.
            // Let's modify the TranscriptionHandler to accept a Blob directly.
            // We will return an object that looks like the original one, but with a blob URL.
            return {
                url: URL.createObjectURL(audioBlob),
                filename: 'audio.mp3'
            };

        } catch (error) {
            console.error('[Buttercup] Local server request error:', error);
            throw error;
        }
    }
}

// Export the class
window.CobaltAPI = CobaltAPI;