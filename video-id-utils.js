/**
 * Video ID Utilities
 * Centralized video ID extraction logic to ensure consistency across all files
 */

/**
 * Extract video ID from a URL
 * @param {string} url - Full video URL or pathname
 * @returns {string|null} - Extracted video ID or null if not found
 */
function extractVideoId(url) {
    try {
        const urlObject = new URL(url);
        const pathname = urlObject.pathname;
        const hostname = urlObject.hostname;

        // YouTube
        if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
            if (pathname.startsWith('/clip')) {
                return null; // Clips not supported
            } else if (pathname.startsWith('/shorts')) {
                return pathname.slice(8);
            }
            return urlObject.searchParams.get('v') || pathname.slice(1); // youtu.be/ID
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

        // Instagram - SUPPORTS BOTH /reel/ AND /reels/
        if (hostname.includes('instagram.com')) {
            const match = pathname.match(/\/(?:p|reels?|tv)\/([a-zA-Z0-9_-]+)/);
            return match ? match[1] : null;
        }

        // Facebook
        if (hostname.includes('facebook.com') || hostname.includes('fb.watch')) {
            const match = pathname.match(/\/([0-9]+)\/?$/);
            if (match) return match[1];

            // Fallback: generate hash from URL
            return generateHashFromUrl(url);
        }

        // Unknown platform - return null
        return null;
    } catch (error) {
        console.error('[VideoIDUtils] Error extracting video ID:', error);
        return null;
    }
}

/**
 * Generate a hash-based video ID from a URL (fallback)
 * @param {string} url - Full URL
 * @returns {string} - Hash-based ID
 */
function generateHashFromUrl(url) {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
        hash = ((hash << 5) - hash) + url.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}

/**
 * Get platform name from URL
 * @param {string} url - Full video URL
 * @returns {string} - Platform name
 */
function getPlatformFromUrl(url) {
    try {
        const hostname = new URL(url).hostname;

        if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) return 'YouTube';
        if (hostname.includes('vimeo.com')) return 'Vimeo';
        if (hostname.includes('dailymotion.com')) return 'Dailymotion';
        if (hostname.includes('twitter.com') || hostname.includes('x.com')) return 'Twitter';
        if (hostname.includes('tiktok.com')) return 'TikTok';
        if (hostname.includes('instagram.com')) return 'Instagram';
        if (hostname.includes('facebook.com') || hostname.includes('fb.watch')) return 'Facebook';

        // Default: capitalize first part of domain
        return hostname.replace(/^www\./, '').split('.')[0].charAt(0).toUpperCase() +
               hostname.replace(/^www\./, '').split('.')[0].slice(1);
    } catch (error) {
        return 'Unknown';
    }
}

// Export for use in other files
if (typeof window !== 'undefined') {
    window.VideoIDUtils = {
        extractVideoId,
        generateHashFromUrl,
        getPlatformFromUrl
    };
}

// Also support module exports if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        extractVideoId,
        generateHashFromUrl,
        getPlatformFromUrl
    };
}
