/**
 * Custom Caption Overlay - zeigt Captions direkt über dem Video an
 * Umgeht YouTube's komplexes Caption-System komplett
 */

class CustomCaptionOverlay {
    constructor(captionData, startVisible = true, videoId = null) {
        this.captions = captionData.events || [];
        this.video = null;
        this.overlay = null;
        this.captionElement = null;
        this.currentCaptionIndex = -1; // Track current caption for efficiency
        this.isVisible = startVisible;
        this.updateInterval = null;
        this.rafId = null;
        this.lastUpdateTime = 0;
        this.isTracking = false;
        this.videoObserver = null;
        this.urlObserver = null;

        // Store the video ID this overlay belongs to
        this.videoId = videoId || this.extractVideoIdFromURL();
        this.currentUrl = window.location.href;

        // Default customization settings
        this.settings = {
            fontSize: 22,
            verticalPosition: 15, // 15% from bottom
            horizontalPosition: 'center',
            fontColor: '#ffffff',
            backgroundColor: '#080808',
            backgroundOpacity: 0.90,
            containerWidth: 80, // 80% max width
            fontFamily: '"YouTube Noto", Roboto, "Arial Unicode Ms", Arial, Helvetica, Verdana, sans-serif'
        };

        // Pre-sort captions by start time for binary search
        this.captions.sort((a, b) => a.tStartMs - b.tStartMs);

        console.info('[CaptionOverlay] Initializing with', this.captions.length, 'caption events for video:', this.videoId);

        // CRITICAL: Setup settings listener IMMEDIATELY so live updates work
        // This must happen before waiting for video, otherwise updates are missed
        this.setupSettingsListener();

        this.init();
    }

    init() {
        this.loadSettings().then(() => {
            this.waitForVideo().then(() => {
                console.info('[CaptionOverlay] Video found, creating overlay');
                this.createOverlay();
                this.startTracking();
                this.setupToggleListener();
                this.setupVideoObserver();
                this.setupURLObserver();
            });
        });
    }

    /**
     * Extract video ID from current URL
     */
    extractVideoIdFromURL() {
        const url = window.location.href;

        // YouTube Shorts: /shorts/VIDEO_ID
        const shortsMatch = url.match(/\/shorts\/([^/?]+)/);
        if (shortsMatch) {
            return shortsMatch[1];
        }

        // Regular YouTube: ?v=VIDEO_ID
        const regularMatch = url.match(/[?&]v=([^&]+)/);
        if (regularMatch) {
            return regularMatch[1];
        }

        // Embed: /embed/VIDEO_ID
        const embedMatch = url.match(/\/embed\/([^/?]+)/);
        if (embedMatch) {
            return embedMatch[1];
        }

        return null;
    }

    /**
     * Setup URL observer to detect navigation - GLOBAL for all platforms (YouTube, TikTok, etc.)
     */
    setupURLObserver() {
        // Store reference to current video element
        this.trackedVideo = this.video;
        this.lastNavigationTime = Date.now();

        // Check URL AND video element every 500ms for changes
        // This works globally for all SPAs (YouTube, TikTok, Instagram, etc.)
        this.urlCheckInterval = setInterval(() => {
            const newUrl = window.location.href;
            const currentVideo = document.querySelector('video.html5-main-video, video');

            // Check if URL changed
            const urlChanged = newUrl !== this.currentUrl;

            // Check if video element changed (new video element loaded)
            // Use strict equality to avoid false positives
            const videoChanged = currentVideo &&
                                 this.trackedVideo &&
                                 currentVideo !== this.trackedVideo;

            // Debounce: Only trigger once per second to avoid rapid firing
            const timeSinceLastNav = Date.now() - this.lastNavigationTime;
            const canTrigger = timeSinceLastNav > 1000;

            if ((urlChanged || videoChanged) && canTrigger) {
                console.info('[CaptionOverlay] Navigation detected!');
                if (urlChanged) {
                    console.info('[CaptionOverlay] URL changed:', this.currentUrl, '->', newUrl);
                }
                if (videoChanged) {
                    console.info('[CaptionOverlay] Video element changed - new video loaded');
                }

                // Hide captions - they belong to the previous video
                console.warn('[CaptionOverlay] Hiding captions from previous video');
                this.hideCaption();
                this.isVisible = false;

                // Update tracked values
                this.currentUrl = newUrl;
                this.lastNavigationTime = Date.now();

                if (videoChanged && currentVideo) {
                    this.trackedVideo = currentVideo;
                    // Re-attach to new video element
                    this.reattachToVideo(currentVideo);
                }
            } else if (urlChanged || videoChanged) {
                // Silent update without hiding captions (too soon after last navigation)
                this.currentUrl = newUrl;
                if (videoChanged && currentVideo) {
                    this.trackedVideo = currentVideo;
                }
            }
        }, 500);

        console.info('[CaptionOverlay] ✓ GLOBAL URL & video observer active (all platforms)');
    }

    /**
     * Load caption overlay settings from Chrome storage
     */
    async loadSettings() {
        return new Promise((resolve) => {
            // Request settings from content script
            document.addEventListener('responseButtercupCaptionSettings', (e) => {
                if (e.detail) {
                    this.settings = {
                        fontSize: e.detail.fontSize || 22,
                        verticalPosition: e.detail.verticalPosition !== undefined ? e.detail.verticalPosition : 15,
                        horizontalPosition: e.detail.horizontalPosition || 'center',
                        fontColor: e.detail.fontColor || '#ffffff',
                        backgroundColor: e.detail.backgroundColor || '#080808',
                        backgroundOpacity: e.detail.backgroundOpacity !== undefined ? e.detail.backgroundOpacity : 0.90,
                        containerWidth: e.detail.containerWidth !== undefined ? e.detail.containerWidth : 80,
                        fontFamily: e.detail.fontFamily || '"YouTube Noto", Roboto, "Arial Unicode Ms", Arial, Helvetica, Verdana, sans-serif'
                    };
                    console.info('[CaptionOverlay] Settings loaded:', this.settings);
                }
                resolve();
            }, { once: true });

            // Request settings
            document.dispatchEvent(new CustomEvent('requestButtercupCaptionSettings'));

            // Fallback timeout
            setTimeout(resolve, 1000);
        });
    }

    /**
     * Listen for settings changes and update overlay
     */
    setupSettingsListener() {
        document.addEventListener('buttercupCaptionSettingsChanged', (e) => {
            if (e.detail) {
                this.settings = { ...this.settings, ...e.detail };
                console.info('[CaptionOverlay] Settings updated:', this.settings);
                this.applySettings();
            }
        });

        // CRITICAL: Create GLOBAL function that can be called directly from content script
        // This is the MOST RELIABLE method for cross-world communication
        window.updateButtercupCaptionSettings = (settings) => {
            console.warn('[Buttercup] ⚡ DIRECT UPDATE called with:', settings);
            this.settings = { ...this.settings, ...settings };
            this.applySettings();
        };

        console.info('[CaptionOverlay] ✓ Global update function registered: window.updateButtercupCaptionSettings');
    }

    /**
     * Apply current settings to the overlay
     * CRITICAL: This is called when settings change via Advanced menu
     */
    applySettings() {
        if (!this.overlay || !this.captionElement) {
            console.info('[CaptionOverlay] Overlay not ready yet, settings will be applied when created');
            return;
        }

        console.info('[CaptionOverlay] Applying settings LIVE:', this.settings);

        // Update overlay positioning based on new flexible settings
        this.updateOverlayPosition();

        // Update caption element styles
        this.captionElement.style.fontSize = `${this.settings.fontSize}px`;
        this.captionElement.style.color = this.settings.fontColor;
        this.captionElement.style.maxWidth = `${this.settings.containerWidth}%`;

        // Convert hex to rgba for background with opacity
        const bgColor = this.hexToRgba(this.settings.backgroundColor, this.settings.backgroundOpacity);
        this.captionElement.style.background = bgColor;
        this.captionElement.style.fontFamily = this.settings.fontFamily;

        // Force repaint by triggering a caption update
        this.forceUpdate();

        console.info('[CaptionOverlay] ✓ Settings applied LIVE to overlay');
    }

    /**
     * Convert hex color to rgba
     * @param {string} hex - Hex color (#000000)
     * @param {number} opacity - Opacity (0.0 - 1.0)
     * @returns {string} - RGBA string
     */
    hexToRgba(hex, opacity) {
        // Remove # if present
        hex = hex.replace('#', '');

        // Parse RGB
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);

        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }

    waitForVideo() {
        return new Promise((resolve) => {
            const checkVideo = setInterval(() => {
                const video = document.querySelector('video.html5-main-video, video');
                if (video) {
                    this.video = video;
                    clearInterval(checkVideo);
                    console.info('[CaptionOverlay] ✓ Video element found');

                    // CRITICAL: Ensure video remains hardware-accelerated
                    this.ensureVideoHardwareAcceleration();

                    resolve();
                }
            }, 100);
        });
    }

    /**
     * Ensure video element uses hardware acceleration
     * This prevents video freezing when overlay is active
     *
     * IMPORTANT: We DO NOT modify the video element directly anymore
     * as this can conflict with platform-specific optimizations (TikTok, etc.)
     * Instead, we rely on overlay isolation via CSS containment
     */
    ensureVideoHardwareAcceleration() {
        if (!this.video) return;

        // REMOVED: Direct video manipulation
        // This was causing conflicts on TikTok and other platforms
        // The overlay isolation (via contain and isolation) is sufficient

        console.info('[CaptionOverlay] ✓ Video element unchanged (safe for all platforms)');
    }

    createOverlay() {
        // UNIVERSAL APPROACH: Works on ANY video element on ANY platform
        // CRITICAL: Use position: fixed instead of absolute to avoid video compositing issues

        if (!this.video) {
            console.error('[CaptionOverlay] No video element available!');
            return;
        }

        // Get video position relative to VIEWPORT (not parent)
        // This is crucial for position: fixed
        const videoRect = this.video.getBoundingClientRect();
        const videoWidth = this.video.offsetWidth || videoRect.width;
        const videoHeight = this.video.offsetHeight || videoRect.height;

        console.info('[CaptionOverlay] Video dimensions (viewport-relative for fixed positioning):');
        console.info('  - Width:', videoWidth, 'px');
        console.info('  - Height:', videoHeight, 'px');
        console.info('  - Left:', videoRect.left, 'px');
        console.info('  - Top:', videoRect.top, 'px');

        // Create overlay container that matches VIDEO dimensions exactly
        this.overlay = document.createElement('div');
        this.overlay.id = 'buttercup-caption-overlay';
        this.overlay.className = 'buttercup-overlay';

        // Calculate bottom position based on vertical position setting
        // verticalPosition is percentage from bottom (0-50%)
        // CRITICAL: Calculate in PIXELS relative to VIDEO height, not viewport!
        const bottomOffsetPx = videoHeight * (this.settings.verticalPosition / 100);

        // Horizontal alignment based on setting
        let justifyContent;
        if (this.settings.horizontalPosition === 'left') {
            justifyContent = 'flex-start';
        } else if (this.settings.horizontalPosition === 'right') {
            justifyContent = 'flex-end';
        } else {
            justifyContent = 'center'; // default
        }

        // CRITICAL: Use position: fixed to completely separate overlay from video
        // This prevents overlay from interfering with video rendering pipeline
        // Z-INDEX: Low value (10) to stay UNDER video controls but OVER video
        this.overlay.style.cssText = `
            position: fixed;
            left: ${videoRect.left}px;
            bottom: calc(100vh - ${videoRect.bottom}px + ${bottomOffsetPx}px);
            width: ${videoWidth}px;
            height: auto;
            max-height: ${videoHeight}px;
            z-index: 10;
            pointer-events: none !important;
            display: flex;
            justify-content: ${justifyContent};
            align-items: flex-end;
            padding: 0;
            margin: 0;
            overflow: visible;
            box-sizing: border-box;
            transform: translateZ(0);
            will-change: transform;
            backface-visibility: hidden;
            isolation: isolate;
            contain: layout style paint;
        `;

        // Create caption element
        this.captionElement = document.createElement('div');
        this.captionElement.className = 'buttercup-caption';
        const bgColor = this.hexToRgba(this.settings.backgroundColor, this.settings.backgroundOpacity);

        // Responsive font size based on video height
        const responsiveFontSize = Math.max(12, Math.min(this.settings.fontSize, videoHeight * 0.05));

        this.captionElement.style.cssText = `
            display: none;
            background: ${bgColor};
            color: ${this.settings.fontColor};
            padding: 0.4em 0.8em;
            margin: 0 1em;
            border-radius: 0.2em;
            font-size: ${responsiveFontSize}px;
            line-height: 1.4;
            font-family: ${this.settings.fontFamily};
            text-shadow: 0 0 0.1em rgba(0,0,0,0.8), 0 0 0.2em rgba(0,0,0,0.8);
            white-space: pre-wrap;
            word-wrap: break-word;
            overflow-wrap: break-word;
            word-break: break-word;
            hyphens: auto;
            max-width: ${this.settings.containerWidth}%;
            width: auto;
            box-sizing: border-box;
            text-align: center;
            overflow: hidden;
        `;

        this.overlay.appendChild(this.captionElement);

        // CRITICAL: Append to document.body instead of video container
        // This completely separates overlay from video rendering
        document.body.appendChild(this.overlay);

        // CRITICAL: Update overlay position when video resizes or moves
        this.setupResizeObserver();

        console.info('[CaptionOverlay] ✓ Universal overlay created');
    }

    /**
     * Setup ResizeObserver to update overlay when video changes size/position
     * This ensures overlay always stays aligned with video
     */
    setupResizeObserver() {
        if (!this.video || !this.overlay) return;

        // Store last known position to detect changes
        this.lastVideoRect = null;

        // Observe video element for size/position changes
        this.resizeObserver = new ResizeObserver(() => {
            this.updateOverlayPosition();
        });

        this.resizeObserver.observe(this.video);

        // CRITICAL: Observe video container for mutations (theater mode, fullscreen, etc.)
        const videoContainer = this.video.parentElement;
        if (videoContainer) {
            this.containerObserver = new MutationObserver(() => {
                this.updateOverlayPosition();
            });
            this.containerObserver.observe(videoContainer, {
                attributes: true,
                attributeFilter: ['class', 'style']
            });
        }

        // Also observe window resize
        this.boundWindowResize = () => this.updateOverlayPosition();
        window.addEventListener('resize', this.boundWindowResize);

        // Observe scroll events
        this.boundScroll = () => this.updateOverlayPosition();
        window.addEventListener('scroll', this.boundScroll, { passive: true });

        // CRITICAL: AGGRESSIVE periodic position check (250ms = 4 times per second)
        // This is the ULTIMATE FAILSAFE that ensures subtitles NEVER drift
        // Video position can change due to:
        // - Layout changes (YouTube theater mode, sidebar collapse, etc.)
        // - Container resizing without triggering ResizeObserver
        // - Platform-specific UI changes (TikTok, YouTube, etc.)
        // - Scroll events
        // - Dynamic content loading
        this.positionCheckInterval = setInterval(() => {
            if (!this.video || !this.overlay) return;

            const currentRect = this.video.getBoundingClientRect();

            // Check if position or size changed significantly (>1px to avoid jitter)
            if (this.lastVideoRect) {
                const posChanged = Math.abs(currentRect.left - this.lastVideoRect.left) > 1 ||
                                 Math.abs(currentRect.top - this.lastVideoRect.top) > 1 ||
                                 Math.abs(currentRect.bottom - this.lastVideoRect.bottom) > 1 ||
                                 Math.abs(currentRect.width - this.lastVideoRect.width) > 1 ||
                                 Math.abs(currentRect.height - this.lastVideoRect.height) > 1;

                if (posChanged) {
                    console.info('[CaptionOverlay] Video position/size changed, updating overlay');
                    this.updateOverlayPosition();
                }
            }

            // Store current rect for next comparison
            this.lastVideoRect = {
                left: currentRect.left,
                top: currentRect.top,
                bottom: currentRect.bottom,
                width: currentRect.width,
                height: currentRect.height
            };
        }, 250); // AGGRESSIVE: Check every 250ms (4x per second) for MAXIMUM stability

        console.info('[CaptionOverlay] ✓ MAXIMUM STABILITY: ResizeObserver + MutationObserver + Scroll + 250ms position check');
    }

    /**
     * Update overlay position to match current video position
     * Called when video resizes, moves, or window resizes
     * Uses viewport-relative positioning (position: fixed)
     */
    updateOverlayPosition() {
        if (!this.video || !this.overlay) return;

        // Get video position relative to VIEWPORT (for position: fixed)
        const videoRect = this.video.getBoundingClientRect();
        const videoWidth = this.video.offsetWidth || videoRect.width;
        const videoHeight = this.video.offsetHeight || videoRect.height;

        // Calculate bottom position in PIXELS relative to VIDEO height
        const bottomOffsetPx = videoHeight * (this.settings.verticalPosition / 100);

        // Horizontal alignment based on setting
        let justifyContent;
        if (this.settings.horizontalPosition === 'left') {
            justifyContent = 'flex-start';
        } else if (this.settings.horizontalPosition === 'right') {
            justifyContent = 'flex-end';
        } else {
            justifyContent = 'center';
        }

        // Update overlay position and size (viewport-relative with flexible positioning)
        this.overlay.style.left = `${videoRect.left}px`;
        this.overlay.style.bottom = `calc(100vh - ${videoRect.bottom}px + ${bottomOffsetPx}px)`;
        this.overlay.style.width = `${videoWidth}px`;
        this.overlay.style.maxHeight = `${videoHeight}px`;
        this.overlay.style.justifyContent = justifyContent;

        // Update responsive font size
        if (this.captionElement) {
            const responsiveFontSize = Math.max(12, Math.min(this.settings.fontSize, videoHeight * 0.05));
            this.captionElement.style.fontSize = `${responsiveFontSize}px`;
        }
    }

    startTracking() {
        if (this.isTracking) return;
        this.isTracking = true;

        // CRITICAL: Bind all event handlers to ensure proper context
        this.boundUpdateCaption = () => this.updateCaption();
        this.boundForceUpdate = () => this.forceUpdate();
        this.boundHandleFullscreen = () => this.handleFullscreenChange();

        // PRIMARY: timeupdate - fires during normal playback (sufficient for most cases)
        this.video.addEventListener('timeupdate', this.boundUpdateCaption);

        // CRITICAL: seeking events - fires when user seeks (scrubbing)
        this.video.addEventListener('seeking', this.boundForceUpdate);
        this.video.addEventListener('seeked', this.boundForceUpdate);

        // IMPORTANT: play/pause events - control RAF loop
        this.video.addEventListener('play', this.boundForceUpdate);
        this.video.addEventListener('pause', this.boundForceUpdate);
        this.video.addEventListener('playing', this.boundForceUpdate);

        // Handle rate changes
        this.video.addEventListener('ratechange', this.boundForceUpdate);

        // Handle video loaded/changed
        this.video.addEventListener('loadeddata', this.boundForceUpdate);
        this.video.addEventListener('canplay', this.boundForceUpdate);

        // REMOVED: Aggressive setInterval polling (was causing performance issues)
        // Event listeners are sufficient for caption updates

        // OPTIMIZED RAF loop: Only runs when video is PLAYING (not paused)
        // Limited to 10 FPS instead of 60 FPS to reduce GPU load
        const rafLoop = () => {
            if (!this.isTracking) return;

            // Only update if video is playing AND captions are visible
            if (this.video && this.isVisible && !this.video.paused) {
                const now = performance.now();
                // Update max every 100ms (10 FPS) instead of 16ms (60 FPS)
                // This drastically reduces GPU load while still being smooth enough
                if (now - this.lastUpdateTime > 100) {
                    this.updateCaption();
                    this.lastUpdateTime = now;
                }
            }
            this.rafId = requestAnimationFrame(rafLoop);
        };
        this.rafId = requestAnimationFrame(rafLoop);

        // Fullscreen handling
        document.addEventListener('fullscreenchange', this.boundHandleFullscreen);
        document.addEventListener('webkitfullscreenchange', this.boundHandleFullscreen);

        // YouTube-specific: Handle theater mode and miniplayer changes
        const playerContainer = document.querySelector('.html5-video-player');
        if (playerContainer) {
            const resizeObserver = new ResizeObserver(() => {
                this.forceUpdate();
            });
            resizeObserver.observe(playerContainer);
        }

        console.info('[CaptionOverlay] ✓ Started OPTIMIZED tracking (10 FPS, plays only)');
    }

    /**
     * Force immediate caption update (used after seeking, etc.)
     */
    forceUpdate() {
        this.currentCaptionIndex = -1; // Reset cache to force re-evaluation
        this.updateCaption();
        console.log('[CaptionOverlay] Force update triggered');
    }

    /**
     * Setup MutationObserver to detect if video element changes
     */
    setupVideoObserver() {
        // Watch for video element being replaced (YouTube SPA navigation)
        const targetNode = document.body;

        this.videoObserver = new MutationObserver((mutations) => {
            const currentVideo = document.querySelector('video.html5-main-video, video');

            if (currentVideo && currentVideo !== this.video) {
                console.warn('[CaptionOverlay] Video element changed! Re-attaching...');
                this.reattachToVideo(currentVideo);
            }
        });

        this.videoObserver.observe(targetNode, {
            childList: true,
            subtree: true
        });

        console.info('[CaptionOverlay] ✓ Video observer active');
    }

    /**
     * Re-attach overlay to new video element
     */
    reattachToVideo(newVideo) {
        // Remove old event listeners
        if (this.video) {
            this.video.removeEventListener('timeupdate', this.boundUpdateCaption);
            this.video.removeEventListener('seeking', this.boundForceUpdate);
            this.video.removeEventListener('seeked', this.boundForceUpdate);
            this.video.removeEventListener('play', this.boundForceUpdate);
            this.video.removeEventListener('pause', this.boundForceUpdate);
            this.video.removeEventListener('playing', this.boundForceUpdate);
            this.video.removeEventListener('ratechange', this.boundForceUpdate);
            this.video.removeEventListener('loadeddata', this.boundForceUpdate);
            this.video.removeEventListener('canplay', this.boundForceUpdate);
        }

        // Set new video
        this.video = newVideo;

        // CRITICAL: Ensure new video has hardware acceleration
        this.ensureVideoHardwareAcceleration();

        // Re-attach event listeners
        this.video.addEventListener('timeupdate', this.boundUpdateCaption);
        this.video.addEventListener('seeking', this.boundForceUpdate);
        this.video.addEventListener('seeked', this.boundForceUpdate);
        this.video.addEventListener('play', this.boundForceUpdate);
        this.video.addEventListener('pause', this.boundForceUpdate);
        this.video.addEventListener('playing', this.boundForceUpdate);
        this.video.addEventListener('ratechange', this.boundForceUpdate);
        this.video.addEventListener('loadeddata', this.boundForceUpdate);
        this.video.addEventListener('canplay', this.boundForceUpdate);

        this.forceUpdate();
        console.info('[CaptionOverlay] ✓ Re-attached to new video element');
    }

    setupToggleListener() {
        const isShorts = window.location.pathname.includes('/shorts/');
        const isYouTube = window.location.hostname.includes('youtube.com');

        // CRITICAL: Set up state query listener for popup
        // This allows popup to get current caption visibility state
        document.addEventListener('buttercupCaptionStateRequest', () => {
            document.dispatchEvent(new CustomEvent('buttercupCaptionStateResponse', {
                detail: { isVisible: this.isVisible }
            }));
        });

        // CRITICAL: Set up popup toggle listener FIRST, for ALL platforms
        // This ensures popup toggle always works regardless of platform
        document.addEventListener('buttercupToggleCaptions', (e) => {
            if (e.detail && e.detail.isVisible !== undefined) {
                // Set specific visibility state from popup
                this.isVisible = e.detail.isVisible;
                if (this.isVisible) {
                    this.forceUpdate();
                } else {
                    this.hideCaption();
                }
                this.updateCustomButtonState();
                console.info('[CaptionOverlay] Popup toggle applied:', this.isVisible);
            } else {
                // Just toggle
                this.toggle();
                this.updateCustomButtonState();
            }
        });

        // Platform-specific setup
        if (isShorts) {
            // YouTube Shorts - captions visible by default
            console.info('[CaptionOverlay] Shorts mode - captions visible by default');
            this.isVisible = true;
            this.forceUpdate();
            if (isYouTube) {
                this.createCustomToggleButton();
            }
            // Note: Don't return early - continue to allow YouTube button sync
        } else if (isYouTube) {
            // Regular YouTube (not Shorts)
            this.createCustomToggleButton();
        } else {
            // Non-YouTube platforms (TikTok, Vimeo, etc.)
            console.info('[CaptionOverlay] Non-YouTube platform - captions visible by default');
            this.isVisible = true;
            this.forceUpdate();
        }

        // Try to sync with YouTube's subtitle button if it exists (YouTube only, including Shorts)
        if (isYouTube) {
            const waitForButton = setInterval(() => {
                const subtitleButton = document.querySelector('.ytp-subtitles-button');
                if (subtitleButton) {
                    clearInterval(waitForButton);

                    // IMPORTANT: Buttercup captions are ALWAYS visible by default
                    // We do NOT sync with YouTube's subtitle button state initially
                    // Users can toggle manually if they want captions off
                    this.isVisible = true;
                    this.updateCustomButtonState();
                    this.forceUpdate();

                    // Event Listener für Button-Klick
                    subtitleButton.addEventListener('click', () => {
                        // Read YouTube's button state instead of blind toggle
                        setTimeout(() => {
                            // Check if YouTube's captions are enabled (aria-pressed attribute)
                            const isYouTubeCaptionsOn = subtitleButton.getAttribute('aria-pressed') === 'true';

                            // Sync our visibility with YouTube's state
                            this.isVisible = isYouTubeCaptionsOn;
                            this.updateCustomButtonState();

                            if (!this.isVisible) {
                                this.hideCaption();
                            } else {
                                // Force immediate update when enabling captions
                                this.forceUpdate();
                            }

                            console.info('[CaptionOverlay] Synced with YouTube button state:', this.isVisible);
                        }, 50);
                    });

                    console.info('[CaptionOverlay] ✓ Toggle listener attached to YouTube subtitle button');
                }
            }, 100);

            // Timeout nach 10 Sekunden - if no button found, keep captions visible with our custom button
            setTimeout(() => {
                clearInterval(waitForButton);
                const subtitleButton = document.querySelector('.ytp-subtitles-button');
                if (!subtitleButton) {
                    console.warn('[CaptionOverlay] No YouTube subtitle button found, using custom button only');
                    this.isVisible = true;
                    this.updateCustomButtonState();
                    this.forceUpdate();
                }
            }, 10000);
        }
    }

    /**
     * Create a custom toggle button for Buttercup captions
     */
    createCustomToggleButton() {
        // Check if button already exists
        if (document.getElementById('buttercup-caption-toggle')) {
            return;
        }

        // Find YouTube controls
        const controlsContainer = document.querySelector('.ytp-right-controls');
        if (!controlsContainer) {
            console.warn('[CaptionOverlay] Could not find YouTube controls for custom button');
            return;
        }

        // Create custom button
        const button = document.createElement('button');
        button.id = 'buttercup-caption-toggle';
        button.className = 'ytp-button';
        button.setAttribute('aria-label', 'Buttercup Captions');
        button.setAttribute('title', 'Toggle Buttercup Captions (Buttercup Extension)');

        button.style.cssText = `
            width: 48px;
            height: 100%;
            cursor: pointer;
            border: none;
            background: transparent;
            opacity: 0.9;
            position: relative;
        `;

        // SVG icon (CC with "B" indicator)
        button.innerHTML = `
            <svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%">
                <path d="M11,11 C10.4,11 10,11.4 10,12 L10,24 C10,24.6 10.4,25 11,25 L25,25 C25.6,25 26,24.6 26,24 L26,12 C26,11.4 25.6,11 25,11 L11,11 Z M21,14 L21,15.5 C20.2,15.5 19.5,16.2 19.5,17 L19.5,19 C19.5,19.8 20.2,20.5 21,20.5 L21,22 L18,22 L18,20.5 C18,19.7 17.3,19 16.5,19 L16.5,17 C17.3,17 18,16.3 18,15.5 L18,14 L21,14 Z"
                      fill="#fff" id="buttercup-cc-path"></path>
                <text x="28" y="14" fill="#4CAF50" font-size="10" font-weight="bold" id="buttercup-indicator">B</text>
            </svg>
        `;

        // Toggle handler
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
            this.updateCustomButtonState();
        });

        // Insert before settings button
        const settingsButton = controlsContainer.querySelector('.ytp-settings-button');
        if (settingsButton) {
            controlsContainer.insertBefore(button, settingsButton);
        } else {
            controlsContainer.appendChild(button);
        }

        this.customToggleButton = button;
        this.updateCustomButtonState();

        console.info('[CaptionOverlay] ✓ Custom toggle button created');
    }

    /**
     * Update custom button visual state
     */
    updateCustomButtonState() {
        if (!this.customToggleButton) return;

        const path = this.customToggleButton.querySelector('#buttercup-cc-path');
        const indicator = this.customToggleButton.querySelector('#buttercup-indicator');

        if (this.isVisible) {
            // Active state - bright green
            path.style.fill = '#4CAF50';
            indicator.style.fill = '#fff';
            this.customToggleButton.style.opacity = '1';
        } else {
            // Inactive state - white/grey
            path.style.fill = '#fff';
            indicator.style.fill = '#888';
            this.customToggleButton.style.opacity = '0.5';
        }
    }

    updateCaption() {
        if (!this.video || !this.captionElement) return;

        // Always update, even if not visible (keeps state consistent)
        const currentTimeMs = this.video.currentTime * 1000;

        // Use optimized binary search instead of linear search
        const captionIndex = this.findCaptionAtTime(currentTimeMs);

        if (captionIndex !== -1) {
            const caption = this.captions[captionIndex];

            // Only update DOM if caption changed (performance optimization)
            if (captionIndex !== this.currentCaptionIndex) {
                this.currentCaptionIndex = captionIndex;
                this.showCaption(caption);
            }

            // Show/hide based on visibility setting
            if (this.isVisible && this.captionElement.style.display === 'none') {
                this.captionElement.style.display = 'inline-block';
            } else if (!this.isVisible && this.captionElement.style.display !== 'none') {
                this.captionElement.style.display = 'none';
            }
        } else {
            // No caption at current time
            if (this.currentCaptionIndex !== -1) {
                this.currentCaptionIndex = -1;
                this.hideCaption();
            }
        }
    }

    /**
     * Binary search to find caption at given time - O(log n) instead of O(n)
     * @param {number} timeMs - Current time in milliseconds
     * @returns {number} - Index of active caption, or -1 if none
     */
    findCaptionAtTime(timeMs) {
        if (!this.captions.length) return -1;

        let left = 0;
        let right = this.captions.length - 1;
        let result = -1;

        // Binary search for the caption that starts before or at current time
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const caption = this.captions[mid];

            if (caption.tStartMs <= timeMs) {
                // This caption starts before or at current time
                // Check if current time is within this caption's duration
                if (timeMs <= caption.tStartMs + caption.dDurationMs) {
                    return mid; // Found active caption
                }
                // Caption ended, look for later caption
                result = mid;
                left = mid + 1;
            } else {
                // Caption starts after current time, look earlier
                right = mid - 1;
            }
        }

        // Double-check the result (in case we found a caption that started before but ended)
        if (result !== -1) {
            const caption = this.captions[result];
            if (timeMs >= caption.tStartMs && timeMs <= caption.tStartMs + caption.dDurationMs) {
                return result;
            }
        }

        return -1; // No active caption
    }

    showCaption(caption) {
        if (!this.captionElement) return;

        // Extract text from segs array
        const text = caption.segs.map(seg => seg.utf8).join(' ').trim();

        if (text && this.captionElement.textContent !== text) {
            this.captionElement.textContent = text;
            if (this.isVisible) {
                this.captionElement.style.display = 'inline-block';
            }
        }
    }

    hideCaption() {
        if (this.captionElement) {
            this.captionElement.style.display = 'none';
            this.captionElement.textContent = '';
        }
    }

    handleFullscreenChange() {
        // Update overlay position when entering/exiting fullscreen
        // Video dimensions change in fullscreen, so re-calculate
        if (this.overlay) {
            this.updateOverlayPosition();
        }
    }

    toggle() {
        this.isVisible = !this.isVisible;
        if (!this.isVisible) {
            this.hideCaption();
        }
        console.info('[CaptionOverlay] Visibility toggled:', this.isVisible);
    }

    destroy() {
        this.isTracking = false;

        // Clear intervals and animation frame
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        if (this.urlCheckInterval) {
            clearInterval(this.urlCheckInterval);
            this.urlCheckInterval = null;
        }

        // Clear position check interval
        if (this.positionCheckInterval) {
            clearInterval(this.positionCheckInterval);
            this.positionCheckInterval = null;
        }

        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }

        // Remove all video event listeners
        if (this.video) {
            if (this.boundUpdateCaption) {
                this.video.removeEventListener('timeupdate', this.boundUpdateCaption);
            }
            if (this.boundForceUpdate) {
                this.video.removeEventListener('seeking', this.boundForceUpdate);
                this.video.removeEventListener('seeked', this.boundForceUpdate);
                this.video.removeEventListener('play', this.boundForceUpdate);
                this.video.removeEventListener('pause', this.boundForceUpdate);
                this.video.removeEventListener('playing', this.boundForceUpdate);
                this.video.removeEventListener('ratechange', this.boundForceUpdate);
                this.video.removeEventListener('loadeddata', this.boundForceUpdate);
                this.video.removeEventListener('canplay', this.boundForceUpdate);
            }
        }

        // Remove fullscreen listeners
        if (this.boundHandleFullscreen) {
            document.removeEventListener('fullscreenchange', this.boundHandleFullscreen);
            document.removeEventListener('webkitfullscreenchange', this.boundHandleFullscreen);
        }

        // Disconnect mutation observer
        if (this.videoObserver) {
            this.videoObserver.disconnect();
            this.videoObserver = null;
        }

        // Disconnect resize observer
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }

        // Disconnect container observer
        if (this.containerObserver) {
            this.containerObserver.disconnect();
            this.containerObserver = null;
        }

        // Remove window resize listener
        if (this.boundWindowResize) {
            window.removeEventListener('resize', this.boundWindowResize);
            this.boundWindowResize = null;
        }

        // Remove scroll listener
        if (this.boundScroll) {
            window.removeEventListener('scroll', this.boundScroll);
            this.boundScroll = null;
        }

        // Remove custom toggle button
        if (this.customToggleButton) {
            this.customToggleButton.remove();
            this.customToggleButton = null;
        }

        // Remove overlay from DOM
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }

        this.captionElement = null;
        this.video = null;

        console.info('[CaptionOverlay] ✓ Completely destroyed and cleaned up');
    }
}

// Globale Instanz verfügbar machen
window.CustomCaptionOverlay = CustomCaptionOverlay;
