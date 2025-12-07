/**
 * AI Summary Generator
 * Creates intelligent video summaries with chapter markers
 */

class AISummary {
    constructor(provider, apiKey, model) {
        this.provider = provider;
        this.apiKey = apiKey;
        this.model = model;
    }

    /**
     * Generate summary with chapters from transcript
     * @param {Array} captionEvents - Caption events array
     * @param {string} videoTitle - Video title
     * @param {string} targetLanguage - Target language for summary (optional)
     * @returns {Promise<object>} Summary with chapters
     */
    async generateSummary(captionEvents, videoTitle, targetLanguage = 'English') {
        console.info('[AISummary] Generating summary for:', videoTitle);
        console.info('[AISummary] Target language:', targetLanguage);

        // Extract full transcript text
        const transcript = captionEvents.map(event =>
            event.segs.map(seg => seg.utf8).join(' ')
        ).join(' ');

        console.info(`[AISummary] Transcript length: ${transcript.length} characters`);

        const prompt = this.buildSummaryPrompt(transcript, videoTitle, captionEvents, targetLanguage);

        try {
            const result = await this.callLLM(prompt);
            const summary = this.parseSummaryResponse(result, captionEvents);

            console.info('[AISummary] ✓ Summary generated successfully');
            return summary;
        } catch (error) {
            console.error('[AISummary] Error generating summary:', error);
            throw error;
        }
    }

    buildSummaryPrompt(transcript, videoTitle, captionEvents, targetLanguage = 'English') {
        const videoDuration = captionEvents.length > 0
            ? Math.round((captionEvents[captionEvents.length - 1].tStartMs + captionEvents[captionEvents.length - 1].dDurationMs) / 1000)
            : 0;

        const minutes = Math.floor(videoDuration / 60);
        const seconds = videoDuration % 60;

        return `You are an expert video content analyst. Create a comprehensive summary and chapter breakdown for this YouTube video.

IMPORTANT: Generate the ENTIRE summary, including all text content (overallSummary, keyPoints, chapter titles and descriptions, tags) in ${targetLanguage} language.

VIDEO INFORMATION:
Title: "${videoTitle}"
Duration: ${minutes}:${String(seconds).padStart(2, '0')}
Total Segments: ${captionEvents.length}

FULL TRANSCRIPT:
${transcript}

TASK:
Generate a structured analysis in the following EXACT JSON format:

{
  "overallSummary": "A comprehensive 2-3 paragraph summary of the entire video IN ${targetLanguage}",
  "keyPoints": [
    "First key point or insight IN ${targetLanguage}",
    "Second key point or insight IN ${targetLanguage}",
    "Third key point or insight IN ${targetLanguage}"
  ],
  "chapters": [
    {
      "title": "Chapter title IN ${targetLanguage} (max 60 chars)",
      "timestamp": "MM:SS",
      "segmentIndex": 0,
      "description": "Brief description of what happens in this chapter IN ${targetLanguage}"
    }
  ],
  "tags": ["tag1 IN ${targetLanguage}", "tag2 IN ${targetLanguage}", "tag3 IN ${targetLanguage}"]
}

REQUIREMENTS:
1. Overall summary should capture the main theme and content
2. Extract 3-5 key points or insights
3. Create 4-8 logical chapters based on topic changes
4. Each chapter MUST have a timestamp in MM:SS format
5. Chapter timestamps should be evenly distributed throughout the video
6. Segment indices should correspond to caption segments
7. Tags should categorize the content (max 5 tags)
8. ALL TEXT CONTENT MUST BE IN ${targetLanguage} LANGUAGE

OUTPUT ONLY THE JSON, NO ADDITIONAL TEXT.`;
    }

    async callLLM(prompt) {
        switch (this.provider) {
            case 'openai':
                return await this.callOpenAI(prompt);
            case 'gemini':
                return await this.callGemini(prompt);
            case 'claude':
                return await this.callClaude(prompt);
            case 'openrouter':
                return await this.callOpenRouter(prompt);
            default:
                throw new Error(`Unknown provider: ${this.provider}`);
        }
    }

    async callOpenAI(prompt) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: this.model,
                messages: [
                    { role: 'system', content: 'You are an expert video content analyst. Always output valid JSON.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 16000
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    async callGemini(prompt) {
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
                    maxOutputTokens: 65536
                }
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Gemini API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        console.log('[AISummary] Gemini response:', data);

        // Check if response has expected structure
        if (!data.candidates || !data.candidates[0]) {
            console.error('[AISummary] Unexpected Gemini response structure:', data);
            throw new Error('Gemini API returned unexpected response structure');
        }

        const candidate = data.candidates[0];
        console.log('[AISummary] Candidate structure:', candidate);
        console.log('[AISummary] Finish reason:', candidate.finishReason);

        if (!candidate.content) {
            console.error('[AISummary] Missing content in candidate:', candidate);
            throw new Error('Gemini API response missing content');
        }

        console.log('[AISummary] Content structure:', candidate.content);

        if (!candidate.content.parts || !candidate.content.parts[0]) {
            console.error('[AISummary] Missing parts in content:', candidate.content);
            throw new Error('Gemini API response missing content parts');
        }

        console.log('[AISummary] Text length:', candidate.content.parts[0].text.length);

        return candidate.content.parts[0].text;
    }

    async callClaude(prompt) {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: this.model,
                max_tokens: 8192,
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
        return data.content[0].text;
    }

    async callOpenRouter(prompt) {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
                'HTTP-Referer': 'https://github.com/yourusername/buttercup',
                'X-Title': 'Buttercup AI Summary'
            },
            body: JSON.stringify({
                model: this.model,
                messages: [
                    { role: 'system', content: 'You are an expert video content analyst. Always output valid JSON.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 16000
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    parseSummaryResponse(response, captionEvents) {
        try {
            // Extract JSON from response (LLM might wrap it in markdown code blocks)
            let jsonText = response.trim();

            // Remove markdown code blocks if present
            if (jsonText.startsWith('```')) {
                jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            }

            const parsed = JSON.parse(jsonText);

            // Validate and enhance chapters with actual segment indices
            if (parsed.chapters) {
                parsed.chapters = parsed.chapters.map(chapter => {
                    // Convert timestamp to segment index if not provided
                    if (!chapter.segmentIndex && chapter.timestamp) {
                        chapter.segmentIndex = this.timestampToSegmentIndex(chapter.timestamp, captionEvents);
                    }

                    return chapter;
                });
            }

            return parsed;
        } catch (error) {
            console.error('[AISummary] Error parsing response:', error);
            console.error('[AISummary] Raw response:', response);

            // Return a basic summary if parsing fails
            return {
                overallSummary: response.substring(0, 500),
                keyPoints: [],
                chapters: [],
                tags: [],
                parseError: true
            };
        }
    }

    /**
     * Convert MM:SS timestamp to closest segment index
     */
    timestampToSegmentIndex(timestamp, captionEvents) {
        try {
            const [minutes, seconds] = timestamp.split(':').map(Number);
            const targetMs = (minutes * 60 + seconds) * 1000;

            // Find closest caption segment
            let closestIndex = 0;
            let closestDiff = Math.abs(captionEvents[0].tStartMs - targetMs);

            for (let i = 1; i < captionEvents.length; i++) {
                const diff = Math.abs(captionEvents[i].tStartMs - targetMs);
                if (diff < closestDiff) {
                    closestDiff = diff;
                    closestIndex = i;
                }
            }

            return closestIndex;
        } catch (error) {
            return 0;
        }
    }
}

// Make available globally
window.AISummary = AISummary;
