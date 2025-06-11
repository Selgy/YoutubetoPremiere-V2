// YouTube to Premiere Pro Extension - Enhanced UI
// Modern button design with icons and improved animations - Original Colors

// Debug: Version check
console.log('YTP: Content script loaded - Version 3.0.3 with Enhanced Cookie Extraction & Debug');

// Fonction pour récupérer les cookies YouTube pour le serveur
async function getCookiesForServer() {
    return new Promise((resolve) => {
        console.log('YTP: Getting YouTube cookies for server');
        
        try {
            chrome.runtime.sendMessage({
                type: 'GET_YOUTUBE_COOKIES'
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('YTP: Chrome runtime error:', chrome.runtime.lastError);
                    resolve({ cookies: [], error: chrome.runtime.lastError.message });
                    return;
                }
                
                const cookies = response ? response.cookies || [] : [];
                console.log('YTP: Retrieved', cookies.length, 'cookies for server');
                resolve({ cookies: cookies });
            });
        } catch (error) {
            console.error('YTP: Error getting cookies for server:', error);
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
        authCookieCount: authCookies.length
    };
}

// Fonction pour guider l'utilisateur vers la connexion si nécessaire
function promptUserLogin() {
    const notification = showNotification(
        'Pour télécharger des vidéos avec restrictions d\'âge, veuillez vous connecter à votre compte YouTube dans cet onglet, puis rafraîchir la page.', 
        'info', 
        10000
    );
    
    // Ajouter un bouton pour ouvrir la page de connexion YouTube
    setTimeout(() => {
        const loginButton = document.createElement('button');
        loginButton.textContent = 'Se connecter à YouTube';
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
    console.log('YTP: Content script received message:', event.data);
    
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
    /* Import Google Fonts for icons */
    @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200');

    .download-button {
        background: linear-gradient(135deg, #2e2f77 0%, #4e52ff 100%);
        color: white;
        padding: 0 12px;
        border-radius: 18px;
        border: none;
        margin: 0 2px;
        cursor: pointer;
        position: relative !important;
        overflow: hidden;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        font-family: "Roboto", "Arial", sans-serif;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(46, 47, 119, 0.4);
        width: 90px;
        text-align: center;
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        height: 36px;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        flex-shrink: 0 !important;
        order: -999 !important;
        z-index: 50 !important;
    }
    
    /* Empêche YouTube de réorganiser nos boutons */
    #top-level-buttons-computed .ytp-main-container,
    #top-level-buttons .ytp-main-container {
        position: sticky !important;
        left: 0 !important;
        top: 0 !important;
    }
    
    /* Force nos boutons à rester visibles même quand YouTube réorganise */
    .ytp-main-container .ytp-buttons-container,
    .ytp-main-container .download-button,
    .ytp-main-container .ytp-toggle-button {
        position: relative !important;
        visibility: visible !important;
        display: inline-flex !important;
    }

    .download-button::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
        transition: left 0.5s;
    }

    .download-button:hover::before {
        left: 100%;
    }

    #send-to-premiere-button {
        background: linear-gradient(135deg, #2e2f77 0%, #4e52ff 100%);
        box-shadow: 0 4px 12px rgba(46, 47, 119, 0.4);
    }

    #clip-button {
        background: linear-gradient(135deg, #2e2f77 0%, #4e52ff 100%);
        box-shadow: 0 4px 12px rgba(46, 47, 119, 0.4);
    }

    #audio-button {
        background: linear-gradient(135deg, #2e2f77 0%, #4e52ff 100%);
        box-shadow: 0 4px 12px rgba(46, 47, 119, 0.4);
    }

    .download-button:hover {
        transform: scale(1.05);
        background: linear-gradient(135deg, #4e52ff 0%, #6366f1 100%);
        box-shadow: 0 8px 25px rgba(78, 82, 255, 0.6);
    }

    .download-button:active {
        transform: translateY(0) scale(0.98);
    }

    .download-button.downloading {
        background: linear-gradient(135deg, #2e2f77 0%, #4e52ff 100%);
        pointer-events: auto;
        animation: pulse 2s infinite;
    }

    .download-button .progress-text {
        position: relative;
        z-index: 1;
        transition: all 0.3s ease;
        width: 100%;
        height: 100%;
        text-align: center;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        font-weight: 500;
        vertical-align: middle;
    }

    .download-button .button-icon {
        font-family: 'Material Symbols Outlined';
        font-size: 18px;
        font-weight: 400;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .download-button.downloading:hover .progress-text {
        opacity: 0;
    }

    .cancel-button {
        position: absolute;
        top: 0;
        right: 0;
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        color: white;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        pointer-events: none;
        border-radius: 12px;
        z-index: 2;
        font-size: 16px;
        font-weight: 600;
        backdrop-filter: blur(10px);
    }

    .download-button:hover .cancel-button {
        opacity: 0;
        pointer-events: none;
    }

    .download-button.downloading:hover .cancel-button,
    .download-button.loading:hover .cancel-button {
        opacity: 1;
        pointer-events: auto;
        transform: scale(1.05);
    }

    @keyframes pulse {
        0% { 
            transform: scale(1);
            box-shadow: 0 4px 12px rgba(46, 47, 119, 0.4);
        }
        50% { 
            transform: scale(1.02);
            box-shadow: 0 8px 20px rgba(78, 82, 255, 0.6);
        }
        100% { 
            transform: scale(1);
            box-shadow: 0 4px 12px rgba(46, 47, 119, 0.4);
        }
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    @keyframes ripple {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }

    .ripple {
        position: absolute;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.6);
        transform: scale(0);
        animation: ripple 0.6s linear;
        pointer-events: none;
    }

    .loading-spinner-container {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
    }

    .loading-spinner {
        display: none;
        width: 24px;
        height: 24px;
        border: 3px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        border-top-color: white;
        animation: spin 1s linear infinite;
    }

    .download-button.loading {
        pointer-events: none;
        background: linear-gradient(135deg, #2e2f77 0%, #4e52ff 100%);
    }

    .download-button.loading .loading-spinner {
        display: block;
    }

    .download-button.loading .progress-text {
        opacity: 0;
    }

    @keyframes success {
        0% { 
            transform: scale(1); 
            background: linear-gradient(135deg, #2e2f77 0%, #4e52ff 100%); 
        }
        50% { 
            transform: scale(1.1); 
            background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
            box-shadow: 0 8px 25px rgba(34, 197, 94, 0.6);
        }
        100% { 
            transform: scale(1); 
            background: linear-gradient(135deg, #2e2f77 0%, #4e52ff 100%); 
        }
    }

    .download-button.success {
        animation: success 1.5s ease forwards;
    }

    .download-button.failure {
        animation: failure 1.5s ease forwards;
    }

    /* Enhanced notification styles */
    .ytp-notification {
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: linear-gradient(135deg, rgba(46, 47, 119, 0.95) 0%, rgba(78, 82, 255, 0.95) 100%);
        backdrop-filter: blur(20px);
        color: white;
        padding: 16px 20px;
        border-radius: 16px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 250px;
        max-width: 400px;
        transform: translateY(150%) scale(0.8);
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .ytp-notification.show {
        transform: translateY(0) scale(1);
    }

    .ytp-notification.error {
        background: linear-gradient(135deg, rgba(239, 68, 68, 0.95) 0%, rgba(220, 38, 38, 0.95) 100%);
    }

    .ytp-notification.warning {
        background: linear-gradient(135deg, rgba(245, 158, 11, 0.95) 0%, rgba(217, 119, 6, 0.95) 100%);
    }

    .ytp-notification.success {
        background: linear-gradient(135deg, rgba(34, 197, 94, 0.95) 0%, rgba(22, 163, 74, 0.95) 100%);
    }

    .ytp-notification-icon {
        font-size: 24px;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
    }

    .ytp-notification-content {
        flex: 1;
        line-height: 1.4;
    }

    .ytp-notification-close {
        cursor: pointer;
        padding: 4px;
        border-radius: 50%;
        transition: all 0.2s ease;
        font-size: 16px;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .ytp-notification-close:hover {
        background: rgba(255, 255, 255, 0.2);
        transform: scale(1.1);
    }

    /* Enhanced focus states for accessibility */
    .download-button:focus {
        outline: none;
        box-shadow: 0 0 0 3px rgba(78, 82, 255, 0.4);
    }

    /* Toggle button styles */
    .ytp-toggle-button {
        background: linear-gradient(135deg, rgba(46, 47, 119, 0.9) 0%, rgba(78, 82, 255, 0.9) 100%);
        color: white;
        border: none;
        border-radius: 50%;
        width: 40px;
        height: 36px;
        cursor: pointer;
        position: relative;
        margin-left: 0;
        margin-right: 8px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 2px 8px rgba(46, 47, 119, 0.3);
        font-family: 'Material Symbols Outlined';
        font-size: 18px;
        z-index: 1000;
        flex-shrink: 0;
        order: -1000;
    }

    .ytp-toggle-button:hover {
        transform: scale(1.1);
        background: linear-gradient(135deg, rgba(78, 82, 255, 0.9) 0%, rgba(99, 102, 241, 0.9) 100%);
        box-shadow: 0 4px 15px rgba(78, 82, 255, 0.5);
    }

    .ytp-toggle-button:active {
        transform: scale(0.95);
    }

    .ytp-buttons-container {
        display: inline-flex !important;
        align-items: center;
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        opacity: 1;
        transform: translateX(0);
        max-width: 500px;
        overflow: visible;
        padding: 4px;
        margin: 0 0 0 4px;
        flex-shrink: 0 !important;
        order: 999 !important;
        position: relative !important;
        z-index: 100 !important;
    }

    .ytp-buttons-container.hidden {
        opacity: 0;
        transform: translateX(-20px);
        max-width: 0;
        margin: 0;
        padding: 0;
        overflow: hidden;
    }

    .ytp-buttons-container.hidden .download-button {
        margin: 0;
        padding: 0;
        min-width: 0;
        pointer-events: none;
        transform: scale(0);
    }

    .ytp-toggle-button.buttons-hidden {
        background: linear-gradient(135deg, rgba(107, 114, 128, 0.9) 0%, rgba(75, 85, 99, 0.9) 100%);
    }

    .ytp-toggle-button.buttons-hidden:hover {
        background: linear-gradient(135deg, rgba(75, 85, 99, 0.9) 0%, rgba(55, 65, 81, 0.9) 100%);
    }

    /* Responsive design for space constraints */
    .ytp-main-container {
        display: inline-flex !important;
        align-items: center;
        transition: all 0.3s ease;
        margin-left: 16px;
        overflow: visible;
        padding: 8px 0;
        min-width: fit-content;
        visibility: visible !important;
        opacity: 1 !important;
        max-width: 100%;
        flex-shrink: 1;
    }

    /* Special styling when in actions container */
    #actions .ytp-main-container,
    #actions-inner .ytp-main-container {
        margin-left: 16px;
        margin-right: 8px;
        padding: 0;
    }

    /* Align with YouTube's action buttons */
    #actions .ytp-main-container .download-button,
    #actions-inner .ytp-main-container .download-button {
        height: 36px;
        min-width: 85px;
    }

    /* Fixed container in bottom left corner */
    .ytp-floating-container {
        position: fixed !important;
        z-index: 10000 !important;
        pointer-events: auto !important;
        cursor: move !important;
        user-select: none !important;
        transition: left 0.3s ease, bottom 0.3s ease, transform 0.2s ease, opacity 0.2s ease !important;
    }
    
    /* Drag handle for moving the container */
    .ytp-drag-handle {
        display: none !important;
    }
    
    /* Pin button for fixing position */
    .ytp-pin-button {
        display: none !important;
    }
    
    .ytp-floating-container .ytp-main-container {
        display: inline-flex !important;
        align-items: center !important;
        height: 36px !important;
        z-index: 10001 !important;
        white-space: nowrap !important;
        background: rgba(0, 0, 0, 0.2) !important;
        backdrop-filter: blur(10px) !important;
        border-radius: 18px !important;
        padding: 4px 0px 4px 4px !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
        transition: padding 0.3s ease !important;
        position: relative !important;
        cursor: move !important;
    }
    
    .ytp-floating-container.pinned {
        position: absolute !important;
    }
    
    .ytp-floating-container.dragging {
        opacity: 0.8 !important;
        transform: scale(1.02) !important;
        transition: none !important;
    }
    
    /* Adjust padding when buttons are hidden */
    .ytp-floating-container .ytp-main-container.buttons-collapsed {
        padding: 4px !important;
    }
    
    /* Center toggle button when buttons are hidden */
    .ytp-floating-container .ytp-main-container.buttons-collapsed .ytp-toggle-button {
        margin: 0 !important;
    }

    /* Match YouTube's like/dislike button styling exactly */
    .ytp-floating-container .ytp-main-container .download-button {
        height: 36px;
        width: 90px;
        padding: 0 12px;
        margin: 0 2px;
        border-radius: 18px;
        font-size: 14px;
        font-weight: 500;
        line-height: 1;
        vertical-align: middle;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .ytp-floating-container .ytp-main-container .ytp-toggle-button {
        margin-left: 0;
        margin-right: 8px;
        width: 40px;
        height: 36px;
        vertical-align: middle;
        box-sizing: border-box;
    }

    .ytp-main-container.compact {
        margin-left: 8px;
    }

    .ytp-main-container.compact .download-button {
        height: 32px;
        padding: 0 10px;
        font-size: 13px;
        min-width: 56px;
        margin: 0 3px;
        border-radius: 16px;
    }

    .ytp-main-container.compact .progress-text {
        gap: 4px;
    }

    .ytp-main-container.compact .ytp-toggle-button {
        width: 32px;
        height: 32px;
        font-size: 16px;
        margin-left: 6px;
    }

    .ytp-main-container.compact .button-icon {
        font-size: 16px;
    }

    .ytp-main-container.mini {
        margin-left: 4px;
    }

    .ytp-main-container.mini .download-button {
        height: 28px;
        padding: 0 8px;
        font-size: 12px;
        min-width: 48px;
        margin: 0 2px;
        border-radius: 14px;
    }

    .ytp-main-container.mini .progress-text {
        gap: 3px;
    }

    .ytp-main-container.mini .ytp-toggle-button {
        width: 28px;
        height: 28px;
        font-size: 14px;
        margin-left: 4px;
    }

    .ytp-main-container.mini .button-icon {
        font-size: 14px;
    }

    /* Hide text in very compact mode, show only icons */
    .ytp-main-container.icon-only .download-button {
        min-width: 36px;
        padding: 0 6px;
        height: 30px;
        margin: 0 2px;
        border-radius: 15px;
    }

    .ytp-main-container.icon-only .progress-text {
        font-size: 0;
    }

    .ytp-main-container.icon-only .button-icon {
        margin: 0;
        font-size: 18px;
    }

    .ytp-main-container.icon-only .ytp-toggle-button {
        width: 26px;
        height: 26px;
        font-size: 13px;
    }

    /* Ultra compact mode for extreme space constraints */
    .ytp-main-container.micro .download-button {
        min-width: 24px;
        padding: 0 2px;
        height: 24px;
        margin: 0 1px;
        border-radius: 12px;
    }

    .ytp-main-container.micro .progress-text {
        font-size: 0;
    }

    .ytp-main-container.micro .button-icon {
        margin: 0;
        font-size: 14px;
    }

    .ytp-main-container.micro .ytp-toggle-button {
        width: 24px;
        height: 24px;
        font-size: 12px;
        margin-left: 2px;
    }

    .ytp-main-container.micro {
        margin-left: 2px;
    }

    /* Progress states for compact modes */
    .ytp-main-container.icon-only .download-button.downloading .progress-text,
    .ytp-main-container.micro .download-button.downloading .progress-text {
        font-size: 0;
    }

    .ytp-main-container.icon-only .download-button.downloading .button-icon,
    .ytp-main-container.micro .download-button.downloading .button-icon {
        font-size: inherit;
        animation: spin 1s linear infinite;
    }

    .ytp-main-container.icon-only .download-button.downloading .button-icon::after,
    .ytp-main-container.micro .download-button.downloading .button-icon::after {
        content: '⟳';
        position: absolute;
        color: white;
    }

    /* Mobile responsiveness */
    @media (max-width: 768px) {
        .download-button {
            height: 32px;
            padding: 0 10px;
            font-size: 13px;
            min-width: 56px;
            margin: 0 3px;
        }

        .ytp-notification {
            bottom: 16px;
            right: 16px;
            left: 16px;
            max-width: none;
            padding: 12px 16px;
        }

        .ytp-toggle-button {
            width: 32px;
            height: 32px;
            font-size: 16px;
        }

        .ytp-main-container.compact .download-button {
            height: 28px;
            padding: 0 8px;
            font-size: 11px;
            min-width: 48px;
        }
    }
`;

document.head.appendChild(styleSheet);

// Button states tracking
const buttonStates = {
    premiere: { isDownloading: false },
    clip: { isDownloading: false },
    audio: { isDownloading: false }
};

// Visibility state
let buttonsVisible = localStorage.getItem('ytp-buttons-visible') !== 'false';

// Socket connection
let socket = null;

// Function to check if we're on a video or shorts page
function isVideoPage() {
    const currentPath = window.location.pathname;
    const hasVideoParam = window.location.search.includes('v=');
    const isWatchPage = currentPath === '/watch' && hasVideoParam;
    const isShortsPage = currentPath.startsWith('/shorts/');
    
    return isWatchPage || isShortsPage;
}

// Function to show/hide the floating container based on page type
function updateButtonsVisibility() {
    const floatingContainer = document.querySelector('#ytp-floating-container');
    
    if (floatingContainer) {
        // Check if we're in fullscreen mode
        const isFullscreen = document.fullscreenElement || 
                           document.webkitFullscreenElement || 
                           document.mozFullScreenElement || 
                           document.msFullscreenElement ||
                           // Check if YouTube player is in fullscreen
                           document.querySelector('.ytp-fullscreen');
        
        // Check auto-hide setting
        chrome.storage.local.get(['ytp-auto-hide'], (result) => {
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

function initializeSocket() {
    if (socket && socket.connected) {
        return;
    }

    try {
        socket = io('http://localhost:3001', {
            transports: ['websocket', 'polling'],  // Prefer WebSocket, fallback to polling
            upgrade: true,  // Allow upgrading from polling to websocket
            rememberUpgrade: true,  // Remember successful upgrades
            reconnection: true,
            reconnectionAttempts: 10,  // Reasonable limit instead of infinity
            reconnectionDelay: 2000,  // Start with 2 second delay
            reconnectionDelayMax: 10000,  // Max 10 second delay
            timeout: 30000,  // 30 second timeout
            forceNew: false,  // Reuse existing connections when possible
            autoConnect: true,
            maxHttpBufferSize: 1e6,  // 1MB buffer size
            query: { 
                client_type: 'chrome',
                version: '3.0.3'
            },
            // Additional optimizations for Chrome extension environment
            pingTimeout: 120000,  // 2 minute ping timeout
            pingInterval: 30000,   // 30 second ping interval  
            jsonp: false,          // Disable JSONP for better security
            closeOnBeforeunload: true,  // Clean close on page unload
            // Optimize for Chrome extension
            compression: false,    // Disable compression for reliability
            perMessageDeflate: false,  // Disable per-message compression
            // Cookie settings
            withCredentials: false,  // Disable credentials for localhost
            // Transport-specific settings
            transportOptions: {
                polling: {
                    extraHeaders: {
                        'User-Agent': 'Chrome-Extension-YoutubetoPremiere'
                    }
                },
                websocket: {
                    extraHeaders: {
                        'User-Agent': 'Chrome-Extension-YoutubetoPremiere'
                    }
                }
            }
        });

        socket.on('connect', () => {
            console.log('Connected to server');
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from server');
        });

        socket.on('error', (error) => {
            console.error('Socket error:', error);
        });

    } catch (error) {
        console.error('Failed to initialize socket:', error);
    }
}

// Function to show notifications
function showNotification(message, type = 'success', duration = 5000) {
    const notification = document.createElement('div');
    notification.className = 'ytp-notification';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? '#dc3545' : type === 'info' ? '#17a2b8' : '#28a745'};
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        max-width: 350px;
        font-family: Arial, sans-serif;
        font-size: 14px;
        line-height: 1.4;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, duration);
    
    return notification;
}

// Initialize the extension when DOM is ready
function initializeExtension() {
    console.log('YTP: Initializing extension');
    
    // Initialize socket connection
    initializeSocket();
    
    // Update button visibility based on page type
    updateButtonsVisibility();
    
    // Listen for page navigation changes
    let currentUrl = window.location.href;
    const observer = new MutationObserver(() => {
        if (window.location.href !== currentUrl) {
            currentUrl = window.location.href;
            setTimeout(() => {
                updateButtonsVisibility();
            }, 1000);
        }
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // Listen for fullscreen changes
    document.addEventListener('fullscreenchange', updateButtonsVisibility);
    document.addEventListener('webkitfullscreenchange', updateButtonsVisibility);
    document.addEventListener('mozfullscreenchange', updateButtonsVisibility);
    document.addEventListener('MSFullscreenChange', updateButtonsVisibility);
}

// Start the extension when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
    initializeExtension();
}
