/**
 * Transcripts Overview Page
 * Displays all saved transcripts with summaries
 */

console.log('[Transcripts] Script loaded');

let allTranscripts = {};

// Load all transcripts on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Transcripts] DOMContentLoaded event fired');
    loadTranscripts();

    // Setup "Go Back" button in empty state
    const goBackBtn = document.getElementById('go-back-btn');
    if (goBackBtn) {
        goBackBtn.addEventListener('click', () => {
            window.close();
        });
    }
});

function loadTranscripts() {
    console.log('[Transcripts] Loading transcripts from storage...');
    chrome.storage.local.get(['buttercup_transcripts'], (result) => {
        allTranscripts = result.buttercup_transcripts || {};
        console.log('[Transcripts] Loaded', Object.keys(allTranscripts).length, 'transcripts');
        displayTranscripts();
        updateStats();
    });
}

function updateStats() {
    const transcriptArray = Object.values(allTranscripts);
    const totalCount = transcriptArray.length;
    const withSummaryCount = transcriptArray.filter(t => t.summary).length;

    // Calculate total size
    const jsonString = JSON.stringify(allTranscripts);
    const sizeBytes = new Blob([jsonString]).size;
    const sizeKB = (sizeBytes / 1024).toFixed(2);

    document.getElementById('total-count').textContent = totalCount;
    document.getElementById('with-summary-count').textContent = withSummaryCount;
    document.getElementById('total-size').textContent = `${sizeKB} KB`;
}

function displayTranscripts() {
    const container = document.getElementById('transcripts-container');
    const emptyState = document.getElementById('empty-state');

    const transcriptArray = Object.entries(allTranscripts);

    if (transcriptArray.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    // Sort by timestamp (newest first)
    transcriptArray.sort((a, b) => b[1].timestamp - a[1].timestamp);

    container.innerHTML = transcriptArray.map(([videoId, transcript]) => {
        const date = new Date(transcript.timestamp);
        const hasSummary = !!transcript.summary;

        return `
            <div class="transcript-card" data-video-id="${videoId}">
                <!-- Header -->
                <div class="flex justify-between items-start mb-3">
                    <div class="flex-1">
                        <h3 class="text-xl font-bold mb-1">${escapeHtml(transcript.videoTitle || 'Unknown Video')}</h3>
                        <div class="flex gap-2 items-center text-sm text-gray-600">
                            <span class="badge badge-sm badge-outline">${videoId}</span>
                            <span>•</span>
                            <span>${date.toLocaleDateString()} ${date.toLocaleTimeString()}</span>
                            ${hasSummary ? '<span class="badge badge-sm badge-success">AI Summary</span>' : ''}
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button class="btn btn-sm btn-outline" data-action="openOnYouTube" data-video-id="${videoId}" title="Open on YouTube">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                        </button>
                        <button class="btn btn-sm btn-outline" data-action="downloadSRT" data-video-id="${videoId}" title="Download SRT">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                        </button>
                        <button class="btn btn-sm btn-error btn-outline" data-action="deleteTranscript" data-video-id="${videoId}" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Translation Info -->
                ${transcript.translationSettings?.enabled ? `
                    <div class="mb-3">
                        <span class="badge badge-info badge-sm">
                            Translated to ${transcript.translationSettings.targetLanguage}
                        </span>
                    </div>
                ` : ''}

                <!-- Summary -->
                ${hasSummary ? createSummaryHTML(transcript.summary, videoId) : `
                    <div class="text-sm text-gray-500 italic">No AI summary available</div>
                `}
            </div>
        `;
    }).join('');

    // Setup event delegation after DOM is updated
    setupEventDelegation();
}

function createSummaryHTML(summary, videoId) {
    if (!summary) return '';

    return `
        <div class="mt-3">
            <button class="btn btn-sm btn-primary mb-2" data-action="viewSummaryOnYouTube" data-video-id="${videoId}">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                View AI Summary on YouTube
            </button>
            <button class="btn btn-sm btn-outline mb-2 ml-2" data-action="copyAsMarkdown" data-video-id="${videoId}" title="Copy as Markdown">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy as Markdown
            </button>
            <button class="btn btn-sm btn-error btn-outline mb-2 ml-2" data-action="deleteSummary" data-video-id="${videoId}" title="Delete Summary">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete Summary
            </button>
            <button class="btn btn-sm btn-outline mb-2 ml-2" data-action="toggleDetails">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Show Details
            </button>
            <div class="summary-content hidden">
                <!-- Overall Summary -->
                ${summary.overallSummary ? `
                    <div class="mb-4">
                        <h4 class="font-bold text-lg mb-2">📝 Summary</h4>
                        <p class="text-gray-700 whitespace-pre-wrap">${escapeHtml(summary.overallSummary)}</p>
                    </div>
                ` : ''}

                <!-- Key Points -->
                ${summary.keyPoints && summary.keyPoints.length > 0 ? `
                    <div class="mb-4">
                        <h4 class="font-bold text-lg mb-2">💡 Key Points</h4>
                        <ul class="list-disc list-inside space-y-1">
                            ${summary.keyPoints.map(point => `<li class="text-gray-700">${escapeHtml(point)}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}

                <!-- Chapters -->
                ${summary.chapters && summary.chapters.length > 0 ? `
                    <div class="mb-4">
                        <h4 class="font-bold text-lg mb-2">📑 Chapters</h4>
                        <div class="space-y-2">
                            ${summary.chapters.map(chapter => `
                                <div class="chapter-item">
                                    <div class="flex justify-between items-start">
                                        <div class="flex-1">
                                            <div class="font-semibold text-primary">${chapter.timestamp || '00:00'} - ${escapeHtml(chapter.title)}</div>
                                            ${chapter.description ? `<div class="text-sm text-gray-600 mt-1">${escapeHtml(chapter.description)}</div>` : ''}
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <!-- Tags -->
                ${summary.tags && summary.tags.length > 0 ? `
                    <div>
                        <h4 class="font-bold text-lg mb-2">🏷️ Tags</h4>
                        <div class="flex flex-wrap gap-2">
                            ${summary.tags.map(tag => `<span class="badge badge-outline">${escapeHtml(tag)}</span>`).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// Setup event delegation for button clicks
function setupEventDelegation() {
    console.log('[Transcripts] Setting up event delegation...');

    const container = document.getElementById('transcripts-container');

    // Remove existing listener if any
    const newContainer = container.cloneNode(true);
    container.parentNode.replaceChild(newContainer, container);

    // Add single click listener for all buttons
    document.getElementById('transcripts-container').addEventListener('click', (event) => {
        const button = event.target.closest('button[data-action]');

        if (!button) return;

        const action = button.dataset.action;
        const videoId = button.dataset.videoId;

        console.log('[Transcripts] Button clicked:', action, videoId);

        // Handle different actions
        switch (action) {
            case 'openOnYouTube':
                openOnYouTube(videoId);
                break;
            case 'downloadSRT':
                downloadSRT(videoId);
                break;
            case 'deleteTranscript':
                deleteTranscript(videoId);
                break;
            case 'viewSummaryOnYouTube':
                viewSummaryOnYouTube(videoId);
                break;
            case 'copyAsMarkdown':
                copyAsMarkdown(videoId);
                break;
            case 'deleteSummary':
                deleteSummary(videoId);
                break;
            case 'toggleDetails':
                toggleDetails(button);
                break;
            default:
                console.warn('[Transcripts] Unknown action:', action);
        }
    });

    console.log('[Transcripts] Event delegation setup complete');
}

// Toggle summary details visibility
function toggleDetails(button) {
    const detailsDiv = button.nextElementSibling;
    if (detailsDiv) {
        detailsDiv.classList.toggle('hidden');
    }
}

// Action functions (called by event delegation)
function openOnYouTube(videoId) {
    console.log('[Transcripts] openOnYouTube called for', videoId);
    window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
}

function viewSummaryOnYouTube(videoId) {
    console.log('[Transcripts] viewSummaryOnYouTube called for', videoId);
    const transcript = allTranscripts[videoId];
    if (!transcript || !transcript.summary) {
        alert('No summary available for this video');
        return;
    }

    // Simply open the YouTube video - buttercup.js will auto-load the summary
    // because it's stored in chrome.storage.local
    window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
}

function downloadSRT(videoId) {
    console.log('[Transcripts] downloadSRT called for', videoId);
    const transcript = allTranscripts[videoId];
    if (!transcript || !transcript.srtData) {
        alert('No SRT data available for this transcript');
        return;
    }

    const blob = new Blob([transcript.srtData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${transcript.videoTitle || videoId}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function deleteTranscript(videoId) {
    console.log('[Transcripts] deleteTranscript called for', videoId);
    if (!confirm(`Are you sure you want to delete the transcript for "${allTranscripts[videoId]?.videoTitle || videoId}"?\n\nThis action cannot be undone.`)) {
        return;
    }

    delete allTranscripts[videoId];

    chrome.storage.local.set({ buttercup_transcripts: allTranscripts }, () => {
        displayTranscripts();
        updateStats();

        // Show success message
        const card = document.querySelector(`[data-video-id="${videoId}"]`);
        if (card) {
            card.style.opacity = '0';
            card.style.transform = 'scale(0.95)';
            setTimeout(() => {
                card.remove();
                if (Object.keys(allTranscripts).length === 0) {
                    displayTranscripts(); // Will show empty state
                }
            }, 300);
        }
    });
}

function copyAsMarkdown(videoId) {
    console.log('[Transcripts] copyAsMarkdown called for', videoId);
    const transcript = allTranscripts[videoId];
    if (!transcript || !transcript.summary) {
        alert('No summary available for this video');
        return;
    }

    const summary = transcript.summary;
    const videoTitle = transcript.videoTitle || 'Unknown Video';

    // Build markdown content
    let markdown = `# ${videoTitle}\n\n`;

    // Overall Summary
    if (summary.overallSummary) {
        markdown += `## Summary\n\n${summary.overallSummary}\n\n`;
    }

    // Key Points
    if (summary.keyPoints && summary.keyPoints.length > 0) {
        markdown += `## Key Points\n\n`;
        summary.keyPoints.forEach(point => {
            markdown += `- ${point}\n`;
        });
        markdown += '\n';
    }

    // Chapters
    if (summary.chapters && summary.chapters.length > 0) {
        markdown += `## Chapters\n\n`;
        summary.chapters.forEach(chapter => {
            markdown += `### ${chapter.timestamp || '00:00'} - ${chapter.title}\n`;
            if (chapter.description) {
                markdown += `${chapter.description}\n`;
            }
            markdown += '\n';
        });
    }

    // Tags
    if (summary.tags && summary.tags.length > 0) {
        markdown += `## Tags\n\n`;
        markdown += summary.tags.map(tag => `\`${tag}\``).join(' ') + '\n';
    }

    // Copy to clipboard
    navigator.clipboard.writeText(markdown).then(() => {
        // Show success notification
        const notification = document.createElement('div');
        notification.className = 'fixed top-4 right-4 bg-success text-white px-6 py-3 rounded-lg shadow-lg z-50';
        notification.textContent = '✓ Summary copied as Markdown!';
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.3s';
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard. Please try again.');
    });
}

function deleteSummary(videoId) {
    console.log('[Transcripts] deleteSummary called for', videoId);
    if (!confirm(`Are you sure you want to delete the AI summary for "${allTranscripts[videoId]?.videoTitle || videoId}"?\n\nThe transcript will remain intact.`)) {
        return;
    }

    // Delete only the summary, keep the transcript
    if (allTranscripts[videoId]) {
        delete allTranscripts[videoId].summary;
        delete allTranscripts[videoId].summaryTimestamp;

        chrome.storage.local.set({ buttercup_transcripts: allTranscripts }, () => {
            displayTranscripts();
            updateStats();

            // Show success notification
            const notification = document.createElement('div');
            notification.className = 'fixed top-4 right-4 bg-success text-white px-6 py-3 rounded-lg shadow-lg z-50';
            notification.textContent = '✓ Summary deleted successfully!';
            document.body.appendChild(notification);

            setTimeout(() => {
                notification.style.opacity = '0';
                notification.style.transition = 'opacity 0.3s';
                setTimeout(() => notification.remove(), 300);
            }, 2000);
        });
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

console.log('[Transcripts] All functions defined. Ready.');
