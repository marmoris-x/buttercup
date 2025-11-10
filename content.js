// Create and inject API scripts
const apiScripts = [
    'api/cobalt.js',
    'api/groq.js',
    'api/config.js',
    'api/transcription.js',
    'api/llm-translation.js',
    'api/transcript-storage.js',
    'api/ai-summary.js'
];

// Inject API scripts first
apiScripts.forEach(scriptPath => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(scriptPath);
    document.documentElement.prepend(script);
});

// Inject the custom caption overlay script
const overlayScript = document.createElement('script');
overlayScript.src = chrome.runtime.getURL('caption-overlay.js');
document.documentElement.prepend(overlayScript);

// Inject the summary sidebar script
const sidebarScript = document.createElement('script');
sidebarScript.src = chrome.runtime.getURL('summary-sidebar.js');
document.documentElement.prepend(sidebarScript);

// Inject the progress indicator script
const progressScript = document.createElement('script');
progressScript.src = chrome.runtime.getURL('progress-indicator.js');
document.documentElement.prepend(progressScript);

// Then inject the main script
const mainScript = document.createElement('script');
mainScript.src = chrome.runtime.getURL('buttercup.js');
document.documentElement.prepend(mainScript);

// Initialize default settings if not set
// Batch all settings checks into a single operation for better performance
chrome.storage.sync.get([
    'buttercup_translate',
    'buttercup_enabled',
    'buttercup_cache',
    'buttercup_download_srt',
    'buttercup_groq_model',
    'buttercup_use_word_timestamps',
    'buttercup_words_per_line',
    'buttercup_max_line_length',
    'buttercup_prompt',
    'buttercup_language',
    'buttercup_temperature',
    'buttercup_response_format',
    'buttercup_caption_font_size',
    'buttercup_caption_position',
    'buttercup_caption_font_color',
    'buttercup_caption_bg_color',
    'buttercup_caption_bg_opacity',
    'buttercup_caption_font_family',
    'buttercup_auto_transcribe'
], function (result) {
    if (chrome.runtime.lastError) {
        console.error('[Buttercup] Error loading settings:', chrome.runtime.lastError);
        return;
    }

    const defaultSettings = {};

    if (result.buttercup_translate === undefined) {
        defaultSettings.buttercup_translate = false;
    }

    if (result.buttercup_enabled === undefined) {
        defaultSettings.buttercup_enabled = true;
    }

    if (result.buttercup_cache === undefined) {
        defaultSettings.buttercup_cache = true;
    }

    if (result.buttercup_download_srt === undefined) {
        defaultSettings.buttercup_download_srt = false;
    }

    if (result.buttercup_groq_model === undefined) {
        defaultSettings.buttercup_groq_model = 'whisper-large-v3';
    }

    if (result.buttercup_use_word_timestamps === undefined) {
        defaultSettings.buttercup_use_word_timestamps = true;
    }

    if (result.buttercup_words_per_line === undefined) {
        defaultSettings.buttercup_words_per_line = 16;
    }

    if (result.buttercup_max_line_length === undefined) {
        defaultSettings.buttercup_max_line_length = 8;
    } else if (result.buttercup_max_line_length > 20) {
        // Convert old character-based setting to word-based setting
        defaultSettings.buttercup_max_line_length = 6;
    }

    if (result.buttercup_prompt === undefined) {
        defaultSettings.buttercup_prompt = "";
    }

    if (result.buttercup_language === undefined) {
        defaultSettings.buttercup_language = 'auto';
    }

    if (result.buttercup_temperature === undefined) {
        defaultSettings.buttercup_temperature = 0;
    }

    if (result.buttercup_response_format === undefined) {
        defaultSettings.buttercup_response_format = 'verbose_json';
    }

    // Caption overlay defaults
    if (result.buttercup_caption_font_size === undefined) {
        defaultSettings.buttercup_caption_font_size = 22;
    }

    if (result.buttercup_caption_position === undefined) {
        defaultSettings.buttercup_caption_position = 'bottom';
    }

    if (result.buttercup_caption_font_color === undefined) {
        defaultSettings.buttercup_caption_font_color = '#ffffff';
    }

    if (result.buttercup_caption_bg_color === undefined) {
        defaultSettings.buttercup_caption_bg_color = '#080808';
    }

    if (result.buttercup_caption_bg_opacity === undefined) {
        defaultSettings.buttercup_caption_bg_opacity = 0.90;
    }

    if (result.buttercup_caption_font_family === undefined) {
        defaultSettings.buttercup_caption_font_family = '"YouTube Noto", Roboto, "Arial Unicode Ms", Arial, Helvetica, Verdana, sans-serif';
    }

    if (result.buttercup_auto_transcribe === undefined) {
        defaultSettings.buttercup_auto_transcribe = false; // Default: disabled for safety
    }

    // Set all defaults in a single operation
    if (Object.keys(defaultSettings).length > 0) {
        chrome.storage.sync.set(defaultSettings, function () {
            if (chrome.runtime.lastError) {
                console.error('[Buttercup] Error setting default settings:', chrome.runtime.lastError);
            } else {
                console.info('[Buttercup] Default settings initialized');
            }
        });
    }
});

// Listen for the custom event to save settings
document.addEventListener('buttercupSaveSetting', function (e) {
    if (e.detail && e.detail.key && e.detail.value !== undefined) {
        const settingObj = {};
        settingObj[e.detail.key] = e.detail.value;
        chrome.storage.sync.set(settingObj);
        console.info(`[Buttercup] Saved setting: ${e.detail.key}`);
    }
});

// Listen for the custom event
document.addEventListener('requestButtercupTranslate', function () {
    chrome.storage.sync.get(['buttercup_translate'], function (result) {
        const translate = result.buttercup_translate;
        // Send the value back to the page
        document.dispatchEvent(new CustomEvent('responseButtercupTranslate', { detail: translate }));
    });
});

document.addEventListener('requestButtercupEnabled', function () {
    chrome.storage.sync.get(['buttercup_enabled'], function (result) {
        const enabled = result.buttercup_enabled;
        // Send the value back to the page
        document.dispatchEvent(new CustomEvent('responseButtercupEnabled', { detail: enabled }));
    });
});

document.addEventListener('requestButtercupCache', function () {
    chrome.storage.sync.get(['buttercup_cache'], function (result) {
        const cache = result.buttercup_cache;
        // Send the value back to the page
        document.dispatchEvent(new CustomEvent('responseButtercupCache', { detail: cache }));
    });
});

document.addEventListener('requestButtercupDownloadSrt', function () {
    chrome.storage.sync.get(['buttercup_download_srt'], function (result) {
        const download = result.buttercup_download_srt;
        // Send the value back to the page
        document.dispatchEvent(new CustomEvent('responseButtercupDownloadSrt', { detail: download }));
    });
});

document.addEventListener('requestButtercupAutoTranscribe', function () {
    chrome.storage.sync.get(['buttercup_auto_transcribe'], function (result) {
        const autoTranscribe = result.buttercup_auto_transcribe || false;
        // Send the value back to the page
        document.dispatchEvent(new CustomEvent('responseButtercupAutoTranscribe', { detail: autoTranscribe }));
    });
});

// Listen for API settings requests
document.addEventListener('requestButtercupApiSettings', function () {
    chrome.storage.sync.get([
        'buttercup_groq_api_key',
        'buttercup_groq_model',
        'buttercup_use_word_timestamps',
        'buttercup_words_per_line',
        'buttercup_max_line_length',
        'buttercup_prompt',
        'buttercup_language',
        'buttercup_temperature',
        'buttercup_response_format',
        'buttercup_llm_translation_enabled',
        'buttercup_llm_target_language',
        'buttercup_llm_provider',
        'buttercup_llm_api_key',
        'buttercup_llm_model'
    ], function (result) {
        // Send the values back to the page
        document.dispatchEvent(new CustomEvent('responseButtercupApiSettings', {
            detail: {
                groqApiKey: result.buttercup_groq_api_key || '',
                groqModel: result.buttercup_groq_model || 'whisper-large-v3',
                useWordTimestamps: result.buttercup_use_word_timestamps !== false,
                wordsPerLine: result.buttercup_words_per_line || 12,
                maxLineLength: result.buttercup_max_line_length || 8,
                prompt: result.buttercup_prompt || "",
                language: result.buttercup_language || 'auto',
                temperature: result.buttercup_temperature !== undefined ? result.buttercup_temperature : 0,
                responseFormat: result.buttercup_response_format || 'verbose_json',
                llmTranslationEnabled: result.buttercup_llm_translation_enabled === true,
                llmTargetLanguage: result.buttercup_llm_target_language || '',
                llmProvider: result.buttercup_llm_provider || 'openai',
                llmApiKey: result.buttercup_llm_api_key || '',
                llmModel: result.buttercup_llm_model || ''
            }
        }));
    });
});

// Listen for caption overlay settings requests
document.addEventListener('requestButtercupCaptionSettings', function () {
    chrome.storage.sync.get([
        'buttercup_caption_font_size',
        'buttercup_caption_position',
        'buttercup_caption_font_color',
        'buttercup_caption_bg_color',
        'buttercup_caption_bg_opacity',
        'buttercup_caption_font_family'
    ], function (result) {
        // Send the values back to the page
        document.dispatchEvent(new CustomEvent('responseButtercupCaptionSettings', {
            detail: {
                fontSize: result.buttercup_caption_font_size || 22,
                position: result.buttercup_caption_position || 'bottom',
                fontColor: result.buttercup_caption_font_color || '#ffffff',
                backgroundColor: result.buttercup_caption_bg_color || '#080808',
                backgroundOpacity: result.buttercup_caption_bg_opacity !== undefined ? result.buttercup_caption_bg_opacity : 0.90,
                fontFamily: result.buttercup_caption_font_family || '"YouTube Noto", Roboto, "Arial Unicode Ms", Arial, Helvetica, Verdana, sans-serif'
            }
        }));
    });
});

// Listen for error notification requests
document.addEventListener('buttercupShowError', function (e) {
    if (e.detail && e.detail.message) {
        const message = e.detail.message;

        // Create snackbar element directly in the content script
        const snackbar = document.createElement('div');
        snackbar.style.position = 'fixed';
        snackbar.style.bottom = '20px';
        snackbar.style.left = '50%';
        snackbar.style.transform = 'translateX(-50%)';
        snackbar.style.backgroundColor = '#f44336';
        snackbar.style.color = 'white';
        snackbar.style.padding = '16px';
        snackbar.style.borderRadius = '4px';
        snackbar.style.zIndex = '9999';
        snackbar.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
        snackbar.style.minWidth = '250px';
        snackbar.style.textAlign = 'center';
        snackbar.textContent = `Buttercup Error: ${message}`;

        // Add to page
        document.body.appendChild(snackbar);

        // Remove after 5 seconds
        setTimeout(() => {
            if (document.body.contains(snackbar)) {
                document.body.removeChild(snackbar);
            }
        }, 5000);
    }
});

// Listen for storage requests from injected scripts
document.addEventListener('buttercupStorageRequest', function (e) {
    if (!e.detail) return;

    const { action, key, data, requestId } = e.detail;

    if (action === 'get') {
        // Get data from chrome.storage.local
        chrome.storage.local.get([key], (result) => {
            document.dispatchEvent(new CustomEvent('buttercupStorageResponse', {
                detail: {
                    requestId: requestId,
                    data: result[key] || {}
                }
            }));
        });
    } else if (action === 'set') {
        // Set data to chrome.storage.local
        const storageObj = {};
        storageObj[key] = data;
        chrome.storage.local.set(storageObj, () => {
            document.dispatchEvent(new CustomEvent('buttercupStorageResponse', {
                detail: {
                    requestId: requestId,
                    success: true
                }
            }));
        });
    }
});

document.dispatchEvent(new CustomEvent('buttercupSettingsChanged'));
