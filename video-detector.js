/**
 * Universal Video Detector
 * Detects video elements and extracts video URLs from any website
 * Supports YouTube, Vimeo, Dailymotion, Twitter, TikTok, and 1000+ yt-dlp sites
 */

class VideoDetector {
    constructor() {
        this.currentVideoElement = null;
        this.currentVideoUrl = null;
        this.platformInfo = null;
    }

    /**
     * Detect if the current page has a video
     * @returns {Object|null} Video info or null if no video found
     */
    detectVideo() {
        // First, try platform-specific detection
        this.platformInfo = this.detectPlatform();

        if (this.platformInfo) {
            console.info('[VideoDetector] Platform detected:', this.platformInfo.name);
            this.currentVideoUrl = this.platformInfo.videoUrl;
            this.currentVideoElement = this.findVideoElement();

            return {
                platform: this.platformInfo.name,
                videoUrl: this.currentVideoUrl,
                videoId: this.platformInfo.videoId,
                videoElement: this.currentVideoElement,
                hasVideo: !!this.currentVideoElement
            };
        }

        // Fallback: Generic video detection
        this.currentVideoElement = this.findVideoElement();
        if (this.currentVideoElement) {
            this.currentVideoUrl = window.location.href;
            console.info('[VideoDetector] Generic video detected on:', this.currentVideoUrl);

            return {
                platform: 'generic',
                videoUrl: this.currentVideoUrl,
                videoId: this.generateVideoId(this.currentVideoUrl),
                videoElement: this.currentVideoElement,
                hasVideo: true
            };
        }

        return null;
    }

    /**
     * Detect the video platform based on URL
     * @returns {Object|null} Platform info or null
     */
    detectPlatform() {
        const url = window.location.href;
        const hostname = window.location.hostname;

        // YouTube
        if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
            const videoId = this.extractYouTubeId(url);
            if (videoId) {
                return {
                    name: 'youtube',
                    videoId: videoId,
                    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
                    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
                };
            }
        }

        // Vimeo
        if (hostname.includes('vimeo.com')) {
            const videoId = this.extractVimeoId(url);
            if (videoId) {
                return {
                    name: 'vimeo',
                    videoId: videoId,
                    videoUrl: `https://vimeo.com/${videoId}`,
                    thumbnailUrl: null // Would need API call
                };
            }
        }

        // Dailymotion
        if (hostname.includes('dailymotion.com') || hostname.includes('dai.ly')) {
            const videoId = this.extractDailymotionId(url);
            if (videoId) {
                return {
                    name: 'dailymotion',
                    videoId: videoId,
                    videoUrl: `https://www.dailymotion.com/video/${videoId}`,
                    thumbnailUrl: `https://www.dailymotion.com/thumbnail/video/${videoId}`
                };
            }
        }

        // Twitter/X
        if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
            const videoId = this.extractTwitterId(url);
            if (videoId) {
                return {
                    name: 'twitter',
                    videoId: videoId,
                    videoUrl: url,
                    thumbnailUrl: null
                };
            }
        }

        // TikTok
        if (hostname.includes('tiktok.com')) {
            const videoId = this.extractTikTokId(url);
            if (videoId) {
                return {
                    name: 'tiktok',
                    videoId: videoId,
                    videoUrl: url,
                    thumbnailUrl: null
                };
            }
        }

        // Facebook/Meta
        if (hostname.includes('facebook.com') || hostname.includes('fb.watch')) {
            return {
                name: 'facebook',
                videoId: this.generateVideoId(url),
                videoUrl: url,
                thumbnailUrl: null
            };
        }

        // Instagram
        if (hostname.includes('instagram.com')) {
            const videoId = this.extractInstagramId(url);
            if (videoId) {
                return {
                    name: 'instagram',
                    videoId: videoId,
                    videoUrl: url,
                    thumbnailUrl: null
                };
            }
        }

        // Twitch
        if (hostname.includes('twitch.tv')) {
            return {
                name: 'twitch',
                videoId: this.generateVideoId(url),
                videoUrl: url,
                thumbnailUrl: null
            };
        }

        // Reddit
        if (hostname.includes('reddit.com') || hostname.includes('redd.it')) {
            return {
                name: 'reddit',
                videoId: this.generateVideoId(url),
                videoUrl: url,
                thumbnailUrl: null
            };
        }

        // SoundCloud
        if (hostname.includes('soundcloud.com')) {
            return {
                name: 'soundcloud',
                videoId: this.generateVideoId(url),
                videoUrl: url,
                thumbnailUrl: null
            };
        }

        // Bilibili
        if (hostname.includes('bilibili.com')) {
            return {
                name: 'bilibili',
                videoId: this.generateVideoId(url),
                videoUrl: url,
                thumbnailUrl: null
            };
        }

        return null;
    }

    /**
     * Find video element on the page
     * @returns {HTMLVideoElement|null}
     */
    findVideoElement() {
        // Try platform-specific selectors first
        const platformSelectors = {
            youtube: 'video.html5-main-video, #movie_player video',
            vimeo: 'video.vp-video',
            dailymotion: 'video.dmp_Video',
            twitter: 'video[poster]',
            tiktok: 'video',
            generic: 'video'
        };

        const platform = this.platformInfo ? this.platformInfo.name : 'generic';
        const selector = platformSelectors[platform] || platformSelectors.generic;

        let video = document.querySelector(selector);

        // Fallback to any video element
        if (!video) {
            video = document.querySelector('video');
        }

        // Check iframes for embedded videos
        if (!video) {
            const iframes = document.querySelectorAll('iframe');
            for (const iframe of iframes) {
                const src = iframe.src || '';
                if (src.includes('youtube.com/embed') ||
                    src.includes('player.vimeo.com') ||
                    src.includes('dailymotion.com/embed')) {
                    console.info('[VideoDetector] Found embedded video iframe:', src);
                    // Can't access video inside iframe, but URL is available
                }
            }
        }

        return video;
    }

    /**
     * Extract YouTube video ID from URL
     * @param {string} url
     * @returns {string|null}
     */
    extractYouTubeId(url) {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]+)/,
            /youtube\.com\/.*[?&]v=([a-zA-Z0-9_-]+)/
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        return null;
    }

    /**
     * Extract Vimeo video ID from URL
     * @param {string} url
     * @returns {string|null}
     */
    extractVimeoId(url) {
        const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
        return match ? match[1] : null;
    }

    /**
     * Extract Dailymotion video ID from URL
     * @param {string} url
     * @returns {string|null}
     */
    extractDailymotionId(url) {
        const patterns = [
            /dailymotion\.com\/video\/([a-zA-Z0-9]+)/,
            /dai\.ly\/([a-zA-Z0-9]+)/
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        return null;
    }

    /**
     * Extract Twitter/X status ID from URL
     * @param {string} url
     * @returns {string|null}
     */
    extractTwitterId(url) {
        const match = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
        return match ? match[1] : null;
    }

    /**
     * Extract TikTok video ID from URL
     * @param {string} url
     * @returns {string|null}
     */
    extractTikTokId(url) {
        const match = url.match(/tiktok\.com\/@[\w.-]+\/video\/(\d+)/);
        return match ? match[1] : null;
    }

    /**
     * Extract Instagram post ID from URL
     * @param {string} url
     * @returns {string|null}
     */
    extractInstagramId(url) {
        const match = url.match(/instagram\.com\/(?:p|reels?|tv)\/([a-zA-Z0-9_-]+)/);
        return match ? match[1] : null;
    }

    /**
     * Generate a unique ID from URL (for platforms without clear video IDs)
     * @param {string} url
     * @returns {string}
     */
    generateVideoId(url) {
        // Create a hash from the URL
        let hash = 0;
        for (let i = 0; i < url.length; i++) {
            const char = url.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Check if current page is a video page
     * @returns {boolean}
     */
    isVideoPage() {
        const info = this.detectVideo();
        return info !== null && info.hasVideo;
    }

    /**
     * Get current video URL for yt-dlp
     * @returns {string|null}
     */
    getVideoUrlForDownload() {
        if (!this.currentVideoUrl) {
            this.detectVideo();
        }
        return this.currentVideoUrl;
    }

    /**
     * Get video title from page
     * @returns {string}
     */
    getVideoTitle() {
        // Try platform-specific title extraction
        if (this.platformInfo) {
            switch (this.platformInfo.name) {
                case 'youtube':
                    return this.getYouTubeTitle();
                case 'vimeo':
                    return this.getVimeoTitle();
                case 'twitter':
                    return this.getTwitterTitle();
                default:
                    break;
            }
        }

        // Generic: use document title
        let title = document.title || 'Video';

        // Clean up common suffixes
        title = title
            .replace(/\s*[-–—|]\s*YouTube\s*$/i, '')
            .replace(/\s*[-–—|]\s*Vimeo\s*$/i, '')
            .replace(/\s*[-–—|]\s*Dailymotion\s*$/i, '')
            .replace(/\s*on\s*X:\s*$/i, '')
            .replace(/^\(\d+\)\s*/, '') // Remove notification count
            .trim();

        return title || 'Untitled Video';
    }

    /**
     * Get YouTube video title
     * @returns {string}
     */
    getYouTubeTitle() {
        // Try multiple methods
        if (window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.videoDetails) {
            return window.ytInitialPlayerResponse.videoDetails.title;
        }

        const titleElement = document.querySelector(
            'h1.ytd-watch-metadata yt-formatted-string, ' +
            'h1.ytd-video-primary-info-renderer yt-formatted-string, ' +
            '#title h1 yt-formatted-string'
        );

        if (titleElement) {
            return titleElement.textContent.trim();
        }

        return document.title.replace(/\s*[-–—]\s*YouTube\s*$/i, '').trim();
    }

    /**
     * Get Vimeo video title
     * @returns {string}
     */
    getVimeoTitle() {
        const titleElement = document.querySelector('h1.clip_info-header');
        if (titleElement) {
            return titleElement.textContent.trim();
        }
        return document.title.replace(/\s*[-–—|]\s*Vimeo\s*$/i, '').trim();
    }

    /**
     * Get Twitter video title (tweet text)
     * @returns {string}
     */
    getTwitterTitle() {
        const tweetText = document.querySelector('[data-testid="tweetText"]');
        if (tweetText) {
            return tweetText.textContent.trim().substring(0, 100);
        }
        return document.title;
    }
}

// Make available globally
window.VideoDetector = VideoDetector;
window.videoDetector = new VideoDetector();
