/**
 * Buttercup Rate Limiter
 *
 * Implements token bucket algorithm for smooth rate limiting across multiple APIs.
 * Prevents hitting rate limits and provides automatic queuing with visual feedback.
 *
 * Features:
 * - Per-API rate tracking
 * - Token bucket algorithm for smooth rate limiting
 * - Automatic request queuing
 * - Priority queue support
 * - Visual feedback in UI
 * - Statistics and monitoring
 */

class RateLimiter {
    constructor(api, config) {
        this.api = api; // API identifier (e.g., 'groq', 'openai', 'gemini')
        this.config = {
            requestsPerMinute: config.requestsPerMinute || 30,
            tokensPerMinute: config.tokensPerMinute || 100000,
            burstSize: config.burstSize || 10, // Allow burst of requests
            ...config
        };

        // Token buckets
        this.requestBucket = {
            tokens: this.config.burstSize,
            maxTokens: this.config.burstSize,
            refillRate: this.config.requestsPerMinute / 60, // tokens per second
            lastRefill: Date.now()
        };

        this.tokenBucket = {
            tokens: this.config.tokensPerMinute,
            maxTokens: this.config.tokensPerMinute,
            refillRate: this.config.tokensPerMinute / 60, // tokens per second
            lastRefill: Date.now()
        };

        // Request queue
        this.queue = [];
        this.activeRequests = 0;
        this.maxConcurrent = config.maxConcurrent || 3;

        // Statistics
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            rateLimitedRequests: 0,
            totalWaitTime: 0,
            totalTokensUsed: 0
        };

        // Start refill loop
        this.startRefillLoop();
    }

    /**
     * Refill token buckets based on elapsed time
     */
    refillBuckets() {
        const now = Date.now();
        const elapsed = (now - this.requestBucket.lastRefill) / 1000; // seconds

        // Refill request bucket
        const requestTokensToAdd = elapsed * this.requestBucket.refillRate;
        this.requestBucket.tokens = Math.min(
            this.requestBucket.maxTokens,
            this.requestBucket.tokens + requestTokensToAdd
        );
        this.requestBucket.lastRefill = now;

        // Refill token bucket
        const tokenTokensToAdd = elapsed * this.tokenBucket.refillRate;
        this.tokenBucket.tokens = Math.min(
            this.tokenBucket.maxTokens,
            this.tokenBucket.tokens + tokenTokensToAdd
        );
        this.tokenBucket.lastRefill = now;
    }

    /**
     * Start background refill loop
     */
    startRefillLoop() {
        this.refillInterval = setInterval(() => {
            this.refillBuckets();
            this.processQueue();
        }, 100); // Check every 100ms
    }

    /**
     * Stop refill loop (cleanup)
     */
    stop() {
        if (this.refillInterval) {
            clearInterval(this.refillInterval);
        }
    }

    /**
     * Check if we have enough tokens for a request
     */
    canMakeRequest(estimatedTokens = 0) {
        this.refillBuckets();
        return this.requestBucket.tokens >= 1 &&
               (estimatedTokens === 0 || this.tokenBucket.tokens >= estimatedTokens);
    }

    /**
     * Calculate wait time until we can make a request
     */
    calculateWaitTime(estimatedTokens = 0) {
        this.refillBuckets();

        const requestWait = this.requestBucket.tokens >= 1 ? 0 :
            ((1 - this.requestBucket.tokens) / this.requestBucket.refillRate) * 1000;

        const tokenWait = (estimatedTokens === 0 || this.tokenBucket.tokens >= estimatedTokens) ? 0 :
            ((estimatedTokens - this.tokenBucket.tokens) / this.tokenBucket.refillRate) * 1000;

        return Math.max(requestWait, tokenWait);
    }

    /**
     * Consume tokens from buckets
     */
    consumeTokens(requestTokens = 1, actualTokens = 0) {
        this.requestBucket.tokens -= requestTokens;
        if (actualTokens > 0) {
            this.tokenBucket.tokens -= actualTokens;
            this.stats.totalTokensUsed += actualTokens;
        }
    }

    /**
     * Execute a request with rate limiting
     * @param {Function} fn - The async function to execute
     * @param {Object} options - { priority: 'high'|'normal'|'low', estimatedTokens: number }
     * @returns {Promise} - Resolves when request completes
     */
    async executeRequest(fn, options = {}) {
        const {
            priority = 'normal',
            estimatedTokens = 0,
            metadata = {}
        } = options;

        return new Promise((resolve, reject) => {
            const request = {
                fn,
                estimatedTokens,
                priority: this.getPriorityValue(priority),
                metadata,
                resolve,
                reject,
                queuedAt: Date.now()
            };

            this.queue.push(request);
            this.stats.totalRequests++;

            // Sort queue by priority (higher first)
            this.queue.sort((a, b) => b.priority - a.priority);

            // Try to process immediately
            this.processQueue();
        });
    }

    /**
     * Process queued requests
     */
    async processQueue() {
        // Check if we can process more requests
        while (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
            const request = this.queue[0];

            // Check if we have enough tokens
            if (!this.canMakeRequest(request.estimatedTokens)) {
                const waitTime = this.calculateWaitTime(request.estimatedTokens);

                // Log wait if significant
                if (waitTime > 1000 && window.buttercupLogger) {
                    window.buttercupLogger.info('API',
                        `[${this.api}] Rate limit: waiting ${Math.round(waitTime)}ms`,
                        {
                            queueLength: this.queue.length,
                            activeRequests: this.activeRequests,
                            requestTokens: this.requestBucket.tokens.toFixed(2),
                            apiTokens: this.tokenBucket.tokens.toFixed(0)
                        }
                    );
                }

                // Stop processing, wait for next refill cycle
                break;
            }

            // Remove from queue
            this.queue.shift();
            this.activeRequests++;

            // Consume tokens
            this.consumeTokens(1, request.estimatedTokens);

            // Calculate wait time for stats
            const waitTime = Date.now() - request.queuedAt;
            this.stats.totalWaitTime += waitTime;

            // Execute request
            this.executeQueuedRequest(request);
        }

        // Update UI if available
        this.updateUI();
    }

    /**
     * Execute a queued request
     */
    async executeQueuedRequest(request) {
        try {
            const result = await request.fn();
            this.stats.successfulRequests++;
            request.resolve(result);
        } catch (error) {
            this.stats.failedRequests++;

            // Check if it's a rate limit error
            const errorMessage = error.message || '';
            if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
                this.stats.rateLimitedRequests++;

                // Log rate limit hit
                if (window.buttercupLogger) {
                    window.buttercupLogger.warn('API',
                        `[${this.api}] Hit rate limit despite local tracking`,
                        { error: errorMessage }
                    );
                }
            }

            request.reject(error);
        } finally {
            this.activeRequests--;
            // Continue processing queue
            this.processQueue();
        }
    }

    /**
     * Get numeric priority value
     */
    getPriorityValue(priority) {
        const priorities = {
            high: 3,
            normal: 2,
            low: 1
        };
        return priorities[priority] || priorities.normal;
    }

    /**
     * Get current statistics
     */
    getStats() {
        return {
            ...this.stats,
            queueLength: this.queue.length,
            activeRequests: this.activeRequests,
            availableRequestTokens: Math.floor(this.requestBucket.tokens),
            availableApiTokens: Math.floor(this.tokenBucket.tokens),
            averageWaitTime: this.stats.totalRequests > 0 ?
                this.stats.totalWaitTime / this.stats.totalRequests : 0
        };
    }

    /**
     * Get status for UI display
     */
    getStatus() {
        this.refillBuckets();

        const requestPercent = (this.requestBucket.tokens / this.requestBucket.maxTokens) * 100;
        const tokenPercent = (this.tokenBucket.tokens / this.tokenBucket.maxTokens) * 100;

        return {
            api: this.api,
            status: this.queue.length > 0 ? 'queued' : 'ready',
            queueLength: this.queue.length,
            activeRequests: this.activeRequests,
            requestCapacity: {
                current: Math.floor(this.requestBucket.tokens),
                max: this.requestBucket.maxTokens,
                percent: Math.floor(requestPercent)
            },
            tokenCapacity: {
                current: Math.floor(this.tokenBucket.tokens),
                max: this.tokenBucket.maxTokens,
                percent: Math.floor(tokenPercent)
            }
        };
    }

    /**
     * Update UI with current status (if UI element exists)
     */
    updateUI() {
        // Dispatch custom event with status for UI to listen
        if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('buttercupRateLimiterUpdate', {
                detail: {
                    api: this.api,
                    status: this.getStatus(),
                    stats: this.getStats()
                }
            }));
        }
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            rateLimitedRequests: 0,
            totalWaitTime: 0,
            totalTokensUsed: 0
        };
    }
}

/**
 * Global Rate Limiter Manager
 * Manages rate limiters for all APIs
 */
class RateLimiterManager {
    constructor() {
        this.limiters = new Map();

        // Default configurations for known APIs
        this.defaultConfigs = {
            groq: {
                requestsPerMinute: 30,
                tokensPerMinute: 14400, // ~7k tokens per request with buffer
                burstSize: 5,
                maxConcurrent: 2
            },
            openai: {
                requestsPerMinute: 60,
                tokensPerMinute: 90000,
                burstSize: 10,
                maxConcurrent: 3
            },
            gemini: {
                requestsPerMinute: 60,
                tokensPerMinute: 120000,
                burstSize: 10,
                maxConcurrent: 3
            },
            claude: {
                requestsPerMinute: 50,
                tokensPerMinute: 100000,
                burstSize: 5,
                maxConcurrent: 2
            },
            openrouter: {
                requestsPerMinute: 30,
                tokensPerMinute: 50000,
                burstSize: 5,
                maxConcurrent: 2
            }
        };
    }

    /**
     * Get or create rate limiter for an API
     */
    getLimiter(api, customConfig = null) {
        if (!this.limiters.has(api)) {
            const config = customConfig || this.defaultConfigs[api] || this.defaultConfigs.groq;
            this.limiters.set(api, new RateLimiter(api, config));
        }
        return this.limiters.get(api);
    }

    /**
     * Execute request through appropriate rate limiter
     */
    async execute(api, fn, options = {}) {
        const limiter = this.getLimiter(api);
        return await limiter.executeRequest(fn, options);
    }

    /**
     * Get status of all rate limiters
     */
    getAllStatus() {
        const status = {};
        for (const [api, limiter] of this.limiters.entries()) {
            status[api] = limiter.getStatus();
        }
        return status;
    }

    /**
     * Get statistics for all APIs
     */
    getAllStats() {
        const stats = {};
        for (const [api, limiter] of this.limiters.entries()) {
            stats[api] = limiter.getStats();
        }
        return stats;
    }

    /**
     * Stop all rate limiters
     */
    stopAll() {
        for (const limiter of this.limiters.values()) {
            limiter.stop();
        }
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.RateLimiter = RateLimiter;
    window.RateLimiterManager = RateLimiterManager;
    window.rateLimiterManager = new RateLimiterManager();
    console.log('[Buttercup] 🚦 Rate limiter initialized');
}
