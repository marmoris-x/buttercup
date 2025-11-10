/**
 * Summary Sidebar - Displays AI-generated summary with chapter navigation
 */

class SummarySidebar {
    constructor(summary, videoTitle) {
        this.summary = summary;
        this.videoTitle = videoTitle;
        this.sidebar = null;
        this.isVisible = true;
        this.isMinimized = false;

        this.create();
    }

    create() {
        // Create sidebar container
        this.sidebar = document.createElement('div');
        this.sidebar.id = 'buttercup-summary-sidebar';
        this.sidebar.style.cssText = `
            position: fixed;
            top: 56px;
            right: 0;
            width: 380px;
            height: calc(100vh - 56px);
            background: #0f0f0f;
            color: #f1f1f1;
            z-index: 2000;
            overflow-y: auto;
            box-shadow: -2px 0 8px rgba(0,0,0,0.3);
            font-family: "Roboto", "Arial", sans-serif;
            transition: transform 0.3s ease;
        `;

        // Build content
        this.sidebar.innerHTML = `
            <div style="position: sticky; top: 0; background: #0f0f0f; z-index: 10; border-bottom: 1px solid #303030;">
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px;">
                    <h3 style="margin: 0; font-size: 16px; font-weight: 500;">📝 Video Summary</h3>
                    <div style="display: flex; gap: 8px;">
                        <button id="buttercup-copy-markdown-btn" style="background: none; border: none; color: #aaa; cursor: pointer; padding: 4px 8px; font-size: 14px;" title="Copy as Markdown">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                        </button>
                        <button id="buttercup-minimize-btn" style="background: none; border: none; color: #aaa; cursor: pointer; padding: 4px; font-size: 18px;" title="Minimize">−</button>
                        <button id="buttercup-close-sidebar" style="background: none; border: none; color: #aaa; cursor: pointer; padding: 4px; font-size: 18px;" title="Close">×</button>
                    </div>
                </div>
            </div>

            <div id="buttercup-sidebar-content" style="padding: 16px;">
                <!-- Overall Summary -->
                <div style="margin-bottom: 20px;">
                    <h4 style="font-size: 14px; font-weight: 500; margin: 0 0 8px 0; color: #3ea6ff;">Overview</h4>
                    <p style="font-size: 13px; line-height: 1.6; margin: 0; color: #aaa;">
                        ${this.summary.overallSummary || 'No summary available'}
                    </p>
                </div>

                <!-- Key Points -->
                ${this.summary.keyPoints && this.summary.keyPoints.length > 0 ? `
                <div style="margin-bottom: 20px;">
                    <h4 style="font-size: 14px; font-weight: 500; margin: 0 0 8px 0; color: #3ea6ff;">Key Points</h4>
                    <ul style="margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.8; color: #aaa;">
                        ${this.summary.keyPoints.map(point => `<li>${point}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}

                <!-- Chapters -->
                ${this.summary.chapters && this.summary.chapters.length > 0 ? `
                <div style="margin-bottom: 20px;">
                    <h4 style="font-size: 14px; font-weight: 500; margin: 0 0 12px 0; color: #3ea6ff;">Chapters</h4>
                    <div id="buttercup-chapters">
                        ${this.summary.chapters.map((chapter, index) => `
                            <div class="buttercup-chapter" data-segment="${chapter.segmentIndex || 0}"
                                 style="padding: 10px; margin-bottom: 8px; background: #1a1a1a; border-radius: 4px; cursor: pointer; transition: background 0.2s;"
                                 onmouseover="this.style.background='#2a2a2a'" onmouseout="this.style.background='#1a1a1a'">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                    <span style="font-size: 12px; color: #3ea6ff; font-weight: 500;">${chapter.timestamp || '00:00'}</span>
                                    <span style="font-size: 13px; font-weight: 500; flex: 1;">${chapter.title || `Chapter ${index + 1}`}</span>
                                </div>
                                ${chapter.description ? `
                                    <p style="font-size: 12px; color: #888; margin: 0; line-height: 1.4;">
                                        ${chapter.description}
                                    </p>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                <!-- Tags -->
                ${this.summary.tags && this.summary.tags.length > 0 ? `
                <div>
                    <h4 style="font-size: 14px; font-weight: 500; margin: 0 0 8px 0; color: #3ea6ff;">Tags</h4>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                        ${this.summary.tags.map(tag => `
                            <span style="font-size: 11px; padding: 4px 10px; background: #2a2a2a; border-radius: 12px; color: #aaa;">
                                ${tag}
                            </span>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
            </div>
        `;

        // Attach to page
        document.body.appendChild(this.sidebar);

        // Setup event listeners
        this.setupEventListeners();

        console.info('[SummarySidebar] ✓ Sidebar created');
    }

    setupEventListeners() {
        // Close button
        const closeBtn = this.sidebar.querySelector('#buttercup-close-sidebar');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }

        // Minimize button
        const minimizeBtn = this.sidebar.querySelector('#buttercup-minimize-btn');
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => this.toggleMinimize());
        }

        // Copy markdown button
        const copyMarkdownBtn = this.sidebar.querySelector('#buttercup-copy-markdown-btn');
        if (copyMarkdownBtn) {
            copyMarkdownBtn.addEventListener('click', () => this.copyAsMarkdown());
        }

        // Chapter click handlers
        const chapters = this.sidebar.querySelectorAll('.buttercup-chapter');
        chapters.forEach(chapter => {
            chapter.addEventListener('click', () => {
                const segmentIndex = parseInt(chapter.dataset.segment);
                this.jumpToSegment(segmentIndex);
            });
        });
    }

    jumpToSegment(segmentIndex) {
        // Dispatch event to jump to specific caption/timestamp
        document.dispatchEvent(new CustomEvent('buttercupJumpToSegment', {
            detail: { segmentIndex: segmentIndex }
        }));

        console.info(`[SummarySidebar] Jumping to segment: ${segmentIndex}`);
    }

    toggleMinimize() {
        this.isMinimized = !this.isMinimized;
        const content = this.sidebar.querySelector('#buttercup-sidebar-content');
        const minimizeBtn = this.sidebar.querySelector('#buttercup-minimize-btn');

        if (this.isMinimized) {
            content.style.display = 'none';
            this.sidebar.style.width = '48px';
            minimizeBtn.textContent = '+';
            minimizeBtn.title = 'Expand';
        } else {
            content.style.display = 'block';
            this.sidebar.style.width = '380px';
            minimizeBtn.textContent = '−';
            minimizeBtn.title = 'Minimize';
        }
    }

    copyAsMarkdown() {
        // Build markdown content
        let markdown = `# ${this.videoTitle}\n\n`;

        // Overall Summary
        if (this.summary.overallSummary) {
            markdown += `## Summary\n\n${this.summary.overallSummary}\n\n`;
        }

        // Key Points
        if (this.summary.keyPoints && this.summary.keyPoints.length > 0) {
            markdown += `## Key Points\n\n`;
            this.summary.keyPoints.forEach(point => {
                markdown += `- ${point}\n`;
            });
            markdown += '\n';
        }

        // Chapters
        if (this.summary.chapters && this.summary.chapters.length > 0) {
            markdown += `## Chapters\n\n`;
            this.summary.chapters.forEach(chapter => {
                markdown += `### ${chapter.timestamp || '00:00'} - ${chapter.title}\n`;
                if (chapter.description) {
                    markdown += `${chapter.description}\n`;
                }
                markdown += '\n';
            });
        }

        // Tags
        if (this.summary.tags && this.summary.tags.length > 0) {
            markdown += `## Tags\n\n`;
            markdown += this.summary.tags.map(tag => `\`${tag}\``).join(' ') + '\n';
        }

        // Copy to clipboard
        navigator.clipboard.writeText(markdown).then(() => {
            // Show success notification
            this.showNotification('✓ Summary copied as Markdown!', 'success');
            console.info('[SummarySidebar] ✓ Summary copied as Markdown');
        }).catch(err => {
            console.error('[SummarySidebar] Failed to copy:', err);
            this.showNotification('Failed to copy to clipboard', 'error');
        });
    }

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 70px;
            right: 400px;
            background: ${type === 'success' ? '#0f9d58' : '#d93025'};
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            z-index: 2100;
            font-size: 14px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            transition: opacity 0.3s;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    }

    show() {
        this.isVisible = true;
        this.sidebar.style.transform = 'translateX(0)';
    }

    hide() {
        this.isVisible = false;
        this.sidebar.style.transform = 'translateX(100%)';
    }

    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    destroy() {
        if (this.sidebar) {
            this.sidebar.remove();
        }
    }
}

// Make available globally
window.SummarySidebar = SummarySidebar;
