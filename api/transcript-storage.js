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
     * @param {string} videoId - YouTube video ID
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
}

// Make available globally
window.TranscriptStorage = TranscriptStorage;
