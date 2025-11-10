/**
 * LLM Translation API - Multi-provider translation support
 * Supports: OpenAI, Gemini, Claude, OpenRouter
 */

class LLMTranslation {
    constructor(provider, apiKey, model) {
        this.provider = provider;
        this.apiKey = apiKey;
        this.model = model;
    }

    /**
     * Retry a function with exponential backoff
     * @param {Function} fn - The function to retry
     * @param {number} maxRetries - Maximum number of retries (default: 3)
     * @param {number} baseDelay - Base delay in milliseconds (default: 1000)
     * @returns {Promise} - The result of the function
     */
    async retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
        let lastError;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;

                // Don't retry on certain errors
                if (this.shouldNotRetry(error)) {
                    console.warn(`[LLMTranslation] Error is not retryable: ${error.message}`);
                    throw error;
                }

                // If this was the last attempt, throw the error
                if (attempt === maxRetries) {
                    console.error(`[LLMTranslation] Max retries (${maxRetries}) reached. Giving up.`);
                    throw error;
                }

                // Calculate delay with exponential backoff
                const delay = baseDelay * Math.pow(2, attempt);
                console.warn(`[LLMTranslation] Attempt ${attempt + 1} failed. Retrying in ${delay}ms... Error: ${error.message}`);

                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError;
    }

    /**
     * Check if an error should not be retried
     * @param {Error} error - The error to check
     * @returns {boolean} - True if the error should not be retried
     */
    shouldNotRetry(error) {
        const message = error.message.toLowerCase();

        // Don't retry on authentication errors
        if (message.includes('401') || message.includes('unauthorized') || message.includes('invalid api key')) {
            return true;
        }

        // Don't retry on invalid request errors (400, 422)
        if (message.includes('400') || message.includes('422')) {
            return true;
        }

        // Don't retry on model not found
        if (message.includes('404') || message.includes('model not found')) {
            return true;
        }

        return false;
    }

    /**
     * Parse LLM API error and provide user-friendly message
     * @param {string} provider - The LLM provider (openai, gemini, claude, openrouter)
     * @param {Response} response - The fetch response
     * @param {string} errorText - The error text from the response
     * @returns {Error} - A formatted error with helpful message
     */
    parseLLMError(provider, response, errorText) {
        const status = response.status;
        let message = errorText;
        let suggestion = '';

        // Try to parse JSON error
        try {
            const errorData = JSON.parse(errorText);
            if (errorData.error && errorData.error.message) {
                message = errorData.error.message;
            } else if (errorData.error) {
                message = errorData.error;
            }
        } catch (e) {
            // Not JSON, use raw text
        }

        // Provide specific messages based on status code
        switch (status) {
            case 400:
                suggestion = 'Invalid request. The text might be too long or contain unsupported characters. Try reducing the text length.';
                break;
            case 401:
                suggestion = `Your ${provider} API key is invalid or expired. Please check your API key in the extension settings.`;
                break;
            case 403:
                suggestion = `Access forbidden. Your ${provider} API key might not have permission for this model.`;
                break;
            case 404:
                suggestion = `Model not found. The model "${this.model}" might not be available for ${provider}. Check the model name in settings.`;
                break;
            case 429:
                suggestion = `Rate limit exceeded for ${provider}. Please wait a few moments before trying again, or upgrade your API plan.`;
                break;
            case 500:
            case 502:
            case 503:
            case 504:
                suggestion = `${provider} server error. This is usually temporary - please try again in a few moments.`;
                break;
            default:
                suggestion = 'An unexpected error occurred. Please try again.';
        }

        const fullMessage = `${provider.toUpperCase()} Translation Error (${status}): ${message}\n\n💡 ${suggestion}`;
        const error = new Error(fullMessage);
        error.status = status;
        error.originalMessage = message;
        error.suggestion = suggestion;
        error.provider = provider;

        return error;
    }

    /**
     * Translate caption events to target language
     * @param {Array} captionEvents - Array of caption events with segs
     * @param {string} targetLanguage - Target language (e.g., "German", "Spanish", "French")
     * @returns {Promise<Array>} - Translated caption events
     */
    async translateCaptions(captionEvents, targetLanguage, videoContext = null) {
        console.info(`[LLMTranslation] Starting translation to ${targetLanguage} using ${this.provider}`);

        // Extract all text segments (flatten all segs from all events)
        const textsToTranslate = captionEvents.map(event =>
            event.segs.map(seg => seg.utf8).join(' ')
        );

        console.info(`[LLMTranslation] Translating ${textsToTranslate.length} caption segments`);

        // Build comprehensive context for better translation
        const fullContext = this.buildFullContext(textsToTranslate, videoContext);

        // Smart batching: Larger chunks for better context, but allow streaming
        const chunkSize = textsToTranslate.length <= 100 ? textsToTranslate.length : 50;
        const translatedTexts = [];

        for (let i = 0; i < textsToTranslate.length; i += chunkSize) {
            const chunk = textsToTranslate.slice(i, i + chunkSize);
            const chunkNum = Math.floor(i/chunkSize) + 1;
            const totalChunks = Math.ceil(textsToTranslate.length/chunkSize);

            console.info(`[LLMTranslation] Processing chunk ${chunkNum}/${totalChunks}`);

            const translatedChunk = await this.translateBatch(chunk, targetLanguage, fullContext);
            translatedTexts.push(...translatedChunk);

            // Callback for streaming (if provided)
            if (this.onChunkComplete) {
                this.onChunkComplete(chunkNum, totalChunks, translatedChunk);
            }
        }

        // Simple 1:1 mapping of translations to events
        const translatedEvents = captionEvents.map((event, index) => {
            const translatedText = translatedTexts[index];

            if (!translatedText) {
                console.error(`[LLMTranslation] ⚠ Missing translation for event ${index}, using original`);
                return event;
            }

            // Simple approach: Use translated text as-is, one segment per event
            return {
                ...event,
                segs: [{ utf8: translatedText }]
            };
        });

        console.info('[LLMTranslation] ✓ Translation complete');
        return translatedEvents;
    }

    /**
     * Build comprehensive context for better translation
     */
    buildFullContext(texts, videoContext) {
        // Get video metadata if available
        const videoTitle = videoContext?.title || 'Unknown';
        const videoDuration = videoContext?.duration || 'Unknown';

        // Full transcript preview (first 30% and last 10%)
        const previewCount = Math.min(Math.ceil(texts.length * 0.3), 50);
        const endPreviewCount = Math.min(Math.ceil(texts.length * 0.1), 15);

        const fullTranscript = texts.join(' ');
        const transcriptStart = texts.slice(0, previewCount).join(' ');
        const transcriptEnd = texts.length > previewCount ? texts.slice(-endPreviewCount).join(' ') : '';

        return {
            videoTitle,
            videoDuration,
            totalSegments: texts.length,
            fullTranscriptPreview: fullTranscript.substring(0, 3000), // First 3000 chars
            transcriptStart,
            transcriptEnd,
            estimatedTopic: this.detectTopic(fullTranscript.substring(0, 2000))
        };
    }

    /**
     * Detect topic/category from transcript for better context
     */
    detectTopic(text) {
        const lowerText = text.toLowerCase();

        // Islamic/Religious content
        if (lowerText.includes('allah') || lowerText.includes('قرآن') || lowerText.includes('الله')) {
            return 'Islamic/Religious';
        }
        // Educational
        if (lowerText.includes('learn') || lowerText.includes('tutorial') || lowerText.includes('lesson')) {
            return 'Educational';
        }
        // News
        if (lowerText.includes('report') || lowerText.includes('news') || lowerText.includes('breaking')) {
            return 'News';
        }

        return 'General';
    }

    /**
     * Translate a batch of texts
     */
    async translateBatch(texts, targetLanguage, fullContext) {
        const prompt = this.buildPrompt(texts, targetLanguage, fullContext);

        switch (this.provider) {
            case 'openai':
                return await this.translateWithOpenAI(prompt, texts.length);
            case 'gemini':
                return await this.translateWithGemini(prompt, texts.length);
            case 'claude':
                return await this.translateWithClaude(prompt, texts.length);
            case 'openrouter':
                return await this.translateWithOpenRouter(prompt, texts.length);
            default:
                throw new Error(`Unknown provider: ${this.provider}`);
        }
    }

    buildPrompt(texts, targetLanguage, fullContext) {
        // Build comprehensive context section
        const contextSection = fullContext ? `
═══════════════════════════════════════════════════════════════
                    📺 VIDEO CONTEXT (READ THIS FIRST!)
═══════════════════════════════════════════════════════════════

Video Title: ${fullContext.videoTitle}
Duration: ${fullContext.videoDuration}
Content Type: ${fullContext.estimatedTopic}
Total Segments: ${fullContext.totalSegments}

FULL TRANSCRIPT PREVIEW (First 3000 characters):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${fullContext.fullTranscriptPreview}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VIDEO ENDING PREVIEW:
${fullContext.transcriptEnd ? fullContext.transcriptEnd : 'N/A'}

═══════════════════════════════════════════════════════════════
` : '';

        // Language-specific instructions
        const languageInstructions = this.getLanguageSpecificInstructions(targetLanguage, fullContext.estimatedTopic);

        return `You are a professional subtitle translator. Your task is to translate video subtitles.

${contextSection}

${languageInstructions}

TRANSLATION RULES:
1. Output EXACTLY ${texts.length} translated lines (one per input line)
2. NO explanations, NO numbering, NO extra commentary
3. Preserve EXACT meaning and context from the video
4. Keep subtitle length appropriate for reading speed
5. Maintain natural speech flow and timing

CULTURAL & TERMINOLOGY PRESERVATION:
- Religious terms: "Allah" → "Allah" (NEVER "God"/"Gott"/"Dios")
- Islamic terms: Keep "Quran", "Hadith", "Salah", "Inshallah", "Mashallah" etc.
- Proper nouns: Names, places, brands stay unchanged
- Technical terms: Keep specialized vocabulary accurate

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    SUBTITLES TO TRANSLATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${texts.map((text, i) => `${i + 1}. ${text}`).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                TRANSLATED SUBTITLES (${targetLanguage})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Output ${texts.length} lines below (numbered format is fine):`;
    }

    /**
     * Get language-specific translation instructions
     */
    getLanguageSpecificInstructions(targetLanguage, topic) {
        const isGerman = targetLanguage.toLowerCase().includes('german') || targetLanguage.toLowerCase().includes('deutsch');
        const isIslamic = topic === 'Islamic/Religious';

        if (isGerman && isIslamic) {
            return `
🎯 SPECIAL INSTRUCTIONS: Arabic → German (Islamic Content)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Use Frank Bubenheim's Quran translation style and terminology
- Maintain theological precision and reverent tone
- Use established German Islamic terminology:
  • "die Rechtleitung" (guidance)
  • "die Barmherzigkeit Allahs" (mercy of Allah)
  • "der Erhabene" (the Exalted)
- For Quranic verses: Match Bubenheim's translation phrasing
- Preserve formal and respectful linguistic style
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
        }

        return `STANDARD TRANSLATION: Maintain accuracy and natural flow in ${targetLanguage}.`;
    }

    async translateWithOpenAI(prompt, expectedCount) {
        console.info('[LLMTranslation] Using OpenAI API');

        // Wrap API call in retry logic
        return await this.retryWithBackoff(async () => {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        { role: 'system', content: 'You are a professional subtitle translator. Output exactly the requested number of lines, one translation per line. Use the full video context to ensure accurate translations.' },
                        { role: 'user', content: prompt }
                    ],
                    max_completion_tokens: 128000
                })
            });

            if (!response.ok) {
                const error = await response.text();
                throw this.parseLLMError('openai', response, error);
            }

            const data = await response.json();
            const translatedText = data.choices[0].message.content;

            return this.parseTranslationResponse(translatedText, expectedCount);
        }, 3, 2000); // 3 retries, starting with 2 second delay
    }

    async translateWithGemini(prompt, expectedCount) {
        console.info('[LLMTranslation] Using Gemini API');

        // Wrap API call in retry logic
        return await this.retryWithBackoff(async () => {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 65000
                    },
                    safetySettings: [
                        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                    ]
                })
            });

            if (!response.ok) {
                const error = await response.text();
                console.error('[LLMTranslation] Gemini API error response:', error);
                throw this.parseLLMError('gemini', response, error);
            }

            const data = await response.json();
            console.log('[LLMTranslation] Gemini response:', JSON.stringify(data, null, 2));

            // Check if response has the expected structure
            if (!data.candidates || !data.candidates[0]) {
                console.error('[LLMTranslation] Unexpected Gemini response structure:', data);
                throw new Error(`Gemini returned unexpected response. Check if prompt is too long or contains invalid characters. Response: ${JSON.stringify(data)}`);
            }

            if (!data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
                console.error('[LLMTranslation] Gemini response missing content:', data);
                throw new Error(`Gemini response missing content. Finish reason: ${data.candidates[0].finishReason || 'unknown'}`);
            }

            const translatedText = data.candidates[0].content.parts[0].text;
            console.log('[LLMTranslation] Raw Gemini text (first 500 chars):', translatedText.substring(0, 500));

            return this.parseTranslationResponse(translatedText, expectedCount);
        }, 3, 2000); // 3 retries, starting with 2 second delay
    }

    async translateWithClaude(prompt, expectedCount) {
        console.info('[LLMTranslation] Using Claude API');

        // Wrap API call in retry logic
        return await this.retryWithBackoff(async () => {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: this.model,
                    max_tokens: 4000,
                    temperature: 0.3,
                    messages: [{
                        role: 'user',
                        content: prompt
                    }]
                })
            });

            if (!response.ok) {
                const error = await response.text();
                throw this.parseLLMError('claude', response, error);
            }

            const data = await response.json();
            const translatedText = data.content[0].text;

            return this.parseTranslationResponse(translatedText, expectedCount);
        }, 3, 2000); // 3 retries, starting with 2 second delay
    }

    async translateWithOpenRouter(prompt, expectedCount) {
        console.info('[LLMTranslation] Using OpenRouter API');

        // Wrap API call in retry logic
        return await this.retryWithBackoff(async () => {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': 'https://github.com/yourusername/buttercup',
                    'X-Title': 'Buttercup Subtitle Translator'
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        { role: 'system', content: 'You are a professional subtitle translator. Output exactly the requested number of lines, one translation per line. Use the full video context to ensure accurate translations.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.3,
                    max_tokens: 4000
                })
            });

            if (!response.ok) {
                const error = await response.text();
                throw this.parseLLMError('openrouter', response, error);
            }

            const data = await response.json();
            const translatedText = data.choices[0].message.content;

            return this.parseTranslationResponse(translatedText, expectedCount);
        }, 3, 2000); // 3 retries, starting with 2 second delay
    }

    /**
     * Parse LLM response into array of translations
     */
    parseTranslationResponse(text, expectedCount) {
        // Split by newlines and clean up
        let lines = text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            // Remove numbering if present (1. 2. etc)
            .map(line => line.replace(/^\d+\.\s*/, ''));

        // If we got more or fewer lines than expected, try to fix it
        if (lines.length !== expectedCount) {
            console.warn(`[LLMTranslation] Expected ${expectedCount} lines, got ${lines.length}. Adjusting...`);

            if (lines.length > expectedCount) {
                // Too many lines - take first N
                lines = lines.slice(0, expectedCount);
            } else {
                // Too few lines - pad with original or empty
                while (lines.length < expectedCount) {
                    lines.push('[Translation missing]');
                }
            }
        }

        return lines;
    }
}

// Make available globally
window.LLMTranslation = LLMTranslation;
