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
const language = document.getElementById('language');
const startTranscription = document.getElementById('start-transcription');

// API settings elements
const groqApiKey = document.getElementById('groq-api-key');
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
const tabApi = document.getElementById('tab-api');
const tabAdvanced = document.getElementById('tab-advanced');
const generalTabContent = document.getElementById('general-tab');
const transcriptTabContent = document.getElementById('transcript-tab');
const apiTabContent = document.getElementById('api-tab');
const advancedTabContent = document.getElementById('advanced-tab');

// Transcript tab elements
const currentVideoIdEl = document.getElementById('current-video-id');
const transcriptStatusBadge = document.getElementById('transcript-status-badge');
const transcriptDate = document.getElementById('transcript-date');
const summaryStatusContainer = document.getElementById('summary-status-container');
const showExistingSummary = document.getElementById('show-existing-summary');
const deleteExistingSummary = document.getElementById('delete-existing-summary');
const transcriptActions = document.getElementById('transcript-actions');
const downloadTranscriptSrt = document.getElementById('download-transcript-srt');
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

// Tab navigation
tabGeneral.addEventListener('click', () => {
    tabGeneral.classList.add('tab-active');
    tabTranscript.classList.remove('tab-active');
    tabApi.classList.remove('tab-active');
    tabAdvanced.classList.remove('tab-active');
    generalTabContent.classList.remove('hidden');
    transcriptTabContent.classList.add('hidden');
    apiTabContent.classList.add('hidden');
    advancedTabContent.classList.add('hidden');
});

tabTranscript.addEventListener('click', () => {
    tabTranscript.classList.add('tab-active');
    tabGeneral.classList.remove('tab-active');
    tabApi.classList.remove('tab-active');
    tabAdvanced.classList.remove('tab-active');
    transcriptTabContent.classList.remove('hidden');
    generalTabContent.classList.add('hidden');
    apiTabContent.classList.add('hidden');
    advancedTabContent.classList.add('hidden');
    // Refresh transcript info when tab is opened
    refreshTranscriptInfo();
});

tabApi.addEventListener('click', () => {
    tabApi.classList.add('tab-active');
    tabGeneral.classList.remove('tab-active');
    tabTranscript.classList.remove('tab-active');
    tabAdvanced.classList.remove('tab-active');
    apiTabContent.classList.remove('hidden');
    generalTabContent.classList.add('hidden');
    transcriptTabContent.classList.add('hidden');
    advancedTabContent.classList.add('hidden');
});

tabAdvanced.addEventListener('click', () => {
    tabAdvanced.classList.add('tab-active');
    tabGeneral.classList.remove('tab-active');
    tabTranscript.classList.remove('tab-active');
    tabApi.classList.remove('tab-active');
    advancedTabContent.classList.remove('hidden');
    generalTabContent.classList.add('hidden');
    transcriptTabContent.classList.add('hidden');
    apiTabContent.classList.add('hidden');
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

// API settings event listeners
saveApiSettings.addEventListener('click', () => {
    // Validate required fields
    if (!groqApiKey.value) {
        showAlert('Groq API Key is required', 'error');
        return;
    }

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

    // Save API settings to Chrome storage
    const settings = {
        buttercup_groq_api_key: groqApiKey.value,
        buttercup_groq_model: groqModel.value,
        buttercup_llm_translation_enabled: llmTranslationEnabled.checked,
        buttercup_llm_target_language: llmTargetLanguage.value,
        buttercup_llm_provider: llmProvider.value,
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
        if (!tab.url || !tab.url.includes('youtube.com/watch')) {
            showAlert('Please open a YouTube video first', 'warning');
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
            showAlert('Error starting transcription. Make sure you are on a YouTube video page.', 'error');
        });
    } catch (error) {
        console.error('[Buttercup] Error in start transcription handler:', error);
        showAlert('Error starting transcription', 'error');
    }
});

// ============ Transcript Management Functions ============

let currentTranscriptData = null;

// Helper function to extract video ID from URL
function getVideoIdFromTab(tab) {
    if (!tab || !tab.url) return null;

    const url = new URL(tab.url);
    const pathname = url.pathname;

    if (pathname.startsWith('/clip')) {
        return null; // Would need to parse from page, skipping for now
    } else if (pathname.startsWith('/shorts')) {
        return pathname.slice(8);
    }
    return url.searchParams.get('v');
}

// Refresh transcript info for current video
async function refreshTranscriptInfo() {
    try {
        // Get current tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab || !tab.url || !tab.url.includes('youtube.com/watch')) {
            currentVideoIdEl.textContent = 'Not on a YouTube video';
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
            disableTranscriptButtons();
            currentTranscriptData = null;
            loadStorageStats();
            return;
        }

        currentVideoIdEl.textContent = videoId;

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
    transcriptActions.style.opacity = '1';
    downloadTranscriptSrt.disabled = false;
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
    transcriptActions.style.opacity = '0.5';
    downloadTranscriptSrt.disabled = true;
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

// Download SRT file
downloadTranscriptSrt.addEventListener('click', () => {
    if (!currentTranscriptData) {
        showAlert('No transcript data available', 'error');
        return;
    }

    const srtData = currentTranscriptData.srtData;
    const videoTitle = currentTranscriptData.videoTitle || 'buttercup_subtitles';

    // Create blob and download
    const blob = new Blob([srtData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${videoTitle}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showAlert('SRT file downloaded successfully', 'success');
});

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
                const videoId = currentVideoIdEl.textContent;

                if (transcripts[videoId]) {
                    transcripts[videoId].srtData = newSrtData;
                    transcripts[videoId].youtubeFormat = youtubeFormat;

                    chrome.storage.local.set({ buttercup_transcripts: transcripts }, () => {
                        currentTranscriptData.srtData = newSrtData;
                        currentTranscriptData.youtubeFormat = youtubeFormat;
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

// Delete transcript
deleteTranscript.addEventListener('click', () => {
    if (!currentTranscriptData) {
        showAlert('No transcript data available', 'error');
        return;
    }

    if (!confirm('Are you sure you want to delete this transcript? This action cannot be undone.')) {
        return;
    }

    const videoId = currentVideoIdEl.textContent;

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
        if (!tab.url || !tab.url.includes('youtube.com/watch')) {
            showAlert('Please open a YouTube video to view the summary', 'warning');
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
    'buttercup_groq_api_key',
    'buttercup_groq_model',
    'buttercup_use_word_timestamps',
    'buttercup_words_per_line',
    'buttercup_max_line_length',
    'buttercup_prompt',
    'buttercup_language',
    'buttercup_llm_translation_enabled',
    'buttercup_llm_target_language',
    'buttercup_llm_provider',
    'buttercup_llm_api_key',
    'buttercup_llm_model'
], (result) => {
    // General settings
    enabled.checked = result.buttercup_enabled !== false;
    translate.checked = result.buttercup_translate === true;
    cache.checked = result.buttercup_cache !== false;
    download.checked = result.buttercup_download_srt === true;
    if (result.buttercup_language) {
        language.value = result.buttercup_language;
    }

    // API settings

    if (result.buttercup_groq_api_key) {
        groqApiKey.value = result.buttercup_groq_api_key;
    }

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

    if (result.buttercup_llm_api_key) {
        llmApiKey.value = result.buttercup_llm_api_key;
    }

    if (result.buttercup_llm_model) {
        llmModel.value = result.buttercup_llm_model;
    }

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