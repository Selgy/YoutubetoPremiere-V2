// YouTube to Premiere Extension - Settings Popup
console.log('YTP Popup: Script loaded');

// Download URLs for application installation
const DOWNLOAD_URLS = {
    windows: 'https://github.com/Selgy/YoutubetoPremiere-V2/releases/latest/download/YouTubetoPremiere-Windows.exe',
    mac: 'https://github.com/Selgy/YoutubetoPremiere-V2/releases/latest/download/YouTubetoPremiere-macOS.pkg',
    github: 'https://github.com/Selgy/YoutubetoPremiere-V2/releases/latest',
    chromeStore: 'https://chromewebstore.google.com/detail/youtube-to-premiere-pro-v/fnhpeiohcfobchjffmgfdeobphhmaibb'
};

// Current extension version
const CURRENT_VERSION = chrome.runtime.getManifest().version;
console.log(`YTP Popup: Extension version ${CURRENT_VERSION}`);

// Get extension version from manifest
function getExtensionVersion() {
    return CURRENT_VERSION;
}

// Compare version strings (semver)
function compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const part1 = parts1[i] || 0;
        const part2 = parts2[i] || 0;
        
        if (part1 > part2) return 1;
        if (part1 < part2) return -1;
    }
    return 0;
}

// Detect operating system
function detectOperatingSystem() {
    const userAgent = navigator.userAgent.toLowerCase();
    
    if (userAgent.includes('mac')) {
        return 'mac';
    } else if (userAgent.includes('win')) {
        return 'windows';
    } else if (userAgent.includes('linux')) {
        return 'linux';
    } else {
        return 'unknown';
    }
}

// Settings keys
const SETTINGS_KEYS = {
    PANEL_VISIBLE: 'ytp-panel-visible',
    PANEL_PINNED: 'ytp-panel-pinned',
    BUTTON_SIZE: 'ytp-button-size',
    AUTO_HIDE: 'ytp-auto-hide',
    CONTAINER_POSITION: 'ytp-container-position',
    BUTTONS_VISIBLE: 'ytp-buttons-visible'
};

// Size labels
const SIZE_LABELS = ['Normal', 'Compact', 'Mini', 'Micro'];

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializePopup();
    loadSettings();
    checkServerStatus();
    checkForExtensionUpdates(); // Check for updates independently of server status
    setupEventListeners();
});

async function initializePopup() {
    console.log('YTP Popup: Initializing...');
    
    // Update size value display
    updateSizeLabel();
}

function loadSettings() {
    // Load all settings from storage
    chrome.storage.local.get(Object.values(SETTINGS_KEYS), (result) => {
        console.log('YTP Popup: Loaded settings:', result);
        
        // Panel visibility (default: true)
        const panelVisible = result[SETTINGS_KEYS.PANEL_VISIBLE] !== false;
        document.getElementById('panel-visible').checked = panelVisible;
        
        // Panel pinned (default: false - floating)
        const panelPinned = result[SETTINGS_KEYS.PANEL_PINNED] === true;
        document.getElementById('panel-pinned').checked = panelPinned;
        
        // Button size (default: 0 = normal)
        const buttonSize = parseInt(result[SETTINGS_KEYS.BUTTON_SIZE] || '0');
        document.getElementById('button-size').value = buttonSize;
        updateSizeLabel();
        
        // Auto-hide (default: true)
        const autoHide = result[SETTINGS_KEYS.AUTO_HIDE] !== false;
        document.getElementById('auto-hide').checked = autoHide;
    });
}

function saveSettings() {
    const settings = {
        [SETTINGS_KEYS.PANEL_VISIBLE]: document.getElementById('panel-visible').checked,
        [SETTINGS_KEYS.PANEL_PINNED]: document.getElementById('panel-pinned').checked,
        [SETTINGS_KEYS.BUTTON_SIZE]: document.getElementById('button-size').value,
        [SETTINGS_KEYS.AUTO_HIDE]: document.getElementById('auto-hide').checked
    };
    
    chrome.storage.local.set(settings, () => {
        console.log('YTP Popup: Settings saved:', settings);
        
        // Notify content script of changes
        notifyContentScript('SETTINGS_UPDATED', settings);
    });
}

function setupEventListeners() {
    // Panel visibility toggle
    document.getElementById('panel-visible').addEventListener('change', (e) => {
        saveSettings();
        notifyContentScript('TOGGLE_PANEL', { visible: e.target.checked });
    });
    
    // Panel pin toggle
    document.getElementById('panel-pinned').addEventListener('change', (e) => {
        saveSettings();
        notifyContentScript('TOGGLE_PIN', { pinned: e.target.checked });
    });
    
    // Button size slider
    document.getElementById('button-size').addEventListener('input', (e) => {
        updateSizeLabel();
        saveSettings();
        notifyContentScript('UPDATE_BUTTON_SIZE', { size: parseInt(e.target.value) });
    });
    
    // Auto-hide toggle
    document.getElementById('auto-hide').addEventListener('change', (e) => {
        saveSettings();
        notifyContentScript('UPDATE_AUTO_HIDE', { autoHide: e.target.checked });
    });
    
    // Reset position button
    document.getElementById('reset-position').addEventListener('click', () => {
        const defaultPosition = { x: 20, y: 20 };
        chrome.storage.local.set({ [SETTINGS_KEYS.CONTAINER_POSITION]: JSON.stringify(defaultPosition) }, () => {
            console.log('YTP Popup: Position reset to default');
            notifyContentScript('RESET_POSITION', defaultPosition);
            showFeedback('Position réinitialisée');
        });
    });
    
    // Center position button
    document.getElementById('center-position').addEventListener('click', () => {
        notifyContentScript('CENTER_POSITION', {});
        showFeedback('Position centrée');
    });
    
    // Reset all settings
    document.getElementById('reset-all').addEventListener('click', () => {
        if (confirm('Voulez-vous vraiment réinitialiser tous les paramètres ?')) {
            resetAllSettings();
        }
    });
}

function updateSizeLabel() {
    const sizeValue = parseInt(document.getElementById('button-size').value);
    document.getElementById('size-value').textContent = SIZE_LABELS[sizeValue] || 'Normal';
}

function resetAllSettings() {
    const defaultSettings = {
        [SETTINGS_KEYS.PANEL_VISIBLE]: true,
        [SETTINGS_KEYS.PANEL_PINNED]: false,
        [SETTINGS_KEYS.BUTTON_SIZE]: '0',
        [SETTINGS_KEYS.AUTO_HIDE]: true,
        [SETTINGS_KEYS.CONTAINER_POSITION]: JSON.stringify({ x: 20, y: 20 }),
        [SETTINGS_KEYS.BUTTONS_VISIBLE]: 'true'
    };
    
    chrome.storage.local.set(defaultSettings, () => {
        console.log('YTP Popup: All settings reset to defaults');
        loadSettings(); // Reload UI
        notifyContentScript('RESET_ALL_SETTINGS', defaultSettings);
        showFeedback('Tous les paramètres ont été réinitialisés');
    });
}

async function checkServerStatus() {
    const statusElement = document.getElementById('server-status');
    const statusIcon = statusElement.querySelector('.material-symbols-outlined');
    const statusText = statusElement.querySelector('span:last-child');
    
    try {
        const response = await fetch('http://localhost:17845/health', { 
            method: 'GET',
            timeout: 3000 
        });
        
        if (response.ok) {
            const data = await response.json();
            statusElement.className = 'status connected';
            statusIcon.textContent = 'check_circle';
            statusText.textContent = 'Application connectée et prête';
        } else {
            throw new Error('Server not responding');
        }
    } catch (error) {
        console.error('YTP Popup: Server check failed:', error);
        showInstallationInstructions(statusElement, statusIcon, statusText);
    }
}

// Check for extension updates from GitHub releases
async function checkForExtensionUpdates() {
    const updateNotification = document.getElementById('update-notification');
    const extensionVersion = CURRENT_VERSION;
    
    try {
        console.log(`🔍 YTP Popup: Checking for updates from GitHub... Current version: ${extensionVersion}`);
        
        // Fetch latest release from GitHub API
        const response = await fetch('https://api.github.com/repos/Selgy/YoutubetoPremiere-V2/releases/latest', {
            method: 'GET',
            headers: {
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        console.log(`📡 YTP Popup: GitHub API response status: ${response.status}`);
        
        if (!response.ok) {
            console.warn(`⚠️ YTP Popup: Could not check for updates from GitHub (status ${response.status})`);
            return;
        }
        
        const release = await response.json();
        const latestVersion = release.tag_name.replace(/^v/, ''); // Remove 'v' prefix if present
        
        console.log(`📦 YTP Popup: Latest version on GitHub: ${latestVersion} (tag: ${release.tag_name})`);
        console.log(`🔢 YTP Popup: Comparing versions: ${extensionVersion} vs ${latestVersion}`);
        
        const comparison = compareVersions(extensionVersion, latestVersion);
        console.log(`⚖️ YTP Popup: Version comparison result: ${comparison} (< 0 means update available)`);
        
        // Compare versions
        if (comparison < 0) {
            console.log(`🔄 YTP Popup: ✅ UPDATE AVAILABLE! Extension ${extensionVersion} < GitHub ${latestVersion}`);
            updateNotification.style.display = 'flex';
            updateNotification.onclick = () => {
                const os = detectOperatingSystem();
                let downloadUrl;
                
                if (os === 'windows') {
                    downloadUrl = `https://github.com/Selgy/YoutubetoPremiere-V2/releases/download/v${latestVersion}/YouTubetoPremiere-Windows.exe`;
                } else if (os === 'mac') {
                    downloadUrl = `https://github.com/Selgy/YoutubetoPremiere-V2/releases/download/v${latestVersion}/YouTubetoPremiere-macOS.pkg`;
                } else {
                    // No download for unsupported OS
                    console.warn(`⚠️ YTP Popup: Unsupported OS for direct download: ${os}`);
                    return;
                }
                
                console.log(`📥 YTP Popup: Starting download from: ${downloadUrl}`);
                chrome.tabs.create({ url: downloadUrl });
            };
        } else {
            console.log(`✅ YTP Popup: Extension is up to date (${extensionVersion})`);
            updateNotification.style.display = 'none';
        }
    } catch (error) {
        console.error('❌ YTP Popup: Error checking for updates:', error);
        // Silently fail - don't bother the user if update check fails
    }
}

function showInstallationInstructions(statusElement, statusIcon, statusText) {
    const os = detectOperatingSystem();
    
    statusElement.className = 'status disconnected clickable';
    statusIcon.textContent = 'download';
    
    if (os === 'windows' || os === 'mac') {
        statusText.textContent = 'Application non détectée - Cliquer pour télécharger';
        
        statusElement.style.cursor = 'pointer';
        statusElement.onclick = () => {
            const downloadUrl = DOWNLOAD_URLS[os];
            if (downloadUrl) {
                console.log(`📥 YTP Popup: Downloading application: ${downloadUrl}`);
                chrome.tabs.create({ url: downloadUrl });
            }
        };
    } else {
        statusText.textContent = 'Application non détectée';
        statusElement.style.cursor = 'default';
    }
}

function detectOperatingSystem() {
    const userAgent = navigator.userAgent.toLowerCase();
    
    if (userAgent.includes('mac')) {
        return 'mac';
    } else if (userAgent.includes('win')) {
        return 'windows';
    } else if (userAgent.includes('linux')) {
        return 'linux';
    } else {
        return 'unknown';
    }
}

function notifyContentScript(action, data = {}) {
    // Get active tab and send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                type: 'YTP_POPUP_MESSAGE',
                action: action,
                data: data
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.log('YTP Popup: Content script not responding:', chrome.runtime.lastError.message);
                } else {
                    console.log('YTP Popup: Message sent to content script:', action, data);
                }
            });
        }
    });
}

function showFeedback(message) {
    // Create temporary feedback message with matching design
    const feedback = document.createElement('div');
    feedback.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #4e52ff 0%, #6366f1 100%);
        color: white;
        padding: 12px 16px;
        border-radius: 12px;
        font-size: 13px;
        font-weight: 500;
        z-index: 1000;
        transform: translateX(100%);
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 4px 12px rgba(78, 82, 255, 0.4);
        backdrop-filter: blur(10px);
    `;
    feedback.textContent = message;
    document.body.appendChild(feedback);
    
    // Animate in
    setTimeout(() => {
        feedback.style.transform = 'translateX(0)';
    }, 10);
    
    // Remove after delay
    setTimeout(() => {
        feedback.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (feedback.parentNode) {
                feedback.parentNode.removeChild(feedback);
            }
        }, 300);
    }, 2000);
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'YTP_CONTENT_MESSAGE') {
        console.log('YTP Popup: Received message from content script:', message);
        
        switch (message.action) {
            case 'POSITION_UPDATED':
                // Content script notified us of position change
                showFeedback('Position mise à jour');
                break;
            case 'PANEL_TOGGLED':
                // Update UI to reflect panel state
                document.getElementById('panel-visible').checked = message.data.visible;
                break;
            case 'PIN_TOGGLED':
                // Update UI to reflect pin state
                document.getElementById('panel-pinned').checked = message.data.pinned;
                break;
        }
        
        sendResponse({ success: true });
    }
});

// Refresh server status every 10 seconds
setInterval(checkServerStatus, 10000); 