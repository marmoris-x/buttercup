/**
 * Custom Caption Overlay - zeigt Captions direkt über dem Video an
 * Umgeht YouTube's komplexes Caption-System komplett
 */

class CustomCaptionOverlay {
    constructor(captionData, startVisible = true) {
        this.captions = captionData.events || [];
        this.video = null;
        this.overlay = null;
        this.captionElement = null;
        this.currentIndex = 0;
        this.isVisible = startVisible; // Start visible by default (auto-loaded transcripts should show immediately)
        this.updateInterval = null;

        // Default customization settings (will be loaded from storage)
        this.settings = {
            fontSize: 22,              // pixels
            position: 'bottom',        // 'top', 'middle', 'bottom'
            fontColor: '#ffffff',      // hex color
            backgroundColor: '#080808', // hex color
            backgroundOpacity: 0.90,   // 0.0 - 1.0
            fontFamily: '"YouTube Noto", Roboto, "Arial Unicode Ms", Arial, Helvetica, Verdana, sans-serif'
        };

        console.info('[CaptionOverlay] Initializing with', this.captions.length, 'caption events, visible:', this.isVisible);
        this.init();
    }

    init() {
        // Load settings first, then create overlay
        this.loadSettings().then(() => {
            // Warte auf Video-Element
            this.waitForVideo().then(() => {
                console.info('[CaptionOverlay] Video found, creating overlay');
                this.createOverlay();
                this.startTracking();
                this.setupToggleListener();
                this.setupSettingsListener();
            });
        });
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
                        position: e.detail.position || 'bottom',
                        fontColor: e.detail.fontColor || '#ffffff',
                        backgroundColor: e.detail.backgroundColor || '#080808',
                        backgroundOpacity: e.detail.backgroundOpacity !== undefined ? e.detail.backgroundOpacity : 0.90,
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
    }

    /**
     * Apply current settings to the overlay
     */
    applySettings() {
        if (!this.overlay || !this.captionElement) return;

        // Update overlay position
        const positions = {
            'top': '50px',
            'middle': '50%',
            'bottom': '90px'
        };

        this.overlay.style.bottom = positions[this.settings.position] || '90px';

        if (this.settings.position === 'middle') {
            this.overlay.style.transform = 'translateY(-50%)';
            this.overlay.style.top = '50%';
            this.overlay.style.bottom = 'auto';
        } else {
            this.overlay.style.transform = '';
            this.overlay.style.top = this.settings.position === 'top' ? '50px' : 'auto';
            this.overlay.style.bottom = this.settings.position === 'bottom' ? '90px' : 'auto';
        }

        // Update caption element styles
        this.captionElement.style.fontSize = `${this.settings.fontSize}px`;
        this.captionElement.style.color = this.settings.fontColor;

        // Convert hex to rgba for background with opacity
        const bgColor = this.hexToRgba(this.settings.backgroundColor, this.settings.backgroundOpacity);
        this.captionElement.style.background = bgColor;
        this.captionElement.style.fontFamily = this.settings.fontFamily;

        console.info('[CaptionOverlay] Settings applied to overlay');
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
                    resolve();
                }
            }, 100);
        });
    }

    createOverlay() {
        const playerContainer = document.querySelector('.html5-video-player');
        if (!playerContainer) {
            console.error('[CaptionOverlay] Player container not found!');
            return;
        }

        // Erstelle Overlay-Container
        this.overlay = document.createElement('div');
        this.overlay.id = 'buttercup-caption-overlay';

        // Apply position-based styles
        let overlayPosition = {};
        if (this.settings.position === 'top') {
            overlayPosition = { top: '50px', bottom: 'auto' };
        } else if (this.settings.position === 'middle') {
            overlayPosition = { top: '50%', bottom: 'auto', transform: 'translateY(-50%)' };
        } else {
            overlayPosition = { bottom: '90px', top: 'auto' };
        }

        this.overlay.style.cssText = `
            position: absolute;
            ${overlayPosition.top ? `top: ${overlayPosition.top};` : ''}
            ${overlayPosition.bottom ? `bottom: ${overlayPosition.bottom};` : ''}
            ${overlayPosition.transform ? `transform: ${overlayPosition.transform};` : ''}
            left: 0;
            right: 0;
            text-align: center;
            z-index: 50;
            pointer-events: none;
            padding: 0 10%;
            display: block;
        `;

        // Erstelle Caption-Element with custom settings
        this.captionElement = document.createElement('div');
        const bgColor = this.hexToRgba(this.settings.backgroundColor, this.settings.backgroundOpacity);

        this.captionElement.style.cssText = `
            display: none;
            background: ${bgColor};
            color: ${this.settings.fontColor};
            padding: 8px 16px;
            border-radius: 3px;
            font-size: ${this.settings.fontSize}px;
            line-height: 1.4;
            font-family: ${this.settings.fontFamily};
            text-shadow: 0 0 2px rgba(0,0,0,.5), 0 1px 2px rgba(0,0,0,.5), 0 0 2px rgba(0,0,0,.5);
            white-space: pre-wrap;
            word-wrap: break-word;
            max-width: 80%;
            margin: 0 auto;
        `;

        this.overlay.appendChild(this.captionElement);
        playerContainer.appendChild(this.overlay);

        console.info('[CaptionOverlay] ✓ Overlay created with custom settings:', this.settings);
    }

    startTracking() {
        // Hauptmethode: timeupdate Event
        this.video.addEventListener('timeupdate', () => {
            this.updateCaption();
        });

        // Backup: Interval für Sicherheit
        this.updateInterval = setInterval(() => {
            if (this.video && !this.video.paused) {
                this.updateCaption();
            }
        }, 100);

        // Reagiere auf Vollbild
        document.addEventListener('fullscreenchange', () => {
            this.handleFullscreenChange();
        });

        console.info('[CaptionOverlay] ✓ Started tracking video time');
    }

    setupToggleListener() {
        // Warte auf Untertitel-Button (kann verzögert geladen werden)
        const waitForButton = setInterval(() => {
            const subtitleButton = document.querySelector('.ytp-subtitles-button');
            if (subtitleButton) {
                clearInterval(waitForButton);

                // Event Listener für Button-Klick
                subtitleButton.addEventListener('click', () => {
                    // Read YouTube's button state instead of blind toggle
                    setTimeout(() => {
                        // Check if YouTube's captions are enabled (aria-pressed attribute)
                        const isYouTubeCaptionsOn = subtitleButton.getAttribute('aria-pressed') === 'true';

                        // Sync our visibility with YouTube's state
                        this.isVisible = isYouTubeCaptionsOn;

                        if (!this.isVisible) {
                            this.hideCaption();
                        }

                        console.info('[CaptionOverlay] Synced with YouTube button state:', this.isVisible);
                    }, 50);
                });

                console.info('[CaptionOverlay] ✓ Toggle listener attached to subtitle button');
            }
        }, 100);

        // Timeout nach 10 Sekunden
        setTimeout(() => {
            clearInterval(waitForButton);
        }, 10000);
    }

    updateCaption() {
        if (!this.video || !this.isVisible) return;

        const currentTime = this.video.currentTime * 1000; // Konvertiere zu Millisekunden

        // Finde passende Caption
        const activeCaption = this.captions.find(caption =>
            currentTime >= caption.tStartMs &&
            currentTime <= (caption.tStartMs + caption.dDurationMs)
        );

        if (activeCaption) {
            this.showCaption(activeCaption);
        } else {
            this.hideCaption();
        }
    }

    showCaption(caption) {
        if (!this.captionElement) return;

        // Extrahiere Text aus segs Array
        const text = caption.segs.map(seg => seg.utf8).join(' ');

        if (this.captionElement.textContent !== text) {
            this.captionElement.textContent = text;
            this.captionElement.style.display = 'inline-block';
        }
    }

    hideCaption() {
        if (this.captionElement && this.captionElement.style.display !== 'none') {
            this.captionElement.style.display = 'none';
        }
    }

    handleFullscreenChange() {
        if (document.fullscreenElement) {
            this.overlay.style.bottom = '110px';
        } else {
            this.overlay.style.bottom = '90px';
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
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        if (this.overlay) {
            this.overlay.remove();
        }
        console.info('[CaptionOverlay] Destroyed');
    }
}

// Globale Instanz verfügbar machen
window.CustomCaptionOverlay = CustomCaptionOverlay;
