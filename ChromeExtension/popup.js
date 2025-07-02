// YouTube to Premiere Extension - Settings Popup
console.log('YTP Popup: Script loaded');

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
    
    // About link
    document.getElementById('about-link').addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: 'https://github.com/your-repo/youtube-to-premiere' });
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
        const response = await fetch('http://localhost:3002/health', { 
            method: 'GET',
            timeout: 3000 
        });
        
        if (response.ok) {
            statusElement.className = 'status connected';
            statusIcon.textContent = 'cloud_done';
            statusText.textContent = 'Serveur connecté';
        } else {
            throw new Error('Server not responding');
        }
    } catch (error) {
        statusElement.className = 'status disconnected';
        statusIcon.textContent = 'cloud_off';
        statusText.textContent = 'Serveur déconnecté';
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