/**
 * Batch Processing UI Component
 * User interface for managing batch video processing
 */

class BatchUI {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.videos = { pending: [], processing: [], completed: [], failed: [] };
        this.stats = {};
        this.isRunning = false;
        this.isPaused = false;

        this.init();
    }

    async init() {
        if (!this.container) {
            console.error('[BatchUI] Container not found');
            return;
        }

        this.createUI();
        await this.loadBatchState();
        this.attachEventListeners();
        await this.loadSettings();
    }

    async loadSettings() {
        // Load skip existing setting
        const result = await chrome.storage.sync.get(['buttercup_batch_skip_existing']);
        const skipExistingCheckbox = document.getElementById('batch-skip-existing');
        if (skipExistingCheckbox) {
            // Default to true (checked) if not set
            skipExistingCheckbox.checked = result.buttercup_batch_skip_existing !== false;
        }
    }

    createUI() {
        this.container.innerHTML = `
            <div class="batch-ui-container" style="display: flex; flex-direction: column; gap: 12px;">
                <!-- Statistics -->
                <div class="stats shadow" style="display: grid; grid-template-columns: repeat(3, 1fr);">
                    <div class="stat place-items-center">
                        <div class="stat-title">Queued</div>
                        <div class="stat-value text-sm text-primary" id="batch-queued">0</div>
                    </div>
                    <div class="stat place-items-center">
                        <div class="stat-title">Completed</div>
                        <div class="stat-value text-sm text-success" id="batch-completed">0</div>
                    </div>
                    <div class="stat place-items-center">
                        <div class="stat-title">Failed</div>
                        <div class="stat-value text-sm text-error" id="batch-failed">0</div>
                    </div>
                </div>

                <!-- Add Videos Section -->
                <div class="form-control">
                    <label class="label">
                        <span class="label-text font-semibold">Add Videos to Batch</span>
                        <span class="label-text-alt text-success">✨ Playlists supported!</span>
                    </label>
                    <textarea id="batch-urls" class="textarea textarea-bordered h-20 text-xs"
                              placeholder="Paste video or playlist URLs (one per line)&#10;&#10;Videos: YouTube, Vimeo, Dailymotion, Twitter, TikTok...&#10;Playlists: YouTube playlists, Vimeo showcases...&#10;&#10;https://www.youtube.com/watch?v=...&#10;https://www.youtube.com/playlist?list=..."></textarea>

                    <label class="label cursor-pointer mt-2">
                        <span class="label-text">
                            <span class="font-medium">Skip already transcribed videos</span>
                            <span class="text-xs opacity-70 ml-1">(Saves API quota)</span>
                        </span>
                        <input type="checkbox" id="batch-skip-existing" class="toggle toggle-sm toggle-primary" checked />
                    </label>
                </div>

                <div class="grid grid-cols-2 gap-2">
                    <button id="batch-add" class="btn btn-sm btn-primary">
                        Add to Queue
                    </button>
                    <button id="batch-paste" class="btn btn-sm btn-outline">
                        Paste from Clipboard
                    </button>
                </div>

                <!-- Control Buttons -->
                <div class="grid grid-cols-2 gap-2">
                    <button id="batch-start" class="btn btn-sm btn-success" disabled>
                        ▶️ Start
                    </button>
                    <button id="batch-pause" class="btn btn-sm btn-warning" disabled>
                        ⏸️ Pause
                    </button>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <button id="batch-stop" class="btn btn-sm btn-error" disabled>
                        ⏹️ Stop
                    </button>
                    <button id="batch-restart-failed" class="btn btn-sm btn-warning btn-outline" disabled>
                        🔄 Retry Failed
                    </button>
                </div>
                <div class="grid grid-cols-1 gap-2">
                    <button id="batch-clear" class="btn btn-sm btn-error btn-outline">
                        🗑️ Clear All
                    </button>
                </div>

                <!-- Progress Info -->
                <div id="batch-progress-info" class="alert alert-info text-xs hidden">
                    <span id="batch-progress-text">Ready to process videos</span>
                </div>

                <!-- Video List -->
                <div class="divider my-0">Video Queue</div>
                <div id="batch-video-list" style="max-height: 300px; overflow-y: auto;
                     background: var(--fallback-b2,oklch(var(--b2)));
                     border-radius: 8px; padding: 8px;">
                    <div class="text-center text-sm opacity-50 py-4">
                        No videos in queue
                    </div>
                </div>
            </div>
        `;
    }

    async findVideoTab() {
        // First, check if active tab is a video page
        const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTabs[0] && activeTabs[0].url) {
            if (this.isVideoPageUrl(activeTabs[0].url)) {
                return activeTabs[0];
            }
        }

        // Otherwise, find any video tab from supported platforms
        const allTabs = await chrome.tabs.query({});
        for (const tab of allTabs) {
            if (tab.url && this.isVideoPageUrl(tab.url)) {
                return tab;
            }
        }

        return null;
    }

    // Legacy alias for backward compatibility
    async findYouTubeTab() {
        return this.findVideoTab();
    }

    // Check if URL is a video page - UNIVERSAL approach
    // Accept ANY http/https URL - yt-dlp supports 1000+ sites
    isVideoPageUrl(url) {
        if (!url) return false;

        // Only exclude obvious non-video URLs
        const excludedPatterns = [
            'chrome://',
            'chrome-extension://',
            'about:',
            'file://',
            'data:',
            'javascript:',
            'mailto:'
        ];

        for (const pattern of excludedPatterns) {
            if (url.startsWith(pattern)) {
                return false;
            }
        }

        // Accept any http/https URL
        return url.startsWith('http://') || url.startsWith('https://');
    }

    attachEventListeners() {
        // Add videos button
        const addBtn = document.getElementById('batch-add');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.addVideos());
        }

        // Paste from clipboard button
        const pasteBtn = document.getElementById('batch-paste');
        if (pasteBtn) {
            pasteBtn.addEventListener('click', () => this.pasteFromClipboard());
        }

        // Start button
        const startBtn = document.getElementById('batch-start');
        if (startBtn) {
            startBtn.addEventListener('click', () => this.start());
        }

        // Pause button
        const pauseBtn = document.getElementById('batch-pause');
        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => this.togglePause());
        }

        // Stop button
        const stopBtn = document.getElementById('batch-stop');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stop());
        }

        // Restart Failed button
        const restartFailedBtn = document.getElementById('batch-restart-failed');
        if (restartFailedBtn) {
            restartFailedBtn.addEventListener('click', () => this.restartFailed());
        }

        // Clear button
        const clearBtn = document.getElementById('batch-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearAll());
        }

        // Skip existing checkbox - save preference when changed
        const skipExistingCheckbox = document.getElementById('batch-skip-existing');
        if (skipExistingCheckbox) {
            skipExistingCheckbox.addEventListener('change', () => {
                chrome.storage.sync.set({
                    buttercup_batch_skip_existing: skipExistingCheckbox.checked
                });
                console.log('[BatchUI] Skip existing transcripts:', skipExistingCheckbox.checked);
            });
        }

        // Listen for batch updates from content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                // Poll for updates every second
                this.updateInterval = setInterval(() => {
                    this.loadBatchState();
                }, 1000);
            }
        });
    }

    async addVideos() {
        const textarea = document.getElementById('batch-urls');
        const urls = textarea.value
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        if (urls.length === 0) {
            this.showAlert('Please enter at least one video URL', 'warning');
            return;
        }

        // Check for playlist URLs
        const playlistUrls = urls.filter(url => this.isPlaylistUrl(url));
        const videoUrls = urls.filter(url => !this.isPlaylistUrl(url));

        // Extract videos from playlists
        const allVideoUrls = [...videoUrls];
        if (playlistUrls.length > 0) {
            this.showAlert(`Extracting ${playlistUrls.length} playlist(s)...`, 'info');

            for (const playlistUrl of playlistUrls) {
                try {
                    const playlist = await this.extractPlaylistVideos(playlistUrl);
                    console.log(`[BatchUI] ✓ Extracted ${playlist.videoCount} videos from "${playlist.title}"`);

                    // Add all videos from playlist
                    for (const video of playlist.videos) {
                        allVideoUrls.push(video.url);
                    }

                    this.showAlert(`✓ Extracted ${playlist.videoCount} videos from "${playlist.title}"`, 'success');
                } catch (error) {
                    console.error('[BatchUI] Failed to extract playlist:', error);
                    this.showAlert(`Failed to extract playlist: ${error.message}`, 'error');
                }
            }
        }

        if (allVideoUrls.length === 0) {
            this.showAlert('No valid video URLs found', 'warning');
            return;
        }

        console.log(`[BatchUI] Total videos to add: ${allVideoUrls.length} (${videoUrls.length} direct + ${allVideoUrls.length - videoUrls.length} from playlists)`);


        // Load translation settings from sync storage
        const translationSettings = await new Promise((resolve) => {
            chrome.storage.sync.get([
                'buttercup_llm_translation_enabled',
                'buttercup_llm_target_language',
                'buttercup_llm_provider',
                'buttercup_llm_api_key',
                'buttercup_llm_model'
            ], (result) => {
                resolve({
                    translate: result.buttercup_llm_translation_enabled === true,
                    targetLanguage: result.buttercup_llm_target_language || 'English',
                    provider: result.buttercup_llm_provider || 'openai',
                    apiKey: result.buttercup_llm_api_key || '',
                    model: result.buttercup_llm_model || ''
                });
            });
        });

        console.log('[BatchUI] Using translation settings:', {
            translate: translationSettings.translate,
            targetLanguage: translationSettings.targetLanguage,
            provider: translationSettings.provider,
            hasApiKey: !!translationSettings.apiKey,
            model: translationSettings.model
        });

        // Extract video IDs directly in popup context
        const videos = [];
        let skippedCount = 0;

        console.log(`[BatchUI] Processing ${allVideoUrls.length} video URLs...`);

        for (const url of allVideoUrls) {
            console.log('[BatchUI] Processing URL:', url);
            const videoId = this.extractVideoId(url);

            if (videoId) {
                // Fetch video title immediately (popup context has better CORS support)
                const platform = this.getPlatformFromUrl(url);
                console.log(`[BatchUI] ✓ Extracted video ID: ${videoId} (${platform})`);

                const videoTitle = await this.fetchVideoTitle(url, videoId);
                console.log('[BatchUI] ✓ Fetched title:', videoTitle);

                videos.push({
                    videoId: videoId,
                    url: url,
                    title: videoTitle,
                    platform: platform,
                    status: 'pending',
                    progress: 0,
                    currentStep: '',
                    options: {
                        translate: translationSettings.translate,
                        targetLanguage: translationSettings.targetLanguage,
                        provider: translationSettings.provider,
                        llmApiKey: translationSettings.apiKey,
                        llmModel: translationSettings.model
                    },
                    addedAt: Date.now(),
                    startedAt: null,
                    completedAt: null,
                    error: null,
                    result: null,
                    retries: 0,
                    maxRetries: 2
                });
            } else {
                skippedCount++;
                console.warn('[BatchUI] ✗ Failed to extract video ID from URL:', url);
            }
        }

        console.log(`[BatchUI] Processed: ${videos.length} valid, ${skippedCount} skipped`);

        if (videos.length === 0) {
            this.showAlert(`No valid video URLs found (${skippedCount} URLs could not be processed)`, 'error');
            return;
        }

        // Check if we should skip already transcribed videos
        const skipExistingCheckbox = document.getElementById('batch-skip-existing');
        const skipExisting = skipExistingCheckbox ? skipExistingCheckbox.checked : false;

        // Load existing batch state and transcripts
        const storageData = await chrome.storage.local.get(['buttercup_batch_processor', 'buttercup_transcripts']);
        const batchState = storageData.buttercup_batch_processor || {
            queue: [],
            completed: [],
            failed: [],
            stats: {
                totalVideos: 0,
                completedVideos: 0,
                failedVideos: 0,
                totalDuration: 0,
                averageDuration: 0,
                startTime: null,
                endTime: null
            },
            isRunning: false,
            isPaused: false
        };

        const existingTranscripts = storageData.buttercup_transcripts || {};

        // Check for duplicates and add new videos
        let addedCount = 0;
        let skippedExistingCount = 0;
        let skippedDuplicateCount = 0;

        for (const video of videos) {
            // Check if already in current batch
            const inBatch = batchState.queue.some(v => v.videoId === video.videoId) ||
                           batchState.completed.some(v => v.videoId === video.videoId) ||
                           batchState.failed.some(v => v.videoId === video.videoId);

            if (inBatch) {
                skippedDuplicateCount++;
                console.log(`[BatchUI] ⏭️  Skipped (already in batch): ${video.videoId}`);
                continue;
            }

            // Check if already transcribed (if skip option enabled)
            if (skipExisting && existingTranscripts[video.videoId]) {
                skippedExistingCount++;
                console.log(`[BatchUI] ⏭️  Skipped (already transcribed): ${video.videoId} - "${video.title}"`);
                continue;
            }

            // Add to queue
            batchState.queue.push(video);
            addedCount++;
            console.log(`[BatchUI] ✅ Added to queue: ${video.videoId} - "${video.title}"`);
        }

        // Update stats
        batchState.stats.totalVideos = batchState.queue.length + batchState.completed.length + batchState.failed.length;

        // Save back to storage
        await chrome.storage.local.set({ buttercup_batch_processor: batchState });

        // Show comprehensive feedback
        const messages = [];
        if (addedCount > 0) messages.push(`✅ ${addedCount} added`);
        if (skippedExistingCount > 0) messages.push(`⏭️  ${skippedExistingCount} skipped (already transcribed)`);
        if (skippedDuplicateCount > 0) messages.push(`🔄 ${skippedDuplicateCount} skipped (duplicate)`);

        if (messages.length > 0) {
            const alertType = addedCount > 0 ? 'success' : 'info';
            this.showAlert(messages.join(' • '), alertType);
        }

        if (addedCount > 0) {
            textarea.value = '';
            await this.loadBatchState();
        } else if (messages.length === 0) {
            // No videos were processed at all
            this.showAlert('No videos could be added to queue', 'warning');
        }
    }

    // Check if URL is a playlist
    isPlaylistUrl(url) {
        // YouTube playlist
        if (url.includes('youtube.com/playlist?list=') || url.includes('list=')) {
            return true;
        }

        // Vimeo showcase/channel
        if (url.match(/vimeo\.com\/(?:showcase|channels)\//)) {
            return true;
        }

        // Dailymotion playlist
        if (url.includes('dailymotion.com/playlist/')) {
            return true;
        }

        return false;
    }

    // Extract all videos from a playlist
    async extractPlaylistVideos(playlistUrl) {
        try {
            console.log('[BatchUI] 📋 Extracting playlist:', playlistUrl);

            const serverUrl = 'http://127.0.0.1:8675';
            const response = await fetch(`${serverUrl}/extract-playlist?url=${encodeURIComponent(playlistUrl)}`);

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to extract playlist');
            }

            const data = await response.json();
            console.log('[BatchUI] ✓ Server response:', data);

            const videos = data.videos.map(v => {
                console.log('[BatchUI] Video from playlist:', {
                    url: v.url,
                    title: v.title,
                    id: v.id
                });
                return {
                    url: v.url,
                    title: v.title,
                    duration: v.duration,
                    videoId: v.id
                };
            });

            console.log(`[BatchUI] ✓ Playlist extracted: "${data.playlist_title}" (${videos.length} videos)`);

            return {
                title: data.playlist_title,
                platform: data.platform,
                videoCount: data.video_count,
                videos: videos
            };

        } catch (error) {
            console.error('[BatchUI] ❌ Playlist extraction failed:', error);
            throw error;
        }
    }

    // Extract video ID from URL - supports multiple platforms
    extractVideoId(url) {
        // YouTube patterns
        const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]+)/);
        if (youtubeMatch) return youtubeMatch[1];

        // Direct YouTube video ID
        if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;

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

        // Fallback: generate hash from URL for any other site
        if (url.startsWith('http')) {
            let hash = 0;
            for (let i = 0; i < url.length; i++) {
                hash = ((hash << 5) - hash) + url.charCodeAt(i);
                hash = hash & hash;
            }
            return Math.abs(hash).toString(36);
        }

        return null;
    }

    // Get platform name from URL
    // Get platform name from URL - UNIVERSAL approach
    getPlatformFromUrl(url) {
        if (!url) return 'Video';

        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;

            // Map common hostnames to friendly names
            const knownPlatforms = {
                'youtube.com': 'YouTube', 'www.youtube.com': 'YouTube', 'youtu.be': 'YouTube',
                'vimeo.com': 'Vimeo', 'www.vimeo.com': 'Vimeo',
                'dailymotion.com': 'Dailymotion', 'www.dailymotion.com': 'Dailymotion', 'dai.ly': 'Dailymotion',
                'twitter.com': 'Twitter', 'x.com': 'X',
                'tiktok.com': 'TikTok', 'www.tiktok.com': 'TikTok',
                'instagram.com': 'Instagram', 'www.instagram.com': 'Instagram',
                'facebook.com': 'Facebook', 'www.facebook.com': 'Facebook', 'fb.watch': 'Facebook',
                'twitch.tv': 'Twitch', 'www.twitch.tv': 'Twitch'
            };

            if (knownPlatforms[hostname]) {
                return knownPlatforms[hostname];
            }

            // For unknown platforms, capitalize hostname
            let cleanHost = hostname.replace(/^www\./, '');
            const parts = cleanHost.split('.');
            return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
        } catch (e) {
            return 'Video';
        }
    }

    // Fetch video title - supports multiple platforms
    async fetchVideoTitle(url, videoId) {
        const platform = this.getPlatformFromUrl(url);

        try {
            // YouTube oEmbed
            if (platform === 'YouTube') {
                const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
                const response = await fetch(oembedUrl);
                if (response.ok) {
                    const data = await response.json();
                    return data.title;
                }
            }

            // Vimeo oEmbed
            if (platform === 'Vimeo') {
                const oembedUrl = `https://vimeo.com/api/oembed.json?url=https://vimeo.com/${videoId}`;
                const response = await fetch(oembedUrl);
                if (response.ok) {
                    const data = await response.json();
                    return data.title;
                }
            }

            // For other platforms, use URL as title fallback
            console.log(`[BatchUI] Using fallback title for ${platform}`);
        } catch (err) {
            console.warn(`[BatchUI] Could not fetch title for ${platform}:`, err.message);
        }

        return `${platform} Video ${videoId}`;
    }

    async pasteFromClipboard() {
        const textarea = document.getElementById('batch-urls');

        // Focus the textarea
        textarea.focus();

        try {
            // Try navigator.clipboard API
            const text = await navigator.clipboard.readText();
            if (text) {
                // Append to existing content or replace
                if (textarea.value.trim()) {
                    textarea.value += '\n' + text;
                } else {
                    textarea.value = text;
                }
                this.showAlert('Pasted from clipboard', 'success');
            }
        } catch (error) {
            // If clipboard API fails, show instruction
            console.log('[BatchUI] Clipboard API access denied:', error.message);
            this.showAlert('Focused field - now press Ctrl+V (or Cmd+V) to paste', 'info');
        }
    }

    async start() {
        // Load batch state first
        const result = await chrome.storage.local.get(['buttercup_batch_processor']);
        const batchState = result.buttercup_batch_processor;

        if (!batchState || batchState.queue.length === 0) {
            this.showAlert('No videos in queue to process', 'warning');
            return;
        }

        const youtubeTab = await this.findYouTubeTab();
        if (!youtubeTab) {
            this.showAlert('Please open any web page (e.g., google.com) to start batch processing', 'warning');
            return;
        }

        // Set running state in storage first
        batchState.isRunning = true;
        batchState.isPaused = false;
        await chrome.storage.local.set({ buttercup_batch_processor: batchState });

        try {
            // Check if extension context is still valid
            if (!chrome.runtime || !chrome.runtime.id) {
                throw new Error('Extension context invalidated - please reload the extension');
            }

            // Test if content script is loaded by sending message
            try {
                await chrome.tabs.sendMessage(youtubeTab.id, {
                    type: 'BATCH_COMMAND',
                    command: 'start'
                });
            } catch (pingError) {
                // Content script not loaded - reload the tab and try again
                console.log('[BatchUI] Content script not ready, reloading tab...');
                await chrome.tabs.reload(youtubeTab.id);
                // Wait for page to load
                await new Promise(resolve => setTimeout(resolve, 2000));
                // Try again
                await chrome.tabs.sendMessage(youtubeTab.id, {
                    type: 'BATCH_COMMAND',
                    command: 'start'
                });
            }

            this.showAlert('Batch processing started', 'success');
        } catch (error) {
            console.error('[BatchUI] Failed to start batch processing:', error);

            // Provide helpful error message
            let errorMsg = 'Failed to start. ';
            if (error.message.includes('Receiving end does not exist')) {
                errorMsg += 'Please open a regular web page (e.g., google.com), wait for it to load, then try again.';
            } else {
                errorMsg += error.message;
            }

            this.showAlert(errorMsg, 'error');
            // Reset running state
            batchState.isRunning = false;
            if (chrome.storage && chrome.storage.local) {
                await chrome.storage.local.set({ buttercup_batch_processor: batchState });
            }
        }

        await this.loadBatchState();
    }

    async togglePause() {
        const youtubeTab = await this.findYouTubeTab();
        if (!youtubeTab) {
            this.showAlert('Please open a YouTube tab first', 'warning');
            return;
        }

        const action = this.isPaused ? 'resume' : 'pause';

        try {
            // Use message passing instead of executeScript
            await chrome.tabs.sendMessage(youtubeTab.id, {
                type: 'BATCH_COMMAND',
                command: action
            });
        } catch (error) {
            console.error('[BatchUI] Failed to toggle pause:', error);
            this.showAlert(`Failed to ${action}: ${error.message}`, 'error');
        }

        await this.loadBatchState();
    }

    async stop() {
        const youtubeTab = await this.findYouTubeTab();
        if (!youtubeTab) {
            this.showAlert('Please open a web page first', 'warning');
            return;
        }

        try {
            // Use message passing to send stop command
            await chrome.tabs.sendMessage(youtubeTab.id, {
                type: 'BATCH_COMMAND',
                command: 'stop'
            });

            this.showAlert('Batch processing stopped', 'info');
        } catch (error) {
            console.error('[BatchUI] Failed to stop:', error);
            this.showAlert(`Failed to stop: ${error.message}`, 'error');
        }

        await this.loadBatchState();
    }

    async restartFailed() {
        try {
            // Load current batch state
            const result = await chrome.storage.local.get(['buttercup_batch_processor']);
            const batchState = result.buttercup_batch_processor;

            if (!batchState || batchState.failed.length === 0) {
                this.showAlert('No failed videos to restart', 'info');
                return;
            }

            const failedCount = batchState.failed.length;

            // Confirm with user
            if (!confirm(`Restart ${failedCount} failed video(s)? They will be moved back to the queue and retried.`)) {
                return;
            }

            // Reset each failed video
            const resetVideos = batchState.failed.map(video => ({
                ...video,
                status: 'pending',
                error: null,
                retries: 0,  // Reset retry counter
                progress: 0,
                currentStep: '',
                startedAt: null,
                completedAt: null
            }));

            // Move failed videos back to queue
            batchState.queue.push(...resetVideos);
            batchState.failed = [];

            // Update stats
            batchState.stats.totalVideos = batchState.queue.length + batchState.completed.length;
            batchState.stats.failedVideos = 0;

            // Save updated state
            await chrome.storage.local.set({ buttercup_batch_processor: batchState });

            // Notify content script to reload state and start processing
            const tabs = await chrome.tabs.query({ url: "*://*.youtube.com/*" });
            for (const tab of tabs) {
                try {
                    // First reload the state
                    await chrome.tabs.sendMessage(tab.id, {
                        type: 'BATCH_COMMAND',
                        command: 'reload'
                    });

                    // Then start the batch processor
                    await chrome.tabs.sendMessage(tab.id, {
                        type: 'BATCH_COMMAND',
                        command: 'start'
                    });
                } catch (err) {
                    console.log('[BatchUI] Could not notify tab:', err);
                }
            }

            await this.loadBatchState();
            this.showAlert(`Restarted ${failedCount} failed video(s) - batch processing started`, 'success');
        } catch (error) {
            console.error('[BatchUI] Failed to restart failed videos:', error);
            this.showAlert(`Failed to restart: ${error.message}`, 'error');
        }
    }

    async clearAll() {
        if (!confirm('Are you sure you want to clear all videos? This cannot be undone.')) {
            return;
        }

        // Clear directly in storage since we're in popup context
        const emptyState = {
            queue: [],
            completed: [],
            failed: [],
            stats: {
                totalVideos: 0,
                completedVideos: 0,
                failedVideos: 0,
                totalDuration: 0,
                averageDuration: 0,
                startTime: null,
                endTime: null
            },
            isRunning: false,
            isPaused: false
        };

        await chrome.storage.local.set({ buttercup_batch_processor: emptyState });

        // Also notify any YouTube tabs to update their batch processor
        const tabs = await chrome.tabs.query({ url: "*://*.youtube.com/*" });
        for (const tab of tabs) {
            try {
                // Use message passing instead of executeScript
                await chrome.tabs.sendMessage(tab.id, {
                    type: 'BATCH_COMMAND',
                    command: 'reload'
                });
            } catch (err) {
                console.log('[BatchUI] Could not notify tab:', err);
            }
        }

        await this.loadBatchState();
        this.showAlert('Cleared all videos', 'success');
    }

    async loadBatchState() {
        try {
            const result = await chrome.storage.local.get(['buttercup_batch_processor']);
            const saved = result.buttercup_batch_processor;

            if (saved) {
                this.videos = {
                    pending: saved.queue || [],
                    processing: saved.currentlyProcessing || [],
                    completed: saved.completed || [],
                    failed: saved.failed || []
                };

                this.stats = saved.stats || {};
                this.isRunning = saved.isRunning || false;
                this.isPaused = saved.isPaused || false;

                this.updateUI();
            }
        } catch (error) {
            console.error('[BatchUI] Failed to load batch state:', error);
        }
    }

    updateUI() {
        // Update statistics
        const queuedEl = document.getElementById('batch-queued');
        const completedEl = document.getElementById('batch-completed');
        const failedEl = document.getElementById('batch-failed');

        if (queuedEl) queuedEl.textContent = this.videos.pending.length + this.videos.processing.length;
        if (completedEl) completedEl.textContent = this.videos.completed.length;
        if (failedEl) failedEl.textContent = this.videos.failed.length;

        // Update buttons
        const startBtn = document.getElementById('batch-start');
        const pauseBtn = document.getElementById('batch-pause');
        const stopBtn = document.getElementById('batch-stop');
        const restartFailedBtn = document.getElementById('batch-restart-failed');

        const hasVideos = this.videos.pending.length > 0 || this.videos.processing.length > 0;
        const hasFailedVideos = this.videos.failed.length > 0;

        if (startBtn) {
            startBtn.disabled = !hasVideos || (this.isRunning && !this.isPaused);
            startBtn.textContent = this.isRunning && !this.isPaused ? '▶️ Running...' : '▶️ Start';
        }

        if (pauseBtn) {
            pauseBtn.disabled = !this.isRunning;
            pauseBtn.textContent = this.isPaused ? '▶️ Resume' : '⏸️ Pause';
        }

        if (stopBtn) {
            stopBtn.disabled = !this.isRunning;
        }

        if (restartFailedBtn) {
            restartFailedBtn.disabled = !hasFailedVideos || this.isRunning;
        }

        // Update progress info
        const progressInfo = document.getElementById('batch-progress-info');
        const progressText = document.getElementById('batch-progress-text');

        if (!progressInfo || !progressText) {
            // Elements not found, skip updating progress info
            this.displayVideos();
            return;
        }

        if (this.isRunning && !this.isPaused) {
            progressInfo.classList.remove('hidden');
            progressInfo.classList.remove('alert-info');
            progressInfo.classList.add('alert-success');
            progressText.textContent = `Processing... ${this.videos.completed.length} completed, ${this.videos.pending.length} pending`;
        } else if (this.isPaused) {
            progressInfo.classList.remove('hidden');
            progressInfo.classList.remove('alert-success');
            progressInfo.classList.add('alert-warning');
            progressText.textContent = 'Paused';
        } else if (hasVideos) {
            progressInfo.classList.remove('hidden');
            progressInfo.classList.remove('alert-warning');
            progressInfo.classList.add('alert-info');
            progressText.textContent = 'Ready to process videos';
        } else {
            progressInfo.classList.add('hidden');
        }

        // Update video list
        this.displayVideos();
    }

    displayVideos() {
        const listEl = document.getElementById('batch-video-list');
        if (!listEl) return;

        const allVideos = [
            ...this.videos.processing.map(v => ({ ...v, status: 'processing' })),
            ...this.videos.pending.map(v => ({ ...v, status: 'pending' })),
            ...this.videos.completed.map(v => ({ ...v, status: 'completed' })),
            ...this.videos.failed.map(v => ({ ...v, status: 'failed' }))
        ];

        if (allVideos.length === 0) {
            listEl.innerHTML = `
                <div class="text-center text-sm opacity-50 py-4">
                    No videos in queue
                </div>
            `;
            return;
        }

        listEl.innerHTML = allVideos.map(video => {
            const statusIcon = {
                pending: '[P]',
                processing: '[R]',
                completed: '[C]',
                failed: '[F]'
            }[video.status];

            const statusColor = {
                pending: '#868e96',
                processing: '#339af0',
                completed: '#51cf66',
                failed: '#ff6b6b'
            }[video.status];

            const progress = video.progress || 0;
            const currentStep = video.currentStep || '';

            return `
                <div class="video-item mb-2 p-2 rounded"
                     style="border-left: 3px solid ${statusColor};
                            background: var(--fallback-b1,oklch(var(--b1)));
                            font-size: 11px;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 4px;">
                        <div style="display: flex; gap: 6px; align-items: center; flex: 1;">
                            <span>${statusIcon}</span>
                            <span style="font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(video.title || video.videoId)}</span>
                        </div>
                        <a href="${video.url}" target="_blank" class="btn btn-xs btn-ghost" style="min-height: 18px; height: 18px; padding: 0 6px; font-size: 10px;" title="Open video">🔗</a>
                    </div>
                    ${video.status === 'processing' ? `
                        <div class="progress-bar" style="width: 100%; height: 4px; background: rgba(0,0,0,0.2); border-radius: 2px; overflow: hidden; margin-bottom: 4px;">
                            <div style="width: ${progress}%; height: 100%; background: ${statusColor}; transition: width 0.3s;"></div>
                        </div>
                        <div style="opacity: 0.7; font-size: 10px;">${currentStep}</div>
                    ` : ''}
                    ${video.error ? `
                        <div style="opacity: 0.7; font-size: 10px; color: #ff6b6b; margin-top: 4px;">
                            Error: ${this.escapeHtml(video.error)}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showAlert(message, type) {
        // Use the progress info area to show alerts
        const progressInfo = document.getElementById('batch-progress-info');
        const progressText = document.getElementById('batch-progress-text');

        if (progressInfo && progressText) {
            progressInfo.classList.remove('hidden', 'alert-info', 'alert-success', 'alert-warning', 'alert-error');
            progressInfo.classList.add(`alert-${type}`);
            progressText.textContent = message;

            // Auto-hide after 3 seconds
            setTimeout(() => {
                if (!this.isRunning) {
                    progressInfo.classList.add('hidden');
                }
            }, 3000);
        } else {
            // Fallback to console
            console.log(`[BatchUI] ${type}: ${message}`);
        }
    }

    async refresh() {
        await this.loadBatchState();
    }

    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }
}

// Export for use in popup
if (typeof window !== 'undefined') {
    window.BatchUI = BatchUI;
}
