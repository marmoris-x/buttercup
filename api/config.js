/**
 * API Configuration handler for Buttercup
 * Manages API keys and configuration for Groq API
 */

class APIConfig {
    constructor() {
        this.groqApiKey = null;
        this.groqModel = 'whisper-large-v3';
        this.useWordTimestamps = true;
        this.wordsPerLine = 16;
        this.maxLineLength = 8;
        this.prompt = "";
        this.language = 'auto';
        this.temperature = 0;
        this.responseFormat = 'verbose_json';

        // Initialize API instances
        this.groqAPI = new GroqAPI();
    }

    /**
     * Initialize the configuration from settings received via custom event
     * @param {Object} settings - The settings object
     */
    initFromSettings(settings) {
        console.info('[Buttercup] Initializing config with settings:', settings);

        if (settings.groqApiKey) {
            this.groqApiKey = settings.groqApiKey;
            this.groqAPI.setApiKey(this.groqApiKey);
        }

        if (settings.groqModel) {
            this.groqModel = settings.groqModel;
            this.groqAPI.setModel(this.groqModel);
        }

        // Set word timestamp settings
        if (settings.useWordTimestamps !== undefined) {
            this.useWordTimestamps = settings.useWordTimestamps;
        }

        if (settings.wordsPerLine !== undefined) {
            this.wordsPerLine = settings.wordsPerLine;
        }

        if (settings.maxLineLength !== undefined) {
            this.maxLineLength = settings.maxLineLength;
        }

        // Set prompt
        if (settings.prompt !== undefined) {
            this.prompt = settings.prompt;
        }

        // Set temperature
        if (settings.temperature !== undefined) {
            this.temperature = settings.temperature;
        }

        // Set response format
        if (settings.responseFormat !== undefined) {
            this.responseFormat = settings.responseFormat;
        }

        // Set language - CRITICAL for correct transcription!
        if (settings.language !== undefined) {
            this.language = settings.language;
            console.info('[Buttercup] Language set to:', this.language);
        }
    }


    /**
     * Set the Groq API key
     * @param {string} apiKey - The API key for Groq
     */
    setGroqApiKey(apiKey) {
        this.groqApiKey = apiKey;
        this.groqAPI.setApiKey(apiKey);
        // Use custom event to notify content script to save the setting
        document.dispatchEvent(new CustomEvent('buttercupSaveSetting', { 
            detail: { key: 'buttercup_groq_api_key', value: apiKey }
        }));
    }

    /**
     * Set the Groq model
     * @param {string} model - The model to use for Groq API
     */
    setGroqModel(model) {
        this.groqModel = model;
        this.groqAPI.setModel(model);
        // Use custom event to notify content script to save the setting
        document.dispatchEvent(new CustomEvent('buttercupSaveSetting', { 
            detail: { key: 'buttercup_groq_model', value: model }
        }));
    }


    /**
     * Get the Groq API key
     * @returns {string} The Groq API key
     */
    getGroqApiKey() {
        return this.groqApiKey;
    }

    /**
     * Get the Groq model
     * @returns {string} The Groq model
     */
    getGroqModel() {
        return this.groqModel;
    }


    /**
     * Check if the Groq API key is set
     * @returns {boolean} True if the Groq API key is set, false otherwise
     */
    hasGroqApiKey() {
        return this.groqApiKey !== null && this.groqApiKey !== '';
    }

    /**
     * Check if all required API keys are set
     * @returns {boolean} True if all required API keys are set, false otherwise
     */
    hasAllApiKeys() {
        return this.hasGroqApiKey();
    }

    /**
     * Check if the current model supports translation
     * @returns {boolean} True if the current model supports translation
     */
    supportsTranslation() {
        return this.groqModel === 'whisper-large-v3';
    }


    /**
     * Get the Groq API instance
     * @returns {GroqAPI} The Groq API instance
     */
    getGroqAPI() {
        return this.groqAPI;
    }
    
    /**
     * Set whether to use word-level timestamps
     * @param {boolean} use - Whether to use word-level timestamps
     */
    setUseWordTimestamps(use) {
        this.useWordTimestamps = use;
        // Use custom event to notify content script to save the setting
        document.dispatchEvent(new CustomEvent('buttercupSaveSetting', {
            detail: { key: 'buttercup_use_word_timestamps', value: use }
        }));
    }
    
    /**
     * Set the number of words per line
     * @param {number} count - The number of words per line
     */
    setWordsPerLine(count) {
        this.wordsPerLine = count;
        // Use custom event to notify content script to save the setting
        document.dispatchEvent(new CustomEvent('buttercupSaveSetting', {
            detail: { key: 'buttercup_words_per_line', value: count }
        }));
    }
    
    /**
     * Set the maximum line length
     * @param {number} length - The maximum words before inserting a line break (0 to disable line breaks)
     */
    setMaxLineLength(length) {
        this.maxLineLength = length;
        // Use custom event to notify content script to save the setting
        document.dispatchEvent(new CustomEvent('buttercupSaveSetting', {
            detail: { key: 'buttercup_max_line_length', value: length }
        }));
    }
    
    /**
     * Set the prompt for the model
     * @param {string} prompt - The prompt to guide the model
     */
    setPrompt(prompt) {
        this.prompt = prompt;
        // Use custom event to notify content script to save the setting
        document.dispatchEvent(new CustomEvent('buttercupSaveSetting', {
            detail: { key: 'buttercup_prompt', value: prompt }
        }));
    }
    
    /**
     * Get whether to use word-level timestamps
     * @returns {boolean} Whether to use word-level timestamps
     */
    getUseWordTimestamps() {
        return this.useWordTimestamps;
    }
    
    /**
     * Get the number of words per line
     * @returns {number} The number of words per line
     */
    getWordsPerLine() {
        return this.wordsPerLine;
    }
    
    /**
     * Get the maximum line length
     * @returns {number} The maximum words before inserting a line break (0 means no line breaks)
     */
    getMaxLineLength() {
        return this.maxLineLength;
    }
    
    /**
     * Get the prompt for the model
     * @returns {string} The prompt to guide the model
     */
    getPrompt() {
        return this.prompt;
    }
    
    /**
     * Get the selected language
     * @returns {string} The selected language
     */
    getLanguage() {
        return this.language;
    }

    /**
     * Get the temperature value
     * @returns {number} The temperature value (0-1)
     */
    getTemperature() {
        return this.temperature;
    }

    /**
     * Get the response format
     * @returns {string} The response format (verbose_json, json, text)
     */
    getResponseFormat() {
        return this.responseFormat;
    }
}

// Export the class
window.APIConfig = APIConfig;