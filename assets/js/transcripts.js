/**
 * Transcripts Overview Page - Full Featured Dashboard
 * Features: Filters, Bulk Actions, Folders, Tags, Favorites, Duration tracking
 */

console.log('[Transcripts] Script loaded - VERSION 2.0 WITH CHECKBOXES');
console.log('[Transcripts] Checkbox feature enabled!');

let allTranscripts = {};
let transcriptMeta = {}; // folders, tags, favorites
let selectedIds = new Set();
let allFolders = new Set(); // List of all folder names
let filters = {
    source: 'all',
    summary: 'all',
    sort: 'newest',
    searchMode: 'title',
    searchQuery: '',
    folder: 'all', // all, or folder name
    favorites: false // filter favorites only
};

// Load everything on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Transcripts] DOMContentLoaded');
    loadData();
    setupFilterListeners();
    setupBulkActions();
    setupDarkMode();
    setupFolderManagement();

    document.getElementById('go-back-btn')?.addEventListener('click', () => window.close());
});

function setupDarkMode() {
    const toggleBtn = document.getElementById('toggle-dark-mode');
    const html = document.documentElement;

    chrome.storage.local.get(['transcript_dark_mode'], (result) => {
        if (result.transcript_dark_mode) {
            html.setAttribute('data-theme', 'dark');
        }
    });

    toggleBtn.addEventListener('click', () => {
        const isDark = html.getAttribute('data-theme') === 'dark';
        html.setAttribute('data-theme', isDark ? 'cupcake' : 'dark');
        chrome.storage.local.set({ transcript_dark_mode: !isDark });
    });
}

function setupFilterListeners() {
    // Source filter
    document.querySelectorAll('[data-filter-source]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-filter-source]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filters.source = btn.dataset.filterSource;
            displayTranscripts();
        });
    });

    // Favorites filter
    document.querySelectorAll('[data-filter-favorites]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-filter-favorites]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filters.favorites = btn.dataset.filterFavorites === 'favorites';
            displayTranscripts();
        });
    });

    // Summary filter
    document.querySelectorAll('[data-filter-summary]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-filter-summary]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filters.summary = btn.dataset.filterSummary;
            displayTranscripts();
        });
    });

    // Search mode
    document.querySelectorAll('[data-search-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-search-mode]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filters.searchMode = btn.dataset.searchMode;
            if (filters.searchQuery) displayTranscripts();
        });
    });

    // Search input
    document.getElementById('search-input').addEventListener('input', (e) => {
        filters.searchQuery = e.target.value.toLowerCase();
        displayTranscripts();
    });

    // Sort
    document.getElementById('sort-select').addEventListener('change', (e) => {
        filters.sort = e.target.value;
        displayTranscripts();
    });

    // Folder filter
    document.getElementById('folder-filter').addEventListener('change', (e) => {
        filters.folder = e.target.value;
        displayTranscripts();
    });
}

function setupBulkActions() {
    document.getElementById('select-all-btn').addEventListener('click', () => {
        const filtered = getFilteredTranscripts();
        filtered.forEach(([id]) => selectedIds.add(id));
        displayTranscripts();
        updateBulkToolbar();
    });

    document.getElementById('deselect-all-btn').addEventListener('click', () => {
        selectedIds.clear();
        displayTranscripts();
        updateBulkToolbar();
    });

    document.getElementById('bulk-delete-btn').addEventListener('click', bulkDelete);
    document.getElementById('bulk-export-btn').addEventListener('click', bulkExportZIP);
}

function loadData() {
    chrome.storage.local.get(['buttercup_transcripts', 'buttercup_transcript_meta'], (result) => {
        allTranscripts = result.buttercup_transcripts || {};
        transcriptMeta = result.buttercup_transcript_meta || {
            folders: {}, // videoId: folderName
            tags: {},    // videoId: [tag1, tag2]
            favorites: {}, // videoId: true
            folderList: [] // List of all folder names
        };

        // Extract all unique folder names from saved list
        allFolders = new Set(transcriptMeta.folderList || []);

        console.log('[Transcripts] Loaded', Object.keys(allTranscripts).length, 'transcripts');
        updateFolderDropdowns();
        displayTranscripts();
        updateStats();
    });
}

function saveMeta() {
    // Save folderList to ensure folders persist
    transcriptMeta.folderList = Array.from(allFolders);
    chrome.storage.local.set({ buttercup_transcript_meta: transcriptMeta });
}

function setupFolderManagement() {
    // Manage folders button
    document.getElementById('manage-folders-btn').addEventListener('click', () => {
        showFolderModal();
    });

    // Create folder button
    document.getElementById('create-folder-btn').addEventListener('click', () => {
        const input = document.getElementById('new-folder-input');
        const folderName = input.value.trim();
        if (folderName) {
            createFolder(folderName);
            input.value = '';
        }
    });

    // Close folder modal button
    document.getElementById('close-folder-modal-btn').addEventListener('click', () => {
        const modal = document.getElementById('folder-modal');
        modal.close();
    });

    // Enter key in folder input
    document.getElementById('new-folder-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('create-folder-btn').click();
        }
    });

    // Event delegation for delete folder buttons
    document.getElementById('folders-list').addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-folder-btn')) {
            const folderName = e.target.getAttribute('data-folder');
            if (folderName) {
                deleteFolder(folderName);
            }
        }
    });
}

function showFolderModal() {
    const modal = document.getElementById('folder-modal');
    updateFoldersList();
    modal.showModal();
}

function createFolder(folderName) {
    if (allFolders.has(folderName)) {
        showNotification('Folder already exists!');
        return;
    }

    allFolders.add(folderName);
    saveMeta(); // Save to storage
    updateFolderDropdowns();
    updateFoldersList();
    displayTranscripts(); // Refresh transcript cards to show new folder in dropdowns
    showNotification(`Folder "${folderName}" created!`);
}

function deleteFolder(folderName) {
    if (!confirm(`Delete folder "${folderName}"?\n\nTranscripts will not be deleted, only removed from this folder.`)) {
        return;
    }

    // Remove folder from all transcripts
    Object.keys(transcriptMeta.folders || {}).forEach(videoId => {
        if (transcriptMeta.folders[videoId] === folderName) {
            delete transcriptMeta.folders[videoId];
        }
    });

    allFolders.delete(folderName);
    saveMeta();
    updateFolderDropdowns();
    updateFoldersList();
    displayTranscripts();
    showNotification(`Folder "${folderName}" deleted!`);
}

function updateFolderDropdowns() {
    // Update main filter dropdown
    const filterSelect = document.getElementById('folder-filter');
    const currentValue = filterSelect.value;

    filterSelect.innerHTML = `
        <option value="all">All Folders</option>
        <option value="none">No Folder</option>
        ${Array.from(allFolders).sort().map(folder =>
            `<option value="${escapeHtml(folder)}">${escapeHtml(folder)}</option>`
        ).join('')}
    `;

    filterSelect.value = currentValue;
}

function updateFoldersList() {
    const list = document.getElementById('folders-list');

    if (allFolders.size === 0) {
        list.innerHTML = '<div class="text-center text-sm opacity-50 py-4">No folders yet</div>';
        return;
    }

    list.innerHTML = Array.from(allFolders).sort().map(folder => {
        const count = Object.values(transcriptMeta.folders || {}).filter(f => f === folder).length;
        return `
            <div class="flex justify-between items-center p-2 rounded" style="background: var(--card-bg)">
                <div>
                    <span class="font-semibold">${escapeHtml(folder)}</span>
                    <span class="text-xs opacity-70 ml-2">(${count} transcript${count !== 1 ? 's' : ''})</span>
                </div>
                <button class="btn btn-xs btn-error btn-outline delete-folder-btn" data-folder="${escapeHtml(folder)}">Delete</button>
            </div>
        `;
    }).join('');
}

// Make deleteFolder available globally for onclick
window.deleteFolder = deleteFolder;

function assignToFolder(videoId, folderName) {
    if (!transcriptMeta.folders) transcriptMeta.folders = {};

    if (folderName === 'none') {
        delete transcriptMeta.folders[videoId];
    } else {
        transcriptMeta.folders[videoId] = folderName;
    }

    saveMeta();
    displayTranscripts();
}

function calculateDuration(transcript) {
    // Try to calculate from captionData events first
    if (transcript.captionData && transcript.captionData.events) {
        const events = transcript.captionData.events;
        if (events.length > 0) {
            const lastEvent = events[events.length - 1];
            const duration = (lastEvent.tStartMs + lastEvent.dDurationMs) / 1000;
            if (duration > 0) return duration; // seconds
        }
    }

    // Fallback: Parse SRT data to get last timestamp
    if (transcript.srtData) {
        return parseDurationFromSRT(transcript.srtData);
    }

    return 0;
}

function parseDurationFromSRT(srtData) {
    // Parse SRT format to find the last timestamp
    // SRT format: 00:00:10,500 --> 00:00:13,000
    const timePattern = /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/g;
    let lastEndTime = 0;

    let match;
    while ((match = timePattern.exec(srtData)) !== null) {
        // Extract end time (second timestamp)
        const hours = parseInt(match[5]);
        const minutes = parseInt(match[6]);
        const seconds = parseInt(match[7]);
        const milliseconds = parseInt(match[8]);

        const totalSeconds = hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
        if (totalSeconds > lastEndTime) {
            lastEndTime = totalSeconds;
        }
    }

    return lastEndTime;
}

function formatDuration(seconds) {
    if (seconds < 60) {
        // For videos under 1 minute, show seconds
        return `${Math.floor(seconds)}s`;
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

function updateStats() {
    const transcriptArray = Object.values(allTranscripts);
    const totalCount = transcriptArray.length;
    const uploadCount = transcriptArray.filter(t => t.source === 'local_upload').length;
    const webVideoCount = totalCount - uploadCount;
    const withSummaryCount = transcriptArray.filter(t => t.summary).length;

    // Calculate total duration
    const totalSeconds = transcriptArray.reduce((sum, t) => sum + calculateDuration(t), 0);

    document.getElementById('total-count').textContent = totalCount;
    document.getElementById('upload-count').textContent = uploadCount;
    document.getElementById('video-count').textContent = webVideoCount;
    document.getElementById('summary-count').textContent = withSummaryCount;
    document.getElementById('total-duration').textContent = formatDuration(totalSeconds);
}

function getFilteredTranscripts() {
    let transcriptArray = Object.entries(allTranscripts);

    // Apply filters
    transcriptArray = transcriptArray.filter(([videoId, transcript]) => {
        // Source filter
        if (filters.source === 'upload' && transcript.source !== 'local_upload') return false;
        if (filters.source === 'batch' && transcript.source !== 'batch') return false;
        if (filters.source === 'web' && (transcript.source === 'local_upload' || transcript.source === 'batch')) return false;

        // Summary filter
        if (filters.summary === 'with' && !transcript.summary) return false;
        if (filters.summary === 'without' && transcript.summary) return false;

        // Favorites filter
        if (filters.favorites && !transcriptMeta.favorites[videoId]) return false;

        // Folder filter
        if (filters.folder !== 'all') {
            if (filters.folder === 'none') {
                // Show only transcripts without a folder
                if (transcriptMeta.folders[videoId]) return false;
            } else {
                // Show only transcripts in specific folder
                if (transcriptMeta.folders[videoId] !== filters.folder) return false;
            }
        }

        // Search filter
        if (filters.searchQuery) {
            if (filters.searchMode === 'title') {
                const title = (transcript.videoTitle || transcript.fileName || '').toLowerCase();
                const tags = (transcriptMeta.tags[videoId] || []).map(t => t.toLowerCase());
                // Extract domain from URL for search
                let domain = '';
                if (transcript.videoUrl) {
                    try {
                        const url = new URL(transcript.videoUrl);
                        domain = url.hostname.replace('www.', '').toLowerCase();
                    } catch (e) {
                        domain = '';
                    }
                }
                // Search in title, tags, and domain
                const matchesTitle = title.includes(filters.searchQuery);
                const matchesTags = tags.some(tag => tag.includes(filters.searchQuery));
                const matchesDomain = domain.includes(filters.searchQuery);
                if (!matchesTitle && !matchesTags && !matchesDomain) return false;
            } else if (filters.searchMode === 'content') {
                const content = (transcript.srtData || '').toLowerCase();
                if (!content.includes(filters.searchQuery)) return false;
            }
        }

        return true;
    });

    // Apply sorting
    const sorted = [...transcriptArray];
    switch (filters.sort) {
        case 'newest':
            sorted.sort((a, b) => b[1].timestamp - a[1].timestamp);
            break;
        case 'oldest':
            sorted.sort((a, b) => a[1].timestamp - b[1].timestamp);
            break;
        case 'title':
            sorted.sort((a, b) => {
                const titleA = (a[1].videoTitle || a[1].fileName || '').toLowerCase();
                const titleB = (b[1].videoTitle || b[1].fileName || '').toLowerCase();
                return titleA.localeCompare(titleB);
            });
            break;
        case 'longest':
            sorted.sort((a, b) => calculateDuration(b[1]) - calculateDuration(a[1]));
            break;
        case 'shortest':
            sorted.sort((a, b) => calculateDuration(a[1]) - calculateDuration(b[1]));
            break;
    }

    return sorted;
}

function getYouTubeThumbnail(videoUrl, videoId) {
    if (!videoUrl) return null;

    // YouTube
    if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
        let ytId = videoId;
        const match = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (match) ytId = match[1];
        return `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;
    }

    // Vimeo - has thumbnail API
    if (videoUrl.includes('vimeo.com')) {
        // Note: Vimeo thumbnails require API call, return placeholder for now
        return null;
    }

    // TikTok, Instagram, Twitter, Facebook - no direct thumbnail URLs
    // Would need to fetch from API or cache during transcription
    return null;
}

function extractMainDomain(hostname) {
    // Remove www. prefix
    const withoutWww = hostname.replace(/^www\./, '');

    // Split by dots
    const parts = withoutWww.split('.');

    // If only 2 parts (e.g., "example.com"), return first part
    if (parts.length <= 2) {
        return parts[0];
    }

    // If 3+ parts, check if it's a known multi-level TLD (e.g., co.uk, com.au)
    const knownTLDs = ['co.uk', 'com.au', 'co.jp', 'co.nz', 'com.br', 'co.za'];
    const lastTwo = parts.slice(-2).join('.');

    if (knownTLDs.includes(lastTwo)) {
        // For multi-level TLDs, return the part before the TLD
        // e.g., "example.co.uk" -> "example"
        return parts[parts.length - 3] || parts[0];
    }

    // For regular domains with subdomains (e.g., "de.example.com" or "video.example.com")
    // Return the second-to-last part (the main domain name)
    return parts[parts.length - 2];
}

function getPlatform(videoUrl, source) {
    if (source === 'local_upload') return 'Upload';
    if (!videoUrl) return 'Unknown';

    if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) return 'YouTube';
    if (videoUrl.includes('tiktok.com')) return 'TikTok';
    if (videoUrl.includes('vimeo.com')) return 'Vimeo';
    if (videoUrl.includes('twitter.com') || videoUrl.includes('x.com')) return 'Twitter';
    if (videoUrl.includes('facebook.com')) return 'Facebook';
    if (videoUrl.includes('instagram.com')) return 'Instagram';
    if (videoUrl.includes('dailymotion.com')) return 'Dailymotion';

    // Extract main domain name as fallback
    try {
        const url = new URL(videoUrl);
        const mainDomain = extractMainDomain(url.hostname);
        return mainDomain.charAt(0).toUpperCase() + mainDomain.slice(1);
    } catch {
        return 'Web Video';
    }
}

function getPlatformEmoji(platform) {
    const emojiMap = {
        'YouTube': '▶️',
        'TikTok': '🎵',
        'Instagram': '📷',
        'Twitter': '🐦',
        'Facebook': '📘',
        'Vimeo': '🎬',
        'Dailymotion': '🎥',
        'Upload': '📁',
        'Unknown': '❓'
    };
    return emojiMap[platform] || '🎞️';
}

function getPlatformStyle(platform) {
    const styleMap = {
        'YouTube': 'background: linear-gradient(135deg, #ff0000, #cc0000); color: white;',
        'TikTok': 'background: linear-gradient(135deg, #00f2ea, #ff0050); color: white;',
        'Instagram': 'background: linear-gradient(135deg, #f58529, #dd2a7b, #8134af); color: white;',
        'Twitter': 'background: linear-gradient(135deg, #1da1f2, #0d8bd9); color: white;',
        'Facebook': 'background: linear-gradient(135deg, #4267B2, #365899); color: white;',
        'Vimeo': 'background: linear-gradient(135deg, #1ab7ea, #0088cc); color: white;',
        'Dailymotion': 'background: linear-gradient(135deg, #0066dc, #0052b0); color: white;',
        'Upload': 'background: linear-gradient(135deg, #667eea, #764ba2); color: white;',
        'Unknown': 'background: linear-gradient(135deg, #6b7280, #4b5563); color: white;'
    };
    return styleMap[platform] || 'background: linear-gradient(135deg, #9ca3af, #6b7280); color: white;';
}

function displayTranscripts() {
    const container = document.getElementById('transcripts-container');
    const emptyState = document.getElementById('empty-state');

    const filtered = getFilteredTranscripts();

    if (filtered.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    container.innerHTML = filtered.map(([videoId, transcript]) => {
        const date = new Date(transcript.timestamp);
        const hasSummary = !!transcript.summary;
        const isUpload = transcript.source === 'local_upload';
        const platform = getPlatform(transcript.videoUrl, transcript.source);
        const thumbnailUrl = getYouTubeThumbnail(transcript.videoUrl, videoId);
        const duration = calculateDuration(transcript);
        const isFavorite = transcriptMeta.favorites[videoId];
        const isSelected = selectedIds.has(videoId);
        const tags = transcriptMeta.tags[videoId] || [];

        return `
            <div class="transcript-card ${isSelected ? 'ring-2 ring-primary' : ''}" data-video-id="${videoId}">
                <div class="flex gap-3">
                    <!-- Checkbox -->
                    <div class="flex-shrink-0 flex items-start pt-1">
                        <input type="checkbox" class="checkbox checkbox-sm"
                               ${isSelected ? 'checked' : ''}
                               data-video-id="${videoId}"
                               data-action="toggleSelection" />
                    </div>

                    <!-- Thumbnail -->
                    <div class="flex-shrink-0">
                        ${thumbnailUrl ? `
                            <img src="${thumbnailUrl}" alt="Thumbnail" class="thumbnail" />
                        ` : `
                            <div class="thumbnail-placeholder" style="${getPlatformStyle(platform)}">
                                <div style="text-align: center; font-size: 0.7rem; font-weight: bold;">
                                    ${getPlatformEmoji(platform)}<br>
                                    ${platform}
                                </div>
                            </div>
                        `}
                    </div>

                    <!-- Content -->
                    <div class="flex-1 min-w-0">
                        <!-- Header -->
                        <div class="flex justify-between items-start mb-2">
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2 mb-1">
                                    <h3 class="text-lg font-bold truncate flex-1">${escapeHtml(transcript.videoTitle || transcript.fileName || 'Unknown')}</h3>
                                    ${isFavorite ? '<span class="text-warning text-xl">★</span>' : ''}
                                </div>
                                <div class="flex gap-2 items-center text-xs flex-wrap" style="color: var(--text-secondary)">
                                    <span class="badge badge-sm ${isUpload ? 'badge-info' : 'badge-primary'}">${escapeHtml(platform)}</span>
                                    <span>${date.toLocaleDateString()}</span>
                                    ${duration > 0 ? `<span class="badge badge-sm badge-outline">${formatDuration(duration)}</span>` : ''}
                                    ${hasSummary ? '<span class="badge badge-sm badge-success">Summary</span>' : ''}
                                    ${tags.map(tag => `<span class="badge badge-xs badge-ghost">${escapeHtml(tag)}</span>`).join('')}
                                </div>
                            </div>
                        </div>

                        <!-- Actions -->
                        <div class="flex gap-1 flex-wrap">
                            <button class="btn btn-xs btn-outline" data-action="toggleFavorite" data-video-id="${videoId}" title="${isFavorite ? 'Unfavorite' : 'Favorite'}">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="${isFavorite ? 'currentColor' : 'none'}" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                </svg>
                            </button>
                            <button class="btn btn-xs btn-outline" data-action="showTags" data-video-id="${videoId}" title="Tags">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                </svg>
                            </button>
                            <select class="select select-bordered select-xs" data-action="assignFolder" data-video-id="${videoId}" title="Assign to folder">
                                <option value="" disabled ${!transcriptMeta.folders[videoId] ? 'selected' : ''}>📁 Folder</option>
                                <option value="none" ${!transcriptMeta.folders[videoId] ? 'selected' : ''}>No Folder</option>
                                ${Array.from(allFolders).sort().map(folder =>
                                    `<option value="${escapeHtml(folder)}" ${transcriptMeta.folders[videoId] === folder ? 'selected' : ''}>${escapeHtml(folder)}</option>`
                                ).join('')}
                            </select>
                            ${!isUpload ? `
                                <button class="btn btn-xs btn-outline" data-action="openVideo" data-video-id="${videoId}">Open</button>
                            ` : ''}
                            <button class="btn btn-xs btn-outline" data-action="downloadSRT" data-video-id="${videoId}">Download</button>
                            ${hasSummary ? `
                                <button class="btn btn-xs btn-primary" data-action="viewSummary" data-video-id="${videoId}">Summary</button>
                                <button class="btn btn-xs btn-outline" data-action="copyAsMarkdown" data-video-id="${videoId}">Copy MD</button>
                                <button class="btn btn-xs btn-outline" data-action="toggleDetails">Details</button>
                            ` : ''}
                            <button class="btn btn-xs btn-error btn-outline" data-action="deleteTranscript" data-video-id="${videoId}">Delete</button>
                        </div>

                        <!-- Summary Details -->
                        ${hasSummary ? createSummaryHTML(transcript.summary) : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    setupEventDelegation();
}

function createSummaryHTML(summary) {
    if (!summary) return '';
    return `
        <div class="summary-content hidden mt-3">
            ${summary.overallSummary ? `
                <div class="mb-3">
                    <h4 class="font-bold text-sm mb-2">Summary</h4>
                    <p class="text-sm whitespace-pre-wrap">${escapeHtml(summary.overallSummary)}</p>
                </div>
            ` : ''}
            ${summary.keyPoints?.length > 0 ? `
                <div class="mb-3">
                    <h4 class="font-bold text-sm mb-2">Key Points</h4>
                    <ul class="list-disc list-inside space-y-1 text-sm">
                        ${summary.keyPoints.map(point => `<li>${escapeHtml(point)}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            ${summary.chapters?.length > 0 ? `
                <div class="mb-3">
                    <h4 class="font-bold text-sm mb-2">Chapters</h4>
                    <div class="space-y-1">
                        ${summary.chapters.map(chapter => `
                            <div class="chapter-item">
                                <div class="font-semibold text-xs text-primary">${chapter.timestamp || '00:00'} - ${escapeHtml(chapter.title)}</div>
                                ${chapter.description ? `<div class="text-xs mt-1" style="color: var(--text-secondary)">${escapeHtml(chapter.description)}</div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            ${summary.tags?.length > 0 ? `
                <div>
                    <h4 class="font-bold text-sm mb-2">Tags</h4>
                    <div class="flex flex-wrap gap-1">
                        ${summary.tags.map(tag => `<span class="badge badge-xs badge-outline">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

function setupEventDelegation() {
    const container = document.getElementById('transcripts-container');
    const newContainer = container.cloneNode(true);
    container.parentNode.replaceChild(newContainer, container);

    // Handle button clicks
    document.getElementById('transcripts-container').addEventListener('click', (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;

        const action = button.dataset.action;
        const videoId = button.dataset.videoId;

        switch (action) {
            case 'openVideo':
                openVideo(videoId);
                break;
            case 'downloadSRT':
                downloadSRT(videoId);
                break;
            case 'deleteTranscript':
                deleteTranscript(videoId);
                break;
            case 'viewSummary':
                viewSummary(videoId);
                break;
            case 'copyAsMarkdown':
                copyAsMarkdown(videoId);
                break;
            case 'toggleDetails':
                toggleDetails(button);
                break;
            case 'toggleFavorite':
                toggleFavorite(videoId);
                break;
            case 'showTags':
                showTagsModal(videoId);
                break;
        }
    });

    // Handle folder select changes and checkbox toggles
    document.getElementById('transcripts-container').addEventListener('change', (event) => {
        const element = event.target.closest('[data-action]');
        if (!element) return;

        const action = element.dataset.action;
        const videoId = element.dataset.videoId;

        if (action === 'assignFolder') {
            assignToFolder(videoId, element.value);
        } else if (action === 'toggleSelection') {
            toggleSelection(videoId);
        }
    });
}

function toggleSelection(videoId) {
    console.log('[Transcripts] Toggle selection for:', videoId);
    if (selectedIds.has(videoId)) {
        selectedIds.delete(videoId);
        console.log('[Transcripts] Deselected. Total selected:', selectedIds.size);
    } else {
        selectedIds.add(videoId);
        console.log('[Transcripts] Selected. Total selected:', selectedIds.size);
    }
    displayTranscripts();
    updateBulkToolbar();
}

function toggleFavorite(videoId) {
    if (!transcriptMeta.favorites) transcriptMeta.favorites = {};
    transcriptMeta.favorites[videoId] = !transcriptMeta.favorites[videoId];
    saveMeta();
    displayTranscripts();
}

function showTagsModal(videoId) {
    const currentTags = transcriptMeta.tags[videoId] || [];
    const newTags = prompt('Enter tags (comma separated):', currentTags.join(', '));
    if (newTags !== null) {
        if (!transcriptMeta.tags) transcriptMeta.tags = {};
        transcriptMeta.tags[videoId] = newTags.split(',').map(t => t.trim()).filter(t => t);
        saveMeta();
        displayTranscripts();
    }
}

function updateBulkToolbar() {
    const toolbar = document.getElementById('bulk-toolbar');
    const count = selectedIds.size;

    if (count > 0) {
        toolbar.classList.remove('hidden');
        document.getElementById('selection-count').textContent = `${count} selected`;
    } else {
        toolbar.classList.add('hidden');
    }
}

function bulkDelete() {
    if (!confirm(`Delete ${selectedIds.size} transcripts?\n\nThis cannot be undone.`)) return;

    selectedIds.forEach(id => delete allTranscripts[id]);

    chrome.storage.local.set({ buttercup_transcripts: allTranscripts }, () => {
        selectedIds.clear();
        loadData();
        showNotification('Deleted successfully!');
    });
}

async function bulkExportZIP() {
    // Note: Browser extensions can't create ZIP files natively without libraries
    // Simplified: Download each SRT separately
    const count = selectedIds.size;

    if (!confirm(`Download ${count} SRT files?`)) return;

    selectedIds.forEach(videoId => {
        const transcript = allTranscripts[videoId];
        if (transcript && transcript.srtData) {
            const blob = new Blob([transcript.srtData], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${transcript.videoTitle || transcript.fileName || videoId}.srt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    });

    showNotification(`Downloading ${count} files...`);
}

function toggleDetails(button) {
    const summaryDiv = button.closest('.transcript-card').querySelector('.summary-content');
    if (summaryDiv) {
        summaryDiv.classList.toggle('hidden');
        button.textContent = summaryDiv.classList.contains('hidden') ? 'Details' : 'Hide';
    }
}

function openVideo(videoId) {
    const transcript = allTranscripts[videoId];
    if (transcript?.videoUrl) window.open(transcript.videoUrl, '_blank');
}

function viewSummary(videoId) {
    const transcript = allTranscripts[videoId];
    if (transcript?.videoUrl) window.open(transcript.videoUrl, '_blank');
}

function downloadSRT(videoId) {
    const transcript = allTranscripts[videoId];
    if (!transcript?.srtData) {
        alert('No SRT data available');
        return;
    }

    const blob = new Blob([transcript.srtData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${transcript.videoTitle || transcript.fileName || videoId}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function deleteTranscript(videoId) {
    if (!confirm(`Delete "${allTranscripts[videoId]?.videoTitle || videoId}"?\n\nThis cannot be undone.`)) return;

    delete allTranscripts[videoId];
    chrome.storage.local.set({ buttercup_transcripts: allTranscripts }, () => {
        loadData();
    });
}

function copyAsMarkdown(videoId) {
    const transcript = allTranscripts[videoId];
    if (!transcript?.summary) return;

    const summary = transcript.summary;
    let markdown = `# ${transcript.videoTitle || transcript.fileName || 'Transcript'}\n\n`;

    if (summary.overallSummary) markdown += `## Summary\n\n${summary.overallSummary}\n\n`;
    if (summary.keyPoints?.length > 0) {
        markdown += `## Key Points\n\n`;
        summary.keyPoints.forEach(point => markdown += `- ${point}\n`);
        markdown += '\n';
    }
    if (summary.chapters?.length > 0) {
        markdown += `## Chapters\n\n`;
        summary.chapters.forEach(chapter => {
            markdown += `### ${chapter.timestamp || '00:00'} - ${chapter.title}\n`;
            if (chapter.description) markdown += `${chapter.description}\n`;
            markdown += '\n';
        });
    }
    if (summary.tags?.length > 0) {
        markdown += `## Tags\n\n${summary.tags.map(tag => `\`${tag}\``).join(' ')}\n`;
    }

    navigator.clipboard.writeText(markdown).then(() => {
        showNotification('Copied as Markdown!');
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-success text-white px-4 py-2 rounded-lg shadow-lg z-50';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s';
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

console.log('[Transcripts] Ready.');
