/**
 * Groq Rate Limit Tracker
 *
 * Hybrid approach for tracking API quota:
 * 1. Local tracking (always works, instant)
 * 2. 429 Error parsing (exact data from Groq)
 * 3. Hourly reset (automatic)
 *
 * Features:
 * - Multi-key support
 * - Auto-rotation on rate limit
 * - Smart key selection
 * - Predictive warnings
 */

class GroqKeyTracker {
    constructor(apiKey, index = 0) {
        this.apiKey = apiKey;
        this.index = index;
        this.limit = 7200; // Groq limit: 7200 seconds per hour
        this.used = 0;
        this.remaining = 7200;
        this.lastReset = Date.now();
        this.limitedUntil = null; // Timestamp when rate limit expires
        this.isAvailable = true;

        // Local tracking for estimation
        this.localUsed = 0;

        console.log(`[KeyTracker] Initialized Key ${index + 1}: 7200s available`);
    }

    /**
     * Check if this key can handle a video of given duration
     */
    canHandle(audioDurationSeconds) {
        // Check if key is rate-limited
        if (this.limitedUntil && Date.now() < this.limitedUntil) {
            return false;
        }

        // Check if enough quota remaining
        return this.remaining >= audioDurationSeconds;
    }

    /**
     * Get remaining quota in seconds
     */
    getRemaining() {
        // If rate limited, return 0
        if (this.limitedUntil && Date.now() < this.limitedUntil) {
            return 0;
        }

        return this.remaining;
    }

    /**
     * Get time until rate limit expires (in seconds)
     */
    getTimeUntilReset() {
        if (!this.limitedUntil) {
            return 0;
        }

        const remaining = Math.max(0, this.limitedUntil - Date.now());
        return Math.ceil(remaining / 1000);
    }

    /**
     * Track usage after successful request
     */
    trackUsage(audioDurationSeconds) {
        this.localUsed += audioDurationSeconds;
        this.remaining = Math.max(0, this.limit - this.localUsed);

        console.log(`[KeyTracker] Key ${this.index + 1}: Used ${audioDurationSeconds}s, Remaining: ${this.remaining}s`);
    }

    /**
     * Update from 429 error response (exact data)
     */
    updateFrom429Error(errorMessage) {
        // Parse: "Limit 7200, Used 5588, Requested 1784"
        const limitMatch = errorMessage.match(/Limit\s+(\d+)/);
        const usedMatch = errorMessage.match(/Used\s+(\d+)/);
        const requestedMatch = errorMessage.match(/Requested\s+(\d+)/);

        if (limitMatch && usedMatch) {
            this.limit = parseInt(limitMatch[1]);
            this.used = parseInt(usedMatch[1]);
            this.remaining = this.limit - this.used;

            // Sync local tracking with real data
            this.localUsed = this.used;

            console.log(`[KeyTracker] Key ${this.index + 1}: 429 error - Exact usage: ${this.used}/${this.limit}s`);
        }

        // Parse: "try again in 1m26s"
        const retryMatch = errorMessage.match(/try again in (?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?/i);
        if (retryMatch) {
            const hours = parseInt(retryMatch[1] || 0);
            const minutes = parseInt(retryMatch[2] || 0);
            const seconds = parseInt(retryMatch[3] || 0);

            const retryAfterSeconds = (hours * 3600) + (minutes * 60) + seconds;
            this.limitedUntil = Date.now() + (retryAfterSeconds * 1000);
            this.isAvailable = false;

            console.log(`[KeyTracker] Key ${this.index + 1}: Rate limited for ${retryAfterSeconds}s`);
        } else {
            // Default: assume 90 seconds
            this.limitedUntil = Date.now() + 90000;
            this.isAvailable = false;
            console.log(`[KeyTracker] Key ${this.index + 1}: Rate limited (default 90s)`);
        }
    }

    /**
     * Check for hourly reset
     */
    checkHourlyReset() {
        const hourPassed = Date.now() - this.lastReset > 3600000; // 1 hour = 3600000ms

        if (hourPassed) {
            console.log(`[KeyTracker] Key ${this.index + 1}: Hourly reset - resetting to 7200s`);
            this.used = 0;
            this.localUsed = 0;
            this.remaining = this.limit;
            this.lastReset = Date.now();
            this.limitedUntil = null;
            this.isAvailable = true;
        }

        // Also check if rate limit expired
        if (this.limitedUntil && Date.now() >= this.limitedUntil) {
            console.log(`[KeyTracker] Key ${this.index + 1}: Rate limit expired - available again`);
            this.limitedUntil = null;
            this.isAvailable = true;
        }
    }

    /**
     * Get status summary
     */
    getStatus() {
        this.checkHourlyReset();

        return {
            index: this.index,
            remaining: this.getRemaining(),
            used: this.localUsed,
            limit: this.limit,
            percentUsed: Math.round((this.localUsed / this.limit) * 100),
            isAvailable: this.isAvailable && this.getRemaining() > 0,
            limitedUntil: this.limitedUntil,
            timeUntilReset: this.getTimeUntilReset()
        };
    }
}


/**
 * Groq Key Pool Manager
 * Manages multiple API keys with smart rotation
 */
class GroqKeyPool {
    constructor(apiKeys = []) {
        this.keys = apiKeys.map((key, index) => new GroqKeyTracker(key, index));
        this.currentIndex = 0;

        console.log(`[KeyPool] Initialized with ${this.keys.length} key(s)`);
    }

    /**
     * Get optimal key for a video of given duration
     * Smart selection: prefer key with most remaining quota
     */
    getOptimalKey(audioDurationSeconds) {
        // Check all keys for hourly reset
        this.keys.forEach(key => key.checkHourlyReset());

        // Filter available keys that can handle this duration
        const availableKeys = this.keys
            .filter(key => key.canHandle(audioDurationSeconds))
            .sort((a, b) => b.getRemaining() - a.getRemaining()); // Sort by remaining quota (descending)

        if (availableKeys.length === 0) {
            console.log(`[KeyPool] ❌ No key available for ${audioDurationSeconds}s audio`);
            return null;
        }

        const selectedKey = availableKeys[0];
        console.log(`[KeyPool] ✓ Selected Key ${selectedKey.index + 1} (${selectedKey.getRemaining()}s remaining) for ${audioDurationSeconds}s audio`);

        return selectedKey;
    }

    /**
     * Get next available key (any key with quota)
     */
    getNextAvailable() {
        this.keys.forEach(key => key.checkHourlyReset());

        const availableKeys = this.keys.filter(key => key.isAvailable && key.getRemaining() > 0);

        if (availableKeys.length === 0) {
            return null;
        }

        // Return key with most remaining quota
        return availableKeys.sort((a, b) => b.getRemaining() - a.getRemaining())[0];
    }

    /**
     * Handle 429 error - update key and try to get alternative
     */
    handle429Error(keyTracker, errorMessage) {
        console.log(`[KeyPool] 🚫 Rate limit hit on Key ${keyTracker.index + 1}`);

        // Update the key with exact error data
        keyTracker.updateFrom429Error(errorMessage);

        // Try to find alternative key
        const nextKey = this.getNextAvailable();

        if (nextKey) {
            console.log(`[KeyPool] 🔄 Auto-switching to Key ${nextKey.index + 1}`);
        } else {
            const minWaitTime = Math.min(...this.keys.map(k => k.getTimeUntilReset()).filter(t => t > 0));
            console.log(`[KeyPool] ⏸️ All keys limited - wait ${minWaitTime}s for next available key`);
        }

        return nextKey;
    }

    /**
     * Get time until next key becomes available
     */
    getMinWaitTime() {
        const waitTimes = this.keys
            .map(k => k.getTimeUntilReset())
            .filter(t => t > 0);

        if (waitTimes.length === 0) {
            return 0;
        }

        return Math.min(...waitTimes);
    }

    /**
     * Get total capacity across all keys
     */
    getTotalCapacity() {
        return this.keys.reduce((sum, key) => sum + key.getRemaining(), 0);
    }

    /**
     * Get pool status summary
     */
    getPoolStatus() {
        this.keys.forEach(key => key.checkHourlyReset());

        return {
            keys: this.keys.map(key => key.getStatus()),
            totalCapacity: this.getTotalCapacity(),
            availableKeys: this.keys.filter(k => k.isAvailable && k.getRemaining() > 0).length,
            totalKeys: this.keys.length,
            minWaitTime: this.getMinWaitTime()
        };
    }
}


// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.GroqKeyTracker = GroqKeyTracker;
    window.GroqKeyPool = GroqKeyPool;
}
