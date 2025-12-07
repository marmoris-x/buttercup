/**
 * Buttercup - YouTube subtitle replacement extension
 * Replaces YouTube auto-generated captions with Whisper-generated ones
 */
console.info('[Buttercup] Injected');

if (window.trustedTypes && window.trustedTypes.createPolicy) {
    // Create Trusted Types policy for security compliance
    // Note: This policy allows HTML creation which is necessary for YouTube's player integration
    window.trustedTypes.createPolicy('default', {
        createHTML: (string, sink) => {
            // Basic sanitization to prevent XSS
            // Only allow our known safe SVG content
            if (string.includes('<svg') || string.includes('ytp-')) {
                return string;
            }
            console.warn('[Buttercup] Attempted to create untrusted HTML:', string);
            return '';
        }
    });
}

const BUTTON_CLASSNAME = 'ytp-subtitles-button ytp-button';

const CAPTION_TRACK = {
    baseUrl: 'https://www.youtube.com/api/timedtext?buttercup=true&fmt=json3', // Force JSON3 format with buttercup flag
    name: {
        simpleText: 'Buttercup (Whisper)',
    },
    vssId: 'a.en',
    languageCode: 'en',
    kind: 'asr',
    isTranslatable: false,
    trackName: '',
};

const CAPTIONS_OBJECT = {
    playerCaptionsTracklistRenderer: {
        captionTracks: [CAPTION_TRACK],
        audioTracks: [
            {
                captionTrackIndices: [0],
                defaultCaptionTrackIndex: 0,
                visibility: 'ON',
                hasDefaultTrack: true,
                captionsInitialState: 'CAPTIONS_INITIAL_STATE_OFF_REQUIRED',
            },
        ],
        defaultAudioTrackIndex: 0,
    },
};

// Thank you sam herbert https://github.com/SamHerbert/SVG-Loaders, modified to fit the button
const SVG_LOADER = `<svg height=100% viewBox="0 0 36 36"width=100% xmlns=http://www.w3.org/2000/svg><defs><linearGradient id=a x1=8.042% x2=65.682% y1=0% y2=23.865%><stop offset=0% stop-color=#fff stop-opacity=0 /><stop offset=63.146% stop-color=#fff stop-opacity=.631 /><stop offset=100% stop-color=#fff /></linearGradient></defs><g fill=none fill-rule=evenodd><g transform="translate(1 1)"><path d="M26 18c0-4.418-3.582-8-8-8"id=Oval-2 stroke=url(#a) stroke-width=4><animateTransform attributeName=transform dur=0.9s from="0 18 18"repeatCount=indefinite to="360 18 18"type=rotate /></path><circle cx=26 cy=18 fill=#fff r=1><animateTransform attributeName=transform dur=0.9s from="0 18 18"repeatCount=indefinite to="360 18 18"type=rotate /></circle></g></g></svg>`;
const SVG_BCAPTIONS = `<svg class="ytp-subtitles-button-icon" height="100%" version="1.1" viewBox="0 0 36 36" width="100%" fill-opacity="1"><use class="ytp-svg-shadow" xlink:href="#ytp-id-17"></use><path d="M 11 11 C 9.89 11 9 11.9 9 13 L 9 23 C 9 24.1 9.89 25 11 25 L 25 25 C 26.1 25 27 24.1 27 23 L 27 13 C 27 11.9 26.1 11 25 11 L 11 11 Z M 17 17 C 17 17 17 18 16 18 L 13.5 18 C 13.5 18 15.5 18 15.5 16.5 L 13.5 16.5 L 13.5 19.5 L 15.5 19.5 C 15.5 18 13.5 18 13.5 18 L 16 18 C 16 18 17 18 17 19 L 17 20 C 17 20.55 16.55 21 16 21 L 13 21 C 12.45 21 12 20.55 12 20 L 12 16 C 12 15.45 12.45 15 13 15 L 16 15 C 16.55 15 17 15.45 17 16 L 17 17 L 17 17 Z M 24 17 L 22.5 17 L 22.5 16.5 L 20.5 16.5 L 20.5 19.5 L 22.5 19.5 L 22.5 19 L 24 19 L 24 20 C 24 20.55 23.55 21 23 21 L 20 21 C 19.45 21 19 20.55 19 20 L 19 16 C 19 15.45 19.45 15 20 15 L 23 15 C 23.55 15 24 15.45 24 16 L 24 17 L 24 17 Z" fill="#fff" id="ytp-id-17"></path></svg>`; // modified to say bc lol
const SVG_CAPTIONS = `<svg class="ytp-subtitles-button-icon" height="100%" version="1.1" viewBox="0 0 36 36" width="100%" fill-opacity="1"><use class="ytp-svg-shadow" xlink:href="#ytp-id-17"></use><path d="M11,11 C9.89,11 9,11.9 9,13 L9,23 C9,24.1 9.89,25 11,25 L25,25 C26.1,25 27,24.1 27,23 L27,13 C27,11.9 26.1,11 25,11 L11,11 Z M17,17 L15.5,17 L15.5,16.5 L13.5,16.5 L13.5,19.5 L15.5,19.5 L15.5,19 L17,19 L17,20 C17,20.55 16.55,21 16,21 L13,21 C12.45,21 12,20.55 12,20 L12,16 C12,15.45 12.45,15 13,15 L16,15 C16.55,15 17,15.45 17,16 L17,17 L17,17 Z M24,17 L22.5,17 L22.5,16.5 L20.5,16.5 L20.5,19.5 L22.5,19.5 L22.5,19 L24,19 L24,20 C24,20.55 23.55,21 23,21 L20,21 C19.45,21 19,20.55 19,20 L19,16 C19,15.45 19.45 15 20,15 L23,15 C23.55,15 24,15.45 24,16 L24,17 L24,17 Z" fill="#fff" id="ytp-id-17"></path></svg>`;
const SVG_TRANSLATE = `<?xml version="1.0" encoding="utf-8"?><svg fill="#fff" width="800px" height="800px" viewBox="0 0 256 256" id="Flat" xmlns="http://www.w3.org/2000/svg"><path d="M235.57178,214.21094l-56-112a4.00006,4.00006,0,0,0-7.15528,0l-22.854,45.708a92.04522,92.04522,0,0,1-55.57275-20.5752A99.707,99.707,0,0,0,123.90723,60h28.08691a4,4,0,0,0,0-8h-60V32a4,4,0,0,0-8,0V52h-60a4,4,0,0,0,0,8h91.90772a91.74207,91.74207,0,0,1-27.91895,62.03357A91.67371,91.67371,0,0,1,65.23389,86.667a4,4,0,0,0-7.542,2.668,99.63009,99.63009,0,0,0,24.30469,38.02075A91.5649,91.5649,0,0,1,23.99414,148a4,4,0,0,0,0,8,99.54451,99.54451,0,0,0,63.99951-23.22461,100.10427,100.10427,0,0,0,57.65479,22.97192L116.4165,214.21094a4,4,0,1,0,7.15528,3.57812L138.46631,188H213.522l14.89453,29.78906a4,4,0,1,0,7.15528-3.57812ZM142.46631,180l33.52783-67.05566L209.522,180Z"/></svg>`;

let TRANSLATE = null;
let ENABLED = null;
let DOWNLOAD_SRT = null;
let USE_CACHE = true; // Default: enabled
let AUTO_TRANSCRIBE = false; // Default: disabled for safety

// Progress Indicator
let progressIndicator = null;

// Debounce utility function
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

// Initialize API configuration
let apiConfig = null;
let transcriptionHandler = null;

// LLM Translation settings
let llmTranslationEnabled = false;
let llmTargetLanguage = '';
let llmProvider = 'openai';
let llmApiKey = '';
let llmModel = '';

// Transcript Storage
let transcriptStorage = null;
let currentVideoId = null;

// Wrap the event listener in a Promise
const getButtercupTranslate = new Promise((resolve) => {
    document.addEventListener('responseButtercupTranslate', function (e) {
        TRANSLATE = e.detail;
        console.info('[Buttercup] Translate: ', TRANSLATE);
        resolve();
    });
    // Request the value of buttercup_translate from the content script
    document.dispatchEvent(new CustomEvent('requestButtercupTranslate', {}));
});

const getButtercupEnabled = new Promise((resolve) => {
    document.addEventListener('responseButtercupEnabled', function (e) {
        ENABLED = e.detail;
        console.info('[Buttercup] Enabled: ', ENABLED);
        resolve();
    });
    // Request the value of buttercup_enabled from the content script
    document.dispatchEvent(new CustomEvent('requestButtercupEnabled', {}));
});

const getButtercupDownloadSrt = new Promise((resolve) => {
    document.addEventListener('responseButtercupDownloadSrt', function (e) {
        DOWNLOAD_SRT = e.detail;
        console.info('[Buttercup] Download SRT: ', DOWNLOAD_SRT);
        resolve();
    });
    // Request the value of download_srt from the content script
    document.dispatchEvent(new CustomEvent('requestButtercupDownloadSrt', {}));
});

const getButtercupUseCache = new Promise((resolve) => {
    document.addEventListener('responseButtercupCache', function (e) {
        USE_CACHE = e.detail;
        console.info('[Buttercup] Use Cache: ', USE_CACHE);
        resolve();
    });
    // Request the value of buttercup_cache from the content script
    document.dispatchEvent(new CustomEvent('requestButtercupCache', {}));
});

const getButtercupAutoTranscribe = new Promise((resolve) => {
    document.addEventListener('responseButtercupAutoTranscribe', function (e) {
        AUTO_TRANSCRIBE = e.detail;
        console.info('[Buttercup] Auto-Transcribe: ', AUTO_TRANSCRIBE);
        resolve();
    });
    // Request the value of buttercup_auto_transcribe from the content script
    document.dispatchEvent(new CustomEvent('requestButtercupAutoTranscribe', {}));
});

// Function to show error message snackbar
function showErrorSnackbar(message) {
    console.error('[Buttercup] Error:', message);
    document.dispatchEvent(new CustomEvent('buttercupShowError', {
        detail: { message: message }
    }));
}

// Get API settings
const getButtercupApiSettings = new Promise((resolve) => {
    document.addEventListener('responseButtercupApiSettings', function (e) {
        console.info('[Buttercup] API Settings received');

        // Initialize API configuration
        apiConfig = new APIConfig();

        // Initialize with settings from the response
        apiConfig.initFromSettings({
            cobaltApiBase: e.detail.cobaltApiBase,
            groqApiKey: e.detail.groqApiKey,
            groqModel: e.detail.groqModel,
            useWordTimestamps: e.detail.useWordTimestamps,
            wordsPerLine: e.detail.wordsPerLine,
            maxLineLength: e.detail.maxLineLength,
            prompt: e.detail.prompt,
            temperature: e.detail.temperature,
            responseFormat: e.detail.responseFormat
        });
        // Expose to window for batch processor access
        window.apiConfig = apiConfig;

        // Initialize transcription handler
        transcriptionHandler = new TranscriptionHandler(apiConfig);
        // Expose to window for batch processor access
        window.transcriptionHandler = transcriptionHandler;

        // Store LLM translation settings
        llmTranslationEnabled = e.detail.llmTranslationEnabled;
        llmTargetLanguage = e.detail.llmTargetLanguage;
        llmProvider = e.detail.llmProvider;
        llmApiKey = e.detail.llmApiKey;
        llmModel = e.detail.llmModel;

        console.info('[Buttercup] LLM Translation settings:', {
            enabled: llmTranslationEnabled,
            targetLanguage: llmTargetLanguage,
            provider: llmProvider,
            hasApiKey: !!llmApiKey,
            model: llmModel
        });

        resolve();
    });
    // Request API settings from the content script
    document.dispatchEvent(new CustomEvent('requestButtercupApiSettings', {}));
});

async function init() {
    console.info('[Buttercup] Initializing');
    await Promise.all([
        getButtercupTranslate,
        getButtercupEnabled,
        getButtercupDownloadSrt,
        getButtercupUseCache,
        getButtercupAutoTranscribe,
        getButtercupApiSettings
    ]);
}

document.addEventListener('buttercupSettingsChanged', async function () {
    console.info('[Buttercup] Settings changed, re-initializing settings');

    document.dispatchEvent(new CustomEvent('requestButtercupTranslate', {}));
    document.dispatchEvent(new CustomEvent('requestButtercupEnabled', {}));
    document.dispatchEvent(new CustomEvent('requestButtercupDownloadSrt', {}));
    document.dispatchEvent(new CustomEvent('requestButtercupCache', {}));
    document.dispatchEvent(new CustomEvent('requestButtercupAutoTranscribe', {}));
    await Promise.all([getButtercupTranslate, getButtercupEnabled, getButtercupDownloadSrt, getButtercupUseCache, getButtercupAutoTranscribe]);
});

document.addEventListener('buttercupApiSettingsChanged', async function () {
    console.info('[Buttercup] API Settings changed, re-initializing API settings');
    document.dispatchEvent(new CustomEvent('requestButtercupApiSettings', {}));
    await getButtercupApiSettings;
});

const escapeHTMLPolicy = trustedTypes.createPolicy('forceInner', {
    createHTML: (to_escape) => to_escape,
});

(async function () {
    await init();

    if (!ENABLED) {
        console.info('[Buttercup] Disabled, skipping everything');
        return;
    }

    // Initialize Progress Indicator
    if (window.ProgressIndicator) {
        progressIndicator = new window.ProgressIndicator();
        console.info('[Buttercup] ✓ ProgressIndicator initialized');
    } else {
        console.error('[Buttercup] ✗ ProgressIndicator class not found!');
    }

    // IMPORTANT: Declare customSubtitle here BEFORE any usage
    let customSubtitle = null;
    let currentURL = location.href;

    // Initialize transcript storage
    if (window.TranscriptStorage) {
        transcriptStorage = new window.TranscriptStorage();
        // Expose to window for batch processor access
        window.transcriptStorage = transcriptStorage;
        console.info('[Buttercup] ✓ TranscriptStorage initialized');
    } else {
        console.error('[Buttercup] ✗ TranscriptStorage class not found!');
    }

    // Get current video ID
    currentVideoId = getVideoId();
    console.info('[Buttercup] Current video ID:', currentVideoId);

    // Auto-load saved transcript if exists (only if cache is enabled)
    if (USE_CACHE && transcriptStorage && currentVideoId) {
        try {
            const savedTranscript = await transcriptStorage.loadTranscript(currentVideoId);
            if (savedTranscript) {
                console.info('[Buttercup] 📂 Found saved transcript, auto-loading...');
                console.info('[Buttercup] Saved at:', new Date(savedTranscript.timestamp).toLocaleString());

                customSubtitle = JSON.stringify(savedTranscript.captionData);

                // Create caption overlay with saved data
                if (window.CustomCaptionOverlay) {
                    try {
                        const captionOverlay = new window.CustomCaptionOverlay(savedTranscript.captionData, true, currentVideoId);
                        window.buttercupCaptionOverlay = captionOverlay;
                        console.info('[Buttercup] ✓ Caption overlay created from saved transcript');
                    } catch (overlayError) {
                        console.warn('[Buttercup] Could not create caption overlay (DOM not ready or incompatible page):', overlayError.message);
                    }
                }

                // Show summary sidebar if exists
                if (savedTranscript.summary && window.SummarySidebar) {
                    try {
                        const sidebar = new window.SummarySidebar(
                            savedTranscript.summary,
                            savedTranscript.videoTitle
                        );
                        window.buttercupSummarySidebar = sidebar;
                        console.info('[Buttercup] ✓ Summary sidebar displayed');
                    } catch (sidebarError) {
                        console.warn('[Buttercup] Could not create summary sidebar (DOM not ready or incompatible page):', sidebarError.message);
                    }
                }
            } else {
                console.info('[Buttercup] No saved transcript found for this video');
            }
        } catch (error) {
            console.error('[Buttercup] Error loading saved transcript:', error);
        }
    } else if (!USE_CACHE) {
        console.info('[Buttercup] Cache disabled, skipping auto-load');
    }

    // Add global error listener to catch YouTube player errors
    window.addEventListener('error', (event) => {
        if (event.message && (event.message.includes('caption') || event.message.includes('subtitle') || event.message.includes('timedtext'))) {
            console.error('[Buttercup] 🔴 YouTube caption error detected:', {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                error: event.error
            });
        }
    }, true);

    // Also listen for unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
        if (event.reason && JSON.stringify(event.reason).toLowerCase().includes('caption')) {
            console.error('[Buttercup] 🔴 Unhandled caption promise rejection:', event.reason);
        }
    });

    // Listen for transcription start event from popup
    document.addEventListener('buttercupStartTranscription', function () {
        console.info('[Buttercup] Transcription start event received from popup');
        // Only start if subtitles haven't been generated for this video yet
        if (customSubtitle === null) {
            startTranscriptionProcess();
        } else {
            console.info('[Buttercup] Subtitles already generated for this video');
        }
    });

    // Listen for jump-to-segment events from summary sidebar
    document.addEventListener('buttercupJumpToSegment', function (e) {
        if (e.detail && e.detail.segmentIndex !== undefined) {
            const segmentIndex = e.detail.segmentIndex;
            console.info('[Buttercup] Jump to segment requested:', segmentIndex);

            try {
                // Get the caption data
                let captionData = null;
                if (customSubtitle) {
                    captionData = JSON.parse(customSubtitle);
                }

                if (captionData && captionData.events && captionData.events[segmentIndex]) {
                    const segment = captionData.events[segmentIndex];
                    const timeInSeconds = segment.tStartMs / 1000;

                    // Get YouTube player and seek to timestamp
                    const player = document.getElementById('movie_player');
                    if (player && player.seekTo) {
                        player.seekTo(timeInSeconds, true);
                        console.info(`[Buttercup] ✓ Jumped to ${timeInSeconds}s (segment ${segmentIndex})`);
                    } else {
                        console.error('[Buttercup] ✗ YouTube player not found or seekTo not available');
                    }
                } else {
                    console.error('[Buttercup] ✗ Invalid segment index or caption data not available');
                }
            } catch (error) {
                console.error('[Buttercup] ✗ Error jumping to segment:', error);
            }
        }
    });

    // Wait for window['ytInitialPlayerResponse'] to be available
    // DON'T inject captions immediately - wait for transcription to complete first!
    // Use a more efficient polling interval (10ms instead of 1ms)
    // ONLY run this on YouTube to avoid spamming console on other sites
    const isYouTube = window.location.hostname.includes('youtube.com');

    if (isYouTube) {
        const checkPlayerResponse = () => {
            if (window['ytInitialPlayerResponse']) {
                console.info('[Buttercup] ytInitialPlayerResponse found, ready for caption injection after transcription');
                return true;
            }
            return false;
        };

        // Try immediately first
        if (!checkPlayerResponse()) {
            // If not available, poll every 10ms (more efficient than 1ms)
            const interval = setInterval(() => {
                if (checkPlayerResponse()) {
                    clearInterval(interval);
                }
            }, 10);

            // Timeout after 5 seconds to prevent infinite polling
            setTimeout(() => {
                clearInterval(interval);
                if (!window['ytInitialPlayerResponse']) {
                    console.warn('[Buttercup] Failed to find ytInitialPlayerResponse after 5 seconds');
                }
            }, 5000);
        }
    }

    function overrideFetchResponsesForPlayer() {
        const originalFetch = window.fetch;
        window.fetch.magic = 'buttercup';
        window.fetch = async (input, init) => {
            const url = typeof input === 'string' ? input : input?.url;

            // If no valid URL, pass through to original fetch
            if (!url) {
                return originalFetch(input, init);
            }

            // Log all fetch requests to help debug caption loading
            if (url.includes('timedtext') || url.includes('caption') || url.includes('buttercup')) {
                console.info('[Buttercup] Fetch request detected:', url.substring(0, 150));
            }

            // Intercept ALL caption requests with fmt=json3 if we have custom subtitles
            // YouTube ignores our baseUrl and builds its own URL
            const isTimedTextRequest = url.includes('timedtext') && url.includes('fmt=json3');

            if (isTimedTextRequest && customSubtitle !== null) {
                console.info('[Buttercup] Intercepting caption fetch request, returning Buttercup captions');
                console.info('[Buttercup] Original request URL:', url.substring(0, 100) + '...');
                console.info('[Buttercup] Caption data size:', customSubtitle.length, 'characters');

                return new Response(customSubtitle, {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }

            // drop it just in case so it falls back to /v1/player
            if (url.includes('googlevideo.com/initplayback')) {
                console.info('[Buttercup] Dropping initplayback request');
                return new Response(null, { status: 204 });
            }

            if (url.includes('/youtubei/v1/player')) {
                const response = await originalFetch(input, init);
                const json = await response.json();
                // only the right response has streamingData
                if (json.streamingData === undefined) {
                    return response;
                }
                // ONLY inject captions if we have transcription ready AND Buttercup is enabled
                if (ENABLED && customSubtitle !== null) {
                    if (json.captions === undefined) {
                        console.info('[Buttercup] No captions found in fetch response, injecting Buttercup captions object');
                        json.captions = CAPTIONS_OBJECT;
                    } else {
                        // If captions exist, ensure our CAPTION_TRACK is present and replace any ASR captions
                        let captionTracks = json.captions.playerCaptionsTracklistRenderer.captionTracks;
                        let buttercupTrackExists = false;
                        for (let i = 0; i < captionTracks.length; i++) {
                            if (captionTracks[i].vssId === CAPTION_TRACK.vssId) {
                                buttercupTrackExists = true;
                            }
                            if (captionTracks[i].kind === 'asr') {
                                console.info('[Buttercup] Found ASR caption in fetch response, replacing with Buttercup track');
                                captionTracks[i] = CAPTION_TRACK;
                            }
                        }
                        if (!buttercupTrackExists) {
                            console.info('[Buttercup] Existing captions found in fetch response, adding Buttercup caption track');
                            captionTracks.push(CAPTION_TRACK);
                        } else {
                            console.info('[Buttercup] Buttercup caption track already present in fetch response.');
                        }
                        json.captions.playerCaptionsTracklistRenderer.captionTracks = captionTracks;
                    }
                    console.info('[Buttercup] Overriding /youtubei/v1/player fetch with Buttercup captions');
                } else {
                    console.info('[Buttercup] Skipping caption injection - transcription not ready yet');
                }
                return new Response(JSON.stringify(json), ...arguments);
                // return response;
            }
            return originalFetch(input, init);
        };
    }

    overrideFetchResponsesForPlayer();

    // Also intercept XMLHttpRequest - YouTube uses XHR for caption loading
    const OriginalXHR = window.XMLHttpRequest;
    const originalXHROpen = OriginalXHR.prototype.open;
    const originalXHRSend = OriginalXHR.prototype.send;

    OriginalXHR.prototype.open = function(method, url, ...rest) {
        this._buttercupUrl = url;
        this._buttercupMethod = method;

        // Log caption-related XHR requests
        if (url && (url.includes('timedtext') || url.includes('caption') || url.includes('buttercup'))) {
            console.info('[Buttercup] XHR request detected:', url.substring(0, 150));
        }

        // For caption requests when we have custom subtitles, use a data URL to prevent network request
        // YouTube ignores our baseUrl and builds its own, so intercept ALL timedtext requests with fmt=json3
        const isTimedTextRequest = url && url.includes('timedtext') && url.includes('fmt=json3');
        if (isTimedTextRequest && customSubtitle !== null) {
            // Store that this is a buttercup request for later
            this._isButtercupRequest = true;
            console.info('[Buttercup] ⚡ Intercepting timedtext request with fmt=json3 (YouTube built its own URL)');
            return originalXHROpen.call(this, method, 'data:text/plain,', ...rest);
        }

        return originalXHROpen.call(this, method, url, ...rest);
    };

    OriginalXHR.prototype.send = function(...args) {
        // Intercept ALL caption requests with fmt=json3 if we have custom subtitles
        // YouTube ignores our baseUrl parameter and builds its own URL
        const isTimedTextRequest = this._buttercupUrl &&
            this._buttercupUrl.includes('timedtext') &&
            this._buttercupUrl.includes('fmt=json3');

        if (isTimedTextRequest && customSubtitle !== null) {
            console.info('[Buttercup] ========== INTERCEPTING CAPTION REQUEST ==========');
            console.info('[Buttercup] Original request URL:', this._buttercupUrl.substring(0, 100) + '...');
            console.info('[Buttercup] URL contains fmt=json3:', this._buttercupUrl.includes('fmt=json3'));
            console.info('[Buttercup] URL contains buttercup=true:', this._buttercupUrl.includes('buttercup=true'));

            const xhr = this;
            const captionData = customSubtitle;
            const originalUrl = this._buttercupUrl;

            console.info('[Buttercup] Caption data size:', captionData.length, 'characters');

            // Detailed validation and logging
            try {
                const parsed = JSON.parse(captionData);
                console.info('[Buttercup] ✓ Caption data is valid JSON');
                console.info('[Buttercup] Caption structure:', {
                    hasEvents: !!parsed.events,
                    eventCount: parsed.events ? parsed.events.length : 0,
                    firstEventKeys: parsed.events && parsed.events[0] ? Object.keys(parsed.events[0]) : []
                });

                if (parsed.events && parsed.events[0]) {
                    const firstEvent = parsed.events[0];
                    console.info('[Buttercup] First event details:', {
                        tStartMs: firstEvent.tStartMs,
                        tStartMsType: typeof firstEvent.tStartMs,
                        dDurationMs: firstEvent.dDurationMs,
                        dDurationMsType: typeof firstEvent.dDurationMs,
                        hasSegs: !!firstEvent.segs,
                        segsLength: firstEvent.segs ? firstEvent.segs.length : 0,
                        firstSegKeys: firstEvent.segs && firstEvent.segs[0] ? Object.keys(firstEvent.segs[0]) : []
                    });
                    console.info('[Buttercup] First event text preview:', firstEvent.segs[0].utf8.substring(0, 50) + '...');
                }

                // Log the COMPLETE JSON structure for comparison with real YouTube captions
                console.info('[Buttercup] 📄 COMPLETE Caption JSON:', JSON.stringify(parsed).substring(0, 500) + '...');
            } catch (e) {
                console.error('[Buttercup] ✗ Failed to parse caption data:', e);
            }

            // Call original send with data: URL to prevent network request
            originalXHRSend.call(this, ...args);

            // Simulate proper XHR state transitions with progressive readyState changes
            // This is critical - YouTube expects to see state transitions!

            // State 1: OPENED (immediately after send)
            setTimeout(() => {
                try {
                    Object.defineProperty(xhr, 'readyState', {
                        writable: true,
                        configurable: true,
                        value: 1  // OPENED
                    });
                    console.info('[Buttercup] → State 1: OPENED');
                    xhr.dispatchEvent(new Event('readystatechange'));
                } catch (e) {
                    console.error('[Buttercup] Error in state 1:', e);
                }
            }, 0);

            // State 2: HEADERS_RECEIVED
            setTimeout(() => {
                try {
                    Object.defineProperty(xhr, 'readyState', {
                        writable: true,
                        configurable: true,
                        value: 2  // HEADERS_RECEIVED
                    });
                    console.info('[Buttercup] → State 2: HEADERS_RECEIVED');
                    xhr.dispatchEvent(new Event('readystatechange'));
                } catch (e) {
                    console.error('[Buttercup] Error in state 2:', e);
                }
            }, 5);

            // State 3: LOADING (with progress event)
            setTimeout(() => {
                try {
                    Object.defineProperty(xhr, 'readyState', {
                        writable: true,
                        configurable: true,
                        value: 3  // LOADING
                    });
                    console.info('[Buttercup] → State 3: LOADING');
                    xhr.dispatchEvent(new Event('readystatechange'));

                    // Fire progress event
                    const progressEvent = new ProgressEvent('progress', {
                        lengthComputable: true,
                        loaded: captionData.length,
                        total: captionData.length
                    });
                    console.info('[Buttercup] → Dispatching progress event');
                    xhr.dispatchEvent(progressEvent);
                } catch (e) {
                    console.error('[Buttercup] Error in state 3:', e);
                }
            }, 10);

            // State 4: DONE (set all properties and fire load events)
            setTimeout(() => {
                try {
                    // Parse caption data
                    const parsedData = JSON.parse(captionData);

                    // Add response header support
                    xhr._responseHeaders = {
                        'content-type': 'application/json; charset=utf-8',
                        'access-control-allow-origin': '*',
                        'access-control-allow-methods': 'GET, POST, OPTIONS',
                        'cache-control': 'no-cache'
                    };

                    // Override response properties
                    Object.defineProperty(xhr, 'responseText', {
                        writable: false,
                        configurable: true,
                        value: captionData  // String version
                    });
                    Object.defineProperty(xhr, 'response', {
                        writable: false,
                        configurable: true,
                        value: parsedData  // PARSED object version
                    });
                    Object.defineProperty(xhr, 'responseType', {
                        writable: false,
                        configurable: true,
                        value: ''  // Empty string - let XHR decide based on content
                    });
                    Object.defineProperty(xhr, 'responseURL', {
                        writable: false,
                        configurable: true,
                        value: originalUrl
                    });
                    Object.defineProperty(xhr, 'status', {
                        writable: false,
                        configurable: true,
                        value: 200
                    });
                    Object.defineProperty(xhr, 'statusText', {
                        writable: false,
                        configurable: true,
                        value: 'OK'
                    });
                    Object.defineProperty(xhr, 'readyState', {
                        writable: true,
                        configurable: true,
                        value: 4  // DONE
                    });
                    console.info('[Buttercup] → State 4: DONE');

                    // Add missing XHR methods
                    xhr.getAllResponseHeaders = function() {
                        return Object.entries(xhr._responseHeaders)
                            .map(([key, value]) => `${key}: ${value}`)
                            .join('\r\n');
                    };

                    xhr.getResponseHeader = function(name) {
                        return xhr._responseHeaders[name.toLowerCase()] || null;
                    };

                    console.info('[Buttercup] ✓ XHR response properties set');
                    console.info('[Buttercup] Response validation:', {
                        responseType: typeof xhr.response,
                        isObject: typeof xhr.response === 'object',
                        hasEvents: !!xhr.response.events,
                        eventCount: xhr.response.events ? xhr.response.events.length : 0,
                        status: xhr.status,
                        readyState: xhr.readyState,
                        responseURL: xhr.responseURL ? xhr.responseURL.substring(0, 50) + '...' : 'none'
                    });

                    // Fire real DOM events instead of calling handlers directly
                    // YouTube uses addEventListener, not direct onload handlers!
                    console.info('[Buttercup] Firing DOM events...');

                    // Create and dispatch readystatechange event
                    const readyStateEvent = new Event('readystatechange');
                    console.info('[Buttercup] → Dispatching readystatechange event');
                    xhr.dispatchEvent(readyStateEvent);

                    // Create and dispatch load event (ProgressEvent)
                    const loadEvent = new ProgressEvent('load', {
                        lengthComputable: true,
                        loaded: captionData.length,
                        total: captionData.length
                    });
                    console.info('[Buttercup] → Dispatching load event');
                    xhr.dispatchEvent(loadEvent);

                    // Create and dispatch loadend event
                    const loadEndEvent = new ProgressEvent('loadend', {
                        lengthComputable: true,
                        loaded: captionData.length,
                        total: captionData.length
                    });
                    console.info('[Buttercup] → Dispatching loadend event');
                    xhr.dispatchEvent(loadEndEvent);

                    // Also try the legacy handlers if they exist
                    if (xhr.onreadystatechange) {
                        console.info('[Buttercup] → Also calling onreadystatechange handler');
                        try {
                            xhr.onreadystatechange.call(xhr);
                        } catch (e) {
                            console.error('[Buttercup] Error in onreadystatechange:', e);
                        }
                    }
                    if (xhr.onload) {
                        console.info('[Buttercup] → Also calling onload handler');
                        try {
                            xhr.onload.call(xhr, loadEvent);
                        } catch (e) {
                            console.error('[Buttercup] Error in onload:', e);
                        }
                    }

                    console.info('[Buttercup] ========== INTERCEPTION COMPLETE ==========');
                } catch (error) {
                    console.error('[Buttercup] ✗ Error setting XHR response properties:', error);
                    console.error('[Buttercup] Error stack:', error.stack);
                }
            }, 15);  // Execute after state 3

            return;
        }

        return originalXHRSend.apply(this, args);
    };
    (function (originalFetch) {
        Object.defineProperty(window, 'fetch', {
            configurable: false, // Prevent further modifications
            enumerable: true,
            get: function () {
                return originalFetch;
            },
        });
    })(window.fetch);

    // injectConfig();

    // MutationObserver to detect moving between videos
    const observer = new MutationObserver(async function () {
        if (location.href !== currentURL) {
            console.info('[Buttercup] URL changed, resetting custom subtitles');
            customSubtitle = null;
            currentURL = location.href;

            // CRITICAL: Destroy old overlays and sidebars immediately
            if (window.buttercupCaptionOverlay) {
                try {
                    window.buttercupCaptionOverlay.destroy();
                    console.info('[Buttercup] ✓ Destroyed old caption overlay');
                } catch (e) {
                    console.warn('[Buttercup] Error destroying old caption overlay:', e);
                }
                window.buttercupCaptionOverlay = null;
            }

            if (window.buttercupSummarySidebar) {
                try {
                    window.buttercupSummarySidebar.destroy();
                    console.info('[Buttercup] ✓ Destroyed old summary sidebar');
                } catch (e) {
                    console.warn('[Buttercup] Error destroying old summary sidebar:', e);
                }
                window.buttercupSummarySidebar = null;
            }

            if (window.buttercupTranscriptSearch) {
                try {
                    window.buttercupTranscriptSearch.destroy();
                    console.info('[Buttercup] ✓ Destroyed old transcript search');
                } catch (e) {
                    console.warn('[Buttercup] Error destroying old transcript search:', e);
                }
                window.buttercupTranscriptSearch = null;
            }

            // Update video ID and check for saved transcript
            const newVideoId = getVideoId();
            if (newVideoId && newVideoId !== currentVideoId) {
                currentVideoId = newVideoId;
                console.info('[Buttercup] New video detected:', currentVideoId);

                // Auto-load saved transcript if exists (only if cache is enabled)
                if (USE_CACHE && transcriptStorage) {
                    try {
                        const savedTranscript = await transcriptStorage.loadTranscript(currentVideoId);
                        if (savedTranscript) {
                            console.info('[Buttercup] 📂 Found saved transcript, auto-loading...');
                            customSubtitle = JSON.stringify(savedTranscript.captionData);

                            // Wait a bit for video player to be ready (reduced from 1000ms to 500ms)
                            setTimeout(() => {
                                // Create caption overlay with saved data
                                if (window.CustomCaptionOverlay) {
                                    try {
                                        const captionOverlay = new window.CustomCaptionOverlay(savedTranscript.captionData, true, currentVideoId);
                                        window.buttercupCaptionOverlay = captionOverlay;
                                        console.info('[Buttercup] ✓ Caption overlay created from saved transcript');

                                        // Create transcript search interface
                                        if (window.TranscriptSearch) {
                                            // Destroy old instance if exists (prevents duplicate event listeners)
                                            if (window.buttercupTranscriptSearch) {
                                                window.buttercupTranscriptSearch.destroy();
                                                window.buttercupTranscriptSearch = null;
                                            }

                                            const transcriptSearch = new window.TranscriptSearch(savedTranscript.captionData);
                                            window.buttercupTranscriptSearch = transcriptSearch;
                                            console.info('[Buttercup] ✓ Transcript search initialized (Press Ctrl+F to search)');
                                        }
                                    } catch (overlayError) {
                                        console.warn('[Buttercup] Error creating caption overlay:', overlayError);
                                    }
                                }

                                // Show summary sidebar if exists
                                if (savedTranscript.summary && window.SummarySidebar) {
                                    try {
                                        const sidebar = new window.SummarySidebar(
                                            savedTranscript.summary,
                                            savedTranscript.videoTitle
                                        );
                                        window.buttercupSummarySidebar = sidebar;
                                        console.info('[Buttercup] ✓ Summary sidebar displayed');
                                    } catch (sidebarError) {
                                        console.warn('[Buttercup] Error creating summary sidebar:', sidebarError);
                                    }
                                }
                            }, 500); // Reduced delay for faster loading
                        } else {
                            // No cached transcript found
                            console.info('[Buttercup] No saved transcript found for video:', currentVideoId);

                            if (AUTO_TRANSCRIBE && ENABLED) {
                                // Auto-start transcription if enabled
                                console.info('[Buttercup] 🤖 Auto-transcription enabled, starting transcription...');

                                // Wait for player to be ready before starting transcription
                                setTimeout(() => {
                                    // Check if API keys are configured
                                    if (apiConfig && apiConfig.hasAllApiKeys()) {
                                        startTranscriptionProcess();
                                    } else {
                                        console.warn('[Buttercup] Auto-transcription cancelled: API keys not configured');
                                    }
                                }, 2000); // Wait 2 seconds for player to be fully ready
                            }
                        }
                    } catch (error) {
                        console.error('[Buttercup] Error loading saved transcript:', error);

                        // On error loading cache, try auto-transcription if enabled
                        if (AUTO_TRANSCRIBE && ENABLED) {
                            console.info('[Buttercup] 🤖 Auto-transcription enabled (fallback after cache error), starting transcription...');
                            setTimeout(() => {
                                if (apiConfig && apiConfig.hasAllApiKeys()) {
                                    startTranscriptionProcess();
                                } else {
                                    console.warn('[Buttercup] Auto-transcription cancelled: API keys not configured');
                                }
                            }, 2000);
                        }
                    }
                } else if (!USE_CACHE && AUTO_TRANSCRIBE && ENABLED) {
                    // Cache disabled but auto-transcription enabled
                    console.info('[Buttercup] 🤖 Auto-transcription enabled (no cache), starting transcription...');
                    setTimeout(() => {
                        if (apiConfig && apiConfig.hasAllApiKeys()) {
                            startTranscriptionProcess();
                        } else {
                            console.warn('[Buttercup] Auto-transcription cancelled: API keys not configured');
                        }
                    }, 2000);
                } else if (!USE_CACHE) {
                    console.info('[Buttercup] Cache disabled, skipping auto-load');
                }
            }
        }
    });

    document.addEventListener('buttercupSettingsChanged', function () {
        console.info('[Buttercup] Settings changed, resetting custom subtitles');
        customSubtitle = null;
    });

    document.addEventListener('buttercupApiSettingsChanged', function () {
        console.info('[Buttercup] API Settings changed, resetting custom subtitles');
        // DON'T reset customSubtitle - the transcription is already done!
        // Only reset if we navigate to a new video (handled by MutationObserver)
        // customSubtitle = null;  // COMMENTED OUT - this was causing captions to disappear!
    });

    observer.observe(document, { childList: true, subtree: true });

    // ADDITIONAL: Robust setInterval-based URL watcher
    // This is MORE RELIABLE than MutationObserver for SPA navigation
    let lastCheckedUrl = location.href;
    let lastCheckedVideoId = currentVideoId;

    setInterval(async () => {
        const newUrl = location.href;
        const newVideoId = getVideoId();

        // Check if URL or video ID changed
        if (newUrl !== lastCheckedUrl || newVideoId !== lastCheckedVideoId) {
            console.info('[Buttercup] 🔄 URL/Video change detected by interval watcher');
            console.info('[Buttercup] Old URL:', lastCheckedUrl);
            console.info('[Buttercup] New URL:', newUrl);
            console.info('[Buttercup] Old Video ID:', lastCheckedVideoId);
            console.info('[Buttercup] New Video ID:', newVideoId);

            lastCheckedUrl = newUrl;
            lastCheckedVideoId = newVideoId;
            currentURL = newUrl;
            customSubtitle = null;

            // Destroy old overlays immediately
            if (window.buttercupCaptionOverlay) {
                try {
                    window.buttercupCaptionOverlay.destroy();
                    console.info('[Buttercup] ✓ Destroyed old caption overlay (interval watcher)');
                } catch (e) {
                    console.warn('[Buttercup] Error destroying old caption overlay:', e);
                }
                window.buttercupCaptionOverlay = null;
            }

            if (window.buttercupSummarySidebar) {
                try {
                    window.buttercupSummarySidebar.destroy();
                    console.info('[Buttercup] ✓ Destroyed old summary sidebar (interval watcher)');
                } catch (e) {
                    console.warn('[Buttercup] Error destroying old summary sidebar:', e);
                }
                window.buttercupSummarySidebar = null;
            }

            if (window.buttercupTranscriptSearch) {
                try {
                    window.buttercupTranscriptSearch.destroy();
                    console.info('[Buttercup] ✓ Destroyed old transcript search (interval watcher)');
                } catch (e) {
                    console.warn('[Buttercup] Error destroying old transcript search:', e);
                }
                window.buttercupTranscriptSearch = null;
            }

            // Load new transcript if video ID exists and is different
            if (newVideoId && newVideoId !== currentVideoId) {
                currentVideoId = newVideoId;
                console.info('[Buttercup] 📺 New video detected:', currentVideoId);

                // Auto-load saved transcript if exists
                if (USE_CACHE && transcriptStorage) {
                    try {
                        const savedTranscript = await transcriptStorage.loadTranscript(currentVideoId);
                        if (savedTranscript) {
                            console.info('[Buttercup] 📂 Found saved transcript for:', currentVideoId);
                            customSubtitle = JSON.stringify(savedTranscript.captionData);

                            // Wait for video player to be ready
                            setTimeout(() => {
                                // Create caption overlay
                                if (window.CustomCaptionOverlay) {
                                    try {
                                        const captionOverlay = new window.CustomCaptionOverlay(savedTranscript.captionData, true, currentVideoId);
                                        window.buttercupCaptionOverlay = captionOverlay;
                                        console.info('[Buttercup] ✅ Caption overlay created successfully');

                                        // Create transcript search
                                        if (window.TranscriptSearch) {
                                            // Destroy old instance if exists (prevents duplicate event listeners)
                                            if (window.buttercupTranscriptSearch) {
                                                window.buttercupTranscriptSearch.destroy();
                                                window.buttercupTranscriptSearch = null;
                                            }

                                            const transcriptSearch = new window.TranscriptSearch(savedTranscript.captionData);
                                            window.buttercupTranscriptSearch = transcriptSearch;
                                            console.info('[Buttercup] ✅ Transcript search initialized');
                                        }
                                    } catch (overlayError) {
                                        console.error('[Buttercup] Error creating caption overlay:', overlayError);
                                    }
                                }

                                // Show summary sidebar if exists
                                if (savedTranscript.summary && window.SummarySidebar) {
                                    try {
                                        const sidebar = new window.SummarySidebar(
                                            savedTranscript.summary,
                                            savedTranscript.videoTitle
                                        );
                                        window.buttercupSummarySidebar = sidebar;
                                        console.info('[Buttercup] ✅ Summary sidebar displayed');
                                    } catch (sidebarError) {
                                        console.error('[Buttercup] Error creating summary sidebar:', sidebarError);
                                    }
                                }
                            }, 500);
                        } else {
                            console.info('[Buttercup] ℹ️ No saved transcript found for:', currentVideoId);
                        }
                    } catch (error) {
                        console.error('[Buttercup] Error loading saved transcript:', error);
                    }
                }
            }
        }
    }, 1000); // Check every second

    // This function now contains the core logic for fetching and processing subtitles.
    function startTranscriptionProcess() {
        console.info('[Buttercup] Starting transcription process...');

        // Check if API keys are set
        if (!apiConfig.hasAllApiKeys()) {
            const errorMsg = 'Groq API key not set. Please set up the Groq API key in the extension settings.';
            showErrorSnackbar(errorMsg);
            return;
        }

        // Initialize progress tracking
        const steps = ['Downloading audio', 'Transcribing audio'];
        if (llmTranslationEnabled && llmApiKey && llmModel && llmTargetLanguage) {
            steps.push('Translating captions');
        }
        steps.push('Creating captions');
        if (USE_CACHE) {
            steps.push('Saving transcript');
        }

        if (progressIndicator) {
            progressIndicator.start(steps);
            progressIndicator.setStepInProgress(0, 'Downloading audio from YouTube...');
        }

        const videoId = getVideoId();

        // Extract clean video title for SRT filename
        let videoTitle = 'buttercup_subtitles';
        try {
            // Try multiple methods to get the video title

            // Method 1: YouTube's player response (most complete)
            if (window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.videoDetails) {
                const playerTitle = window.ytInitialPlayerResponse.videoDetails.title;
                if (playerTitle && playerTitle.trim()) {
                    videoTitle = playerTitle.trim();
                    console.info('[Buttercup] Video title extracted from ytInitialPlayerResponse:', videoTitle);
                }
            }
            // Method 2: YouTube's main title element
            else {
                const titleElement = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.ytd-video-primary-info-renderer yt-formatted-string, yt-formatted-string.ytd-watch-metadata, #title h1 yt-formatted-string, ytd-watch-metadata h1');
                if (titleElement && titleElement.textContent && titleElement.textContent.trim()) {
                    videoTitle = titleElement.textContent.trim();
                    console.info('[Buttercup] Video title extracted from DOM:', videoTitle);
                }
                // Method 3: Meta tag
                else {
                    const titleMeta = document.querySelector('meta[name="title"], meta[property="og:title"]');
                    if (titleMeta && titleMeta.content && titleMeta.content.trim()) {
                        videoTitle = titleMeta.content.trim();
                        console.info('[Buttercup] Video title extracted from meta tag:', videoTitle);
                    }
                    // Method 4: Fallback to document.title with cleanup
                    else {
                        const docTitle = document.title;
                        if (docTitle && docTitle.trim()) {
                            videoTitle = docTitle
                                .replace(/\s*[-–—]\s*YouTube\s*$/, '')  // Remove " - YouTube" suffix
                                .replace(/^\(\d+\)\s*/, '')              // Remove "(7) " prefix
                                .trim();
                            console.info('[Buttercup] Video title extracted from document.title:', videoTitle);
                        }
                    }
                }
            }

            // Final validation
            if (!videoTitle || videoTitle === '') {
                videoTitle = 'buttercup_subtitles';
                console.warn('[Buttercup] Could not extract video title, using default');
            }
        } catch (error) {
            console.warn('[Buttercup] Error extracting video title:', error);
            videoTitle = 'buttercup_subtitles';
        }

        // For non-YouTube sites, pass the full URL instead of just video ID
        // This allows yt-dlp to handle the download for any supported platform
        const hostname = window.location.hostname;
        const isYouTube = hostname.includes('youtube.com') || hostname.includes('youtu.be');
        const videoUrlOrId = isYouTube ? videoId : window.location.href;

        console.info('[Buttercup] Processing video:', { isYouTube, videoUrlOrId: videoUrlOrId.substring(0, 100) });

        transcriptionHandler.processVideo(
            videoUrlOrId,
            TRANSLATE,
            // Progress callback
            (message) => {
                console.info(`[Buttercup] ${message}`);

                // Update progress based on message
                if (progressIndicator) {
                    if (message.includes('Downloading')) {
                        progressIndicator.setStepInProgress(0, message);
                    } else if (message.includes('Transcribing')) {
                        progressIndicator.completeStep(0);
                        progressIndicator.setStepInProgress(1, message);
                    }
                }
            },
            // Success callback
            async (youtubeFormat) => {
                console.info('[Buttercup] Transcription successful');

                // Mark transcription as complete
                if (progressIndicator) {
                    progressIndicator.completeStep(1);
                }

                // Display quality report if there are warnings
                if (youtubeFormat.qualityReport && youtubeFormat.qualityReport.hasWarnings) {
                    if (window.QualityReport) {
                        const qualityReport = new window.QualityReport(youtubeFormat.qualityReport);
                        window.buttercupQualityReport = qualityReport;
                        console.info('[Buttercup] ⚠️ Quality warnings detected and displayed');
                    }
                }

                customSubtitle = JSON.stringify(youtubeFormat);

                let finalCaptionData = youtubeFormat;
                let currentStepIndex = 2; // Start at step 2 (translation or caption creation)

                // Check if LLM translation is enabled
                if (llmTranslationEnabled && llmApiKey && llmModel && llmTargetLanguage) {
                    try {
                        if (progressIndicator) {
                            progressIndicator.setStepInProgress(currentStepIndex, `Translating to ${llmTargetLanguage}...`);
                        }

                        console.info(`[Buttercup] 🌐 Translating captions to ${llmTargetLanguage}...`);

                        // Create LLM translation instance
                        const translator = new window.LLMTranslation(llmProvider, llmApiKey, llmModel);

                        // Build video context for better translation
                        const videoContext = {
                            title: videoTitle || 'Unknown',
                            duration: youtubeFormat.events && youtubeFormat.events.length > 0
                                ? `${Math.round(youtubeFormat.events[youtubeFormat.events.length - 1].tStartMs / 1000)}s`
                                : 'Unknown'
                        };

                        // Translate the caption events with full video context
                        const translatedEvents = await translator.translateCaptions(
                            youtubeFormat.events,
                            llmTargetLanguage,
                            videoContext
                        );

                        // Update caption data with translations
                        finalCaptionData = {
                            ...youtubeFormat,
                            events: translatedEvents
                        };

                        console.info('[Buttercup] ✓ Translation complete!');

                        if (progressIndicator) {
                            progressIndicator.completeStep(currentStepIndex);
                            currentStepIndex++;
                        }
                    } catch (error) {
                        console.error('[Buttercup] ✗ Translation error:', error);
                        showErrorSnackbar(`Translation error: ${error.message}`);

                        if (progressIndicator) {
                            progressIndicator.failStep(currentStepIndex, error.message);
                            // Still move to next step with untranslated captions
                            currentStepIndex++;
                        }
                    }
                }

                // NEW APPROACH: Use custom caption overlay instead of hijacking YouTube's system
                // This completely bypasses YouTube's complex caption API
                try {
                    console.info('[Buttercup] 🎯 Creating custom caption overlay');

                    // Update progress: Creating captions
                    if (progressIndicator) {
                        progressIndicator.setStepInProgress(currentStepIndex, 'Creating custom caption overlay...');
                    }

                    // Instantiate the custom caption overlay with the transcription data (translated or original)
                    if (window.CustomCaptionOverlay) {
                        const captionOverlay = new window.CustomCaptionOverlay(finalCaptionData, true, currentVideoId);
                        console.info('[Buttercup] ✓ Custom caption overlay created successfully');

                        // Store reference globally so it can be toggled later if needed
                        window.buttercupCaptionOverlay = captionOverlay;

                        // Create transcript search interface
                        if (window.TranscriptSearch) {
                            // Destroy old instance if exists (prevents duplicate event listeners)
                            if (window.buttercupTranscriptSearch) {
                                window.buttercupTranscriptSearch.destroy();
                                window.buttercupTranscriptSearch = null;
                            }

                            const transcriptSearch = new window.TranscriptSearch(finalCaptionData);
                            window.buttercupTranscriptSearch = transcriptSearch;
                            console.info('[Buttercup] ✓ Transcript search initialized (Press Ctrl+F to search)');
                        }

                        // Mark caption creation as complete
                        if (progressIndicator) {
                            progressIndicator.completeStep(currentStepIndex);
                            currentStepIndex++;
                        }
                    } else {
                        console.error('[Buttercup] ✗ CustomCaptionOverlay class not found! Make sure caption-overlay.js is loaded.');
                        if (progressIndicator) {
                            progressIndicator.failStep(currentStepIndex, 'CustomCaptionOverlay not found');
                            currentStepIndex++;
                        }
                    }
                } catch (error) {
                    console.error('[Buttercup] ✗ Error creating caption overlay:', error);
                    if (progressIndicator) {
                        progressIndicator.failStep(currentStepIndex, error.message);
                        currentStepIndex++;
                    }
                }

                // Save transcript to storage (only if cache enabled)
                if (USE_CACHE && transcriptStorage && currentVideoId) {
                    try {
                        console.info('[Buttercup] 💾 Saving transcript to storage...');

                        // Update progress: Saving transcript
                        if (progressIndicator) {
                            progressIndicator.setStepInProgress(currentStepIndex, 'Saving transcript to storage...');
                        }

                        // Helper function to extract main domain name
                        function extractMainDomain(hostname) {
                            const withoutWww = hostname.replace(/^www\./, '');
                            const parts = withoutWww.split('.');
                            if (parts.length <= 2) return parts[0];
                            const knownTLDs = ['co.uk', 'com.au', 'co.jp', 'co.nz', 'com.br', 'co.za'];
                            const lastTwo = parts.slice(-2).join('.');
                            if (knownTLDs.includes(lastTwo)) {
                                return parts[parts.length - 3] || parts[0];
                            }
                            return parts[parts.length - 2];
                        }

                        // Detect platform for storage
                        const currentHostname = window.location.hostname;
                        const platformName = currentHostname.includes('youtube') || currentHostname.includes('youtu.be')
                            ? 'YouTube'
                            : extractMainDomain(currentHostname).charAt(0).toUpperCase() +
                              extractMainDomain(currentHostname).slice(1);

                        await transcriptStorage.saveTranscript(currentVideoId, {
                            captionData: finalCaptionData,
                            srtData: transcriptStorage.generateSRT(finalCaptionData),
                            videoTitle: videoTitle,
                            videoUrl: window.location.href,  // Save original URL for any platform
                            platform: platformName,
                            source: 'web',  // Mark as web-transcribed
                            translationSettings: {
                                enabled: llmTranslationEnabled,
                                targetLanguage: llmTargetLanguage,
                                provider: llmProvider
                            }
                        });
                        console.info('[Buttercup] ✓ Transcript saved successfully');

                        // Mark saving as complete
                        if (progressIndicator) {
                            progressIndicator.completeStep(currentStepIndex);
                            currentStepIndex++;
                        }
                    } catch (error) {
                        console.error('[Buttercup] ✗ Error saving transcript:', error);
                        if (progressIndicator) {
                            progressIndicator.failStep(currentStepIndex, error.message);
                            currentStepIndex++;
                        }
                    }
                } else if (!USE_CACHE) {
                    console.info('[Buttercup] Cache disabled, skipping transcript save');
                }

                // Generate SRT if needed (use translated version if available)
                if (DOWNLOAD_SRT) {
                    const srtFilename = videoTitle + '.srt';
                    transcriptionHandler.generateSRT(finalCaptionData, srtFilename);
                }

                // All steps complete!
                if (progressIndicator) {
                    progressIndicator.complete();
                }
            },
            // Error callback
            (error) => {
                console.error('[Buttercup] Transcription error: ', error);
                showErrorSnackbar(`Transcription error: ${error.message || 'Unknown error'}`);

                // Show error in progress indicator
                if (progressIndicator) {
                    progressIndicator.failStep(progressIndicator.currentStep, error.message || 'Unknown error');
                }
            }
        );
    }

    function clickSubtitleButton() {
        const button = document.getElementsByClassName(BUTTON_CLASSNAME)[0];
        const player = document.getElementById('movie_player');

        if (player) {
            // Try multiple methods to activate captions
            console.info('[Buttercup] Attempting to activate captions via player API');

            // Method 1: Try to load our specific caption track
            try {
                if (player.loadModule) {
                    player.loadModule('captions');
                    console.info('[Buttercup] ✓ loadModule called');
                }
            } catch (e) {
                console.warn('[Buttercup] loadModule failed:', e);
            }

            // Method 2: Try setOption for captions
            try {
                if (player.setOption) {
                    player.setOption('captions', 'track', {'languageCode': 'en'});
                    console.info('[Buttercup] ✓ setOption called');
                }
            } catch (e) {
                console.warn('[Buttercup] setOption failed:', e);
            }

            // Method 3: Try to directly set caption track
            try {
                if (player.setOption) {
                    player.setOption('captions', 'reload', true);
                    console.info('[Buttercup] ✓ Caption reload triggered');
                }
            } catch (e) {
                console.warn('[Buttercup] Caption reload failed:', e);
            }
        }

        // Still click the button as fallback
        if (button) {
            console.info('[Buttercup] Clicking subtitle button as fallback');
            // Wait a bit to let the player update
            setTimeout(() => {
                button.click();
            }, 100);
        } else {
            console.error('[Buttercup] Could not find caption button element');
        }
    }

    function getVideoId() {
        const urlObject = new URL(window.location.href);
        const pathname = urlObject.pathname;
        const hostname = urlObject.hostname;

        // YouTube
        if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
            if (pathname.startsWith('/clip')) {
                return document.querySelector("meta[itemprop='videoId']").content;
            } else if (pathname.startsWith('/shorts')) {
                return pathname.slice(8);
            }
            return urlObject.searchParams.get('v') || pathname.slice(1); // youtu.be/ID
        }

        // Vimeo
        if (hostname.includes('vimeo.com')) {
            const match = pathname.match(/\/(\d+)/);
            return match ? match[1] : null;
        }

        // Dailymotion
        if (hostname.includes('dailymotion.com')) {
            const match = pathname.match(/\/video\/([a-zA-Z0-9]+)/);
            return match ? match[1] : null;
        }

        // Twitter/X
        if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
            const match = pathname.match(/\/status\/(\d+)/);
            return match ? match[1] : null;
        }

        // TikTok
        if (hostname.includes('tiktok.com')) {
            const match = pathname.match(/\/video\/(\d+)/);
            return match ? match[1] : null;
        }

        // Instagram
        if (hostname.includes('instagram.com')) {
            const match = pathname.match(/\/(?:p|reels?|tv)\/([a-zA-Z0-9_-]+)/);
            return match ? match[1] : null;
        }

        // Facebook - use URL hash as ID
        if (hostname.includes('facebook.com') || hostname.includes('fb.watch')) {
            // Facebook video URLs have the numeric ID at end of path
            // Use [0-9] instead of \d to avoid matching Arabic numerals
            const match = pathname.match(/\/([0-9]+)\/?$/);
            if (match) return match[1];
            // Fallback: generate hash from full URL
            let hash = 0;
            const url = window.location.href;
            for (let i = 0; i < url.length; i++) {
                hash = ((hash << 5) - hash) + url.charCodeAt(i);
                hash = hash & hash;
            }
            return Math.abs(hash).toString(36);
        }

        // For any other site, generate ID from URL
        let hash = 0;
        const url = window.location.href;
        for (let i = 0; i < url.length; i++) {
            hash = ((hash << 5) - hash) + url.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }
})();

// ============================================================================
// CLEANUP HANDLER FOR PAGE NAVIGATION (YouTube SPA)
// ============================================================================
// YouTube uses SPA (Single Page Application) navigation, so the page doesn't
// actually reload when navigating between videos. We need to cleanup old
// instances to prevent duplicate event listeners and memory leaks.

(function setupNavigationCleanup() {
    let lastUrl = window.location.href;

    // Listen for YouTube's navigation finish event
    document.addEventListener('yt-navigate-finish', () => {
        const currentUrl = window.location.href;

        // Only cleanup if we navigated to a different video
        if (currentUrl !== lastUrl) {
            console.info('[Buttercup] Navigation detected, cleaning up old instances...');

            // Cleanup old transcript search instance
            if (window.buttercupTranscriptSearch) {
                try {
                    window.buttercupTranscriptSearch.destroy();
                    window.buttercupTranscriptSearch = null;
                    console.info('[Buttercup] ✓ Old TranscriptSearch instance destroyed');
                } catch (error) {
                    console.warn('[Buttercup] Error destroying TranscriptSearch:', error);
                }
            }

            // Cleanup old caption overlay instance
            if (window.buttercupCaptionOverlay) {
                try {
                    window.buttercupCaptionOverlay.destroy();
                    window.buttercupCaptionOverlay = null;
                    console.info('[Buttercup] ✓ Old CaptionOverlay instance destroyed');
                } catch (error) {
                    console.warn('[Buttercup] Error destroying CaptionOverlay:', error);
                }
            }

            // Cleanup old summary sidebar instance
            if (window.buttercupSummarySidebar) {
                try {
                    window.buttercupSummarySidebar.destroy();
                    window.buttercupSummarySidebar = null;
                    console.info('[Buttercup] ✓ Old SummarySidebar instance destroyed');
                } catch (error) {
                    console.warn('[Buttercup] Error destroying SummarySidebar:', error);
                }
            }

            lastUrl = currentUrl;
        }
    });

    // Fallback: also listen for URL changes via popstate (browser back/forward)
    window.addEventListener('popstate', () => {
        const currentUrl = window.location.href;

        if (currentUrl !== lastUrl && currentUrl.includes('youtube.com/watch')) {
            console.info('[Buttercup] Popstate detected, cleaning up old instances...');

            if (window.buttercupTranscriptSearch) {
                try {
                    window.buttercupTranscriptSearch.destroy();
                    window.buttercupTranscriptSearch = null;
                } catch (error) {
                    console.warn('[Buttercup] Error destroying TranscriptSearch:', error);
                }
            }

            lastUrl = currentUrl;
        }
    });

    console.info('[Buttercup] ✓ Navigation cleanup handler initialized');
})();
