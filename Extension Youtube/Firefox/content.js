// i18n helper - i18n.js is injected before this file by the manifest.
// Falls back to the key itself if it somehow failed to load.
const T = (key, params) => (window.YTPI18n ? window.YTPI18n.t(key, params) : key);

// YouTube to Premiere Pro Extension - Enhanced UI
// Modern button design with icons and improved animations - Original Colors

// Debug: Version check
console.log('YTP: Content script loaded - version ' + chrome.runtime.getManifest().version);

// Server availability state
let serverAvailable = false;
let serverCheckInProgress = false;
let lastServerCheck = 0;
const SERVER_CHECK_INTERVAL = 30000; // Check every 30 seconds

// Helper function to fetch from localhost via background script (avoids CORS)
function fetchLocalhostViaBackground(url, options = {}) {
    return new Promise((resolve) => {
        if (!validateExtensionContext()) {
            resolve({ success: false, ok: false, error: 'Extension context invalidated' });
            return;
        }
        
        chrome.runtime.sendMessage({
            type: 'FETCH_LOCALHOST',
            url: url,
            options: options,
            timeout: options.timeout || 5000
        }, (response) => {
            if (chrome.runtime.lastError) {
                resolve({ success: false, ok: false, error: chrome.runtime.lastError.message });
            } else {
                resolve(response || { success: false, ok: false });
            }
        });
    });
}

// Check server availability
async function checkServerAvailability() {
    if (serverCheckInProgress) return serverAvailable;
    
    const now = Date.now();
    if (now - lastServerCheck < SERVER_CHECK_INTERVAL) {
        return serverAvailable;
    }
    
    serverCheckInProgress = true;
    lastServerCheck = now;
    
    try {
        const response = await fetchLocalhostViaBackground('/health', { 
            method: 'GET',
            timeout: 3000 
        });
        serverAvailable = response.ok || false;
    } catch (error) {
        serverAvailable = false;
    }
    
    serverCheckInProgress = false;
    updateButtonsServerStatus();
    return serverAvailable;
}

// Update buttons based on server status
function updateButtonsServerStatus() {
    const buttons = document.querySelectorAll('.import-button');
    const statusIndicator = document.getElementById('ytp-server-status');
    
    buttons.forEach(button => {
        if (serverAvailable) {
            button.classList.remove('server-unavailable');
        } else {
            button.classList.add('server-unavailable');
        }
        // Keep original button titles regardless of server status
    });
    
    // Update status indicator
    if (statusIndicator) {
        statusIndicator.className = serverAvailable ? 'ytp-status-connected' : 'ytp-status-disconnected';
        statusIndicator.title = serverAvailable ? T('statusConnected') : T('statusNotDetected');
    }
}

// Show simple message when server is not available
function showServerRequiredMessage(buttonType) {
    const features = {
        premiere: T('featurePremiere'),
        clip: T('featureClip'),
        audio: T('featureAudio')
    };

    const feature = features[buttonType] || T('featureGeneric');

    showNotification(
        T('serverRequired', { feature: feature }),
        'info',
        4000
    );
}

// Fonction pour récupérer les cookies YouTube pour le serveur
async function getCookiesForServer() {
    return new Promise((resolve) => {
        console.log('YTP: Getting YouTube cookies for server');
        
        // Check extension validity before accessing Chrome APIs
        if (!validateExtensionContext()) {
            resolve({ cookies: [], error: 'Extension context invalidated' });
            return;
        }
        
        try {
            chrome.runtime.sendMessage(YTP_SITE.id === 'youtube'
                ? { type: 'GET_YOUTUBE_COOKIES' }
                : { type: 'GET_SITE_COOKIES', site: YTP_SITE.id }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('YTP: Chrome runtime error:', chrome.runtime.lastError);
                    resolve({ cookies: [], error: chrome.runtime.lastError.message });
                    return;
                }
                
                // Check extension validity again in callback
                if (!validateExtensionContext()) {
                    resolve({ cookies: [], error: 'Extension context invalidated' });
                    return;
                }
                
                const cookies = response ? response.cookies || [] : [];
                console.log('YTP: Retrieved', cookies.length, 'cookies for server');
                resolve({ cookies: cookies });
            });
        } catch (error) {
            console.error('YTP: Error getting cookies for server:', error);
            if (error.message.includes('Extension context invalidated')) {
                handleExtensionInvalidation();
            }
            resolve({ cookies: [], error: error.message });
        }
    });
}

// Fonction pour vérifier si l'utilisateur est connecté à YouTube
async function checkYouTubeAuth() {
    const cookiesData = await getCookiesForServer();
    const authCookies = cookiesData.cookies.filter(cookie => 
        ['SAPISID', 'APISID', 'HSID', 'SSID', 'LOGIN_INFO', '__Secure-3PAPISID', '__Secure-3PSID'].includes(cookie.name)
    );
    
    return {
        isLoggedIn: authCookies.length > 0,
        cookieCount: cookiesData.cookies.length,
        authCookieCount: authCookies.length,
        cookies: cookiesData.cookies
    };
}

// Fonction pour guider l'utilisateur vers la connexion si nécessaire
function promptUserLogin() {
    const notification = showNotification(
        T('loginPrompt'), 
        'info', 
        10000
    );
    
    // Ajouter un bouton pour ouvrir la page de connexion YouTube
    setTimeout(() => {
        const loginButton = document.createElement('button');
        loginButton.textContent = T('loginButton');
        loginButton.style.cssText = `
            background: #ff0000;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            margin: 8px;
        `;
        loginButton.onclick = () => {
            window.open('https://accounts.google.com/signin', '_blank');
        };
        
        if (notification && notification.parentNode) {
            notification.appendChild(loginButton);
        }
    }, 1000);
}



// Handle YouTube cookies requests from settings panel (legacy - si nécessaire)
window.addEventListener('message', async (event) => {
    
    if (event.data.type === 'REQUEST_YOUTUBE_COOKIES' && event.data.source === 'YTP_SETTINGS') {
        console.log('YTP: Processing YouTube cookies request');
        
        const cookiesData = await getCookiesForServer();
        
        // Send cookies back to settings panel
        window.postMessage({
            type: 'YOUTUBE_COOKIES_RESPONSE',
            cookies: cookiesData.cookies,
            error: cookiesData.error
        }, '*');
    }
});

// Add styles to the document
const styleSheet = document.createElement("style");
styleSheet.textContent = `
    /* Floating bar shown on YouTube, TikTok, Instagram, X and Dailymotion.
       Every rule is scoped to our own ids/classes and sets the properties a
       site stylesheet could change (font, line-height, box-sizing...). */

    #ytp-floating-container {
        --ytp-accent: #5b5fff;
        --ytp-accent-hover: #6e72ff;
        --ytp-accent-active: #4a4ee6;
        --ytp-surface: rgba(17, 17, 24, 0.86);
        --ytp-border: rgba(255, 255, 255, 0.12);
        --ytp-text: #ffffff;
        --ytp-muted: rgba(255, 255, 255, 0.72);
        --ytp-success: #10b981;
        --ytp-danger: #ef4444;
        position: fixed !important;
        z-index: 2147483000 !important;
        left: 20px;
        bottom: 20px;
        pointer-events: auto !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
        line-height: 1 !important;
        transition: opacity 0.2s ease !important;
    }

    #ytp-floating-container.pinned {
        position: absolute !important;
    }

    #ytp-floating-container.dragging {
        opacity: 0.9 !important;
        transition: none !important;
    }

    #ytp-floating-container *,
    #ytp-floating-container *::before,
    #ytp-floating-container *::after {
        box-sizing: border-box !important;
    }

    /* The pill */
    #ytp-floating-container .ytp-main-container {
        display: inline-flex !important;
        align-items: center !important;
        gap: 4px !important;
        height: auto !important;
        margin: 0 !important;
        padding: 4px !important;
        background: var(--ytp-surface) !important;
        backdrop-filter: blur(14px) saturate(140%) !important;
        -webkit-backdrop-filter: blur(14px) saturate(140%) !important;
        border: 1px solid var(--ytp-border) !important;
        border-radius: 999px !important;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35), 0 1px 2px rgba(0, 0, 0, 0.25) !important;
        white-space: nowrap !important;
        overflow: visible !important;
        cursor: grab !important;
        visibility: visible !important;
        opacity: 1 !important;
    }

    #ytp-floating-container.dragging .ytp-main-container {
        cursor: grabbing !important;
    }

    /* Show / hide toggle */
    #ytp-floating-container .ytp-toggle-button {
        all: unset;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        flex: 0 0 auto !important;
        width: 32px !important;
        height: 32px !important;
        margin: 0 !important;
        padding: 0 !important;
        border-radius: 50% !important;
        color: var(--ytp-muted) !important;
        background: transparent !important;
        cursor: pointer !important;
        transition: background-color 0.15s ease, color 0.15s ease !important;
    }

    #ytp-floating-container .ytp-toggle-button:hover {
        color: var(--ytp-text) !important;
        background: rgba(255, 255, 255, 0.12) !important;
    }

    #ytp-floating-container .ytp-toggle-button:focus-visible {
        outline: 2px solid var(--ytp-accent) !important;
        outline-offset: 1px !important;
    }

    #ytp-floating-container .ytp-toggle-button.buttons-hidden {
        color: var(--ytp-text) !important;
        background: var(--ytp-accent) !important;
    }

    /* Group of action buttons, folds into the toggle */
    #ytp-floating-container .ytp-buttons-container {
        display: inline-flex !important;
        align-items: center !important;
        gap: 4px !important;
        margin: 0 !important;
        padding: 0 !important;
        max-width: 420px !important;
        opacity: 1 !important;
        overflow: visible !important;
        transition: max-width 0.25s ease, opacity 0.2s ease !important;
    }

    #ytp-floating-container .ytp-buttons-container.hidden {
        max-width: 0 !important;
        opacity: 0 !important;
        overflow: hidden !important;
        pointer-events: none !important;
    }

    #ytp-floating-container .ytp-main-container.buttons-collapsed {
        gap: 0 !important;
    }

    /* Action buttons */
    #ytp-floating-container .import-button {
        position: relative !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        flex: 0 0 auto !important;
        min-width: 92px !important;
        height: 32px !important;
        margin: 0 !important;
        padding: 0 14px !important;
        border: none !important;
        border-radius: 999px !important;
        background: var(--ytp-accent) !important;
        color: var(--ytp-text) !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        letter-spacing: 0.01em !important;
        text-transform: none !important;
        line-height: 1 !important;
        overflow: hidden !important;
        cursor: pointer !important;
        outline: none !important;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18) !important;
        transition: background-color 0.15s ease, transform 0.1s ease, opacity 0.2s ease !important;
    }

    #ytp-floating-container .import-button:hover {
        background: var(--ytp-accent-hover) !important;
    }

    #ytp-floating-container .import-button:active {
        background: var(--ytp-accent-active) !important;
        transform: scale(0.97) !important;
    }

    #ytp-floating-container .import-button:focus-visible {
        box-shadow: 0 0 0 2px var(--ytp-surface), 0 0 0 4px var(--ytp-accent) !important;
    }

    #ytp-floating-container .import-button .progress-text {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 6px !important;
        max-width: 100% !important;
        height: 100% !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        line-height: 1 !important;
        /* The font's line box puts capitals 1.5px below the middle (measured
           on Segoe UI): lift the whole label, then put the icon back */
        padding-bottom: 2.5px !important;
        transition: opacity 0.15s ease !important;
    }

    #ytp-floating-container .import-button .progress-text .button-icon {
        transform: translateY(0.75px) !important;
    }

    #ytp-floating-container .import-button .progress-value {
        font-variant-numeric: tabular-nums !important;
    }

    #ytp-floating-container .button-icon {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        flex: 0 0 auto !important;
        width: 16px !important;
        height: 16px !important;
    }

    #ytp-floating-container .ytp-toggle-button .button-icon {
        width: 18px !important;
        height: 18px !important;
    }

    #ytp-floating-container .button-icon svg {
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        fill: none !important;
        stroke: currentColor !important;
        stroke-width: 2 !important;
        stroke-linecap: round !important;
        stroke-linejoin: round !important;
    }

    /* States */
    #ytp-floating-container .import-button.disabled {
        opacity: 0.45 !important;
        cursor: not-allowed !important;
        pointer-events: none !important;
    }

    #ytp-floating-container .import-button.server-unavailable {
        background: #3f3f4a !important;
        color: var(--ytp-muted) !important;
    }

    #ytp-floating-container .import-button.server-unavailable:hover {
        background: #4b4b57 !important;
    }

    #ytp-floating-container .import-button.importing {
        pointer-events: auto !important;
        animation: ytp-pulse 1.6s ease-in-out infinite !important;
    }

    #ytp-floating-container .import-button.loading {
        pointer-events: none !important;
    }

    #ytp-floating-container .import-button.loading .progress-text,
    #ytp-floating-container .import-button.importing:hover .progress-text {
        opacity: 0 !important;
    }

    #ytp-floating-container .import-button.success {
        background: var(--ytp-success) !important;
        animation: none !important;
    }

    #ytp-floating-container .import-button.failure {
        background: var(--ytp-danger) !important;
        animation: ytp-shake 0.4s ease !important;
    }

    /* Spinner while the server and licence are checked */
    #ytp-floating-container .loading-spinner-container {
        position: absolute !important;
        inset: 0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        pointer-events: none !important;
    }

    #ytp-floating-container .loading-spinner {
        display: none !important;
        width: 16px !important;
        height: 16px !important;
        border: 2px solid rgba(255, 255, 255, 0.35) !important;
        border-top-color: #ffffff !important;
        border-radius: 50% !important;
        animation: ytp-spin 0.8s linear infinite !important;
    }

    #ytp-floating-container .import-button.loading .loading-spinner {
        display: block !important;
    }

    /* Cancel overlay while a download runs */
    #ytp-floating-container .cancel-button {
        position: absolute !important;
        inset: 0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border-radius: inherit !important;
        background: var(--ytp-danger) !important;
        color: #ffffff !important;
        font-size: 13px !important;
        font-weight: 700 !important;
        line-height: 1 !important;
        padding-bottom: 2px !important; /* same lift as the labels */
        opacity: 0 !important;
        pointer-events: none !important;
        cursor: pointer !important;
        transition: opacity 0.15s ease !important;
        z-index: 2 !important;
    }

    #ytp-floating-container .import-button.importing:hover .cancel-button,
    #ytp-floating-container .import-button.loading:hover .cancel-button {
        opacity: 1 !important;
        pointer-events: auto !important;
    }

    #ytp-floating-container .ripple {
        position: absolute !important;
        border-radius: 50% !important;
        background: rgba(255, 255, 255, 0.45) !important;
        transform: scale(0);
        animation: ytp-ripple 0.5s linear !important;
        pointer-events: none !important;
    }

    /* Sizes chosen in the popup */
    #ytp-floating-container .ytp-main-container.compact .import-button { height: 28px !important; min-width: 80px !important; font-size: 12px !important; padding: 0 12px !important; }
    #ytp-floating-container .ytp-main-container.compact .ytp-toggle-button { width: 28px !important; height: 28px !important; }
    #ytp-floating-container .ytp-main-container.mini .import-button { height: 26px !important; min-width: 70px !important; font-size: 11px !important; padding: 0 10px !important; }
    #ytp-floating-container .ytp-main-container.mini .ytp-toggle-button { width: 26px !important; height: 26px !important; }
    #ytp-floating-container .ytp-main-container.mini .button-icon { width: 14px !important; height: 14px !important; }
    #ytp-floating-container .ytp-main-container.micro .import-button,
    #ytp-floating-container .ytp-main-container.icon-only .import-button { min-width: 0 !important; width: 30px !important; height: 30px !important; padding: 0 !important; font-size: 0 !important; }
    #ytp-floating-container .ytp-main-container.micro .progress-text,
    #ytp-floating-container .ytp-main-container.icon-only .progress-text { gap: 0 !important; }
    #ytp-floating-container .ytp-main-container.micro .ytp-toggle-button,
    #ytp-floating-container .ytp-main-container.icon-only .ytp-toggle-button { width: 30px !important; height: 30px !important; }

    @keyframes ytp-spin { to { transform: rotate(360deg); } }
    @keyframes ytp-ripple { to { transform: scale(4); opacity: 0; } }
    @keyframes ytp-pulse {
        0%, 100% { box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 0 0 0 rgba(91, 95, 255, 0.55); }
        50% { box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 0 0 5px rgba(91, 95, 255, 0); }
    }
    @keyframes ytp-shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-3px); }
        75% { transform: translateX(3px); }
    }

    /* Notifications */
    .ytp-notification {
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: rgba(17, 17, 24, 0.94);
        backdrop-filter: blur(14px);
        color: #ffffff;
        padding: 14px 16px;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-left: 4px solid #5b5fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 14px;
        font-weight: 500;
        line-height: 1.4;
        box-shadow: 0 10px 32px rgba(0, 0, 0, 0.35);
        z-index: 2147483001;
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 250px;
        max-width: 400px;
        box-sizing: border-box;
        opacity: 0;
        transform: translateY(16px);
        transition: opacity 0.25s ease, transform 0.25s ease;
    }

    .ytp-notification.show {
        opacity: 1;
        transform: translateY(0);
    }

    .ytp-notification.error { border-left-color: #ef4444; }
    .ytp-notification.warning { border-left-color: #f59e0b; }
    .ytp-notification.success { border-left-color: #10b981; }

    .ytp-notification-icon {
        font-size: 20px;
    }

    .ytp-notification-content {
        flex: 1;
    }

    .ytp-notification-close {
        cursor: pointer;
        border-radius: 50%;
        font-size: 14px;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.7;
        transition: background-color 0.15s ease, opacity 0.15s ease;
    }

    .ytp-notification-close:hover {
        background: rgba(255, 255, 255, 0.15);
        opacity: 1;
    }

    @media (max-width: 768px) {
        .ytp-notification {
            bottom: 16px;
            right: 16px;
            left: 16px;
            max-width: none;
        }
    }
`;

document.head.appendChild(styleSheet);

// Icons drawn as inline SVG (no web font: some sites block it, and the icon
// names showed as words while it loaded). Built with createElementNS, not
// innerHTML: YouTube enforces Trusted Types.
const YTP_ICONS = {
    movie: ['M4 4h16v16H4z', 'M8 4v16', 'M16 4v16', 'M4 8h4', 'M4 12h16', 'M4 16h4', 'M16 8h4', 'M16 16h4'],
    content_cut: ['M6 3a3 3 0 1 0 0 6a3 3 0 1 0 0-6z', 'M6 15a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
                  'M20 4 8.12 15.88', 'M14.47 14.48 20 20', 'M8.12 8.12 12 12'],
    music_note: ['M9 18V5l12-2v13', 'M6 15a3 3 0 1 0 0 6a3 3 0 1 0 0-6z', 'M18 13a3 3 0 1 0 0 6a3 3 0 1 0 0-6z'],
    visibility: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z'],
    visibility_off: ['M9.88 9.88a3 3 0 1 0 4.24 4.24', 'M10.73 5.08A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68',
                     'M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.39-1.61', 'M2 2l20 20'],
};

function setButtonIcon(el, name) {
    const SVG_NS = 'http://www.w3.org/2000/svg';
    while (el.firstChild) el.removeChild(el.firstChild);
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    for (const d of YTP_ICONS[name] || []) {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', d);
        svg.appendChild(path);
    }
    el.appendChild(svg);
}

function setToggleIcon(toggleButton, visible) {
    while (toggleButton.firstChild) toggleButton.removeChild(toggleButton.firstChild);
    const span = document.createElement('span');
    span.className = 'button-icon';
    setButtonIcon(span, visible ? 'visibility' : 'visibility_off');
    toggleButton.appendChild(span);
}


// Button states tracking
const buttonStates = {
    premiere: { isimporting: false, cancelCooldown: false },
    clip: { isimporting: false, cancelCooldown: false },
    audio: { isimporting: false, cancelCooldown: false }
};

// Function to check if any import is in progress
function isAnyimportInProgress() {
    const importActive = Object.values(buttonStates).some(state => state.isimporting);
    isimportActive = importActive; // Update global flag
    return importActive;
}

// Function to disable all buttons during import
function disableAllButtons() {
    const buttons = document.querySelectorAll('.import-button');
    buttons.forEach(button => {
        // Don't disable the button that's currently importing (it needs to show progress)
        if (!button.classList.contains('importing') && !button.classList.contains('loading')) {
            button.classList.add('disabled');
            button.style.pointerEvents = 'none';
            button.style.opacity = '0.6';
        }
    });
}

// Function to enable all buttons after import
function enableAllButtons() {
    const buttons = document.querySelectorAll('.import-button');
    buttons.forEach(button => {
        button.classList.remove('disabled');
        button.style.pointerEvents = 'auto';
        button.style.opacity = '1';
    });
}

console.log('🎯 [INIT] ButtonStates initialized:', JSON.stringify(buttonStates));

// Visibility state
let buttonsVisible = localStorage.getItem('ytp-buttons-visible') !== 'false';

// Global variables
let socket = null;
let reconnectAttempts = 0;
let maxReconnectAttempts = 10; // Increased for better reliability during imports
let reconnectInterval = 2000;
let isExtensionValid = true;
let isimportActive = false; // Track if any import is active
let lastUserCancellation = null; // Track last user cancellation to avoid duplicate messages

// Observer instances to disconnect on invalidation
let mainMutationObserver = null;
let ytPlayerObserver = null;

// Function to check if we're on a video or shorts page
function isVideoPage() {
    // YouTube: watch/shorts pages; other sites: see sites.js
    return YTP_SITE.isVideoPage();
}

// Function to show/hide the floating container based on page type
function updateButtonsVisibility() {
    // Check extension validity before accessing Chrome APIs
    if (!validateExtensionContext()) return;
    
    const floatingContainer = document.querySelector('#ytp-floating-container');
    
    if (floatingContainer) {
        // Check if we're in fullscreen mode
        const isFullscreen = document.fullscreenElement || 
                           document.webkitFullscreenElement || 
                           document.mozFullScreenElement || 
                           document.msFullscreenElement ||
                           // Check if YouTube player is in fullscreen
                           document.querySelector('.ytp-fullscreen');
        
        // Check auto-hide setting safely
        safeStorageGet(['ytp-auto-hide'], (result) => {
            if (!result) {
                // Fallback: use default behavior if storage unavailable
                if (isVideoPage() && !isFullscreen) {
                    floatingContainer.style.display = 'block';
                    floatingContainer.style.visibility = 'visible';
                } else {
                    floatingContainer.style.display = 'none';
                    floatingContainer.style.visibility = 'hidden';
                }
                return;
            }
            
            const autoHide = result['ytp-auto-hide'] !== false; // Default to true
            
            if (isVideoPage() && (!isFullscreen || !autoHide)) {
                floatingContainer.style.display = 'block';
                floatingContainer.style.visibility = 'visible';
            } else {
                floatingContainer.style.display = 'none';
                floatingContainer.style.visibility = 'hidden';
            }
        });
    }
}

// Safe version of updateButtonsVisibility for use in observers
function updateButtonsVisibilitySafely() {
    // Stop immediately if extension is invalidated
    if (invalidationHandled || !isExtensionValid) return;
    
    try {
        if (!validateExtensionContext()) return;
        updateButtonsVisibility();
    } catch (error) {
        // Silently handle errors to prevent spam
        if (error.message.includes('Extension context invalidated')) {
            handleExtensionInvalidation();
        }
    }
}

// Safe version for handling Chrome storage operations
function safeStorageSet(items, callback = null) {
    try {
        if (!validateExtensionContext()) {
            if (callback) callback();
            return;
        }
        chrome.storage.local.set(items, () => {
            if (!validateExtensionContext()) {
                if (callback) callback();
                return;
            }
            if (callback) callback();
        });
    } catch (error) {
        // Silently handle storage errors to prevent spam
        if (error.message.includes('Extension context invalidated')) {
            handleExtensionInvalidation();
        }
        if (callback) callback();
    }
}

function safeStorageGet(keys, callback) {
    try {
        if (!validateExtensionContext()) {
            // Silently fail with empty result if extension context is invalid
            callback({});
            return;
        }
        chrome.storage.local.get(keys, (result) => {
            if (!validateExtensionContext()) {
                callback({});
                return;
            }
            callback(result);
        });
    } catch (error) {
        // Silently handle storage errors to prevent spam
        if (error.message.includes('Extension context invalidated')) {
            handleExtensionInvalidation();
        }
        // Return empty result to continue execution
        callback({});
    }
}

// Safe version for Chrome runtime messaging
function safeRuntimeSendMessage(message, callback = null) {
    try {
        if (!validateExtensionContext()) {
            if (callback) callback(null);
            return;
        }
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                // Handle expected errors (like popup not open)
                if (callback) callback(null);
                return;
            }
            if (!validateExtensionContext()) {
                if (callback) callback(null);
                return;
            }
            if (callback) callback(response);
        });
    } catch (error) {
        // Silently handle runtime messaging errors to prevent spam
        if (error.message.includes('Extension context invalidated')) {
            handleExtensionInvalidation();
        }
        if (callback) callback(null);
    }
}

function initializeSocket() {
    try {
        // Silently initialize socket connection
        
        // Check if extension context is still valid
        try {
            chrome.runtime.id;
            isExtensionValid = true;
        } catch (error) {
            // Silently handle extension context invalidation
            isExtensionValid = false;
            handleExtensionInvalidation();
            return;
        }
        
        if (socket) {
            socket.disconnect();
            socket = null;
        }
        
        socket = io('http://localhost:17845', {
            transports: ['websocket', 'polling'],
            upgrade: true,
            rememberUpgrade: false,
            timeout: 15000,  // Increased timeout
            forceNew: true,
            autoConnect: false,
            query: {
                client_type: 'chrome'
            },
            // Additional options for stability during imports
            pingInterval: 10000,  // Ping every 10 seconds
            pingTimeout: 5000,    // Wait 5 seconds for pong response
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            maxReconnectionAttempts: isimportActive ? 50 : 10  // More attempts during imports
        });
        
        console.log('🔌 [SOCKET] Initializing connection with client_type=chrome');

        socket.on('connect_error', (error) => {
            // Only log connection errors if not expected (when Premiere is closed)
            if (!error.message.includes('ECONNREFUSED') && !error.message.includes('websocket error')) {
                console.error('❌ [SOCKET] Connection ERROR:', error.message);
                
                // Show user-friendly message only if import is active and multiple failures
                if (isimportActive && reconnectAttempts >= 5) {
                    showNotification(
                        T('connectionUnstable'), 
                        'warning', 
                        5000
                    );
                }
            }
        });

        socket.on('disconnect', (reason) => {
            // Only log unexpected disconnections, not when server is simply not available
            if (reason !== 'transport close' && reason !== 'transport error') {
                console.log('🔌 [SOCKET] Disconnected from server, reason:', reason);
            }
            
            // More aggressive reconnection during active imports
            const shouldReconnect = isExtensionValid && reason !== 'io client disconnect';
            const maxAttempts = isimportActive ? 20 : maxReconnectAttempts; // More attempts during imports
            
            if (shouldReconnect && reconnectAttempts < maxAttempts) {
                // Shorter delay during imports for faster reconnection
                const baseDelay = isimportActive ? 1000 : reconnectInterval;
                const delayMs = Math.min(baseDelay * Math.pow(1.5, reconnectAttempts), isimportActive ? 10000 : 30000);
                
                console.log(`🔌 [SOCKET] Attempting reconnection in ${delayMs}ms (attempt ${reconnectAttempts + 1}/${maxAttempts}, import active: ${isimportActive})`);
                
                setTimeout(() => {
                    if (validateExtensionContext()) {
                        attemptReconnection();
                    }
                }, delayMs);
            } else if (reconnectAttempts >= maxAttempts) {
                console.warn('🔌 [SOCKET] Max reconnection attempts reached. Connection abandoned.');
                if (isimportActive) {
                    showNotification(T('connectionLost'), 'error', 10000);
                }
            }
        });

        socket.on('connect', () => {
            // Log successful connection
            console.log('🔌 [SOCKET] Successfully connected to Python server on port 17845');
            reconnectAttempts = 0;
            
            // Check extension validity on connect
            try {
                chrome.runtime.id;
                isExtensionValid = true;
                
                // Send a test message to confirm client type registration
                socket.emit('connection_check', { test: 'chrome_client_test' });
                
            } catch (error) {
                // Silently handle extension context invalidation on connect
                isExtensionValid = false;
                handleExtensionInvalidation();
                return;
            }
        });

        // Enhanced progress handling with extension validation
        socket.on('progress', (data) => {
            // Check extension validity before processing
            if (!validateExtensionContext()) return;
            
            // Check if this is a timecode message and route appropriately
            const progressText = data.progress || data.message || '';
            const isTimecode = progressText.includes(':') || progressText.includes('Clip:');
            
            if (isTimecode) {
                // For timecode messages, this is ALWAYS for the clip button
                updateProgressSafely({
                    ...data,
                    type: 'clip'
                });
            } else {
                // For non-timecode progress, check if it's for a clip import
                const targetType = data.type === 'full' ? 'premiere' : data.type;
                
                // Only show percentage progress for non-clip imports
                if (targetType !== 'clip') {
                updateProgressSafely(data);
                }
            }
        });

        socket.on('percentage', (data) => {
            // Check extension validity before processing
            if (!validateExtensionContext()) return;
            
            // Check if this is a timecode message (contains ':' and text) or a percentage
            const percentageText = data.percentage || '';
            const isTimecode = percentageText.includes(':') || percentageText.includes('Clip:');
            
            let targetType;
            
            if (isTimecode) {
                // For timecode messages, this is ALWAYS for the clip button
                targetType = 'clip';
                
                updateProgressSafely({
                    message: percentageText,
                    type: targetType
                });
            } else {
                // For numeric percentages, determine which button is importing
                let activeButtonType = null;
                for (const [checkType, state] of Object.entries(buttonStates)) {
                    if (state.isimporting) {
                        activeButtonType = checkType;
                        break;
                    }
                }
                
                targetType = activeButtonType || data.type || 'full';
                
                // Only show percentage for non-clip imports
                if (targetType !== 'clip') {
                // Convert percentage and show as progress
                // Remove % and convert to integer to avoid commas or decimals
                let percentage = percentageText.replace('%', '').replace(',', '.').trim();
                const percentageNum = parseFloat(percentage);
                if (!isNaN(percentageNum)) {
                    percentage = Math.round(percentageNum).toString();
                }
                
                updateProgressSafely({
                    progress: percentage,
                    type: targetType
                });
                }
            }
        });

        socket.on('complete', (data) => {
            if (!validateExtensionContext()) return;
            handleimportComplete(data);
        });

        socket.on('import-complete', (data) => {
            if (!validateExtensionContext()) return;
            handleimportComplete(data);
        });

        // Add listener for import_complete as well
        socket.on('import_complete', (data) => {
            if (!validateExtensionContext()) return;
            if (data.success) {
                // Don't assume type 'full' - let handleimportComplete determine from path or use generic handling
                handleimportComplete({success: true, path: data.path});
            }
        });

        // Handle import cancellation specifically
        socket.on('import-cancelled', (data) => {
            console.log('🚫 [SERVER] import cancellation confirmed by server:', data);
            if (!validateExtensionContext()) return;
            
            // Check if this is a recent user cancellation (within last 10 seconds)
            const isRecentUserCancellation = lastUserCancellation && 
                (Date.now() - lastUserCancellation.timestamp) < 10000 &&
                lastUserCancellation.type === (data.type === 'full' ? 'premiere' : data.type);
            
            if (isRecentUserCancellation) {
                console.log('🚫 [SERVER] Ignoring server cancellation - user already cancelled locally');
                return;
            }
            
            // Only reset buttons if they're still in importing state
            let hasActiveimports = false;
            Object.values(buttonStates).forEach(state => {
                if (state.isimporting) {
                    hasActiveimports = true;
                }
            });
            
            if (hasActiveimports) {
                console.log('🚫 [SERVER] Resetting buttons after server cancellation');
            resetAllButtons();
                showNotification(T('downloadCancelled'), 'info', 3000);
            } else {
                console.log('🚫 [SERVER] Buttons already reset');
            }
        });

        socket.on('import-failed', (data) => {
            console.log('❌ [SERVER] import failed:', data);
            if (!validateExtensionContext()) return;
            
            let errorMessage = data.message || data.error || T('errorUnknownDownload');
            
            // Check for compatibility issues that might require an update
            if (errorMessage.includes('version') || errorMessage.includes('incompatible') || 
                errorMessage.includes('unsupported') || errorMessage.includes('upgrade')) {
                errorMessage += T('updateHint');
            }
            
            // Check if this is a user cancellation
            if (errorMessage.includes('annulé par l\'utilisateur') || errorMessage.includes('cancelled by user')) {
                console.log('🚫 [SERVER] Server confirmed user cancellation');
                
                // Check if this is a recent user cancellation
                const isRecentUserCancellation = lastUserCancellation && 
                    (Date.now() - lastUserCancellation.timestamp) < 10000;
                
                if (isRecentUserCancellation) {
                    console.log('🚫 [SERVER] Ignoring server cancellation message - user already cancelled locally');
                    return;
                }
                
                // Only show message and reset if buttons are still in importing state
                let hasActiveimports = false;
                Object.values(buttonStates).forEach(state => {
                    if (state.isimporting) {
                        hasActiveimports = true;
                    }
                });
                
                if (hasActiveimports) {
                    console.log('🚫 [SERVER] Resetting buttons after server cancellation confirmation');
                    resetAllButtons();
                    showNotification(T('downloadCancelled'), 'info', 3000);
                } else {
                    console.log('🚫 [SERVER] Buttons already reset, no additional message needed');
                }
                return;
            }
            
            // For actual errors (not cancellations), always reset and show error
            resetAllButtons();
            
            // Check for specific error types and provide better messages
            if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
                errorMessage = T('error403');
                // Show additional help for 403 errors
                setTimeout(() => {
                    showNotification(T('tip403'), 'info', 8000);
                }, 2000);
            } else if (errorMessage.includes('age') || errorMessage.includes('restriction')) {
                errorMessage = T('errorAgeRestricted');
            } else if (errorMessage.includes('private') || errorMessage.includes('members-only')) {
                errorMessage = T('errorPrivate');
            } else if (errorMessage.includes('geo') || errorMessage.includes('region')) {
                errorMessage = T('errorGeo');
            } else if (errorMessage.includes('unavailable') || errorMessage.includes('removed')) {
                errorMessage = T('errorUnavailable');
            }
            
            showNotification(errorMessage, 'error', 10000);
        });

        // Handle download-failed event (server-side processing error)
        socket.on('download-failed', (data) => {
            console.log('❌ [SERVER] Download failed:', data);
            if (!validateExtensionContext()) return;
            
            let errorMessage = data.message || data.error || T('errorDownload');
            
            // Reset all buttons and show error
            resetAllButtons();
            showNotification(errorMessage, 'error', 10000);
        });

        // Handle diagnostic messages from server
        socket.on('diagnostic', (data) => {
            console.log('🔍 [DIAGNOSTIC] Received:', data);
            if (!validateExtensionContext()) return;
            
            const type = data.type === 'error' ? 'error' : 'warning';
            const message = data.message || 'Diagnostic issue detected';
            
            // Show diagnostic notification with longer duration for errors
            const duration = type === 'error' ? 15000 : 8000;
            showNotification(`⚠️ ${message}`, type, duration);
            
            // Log additional diagnostic info
            if (data.disk_space_gb !== undefined) {
                console.log(`📊 [DIAGNOSTIC] Disk space: ${data.disk_space_gb} GB`);
            }
            if (data.ffmpeg_ok !== undefined) {
                console.log(`📊 [DIAGNOSTIC] FFmpeg OK: ${data.ffmpeg_ok}`);
            }
        });

        socket.on('error', (data) => {
            // Silently handle server errors to prevent console spam
            if (!validateExtensionContext()) return;
            resetAllButtons();
            showNotification(data.message || T('errorProcessing'), 'error');
        });
            
        // Handle processing status updates (especially useful for clips)
        socket.on('processing', (data) => {
            console.log('📊 [SOCKET] Processing event received:', JSON.stringify(data));
            if (!validateExtensionContext()) return;
            
            const buttonType = data.type === 'full' ? 'premiere' : data.type;
            console.log('📊 [PROCESSING] Button type determined:', buttonType, 'from data.type:', data.type);
            
            const button = document.getElementById(
                buttonType === 'premiere' ? 'send-to-premiere-button' :
                buttonType === 'clip' ? 'clip-button' : 'audio-button'
            );

            if (button && buttonStates[buttonType].isimporting) {
                console.log('📊 [PROCESSING] Button found and is importing:', button.id);
                
                // Transition from loading to importing state smoothly
                button.classList.remove('loading');
                button.classList.add('importing');
                
                const progressText = button.querySelector('.progress-text');
                if (progressText) {
                    console.log('📊 [PROCESSING] Updating progress text with message:', data.message);
                    progressText.innerHTML = '';
                    
                    const icon = document.createElement('span');
                    icon.className = 'button-icon';
                    if (button.id === 'send-to-premiere-button') {
                        setButtonIcon(icon, 'movie');
                    } else if (button.id === 'clip-button') {
                        setButtonIcon(icon, 'content_cut');
                    } else if (button.id === 'audio-button') {
                        setButtonIcon(icon, 'music_note');
                    }
                    
                    progressText.appendChild(icon);
                    
                    // For clips, show custom message or default to "Traitement..."
                    let message = data.message || 'Traitement...';
                    if (buttonType === 'clip') {
                        message = data.message || 'Traitement...';
                    }
                    
                    progressText.appendChild(document.createTextNode(' ' + message));
                }
            } else {
                console.log('📊 [PROCESSING] Button not found or not importing - button:', !!button, 'isimporting:', buttonStates[buttonType]?.isimporting);
            }
        });

        // Listen for connection status confirmation from server
        socket.on('connection_status', (data) => {
            // Silently handle connection status - no need to log
        });

        // Handle ping from server (to keep connection alive)
        socket.on('ping', (data) => {
            // Silently handle pings - respond with pong
            if (socket && socket.connected) {
                socket.emit('pong', { timestamp: Date.now() });
            }
        });

        // Send periodic heartbeat during imports to maintain connection
        setInterval(() => {
            if (socket && socket.connected && isimportActive) {
                socket.emit('heartbeat', { 
                    client_type: 'chrome',
                    import_active: true,
                    timestamp: Date.now()
                });
            }
        }, 30000); // Every 30 seconds during imports



        // Connect the socket
        socket.connect();

    } catch (error) {
        // Silently handle socket initialization errors
        if (error.message.includes('Extension context invalidated')) {
            handleExtensionInvalidation();
        }
    }
}

// Function to validate extension context
function validateExtensionContext() {
    // If already handled invalidation, don't check again
    if (invalidationHandled) {
        return false;
    }
    
    try {
        chrome.runtime.id;
        isExtensionValid = true;
        return true;
    } catch (error) {
        // Silently mark as invalid to prevent console spam
        const wasValid = isExtensionValid;
        isExtensionValid = false;
        // Only call handleExtensionInvalidation once when context becomes invalid
        if (wasValid && !invalidationHandled) {
            handleExtensionInvalidation();
        }
        return false;
    }
}

// Global flag to prevent repeated notifications
let invalidationHandled = false;

// Function to handle extension invalidation
function handleExtensionInvalidation() {
    // Only handle once to prevent spam
    if (invalidationHandled) return;
    invalidationHandled = true;
    
    // Silently clean up without any console messages
    
    // Disconnect all observers
    try {
        if (mainMutationObserver) {
            mainMutationObserver.disconnect();
            mainMutationObserver = null;
        }
        if (ytPlayerObserver) {
            ytPlayerObserver.disconnect();
            ytPlayerObserver = null;
        }
    } catch (e) {
        // Silently handle observer disconnection errors
    }
    
    // Disconnect socket
    if (socket) {
        try {
            socket.disconnect();
        } catch (e) {
            // Silently handle socket disconnection errors
        }
        socket = null;
    }
    
    // Reset all button states
    try {
        resetAllButtons();
        // Only show notification once, and only if DOM elements are available
        if (document.body && document.getElementById) {
            showNotification(
                T('extensionReloaded'),
                'info',
                8000
            );
        }
    } catch (error) {
        // Silently handle cleanup errors
    }
}

// Function to attempt reconnection
function attemptReconnection() {
    if (!validateExtensionContext()) return;
    
    reconnectAttempts++;
    // Silently attempt reconnection without console spam
    
    try {
        if (socket) {
            socket.connect();
        } else {
            initializeSocket();
        }
    } catch (error) {
        // Silently handle reconnection errors
        if (reconnectAttempts >= maxReconnectAttempts) {
            showNotification(
                T('reconnectFailed'),
                'error',
                10000
            );
        }
    }
}

// Safe version of updateProgress that validates extension context
function updateProgressSafely(data) {
    try {
        if (!validateExtensionContext()) return;
        updateProgress(data);
    } catch (error) {
        // Silently handle progress update errors to prevent spam
        if (error.message.includes('Extension context invalidated')) {
            handleExtensionInvalidation();
        }
    }
}

// Enhanced updateProgress function with better error handling
function updateProgress(data) {
    try {
        const buttonType = data.type === 'full' ? 'premiere' : data.type;
        
        const button = document.getElementById(
            buttonType === 'premiere' ? 'send-to-premiere-button' :
            buttonType === 'clip' ? 'clip-button' : 'audio-button'
        );

        if (button) {
            // Ensure button is in importing state when receiving progress
            if (!button.classList.contains('importing')) {
                button.classList.remove('loading');
                button.classList.add('importing');
                buttonStates[buttonType].isimporting = true;
            }
            
            const progressText = button.querySelector('.progress-text');
            if (progressText) {
                // Clear content and re-add icon with progress
                progressText.innerHTML = '';
                
                const icon = document.createElement('span');
                icon.className = 'button-icon';
                if (button.id === 'send-to-premiere-button') {
                    setButtonIcon(icon, 'movie');
                } else if (button.id === 'clip-button') {
                    setButtonIcon(icon, 'content_cut');
                } else if (button.id === 'audio-button') {
                    setButtonIcon(icon, 'music_note');
                }
                
                // Add space and progress text
                const progressSpan = document.createElement('span');
                progressSpan.className = 'progress-value';
                
                // Show progress for all button types
                // Priority: message > progress (only for non-clip) > default
                if (data.message !== undefined && data.message !== null) {
                    // For all message types, show them directly
                        progressSpan.textContent = ` ${data.message}`;
                } else if (data.progress !== undefined && data.progress !== null && buttonType !== 'clip') {
                    // Only show percentage for non-clip imports
                    // Convert to integer to avoid decimal points or commas
                    let progressValue = data.progress.toString().replace('%', '').replace(',', '.').trim();
                    // Parse as float then convert to int to handle any decimal values
                    const progressNum = parseFloat(progressValue);
                    if (!isNaN(progressNum)) {
                        progressValue = Math.round(progressNum).toString();
                    }
                    progressSpan.textContent = ` ${progressValue}%`;
                } else {
                    // Fallback based on button type
                    if (buttonType === 'clip') {
                        progressSpan.textContent = ' Traitement...';
                    } else {
                        progressSpan.textContent = ' En cours...';
                    }
                }
                
                progressText.appendChild(icon);
                progressText.appendChild(progressSpan);
            }
        } else {
            // Silently ignore if buttons don't exist yet (normal during page load)
            // This happens when progress events arrive before buttons are created
        }
    } catch (error) {
        // Only log unexpected errors, ignore extension context issues
        if (!error.message.includes('Extension context invalidated')) {
            console.error('🔄 [PROGRESS] Error in updateProgress:', error);
        }
        if (error.message.includes('Extension context invalidated')) {
            handleExtensionInvalidation();
        }
    }
}

function createRipple(event, button) {
    // Remove any existing ripples
    const existingRipples = button.querySelectorAll('.ripple');
    existingRipples.forEach(ripple => ripple.remove());

    const ripple = document.createElement('span');
    const rect = button.getBoundingClientRect();
    
    const size = Math.max(rect.width, rect.height) * 2;
    
    // Calculate ripple position
    let x, y;
    if (event.clientX && event.clientY) {
        // Mouse click
        x = event.clientX - rect.left - size / 2;
        y = event.clientY - rect.top - size / 2;
    } else {
        // Keyboard activation - center the ripple
        x = rect.width / 2 - size / 2;
        y = rect.height / 2 - size / 2;
    }
    
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    ripple.className = 'ripple';
    
    button.appendChild(ripple);
    
    // Clean up ripple after animation
    ripple.addEventListener('animationend', () => {
        if (ripple.parentNode) {
            ripple.remove();
        }
    });
    
    // Fallback cleanup in case animation doesn't fire
    setTimeout(() => {
        if (ripple.parentNode) {
            ripple.remove();
        }
    }, 600);
}

function createButton(id, text, onClick) {
    const button = document.createElement('div');
    button.className = 'import-button';
    button.id = id;
    button.dataset.originalText = text;
    button.dataset.type = id === 'send-to-premiere-button' ? 'premiere' : 
                         id === 'clip-button' ? 'clip' : 'audio';

    // Add icon based on button type
    const icon = document.createElement('span');
    icon.className = 'button-icon';
    if (id === 'send-to-premiere-button') {
        setButtonIcon(icon, 'movie'); // Video icon
    } else if (id === 'clip-button') {
        setButtonIcon(icon, 'content_cut'); // Scissors icon for clip
    } else if (id === 'audio-button') {
        setButtonIcon(icon, 'music_note'); // Music note icon
    }

    const progressText = document.createElement('span');
    progressText.className = 'progress-text';
    progressText.appendChild(icon);
    progressText.appendChild(document.createTextNode(text));
    button.appendChild(progressText);

    const spinnerContainer = document.createElement('div');
    spinnerContainer.className = 'loading-spinner-container';
    const loadingSpinner = document.createElement('div');
    loadingSpinner.className = 'loading-spinner';
    spinnerContainer.appendChild(loadingSpinner);
    button.appendChild(spinnerContainer);

    const cancelButton = document.createElement('div');
    cancelButton.className = 'cancel-button';
    cancelButton.innerHTML = '✕';
    cancelButton.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault(); // Prevent any default behavior
        const buttonType = button.dataset.type;
        if (buttonStates[buttonType].isimporting) {
            console.log('🚫 [CANCEL] User clicked cancel for:', buttonType);
            
            // Mark this as a user cancellation with timestamp
            const cancellationTimestamp = Date.now();
            lastUserCancellation = {
                type: buttonType,
                timestamp: cancellationTimestamp
            };
            
            // Add a cooldown period to prevent immediate new imports
            buttonStates[buttonType].cancelCooldown = true;
            setTimeout(() => {
                buttonStates[buttonType].cancelCooldown = false;
                console.log('🚫 [COOLDOWN] Cancellation cooldown expired for:', buttonType);
            }, 3000); // 3 second cooldown
            
            // Clear the cancellation flag after 15 seconds
            setTimeout(() => {
                if (lastUserCancellation && lastUserCancellation.timestamp === cancellationTimestamp) {
                    lastUserCancellation = null;
                    console.log('🚫 [CLEANUP] Cleared user cancellation flag');
                }
            }, 15000);
            
            // Immediately show cancellation message and reset button
            console.log('🚫 [CANCEL] Showing immediate cancellation feedback');
            showNotification(T('downloadCancelled'), 'info', 3000);
            resetButtonState(button);
            
            // Try to send cancellation to server (but don't wait for response)
            try {
                if (socket && socket.connected) {
                    console.log('🚫 [CANCEL] Sending cancel-import to server');
                    socket.emit('cancel-import', { type: buttonType === 'premiere' ? 'full' : buttonType });
                } else {
                    console.log('🚫 [CANCEL] Socket not connected, but user feedback already shown');
                }
            } catch (error) {
                console.log('🚫 [CANCEL] Error sending cancellation to server (ignored):', error);
            }
        }
    });
    button.appendChild(cancelButton);

    // Enhanced click handler with ripple effect
    button.addEventListener('click', (e) => {
        createRipple(e, button);
        onClick();
    });

    // Add keyboard accessibility
    button.tabIndex = 0;
    button.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            createRipple(e, button);
            onClick();
        }
    });

    return button;
}

function resetButtonState(button) {
    if (!button) return;
    
    const buttonType = button.dataset.type;
    buttonStates[buttonType].isimporting = false;
    
    // Clear any timeout
    if (button.importTimeout) {
        clearTimeout(button.importTimeout);
        button.importTimeout = null;
    }
    
    // Reset both main and fallback buttons
    const allButtons = document.querySelectorAll(`[data-type="${buttonType}"]`);
    allButtons.forEach(btn => {
        btn.classList.remove('importing', 'loading', 'success', 'failure');
        btn.dataset.importing = 'false';
        
        // Clear any timeout on this button too
        if (btn.importTimeout) {
            clearTimeout(btn.importTimeout);
            btn.importTimeout = null;
        }
        
        // Restore original text with icon
        const progressText = btn.querySelector('.progress-text');
        if (progressText) {
            // Clear current content
            progressText.innerHTML = '';
            
            // Re-add icon
            const icon = document.createElement('span');
            icon.className = 'button-icon';
            if (btn.id === 'send-to-premiere-button' || btn.id.includes('send-to-premiere')) {
                setButtonIcon(icon, 'movie');
            } else if (btn.id === 'clip-button' || btn.id.includes('clip')) {
                setButtonIcon(icon, 'content_cut');
            } else if (btn.id === 'audio-button' || btn.id.includes('audio')) {
                setButtonIcon(icon, 'music_note');
            }
            
            progressText.appendChild(icon);
            progressText.appendChild(document.createTextNode(btn.dataset.originalText));
        }
    });
    
    // Re-enable all buttons if no import is in progress
    if (!isAnyimportInProgress()) {
        enableAllButtons();
        isimportActive = false; // Clear global import state
    }
}

function showNotification(message, type = 'info', duration = 5000) {
    // Remove any existing notification
    const existingNotification = document.querySelector('.ytp-notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    const notification = document.createElement('div');
    notification.className = `ytp-notification ${type}`;
    
    const icon = document.createElement('span');
    icon.className = 'ytp-notification-icon';
    icon.textContent = type === 'error' ? '⚠️' : 
                      type === 'warning' ? '⚠️' : 
                      type === 'success' ? '✓' : 'ℹ️';
    
    const content = document.createElement('div');
    content.className = 'ytp-notification-content';
    content.textContent = message;
    
    const closeButton = document.createElement('span');
    closeButton.className = 'ytp-notification-close';
    closeButton.textContent = '✕';
    closeButton.onclick = () => notification.remove();
    
    notification.appendChild(icon);
    notification.appendChild(content);
    notification.appendChild(closeButton);
    
    document.body.appendChild(notification);
    
    // Trigger animation
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Auto remove after duration
    if (duration) {
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }
}

function sendURL(importType, additionalData = {}) {
    const buttonType = importType === 'full' ? 'premiere' : importType;
    // Read now: on TikTok/Instagram/X feeds the next video may be on screen
    // by the time the server and licence checks are done.
    const pageVideoUrl = YTP_SITE.getVideoUrl();
    
    // Check server availability first
    checkServerAvailability().then(isAvailable => {
        if (!isAvailable) {
            // Simply show that server is required
            showServerRequiredMessage(buttonType);
            return;
        }
        
        // Check if this button type is in cancellation cooldown
        if (buttonStates[buttonType].cancelCooldown) {
            console.log('🚫 [COOLDOWN] import blocked - cancellation cooldown active for:', buttonType);
            showNotification(T('cooldown'), 'warning', 3000);
            return;
        }
        
        // Check if any import is in progress
        if (isAnyimportInProgress()) {
            // Find which type is importing
            const importingType = Object.keys(buttonStates).find(type => buttonStates[type].isimporting);
            const importingName = importingType === 'premiere' ? 'Vidéo' : 
                                   importingType === 'clip' ? 'Clip' : 'Audio';
            console.log('🚫 [BLOCK] import blocked - another import is in progress:', importingType);
            showNotification(T('alreadyDownloading', { type: importingName }), 'warning', 3000);
            return;
        }
        
        // Reset all button states first
        Object.keys(buttonStates).forEach(type => {
            buttonStates[type].isimporting = false;
        });
        
        proceedWithImport();
    });
    
    function proceedWithImport() {
    const button = document.getElementById(
        buttonType === 'premiere' ? 'send-to-premiere-button' :
        buttonType === 'clip' ? 'clip-button' : 'audio-button'
    );

    if (button) {
        // Always proceed with import but check authentication for warnings
        enhancedAuthCheck().then(isAuthenticated => {
            if (!isAuthenticated) {
                // Show warning but continue with import
                console.warn('YTP: Authentication warning - user may not be fully logged in');
                showNotification(
                    T('authIncomplete'),
                    'warning',
                    8000
                );
            }
            
            // Continue with import regardless of authentication status
            proceedWithServerCheck();
        }).catch(error => {
            console.error('YTP: Auth check failed:', error);
            // Proceed anyway but warn user
            showNotification(T('authCheckFailed'), 'warning', 5000);
            proceedWithServerCheck();
        });
        
        function proceedWithServerCheck() {
        // First check if server is running via background script
        fetchLocalhostViaBackground('/health', { method: 'GET', timeout: 5000 })
        .then(response => {
            if (!response.ok || !response.success) {
                throw new Error('Server not running');
            }
            // If server is running, then check license via background script
            return fetchLocalhostViaBackground('/check-license', { method: 'GET', timeout: 5000 });
        })
        .then(response => {
            const data = response.data || {};
            if (!data.isValid) {
                button.classList.add('failure');
                enableAllButtons(); // Re-enable all buttons on license failure
                showNotification(T('licenseInvalid'), 'error');
                setTimeout(() => {
                    button.classList.remove('failure');
                }, 1000);
                return;
            }

            // Continue with import if license is valid
            buttonStates[buttonType].isimporting = true;
            button.classList.add('loading');
            button.dataset.importing = 'true';
            
            // Update global import state
            isimportActive = true;
            
            // Disable all buttons during import
            disableAllButtons();
                
                // Add timeout to prevent infinite loading (5 minutes)
                button.importTimeout = setTimeout(() => {
                    console.warn('YTP: import timeout reached for', buttonType);
                    button.classList.remove('importing', 'loading');
                    button.classList.add('failure');
                    buttonStates[buttonType].isimporting = false;
                    enableAllButtons(); // Re-enable all buttons on timeout
                    showNotification(T('timeout'), 'error');
                    setTimeout(() => {
                        resetButtonState(button);
                    }, 3000);
                }, 300000); // 5 minutes timeout
            
            // The video's own URL (sites.js), read when the button was clicked
            const currentVideoUrl = pageVideoUrl;

            if (currentVideoUrl) {
                
                // Always récupérer les cookies YouTube, même si l'authentification semble incomplète
                getCookiesForServer().then(cookiesData => {
                    console.log('YTP: Cookies retrieved for server:', cookiesData.cookies.length, 'cookies');
                    
                    // Log authentication status but don't block import
                    if (cookiesData.cookies.length > 0) {
                        const authCookies = cookiesData.cookies.filter(cookie => 
                            ['SAPISID', 'APISID', 'HSID', 'SSID', 'LOGIN_INFO', '__Secure-3PAPISID', '__Secure-3PSID', 'SID'].includes(cookie.name)
                        );
                        
                        console.log('YTP: Authentication cookies found:', authCookies.length);
                        console.log('YTP: Cookie domains:', [...new Set(cookiesData.cookies.map(c => c.domain))]);
                        
                        if (authCookies.length === 0) {
                            console.warn('YTP: WARNING - No authentication cookies found! User may not be logged in.');
                            // Don't show notification here as we already showed one above
                        } else {
                            console.log('YTP: User appears authenticated - found', authCookies.length, 'auth cookies');
                        }
                        
                        // Log essential cookies for debugging
                        const essentialCookies = cookiesData.cookies.filter(c => 
                            ['LOGIN_INFO', '__Secure-3PAPISID', 'SAPISID'].includes(c.name)
                        );
                        essentialCookies.forEach(cookie => {
                            console.log(`YTP: Essential cookie found: ${cookie.name} (domain: ${cookie.domain})`);
                        });
                    } else {
                        console.warn('YTP: No cookies retrieved! This may cause imports to fail for private or age-restricted videos.');
                    }
                    
                    // Always send the request with whatever cookies we have
                    const requestData = {
                        url: currentVideoUrl,
                        type: importType,
                        cookies: cookiesData.cookies, // Always send cookies, even if empty
                        userAgent: navigator.userAgent,
                        ...additionalData
                    };

                    return fetchLocalhostViaBackground('/handle-video-url', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestData),
                        timeout: 300000 // 5 minutes timeout for video processing
                    });
                })
                .then(response => {
                    const data = response.data || {};
                    return { status: response.status || 200, data: data };
                })
                .then(({status, data}) => {
                    if (status === 403) {
                        resetButtonState(button);
                        showNotification(T('licenseExpired'), 'error');
                        throw new Error('License validation failed');
                    }
                    // Accept both 200 (OK) and 202 (Accepted) status codes
                    if (status !== 200 && status !== 202) {
                        throw new Error(data.error || 'Échec du traitement de la vidéo');
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                        
                        // Clear timeout on error
                        if (button.importTimeout) {
                            clearTimeout(button.importTimeout);
                            button.importTimeout = null;
                        }
                        
                    button.classList.remove('importing', 'loading');
                    button.classList.add('failure');
                        buttonStates[buttonType].isimporting = false;
                        enableAllButtons(); // Re-enable all buttons on import error
                        
                    if (error.message === 'Failed to fetch') {
                        showNotification(T('connectionFailed'), 'error');
                    } else if (error.message === 'License validation failed') {
                        // Don't show another notification since we already showed one above
                    } else {
                        showNotification(error.message || T('processingFailed'), 'error');
                    }
                    setTimeout(() => {
                        button.classList.remove('failure');
                        resetButtonState(button);
                    }, 1000);
                });
            } else {
                // No video ID found
                button.classList.remove('loading');
                button.classList.add('failure');
                enableAllButtons(); // Re-enable all buttons on video ID error
                showNotification(T('videoIdFailed'), 'error');
                setTimeout(() => {
                    button.classList.remove('failure');
                    buttonStates[buttonType].isimporting = false;
                }, 1000);
            }
        })
        .catch(error => {
            console.error('Server check error:', error);
            button.classList.add('failure');
            enableAllButtons(); // Re-enable all buttons on server error
            showNotification(T('ensureRunning'), 'error');
            setTimeout(() => {
                button.classList.remove('failure');
            }, 1000);
        });
        }
    }
    }
}

function createToggleButton() {
    const toggleButton = document.createElement('button');
    toggleButton.className = 'ytp-toggle-button';
    toggleButton.id = 'ytp-toggle-visibility';
    toggleButton.title = buttonsVisible ? T('toggleHide') : T('toggleShow');
    setToggleIcon(toggleButton, buttonsVisible);
    
    if (!buttonsVisible) {
        toggleButton.classList.add('buttons-hidden');
    }
    
    toggleButton.addEventListener('click', toggleButtonsVisibility);
    
    // Keyboard accessibility
    toggleButton.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleButtonsVisibility();
        }
    });
    
    // Accessibility
    toggleButton.setAttribute('aria-label', buttonsVisible ? 'Masquer les boutons YouTube to Premiere' : 'Afficher les boutons YouTube to Premiere');
    toggleButton.tabIndex = 0;
    
    return toggleButton;
}

function toggleButtonsVisibility() {
    buttonsVisible = !buttonsVisible;
    localStorage.setItem('ytp-buttons-visible', buttonsVisible.toString());
    
    const container = document.getElementById('ytp-buttons-container');
    const toggleButton = document.getElementById('ytp-toggle-visibility');
    const mainContainer = document.getElementById('ytp-main-container');
    
    // Update main container
    if (container) {
        if (buttonsVisible) {
            container.classList.remove('hidden');
            if (mainContainer) mainContainer.classList.remove('buttons-collapsed');
        } else {
            container.classList.add('hidden');
            if (mainContainer) mainContainer.classList.add('buttons-collapsed');
        }
    }
    
    // Update toggle button
    if (toggleButton) {
        if (buttonsVisible) {
            toggleButton.classList.remove('buttons-hidden');
            setToggleIcon(toggleButton, true);
            toggleButton.title = T('toggleHide');
            toggleButton.setAttribute('aria-label', 'Masquer les boutons YouTube to Premiere');
        } else {
            toggleButton.classList.add('buttons-hidden');
            setToggleIcon(toggleButton, false);
            toggleButton.title = T('toggleShow');
            toggleButton.setAttribute('aria-label', 'Afficher les boutons YouTube to Premiere');
        }
    }
    
    // Adjust drag handle position
    adjustDragHandlePosition();
}

function adjustDragHandlePosition() {
    // No longer needed - controls are integrated
    return;
}

function showFirstTimeNotification() {
    // Check if this is the first time user sees the toggle button
    const hasSeenToggle = localStorage.getItem('ytp-toggle-seen');
    if (!hasSeenToggle) {
        setTimeout(() => {
            showNotification(
                '👁️ Nouveau ! Utilisez le bouton œil pour masquer/afficher les boutons YouTube to Premiere quand vous n\'en avez pas besoin.',
                'info',
                8000
            );
            localStorage.setItem('ytp-toggle-seen', 'true');
        }, 2000);
    }
}

function positionFloatingButtons() {
    // Position is now fixed in CSS, no need for dynamic positioning
    console.log('YTP: Using fixed bottom-left positioning');
}

// Drag functionality for floating container
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let containerPosition = { x: 20, y: 20 }; // Default bottom-left position
let isPinned = false; // Track pin state

function makeDraggable(container) {
    if (!container) return;
    
    // Load saved pin state first
    safeStorageGet(['ytp-panel-pinned'], (result) => {
        isPinned = result['ytp-panel-pinned'] === true;
        
        // Then load saved position
        const savedPosition = localStorage.getItem('ytp-container-position');
        if (savedPosition) {
            try {
                containerPosition = JSON.parse(savedPosition);
            } catch (e) {
                console.log('YTP: Could not load saved position, using default');
                containerPosition = { x: 20, y: 20 };
            }
        }
        
        // Apply the correct positioning based on pin state
        updateContainerPositioning(container);
        console.log('YTP: Loaded position:', containerPosition, 'isPinned:', isPinned);
    });
    
    // Event listeners for dragging
    const mainContainer = container.querySelector('.ytp-main-container');
    
    // Safety check - only add event listeners if mainContainer exists
    if (mainContainer) {
        // Make entire main container draggable
        mainContainer.addEventListener('mousedown', startDrag);
        mainContainer.addEventListener('touchstart', startDrag, { passive: false });
    } else {
        console.log('YTP: mainContainer not found, will retry adding drag listeners');
        // Retry after a short delay
        setTimeout(() => {
            const retryMainContainer = container.querySelector('.ytp-main-container');
            if (retryMainContainer) {
                retryMainContainer.addEventListener('mousedown', startDrag);
                retryMainContainer.addEventListener('touchstart', startDrag, { passive: false });
            }
        }, 100);
    }
}

function startDrag(e) {
    // A press on a button is a click, not a drag: leave the event alone
    if (e.target.closest('.import-button, .ytp-toggle-button')) {
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    
    const container = document.querySelector('#ytp-floating-container');
    if (!container) return;
    
    isDragging = true;
    container.classList.add('dragging');
    
    const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
    
    const rect = container.getBoundingClientRect();
    dragOffset.x = clientX - rect.left;
    dragOffset.y = clientY - rect.top;
    
    // Add global event listeners
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchmove', handleDrag, { passive: false });
    document.addEventListener('touchend', stopDrag);
    
    // Prevent text selection while dragging
    document.body.style.userSelect = 'none';
}

function handleDrag(e) {
    if (!isDragging) return;
    
    e.preventDefault();
    const container = document.querySelector('#ytp-floating-container');
    if (!container) return;
    
    const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
    
    // Calculate new position
    const newX = clientX - dragOffset.x;
    const newY = clientY - dragOffset.y;
    
    // Get viewport and container dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const containerRect = container.getBoundingClientRect();
    
    if (isPinned) {
        // Absolute positioning - position relative to page
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        
        // Convert viewport coordinates to page coordinates
        const pageX = newX + scrollLeft;
        const pageY = newY + scrollTop;
        
        // Constrain to reasonable bounds (allow some scrolling)
        const constrainedX = Math.max(0, Math.min(pageX, viewportWidth - containerRect.width));
        const constrainedY = Math.max(0, pageY);
        
        containerPosition.x = constrainedX;
        containerPosition.y = constrainedY;
        
        // Apply position
        container.style.left = containerPosition.x + 'px';
        container.style.top = containerPosition.y + 'px';
        container.style.bottom = 'auto';
        container.style.right = 'auto';
        
    } else {
        // Fixed positioning - position relative to viewport
        // Constrain to viewport bounds
        const constrainedX = Math.max(0, Math.min(newX, viewportWidth - containerRect.width));
        const constrainedY = Math.max(0, Math.min(newY, viewportHeight - containerRect.height));
        
        // For fixed positioning, we use bottom instead of top
        containerPosition.x = constrainedX;
        containerPosition.y = viewportHeight - constrainedY - containerRect.height;
        
        // Apply position
        container.style.left = containerPosition.x + 'px';
        container.style.bottom = containerPosition.y + 'px';
        container.style.top = 'auto';
        container.style.right = 'auto';
    }
}

function stopDrag() {
    if (!isDragging) return;
    
    isDragging = false;
    const container = document.querySelector('#ytp-floating-container');
    if (container) {
        container.classList.remove('dragging');
    }
    
    // Remove global event listeners
    document.removeEventListener('mousemove', handleDrag);
    document.removeEventListener('mouseup', stopDrag);
    document.removeEventListener('touchmove', handleDrag);
    document.removeEventListener('touchend', stopDrag);
    
    // Restore text selection
    document.body.style.userSelect = '';
    
    // Save position to localStorage
    localStorage.setItem('ytp-container-position', JSON.stringify(containerPosition));
    
    console.log('YTP: Container position saved:', containerPosition);
}

function updateContainerPosition(container) {
    if (!container) return;
    
    if (isPinned) {
        // Absolute positioning - follows page scroll
        container.style.position = 'absolute';
        container.style.left = containerPosition.x + 'px';
        container.style.top = containerPosition.y + 'px';
        container.style.bottom = 'auto';
        container.style.right = 'auto';
        container.classList.add('pinned');
    } else {
        // Fixed positioning - stays in viewport
        container.style.position = 'fixed';
        container.style.left = containerPosition.x + 'px';
        container.style.bottom = containerPosition.y + 'px';
        container.style.top = 'auto';
        container.style.right = 'auto';
        container.classList.remove('pinned');
    }
}

function updateContainerPositioning(container) {
    if (!container) return;
    
    if (isPinned) {
        // Absolute positioning - follows page scroll
        container.style.position = 'absolute';
        container.classList.add('pinned');
        
        // For absolute positioning, containerPosition should already be in page coordinates
        container.style.left = containerPosition.x + 'px';
        container.style.top = containerPosition.y + 'px';
        container.style.bottom = 'auto';
        container.style.right = 'auto';
    } else {
        // Fixed positioning - stays in viewport
        container.style.position = 'fixed';
        container.classList.remove('pinned');
        
        // For fixed positioning, use bottom instead of top
        container.style.left = containerPosition.x + 'px';
        container.style.bottom = containerPosition.y + 'px';
        container.style.top = 'auto';
        container.style.right = 'auto';
    }
    
    console.log('YTP: Updated positioning - isPinned:', isPinned, 'position:', containerPosition);
    requestAnimationFrame(() => keepContainerOnScreen(container));
}

// A position saved in a bigger window (or before a resize) could leave the
// bar outside the viewport, where it looks like the extension does nothing.
function keepContainerOnScreen(container) {
    container = container || document.querySelector('#ytp-floating-container');
    if (!container || isPinned || isDragging) return;
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const margin = 8;
    const maxX = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxY = Math.max(margin, window.innerHeight - rect.height - margin);
    const x = Math.min(Math.max(containerPosition.x, margin), maxX);
    const y = Math.min(Math.max(containerPosition.y, margin), maxY);
    if (x !== containerPosition.x || y !== containerPosition.y) {
        containerPosition = { x, y };
        container.style.left = x + 'px';
        container.style.bottom = y + 'px';
    }
}

window.addEventListener('resize', () => keepContainerOnScreen());

function checkAvailableSpace() {
    const mainContainer = document.getElementById('ytp-main-container');
    
    if (!mainContainer) return;
    
    // Force visibility if hidden
    if (mainContainer.style.display === 'none' || mainContainer.style.visibility === 'hidden') {
        mainContainer.style.display = 'inline-flex';
        mainContainer.style.visibility = 'visible';
    }
    
    // Simple responsive check based on viewport width for mobile
    const viewportWidth = window.innerWidth;
    mainContainer.classList.remove('compact', 'mini', 'icon-only', 'micro');
    
    if (viewportWidth < 600) {
        mainContainer.classList.add('compact');
    } else if (viewportWidth < 400) {
        mainContainer.classList.add('mini');
    }
}

function addButtons() {
    // Only add buttons if we're on a video or shorts page
    if (!isVideoPage()) {
        return;
    }
    
    // Create fixed container in bottom left
    let targetContainer = document.querySelector('#ytp-floating-container');
    
    if (!targetContainer) {
        // Create floating container
        targetContainer = document.createElement('div');
        targetContainer.id = 'ytp-floating-container';
        targetContainer.className = 'ytp-floating-container';
        
        // Append to body for fixed positioning
        document.body.appendChild(targetContainer);
    }
    
    if (targetContainer) {
        // Check if our container already exists
        if (!document.getElementById('ytp-main-container')) {
            // Create main container for all buttons
            const mainContainer = document.createElement('div');
            mainContainer.className = 'ytp-main-container';
            mainContainer.id = 'ytp-main-container';
            
            // Create container for import buttons
            const buttonsContainer = document.createElement('div');
            buttonsContainer.className = 'ytp-buttons-container';
            buttonsContainer.id = 'ytp-buttons-container';
            
            if (!buttonsVisible) {
                buttonsContainer.classList.add('hidden');
                mainContainer.classList.add('buttons-collapsed');
            }
            
            // Add import buttons to container
            buttonsContainer.appendChild(createButton('send-to-premiere-button', T('btnVideo'), () => {
                sendURL('full');
            }));
            
            // Clips need YouTube's own timeline handling: YouTube only
            if (YTP_SITE.supportsClip) {
                buttonsContainer.appendChild(createButton('clip-button', T('btnClip'), () => {
                    let currentTime = null;

                    // 1) <video> scoped to the main player only. YouTube is a SPA:
                    //    after in-page navigation the page can hold several <video>
                    //    elements (inline previews, shorts) and the old bare
                    //    querySelectorAll('video')[0] fallback could grab one sitting
                    //    at 0 — which sent currentTime=0 and clipped the video start.
                    //    A reported 0 is treated as unreliable (tier 2 then applies).
                    {
                        const videoPlayer =
                            document.querySelector('#movie_player video.html5-main-video') ||
                            document.querySelector('#movie_player video') ||
                            document.querySelector('video.html5-main-video');
                        if (videoPlayer && isFinite(videoPlayer.currentTime) && videoPlayer.currentTime > 0) {
                            currentTime = videoPlayer.currentTime;
                            console.log('YTP: Current time from video element:', currentTime);
                        }
                    }

                    // 2) URL t=/start= parameter (page opened via a timestamped link
                    //    and the player never reported a usable time).
                    if (currentTime === null) {
                        const p = new URLSearchParams(window.location.search);
                        const raw = p.get('t') || p.get('start');
                        if (raw) {
                            const m = String(raw).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
                            if (m && (m[1] || m[2] || m[3])) {
                                currentTime = (parseInt(m[1] || 0) * 3600) +
                                              (parseInt(m[2] || 0) * 60) +
                                              parseInt(m[3] || 0);
                                console.log('YTP: Current time from URL parameter:', currentTime);
                            }
                        }
                    }

                    if (currentTime === null) {
                        currentTime = 0;
                        console.warn('YTP: Could not determine playback time, defaulting to 0');
                    }
                    sendURL('clip', { currentTime });
                }));
            }
            
            buttonsContainer.appendChild(createButton('audio-button', T('btnAudio'), () => {
                sendURL('audio');
            }));
            
            // Check if any import is in progress and disable buttons accordingly
            if (isAnyimportInProgress()) {
                disableAllButtons();
            }
            
            // Check server availability and update button states
            checkServerAvailability();
            
            // Create toggle button
            const toggleButton = createToggleButton();
            
            // Add toggle button FIRST (left side), then buttons container
            mainContainer.appendChild(toggleButton);
            mainContainer.appendChild(buttonsContainer);
            
            // Ensure buttons are visible by default
            mainContainer.style.display = 'inline-flex';
            mainContainer.style.visibility = 'visible';
            
            // Add to container
            targetContainer.appendChild(mainContainer);
            
            // Now make the container draggable AFTER mainContainer is added
            makeDraggable(targetContainer);
            
            // Simple responsive check for mobile
            window.addEventListener('resize', checkAvailableSpace);
            setTimeout(checkAvailableSpace, 500);
            
            // Show first-time notification about the toggle button
            showFirstTimeNotification();
        }
        
        // Update visibility based on current page
        throttledUpdateVisibility();
    } else {
        setTimeout(addButtons, 1000);
    }
}

// Throttling variables for performance
let lastUpdateTime = 0;
let updatePending = false;
const UPDATE_THROTTLE_MS = 250; // Maximum updates every 250ms

// Throttled update function to prevent performance issues
function throttledUpdateVisibility() {
    // Stop if extension is invalidated
    if (invalidationHandled || !isExtensionValid) return;
    
    const now = Date.now();
    
    if (now - lastUpdateTime >= UPDATE_THROTTLE_MS) {
        // Immediate update if enough time has passed
        lastUpdateTime = now;
        updateButtonsVisibilitySafely();
        updatePending = false;
    } else if (!updatePending) {
        // Schedule delayed update if one isn't already pending
        updatePending = true;
        setTimeout(() => {
            // Check again before executing
            if (invalidationHandled || !isExtensionValid) {
                updatePending = false;
                return;
            }
            lastUpdateTime = Date.now();
            updateButtonsVisibilitySafely();
            updatePending = false;
        }, UPDATE_THROTTLE_MS - (now - lastUpdateTime));
    }
}

// Simple observer to recreate buttons if they're removed
const setupObservers = () => {
    // Disconnect existing observers first
    if (mainMutationObserver) {
        mainMutationObserver.disconnect();
    }
    if (ytPlayerObserver) {
        ytPlayerObserver.disconnect();
    }
    
    mainMutationObserver = new MutationObserver(() => {
        // Stop if extension is invalidated
        if (invalidationHandled || !isExtensionValid) return;
        
        // Throttled button visibility update to prevent performance issues
        throttledUpdateVisibility();
        
        // Check if our container was removed and recreate if needed (only on video pages)
        if (isVideoPage() && (!document.getElementById('ytp-floating-container') || 
            !document.getElementById('ytp-main-container'))) {
            setTimeout(addButtons, 100);
        }
    });
    
    // Only observe if extension is still valid
    if (!invalidationHandled && isExtensionValid) {
        mainMutationObserver.observe(document.body, { 
            childList: true, 
            subtree: true
        });
    }
    
    // Add fullscreen event listeners to hide/show buttons
    document.addEventListener('fullscreenchange', throttledUpdateVisibility);
    document.addEventListener('webkitfullscreenchange', throttledUpdateVisibility);
    document.addEventListener('mozfullscreenchange', throttledUpdateVisibility);
    document.addEventListener('MSFullscreenChange', throttledUpdateVisibility);
    
    // Also listen for YouTube-specific fullscreen changes
    ytPlayerObserver = new MutationObserver(() => {
        // Stop if extension is invalidated
        if (invalidationHandled || !isExtensionValid) return;
        throttledUpdateVisibility();
    });
    
    // Observe changes in the YouTube player for fullscreen class changes
    const checkForYtPlayer = () => {
        // Stop if extension is invalidated
        if (invalidationHandled || !isExtensionValid) return;
        
        // Only YouTube has this player; elsewhere this would poll forever
        if (YTP_SITE.id !== 'youtube') return;
        const ytPlayer = document.querySelector('#movie_player, .html5-video-player');
        if (ytPlayer && ytPlayerObserver) {
            ytPlayerObserver.observe(ytPlayer, { 
                attributes: true, 
                attributeFilter: ['class'],
                subtree: false
            });
        } else if (!invalidationHandled && isExtensionValid) {
            // If player not found, retry in a bit
            setTimeout(checkForYtPlayer, 1000);
        }
    };
    
    checkForYtPlayer();
};

// Initial call and observer setup
addButtons();
setupObservers();

// Message listener for popup communication
try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // Check extension validity before processing messages
        if (!validateExtensionContext()) return;
        
        if (message.type === 'YTP_POPUP_MESSAGE') {
            console.log('YTP: Received message from popup:', message);
            
            switch (message.action) {
                case 'TOGGLE_PANEL':
                    handleTogglePanel(message.data.visible);
                    break;
                case 'TOGGLE_PIN':
                    handleTogglePin(message.data.pinned);
                    break;
                case 'UPDATE_BUTTON_SIZE':
                    handleUpdateButtonSize(message.data.size);
                    break;
                case 'UPDATE_AUTO_HIDE':
                    handleUpdateAutoHide(message.data.autoHide);
                    break;
                case 'RESET_POSITION':
                    handleResetPosition(message.data);
                    break;
                case 'CENTER_POSITION':
                    handleCenterPosition();
                    break;
                case 'RESET_ALL_SETTINGS':
                    handleResetAllSettings(message.data);
                    break;
            }
            
            sendResponse({ success: true });
            return true; // Keep message channel open for async response
        }
    });
} catch (error) {
    console.error('YTP: Error setting up message listener:', error);
    if (error.message.includes('Extension context invalidated')) {
        handleExtensionInvalidation();
    }
}

// Functions to handle popup messages
function handleTogglePanel(visible) {
    const container = document.querySelector('#ytp-floating-container');
    if (container) {
        if (visible) {
            container.style.display = 'block';
            container.style.visibility = 'visible';
        } else {
            container.style.display = 'none';
            container.style.visibility = 'hidden';
        }
        
        // Save to storage
        safeStorageSet({ 'ytp-panel-visible': visible });
        console.log('YTP: Panel visibility set to:', visible);
    }
}

function handleTogglePin(pinned) {
    const container = document.querySelector('#ytp-floating-container');
    if (container) {
        const rect = container.getBoundingClientRect();
        
        if (pinned && !isPinned) {
            // Switching from fixed to absolute positioning
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
            
            // Convert fixed coordinates to absolute coordinates
            containerPosition.x = rect.left + scrollLeft;
            containerPosition.y = rect.top + scrollTop;
            
            console.log('YTP: Converting to absolute - new position:', containerPosition);
            
        } else if (!pinned && isPinned) {
            // Switching from absolute to fixed positioning
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
            
            // Convert absolute coordinates to fixed coordinates
            containerPosition.x = Math.max(0, containerPosition.x - scrollLeft);
            containerPosition.y = Math.max(0, window.innerHeight - (containerPosition.y - scrollTop) - rect.height);
            
            console.log('YTP: Converting to fixed - new position:', containerPosition);
        }
        
        isPinned = pinned;
        updateContainerPositioning(container);
        
        // Save both the pin state and the new position
        safeStorageSet({ 'ytp-panel-pinned': pinned });
        localStorage.setItem('ytp-container-position', JSON.stringify(containerPosition));
        
        console.log('YTP: Panel pinned set to:', pinned);
        
        // Notify popup of the change
        notifyPopup('PIN_TOGGLED', { pinned: pinned });
    }
}

function handleUpdateButtonSize(size) {
    const mainContainer = document.getElementById('ytp-main-container');
    if (mainContainer) {
        // Remove all size classes
        mainContainer.classList.remove('compact', 'mini', 'icon-only', 'micro');
        
        // Add appropriate class based on size
        const sizeClasses = ['', 'compact', 'mini', 'micro'];
        if (size > 0 && size < sizeClasses.length) {
            mainContainer.classList.add(sizeClasses[size]);
        }
        
        // Save to storage
        safeStorageSet({ 'ytp-button-size': size.toString() });
        console.log('YTP: Button size updated to:', size);
    }
}

function handleUpdateAutoHide(autoHide) {
    // Store auto-hide preference
    safeStorageSet({ 'ytp-auto-hide': autoHide });
    console.log('YTP: Auto-hide set to:', autoHide);
    
    // Update visibility logic (this will be used in updateButtonsVisibility function)
    throttledUpdateVisibility();
}

function handleResetPosition(position) {
    const container = document.querySelector('#ytp-floating-container');
    if (container) {
        if (isPinned) {
            // For absolute positioning, set position relative to page
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            containerPosition = {
                x: position.x,
                y: position.y + scrollTop
            };
        } else {
            // For fixed positioning, use the position as-is
            containerPosition = { ...position };
        }
        
        updateContainerPositioning(container);
        
        // Save to localStorage
        localStorage.setItem('ytp-container-position', JSON.stringify(containerPosition));
        console.log('YTP: Position reset to:', containerPosition);
    }
}

function handleCenterPosition() {
    const container = document.querySelector('#ytp-floating-container');
    if (container) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const rect = container.getBoundingClientRect();
        
        if (isPinned) {
            // For absolute positioning, center relative to page
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
            
            containerPosition = {
                x: scrollLeft + (viewportWidth - rect.width) / 2,
                y: scrollTop + (viewportHeight - rect.height) / 2
            };
        } else {
            // For fixed positioning, center in viewport
            containerPosition = {
                x: (viewportWidth - rect.width) / 2,
                y: (viewportHeight - rect.height) / 2
            };
        }
        
        updateContainerPositioning(container);
        localStorage.setItem('ytp-container-position', JSON.stringify(containerPosition));
        console.log('YTP: Position centered:', containerPosition);
    }
}

function handleResetAllSettings(settings) {
    // Reset panel visibility
    if (settings['ytp-panel-visible'] !== undefined) {
        const visible = settings['ytp-panel-visible'];
        handleTogglePanel(visible);
        buttonsVisible = visible;
    }
    
    // Reset panel pin state
    if (settings['ytp-panel-pinned'] !== undefined) {
        handleTogglePin(settings['ytp-panel-pinned']);
    }
    
    // Reset button size
    if (settings['ytp-button-size'] !== undefined) {
        handleUpdateButtonSize(parseInt(settings['ytp-button-size']));
    }
    
    // Reset auto-hide
    if (settings['ytp-auto-hide'] !== undefined) {
        handleUpdateAutoHide(settings['ytp-auto-hide']);
    }
    
    // Reset position
    if (settings['ytp-container-position'] !== undefined) {
        try {
            const position = JSON.parse(settings['ytp-container-position']);
            handleResetPosition(position);
        } catch (e) {
            console.log('YTP: Could not parse reset position');
        }
    }
    
    // Reset buttons visibility
    if (settings['ytp-buttons-visible'] !== undefined) {
        // toggleButtonsVisibility() flips the flag, so start from the opposite
        buttonsVisible = settings['ytp-buttons-visible'] !== 'true';
        toggleButtonsVisibility();
    }
    
    console.log('YTP: All settings reset applied');
}

// Function to notify popup of changes
function notifyPopup(action, data = {}) {
    safeRuntimeSendMessage({
        type: 'YTP_CONTENT_MESSAGE',
        action: action,
        data: data
    }, (response) => {
        if (!response) {
            // Popup might not be open, that's okay
            console.log('YTP: Popup not responding (probably closed)');
        }
    });
}

// Load settings from chrome.storage on initialization
function loadSettingsFromStorage() {
    safeStorageGet([
        'ytp-panel-visible',
        'ytp-panel-pinned',
        'ytp-button-size',
        'ytp-auto-hide'
    ], (result) => {
        console.log('YTP: Loaded settings from storage:', result);
        
        // Apply panel visibility
        if (result['ytp-panel-visible'] !== undefined) {
            handleTogglePanel(result['ytp-panel-visible']);
        }
        
        // Apply panel pin state
        if (result['ytp-panel-pinned'] !== undefined) {
            handleTogglePin(result['ytp-panel-pinned']);
        }
        
        // Apply button size
        if (result['ytp-button-size'] !== undefined) {
            handleUpdateButtonSize(parseInt(result['ytp-button-size']));
        }
        
        // Auto-hide is handled in updateButtonsVisibility
    });
}

// Load settings when the script initializes
setTimeout(loadSettingsFromStorage, 1000);

// Update the stopDrag function to notify popup of position changes
const originalStopDrag = stopDrag;
stopDrag = function() {
    originalStopDrag();
    // Notify popup that position was updated
    notifyPopup('POSITION_UPDATED', containerPosition);
};

// Simple navigation listener for YouTube page changes
document.addEventListener('yt-navigate-finish', () => {
    setTimeout(() => {
        // Update button visibility for any page change
        throttledUpdateVisibility();
        
        // Only create buttons if we're on a video page and they don't exist
        if (isVideoPage() && !document.getElementById('ytp-floating-container')) {
            addButtons();
        }
    }, 500);
}); 

// Also listen for URL changes (for direct navigation)
let currentUrl = window.location.href;
setInterval(() => {
    if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        setTimeout(() => {
            throttledUpdateVisibility();
            if (isVideoPage() && !document.getElementById('ytp-floating-container')) {
                addButtons();
            }
        }, 500);
    }
}, 1000);

// Initialize socket when page loads (moved after function definitions)
setTimeout(() => {
    if (validateExtensionContext()) {
        initializeSocket();
    }
}, 1000);

// Handle import completion with success animation
function handleimportComplete(data) {
    console.log('🎯 [COMPLETE] HandleimportComplete called with:', JSON.stringify(data));
    
    let type = data.type;
    let buttonType = null;
    let button = null;
    
    // If type is specified, use it directly
    if (type) {
        buttonType = type === 'full' ? 'premiere' : type;
        button = document.getElementById(
            buttonType === 'premiere' ? 'send-to-premiere-button' :
            buttonType === 'clip' ? 'clip-button' : 'audio-button'
        );
        console.log('🎯 [COMPLETE] Using specified type:', type, '-> buttonType:', buttonType);
    }
    
    // If no type specified or button not found, find the importing button
    if (!button || !type) {
        console.log('🎯 [COMPLETE] No type specified or button not found, searching for importing button...');
        
        // Check which button is currently importing
        for (const [checkType, state] of Object.entries(buttonStates)) {
            if (state.isimporting) {
                buttonType = checkType;
                type = checkType === 'premiere' ? 'full' : checkType;
                button = document.getElementById(
                    buttonType === 'premiere' ? 'send-to-premiere-button' :
                    buttonType === 'clip' ? 'clip-button' : 'audio-button'
                );
                console.log('🎯 [COMPLETE] Found importing button:', buttonType, 'isimporting:', state.isimporting);
                break;
            }
        }
    }
    
    console.log('🎯 [COMPLETE] Final determination - type:', type, 'buttonType:', buttonType, 'button found:', !!button);
    
    // Debug: Log all button states for troubleshooting
    console.log('🎯 [COMPLETE] Current button states:', Object.entries(buttonStates).map(([k,v]) => ({type: k, isimporting: v.isimporting})));

    if (button) {
        console.log('🎯 [COMPLETE] Button found:', button.id, 'current state:', {
            classes: button.className,
            isimporting: buttonStates[buttonType]?.isimporting,
            textContent: button.textContent.substring(0, 50)
        });
        
        // Clear any timeout
        if (button.importTimeout) {
            clearTimeout(button.importTimeout);
            button.importTimeout = null;
        }
        
        // Show success state
        button.classList.remove('importing', 'loading');
        button.classList.add('success');
        buttonStates[buttonType].isimporting = false;
        
        const progressText = button.querySelector('.progress-text');
        if (progressText) {
            progressText.innerHTML = '';
            
            const icon = document.createElement('span');
            icon.className = 'button-icon';
            icon.textContent = 'check';
            
            progressText.appendChild(icon);
            progressText.appendChild(document.createTextNode('Réussi'));
        }
        
        // Reset after showing success
        setTimeout(() => {
            resetButtonState(button);
        }, 2000);
    } else {
        // Fallback: reset all buttons if specific button not found
        resetAllButtons();
    }
}

// Function to reset all buttons to their default state
function resetAllButtons() {
    Object.keys(buttonStates).forEach(type => {
        buttonStates[type].isimporting = false;
        const button = document.getElementById(
            type === 'premiere' ? 'send-to-premiere-button' :
            type === 'clip' ? 'clip-button' : 'audio-button'
        );
        if (button) {
            // Clear any timeout
            if (button.importTimeout) {
                clearTimeout(button.importTimeout);
                button.importTimeout = null;
            }
            resetButtonState(button);
        }
    });
    
    // Re-enable all buttons
    enableAllButtons();
}

// Check authentication status on page load
async function checkAuthenticationStatus() {
    // Skip auth check if extension is invalidated
    if (invalidationHandled || !isExtensionValid) return;
    if (YTP_SITE.id !== 'youtube') return;
    
    try {
        const authStatus = await checkYouTubeAuth();
        
        if (!authStatus.isLoggedIn) {
            // Only show notification on video pages where it's relevant
            if (isVideoPage()) {
                showNotification(T('pleaseSignIn'), 'warning', 10000);
            }
        }
        // Success case is silent to reduce console spam
    } catch (error) {
        // Silently handle auth check errors to prevent console spam
        // These are often network-related and don't affect core functionality
    }
}

// Initialize the extension when the page loads
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        throttledUpdateVisibility();
        if (isVideoPage()) {
            addButtons();
        }
        // Only run auth checks on video pages to reduce unnecessary network calls
        if (isVideoPage()) {
            // Start monitoring YouTube resource errors
            detectYouTubeResourceErrors();
            // Enhanced authentication check (only on video pages)
            enhancedAuthCheck();
        }
    }, 1000);
});

// Also run initialization when the page is ready (in case DOMContentLoaded already fired)
if (document.readyState === 'loading') {
    // DOMContentLoaded listener is already set above
} else {
    // DOM is already ready, run initialization
    setTimeout(() => {
        throttledUpdateVisibility();
        if (isVideoPage()) {
            addButtons();
            // Only run auth checks on video pages to reduce unnecessary network calls
            detectYouTubeResourceErrors();
            enhancedAuthCheck();
        }
    }, 1000);
} 

// Enhanced YouTube resource error detection (disabled to prevent console interference)
function detectYouTubeResourceErrors() {
    if (YTP_SITE.id !== 'youtube') return;
    // Simplified error detection without intercepting console.error
    // This prevents interference with other extensions and debugging
    
    // Listen for network errors via window error events instead
    let youtube403Count = 0;
    let lastErrorTime = 0;
    
    // Monitor for 403 errors in a less intrusive way
    const errorListener = (event) => {
        // Skip if extension is invalidated
        if (invalidationHandled || !isExtensionValid) return;
        
        if (event.error && event.error.message) {
            const errorMsg = event.error.message.toLowerCase();
            if (errorMsg.includes('403') && errorMsg.includes('googlevideo.com')) {
                youtube403Count++;
                lastErrorTime = Date.now();
                
                // If we see multiple 403 errors in a short time, suggest refresh
                if (youtube403Count >= 3 && (Date.now() - lastErrorTime) < 30000) {
                    setTimeout(() => {
                        if (isVideoPage()) {
                            showNotification(
                                T('streamingErrors'),
                                'warning',
                                10000
                            );
                        }
                    }, 2000);
                }
            }
        }
    };
    
    // Only add listener if not already added
    if (!window.ytpErrorListenerAdded) {
        window.addEventListener('error', errorListener);
        window.ytpErrorListenerAdded = true;
    }
    
    // Reset counter periodically
    setInterval(() => {
        if (Date.now() - lastErrorTime > 60000) {
            youtube403Count = 0;
        }
    }, 30000);
}

// Enhanced authentication status check
async function enhancedAuthCheck() {
    // Skip auth check if extension is invalidated
    if (invalidationHandled || !isExtensionValid) return false;
    // Google login cookies only mean something on YouTube
    if (YTP_SITE.id !== 'youtube') return true;
    
    try {
        const authStatus = await checkYouTubeAuth();
        
        if (!authStatus.isLoggedIn) {
            // Only show notification if we're on a video page where imports might happen
            if (isVideoPage()) {
                showNotification(
                    T('notSignedIn'),
                    'warning',
                    8000
                );
            }
            return false;
        }
        
        // Check for specific auth cookies
        const criticalCookies = ['LOGIN_INFO', 'SAPISID', 'SSID'];
        const missingCookies = criticalCookies.filter(cookieName => 
            !authStatus.cookies || !authStatus.cookies.some(cookie => cookie.name === cookieName)
        );
        
        if (missingCookies.length > 0 && isVideoPage()) {
            // Only show warning on video pages
            showNotification(
                T('authIncompleteReconnect'),
                'warning',
                6000
            );
            return false;
        }
        
        return true;
    } catch (error) {
        // Silently handle auth check failures to prevent console spam
        // These are often network-related and don't affect functionality
        return false;
    }
} 






















































































