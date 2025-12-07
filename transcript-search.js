/**
 * Transcript Search UI - Allows searching through video transcripts
 * Highlights matches and jumps to timestamps
 */

class TranscriptSearch {
    constructor(captionData) {
        this.captionData = captionData;
        this.searchResults = [];
        this.currentResultIndex = 0;
        this.searchBar = null;
        this.resultsPanel = null;
        this.isVisible = false;

        console.info('[TranscriptSearch] Initializing with', captionData.events.length, 'caption events');
        this.init();
    }

    init() {
        this.createSearchUI();
        this.setupKeyboardShortcuts();
    }

    createSearchUI() {
        // Create search bar container
        this.searchBar = document.createElement('div');
        this.searchBar.id = 'buttercup-search-bar';
        this.searchBar.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            width: 350px;
            background: rgba(28, 28, 28, 0.95);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            padding: 12px;
            z-index: 9999;
            display: none;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(10px);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;

        this.searchBar.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
                <input type="text" id="buttercup-search-input" placeholder="Search transcript..." style="
                    flex: 1;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 4px;
                    padding: 8px 12px;
                    color: #fff;
                    font-size: 14px;
                    outline: none;
                " />
                <button id="buttercup-search-close" style="
                    background: rgba(255, 255, 255, 0.1);
                    border: none;
                    border-radius: 4px;
                    padding: 8px 12px;
                    color: #fff;
                    cursor: pointer;
                    font-size: 14px;
                " title="Close">×</button>
            </div>
            <div id="buttercup-search-results" style="
                max-height: 300px;
                overflow-y: auto;
                color: #fff;
                font-size: 13px;
            "></div>
            <div id="buttercup-search-status" style="
                margin-top: 8px;
                padding: 6px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 4px;
                font-size: 12px;
                color: rgba(255, 255, 255, 0.7);
                text-align: center;
            ">Enter a search term</div>
        `;

        document.body.appendChild(this.searchBar);

        // Get elements
        this.searchInput = document.getElementById('buttercup-search-input');
        this.resultsPanel = document.getElementById('buttercup-search-results');
        this.statusDiv = document.getElementById('buttercup-search-status');
        this.closeBtn = document.getElementById('buttercup-search-close');

        // Event listeners
        this.searchInput.addEventListener('input', () => this.handleSearch());
        this.closeBtn.addEventListener('click', () => this.hide());

        console.info('[TranscriptSearch] ✓ Search UI created');
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + F to open search
            if ((e.ctrlKey || e.metaKey) && e.key === 'f' && window.location.href.includes('youtube.com/watch')) {
                e.preventDefault();
                this.toggle();
            }

            // Escape to close
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }

            // Enter to go to next result
            if (e.key === 'Enter' && this.isVisible && document.activeElement === this.searchInput) {
                e.preventDefault();
                this.nextResult();
            }

            // Shift+Enter to go to previous result
            if (e.key === 'Enter' && e.shiftKey && this.isVisible) {
                e.preventDefault();
                this.previousResult();
            }
        });

        console.info('[TranscriptSearch] ✓ Keyboard shortcuts set up (Ctrl+F to search)');
    }

    handleSearch() {
        const query = this.searchInput.value.trim();

        if (query.length < 2) {
            this.searchResults = [];
            this.resultsPanel.innerHTML = '';
            this.statusDiv.textContent = 'Enter at least 2 characters';
            this.statusDiv.style.color = 'rgba(255, 255, 255, 0.5)';
            return;
        }

        // Search through captions
        this.searchResults = [];
        const queryLower = query.toLowerCase();

        this.captionData.events.forEach((event, index) => {
            const text = event.segs.map(seg => seg.utf8).join('');
            const textLower = text.toLowerCase();

            if (textLower.includes(queryLower)) {
                // Find all occurrences in this caption
                let startIndex = 0;
                while ((startIndex = textLower.indexOf(queryLower, startIndex)) !== -1) {
                    this.searchResults.push({
                        eventIndex: index,
                        text: text,
                        timestamp: event.tStartMs,
                        matchStart: startIndex,
                        matchEnd: startIndex + query.length
                    });
                    startIndex++;
                }
            }
        });

        this.displayResults();
    }

    displayResults() {
        if (this.searchResults.length === 0) {
            this.resultsPanel.innerHTML = '<div style="padding: 12px; text-align: center; color: rgba(255, 255, 255, 0.5);">No results found</div>';
            this.statusDiv.textContent = 'No matches';
            this.statusDiv.style.color = '#ff6b6b';
            return;
        }

        // Display status
        this.statusDiv.textContent = `Found ${this.searchResults.length} match${this.searchResults.length > 1 ? 'es' : ''}`;
        this.statusDiv.style.color = '#51cf66';

        // Display results
        this.resultsPanel.innerHTML = '';
        this.searchResults.forEach((result, index) => {
            const resultDiv = document.createElement('div');
            resultDiv.style.cssText = `
                padding: 10px 12px;
                margin-bottom: 6px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 4px;
                cursor: pointer;
                transition: background 0.2s;
                border-left: 3px solid ${index === this.currentResultIndex ? '#51cf66' : 'transparent'};
            `;

            resultDiv.addEventListener('mouseenter', () => {
                resultDiv.style.background = 'rgba(255, 255, 255, 0.1)';
            });

            resultDiv.addEventListener('mouseleave', () => {
                resultDiv.style.background = 'rgba(255, 255, 255, 0.05)';
            });

            resultDiv.addEventListener('click', () => {
                this.currentResultIndex = index;
                this.jumpToResult(result);
                this.displayResults(); // Refresh to update highlighting
            });

            // Format timestamp
            const timestamp = this.formatTime(result.timestamp);

            // Highlight the match
            const beforeMatch = result.text.substring(0, result.matchStart);
            const match = result.text.substring(result.matchStart, result.matchEnd);
            const afterMatch = result.text.substring(result.matchEnd);

            resultDiv.innerHTML = `
                <div style="font-size: 11px; color: #51cf66; margin-bottom: 4px; font-weight: 600;">${timestamp}</div>
                <div style="font-size: 13px; line-height: 1.4;">
                    ${this.escapeHtml(beforeMatch)}<span style="background: #ffd43b; color: #000; padding: 2px 4px; border-radius: 2px; font-weight: 600;">${this.escapeHtml(match)}</span>${this.escapeHtml(afterMatch)}
                </div>
            `;

            this.resultsPanel.appendChild(resultDiv);
        });

        console.info('[TranscriptSearch] Displayed', this.searchResults.length, 'results');
    }

    jumpToResult(result) {
        const video = document.querySelector('video.html5-main-video, video');
        if (video) {
            video.currentTime = result.timestamp / 1000;
            console.info('[TranscriptSearch] Jumped to', this.formatTime(result.timestamp));
        }
    }

    nextResult() {
        if (this.searchResults.length === 0) return;

        this.currentResultIndex = (this.currentResultIndex + 1) % this.searchResults.length;
        this.jumpToResult(this.searchResults[this.currentResultIndex]);
        this.displayResults();
    }

    previousResult() {
        if (this.searchResults.length === 0) return;

        this.currentResultIndex = (this.currentResultIndex - 1 + this.searchResults.length) % this.searchResults.length;
        this.jumpToResult(this.searchResults[this.currentResultIndex]);
        this.displayResults();
    }

    formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    show() {
        this.searchBar.style.display = 'block';
        this.isVisible = true;
        this.searchInput.focus();
        console.info('[TranscriptSearch] Search bar shown');
    }

    hide() {
        this.searchBar.style.display = 'none';
        this.isVisible = false;
        console.info('[TranscriptSearch] Search bar hidden');
    }

    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    destroy() {
        if (this.searchBar) {
            this.searchBar.remove();
        }
        console.info('[TranscriptSearch] Destroyed');
    }
}

// Make available globally
window.TranscriptSearch = TranscriptSearch;
