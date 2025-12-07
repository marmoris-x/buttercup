/**
 * Buttercup - Simple SRT Import
 * Copy & paste SRT content for current video
 */

class SRTImporter {
    constructor() {
        this.modal = document.getElementById('import-srt-modal');
        this.textarea = document.getElementById('import-srt-textarea');
        this.preview = document.getElementById('import-srt-preview');
        this.countSpan = document.getElementById('import-srt-count');
        this.importBtn = document.getElementById('import-srt-btn');
        this.confirmBtn = document.getElementById('confirm-import-srt');
        this.cancelBtn = document.getElementById('cancel-import-srt');

        this.init();
    }

    init() {
        // Import button click - opens modal
        this.importBtn.addEventListener('click', () => this.openModal());

        // Textarea input - show preview
        this.textarea.addEventListener('input', () => this.updatePreview());

        // Confirm button
        this.confirmBtn.addEventListener('click', () => this.confirmImport());

        // Cancel button
        this.cancelBtn.addEventListener('click', () => this.closeModal());

        console.info('[SRTImporter] Simple copy & paste import initialized');
    }

    openModal() {
        this.textarea.value = '';
        this.preview.classList.add('hidden');
        this.modal.showModal();
    }

    closeModal() {
        this.modal.close();
    }

    updatePreview() {
        const text = this.textarea.value.trim();
        if (!text) {
            this.preview.classList.add('hidden');
            return;
        }

        try {
            const parsed = this.parseSRT(text);
            this.countSpan.textContent = parsed.events.length;
            this.preview.classList.remove('hidden');
        } catch (error) {
            this.preview.classList.add('hidden');
        }
    }

    async confirmImport() {
        const srtContent = this.textarea.value.trim();
        if (!srtContent) {
            alert('Please paste SRT content');
            return;
        }

        try {
            // Parse SRT
            const parsed = this.parseSRT(srtContent);
            console.info(`[SRTImporter] Parsed ${parsed.events.length} subtitles`);

            // Get current video URL
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs[0] || !tabs[0].url) {
                alert('No active tab found');
                return;
            }

            const videoUrl = tabs[0].url;
            const videoTitle = tabs[0].title;
            const videoId = this.extractVideoId(videoUrl);

            console.info('[SRTImporter] Video ID:', videoId);
            console.info('[SRTImporter] Video URL:', videoUrl);

            // Generate SRT data
            const srtData = this.generateSRT(parsed.events);

            // Save to storage
            await this.saveImport(videoId, {
                videoId: videoId,
                videoTitle: videoTitle,
                videoUrl: videoUrl,
                srtData: srtData,
                captionData: parsed,
                timestamp: Date.now(),
                source: 'imported_srt',
                fileName: 'imported.srt'
            });

            alert(`✓ Imported ${parsed.events.length} subtitles for:\n${videoTitle}`);
            this.closeModal();

            // Refresh transcript tab
            if (typeof refreshTranscriptInfo === 'function') {
                refreshTranscriptInfo();
            }

        } catch (error) {
            console.error('[SRTImporter] Import failed:', error);
            alert(`Import failed: ${error.message}`);
        }
    }

    /**
     * Parse SRT format to caption events
     */
    parseSRT(srtText) {
        const events = [];
        const entries = srtText.trim().split(/\n\s*\n/);

        for (const entry of entries) {
            const lines = entry.trim().split('\n');
            if (lines.length < 3) continue;

            // Parse timestamps
            const timestampLine = lines[1];
            const timestampMatch = timestampLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);

            if (!timestampMatch) continue;

            // Start time
            const tStartMs = (parseInt(timestampMatch[1]) * 3600 + parseInt(timestampMatch[2]) * 60 + parseInt(timestampMatch[3])) * 1000 + parseInt(timestampMatch[4]);

            // End time
            const tEndMs = (parseInt(timestampMatch[5]) * 3600 + parseInt(timestampMatch[6]) * 60 + parseInt(timestampMatch[7])) * 1000 + parseInt(timestampMatch[8]);

            // Text
            const text = lines.slice(2).join('\n');

            events.push({
                tStartMs: tStartMs,
                dDurationMs: tEndMs - tStartMs,
                segs: [{ utf8: text }]
            });
        }

        if (events.length === 0) {
            throw new Error('No valid SRT entries found');
        }

        return { events };
    }

    /**
     * Generate SRT from events
     */
    generateSRT(events) {
        let srt = '';
        events.forEach((event, index) => {
            const startMs = event.tStartMs;
            const endMs = event.tStartMs + event.dDurationMs;
            const startTime = this.formatSRTTimestamp(startMs);
            const endTime = this.formatSRTTimestamp(endMs);
            const text = event.segs.map(seg => seg.utf8).join('');

            srt += `${index + 1}\n${startTime} --> ${endTime}\n${text}\n\n`;
        });

        return srt;
    }

    formatSRTTimestamp(ms) {
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        const milliseconds = ms % 1000;

        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
    }

    extractVideoId(url) {
        // YouTube
        let match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (match) return match[1];

        // TikTok
        match = url.match(/tiktok\.com\/.*\/video\/(\d+)/);
        if (match) return 'tiktok_' + match[1];

        // Vimeo
        match = url.match(/vimeo\.com\/(\d+)/);
        if (match) return 'vimeo_' + match[1];

        // Fallback
        return 'imported_' + this.hashString(url);
    }

    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    async saveImport(videoId, transcriptData) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['buttercup_transcripts'], (result) => {
                const transcripts = result.buttercup_transcripts || {};
                transcripts[videoId] = transcriptData;

                chrome.storage.local.set({ buttercup_transcripts: transcripts }, () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        console.info('[SRTImporter] ✓ Imported and saved:', videoId);
                        resolve();
                    }
                });
            });
        });
    }
}

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.srtImporter = new SRTImporter();
    });
} else {
    window.srtImporter = new SRTImporter();
}

console.info('[SRTImporter] Module loaded - Simple copy & paste mode');
