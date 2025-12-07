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
        // Build concise context section
        const contextSection = fullContext ? `
VIDEO CONTEXT:
- Title: ${fullContext.videoTitle}
- Content Type: ${fullContext.estimatedTopic}
- Total segments: ${fullContext.totalSegments}

TRANSCRIPT PREVIEW (for context only):
${fullContext.fullTranscriptPreview.substring(0, 1500)}
---` : '';

        // Language-specific instructions
        const languageInstructions = this.getLanguageSpecificInstructions(targetLanguage, fullContext.estimatedTopic);

        return `You are a subtitle translator. Translate each subtitle line to ${targetLanguage}.

${contextSection}

${languageInstructions}

STRICT RULES:
1. Return a JSON array with EXACTLY ${texts.length} strings
2. Each string is the translation of the corresponding input line
3. Maintain 1:1 correspondence - line 0 translates to index 0, etc.
4. NO explanations, NO comments, ONLY the JSON array
5. Keep religious terms intact: "Allah" stays "Allah", "Quran" stays "Quran"
6. Preserve proper nouns unchanged

INPUT LINES TO TRANSLATE (${texts.length} total):
${JSON.stringify(texts, null, 0)}

OUTPUT FORMAT - Return ONLY a valid JSON array like this:
["translated line 1", "translated line 2", "translated line 3", ...]

Your response must start with [ and end with ] - nothing else.`;
    }

    /**
     * Get language-specific translation instructions
     */
    getLanguageSpecificInstructions(targetLanguage, topic) {
        const isGerman = targetLanguage.toLowerCase().includes('german') || targetLanguage.toLowerCase().includes('deutsch');
        const isIslamic = topic === 'Islamic/Religious';

        if (isGerman && isIslamic) {
            return `SPECIAL: For Islamic/Arabic content to German:
- Use Frank Bubenheim's Quran translation style
- Use terms like "die Rechtleitung", "die Barmherzigkeit Allahs", "der Erhabene"
- Maintain theological precision and reverent tone`;
        }

        return `Maintain accuracy and natural flow in ${targetLanguage}.`;
    }

    async translateWithOpenAI(prompt, expectedCount) {
        console.info('[LLMTranslation] Using OpenAI API');

        // Check if this is a GPT-5 model (uses different API endpoint)
        const isGPT5Model = this.model.startsWith('gpt-5');

        // Use rate limiter if available, otherwise fall back to direct call
        const executeRequest = async () => {
            // Wrap API call in retry logic
            return await this.retryWithBackoff(async () => {
                // Estimate tokens needed: ~50 tokens per line for translation
                // Use conservative max to avoid model limit errors
                const estimatedTokensNeeded = Math.min(expectedCount * 100, 32000);

                let response;
                let translatedText;

                if (isGPT5Model) {
                    // GPT-5 models use the /v1/responses endpoint
                    console.info('[LLMTranslation] Using GPT-5 responses API endpoint');
                    response = await fetch('https://api.openai.com/v1/responses', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.apiKey}`
                        },
                        body: JSON.stringify({
                            model: this.model,
                            input: prompt,
                            reasoning: { effort: 'low' }
                        })
                    });

                    if (!response.ok) {
                        const error = await response.text();
                        throw this.parseLLMError('openai', response, error);
                    }

                    const data = await response.json();
                    console.log('[LLMTranslation] GPT-5 raw response:', JSON.stringify(data, null, 2));

                    // GPT-5 responses API structure - extract text from output array
                    if (data.output && Array.isArray(data.output)) {
                        // Find the message content in the output array
                        const messageItem = data.output.find(item => item.type === 'message');
                        if (messageItem && messageItem.content && Array.isArray(messageItem.content)) {
                            const textContent = messageItem.content.find(c => c.type === 'output_text' || c.type === 'text');
                            translatedText = textContent ? textContent.text : '';
                        } else {
                            translatedText = '';
                        }
                    } else if (typeof data.output_text === 'string') {
                        translatedText = data.output_text;
                    } else if (typeof data.output === 'string') {
                        translatedText = data.output;
                    } else {
                        console.error('[LLMTranslation] Unexpected GPT-5 response structure:', data);
                        throw new Error('GPT-5 API returned unexpected response structure');
                    }

                    if (!translatedText || typeof translatedText !== 'string') {
                        console.error('[LLMTranslation] Failed to extract text from GPT-5 response:', data);
                        throw new Error('Could not extract translation text from GPT-5 response');
                    }
                } else {
                    // Standard GPT models use /v1/chat/completions
                    response = await fetch('https://api.openai.com/v1/chat/completions', {
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
                            max_tokens: estimatedTokensNeeded
                        })
                    });

                    if (!response.ok) {
                        const error = await response.text();
                        throw this.parseLLMError('openai', response, error);
                    }

                    const data = await response.json();
                    translatedText = data.choices[0].message.content;
                }

                return this.parseTranslationResponse(translatedText, expectedCount);
            }, 3, 2000); // 3 retries, starting with 2 second delay
        };

        // Execute through rate limiter if available
        return window.rateLimiterManager
            ? await window.rateLimiterManager.execute('openai', executeRequest, {
                priority: 'normal',
                estimatedTokens: expectedCount * 100 // Rough estimate: 100 tokens per translation
            })
            : await executeRequest();
    }

    async translateWithGemini(prompt, expectedCount) {
        console.info('[LLMTranslation] Using Gemini API');

        // Use rate limiter if available, otherwise fall back to direct call
        const executeRequest = async () => {
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
        };

        // Execute through rate limiter if available
        return window.rateLimiterManager
            ? await window.rateLimiterManager.execute('gemini', executeRequest, {
                priority: 'normal',
                estimatedTokens: expectedCount * 100
            })
            : await executeRequest();
    }

    async translateWithClaude(prompt, expectedCount) {
        console.info('[LLMTranslation] Using Claude API');

        // Use rate limiter if available, otherwise fall back to direct call
        const executeRequest = async () => {
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
        };

        // Execute through rate limiter if available
        return window.rateLimiterManager
            ? await window.rateLimiterManager.execute('claude', executeRequest, {
                priority: 'normal',
                estimatedTokens: expectedCount * 100
            })
            : await executeRequest();
    }

    async translateWithOpenRouter(prompt, expectedCount) {
        console.info('[LLMTranslation] Using OpenRouter API');

        // Use rate limiter if available, otherwise fall back to direct call
        const executeRequest = async () => {
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
        };

        // Execute through rate limiter if available
        return window.rateLimiterManager
            ? await window.rateLimiterManager.execute('openrouter', executeRequest, {
                priority: 'normal',
                estimatedTokens: expectedCount * 100
            })
            : await executeRequest();
    }

    /**
     * Parse LLM response into array of translations
     */
    parseTranslationResponse(text, expectedCount) {
        console.log('[LLMTranslation] Parsing response, expected count:', expectedCount);
        console.log('[LLMTranslation] Raw text type:', typeof text, 'value:', text);

        // Ensure text is a string
        if (typeof text !== 'string') {
            console.error('[LLMTranslation] ERROR: text is not a string!', text);
            if (text === null || text === undefined) {
                throw new Error('Translation response is empty or null');
            }
            // Try to convert to string
            text = String(text);
        }

        console.log('[LLMTranslation] Raw response (first 500 chars):', text.substring(0, 500));

        let translations = [];

        // Try to parse as JSON first (preferred method)
        try {
            // Clean up the response - remove markdown code blocks if present
            let cleanedText = text.trim();

            // Remove markdown code block markers
            if (cleanedText.startsWith('```json')) {
                cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (cleanedText.startsWith('```')) {
                cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }

            // Find JSON array in the response
            const jsonMatch = cleanedText.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                translations = JSON.parse(jsonMatch[0]);

                if (Array.isArray(translations)) {
                    console.log('[LLMTranslation] Successfully parsed JSON array with', translations.length, 'items');

                    // Validate each translation is a string
                    translations = translations.map((t, i) => {
                        if (typeof t === 'string') {
                            return t.trim();
                        } else if (t && typeof t === 'object' && t.text) {
                            return String(t.text).trim();
                        } else {
                            console.warn(`[LLMTranslation] Invalid translation at index ${i}:`, t);
                            return '[Translation error]';
                        }
                    });
                }
            }
        } catch (jsonError) {
            console.warn('[LLMTranslation] JSON parsing failed, trying line-based fallback:', jsonError.message);
        }

        // Fallback: line-based parsing if JSON failed
        if (!translations.length) {
            console.log('[LLMTranslation] Using line-based fallback parsing');
            translations = text
                .split('\n')
                .map(line => line.trim())
                .filter(line => {
                    // Filter out empty lines and common LLM artifacts
                    if (!line) return false;
                    if (line.startsWith('```')) return false;
                    if (line === '[' || line === ']') return false;
                    if (line.match(/^(Here|Note|Translation|Output|Result)/i)) return false;
                    return true;
                })
                // Remove numbering if present (1. 2. etc or 1: 2: etc)
                .map(line => line.replace(/^\d+[\.\:\)]\s*/, '').trim())
                // Remove JSON array syntax if partially present
                .map(line => line.replace(/^["']|["'],?$/g, '').trim())
                .filter(line => line.length > 0);
        }

        // Validate count
        if (translations.length !== expectedCount) {
            console.warn(`[LLMTranslation] ⚠ Count mismatch! Expected ${expectedCount}, got ${translations.length}`);

            if (translations.length > expectedCount) {
                console.warn('[LLMTranslation] Trimming excess translations');
                translations = translations.slice(0, expectedCount);
            } else {
                console.error('[LLMTranslation] Missing translations, padding with placeholders');
                while (translations.length < expectedCount) {
                    translations.push('[Translation missing]');
                }
            }
        }

        console.log('[LLMTranslation] Final parsed translations:', translations.length);
        return translations;
    }
}


// Make available globally
window.LLMTranslation = LLMTranslation;
