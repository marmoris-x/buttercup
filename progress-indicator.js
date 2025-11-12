/**
 * Progress Indicator for Buttercup
 * Shows real-time progress during transcription/translation with estimated time
 */

class ProgressIndicator {
    constructor() {
        this.container = null;
        this.progressBar = null;
        this.statusText = null;
        this.timeText = null;
        this.startTime = null;
        this.currentStep = 0;
        this.totalSteps = 0;
        this.steps = [];
        this.isVisible = false;
    }

    /**
     * Initialize the progress indicator UI
     */
    init() {
        // Create container
        this.container = document.createElement('div');
        this.container.id = 'buttercup-progress';
        this.container.style.cssText = `
            position: fixed;
            bottom: 80px;
            right: 20px;
            width: 350px;
            background: rgba(0, 0, 0, 0.95);
            border-radius: 12px;
            padding: 20px;
            z-index: 10000;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            font-family: 'Roboto', Arial, sans-serif;
            display: none;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            transition: all 0.3s ease;
        `;

        // Create header
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            align-items: center;
            margin-bottom: 15px;
        `;

        const icon = document.createElement('div');
        icon.innerHTML = '🎙️';
        icon.style.cssText = `
            font-size: 24px;
            margin-right: 10px;
        `;

        const title = document.createElement('div');
        title.textContent = 'Buttercup';
        title.style.cssText = `
            color: #fff;
            font-size: 16px;
            font-weight: 600;
            flex: 1;
        `;

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: #fff;
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            width: 24px;
            height: 24px;
            line-height: 20px;
            opacity: 0.6;
            transition: opacity 0.2s;
        `;
        closeBtn.onmouseover = () => closeBtn.style.opacity = '1';
        closeBtn.onmouseout = () => closeBtn.style.opacity = '0.6';
        closeBtn.onclick = () => this.hide();

        header.appendChild(icon);
        header.appendChild(title);
        header.appendChild(closeBtn);

        // Create status text
        this.statusText = document.createElement('div');
        this.statusText.style.cssText = `
            color: #fff;
            font-size: 14px;
            margin-bottom: 10px;
            opacity: 0.9;
        `;
        this.statusText.textContent = 'Initializing...';

        // Create progress bar container
        const progressContainer = document.createElement('div');
        progressContainer.style.cssText = `
            width: 100%;
            height: 8px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 10px;
        `;

        // Create progress bar
        this.progressBar = document.createElement('div');
        this.progressBar.style.cssText = `
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, #4CAF50, #8BC34A);
            border-radius: 4px;
            transition: width 0.3s ease;
            box-shadow: 0 0 10px rgba(76, 175, 80, 0.5);
        `;

        progressContainer.appendChild(this.progressBar);

        // Create percentage and time container
        const infoContainer = document.createElement('div');
        infoContainer.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;

        this.percentageText = document.createElement('div');
        this.percentageText.style.cssText = `
            color: #4CAF50;
            font-size: 14px;
            font-weight: 600;
        `;
        this.percentageText.textContent = '0%';

        this.timeText = document.createElement('div');
        this.timeText.style.cssText = `
            color: rgba(255, 255, 255, 0.7);
            font-size: 12px;
        `;
        this.timeText.textContent = 'Estimating...';

        infoContainer.appendChild(this.percentageText);
        infoContainer.appendChild(this.timeText);

        // Create steps list
        this.stepsContainer = document.createElement('div');
        this.stepsContainer.style.cssText = `
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
        `;

        // Assemble
        this.container.appendChild(header);
        this.container.appendChild(this.statusText);
        this.container.appendChild(progressContainer);
        this.container.appendChild(infoContainer);
        this.container.appendChild(this.stepsContainer);

        document.body.appendChild(this.container);
        this.isVisible = false;
    }

    /**
     * Start progress tracking
     * @param {Array<string>} steps - Array of step names
     */
    start(steps) {
        if (!this.container) {
            this.init();
        }

        this.steps = steps;
        this.totalSteps = steps.length;
        this.currentStep = 0;
        this.startTime = Date.now();

        // Render steps
        this.stepsContainer.innerHTML = '';
        steps.forEach((step, index) => {
            const stepEl = document.createElement('div');
            stepEl.id = `buttercup-step-${index}`;
            stepEl.style.cssText = `
                display: flex;
                align-items: center;
                margin-bottom: 8px;
                font-size: 13px;
                color: rgba(255, 255, 255, 0.5);
            `;

            const icon = document.createElement('span');
            icon.style.cssText = `
                margin-right: 8px;
                font-size: 16px;
            `;
            icon.innerHTML = '[P]';

            const text = document.createElement('span');
            text.textContent = step;

            stepEl.appendChild(icon);
            stepEl.appendChild(text);
            this.stepsContainer.appendChild(stepEl);
        });

        this.show();
        this.updateProgress(0);
    }

    /**
     * Update progress
     * @param {number} percentage - Progress percentage (0-100)
     * @param {string} status - Status message (optional)
     */
    updateProgress(percentage, status = null) {
        if (!this.container) return;

        // Update progress bar
        this.progressBar.style.width = `${percentage}%`;
        this.percentageText.textContent = `${Math.round(percentage)}%`;

        // Update status
        if (status) {
            this.statusText.textContent = status;
        }

        // Calculate estimated time
        if (percentage > 0 && this.startTime) {
            const elapsed = Date.now() - this.startTime;
            const estimatedTotal = (elapsed / percentage) * 100;
            const remaining = estimatedTotal - elapsed;

            if (remaining > 0) {
                const seconds = Math.ceil(remaining / 1000);
                if (seconds < 60) {
                    this.timeText.textContent = `~${seconds}s remaining`;
                } else {
                    const minutes = Math.floor(seconds / 60);
                    const secs = seconds % 60;
                    this.timeText.textContent = `~${minutes}m ${secs}s remaining`;
                }
            } else {
                this.timeText.textContent = 'Almost done...';
            }
        }
    }

    /**
     * Mark a step as complete
     * @param {number} stepIndex - Index of the step
     */
    completeStep(stepIndex) {
        const stepEl = document.getElementById(`buttercup-step-${stepIndex}`);
        if (stepEl) {
            const icon = stepEl.querySelector('span');
            icon.innerHTML = '[C]';
            stepEl.style.color = '#4CAF50';
        }

        this.currentStep = stepIndex + 1;
        const percentage = ((this.currentStep) / this.totalSteps) * 100;
        this.updateProgress(percentage);
    }

    /**
     * Mark a step as in progress
     * @param {number} stepIndex - Index of the step
     * @param {string} status - Status message
     */
    setStepInProgress(stepIndex, status = null) {
        // Mark previous steps as complete
        for (let i = 0; i < stepIndex; i++) {
            this.completeStep(i);
        }

        // Mark current step as in progress
        const stepEl = document.getElementById(`buttercup-step-${stepIndex}`);
        if (stepEl) {
            const icon = stepEl.querySelector('span');
            icon.innerHTML = '[R]';
            stepEl.style.color = '#2196F3';

            // Spin animation
            icon.style.animation = 'spin 1s linear infinite';
            if (!document.getElementById('buttercup-spin-keyframes')) {
                const style = document.createElement('style');
                style.id = 'buttercup-spin-keyframes';
                style.textContent = `
                    @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                `;
                document.head.appendChild(style);
            }
        }

        if (status) {
            this.statusText.textContent = status;
        }
    }

    /**
     * Mark a step as failed
     * @param {number} stepIndex - Index of the step
     * @param {string} error - Error message
     */
    failStep(stepIndex, error) {
        const stepEl = document.getElementById(`buttercup-step-${stepIndex}`);
        if (stepEl) {
            const icon = stepEl.querySelector('span');
            icon.innerHTML = '[F]';
            icon.style.animation = 'none';
            stepEl.style.color = '#f44336';
        }

        this.statusText.textContent = `Error: ${error}`;
        this.statusText.style.color = '#f44336';
        this.progressBar.style.background = 'linear-gradient(90deg, #f44336, #e57373)';
        this.timeText.textContent = 'Failed';
    }

    /**
     * Complete all steps
     */
    complete() {
        for (let i = 0; i < this.totalSteps; i++) {
            this.completeStep(i);
        }

        this.updateProgress(100, 'Complete!');
        this.statusText.style.color = '#4CAF50';
        this.timeText.textContent = this.getElapsedTime();

        // Auto-hide after 3 seconds
        setTimeout(() => {
            this.hide();
        }, 3000);
    }

    /**
     * Get elapsed time string
     */
    getElapsedTime() {
        if (!this.startTime) return '';
        const elapsed = Date.now() - this.startTime;
        const seconds = Math.floor(elapsed / 1000);
        if (seconds < 60) {
            return `Completed in ${seconds}s`;
        } else {
            const minutes = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `Completed in ${minutes}m ${secs}s`;
        }
    }

    /**
     * Show the progress indicator
     */
    show() {
        if (this.container) {
            this.container.style.display = 'block';
            this.isVisible = true;
            // Fade in animation
            setTimeout(() => {
                this.container.style.opacity = '1';
            }, 10);
        }
    }

    /**
     * Hide the progress indicator
     */
    hide() {
        if (this.container) {
            this.container.style.opacity = '0';
            setTimeout(() => {
                this.container.style.display = 'none';
                this.isVisible = false;
            }, 300);
        }
    }

    /**
     * Reset the progress indicator
     */
    reset() {
        this.currentStep = 0;
        this.startTime = null;
        this.steps = [];
        this.totalSteps = 0;
        if (this.stepsContainer) {
            this.stepsContainer.innerHTML = '';
        }
        if (this.progressBar) {
            this.progressBar.style.width = '0%';
            this.progressBar.style.background = 'linear-gradient(90deg, #4CAF50, #8BC34A)';
        }
        if (this.statusText) {
            this.statusText.style.color = '#fff';
        }
        this.hide();
    }
}

// Export globally
window.ProgressIndicator = ProgressIndicator;
