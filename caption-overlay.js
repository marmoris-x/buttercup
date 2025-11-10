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

        console.info('[CaptionOverlay] Initializing with', this.captions.length, 'caption events, visible:', this.isVisible);
        this.init();
    }

    init() {
        // Warte auf Video-Element
        this.waitForVideo().then(() => {
            console.info('[CaptionOverlay] Video found, creating overlay');
            this.createOverlay();
            this.startTracking();
            this.setupToggleListener();
        });
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
        this.overlay.style.cssText = `
            position: absolute;
            bottom: 90px;
            left: 0;
            right: 0;
            text-align: center;
            z-index: 50;
            pointer-events: none;
            padding: 0 10%;
            display: block;
        `;

        // Erstelle Caption-Element
        this.captionElement = document.createElement('div');
        this.captionElement.style.cssText = `
            display: none;
            background: rgba(8, 8, 8, 0.90);
            color: #ffffff;
            padding: 8px 16px;
            border-radius: 3px;
            font-size: 22px;
            line-height: 1.4;
            font-family: "YouTube Noto", Roboto, "Arial Unicode Ms", Arial, Helvetica, Verdana, sans-serif;
            text-shadow: 0 0 2px rgba(0,0,0,.5), 0 1px 2px rgba(0,0,0,.5), 0 0 2px rgba(0,0,0,.5);
            white-space: pre-wrap;
            word-wrap: break-word;
            max-width: 80%;
            margin: 0 auto;
        `;

        this.overlay.appendChild(this.captionElement);
        playerContainer.appendChild(this.overlay);

        console.info('[CaptionOverlay] ✓ Overlay created and injected');
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
