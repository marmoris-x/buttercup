/**
 * Groq API Key Manager
 * Handles dynamic addition/removal of multiple Groq API keys
 */

class GroqKeyManager {
    constructor() {
        this.keys = [];
        this.container = document.getElementById('groq-keys-container');
        this.addButton = document.getElementById('add-groq-key');
        this.autoRotate = document.getElementById('groq-auto-rotate');
        this.smartSelection = document.getElementById('groq-smart-selection');

        this.init();
    }

    async init() {
        // Load saved keys
        await this.loadKeys();

        // Render keys
        this.renderKeys();

        // Setup event listeners
        this.addButton.addEventListener('click', () => this.addKey());
    }

    async loadKeys() {
        const result = await chrome.storage.sync.get(['buttercup_groq_keys', 'buttercup_groq_api_key', 'buttercup_groq_auto_rotate', 'buttercup_groq_smart_selection']);

        // Load keys array (new format)
        if (result.buttercup_groq_keys && result.buttercup_groq_keys.length > 0) {
            this.keys = result.buttercup_groq_keys;
        }
        // Backward compatibility: convert old single/dual key format
        else if (result.buttercup_groq_api_key) {
            this.keys = [result.buttercup_groq_api_key];
            // Also check for old second key
            const result2 = await chrome.storage.sync.get(['buttercup_groq_api_key_2']);
            if (result2.buttercup_groq_api_key_2) {
                this.keys.push(result2.buttercup_groq_api_key_2);
            }
        }
        // Default: add one empty slot
        else {
            this.keys = [''];
        }

        // Load settings
        this.autoRotate.checked = result.buttercup_groq_auto_rotate !== false; // Default true
        this.smartSelection.checked = result.buttercup_groq_smart_selection !== false; // Default true
    }

    renderKeys() {
        this.container.innerHTML = '';

        this.keys.forEach((key, index) => {
            const keyDiv = document.createElement('div');
            keyDiv.className = 'flex gap-2 items-center';
            keyDiv.innerHTML = `
                <div class="flex-1">
                    <label class="label py-1">
                        <span class="label-text text-xs">Key ${index + 1}${index === 0 ? ' (Primary)' : ''}</span>
                        <span class="label-text-alt text-xs">${this.getKeyStatus(key)}</span>
                    </label>
                    <input type="password"
                           placeholder="gsk_..."
                           class="input input-bordered input-sm w-full"
                           data-key-index="${index}"
                           value="${key}" />
                </div>
                ${index > 0 ? `
                    <button class="btn btn-sm btn-ghost btn-circle mt-6" data-remove-index="${index}" title="Remove key">
                        ✕
                    </button>
                ` : ''}
            `;

            this.container.appendChild(keyDiv);
        });

        // Add event listeners for key inputs
        this.container.querySelectorAll('input[data-key-index]').forEach(input => {
            input.addEventListener('input', (e) => {
                const index = parseInt(e.target.dataset.keyIndex);
                this.keys[index] = e.target.value;
            });
        });

        // Add event listeners for remove buttons
        this.container.querySelectorAll('button[data-remove-index]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.removeIndex);
                this.removeKey(index);
            });
        });

        // Update add button state
        const validKeys = this.keys.filter(k => k && k.startsWith('gsk_')).length;
        this.addButton.disabled = this.keys.length >= 5; // Max 5 keys

        if (this.keys.length >= 5) {
            this.addButton.textContent = '✓ Maximum 5 keys reached';
        } else {
            this.addButton.textContent = '+ Add Another Key';
        }
    }

    getKeyStatus(key) {
        if (!key) return '';
        if (key.startsWith('gsk_')) return '✓';
        return '⚠️';
    }

    addKey() {
        if (this.keys.length >= 5) {
            alert('Maximum 5 keys allowed');
            return;
        }

        this.keys.push('');
        this.renderKeys();
    }

    removeKey(index) {
        if (index === 0) {
            alert('Cannot remove primary key');
            return;
        }

        if (confirm(`Remove Key ${index + 1}?`)) {
            this.keys.splice(index, 1);
            this.renderKeys();
        }
    }

    getKeys() {
        // Filter out empty keys
        return this.keys.filter(k => k && k.trim().length > 0);
    }

    async save() {
        const validKeys = this.getKeys();

        if (validKeys.length === 0) {
            throw new Error('At least one Groq API key is required');
        }

        // Validate keys format
        for (const key of validKeys) {
            if (!key.startsWith('gsk_')) {
                throw new Error('All Groq API keys must start with "gsk_"');
            }
        }

        await chrome.storage.sync.set({
            buttercup_groq_keys: validKeys,
            buttercup_groq_auto_rotate: this.autoRotate.checked,
            buttercup_groq_smart_selection: this.smartSelection.checked,
            // Backward compatibility
            buttercup_groq_api_key: validKeys[0],
            buttercup_groq_api_key_2: validKeys[1] || ''
        });

        return validKeys;
    }
}

// Initialize when DOM is ready
if (typeof window !== 'undefined') {
    window.GroqKeyManager = GroqKeyManager;
}
