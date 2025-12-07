// Helper function: Convert SRT to YouTube Format
function convertSrtToYoutubeFormat(srtData) {
    const events = [];

    // Split SRT into blocks (separated by double newlines)
    const blocks = srtData.trim().split(/\n\n+/);

    for (const block of blocks) {
        const lines = block.split('\n');
        if (lines.length < 3) continue; // Invalid block

        // Parse timing line (e.g., "00:00:00,540 --> 00:00:09,920")
        const timingLine = lines[1];
        const timingMatch = timingLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);

        if (!timingMatch) continue;

        const startHours = parseInt(timingMatch[1]);
        const startMinutes = parseInt(timingMatch[2]);
        const startSeconds = parseInt(timingMatch[3]);
        const startMs = parseInt(timingMatch[4]);

        const endHours = parseInt(timingMatch[5]);
        const endMinutes = parseInt(timingMatch[6]);
        const endSeconds = parseInt(timingMatch[7]);
        const endMs = parseInt(timingMatch[8]);

        const tStartMs = (startHours * 3600000) + (startMinutes * 60000) + (startSeconds * 1000) + startMs;
        const tEndMs = (endHours * 3600000) + (endMinutes * 60000) + (endSeconds * 1000) + endMs;
        const dDurationMs = tEndMs - tStartMs;

        // Text is everything after the timing line
        const text = lines.slice(2).join('\n');

        events.push({
            tStartMs: tStartMs,
            dDurationMs: dDurationMs,
            segs: [{ utf8: text }]
        });
    }

    return { events };
}

// General settings elements
const enabled = document.getElementById('enabled');
const translate = document.getElementById('translate');
const translateContainer = document.getElementById('translate-container');
const cache = document.getElementById('cache');
const download = document.getElementById('download');
const autoTranscribe = document.getElementById('auto-transcribe');
const language = document.getElementById('language');
const startTranscription = document.getElementById('start-transcription');

// API settings elements
let groqKeyManager = null; // Will be initialized when API tab is loaded
const groqModel = document.getElementById('groq-model');
const modelTranslationNote = document.getElementById('model-translation-note');
const saveApiSettings = document.getElementById('save-api-settings');

// LLM Translation settings elements
const llmTranslationEnabled = document.getElementById('llm-translation-enabled');
const llmTranslationSettings = document.getElementById('llm-translation-settings');
const llmTargetLanguage = document.getElementById('llm-target-language');
const llmProvider = document.getElementById('llm-provider');
const llmApiKey = document.getElementById('llm-api-key');
const llmModel = document.getElementById('llm-model');

// Advanced settings elements
const captionFontSize = document.getElementById('caption-font-size');
const fontSizeValue = document.getElementById('font-size-value');
const captionVerticalPosition = document.getElementById('caption-vertical-position');
const captionVerticalValue = document.getElementById('caption-vertical-value');
const captionHorizontalPosition = document.getElementById('caption-horizontal-position');
const captionHorizontalValue = document.getElementById('caption-horizontal-value');
const captionFontColor = document.getElementById('caption-font-color');
const captionFontColorText = document.getElementById('caption-font-color-text');
const captionBgColor = document.getElementById('caption-bg-color');
const captionBgColorText = document.getElementById('caption-bg-color-text');
const captionBgOpacity = document.getElementById('caption-bg-opacity');
const captionOpacityValue = document.getElementById('caption-opacity-value');
const captionContainerWidth = document.getElementById('caption-container-width');
const captionWidthValue = document.getElementById('caption-width-value');
const captionPreview = document.getElementById('caption-preview');
const darkMode = document.getElementById('dark-mode');
const useWordTimestamps = document.getElementById('use-word-timestamps');
const wordTimestampSettings = document.getElementById('word-timestamp-settings');
const wordsPerLine = document.getElementById('words-per-line');
const maxLineLength = document.getElementById('max-line-length');
const modelPrompt = document.getElementById('model-prompt');
const temperature = document.getElementById('temperature');
const responseFormat = document.getElementById('response-format');
const saveAdvancedSettings = document.getElementById('save-advanced-settings');

// Tab navigation elements
const tabGeneral = document.getElementById('tab-general');
const tabTranscript = document.getElementById('tab-transcript');
const tabUpload = document.getElementById('tab-upload');
const tabBatch = document.getElementById('tab-batch');
const tabApi = document.getElementById('tab-api');
const tabAdvanced = document.getElementById('tab-advanced');
const tabLogs = document.getElementById('tab-logs');
const generalTabContent = document.getElementById('general-tab');
const transcriptTabContent = document.getElementById('transcript-tab');
const uploadTabContent = document.getElementById('upload-tab');
const batchTabContent = document.getElementById('batch-tab');
const apiTabContent = document.getElementById('api-tab');
const advancedTabContent = document.getElementById('advanced-tab');
const logsTabContent = document.getElementById('logs-tab');

// Transcript tab elements
const currentVideoIdEl = document.getElementById('current-video-id');
const transcriptStatusBadge = document.getElementById('transcript-status-badge');
const transcriptDate = document.getElementById('transcript-date');
const captionToggleContainer = document.getElementById('caption-toggle-container');
const captionVisibilityToggle = document.getElementById('caption-visibility-toggle');
const captionStatusText = document.getElementById('caption-status-text');
const summaryStatusContainer = document.getElementById('summary-status-container');
const showExistingSummary = document.getElementById('show-existing-summary');
const deleteExistingSummary = document.getElementById('delete-existing-summary');
const exportActions = document.getElementById('export-actions');
const exportSrt = document.getElementById('export-srt');
const exportVtt = document.getElementById('export-vtt');
const exportTxt = document.getElementById('export-txt');
const exportJson = document.getElementById('export-json');
const copyToClipboard = document.getElementById('copy-to-clipboard');
const transcriptActions = document.getElementById('transcript-actions');
const viewEditTranscript = document.getElementById('view-edit-transcript');
const deleteTranscript = document.getElementById('delete-transcript');
const generateSummary = document.getElementById('generate-summary');
const storageCount = document.getElementById('storage-count');
const storageSummaryCount = document.getElementById('storage-summary-count');
const storageSize = document.getElementById('storage-size');
const viewAllTranscripts = document.getElementById('view-all-transcripts');
const exportTranscripts = document.getElementById('export-transcripts');
const importTranscripts = document.getElementById('import-transcripts');
const importFileInput = document.getElementById('import-file-input');

// Tab navigation helper
function switchTab(activeTab, activeContent) {
    // Deactivate all tabs
    [tabGeneral, tabTranscript, tabUpload, tabBatch, tabApi, tabAdvanced, tabLogs].forEach(tab => {
        tab.classList.remove('tab-active');
    });

    // Hide all content
    [generalTabContent, transcriptTabContent, uploadTabContent, batchTabContent, apiTabContent, advancedTabContent, logsTabContent].forEach(content => {
        content.classList.add('hidden');
    });

    // Activate selected tab
    activeTab.classList.add('tab-active');
    activeContent.classList.remove('hidden');
}

// Tab navigation
tabGeneral.addEventListener('click', () => {
    switchTab(tabGeneral, generalTabContent);
});

tabTranscript.addEventListener('click', () => {
    switchTab(tabTranscript, transcriptTabContent);
    refreshTranscriptInfo();
});

tabUpload.addEventListener('click', () => {
    switchTab(tabUpload, uploadTabContent);
    // Refresh upload list when tab is opened
    if (window.fileUploadHandler) {
        window.fileUploadHandler.loadRecentUploads();
    }
});

tabBatch.addEventListener('click', () => {
    switchTab(tabBatch, batchTabContent);
    // Initialize or refresh batch UI
    if (!window.batchUIInstance) {
        window.batchUIInstance = new BatchUI('batch-ui-container');
    } else {
        window.batchUIInstance.refresh();
    }
});

tabApi.addEventListener('click', () => {
    switchTab(tabApi, apiTabContent);
    // Initialize GroqKeyManager if not already initialized
    if (!groqKeyManager) {
        groqKeyManager = new GroqKeyManager();
    }
});

tabAdvanced.addEventListener('click', () => {
    switchTab(tabAdvanced, advancedTabContent);
});

tabLogs.addEventListener('click', () => {
    switchTab(tabLogs, logsTabContent);
    // Initialize or refresh log viewer
    if (!window.logViewerInstance) {
        window.logViewerInstance = new LogViewer('log-viewer-container');
    } else {
        window.logViewerInstance.refresh();
    }
});

// Function to update translation availability based on selected model
function updateTranslationAvailability() {
    const selectedModel = groqModel.value;
    const supportsTranslation = selectedModel === 'whisper-large-v3';
    
    // Update the translation note
    if (supportsTranslation) {
        modelTranslationNote.textContent = 'Note: Only whisper-large-v3 supports translation';
        modelTranslationNote.classList.remove('text-error');
        modelTranslationNote.classList.add('text-gray-500');
    } else {
        modelTranslationNote.textContent = 'Note: This model does not support translation. Translation option will be disabled.';
        modelTranslationNote.classList.remove('text-gray-500');
        modelTranslationNote.classList.add('text-error');
    }
    
    // If the selected model doesn't support translation, disable the translation option
    if (!supportsTranslation && translate.checked) {
        translate.checked = false;
        chrome.storage.sync.set({ buttercup_translate: false });
        
        // Notify any open YouTube tabs about the settings change
        chrome.tabs.query({ url: "*://*.youtube.com/*" }, (tabs) => {
            tabs.forEach(tab => {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        document.dispatchEvent(new CustomEvent('buttercupSettingsChanged'));
                    }
                }).catch(err => console.error('Error executing script:', err));
            });
        });
    }
    
    // Update the translation option visibility
    if (!supportsTranslation) {
        translateContainer.classList.add('opacity-50');
        translate.disabled = true;
    } else {
        translateContainer.classList.remove('opacity-50');
        translate.disabled = false;
    }
}


// Function to toggle word timestamp settings visibility
function toggleWordTimestampSettings() {
    if (useWordTimestamps.checked) {
        wordTimestampSettings.classList.remove('hidden');
    } else {
        wordTimestampSettings.classList.add('hidden');
    }
}

// Function to toggle LLM translation settings visibility
function toggleLLMTranslationSettings() {
    if (llmTranslationEnabled.checked) {
        llmTranslationSettings.style.display = 'block';
    } else {
        llmTranslationSettings.style.display = 'none';
    }
}

// Function to load provider-specific API settings
function loadProviderSettings(provider) {
    const apiKeyKey = `buttercup_llm_${provider}_api_key`;
    const modelKey = `buttercup_llm_${provider}_model`;

    chrome.storage.sync.get([apiKeyKey, modelKey], (result) => {
        llmApiKey.value = result[apiKeyKey] || '';
        llmModel.value = result[modelKey] || '';
    });
}

// Function to save current provider settings before switching
function saveCurrentProviderSettings() {
    const currentProvider = llmProvider.value;
    const apiKeyKey = `buttercup_llm_${currentProvider}_api_key`;
    const modelKey = `buttercup_llm_${currentProvider}_model`;

    const settings = {};
    settings[apiKeyKey] = llmApiKey.value;
    settings[modelKey] = llmModel.value;

    chrome.storage.sync.set(settings);
}

// Function to show an alert in the popup
function showAlert(message, type = 'success') {
    // Remove any existing alerts
    const existingAlerts = document.querySelectorAll('.alert');
    existingAlerts.forEach(alert => alert.remove());
    
    // Create the alert element
    const alertElement = document.createElement('div');
    alertElement.className = `alert alert-${type} mt-4`;
    
    // Set the icon based on the alert type
    let iconPath = '';
    if (type === 'success') {
        iconPath = 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z';
    } else if (type === 'warning') {
        iconPath = 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z';
    } else if (type === 'error') {
        iconPath = 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z';
    }
    
    alertElement.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${iconPath}" />
        </svg>
        <span>${message}</span>
    `;
    
    // Add the alert to the current tab content
    let currentTabContent;
    if (tabGeneral.classList.contains('tab-active')) {
        currentTabContent = generalTabContent;
    } else if (tabApi.classList.contains('tab-active')) {
        currentTabContent = apiTabContent;
    } else {
        currentTabContent = advancedTabContent;
    }
    currentTabContent.appendChild(alertElement);
    
    // Remove the alert after 3 seconds
    setTimeout(() => {
        alertElement.remove();
    }, 3000);
}

// Event listeners for general settings
enabled.addEventListener('change', () => {
    chrome.storage.sync.set({ buttercup_enabled: enabled.checked }, () => {
        if (chrome.runtime.lastError) {
            console.error('[Buttercup] Error saving enabled setting:', chrome.runtime.lastError);
            showAlert('Error saving settings', 'error');
            return;
        }

        // Reload the active tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError) {
                console.error('[Buttercup] Error querying tabs:', chrome.runtime.lastError);
                return;
            }

            if (tabs && tabs[0]) {
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    func: () => {
                        window.location.reload();
                    }
                }).catch(err => {
                    console.error('[Buttercup] Error executing script:', err);
                });
            }
        });
    });
});

translate.addEventListener('change', () => {
    chrome.storage.sync.set({ buttercup_translate: translate.checked }, () => {
        if (chrome.runtime.lastError) {
            console.error('[Buttercup] Error saving translate setting:', chrome.runtime.lastError);
            showAlert('Error saving settings', 'error');
            return;
        }

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError || !tabs || !tabs[0]) {
                return;
            }

            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                func: () => {
                    document.dispatchEvent(new CustomEvent('buttercupSettingsChanged'));
                }
            }).catch(err => {
                console.error('[Buttercup] Error executing script:', err);
            });
        });
    });
});

cache.addEventListener('change', () => {
    chrome.storage.sync.set({ buttercup_cache: cache.checked }, () => {
        if (chrome.runtime.lastError) {
            console.error('[Buttercup] Error saving cache setting:', chrome.runtime.lastError);
            return;
        }

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError || !tabs || !tabs[0]) {
                return;
            }

            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                func: () => {
                    document.dispatchEvent(new CustomEvent('buttercupSettingsChanged'));
                }
            }).catch(err => {
                console.error('[Buttercup] Error executing script:', err);
            });
        });
    });
});

download.addEventListener('change', () => {
    chrome.storage.sync.set({ buttercup_download_srt: download.checked }, () => {
        if (chrome.runtime.lastError) {
            console.error('[Buttercup] Error saving download setting:', chrome.runtime.lastError);
            return;
        }

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError || !tabs || !tabs[0]) {
                return;
            }

            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                func: () => {
                    document.dispatchEvent(new CustomEvent('buttercupSettingsChanged'));
                }
            }).catch(err => {
                console.error('[Buttercup] Error executing script:', err);
            });
        });
    });
});

language.addEventListener('change', () => {
    chrome.storage.sync.set({ buttercup_language: language.value }, () => {
        if (chrome.runtime.lastError) {
            console.error('[Buttercup] Error saving language setting:', chrome.runtime.lastError);
            return;
        }

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError || !tabs || !tabs[0]) {
                return;
            }

            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                func: () => {
                    document.dispatchEvent(new CustomEvent('buttercupApiSettingsChanged'));
                }
            }).catch(err => {
                console.error('[Buttercup] Error executing script:', err);
            });
        });
    });
});

autoTranscribe.addEventListener('change', () => {
    chrome.storage.sync.set({ buttercup_auto_transcribe: autoTranscribe.checked }, () => {
        if (chrome.runtime.lastError) {
            console.error('[Buttercup] Error saving auto-transcribe setting:', chrome.runtime.lastError);
            return;
        }
        console.log('[Buttercup] Auto-transcribe setting saved:', autoTranscribe.checked);
    });
});


// Event listener for Groq model change
groqModel.addEventListener('change', () => {
    updateTranslationAvailability();
});

// Event listener for word timestamps toggle
useWordTimestamps.addEventListener('change', () => {
    toggleWordTimestampSettings();
});

// Event listener for LLM translation toggle
llmTranslationEnabled.addEventListener('change', () => {
    toggleLLMTranslationSettings();
});

// Event listener for LLM provider change - load provider-specific settings
let previousProvider = llmProvider.value;
llmProvider.addEventListener('change', () => {
    // Save current provider settings before switching
    const oldProvider = previousProvider;
    const newProvider = llmProvider.value;

    // Save the old provider's settings
    const oldApiKeyKey = `buttercup_llm_${oldProvider}_api_key`;
    const oldModelKey = `buttercup_llm_${oldProvider}_model`;
    const saveSettings = {};
    saveSettings[oldApiKeyKey] = llmApiKey.value;
    saveSettings[oldModelKey] = llmModel.value;

    chrome.storage.sync.set(saveSettings, () => {
        // Load the new provider's settings
        loadProviderSettings(newProvider);
        previousProvider = newProvider;
    });
});

// Caption Customization Event Listeners
function updateCaptionPreview() {
    const fontSize = captionFontSize.value;
    const fontColor = captionFontColor.value;
    const bgColor = captionBgColor.value;
    const opacity = captionBgOpacity.value / 100;

    // Convert hex to rgba
    const r = parseInt(bgColor.slice(1, 3), 16);
    const g = parseInt(bgColor.slice(3, 5), 16);
    const b = parseInt(bgColor.slice(5, 7), 16);

    captionPreview.style.fontSize = `${fontSize}px`;
    captionPreview.style.color = fontColor;
    captionPreview.style.background = `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function saveCaptionSettings() {
    chrome.storage.sync.set({
        buttercup_caption_font_size: parseInt(captionFontSize.value),
        buttercup_caption_vertical_position: parseInt(captionVerticalPosition.value),
        buttercup_caption_horizontal_position: captionHorizontalPosition.value,
        buttercup_caption_font_color: captionFontColor.value,
        buttercup_caption_bg_color: captionBgColor.value,
        buttercup_caption_bg_opacity: parseFloat(captionBgOpacity.value / 100),
        buttercup_caption_container_width: parseInt(captionContainerWidth.value)
    }, () => {
        if (chrome.runtime.lastError) {
            console.error('[Buttercup] Error saving caption settings:', chrome.runtime.lastError);
            return;
        }

        // Notify content script about settings change
        // CRITICAL: Send message to content script which will dispatch event in MAIN world
        // This is more robust than chrome.scripting.executeScript for all platforms
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError || !tabs || !tabs[0]) return;

            chrome.tabs.sendMessage(tabs[0].id, {
                type: 'UPDATE_CAPTION_SETTINGS',
                settings: {
                    fontSize: parseInt(captionFontSize.value),
                    verticalPosition: parseInt(captionVerticalPosition.value),
                    horizontalPosition: captionHorizontalPosition.value,
                    fontColor: captionFontColor.value,
                    backgroundColor: captionBgColor.value,
                    backgroundOpacity: parseFloat(captionBgOpacity.value / 100),
                    containerWidth: parseInt(captionContainerWidth.value)
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn('[Buttercup] Could not send settings update:', chrome.runtime.lastError.message);
                }
            });
        });
    });
}

captionFontSize.addEventListener('input', () => {
    fontSizeValue.textContent = captionFontSize.value;
    updateCaptionPreview();
    // LIVE UPDATE: Apply font size changes immediately while dragging
    saveCaptionSettings();
});

captionVerticalPosition.addEventListener('input', () => {
    captionVerticalValue.textContent = captionVerticalPosition.value + '%';
    // LIVE UPDATE: Apply vertical position changes immediately while dragging
    saveCaptionSettings();
});

captionHorizontalPosition.addEventListener('change', () => {
    const value = captionHorizontalPosition.value;
    captionHorizontalValue.textContent = value.charAt(0).toUpperCase() + value.slice(1);
    // LIVE UPDATE: Apply horizontal position changes immediately
    saveCaptionSettings();
});

captionFontColor.addEventListener('input', () => {
    captionFontColorText.value = captionFontColor.value;
    updateCaptionPreview();
});

captionFontColor.addEventListener('change', saveCaptionSettings);

captionFontColorText.addEventListener('input', () => {
    if (/^#[0-9A-F]{6}$/i.test(captionFontColorText.value)) {
        captionFontColor.value = captionFontColorText.value;
        updateCaptionPreview();
        saveCaptionSettings();
    }
});

captionBgColor.addEventListener('input', () => {
    captionBgColorText.value = captionBgColor.value;
    updateCaptionPreview();
});

captionBgColor.addEventListener('change', saveCaptionSettings);

captionBgColorText.addEventListener('input', () => {
    if (/^#[0-9A-F]{6}$/i.test(captionBgColorText.value)) {
        captionBgColor.value = captionBgColorText.value;
        updateCaptionPreview();
        saveCaptionSettings();
    }
});

captionBgOpacity.addEventListener('input', () => {
    captionOpacityValue.textContent = captionBgOpacity.value + '%';
    updateCaptionPreview();
    // LIVE UPDATE: Apply opacity changes immediately while dragging
    saveCaptionSettings();
});

captionContainerWidth.addEventListener('input', () => {
    captionWidthValue.textContent = captionContainerWidth.value + '%';
    // LIVE UPDATE: Apply width changes immediately while dragging
    saveCaptionSettings();
});

// Dark Mode Toggle
darkMode.addEventListener('change', () => {
    const theme = darkMode.checked ? 'dark' : 'cupcake';
    document.documentElement.setAttribute('data-theme', theme);

    chrome.storage.sync.set({ buttercup_dark_mode: darkMode.checked }, () => {
        if (chrome.runtime.lastError) {
            console.error('[Buttercup] Error saving dark mode setting:', chrome.runtime.lastError);
        }
    });
});

// API settings event listeners
saveApiSettings.addEventListener('click', async () => {
    // Validate and save Groq keys using GroqKeyManager
    if (!groqKeyManager) {
        showAlert('Key manager not initialized', 'error');
        return;
    }

    try {
        // Save Groq keys (this validates and saves to chrome.storage)
        const validKeys = await groqKeyManager.save();

        // Validate LLM translation settings if enabled
        if (llmTranslationEnabled.checked) {
            if (!llmTargetLanguage.value) {
                showAlert('Target language is required when LLM translation is enabled', 'error');
                return;
            }
            if (!llmApiKey.value) {
                showAlert('LLM API key is required when LLM translation is enabled', 'error');
                return;
            }
            if (!llmModel.value) {
                showAlert('LLM model name is required when LLM translation is enabled', 'error');
                return;
            }
        }

        // Save additional API settings to Chrome storage
        const currentProvider = llmProvider.value;
        const providerApiKeyKey = `buttercup_llm_${currentProvider}_api_key`;
        const providerModelKey = `buttercup_llm_${currentProvider}_model`;

        const settings = {
            buttercup_groq_model: groqModel.value,
            buttercup_llm_translation_enabled: llmTranslationEnabled.checked,
            buttercup_llm_target_language: llmTargetLanguage.value,
            buttercup_llm_provider: llmProvider.value,
            // Save provider-specific API key and model
            [providerApiKeyKey]: llmApiKey.value,
            [providerModelKey]: llmModel.value,
            // Keep legacy keys for backward compatibility
            buttercup_llm_api_key: llmApiKey.value,
            buttercup_llm_model: llmModel.value
        };

        chrome.storage.sync.set(settings);

        // Show success message
        showAlert('API settings saved successfully!', 'success');

        // Notify any open YouTube tabs about the settings change
        chrome.tabs.query({ url: "*://*.youtube.com/*" }, (tabs) => {
            tabs.forEach(tab => {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        document.dispatchEvent(new CustomEvent('buttercupApiSettingsChanged'));
                    }
                }).catch(err => console.error('Error executing script:', err));
            });
        });
    } catch (error) {
        showAlert(error.message, 'error');
    }
});

// Advanced settings event listeners
saveAdvancedSettings.addEventListener('click', () => {
    // Validate inputs
    const wordsPerLineValue = parseInt(wordsPerLine.value);
    const promptLength = modelPrompt.value.length;
    const maxLineLengthValue = parseInt(maxLineLength.value);
    const temperatureValue = parseFloat(temperature.value);

    if (isNaN(wordsPerLineValue) || wordsPerLineValue < 0 || wordsPerLineValue > 20) {
        showAlert('Words per line must be between 0 and 20 (0 disables line breaks)', 'error');
        return;
    }

    if (isNaN(maxLineLengthValue) || maxLineLengthValue < 0 || maxLineLengthValue > 20) {
        showAlert('Words per line break must be between 0 and 20', 'error');
        return;
    }

    if (promptLength > 896) {
        showAlert('Prompt must be 896 characters or less', 'error');
        return;
    }

    if (isNaN(temperatureValue) || temperatureValue < 0 || temperatureValue > 1) {
        showAlert('Temperature must be between 0 and 1', 'error');
        return;
    }

    // Save advanced settings to Chrome storage
    const settings = {
        buttercup_use_word_timestamps: useWordTimestamps.checked,
        buttercup_words_per_line: wordsPerLineValue,
        buttercup_max_line_length: maxLineLengthValue,
        buttercup_prompt: modelPrompt.value,
        buttercup_temperature: temperatureValue,
        buttercup_response_format: responseFormat.value
    };
    
    chrome.storage.sync.set(settings);
    
    // Show success message
    showAlert('Advanced settings saved successfully!', 'success');
    
    // Notify any open YouTube tabs about the settings change
    chrome.tabs.query({ url: "*://*.youtube.com/*" }, (tabs) => {
        tabs.forEach(tab => {
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    document.dispatchEvent(new CustomEvent('buttercupApiSettingsChanged'));
                }
            }).catch(err => console.error('Error executing script:', err));
        });
    });
});

// Start Transcription button
startTranscription.addEventListener('click', async () => {
    try {
        // Get the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab) {
            showAlert('No active tab found', 'error');
            return;
        }

        // Check if it's a YouTube tab
        if (!tab.url || !isYouTubeVideoUrl(tab.url)) {
            showAlert('Please open a video page first (YouTube, Vimeo, etc.)', 'warning');
            return;
        }

        // Send message to content script to start transcription
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                document.dispatchEvent(new CustomEvent('buttercupStartTranscription'));
            }
        }).then(() => {
            showAlert('Transcription started! This may take a few minutes.', 'success');
            console.info('[Buttercup] Transcription start event dispatched');
        }).catch(err => {
            console.error('[Buttercup] Error starting transcription:', err);
            showAlert('Error starting transcription. Make sure you are on a video page.', 'error');
        });
    } catch (error) {
        console.error('[Buttercup] Error in start transcription handler:', error);
        showAlert('Error starting transcription', 'error');
    }
});

// ============ Transcript Management Functions ============

let currentTranscriptData = null;

// Helper function to check if URL is a valid video page
// UNIVERSAL approach: Accept ANY http/https URL
// yt-dlp supports 1000+ sites - let it decide if it can handle the URL
function isVideoPageUrl(url) {
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

    // Accept any http/https URL as potentially having video content
    // yt-dlp will determine if it can actually extract video from it
    return url.startsWith('http://') || url.startsWith('https://');
}

// Legacy alias for backward compatibility
function isYouTubeVideoUrl(url) {
    return isVideoPageUrl(url);
}

// Helper function to extract video ID from URL
function getVideoIdFromTab(tab) {
    if (!tab || !tab.url) return null;

    const url = new URL(tab.url);
    const hostname = url.hostname;
    const pathname = url.pathname;

    // YouTube
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
        if (pathname.startsWith('/clip')) {
            return null;
        } else if (pathname.startsWith('/shorts')) {
            return pathname.slice(8);
        }
        return url.searchParams.get('v') || pathname.slice(1); // youtu.be/ID
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

    // Facebook
    if (hostname.includes('facebook.com') || hostname.includes('fb.watch')) {
        // Match numeric ID at end of path (use [0-9] to avoid matching Arabic numerals)
        const match = pathname.match(/\/([0-9]+)\/?$/);
        if (match) return match[1];
        // Fallback: use URL hash
    }

    // Twitch
    if (hostname.includes('twitch.tv')) {
        const videoMatch = pathname.match(/\/videos\/(\d+)/);
        if (videoMatch) return videoMatch[1];
        const clipMatch = pathname.match(/\/clip\/([a-zA-Z0-9_-]+)/);
        if (clipMatch) return clipMatch[1];
    }

    // Reddit
    if (hostname.includes('reddit.com')) {
        const match = pathname.match(/\/comments\/([a-zA-Z0-9]+)/);
        if (match) return match[1];
    }

    // Bilibili
    if (hostname.includes('bilibili.com')) {
        const match = pathname.match(/\/video\/(BV[a-zA-Z0-9]+|av\d+)/);
        if (match) return match[1];
    }

    // Rumble
    if (hostname.includes('rumble.com')) {
        const match = pathname.match(/\/([a-zA-Z0-9-]+)\.html/);
        if (match) return match[1];
    }

    // Odysee
    if (hostname.includes('odysee.com')) {
        const match = pathname.match(/\/@[^/]+\/([^/:]+)/);
        if (match) return match[1];
    }

    // Fallback: generate hash from URL
    let hash = 0;
    const str = tab.url;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}

// Get platform name from URL - universal approach
function getPlatformName(url) {
    if (!url) return 'Unknown';

    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;

        // Map common hostnames to friendly names
        const knownPlatforms = {
            'youtube.com': 'YouTube',
            'www.youtube.com': 'YouTube',
            'youtu.be': 'YouTube',
            'vimeo.com': 'Vimeo',
            'www.vimeo.com': 'Vimeo',
            'dailymotion.com': 'Dailymotion',
            'www.dailymotion.com': 'Dailymotion',
            'dai.ly': 'Dailymotion',
            'twitter.com': 'Twitter',
            'x.com': 'X',
            'tiktok.com': 'TikTok',
            'www.tiktok.com': 'TikTok',
            'instagram.com': 'Instagram',
            'www.instagram.com': 'Instagram',
            'facebook.com': 'Facebook',
            'www.facebook.com': 'Facebook',
            'fb.watch': 'Facebook',
            'twitch.tv': 'Twitch',
            'www.twitch.tv': 'Twitch',
            'reddit.com': 'Reddit',
            'www.reddit.com': 'Reddit',
            'soundcloud.com': 'SoundCloud',
            'bilibili.com': 'Bilibili',
            'www.bilibili.com': 'Bilibili',
            'rumble.com': 'Rumble',
            'odysee.com': 'Odysee'
        };

        // Check known platforms first
        if (knownPlatforms[hostname]) {
            return knownPlatforms[hostname];
        }

        // For unknown platforms, extract clean hostname
        // Remove www. and return capitalized domain
        let cleanHost = hostname.replace(/^www\./, '');
        // Get just the domain name (without TLD for common ones)
        const parts = cleanHost.split('.');
        if (parts.length >= 2) {
            // Capitalize first letter of domain
            return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
        }
        return cleanHost;
    } catch (e) {
        return 'Video';
    }
}

// Refresh transcript info for current video
async function refreshTranscriptInfo() {
    try {
        // Get current tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab || !tab.url || !isVideoPageUrl(tab.url)) {
            currentVideoIdEl.textContent = 'Not on a video page';
            currentVideoIdEl.dataset.videoId = ''; // Store actual videoId
            transcriptStatusBadge.textContent = 'N/A';
            transcriptStatusBadge.className = 'badge badge-sm badge-warning';
            transcriptDate.textContent = '';
            disableTranscriptButtons();
            currentTranscriptData = null;
            loadStorageStats();
            return;
        }

        const videoId = getVideoIdFromTab(tab);
        if (!videoId) {
            currentVideoIdEl.textContent = 'Invalid video URL';
            currentVideoIdEl.dataset.videoId = ''; // Store actual videoId
            disableTranscriptButtons();
            currentTranscriptData = null;
            loadStorageStats();
            return;
        }

        // Show platform and video ID
        const platform = getPlatformName(tab.url);
        currentVideoIdEl.textContent = `${platform}: ${videoId}`;
        currentVideoIdEl.dataset.videoId = videoId; // Store actual videoId for later use

        // Load transcript from storage
        chrome.storage.local.get(['buttercup_transcripts'], (result) => {
            const transcripts = result.buttercup_transcripts || {};
            const transcript = transcripts[videoId];

            if (transcript) {
                currentTranscriptData = transcript;
                transcriptStatusBadge.textContent = 'Available';
                transcriptStatusBadge.className = 'badge badge-sm badge-success';

                const date = new Date(transcript.timestamp);
                transcriptDate.textContent = `Saved ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;

                // Show caption toggle
                captionToggleContainer.style.display = 'flex';

                // Set default state: Visible (true) - matches caption default behavior
                captionVisibilityToggle.checked = true;
                captionStatusText.textContent = 'Visible';

                // Query current caption state from content script to update if different
                if (typeof chrome !== 'undefined' && chrome.tabs) {
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        if (tabs && tabs[0]) {
                            chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_CAPTION_STATE' }, (response) => {
                                if (chrome.runtime.lastError) {
                                    console.warn('[Popup] Could not get caption state:', chrome.runtime.lastError.message);
                                    // Keep default visible state
                                    return;
                                }
                                if (response && response.isVisible !== undefined) {
                                    captionVisibilityToggle.checked = response.isVisible;
                                    captionStatusText.textContent = response.isVisible ? 'Visible' : 'Hidden';
                                }
                            });
                        }
                    });
                }

                // Show summary status if exists
                if (transcript.summary) {
                    summaryStatusContainer.style.display = 'flex';
                } else {
                    summaryStatusContainer.style.display = 'none';
                }

                enableTranscriptButtons();
            } else {
                currentTranscriptData = null;
                transcriptStatusBadge.textContent = 'No transcript';
                transcriptStatusBadge.className = 'badge badge-sm badge-warning';
                transcriptDate.textContent = '';
                captionToggleContainer.style.display = 'none';
                summaryStatusContainer.style.display = 'none';
                disableTranscriptButtons();
            }

            loadStorageStats();
        });
    } catch (error) {
        console.error('[Buttercup] Error refreshing transcript info:', error);
    }
}

// Enable transcript buttons
function enableTranscriptButtons() {
    // Enable export buttons
    exportActions.style.opacity = '1';
    exportSrt.disabled = false;
    exportVtt.disabled = false;
    exportTxt.disabled = false;
    exportJson.disabled = false;
    copyToClipboard.disabled = false;

    // Enable transcript management buttons
    transcriptActions.style.opacity = '1';
    viewEditTranscript.disabled = false;
    deleteTranscript.disabled = false;

    // Enable generate summary only if LLM is configured
    chrome.storage.sync.get(['buttercup_llm_api_key', 'buttercup_llm_model'], (result) => {
        if (result.buttercup_llm_api_key && result.buttercup_llm_model) {
            generateSummary.disabled = false;
            generateSummary.style.opacity = '1';
        }
    });
}

// Disable transcript buttons
function disableTranscriptButtons() {
    // Disable export buttons
    exportActions.style.opacity = '0.5';
    exportSrt.disabled = true;
    exportVtt.disabled = true;
    exportTxt.disabled = true;
    exportJson.disabled = true;
    copyToClipboard.disabled = true;

    // Disable transcript management buttons
    transcriptActions.style.opacity = '0.5';
    viewEditTranscript.disabled = true;
    deleteTranscript.disabled = true;
    generateSummary.disabled = true;
    generateSummary.style.opacity = '0.5';
}

// Load and display storage statistics
function loadStorageStats() {
    chrome.storage.local.get(['buttercup_transcripts'], (result) => {
        const transcripts = result.buttercup_transcripts || {};
        const count = Object.keys(transcripts).length;

        // Count transcripts with summaries
        const summaryCount = Object.values(transcripts).filter(t => t.summary).length;

        // Calculate total size in bytes
        const jsonString = JSON.stringify(transcripts);
        const sizeBytes = new Blob([jsonString]).size;
        const sizeKB = (sizeBytes / 1024).toFixed(2);

        storageCount.textContent = count;
        storageSummaryCount.textContent = summaryCount;
        storageSize.textContent = `${sizeKB} KB`;
    });
}

// View/Edit SRT
viewEditTranscript.addEventListener('click', () => {
    if (!currentTranscriptData) {
        showAlert('No transcript data available', 'error');
        return;
    }

    // Create modal for viewing/editing SRT
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;';

    const modalContent = document.createElement('div');
    modalContent.className = 'bg-base-100 p-6 rounded-lg shadow-xl';
    modalContent.style.cssText = 'width: 90%; max-width: 600px; max-height: 80vh; overflow-y: auto;';

    modalContent.innerHTML = `
        <h3 class="text-lg font-bold mb-4">View / Edit SRT</h3>
        <textarea class="textarea textarea-bordered w-full h-64 font-mono text-sm mb-4" id="srt-editor">${currentTranscriptData.srtData}</textarea>
        <div class="flex gap-2 justify-end">
            <button class="btn btn-sm" id="modal-close">Close</button>
            <button class="btn btn-sm btn-primary" id="modal-save">Save Changes</button>
        </div>
    `;

    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    // Close button
    modal.querySelector('#modal-close').addEventListener('click', () => {
        document.body.removeChild(modal);
    });

    // Save button
    modal.querySelector('#modal-save').addEventListener('click', async () => {
        const newSrtData = modal.querySelector('#srt-editor').value;

        try {
            // Convert SRT back to YouTube format
            const youtubeFormat = convertSrtToYoutubeFormat(newSrtData);

            // Update storage with both formats
            chrome.storage.local.get(['buttercup_transcripts'], (result) => {
                const transcripts = result.buttercup_transcripts || {};
                const videoId = currentVideoIdEl.dataset.videoId || currentVideoIdEl.textContent;

                if (transcripts[videoId]) {
                    // Update both srtData and captionData (buttercup.js expects captionData, not youtubeFormat)
                    transcripts[videoId].srtData = newSrtData;
                    transcripts[videoId].captionData = youtubeFormat;

                    chrome.storage.local.set({ buttercup_transcripts: transcripts }, () => {
                        currentTranscriptData.srtData = newSrtData;
                        currentTranscriptData.captionData = youtubeFormat;
                        showAlert('SRT updated successfully. Reloading page...', 'success');
                        document.body.removeChild(modal);

                        // Reload the page to apply changes
                        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                            if (tabs && tabs[0]) {
                                chrome.scripting.executeScript({
                                    target: { tabId: tabs[0].id },
                                    func: () => {
                                        window.location.reload();
                                    }
                                }).catch(err => console.error('Error reloading page:', err));
                            }
                        });
                    });
                }
            });
        } catch (error) {
            showAlert(`Error parsing SRT: ${error.message}`, 'error');
        }
    });

    // Click outside to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
});

// Caption visibility toggle
captionVisibilityToggle.addEventListener('change', (e) => {
    const isVisible = e.target.checked;

    if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'TOGGLE_CAPTIONS',
                    isVisible: isVisible
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.warn('[Popup] Could not toggle captions:', chrome.runtime.lastError.message);
                        return;
                    }
                    if (response && response.success) {
                        captionStatusText.textContent = isVisible ? 'Visible' : 'Hidden';
                        console.info('[Popup] Caption visibility toggled:', isVisible);
                    }
                });
            }
        });
    }
});

// Delete transcript
deleteTranscript.addEventListener('click', () => {
    if (!currentTranscriptData) {
        showAlert('No transcript data available', 'error');
        return;
    }

    if (!confirm('Are you sure you want to delete this transcript? This action cannot be undone.')) {
        return;
    }

    const videoId = currentVideoIdEl.dataset.videoId || currentVideoIdEl.textContent;

    chrome.storage.local.get(['buttercup_transcripts'], (result) => {
        const transcripts = result.buttercup_transcripts || {};
        delete transcripts[videoId];

        chrome.storage.local.set({ buttercup_transcripts: transcripts }, () => {
            showAlert('Transcript deleted successfully', 'success');
            currentTranscriptData = null;
            refreshTranscriptInfo();

            // Notify the active tab to remove captions
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs && tabs[0]) {
                    chrome.scripting.executeScript({
                        target: { tabId: tabs[0].id },
                        func: () => {
                            window.location.reload();
                        }
                    }).catch(err => console.error('Error reloading page:', err));
                }
            });
        });
    });
});

// Helper function to sanitize filename
function sanitizeFilename(filename) {
    // Replace invalid filename characters with underscores
    return filename
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .replace(/\s+/g, '_')
        .substring(0, 200); // Limit filename length
}

// Export Buttons Event Listeners
exportSrt.addEventListener('click', () => {
    if (!currentTranscriptData) {
        showAlert('No transcript data available', 'error');
        return;
    }

    try {
        // Parse the transcript data
        const captionData = typeof currentTranscriptData.captionData === 'string'
            ? JSON.parse(currentTranscriptData.captionData)
            : currentTranscriptData.captionData;

        // Create temporary transcript storage instance
        const storage = new (function() {
            this.generateSRT = function(captionData) {
                let srt = '';
                let counter = 1;

                for (const event of captionData.events) {
                    const startTime = this.formatSRTTime(event.tStartMs);
                    const endTime = this.formatSRTTime(event.tStartMs + event.dDurationMs);
                    const text = event.segs.map(seg => seg.utf8).join('');

                    srt += `${counter}\n${startTime} --> ${endTime}\n${text}\n\n`;
                    counter++;
                }

                return srt;
            };

            this.formatSRTTime = function(ms) {
                const seconds = Math.floor(ms / 1000);
                const milliseconds = ms % 1000;
                const hours = Math.floor(seconds / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                const secs = seconds % 60;

                return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
            };
        });

        const srtContent = storage.generateSRT(captionData);
        const blob = new Blob([srtContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = sanitizeFilename(currentTranscriptData.videoTitle || currentTranscriptData.videoId || 'transcript');
        a.download = `${filename}.srt`;
        a.click();
        URL.revokeObjectURL(url);

        showAlert('SRT file downloaded successfully', 'success');
    } catch (err) {
        console.error('Export error:', err);
        showAlert('Export failed: ' + err.message, 'error');
    }
});

exportVtt.addEventListener('click', () => {
    if (!currentTranscriptData) {
        showAlert('No transcript data available', 'error');
        return;
    }

    try {
        const captionData = typeof currentTranscriptData.captionData === 'string'
            ? JSON.parse(currentTranscriptData.captionData)
            : currentTranscriptData.captionData;

        const storage = new (function() {
            this.generateVTT = function(captionData) {
                let vtt = 'WEBVTT\n\n';

                for (const event of captionData.events) {
                    const startTime = this.formatVTTTime(event.tStartMs);
                    const endTime = this.formatVTTTime(event.tStartMs + event.dDurationMs);
                    const text = event.segs.map(seg => seg.utf8).join('');

                    vtt += `${startTime} --> ${endTime}\n${text}\n\n`;
                }

                return vtt;
            };

            this.formatVTTTime = function(ms) {
                const seconds = Math.floor(ms / 1000);
                const milliseconds = ms % 1000;
                const hours = Math.floor(seconds / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                const secs = seconds % 60;

                return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
            };
        });

        const vttContent = storage.generateVTT(captionData);
        const blob = new Blob([vttContent], { type: 'text/vtt' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = sanitizeFilename(currentTranscriptData.videoTitle || currentTranscriptData.videoId || 'transcript');
        a.download = `${filename}.vtt`;
        a.click();
        URL.revokeObjectURL(url);

        showAlert('VTT file downloaded successfully', 'success');
    } catch (err) {
        console.error('Export error:', err);
        showAlert('Export failed: ' + err.message, 'error');
    }
});

exportTxt.addEventListener('click', () => {
    if (!currentTranscriptData) {
        showAlert('No transcript data available', 'error');
        return;
    }

    try {
        const captionData = typeof currentTranscriptData.captionData === 'string'
            ? JSON.parse(currentTranscriptData.captionData)
            : currentTranscriptData.captionData;

        let txt = '';
        for (const event of captionData.events) {
            const text = event.segs.map(seg => seg.utf8).join('');
            txt += `${text}\n`;
        }

        const blob = new Blob([txt], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = sanitizeFilename(currentTranscriptData.videoTitle || currentTranscriptData.videoId || 'transcript');
        a.download = `${filename}.txt`;
        a.click();
        URL.revokeObjectURL(url);

        showAlert('TXT file downloaded successfully', 'success');
    } catch (err) {
        console.error('Export error:', err);
        showAlert('Export failed: ' + err.message, 'error');
    }
});

exportJson.addEventListener('click', () => {
    if (!currentTranscriptData) {
        showAlert('No transcript data available', 'error');
        return;
    }

    try {
        const captionData = typeof currentTranscriptData.captionData === 'string'
            ? JSON.parse(currentTranscriptData.captionData)
            : currentTranscriptData.captionData;

        const jsonData = {
            metadata: {
                videoId: currentTranscriptData.videoId || 'unknown',
                exportDate: new Date().toISOString(),
                totalCaptions: captionData.events ? captionData.events.length : 0
            },
            captions: captionData.events ? captionData.events.map((event, index) => ({
                index: index + 1,
                startTime: event.tStartMs,
                endTime: event.tStartMs + event.dDurationMs,
                duration: event.dDurationMs,
                text: event.segs.map(seg => seg.utf8).join('')
            })) : []
        };

        const jsonContent = JSON.stringify(jsonData, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = sanitizeFilename(currentTranscriptData.videoTitle || currentTranscriptData.videoId || 'transcript');
        a.download = `${filename}.json`;
        a.click();
        URL.revokeObjectURL(url);

        showAlert('JSON file downloaded successfully', 'success');
    } catch (err) {
        console.error('Export error:', err);
        showAlert('Export failed: ' + err.message, 'error');
    }
});

copyToClipboard.addEventListener('click', async () => {
    if (!currentTranscriptData) {
        showAlert('No transcript data available', 'error');
        return;
    }

    try {
        const captionData = typeof currentTranscriptData.captionData === 'string'
            ? JSON.parse(currentTranscriptData.captionData)
            : currentTranscriptData.captionData;

        let text = '';
        for (const event of captionData.events) {
            const textContent = event.segs.map(seg => seg.utf8).join('');
            text += `${textContent}\n`;
        }

        await navigator.clipboard.writeText(text);
        showAlert('Copied to clipboard!', 'success');
    } catch (err) {
        console.error('Copy error:', err);
        showAlert('Copy failed: ' + err.message, 'error');
    }
});

// Generate AI Summary
generateSummary.addEventListener('click', async () => {
    if (!currentTranscriptData) {
        showAlert('No transcript data available', 'error');
        return;
    }

    // Check if LLM is configured
    chrome.storage.sync.get(['buttercup_llm_api_key', 'buttercup_llm_model', 'buttercup_llm_provider', 'buttercup_llm_target_language'], async (result) => {
        if (!result.buttercup_llm_api_key || !result.buttercup_llm_model) {
            showAlert('Please configure LLM API settings first', 'warning');
            tabApi.click();
            return;
        }

        showAlert('Generating AI summary... This may take a minute.', 'success');
        generateSummary.disabled = true;
        generateSummary.innerHTML = `
            <span class="loading loading-spinner loading-xs mr-1"></span>
            Generating...
        `;

        // Get target language from settings, default to English
        const targetLanguage = result.buttercup_llm_target_language || 'English';

        // Send message to active tab to generate summary
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            try {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    world: 'MAIN',
                    func: async (captionData, videoTitle, provider, apiKey, model, videoId, targetLanguage) => {
                        // This code runs in the page context
                        if (window.AISummary && window.SummarySidebar) {
                            const summary = new window.AISummary(provider, apiKey, model);
                            const summaryData = await summary.generateSummary(captionData.events, videoTitle, targetLanguage);

                            // Show sidebar
                            const sidebar = new window.SummarySidebar(summaryData, videoTitle);
                            window.buttercupSummarySidebar = sidebar;

                            // Save summary to storage in page context
                            if (window.transcriptStorage && window.currentVideoId) {
                                await window.transcriptStorage.updateSummary(window.currentVideoId, summaryData);
                                console.info('[Buttercup] Summary saved in page context');
                            }

                            console.info('[Buttercup] AI Summary generated and displayed');

                            // Return summary to popup
                            return { success: true, summary: summaryData, videoId: videoId };
                        } else {
                            console.error('[Buttercup] AISummary or SummarySidebar not available');
                            return { success: false, error: 'AISummary or SummarySidebar not available' };
                        }
                    },
                    args: [
                        currentTranscriptData.captionData,
                        currentTranscriptData.videoTitle,
                        result.buttercup_llm_provider || 'openai',
                        result.buttercup_llm_api_key,
                        result.buttercup_llm_model,
                        getVideoIdFromTab(tab),
                        targetLanguage
                    ]
                });

                // Save summary in popup's storage context as well
                if (results && results[0] && results[0].result && results[0].result.success) {
                    const { summary, videoId } = results[0].result;

                    // Update storage from popup context
                    chrome.storage.local.get(['buttercup_transcripts'], (storageResult) => {
                        const transcripts = storageResult.buttercup_transcripts || {};
                        if (transcripts[videoId]) {
                            transcripts[videoId].summary = summary;
                            transcripts[videoId].summaryTimestamp = Date.now();

                            chrome.storage.local.set({ buttercup_transcripts: transcripts }, () => {
                                console.info('[Buttercup Popup] Summary saved successfully');
                                showAlert('AI Summary generated and saved!', 'success');

                                // Refresh UI to show summary status
                                refreshTranscriptInfo();
                            });
                        }
                    });
                } else {
                    showAlert('Summary generated but may not have been saved', 'warning');
                }

                // Reset button
                setTimeout(() => {
                    generateSummary.disabled = false;
                    generateSummary.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Generate AI Summary
                    `;
                }, 500);
            } catch (err) {
                console.error('[Buttercup] Error generating summary:', err);
                showAlert('Error generating summary. Check console for details.', 'error');
                generateSummary.disabled = false;
                generateSummary.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Generate AI Summary
                `;
            }
        }
    });
});

// View All Transcripts button
viewAllTranscripts.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('transcripts.html') });
});

// Export All Transcripts
exportTranscripts.addEventListener('click', () => {
    chrome.storage.local.get(['buttercup_transcripts'], (result) => {
        const transcripts = result.buttercup_transcripts || {};
        const dataStr = JSON.stringify(transcripts, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `buttercup-transcripts-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showAlert('All transcripts exported successfully!', 'success');
    });
});

// Import Transcripts
importTranscripts.addEventListener('click', () => {
    importFileInput.click();
});

importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const imported = JSON.parse(event.target.result);

            if (typeof imported !== 'object' || imported === null) {
                showAlert('Invalid JSON file format', 'error');
                return;
            }

            // Merge with existing transcripts
            chrome.storage.local.get(['buttercup_transcripts'], (result) => {
                const existing = result.buttercup_transcripts || {};
                const merged = { ...existing, ...imported };

                chrome.storage.local.set({ buttercup_transcripts: merged }, () => {
                    const importedCount = Object.keys(imported).length;
                    showAlert(`Imported ${importedCount} transcript(s) successfully!`, 'success');
                    refreshTranscriptInfo();
                });
            });
        } catch (error) {
            showAlert('Error parsing JSON file', 'error');
            console.error('[Buttercup] Import error:', error);
        }
    };
    reader.readAsText(file);

    // Reset file input
    importFileInput.value = '';
});

// Show Existing Summary
showExistingSummary.addEventListener('click', async () => {
    if (!currentTranscriptData || !currentTranscriptData.summary) {
        showAlert('No summary available', 'error');
        return;
    }

    try {
        // Inject summary into active YouTube tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab || !tab.id) {
            showAlert('No active YouTube tab found', 'error');
            return;
        }

        // Check if it's a YouTube tab
        if (!tab.url || !isYouTubeVideoUrl(tab.url)) {
            showAlert('Please open a video page to view the summary', 'warning');
            return;
        }

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: (summary, videoTitle) => {
                if (window.SummarySidebar) {
                    // Remove existing sidebar if any
                    if (window.buttercupSummarySidebar) {
                        window.buttercupSummarySidebar.destroy();
                    }
                    // Create new sidebar
                    const sidebar = new window.SummarySidebar(summary, videoTitle);
                    window.buttercupSummarySidebar = sidebar;
                } else {
                    console.error('[Buttercup] SummarySidebar is not available');
                }
            },
            args: [currentTranscriptData.summary, currentTranscriptData.videoTitle]
        });

        showAlert('Summary displayed!', 'success');
        window.close(); // Close popup after showing summary
    } catch (error) {
        console.error('[Buttercup] Error showing summary:', error);
        showAlert('Failed to show summary', 'error');
    }
});

// Delete existing summary
deleteExistingSummary.addEventListener('click', async () => {
    if (!currentTranscriptData || !currentTranscriptData.summary) {
        showAlert('No summary available', 'error');
        return;
    }

    if (!confirm('Are you sure you want to delete the AI summary for this video?\n\nThe transcript will remain intact.')) {
        return;
    }

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const videoId = getVideoIdFromTab(tab);

        if (!videoId) {
            showAlert('Could not determine video ID', 'error');
            return;
        }

        // Delete summary from storage
        chrome.storage.local.get(['buttercup_transcripts'], (result) => {
            const transcripts = result.buttercup_transcripts || {};

            if (transcripts[videoId]) {
                delete transcripts[videoId].summary;
                delete transcripts[videoId].summaryTimestamp;

                chrome.storage.local.set({ buttercup_transcripts: transcripts }, () => {
                    showAlert('AI Summary deleted successfully', 'success');
                    refreshTranscriptInfo();

                    // Also remove from current transcript data
                    if (currentTranscriptData) {
                        delete currentTranscriptData.summary;
                        delete currentTranscriptData.summaryTimestamp;
                    }
                });
            }
        });
    } catch (error) {
        console.error('[Buttercup] Error deleting summary:', error);
        showAlert('Failed to delete summary', 'error');
    }
});

// Initialize transcript info on load
refreshTranscriptInfo();

// Load settings from Chrome storage
chrome.storage.sync.get([
    'buttercup_enabled',
    'buttercup_translate',
    'buttercup_cache',
    'buttercup_download_srt',
    'buttercup_auto_transcribe',
    'buttercup_groq_api_key',
    'buttercup_groq_model',
    'buttercup_use_word_timestamps',
    'buttercup_words_per_line',
    'buttercup_max_line_length',
    'buttercup_prompt',
    'buttercup_temperature',
    'buttercup_response_format',
    'buttercup_language',
    'buttercup_llm_translation_enabled',
    'buttercup_llm_target_language',
    'buttercup_llm_provider',
    'buttercup_llm_api_key',
    'buttercup_llm_model',
    // Provider-specific settings
    'buttercup_llm_openai_api_key',
    'buttercup_llm_openai_model',
    'buttercup_llm_gemini_api_key',
    'buttercup_llm_gemini_model',
    'buttercup_llm_claude_api_key',
    'buttercup_llm_claude_model',
    'buttercup_caption_font_size',
    'buttercup_caption_vertical_position',
    'buttercup_caption_horizontal_position',
    'buttercup_caption_font_color',
    'buttercup_caption_bg_color',
    'buttercup_caption_bg_opacity',
    'buttercup_caption_container_width',
    'buttercup_dark_mode'
], (result) => {
    // General settings
    enabled.checked = result.buttercup_enabled !== false;
    translate.checked = result.buttercup_translate === true;
    cache.checked = result.buttercup_cache !== false;
    download.checked = result.buttercup_download_srt === true;
    autoTranscribe.checked = result.buttercup_auto_transcribe === true;
    if (result.buttercup_language) {
        language.value = result.buttercup_language;
    }

    // API settings
    // Note: Groq API keys are now managed by GroqKeyManager
    // They will be loaded automatically when the API tab is opened

    if (result.buttercup_groq_model) {
        groqModel.value = result.buttercup_groq_model;
    }
    // Update translation availability based on the selected model
    updateTranslationAvailability();

    // LLM Translation settings
    llmTranslationEnabled.checked = result.buttercup_llm_translation_enabled === true;
    toggleLLMTranslationSettings();

    if (result.buttercup_llm_target_language) {
        llmTargetLanguage.value = result.buttercup_llm_target_language;
    }

    if (result.buttercup_llm_provider) {
        llmProvider.value = result.buttercup_llm_provider;
    }

    // Load provider-specific API key and model
    const currentProvider = llmProvider.value || 'openai';
    const providerApiKeyKey = `buttercup_llm_${currentProvider}_api_key`;
    const providerModelKey = `buttercup_llm_${currentProvider}_model`;

    // Prefer provider-specific settings, fallback to legacy global settings
    if (result[providerApiKeyKey]) {
        llmApiKey.value = result[providerApiKeyKey];
    } else if (result.buttercup_llm_api_key) {
        llmApiKey.value = result.buttercup_llm_api_key;
    }

    if (result[providerModelKey]) {
        llmModel.value = result[providerModelKey];
    } else if (result.buttercup_llm_model) {
        llmModel.value = result.buttercup_llm_model;
    }

    // Update previousProvider for the change event listener
    previousProvider = currentProvider;

    // Advanced settings
    useWordTimestamps.checked = result.buttercup_use_word_timestamps !== false;
    toggleWordTimestampSettings();

    if (result.buttercup_words_per_line !== undefined) {
        wordsPerLine.value = result.buttercup_words_per_line;
    }

    if (result.buttercup_max_line_length !== undefined) {
        maxLineLength.value = result.buttercup_max_line_length;
    }

    if (result.buttercup_prompt) {
        modelPrompt.value = result.buttercup_prompt;
    }

    if (result.buttercup_temperature !== undefined) {
        temperature.value = result.buttercup_temperature;
    }

    if (result.buttercup_response_format) {
        responseFormat.value = result.buttercup_response_format;
    }

    // Caption Customization settings
    if (result.buttercup_caption_font_size !== undefined) {
        captionFontSize.value = result.buttercup_caption_font_size;
        fontSizeValue.textContent = result.buttercup_caption_font_size;
    }

    if (result.buttercup_caption_vertical_position !== undefined) {
        captionVerticalPosition.value = result.buttercup_caption_vertical_position;
        captionVerticalValue.textContent = result.buttercup_caption_vertical_position + '%';
    }

    if (result.buttercup_caption_horizontal_position) {
        captionHorizontalPosition.value = result.buttercup_caption_horizontal_position;
        const value = result.buttercup_caption_horizontal_position;
        captionHorizontalValue.textContent = value.charAt(0).toUpperCase() + value.slice(1);
    }

    if (result.buttercup_caption_font_color) {
        captionFontColor.value = result.buttercup_caption_font_color;
        captionFontColorText.value = result.buttercup_caption_font_color;
    }

    if (result.buttercup_caption_bg_color) {
        captionBgColor.value = result.buttercup_caption_bg_color;
        captionBgColorText.value = result.buttercup_caption_bg_color;
    }

    if (result.buttercup_caption_bg_opacity !== undefined) {
        const opacityPercent = Math.round(result.buttercup_caption_bg_opacity * 100);
        captionBgOpacity.value = opacityPercent;
        captionOpacityValue.textContent = opacityPercent + '%';
    }

    if (result.buttercup_caption_container_width !== undefined) {
        captionContainerWidth.value = result.buttercup_caption_container_width;
        captionWidthValue.textContent = result.buttercup_caption_container_width + '%';
    }

    // Update caption preview
    updateCaptionPreview();

    // Dark Mode setting
    darkMode.checked = result.buttercup_dark_mode === true;
    const theme = result.buttercup_dark_mode ? 'dark' : 'cupcake';
    document.documentElement.setAttribute('data-theme', theme);
});

// Check if API keys are set and show a warning if not
chrome.storage.sync.get(['buttercup_groq_api_key'], (result) => {
    const needsGroqKey = !result.buttercup_groq_api_key;
    
    if (needsGroqKey) {
        // Switch to API tab if keys are not set
        tabApi.click();
        
        // Show warning
        let warningMessage = 'Please set up your Groq API key to use Buttercup.';
        
        showAlert(warningMessage, 'warning');
    }
});