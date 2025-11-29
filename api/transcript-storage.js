/**
 * Transcript Storage Manager
 * Manages persistent storage of video transcripts and summaries
 */

class TranscriptStorage {
    constructor() {
        this.storageKey = 'buttercup_transcripts';
    }

    /**
     * Save transcript for a video
     * @param {string} videoId - Video ID (platform-specific)
     * @param {object} data - Transcript data
     */
    async saveTranscript(videoId, data) {
        try {
            const transcripts = await this.getAllTranscripts();

            transcripts[videoId] = {
                videoId: videoId,
                captionData: data.captionData,
                srtData: data.srtData || null,
                videoTitle: data.videoTitle || 'Unknown',
                timestamp: Date.now(),
                // Multi-platform support
                videoUrl: data.videoUrl || null,  // Original URL for any platform
                platform: data.platform || 'YouTube',  // Platform name
                source: data.source || 'web',  // Source: 'web', 'batch', or 'local_upload'
                translationSettings: {
                    enabled: data.translationEnabled || false,
                    targetLanguage: data.targetLanguage || '',
                    provider: data.provider || ''
                },
                summary: data.summary || null
            };

            await this.setAllTranscripts(transcripts);
            console.info(`[TranscriptStorage] ✓ Transcript saved for video: ${videoId}`);
            return true;
        } catch (error) {
            console.error('[TranscriptStorage] Error saving transcript:', error);
            return false;
        }
    }

    /**
     * Load transcript for a video
     * @param {string} videoId - YouTube video ID
     */
    async loadTranscript(videoId) {
        try {
            const transcripts = await this.getAllTranscripts();
            const transcript = transcripts[videoId];

            if (transcript) {
                console.info(`[TranscriptStorage] ✓ Transcript loaded for video: ${videoId}`);
                return transcript;
            }

            console.info(`[TranscriptStorage] No transcript found for video: ${videoId}`);
            return null;
        } catch (error) {
            console.error('[TranscriptStorage] Error loading transcript:', error);
            return null;
        }
    }

    /**
     * Delete transcript for a video
     * @param {string} videoId - YouTube video ID
     */
    async deleteTranscript(videoId) {
        try {
            const transcripts = await this.getAllTranscripts();

            if (transcripts[videoId]) {
                delete transcripts[videoId];
                await this.setAllTranscripts(transcripts);
                console.info(`[TranscriptStorage] ✓ Transcript deleted for video: ${videoId}`);
                return true;
            }

            return false;
        } catch (error) {
            console.error('[TranscriptStorage] Error deleting transcript:', error);
            return false;
        }
    }

    /**
     * Check if transcript exists for a video
     * @param {string} videoId - YouTube video ID
     */
    async hasTranscript(videoId) {
        try {
            const transcripts = await this.getAllTranscripts();
            return !!transcripts[videoId];
        } catch (error) {
            console.error('[TranscriptStorage] Error checking transcript:', error);
            return false;
        }
    }

    /**
     * Get all stored transcripts
     */
    async getAllTranscripts() {
        return new Promise((resolve) => {
            // Request storage data from content script
            const requestId = 'transcript_get_' + Date.now();

            const responseHandler = (e) => {
                if (e.detail && e.detail.requestId === requestId) {
                    document.removeEventListener('buttercupStorageResponse', responseHandler);
                    resolve(e.detail.data || {});
                }
            };

            document.addEventListener('buttercupStorageResponse', responseHandler);

            document.dispatchEvent(new CustomEvent('buttercupStorageRequest', {
                detail: {
                    action: 'get',
                    key: this.storageKey,
                    requestId: requestId
                }
            }));

            // Timeout after 5 seconds
            setTimeout(() => {
                document.removeEventListener('buttercupStorageResponse', responseHandler);
                resolve({});
            }, 5000);
        });
    }

    /**
     * Set all transcripts
     */
    async setAllTranscripts(transcripts) {
        return new Promise((resolve) => {
            // Request storage data from content script
            const requestId = 'transcript_set_' + Date.now();

            const responseHandler = (e) => {
                if (e.detail && e.detail.requestId === requestId) {
                    document.removeEventListener('buttercupStorageResponse', responseHandler);
                    resolve();
                }
            };

            document.addEventListener('buttercupStorageResponse', responseHandler);

            document.dispatchEvent(new CustomEvent('buttercupStorageRequest', {
                detail: {
                    action: 'set',
                    key: this.storageKey,
                    data: transcripts,
                    requestId: requestId
                }
            }));

            // Timeout after 5 seconds
            setTimeout(() => {
                document.removeEventListener('buttercupStorageResponse', responseHandler);
                resolve();
            }, 5000);
        });
    }

    /**
     * Get storage statistics
     */
    async getStats() {
        const transcripts = await this.getAllTranscripts();
        const count = Object.keys(transcripts).length;

        // Calculate approximate storage size
        const jsonString = JSON.stringify(transcripts);
        const sizeBytes = new Blob([jsonString]).size;
        const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);

        return {
            count: count,
            sizeBytes: sizeBytes,
            sizeMB: sizeMB
        };
    }

    /**
     * Clear all transcripts
     */
    async clearAll() {
        try {
            await this.setAllTranscripts({});
            console.info('[TranscriptStorage] ✓ All transcripts cleared');
            return true;
        } catch (error) {
            console.error('[TranscriptStorage] Error clearing transcripts:', error);
            return false;
        }
    }

    /**
     * Update summary for a video
     * @param {string} videoId - YouTube video ID
     * @param {object} summary - Summary data
     */
    async updateSummary(videoId, summary) {
        try {
            const transcripts = await this.getAllTranscripts();

            if (transcripts[videoId]) {
                transcripts[videoId].summary = summary;
                transcripts[videoId].summaryTimestamp = Date.now();
                await this.setAllTranscripts(transcripts);
                console.info(`[TranscriptStorage] ✓ Summary updated for video: ${videoId}`);
                return true;
            }

            return false;
        } catch (error) {
            console.error('[TranscriptStorage] Error updating summary:', error);
            return false;
        }
    }

    /**
     * Generate SRT content from caption data
     * @param {object} captionData - Caption data in YouTube format
     */
    generateSRT(captionData) {
        if (!captionData || !captionData.events) {
            return '';
        }

        let srt = '';
        let index = 1;

        for (const event of captionData.events) {
            const startTime = this.formatSRTTime(event.tStartMs);
            const endTime = this.formatSRTTime(event.tStartMs + event.dDurationMs);
            const text = event.segs.map(seg => seg.utf8).join('');

            srt += `${index}\n`;
            srt += `${startTime} --> ${endTime}\n`;
            srt += `${text}\n\n`;

            index++;
        }

        return srt.trim();
    }

    /**
     * Format time in milliseconds to SRT time format (HH:MM:SS,mmm)
     */
    formatSRTTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const milliseconds = ms % 1000;

        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
    }

    /**
     * Generate VTT (WebVTT) format from caption data
     * @param {Object} captionData - Caption data with events
     * @returns {string} - VTT formatted string
     */
    generateVTT(captionData) {
        if (!captionData || !captionData.events) {
            return '';
        }

        let vtt = 'WEBVTT\n\n';

        for (const event of captionData.events) {
            const startTime = this.formatVTTTime(event.tStartMs);
            const endTime = this.formatVTTTime(event.tStartMs + event.dDurationMs);
            const text = event.segs.map(seg => seg.utf8).join('');

            vtt += `${startTime} --> ${endTime}\n`;
            vtt += `${text}\n\n`;
        }

        return vtt.trim();
    }

    /**
     * Format time in milliseconds to VTT time format (HH:MM:SS.mmm)
     */
    formatVTTTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const milliseconds = ms % 1000;

        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
    }

    /**
     * Generate plain text format from caption data
     * @param {Object} captionData - Caption data with events
     * @param {boolean} includeTimestamps - Whether to include timestamps (default: false)
     * @returns {string} - Plain text string
     */
    generateTXT(captionData, includeTimestamps = false) {
        if (!captionData || !captionData.events) {
            return '';
        }

        let txt = '';

        for (const event of captionData.events) {
            const text = event.segs.map(seg => seg.utf8).join('');

            if (includeTimestamps) {
                const timestamp = this.formatReadableTime(event.tStartMs);
                txt += `[${timestamp}] ${text}\n`;
            } else {
                txt += `${text}\n`;
            }
        }

        return txt.trim();
    }

    /**
     * Format time in milliseconds to readable format (MM:SS)
     */
    formatReadableTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    /**
     * Generate JSON format from caption data
     * @param {Object} captionData - Caption data with events
     * @param {Object} metadata - Additional metadata (videoTitle, etc.)
     * @returns {string} - JSON formatted string
     */
    generateJSON(captionData, metadata = {}) {
        if (!captionData || !captionData.events) {
            return '';
        }

        const jsonData = {
            metadata: {
                videoTitle: metadata.videoTitle || 'Unknown',
                duration: metadata.duration || 'Unknown',
                exportDate: new Date().toISOString(),
                totalCaptions: captionData.events.length
            },
            captions: captionData.events.map((event, index) => ({
                index: index + 1,
                startTime: event.tStartMs,
                endTime: event.tStartMs + event.dDurationMs,
                startTimeFormatted: this.formatReadableTime(event.tStartMs),
                endTimeFormatted: this.formatReadableTime(event.tStartMs + event.dDurationMs),
                duration: event.dDurationMs,
                text: event.segs.map(seg => seg.utf8).join('')
            }))
        };

        return JSON.stringify(jsonData, null, 2);
    }

    /**
     * Copy text to clipboard
     * @param {string} text - Text to copy
     * @returns {Promise<boolean>} - Success status
     */
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            console.info('[TranscriptStorage] ✓ Copied to clipboard');
            return true;
        } catch (error) {
            console.error('[TranscriptStorage] Error copying to clipboard:', error);

            // Fallback method for older browsers
            try {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                console.info('[TranscriptStorage] ✓ Copied to clipboard (fallback method)');
                return true;
            } catch (fallbackError) {
                console.error('[TranscriptStorage] Fallback copy failed:', fallbackError);
                return false;
            }
        }
    }

    /**
     * Download file with given content and filename
     * @param {string} content - File content
     * @param {string} filename - Filename
     * @param {string} mimeType - MIME type (default: text/plain)
     */
    downloadFile(content, filename, mimeType = 'text/plain') {
        try {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);

            console.info('[TranscriptStorage] ✓ File downloaded:', filename);
            return true;
        } catch (error) {
            console.error('[TranscriptStorage] Error downloading file:', error);
            return false;
        }
    }

    /**
     * Export captions in specified format
     * @param {Object} captionData - Caption data with events
     * @param {string} format - Export format (srt, vtt, txt, json)
     * @param {string} videoTitle - Video title for filename
     * @param {Object} options - Additional options
     * @returns {boolean} - Success status
     */
    exportCaptions(captionData, format, videoTitle, options = {}) {
        const baseFilename = videoTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        let content = '';
        let filename = '';
        let mimeType = 'text/plain';

        switch (format.toLowerCase()) {
            case 'srt':
                content = this.generateSRT(captionData);
                filename = `${baseFilename}.srt`;
                break;

            case 'vtt':
                content = this.generateVTT(captionData);
                filename = `${baseFilename}.vtt`;
                mimeType = 'text/vtt';
                break;

            case 'txt':
                content = this.generateTXT(captionData, options.includeTimestamps || false);
                filename = `${baseFilename}.txt`;
                break;

            case 'json':
                content = this.generateJSON(captionData, { videoTitle });
                filename = `${baseFilename}.json`;
                mimeType = 'application/json';
                break;

            default:
                console.error('[TranscriptStorage] Unknown export format:', format);
                return false;
        }

        return this.downloadFile(content, filename, mimeType);
    }

    /**
     * Get text content for clipboard (with format options)
     * @param {Object} captionData - Caption data with events
     * @param {string} format - Format (plain, timestamped, srt, vtt, json)
     * @returns {string} - Formatted text
     */
    getClipboardContent(captionData, format = 'plain') {
        switch (format.toLowerCase()) {
            case 'plain':
                return this.generateTXT(captionData, false);

            case 'timestamped':
                return this.generateTXT(captionData, true);

            case 'srt':
                return this.generateSRT(captionData);

            case 'vtt':
                return this.generateVTT(captionData);

            case 'json':
                return this.generateJSON(captionData);

            default:
                return this.generateTXT(captionData, false);
        }
    }
}

// Make available globally
window.TranscriptStorage = TranscriptStorage;
