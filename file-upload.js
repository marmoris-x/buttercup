/**
 * Buttercup - Local File Upload & Transcription
 * Handles MP3, MP4, WAV, M4A, WebM file uploads and transcription
 */

class FileUploadHandler {
    constructor() {
        this.currentFile = null;
        this.isProcessing = false;
        this.abortController = null;

        // UI Elements
        this.fileInput = document.getElementById('upload-file-input');
        this.fileInfo = document.getElementById('upload-file-info');
        this.fileName = document.getElementById('upload-file-name');
        this.fileSize = document.getElementById('upload-file-size');
        this.fileType = document.getElementById('upload-file-type');
        this.progressSection = document.getElementById('upload-progress-section');
        this.progressBar = document.getElementById('upload-progress-bar');
        this.progressText = document.getElementById('upload-progress-text');
        this.statusText = document.getElementById('upload-status-text');
        this.transcribeBtn = document.getElementById('upload-transcribe-btn');
        this.cancelBtn = document.getElementById('upload-cancel-btn');
        this.recentList = document.getElementById('upload-recent-list');

        this.init();
    }

    init() {
        // File input change handler
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        // Transcribe button
        this.transcribeBtn.addEventListener('click', () => this.startTranscription());

        // Cancel button
        this.cancelBtn.addEventListener('click', () => this.cancelTranscription());

        // Load recent uploads
        this.loadRecentUploads();

        console.info('[FileUpload] Handler initialized');
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) {
            this.currentFile = null;
            this.fileInfo.classList.add('hidden');
            this.transcribeBtn.disabled = true;
            return;
        }

        // Validate file
        const validation = this.validateFile(file);
        if (!validation.valid) {
            alert(`Invalid file: ${validation.error}`);
            this.fileInput.value = '';
            return;
        }

        this.currentFile = file;
        this.displayFileInfo(file);
        this.transcribeBtn.disabled = false;

        console.info('[FileUpload] File selected:', file.name, file.size, file.type);
    }

    validateFile(file) {
        // Check file size (max 500MB)
        const MAX_SIZE = 500 * 1024 * 1024; // 500MB
        const WARN_SIZE = 400 * 1024 * 1024; // 400MB - show warning

        if (file.size > MAX_SIZE) {
            return { valid: false, error: 'File too large (max 500MB)' };
        }

        // Warn for large files
        if (file.size > WARN_SIZE) {
            const sizeMB = (file.size / 1024 / 1024).toFixed(0);
            const estimatedTime = Math.ceil(file.size / (50 * 1024 * 1024)); // ~50MB/min
            const warning = `⚠️ Large file (${sizeMB}MB)\n\nUpload may take ${estimatedTime}+ minutes.\n\nContinue?`;

            if (!confirm(warning)) {
                return { valid: false, error: 'Upload cancelled by user' };
            }
        }

        // Check file type
        const validTypes = [
            'audio/mpeg', 'audio/mp3',
            'video/mp4',
            'audio/wav', 'audio/wave', 'audio/x-wav',
            'audio/mp4', 'audio/x-m4a',
            'video/webm', 'audio/webm',
            'audio/ogg',
            'audio/flac'
        ];

        const validExtensions = ['.mp3', '.mp4', '.wav', '.m4a', '.webm', '.ogg', '.flac'];
        const hasValidType = validTypes.includes(file.type);
        const hasValidExt = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

        if (!hasValidType && !hasValidExt) {
            return { valid: false, error: 'Unsupported file format' };
        }

        return { valid: true };
    }

    displayFileInfo(file) {
        this.fileName.textContent = file.name;
        this.fileSize.textContent = this.formatFileSize(file.size);
        this.fileType.textContent = this.getFileCategory(file);
        this.fileInfo.classList.remove('hidden');
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    }

    getFileCategory(file) {
        if (file.type.startsWith('video/')) return 'Video (Audio will be extracted)';
        if (file.type.startsWith('audio/')) return 'Audio';
        if (file.name.toLowerCase().endsWith('.mp4')) return 'Video (Audio will be extracted)';
        return 'Audio';
    }

    async startTranscription() {
        if (!this.currentFile || this.isProcessing) return;

        this.isProcessing = true;
        this.abortController = new AbortController();

        // UI updates
        this.transcribeBtn.disabled = true;
        this.cancelBtn.disabled = false;
        this.fileInput.disabled = true;
        this.progressSection.classList.remove('hidden');
        this.updateProgress(0, 'Preparing file...');

        try {
            // Get API settings (including advanced settings)
            this.updateProgress(5, 'Getting API settings...');
            const settings = await this.getApiSettings();

            // Store settings for later use in convertToYouTubeFormat
            this.currentSettings = settings;

            // Create FormData with file and ALL settings (including Advanced settings)
            this.updateProgress(10, 'Uploading to server...');
            const formData = new FormData();
            formData.append('file', this.currentFile);
            formData.append('groqApiKey', settings.groqApiKey);
            formData.append('groqModel', settings.groqModel);
            formData.append('language', settings.language);
            formData.append('temperature', settings.temperature);
            formData.append('responseFormat', settings.responseFormat);
            formData.append('prompt', settings.prompt); // Model prompting
            formData.append('useWordTimestamps', settings.useWordTimestamps.toString()); // Word-level timestamps

            console.info('[FileUpload] Sending file to server for processing...');
            console.info('[FileUpload] Using Advanced settings:', {
                model: settings.groqModel,
                language: settings.language,
                temperature: settings.temperature,
                responseFormat: settings.responseFormat,
                prompt: settings.prompt ? `"${settings.prompt.substring(0, 50)}..."` : '(none)',
                useWordTimestamps: settings.useWordTimestamps,
                wordsPerLine: settings.wordsPerLine,
                maxLineLength: settings.maxLineLength
            });

            // Send to server for ffmpeg processing + transcription with retry logic
            this.updateProgress(20, 'Processing audio (ffmpeg MP3 conversion)...');

            const result = await this.uploadWithRetry(formData, 3);

            console.info('[FileUpload] Server response:', result);
            console.info(`[FileUpload] Audio size: ${(result.audioSize / 1024 / 1024).toFixed(2)}MB, Duration: ${result.duration.toFixed(2)}s`);

            // Convert to YouTube format for consistency
            this.updateProgress(85, 'Converting to standard format...');
            const youtubeFormat = await this.convertToYouTubeFormat(result.transcript);

            // Save transcript
            this.updateProgress(90, 'Saving transcript...');
            await this.saveTranscript(youtubeFormat, this.currentFile.name);

            this.updateProgress(100, 'Complete!');
            this.showSuccess('Transcription completed successfully!');

            // Reset UI after 2 seconds
            setTimeout(() => this.resetUI(), 2000);

        } catch (error) {
            console.error('[FileUpload] Transcription failed:', error);

            // Provide user-friendly error messages
            let errorMsg = error.message || 'Transcription failed';
            if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
                errorMsg = 'Server not reachable. Please ensure:\n1. Buttercup server is running\n2. Server address is http://127.0.0.1:8675\n3. No firewall is blocking the connection';
            } else if (errorMsg.includes('aborted')) {
                errorMsg = 'Upload cancelled by user';
            }

            this.showError(errorMsg);
            this.resetUI();
        }
    }

    async uploadWithRetry(formData, maxRetries = 3) {
        let lastError;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                this.updateProgress(20 + (attempt * 5), `Uploading... (Attempt ${attempt + 1}/${maxRetries + 1})`);

                const response = await fetch('http://127.0.0.1:8675/api/upload-transcribe', {
                    method: 'POST',
                    body: formData,
                    signal: this.abortController.signal
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || `Server error: ${response.status}`);
                }

                this.updateProgress(80, 'Receiving transcript...');
                const result = await response.json();

                if (!result.success) {
                    throw new Error(result.error || 'Transcription failed');
                }

                return result;

            } catch (error) {
                lastError = error;

                // Don't retry if cancelled by user
                if (error.name === 'AbortError' || error.message.includes('aborted')) {
                    throw error;
                }

                // Don't retry on server errors (4xx)
                if (error.message.includes('400') || error.message.includes('422')) {
                    throw error;
                }

                // If this was the last attempt, throw
                if (attempt === maxRetries) {
                    console.error('[FileUpload] Max retries reached');
                    throw error;
                }

                // Wait before retrying (exponential backoff)
                const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
                console.warn(`[FileUpload] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
                this.updateProgress(20 + (attempt * 5), `Network error, retrying in ${delay/1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError;
    }

    async convertToYouTubeFormat(transcript) {
        // Convert Groq-style transcript to YouTube format
        // Supports both word-level and segment-level timestamps
        // Uses Advanced settings (useWordTimestamps, wordsPerLine, maxLineLength)
        try {
            const settings = this.currentSettings || {};
            const useWordTimestamps = settings.useWordTimestamps !== false;
            const wordsPerLine = settings.wordsPerLine || 16;
            const maxLineLength = settings.maxLineLength !== undefined ? settings.maxLineLength : 6;

            console.info('[FileUpload] Converting to YouTube format with settings:', {
                useWordTimestamps,
                wordsPerLine,
                maxLineLength
            });

            const jsonSubtitles = { events: [] };

            // Insert newlines after specified number of words
            function insertNewlines(text, maxLen) {
                // If maxLineLength is 0, don't insert any newlines
                if (maxLen === 0) return text.trim();

                let newText = '';
                let wordCount = 0;
                text = text.trim();

                text.split(' ').forEach((word) => {
                    if (word === '') return; // Skip empty words

                    if (wordCount < maxLen) {
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
            if (useWordTimestamps && transcript.words && transcript.words.length > 0) {
                console.info('[FileUpload] Using word-level timestamps');
                const words = transcript.words;
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
                            lineText = insertNewlines(lineText, maxLineLength);
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
                        lineText = insertNewlines(lineText, maxLineLength);
                    }

                    jsonSubtitles.events.push({
                        tStartMs: Math.round(lineStartTime * 1000),
                        dDurationMs: Math.round((lineEndTime - lineStartTime) * 1000),
                        segs: [{ utf8: lineText }]
                    });
                }
            }
            // Fall back to segment-level timestamps
            else if (transcript.segments && transcript.segments.length > 0) {
                console.info('[FileUpload] Using segment-level timestamps');
                transcript.segments.forEach(segment => {
                    const startTimeMs = Math.round(segment.start * 1000);
                    const durationMs = Math.round((segment.end - segment.start) * 1000);
                    const text = insertNewlines(segment.text.trim(), maxLineLength);

                    jsonSubtitles.events.push({
                        tStartMs: startTimeMs,
                        dDurationMs: durationMs,
                        segs: [{ utf8: text }]
                    });
                });
            }

            // Validate that we have events
            if (jsonSubtitles.events.length === 0) {
                console.error('[FileUpload] No subtitle events generated!');
                throw new Error('No subtitle events generated from transcription response');
            }

            console.info('[FileUpload] Successfully generated', jsonSubtitles.events.length, 'subtitle events');
            return jsonSubtitles;
        } catch (error) {
            console.error('[FileUpload] Error converting to YouTube format:', error);
            throw error;
        }
    }

    // ==================================================================
    // NOTE: Audio/video processing now handled server-side using ffmpeg
    // This provides:
    // - Compressed MP3 output (~1MB/min vs 10MB/min WAV)
    // - Single API call for most videos (< 3 hours @ 128kbps = < 24MB)
    // - No browser memory issues with large files
    // - Faster processing with native ffmpeg
    // ==================================================================

    async saveTranscript(youtubeFormat, fileName) {
        // Generate unique ID for uploaded file
        const fileId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Generate SRT from YouTube format events
        const srtData = this.generateSRT(youtubeFormat.events || []);

        // Save to storage with YouTube format structure
        const transcriptData = {
            videoId: fileId,
            videoTitle: fileName,
            srtData: srtData,
            captionData: youtubeFormat, // Now uses same format as YouTube videos
            timestamp: Date.now(),
            source: 'local_upload',
            fileName: fileName
        };

        await new Promise((resolve, reject) => {
            chrome.storage.local.get(['buttercup_transcripts'], (result) => {
                const transcripts = result.buttercup_transcripts || {};
                transcripts[fileId] = transcriptData;

                chrome.storage.local.set({ buttercup_transcripts: transcripts }, () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve();
                    }
                });
            });
        });

        // Update recent uploads list
        this.loadRecentUploads();

        console.info('[FileUpload] Transcript saved:', fileId);
    }

    generateSRT(events) {
        let srt = '';
        let counter = 1;

        for (const event of events) {
            const startTime = this.formatSRTTime(event.tStartMs);
            const endTime = this.formatSRTTime(event.tStartMs + event.dDurationMs);
            const text = event.segs.map(seg => seg.utf8).join('');

            srt += `${counter}\n${startTime} --> ${endTime}\n${text}\n\n`;
            counter++;
        }

        return srt;
    }

    formatSRTTime(ms) {
        const seconds = Math.floor(ms / 1000);
        const milliseconds = ms % 1000;
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
    }

    async getApiSettings() {
        return new Promise((resolve) => {
            chrome.storage.sync.get([
                'buttercup_groq_api_key',
                'buttercup_groq_model',
                'buttercup_language',
                'buttercup_temperature',
                'buttercup_response_format',
                'buttercup_prompt',
                'buttercup_use_word_timestamps',
                'buttercup_words_per_line',
                'buttercup_max_line_length'
            ], (result) => {
                resolve({
                    groqApiKey: result.buttercup_groq_api_key || '',
                    groqModel: result.buttercup_groq_model || 'whisper-large-v3',
                    language: result.buttercup_language || 'auto',
                    temperature: result.buttercup_temperature !== undefined ? result.buttercup_temperature : 0,
                    responseFormat: result.buttercup_response_format || 'verbose_json',
                    prompt: result.buttercup_prompt || '',
                    useWordTimestamps: result.buttercup_use_word_timestamps !== false,
                    wordsPerLine: result.buttercup_words_per_line || 16,
                    maxLineLength: result.buttercup_max_line_length !== undefined ? result.buttercup_max_line_length : 6
                });
            });
        });
    }

    loadRecentUploads() {
        chrome.storage.local.get(['buttercup_transcripts'], (result) => {
            const transcripts = result.buttercup_transcripts || {};

            // Filter uploaded files only
            const uploads = Object.entries(transcripts)
                .filter(([id, data]) => data.source === 'local_upload')
                .sort((a, b) => b[1].timestamp - a[1].timestamp)
                .slice(0, 5); // Show latest 5

            if (uploads.length === 0) {
                this.recentList.innerHTML = '<p class="text-sm text-center text-gray-500">No uploads yet</p>';
                return;
            }

            this.recentList.innerHTML = uploads.map(([id, data]) => `
                <div class="bg-base-200 p-2 rounded flex justify-between items-center">
                    <div class="flex-1">
                        <p class="text-sm font-bold">${data.fileName || data.videoTitle}</p>
                        <p class="text-xs text-gray-500">${new Date(data.timestamp).toLocaleString()}</p>
                    </div>
                    <button class="btn btn-xs btn-primary view-transcript-btn" data-transcript-id="${id}">View Transcript</button>
                </div>
            `).join('');

            // Add event listeners to all View buttons (CSP-compliant)
            this.recentList.querySelectorAll('.view-transcript-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const transcriptId = e.target.dataset.transcriptId;
                    if (transcriptId && window.openTranscript) {
                        window.openTranscript(transcriptId);
                    }
                });
            });
        });
    }

    updateProgress(percent, status) {
        this.progressBar.value = percent;
        this.progressText.textContent = `${Math.round(percent)}%`;
        this.statusText.textContent = status;
    }

    showSuccess(message) {
        this.statusText.textContent = message;
        this.statusText.classList.add('text-success');
    }

    showError(message) {
        this.statusText.textContent = `Error: ${message}`;
        this.statusText.classList.add('text-error');
    }

    cancelTranscription() {
        if (this.abortController) {
            this.abortController.abort();
        }
        this.resetUI();
    }

    resetUI() {
        this.isProcessing = false;
        this.abortController = null;
        this.transcribeBtn.disabled = !this.currentFile;
        this.cancelBtn.disabled = true;
        this.fileInput.disabled = false;
        this.progressSection.classList.add('hidden');
        this.progressBar.value = 0;
        this.progressText.textContent = '0%';
        this.statusText.textContent = 'Initializing...';
        this.statusText.classList.remove('text-success', 'text-error');
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.fileUploadHandler = new FileUploadHandler();
    });
} else {
    window.fileUploadHandler = new FileUploadHandler();
}

// Helper function for viewing transcripts
window.openTranscript = function(videoId) {
    chrome.storage.local.get(['buttercup_transcripts'], (result) => {
        const transcripts = result.buttercup_transcripts || {};
        const transcript = transcripts[videoId];

        if (!transcript) {
            console.error('[FileUpload] Transcript not found:', videoId);
            return;
        }

        // Get modal elements
        const modal = document.getElementById('upload-transcript-modal');
        const titleSpan = document.getElementById('upload-transcript-title');
        const contentTextarea = document.getElementById('upload-transcript-content');
        const copyBtn = document.getElementById('copy-upload-transcript');
        const closeBtn = document.getElementById('close-upload-transcript');

        // Set content
        titleSpan.textContent = transcript.fileName || transcript.videoTitle || 'Transcript';
        contentTextarea.value = transcript.srtData || 'No SRT data available';

        // Copy button handler
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(transcript.srtData).then(() => {
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = '✓ Copied!';
                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                }, 2000);
            });
        };

        // Close button handler
        closeBtn.onclick = () => modal.close();

        // Show modal
        modal.showModal();
    });
};

console.info('[FileUpload] Module loaded');
