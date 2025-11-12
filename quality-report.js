/**
 * Quality Report UI - Shows transcription quality warnings and statistics
 */

class QualityReport {
    constructor(qualityData) {
        this.qualityData = qualityData;
        this.panel = null;

        console.info('[QualityReport] Initializing with quality data:', qualityData);

        // Only show if there are warnings
        if (qualityData && qualityData.hasWarnings) {
            this.show();
        }
    }

    show() {
        // Create quality report panel
        this.panel = document.createElement('div');
        this.panel.id = 'buttercup-quality-report';
        this.panel.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 320px;
            background: linear-gradient(135deg, rgba(255, 107, 107, 0.95) 0%, rgba(255, 159, 107, 0.95) 100%);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 12px;
            padding: 16px;
            z-index: 9998;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(10px);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            animation: slideIn 0.3s ease-out;
        `;

        const warnings = this.qualityData.warnings || [];
        const stats = this.qualityData.stats || {};

        this.panel.innerHTML = `
            <style>
                @keyframes slideIn {
                    from {
                        transform: translateX(400px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            </style>
            <div style="display: flex; justify-between; align-items: start; margin-bottom: 12px;">
                <div>
                    <div style="font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                        Transcription Quality Warning
                    </div>
                    <div style="font-size: 12px; color: rgba(255, 255, 255, 0.9);">
                        Some segments may have low confidence
                    </div>
                </div>
                <button id="buttercup-quality-close" style="
                    background: rgba(255, 255, 255, 0.2);
                    border: none;
                    border-radius: 6px;
                    width: 28px;
                    height: 28px;
                    color: #fff;
                    cursor: pointer;
                    font-size: 18px;
                    font-weight: 700;
                    transition: background 0.2s;
                    flex-shrink: 0;
                ">×</button>
            </div>

            <div style="background: rgba(0, 0, 0, 0.2); border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                <div style="font-size: 13px; color: #fff; font-weight: 600; margin-bottom: 8px;">Issues Detected:</div>
                ${warnings.map(warning => `
                    <div style="font-size: 12px; color: rgba(255, 255, 255, 0.95); margin-bottom: 6px; padding-left: 8px; border-left: 2px solid rgba(255, 255, 255, 0.4);">
                        • ${warning}
                    </div>
                `).join('')}
            </div>

            ${stats.totalSegments ? `
                <div style="font-size: 11px; color: rgba(255, 255, 255, 0.8); margin-bottom: 10px;">
                    <strong>Statistics:</strong><br/>
                    Total Segments: ${stats.totalSegments}<br/>
                    ${stats.lowConfidenceSegments ? `Low Confidence: ${stats.lowConfidenceSegments} (${((stats.lowConfidenceSegments / stats.totalSegments) * 100).toFixed(1)}%)<br/>` : ''}
                    ${stats.noSpeechSegments ? `Likely Non-Speech: ${stats.noSpeechSegments}<br/>` : ''}
                    ${stats.unusualCompressionSegments ? `Unusual Compression: ${stats.unusualCompressionSegments}<br/>` : ''}
                </div>
            ` : ''}

            <div style="font-size: 11px; color: rgba(255, 255, 255, 0.9); padding: 8px; background: rgba(0, 0, 0, 0.15); border-radius: 6px;">
                <strong>Tip:</strong> For better results, try:
                <ul style="margin: 4px 0 0 16px; padding: 0;">
                    <li>Using a video with clearer audio</li>
                    <li>Re-transcribing with a different prompt</li>
                    <li>Checking if the correct language is selected</li>
                </ul>
            </div>

            <button id="buttercup-quality-dismiss" style="
                width: 100%;
                background: rgba(255, 255, 255, 0.25);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 8px;
                padding: 10px;
                color: #fff;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
                margin-top: 12px;
                transition: all 0.2s;
            ">Got it, dismiss</button>
        `;

        document.body.appendChild(this.panel);

        // Event listeners
        document.getElementById('buttercup-quality-close').addEventListener('click', () => this.hide());
        document.getElementById('buttercup-quality-dismiss').addEventListener('click', () => this.hide());

        // Hover effects
        const closeBtn = document.getElementById('buttercup-quality-close');
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.background = 'rgba(255, 255, 255, 0.3)';
        });
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.background = 'rgba(255, 255, 255, 0.2)';
        });

        const dismissBtn = document.getElementById('buttercup-quality-dismiss');
        dismissBtn.addEventListener('mouseenter', () => {
            dismissBtn.style.background = 'rgba(255, 255, 255, 0.35)';
            dismissBtn.style.transform = 'scale(1.02)';
        });
        dismissBtn.addEventListener('mouseleave', () => {
            dismissBtn.style.background = 'rgba(255, 255, 255, 0.25)';
            dismissBtn.style.transform = 'scale(1)';
        });

        // Auto-hide after 30 seconds
        setTimeout(() => {
            if (this.panel && this.panel.parentElement) {
                this.hide();
            }
        }, 30000);

        console.info('[QualityReport] ✓ Quality report panel shown');
    }

    hide() {
        if (this.panel) {
            this.panel.style.animation = 'slideOut 0.3s ease-out';
            this.panel.style.animationFillMode = 'forwards';

            // Add slideOut animation
            const style = document.createElement('style');
            style.textContent = `
                @keyframes slideOut {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(400px);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);

            setTimeout(() => {
                if (this.panel && this.panel.parentElement) {
                    this.panel.remove();
                }
            }, 300);

            console.info('[QualityReport] Quality report hidden');
        }
    }

    destroy() {
        this.hide();
    }
}

// Make available globally
window.QualityReport = QualityReport;
