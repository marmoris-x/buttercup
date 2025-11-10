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
     * Translate caption events to target language
     * @param {Array} captionEvents - Array of caption events with segs
     * @param {string} targetLanguage - Target language (e.g., "German", "Spanish", "French")
     * @returns {Promise<Array>} - Translated caption events
     */
    async translateCaptions(captionEvents, targetLanguage) {
        console.info(`[LLMTranslation] Starting translation to ${targetLanguage} using ${this.provider}`);

        // Store original segment structure for each event
        const segmentStructures = captionEvents.map(event => event.segs.length);

        // Extract all text from captions, using ||| as separator for multi-line entries
        const textsToTranslate = captionEvents.map(event =>
            event.segs.map(seg => seg.utf8).join('|||')  // Use ||| as line separator
        );

        console.info(`[LLMTranslation] Translating ${textsToTranslate.length} caption segments`);
        console.info(`[LLMTranslation] Segment structures:`, segmentStructures.slice(0, 10));

        // Get full context summary for better translation quality
        const fullContext = this.getFullContext(textsToTranslate);

        // Smart batching: Use larger chunks when possible
        // For videos under 100 captions, try to do it all at once for full context
        const chunkSize = textsToTranslate.length <= 100 ? textsToTranslate.length : 50;
        const translatedTexts = [];

        for (let i = 0; i < textsToTranslate.length; i += chunkSize) {
            const chunk = textsToTranslate.slice(i, i + chunkSize);
            console.info(`[LLMTranslation] Processing chunk ${Math.floor(i/chunkSize) + 1}/${Math.ceil(textsToTranslate.length/chunkSize)}`);

            const translatedChunk = await this.translateBatch(chunk, targetLanguage, fullContext);
            translatedTexts.push(...translatedChunk);
        }

        // Replace original text with translations, preserving segment structure
        const translatedEvents = captionEvents.map((event, index) => {
            const translatedText = translatedTexts[index];
            const originalSegmentCount = segmentStructures[index];

            // Safety check: if translatedText is undefined, use original text
            if (!translatedText) {
                console.error(`[LLMTranslation] ⚠ Missing translation for event ${index}, using original text`);
                return event;
            }

            // Split the translated text back using the ||| separator
            // KEEP newlines (\n) to preserve 2-line subtitle structure!
            const lines = translatedText.split('|||')
                .map(line => line.trim())  // Only trim whitespace, DON'T remove \n!
                .filter(line => line.length > 0);

            console.log(`[LLMTranslation] Event ${index}: Expected ${originalSegmentCount} segs, got ${lines.length} lines`);

            // If translation has the same number of lines as original segments, use them directly
            let segs;
            if (lines.length === originalSegmentCount) {
                segs = lines.map(line => ({ utf8: line }));
                console.log(`[LLMTranslation] ✓ Perfect match for event ${index}`);
            } else if (lines.length > originalSegmentCount) {
                // More lines than expected - merge extra lines into last segment
                const firstSegs = lines.slice(0, originalSegmentCount - 1).map(line => ({ utf8: line }));
                const lastSeg = { utf8: lines.slice(originalSegmentCount - 1).join(' ') };
                segs = [...firstSegs, lastSeg];
                console.warn(`[LLMTranslation] ⚠ Event ${index}: Too many lines, merged extras`);
            } else {
                // Fewer lines than expected - split the text evenly
                const words = translatedText.replace(/\|\|\|/g, ' ').split(' ').filter(w => w.length > 0);
                const wordsPerSeg = Math.ceil(words.length / originalSegmentCount);
                segs = [];
                for (let i = 0; i < originalSegmentCount; i++) {
                    const segWords = words.slice(i * wordsPerSeg, (i + 1) * wordsPerSeg);
                    segs.push({ utf8: segWords.join(' ') });
                }
                console.warn(`[LLMTranslation] ⚠ Event ${index}: Too few lines, split evenly`);
            }

            return {
                ...event,
                segs: segs
            };
        });

        console.info('[LLMTranslation] ✓ Translation complete');
        return translatedEvents;
    }

    /**
     * Get full context summary to help LLM understand the video content
     */
    getFullContext(texts) {
        // Take first 20 and last 10 captions as context
        const contextStart = texts.slice(0, Math.min(20, texts.length));
        const contextEnd = texts.length > 20 ? texts.slice(-10) : [];

        return {
            start: contextStart.join(' '),
            end: contextEnd.join(' '),
            totalLength: texts.length
        };
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
        const contextInfo = fullContext ? `
FULL VIDEO CONTEXT (to help you understand the content type):
Beginning: "${fullContext.start.substring(0, 300)}..."
${fullContext.end ? `End: "...${fullContext.end.substring(0, 200)}"` : ''}
Total video has ${fullContext.totalLength} subtitle segments.

` : '';

        // Special instructions for German translations of Arabic content
        const germanArabicInstructions = targetLanguage.toLowerCase().includes('german') || targetLanguage.toLowerCase().includes('deutsch') ? `

SPECIAL INSTRUCTIONS FOR ARABIC → GERMAN TRANSLATION:
- When translating Quranic verses, use the style and terminology of Frank Bubenheim's Quran translation
- For general Arabic religious content, follow the linguistic style and word choices of Frank Bubenheim's Quran translation
- Maintain theological precision and reverence as exemplified in Frank Bubenheim's work
- Use appropriate Islamic terminology in German as used by Frank Bubenheim (e.g., "die Rechtleitung", "die Barmherzigkeit Allahs")
- Preserve the formal and respectful tone characteristic of Bubenheim's translation style
- For Quranic references, orient yourself by the vocabulary and phrasing used in the Frank Bubenheim translation

EXAMPLES of Bubenheim-style translation:
- Arabic religious concepts → Use established German Islamic terminology from Bubenheim
- Quranic verses → Match the style of Frank Bubenheim's Quran translation
- Maintain the reverent and precise linguistic approach of Bubenheim's work
` : '';

        return `You are a professional subtitle translator. Translate the following video subtitles to ${targetLanguage}.

${contextInfo}${germanArabicInstructions}
CRITICAL TRANSLATION RULES:
1. Preserve the EXACT meaning and context
2. Keep the SAME number of lines (MUST output exactly ${texts.length} lines)
3. **EXTREMELY IMPORTANT**: Some subtitle entries contain multiple lines separated by "|||" (three pipe characters)
4. You MUST preserve these ||| separators EXACTLY in your translation
5. Translate each part separated by ||| but keep the ||| separator between them
6. Output ONLY the translations, one entry per line
7. NO explanations, NO numbering, NO extra text
8. Maintain natural timing for speech

EXAMPLES of handling ||| separators:
Input:  "كيف يكون الرجل مباركا؟ يقول|||الله عز وجل في نبيه"
Output: "Wie ist ein Mann gesegnet? Sagt|||Allah über seinen Propheten"
(Notice the ||| is PRESERVED in the translation!)

CULTURAL & RELIGIOUS ACCURACY:
9. DO NOT translate religious terms: "Allah" stays "Allah" (not "God" or "Gott")
10. Preserve proper nouns: names, places, brands, products
11. Keep religious expressions: "Inshallah", "Mashallah", "Alhamdulillah", "Subhanallah", etc.
12. Preserve cultural references and idioms when they don't have direct equivalents
13. Keep technical terms, acronyms, and specialized vocabulary accurate
14. For religious texts: maintain reverence and theological accuracy

EXAMPLES of what to PRESERVE:
- "Allah" → "Allah" (NOT "God"/"Gott"/"Dios")
- "Quran" → "Quran" (NOT "Koran")
- "Prophet Muhammad" → "Prophet Muhammad" (maintain proper noun)
- "Salah" → "Salah" (Islamic prayer term, not "prayer"/"Gebet")
- "Hadith" → "Hadith" (preserve technical term)

Subtitles to translate:
${texts.map((text, i) => `${i + 1}. ${text}`).join('\n')}

Translated subtitles (output exactly ${texts.length} lines, one per line, KEEPING all ||| separators):`;
    }

    async translateWithOpenAI(prompt, expectedCount) {
        console.info('[LLMTranslation] Using OpenAI API');

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: this.model,
                messages: [
                    { role: 'system', content: 'You are a professional subtitle translator. Always output exactly the requested number of lines. PRESERVE all ||| separators exactly as they appear in the input.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 4000
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        const translatedText = data.choices[0].message.content;

        return this.parseTranslationResponse(translatedText, expectedCount);
    }

    async translateWithGemini(prompt, expectedCount) {
        console.info('[LLMTranslation] Using Gemini API');

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
            throw new Error(`Gemini API error: ${response.status} - ${error}`);
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

        let translatedText = data.candidates[0].content.parts[0].text;

        console.log('[LLMTranslation] Raw Gemini text (first 500 chars):', translatedText.substring(0, 500));

        // Parse the response - Gemini returns numbered lines like "1. text\n2. text\n3. text"
        // First, split by newlines to get individual lines
        let lines = translatedText
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        console.log(`[LLMTranslation] Found ${lines.length} non-empty lines`);

        // Now process each line - remove numbering and handle ||| separators
        const segments = lines
            .map(line => {
                // Remove leading numbering like "1. ", "2. ", etc.
                let cleaned = line.replace(/^\d+\.\s*/, '');
                // Keep ||| as is - it will be handled by the caller
                return cleaned;
            })
            .filter(seg => seg.length > 0);

        console.log(`[LLMTranslation] Processed ${segments.length} segments`);

        if (segments.length !== expectedCount) {
            console.warn(`[LLMTranslation] Expected ${expectedCount} segments, got ${segments.length}`);

            // If we got significantly fewer segments, the response might be in a single block
            // Try to split by numbered patterns
            if (segments.length === 1 && expectedCount > 1) {
                console.warn('[LLMTranslation] Attempting to split single-block response by numbered patterns');
                const numberedPattern = /(\d+)\.\s+/g;
                const parts = segments[0].split(numberedPattern).filter(part => !part.match(/^\d+$/));
                if (parts.length >= expectedCount / 2) {
                    console.log(`[LLMTranslation] Successfully split into ${parts.length} parts`);
                    return parts.slice(0, expectedCount);
                }
            }
        }

        return segments;
    }

    async translateWithClaude(prompt, expectedCount) {
        console.info('[LLMTranslation] Using Claude API');

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
            throw new Error(`Claude API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        const translatedText = data.content[0].text;

        return this.parseTranslationResponse(translatedText, expectedCount);
    }

    async translateWithOpenRouter(prompt, expectedCount) {
        console.info('[LLMTranslation] Using OpenRouter API');

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
                    { role: 'system', content: 'You are a professional subtitle translator. Always output exactly the requested number of lines. PRESERVE all ||| separators exactly as they appear in the input.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 4000
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        const translatedText = data.choices[0].message.content;

        return this.parseTranslationResponse(translatedText, expectedCount);
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
