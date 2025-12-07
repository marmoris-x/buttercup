// Script loading order is CRITICAL!
// Using prepend() means scripts are loaded in REVERSE order
// So we prepend in reverse order to get the correct loading sequence

// Define all scripts in the order they should LOAD (first to last)
const scriptsInLoadOrder = [
    'logger.js',              // Must be first - logging utilities
    'video-id-utils.js',      // Video ID extraction utilities
    'video-detector.js',      // Universal video detection
    'rate-limiter.js',        // Rate limiting for API calls
    'rate-limit-tracker.js',  // Groq rate limit tracking & multi-key support
    'batch-processor.js',     // Batch processing
    'api/config.js',          // CRITICAL: APIConfig class - must load before other API scripts
    'api/cobalt.js',
    'api/groq.js',
    'api/transcription.js',
    'api/llm-translation.js',
    'api/transcript-storage.js',
    'api/ai-summary.js',
    'caption-overlay.js',     // Caption overlay UI
    'summary-sidebar.js',     // Summary sidebar UI
    'progress-indicator.js',  // Progress indicator UI
    'transcript-search.js',   // Transcript search UI
    'quality-report.js',      // Quality report UI
    'buttercup.js'            // Main script - must load LAST
];

// Reverse the array and prepend each script
// This ensures they load in the correct order (first to last)
scriptsInLoadOrder.reverse().forEach(scriptPath => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(scriptPath);
    document.documentElement.prepend(script);
});


// ============================================================================
// LOG STORAGE HANDLER (Message Bridge)
// ============================================================================
// This handler receives log messages from page context (via window.postMessage)
// and stores them in chrome.storage.local with batch processing for performance

(function() {
    const LOG_BATCH_INTERVAL = 1000; // Batch logs every 1 second
    const MAX_LOGS = 500; // Maximum logs to keep in storage
    let logBatch = [];
    let batchTimer = null;
    let isSaving = false;

    /**
     * Save batched logs to chrome.storage.local
     */
    async function saveBatchedLogs() {
        if (logBatch.length === 0 || isSaving) {
            return;
        }

        isSaving = true;
        const logsToSave = [...logBatch];
        logBatch = []; // Clear batch immediately

        try {
            // Get existing logs
            const result = await chrome.storage.local.get(['buttercup_logs']);
            let logs = result.buttercup_logs || [];

            // Add new logs
            logs.push(...logsToSave);

            // Rotate if exceeding max
            if (logs.length > MAX_LOGS) {
                logs = logs.slice(-MAX_LOGS);
            }

            // Save back to storage
            await chrome.storage.local.set({ buttercup_logs: logs });

            console.log(`[ContentScript] 📝 Saved ${logsToSave.length} logs (total: ${logs.length})`);
        } catch (error) {
            console.error('[ContentScript] ❌ Failed to save logs:', error);
            // Re-add logs to batch for retry
            logBatch.unshift(...logsToSave);
        } finally {
            isSaving = false;
        }
    }

    /**
     * Add log to batch and schedule save
     */
    function addLogToBatch(logEntry) {
        logBatch.push(logEntry);

        // Schedule batch save if not already scheduled
        if (!batchTimer) {
            batchTimer = setTimeout(() => {
                batchTimer = null;
                saveBatchedLogs();
            }, LOG_BATCH_INTERVAL);
        }
    }

    /**
     * Listen for log messages from page context
     */
    window.addEventListener('message', (event) => {
        // Security: Only accept messages from same origin
        if (event.source !== window) {
            return;
        }

        // Filter for Buttercup log messages
        if (event.data &&
            event.data.type === 'BUTTERCUP_LOG_SAVE' &&
            event.data.source === 'buttercup-logger' &&
            event.data.log) {

            addLogToBatch(event.data.log);
        }
    }, false);

    // Save any remaining logs when page unloads
    window.addEventListener('beforeunload', () => {
        if (logBatch.length > 0) {
            // Force immediate save (synchronous)
            saveBatchedLogs();
        }
    });

    console.log('[ContentScript] 🎯 Log storage handler initialized (batch interval: 1s, max logs: 500)');
})();


// ============================================================================
// LOG LEVEL CONTROL BRIDGE
// ============================================================================
// Bridge to forward log level changes from popup to page context

/**
 * Helper function to set log level in page context
 * Can be called from popup via chrome.scripting.executeScript
 */
window.setPageLogLevel = function(level) {
    // Send message to page context to update logger
    window.postMessage({
        type: 'BUTTERCUP_LOG_LEVEL_CHANGE',
        source: 'buttercup-content-script',
        level: level
    }, '*');

    console.log(`[ContentScript] 📝 Forwarding log level change to page context: ${level}`);
};


// Initialize default settings if not set
// Batch all settings checks into a single operation for better performance
// Safety check for extension context
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
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
        'buttercup_caption_vertical_position',
        'buttercup_caption_horizontal_position',
        'buttercup_caption_font_color',
        'buttercup_caption_bg_color',
        'buttercup_caption_bg_opacity',
        'buttercup_caption_container_width',
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

    if (result.buttercup_caption_vertical_position === undefined) {
        defaultSettings.buttercup_caption_vertical_position = 15; // 15% from bottom
    }

    if (result.buttercup_caption_horizontal_position === undefined) {
        defaultSettings.buttercup_caption_horizontal_position = 'center';
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

    if (result.buttercup_caption_container_width === undefined) {
        defaultSettings.buttercup_caption_container_width = 80; // 80% max width
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
} else {
    console.warn('[Buttercup] Extension context not available, settings not loaded');
}

// Listen for the custom event to save settings
document.addEventListener('buttercupSaveSetting', function (e) {
    if (e.detail && e.detail.key && e.detail.value !== undefined) {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
            const settingObj = {};
            settingObj[e.detail.key] = e.detail.value;
            chrome.storage.sync.set(settingObj);
            console.info(`[Buttercup] Saved setting: ${e.detail.key}`);
        }
    }
});

// Listen for the custom event
document.addEventListener('requestButtercupTranslate', function () {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get(['buttercup_translate'], function (result) {
            const translate = result.buttercup_translate;
            // Send the value back to the page
            document.dispatchEvent(new CustomEvent('responseButtercupTranslate', { detail: translate }));
        });
    }
});

document.addEventListener('requestButtercupEnabled', function () {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get(['buttercup_enabled'], function (result) {
            const enabled = result.buttercup_enabled;
            // Send the value back to the page
            document.dispatchEvent(new CustomEvent('responseButtercupEnabled', { detail: enabled }));
        });
    }
});

document.addEventListener('requestButtercupCache', function () {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get(['buttercup_cache'], function (result) {
            const cache = result.buttercup_cache;
            // Send the value back to the page
            document.dispatchEvent(new CustomEvent('responseButtercupCache', { detail: cache }));
        });
    }
});

document.addEventListener('requestButtercupDownloadSrt', function () {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get(['buttercup_download_srt'], function (result) {
            const download = result.buttercup_download_srt;
            // Send the value back to the page
            document.dispatchEvent(new CustomEvent('responseButtercupDownloadSrt', { detail: download }));
        });
    }
});

document.addEventListener('requestButtercupAutoTranscribe', function () {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get(['buttercup_auto_transcribe'], function (result) {
            const autoTranscribe = result.buttercup_auto_transcribe || false;
            // Send the value back to the page
            document.dispatchEvent(new CustomEvent('responseButtercupAutoTranscribe', { detail: autoTranscribe }));
        });
    }
});

// Listen for API settings requests
document.addEventListener('requestButtercupApiSettings', function () {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
        return;
    }
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
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
        return;
    }
    chrome.storage.sync.get([
        'buttercup_caption_font_size',
        'buttercup_caption_vertical_position',
        'buttercup_caption_horizontal_position',
        'buttercup_caption_font_color',
        'buttercup_caption_bg_color',
        'buttercup_caption_bg_opacity',
        'buttercup_caption_container_width',
        'buttercup_caption_font_family'
    ], function (result) {
        // Send the values back to the page
        document.dispatchEvent(new CustomEvent('responseButtercupCaptionSettings', {
            detail: {
                fontSize: result.buttercup_caption_font_size || 22,
                verticalPosition: result.buttercup_caption_vertical_position !== undefined ? result.buttercup_caption_vertical_position : 15,
                horizontalPosition: result.buttercup_caption_horizontal_position || 'center',
                fontColor: result.buttercup_caption_font_color || '#ffffff',
                backgroundColor: result.buttercup_caption_bg_color || '#080808',
                backgroundOpacity: result.buttercup_caption_bg_opacity !== undefined ? result.buttercup_caption_bg_opacity : 0.90,
                containerWidth: result.buttercup_caption_container_width !== undefined ? result.buttercup_caption_container_width : 80,
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

    const { action, key, data, requestId, storageType } = e.detail;
    const storage = storageType === 'sync' ? 'sync' : 'local'; // Default to local

    // Safety check for extension context
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage[storage]) {
        document.dispatchEvent(new CustomEvent('buttercupStorageResponse', {
            detail: {
                requestId: requestId,
                error: `Extension context not available or storage.${storage} not accessible`
            }
        }));
        return;
    }

    if (action === 'get') {
        // Get data from chrome.storage (local or sync)
        const keys = Array.isArray(key) ? key : [key];
        chrome.storage[storage].get(keys, (result) => {
            if (chrome.runtime.lastError) {
                document.dispatchEvent(new CustomEvent('buttercupStorageResponse', {
                    detail: {
                        requestId: requestId,
                        error: chrome.runtime.lastError.message
                    }
                }));
                return;
            }

            document.dispatchEvent(new CustomEvent('buttercupStorageResponse', {
                detail: {
                    requestId: requestId,
                    data: result
                }
            }));
        });
    } else if (action === 'set') {
        // Set data to chrome.storage (local or sync)
        const storageObj = {};
        storageObj[key] = data;
        chrome.storage[storage].set(storageObj, () => {
            if (chrome.runtime.lastError) {
                document.dispatchEvent(new CustomEvent('buttercupStorageResponse', {
                    detail: {
                        requestId: requestId,
                        error: chrome.runtime.lastError.message
                    }
                }));
                return;
            }

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

// CRITICAL: Chrome Storage Change Listener for LIVE caption settings updates
// This is MORE RELIABLE than message passing because it always works
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'sync') return;

        // Check if any caption settings changed
        const captionSettingsChanged =
            changes.buttercup_caption_font_size ||
            changes.buttercup_caption_vertical_position ||
            changes.buttercup_caption_horizontal_position ||
            changes.buttercup_caption_font_color ||
            changes.buttercup_caption_bg_color ||
            changes.buttercup_caption_bg_opacity ||
            changes.buttercup_caption_container_width;

        if (captionSettingsChanged) {
            // Build settings object with new values
            const settings = {};

            if (changes.buttercup_caption_font_size) {
                settings.fontSize = changes.buttercup_caption_font_size.newValue;
            }
            if (changes.buttercup_caption_vertical_position) {
                settings.verticalPosition = changes.buttercup_caption_vertical_position.newValue;
            }
            if (changes.buttercup_caption_horizontal_position) {
                settings.horizontalPosition = changes.buttercup_caption_horizontal_position.newValue;
            }
            if (changes.buttercup_caption_font_color) {
                settings.fontColor = changes.buttercup_caption_font_color.newValue;
            }
            if (changes.buttercup_caption_bg_color) {
                settings.backgroundColor = changes.buttercup_caption_bg_color.newValue;
            }
            if (changes.buttercup_caption_bg_opacity) {
                settings.backgroundOpacity = changes.buttercup_caption_bg_opacity.newValue;
            }
            if (changes.buttercup_caption_container_width) {
                settings.containerWidth = changes.buttercup_caption_container_width.newValue;
            }

            // CRITICAL: DIRECT function call - the ONLY way that ALWAYS works
            // Inject script that calls the global function directly
            const script = document.createElement('script');
            script.textContent = `
                (function() {
                    console.warn('[Buttercup] ⚡⚡⚡ STORAGE CHANGE DETECTED - Calling direct update');
                    if (typeof window.updateButtercupCaptionSettings === 'function') {
                        window.updateButtercupCaptionSettings(${JSON.stringify(settings)});
                        console.warn('[Buttercup] ✅ Direct update function called successfully');
                    } else {
                        console.error('[Buttercup] ❌ Global update function not found!');
                        // Fallback to event
                        document.dispatchEvent(new CustomEvent('buttercupCaptionSettingsChanged', {
                            detail: ${JSON.stringify(settings)}
                        }));
                    }
                })();
            `;
            (document.head || document.documentElement).appendChild(script);
            script.remove();

            console.info('[Buttercup] Caption settings updated via Storage listener:', settings);
        }
    });
}

// Listen for messages from popup and other components
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'BATCH_COMMAND') {
            const { command } = message;

            // Dispatch event to MAIN world where batchProcessor lives
            document.dispatchEvent(new CustomEvent('buttercupBatchCommand', {
                detail: { command: command }
            }));

            // Wait a bit for the command to be processed, then send response
            setTimeout(() => {
                sendResponse({ success: true });
            }, 100);

            return true; // Keep message channel open for async response
        }

        if (message.type === 'TOGGLE_CAPTIONS') {
            // Toggle captions visibility
            document.dispatchEvent(new CustomEvent('buttercupToggleCaptions', {
                detail: { isVisible: message.isVisible }
            }));

            sendResponse({ success: true });
            return true;
        }

        if (message.type === 'GET_CAPTION_STATE') {
            // Get current caption visibility state
            let responded = false;

            // Listen for response from overlay
            const listener = (e) => {
                if (!responded) {
                    responded = true;
                    sendResponse({ isVisible: e.detail.isVisible });
                    document.removeEventListener('buttercupCaptionStateResponse', listener);
                }
            };
            document.addEventListener('buttercupCaptionStateResponse', listener);

            // Request state from overlay
            document.dispatchEvent(new CustomEvent('buttercupCaptionStateRequest'));

            // Timeout: default to visible (true) if no response
            setTimeout(() => {
                if (!responded) {
                    responded = true;
                    document.removeEventListener('buttercupCaptionStateResponse', listener);
                    sendResponse({ isVisible: true }); // Default to visible
                }
            }, 500);

            return true; // Keep message channel open for async response
        }

        if (message.type === 'UPDATE_CAPTION_SETTINGS') {
            // CRITICAL: Update caption settings globally for all platforms
            // DIRECT function call - the ONLY reliable method
            if (message.settings) {
                // Create and inject script element that runs in MAIN world
                const script = document.createElement('script');
                script.textContent = `
                    (function() {
                        console.warn('[Buttercup] ⚡⚡⚡ MESSAGE RECEIVED - Calling direct update');
                        if (typeof window.updateButtercupCaptionSettings === 'function') {
                            window.updateButtercupCaptionSettings(${JSON.stringify(message.settings)});
                            console.warn('[Buttercup] ✅ Direct update via message successful');
                        } else {
                            console.error('[Buttercup] ❌ Global update function not found!');
                            // Fallback to event
                            document.dispatchEvent(new CustomEvent('buttercupCaptionSettingsChanged', {
                                detail: ${JSON.stringify(message.settings)}
                            }));
                        }
                    })();
                `;
                (document.head || document.documentElement).appendChild(script);
                script.remove();

                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: 'No settings provided' });
            }
            return true;
        }
    });
}
