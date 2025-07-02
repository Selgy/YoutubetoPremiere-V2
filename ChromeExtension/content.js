// YouTube to Premiere Pro Extension - Enhanced UI
// Modern button design with icons and improved animations - Original Colors

// Debug: Version check
console.log('YTP: Content script loaded - Version 3.0.3 with Enhanced Cookie Extraction & Debug');

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
            chrome.runtime.sendMessage({
                type: 'GET_YOUTUBE_COOKIES'
            }, (response) => {
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

    .download-button.success {
        background: linear-gradient(135deg, #059669 0%, #10b981 100%);
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
        animation: none;
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

console.log('🎯 [INIT] ButtonStates initialized:', JSON.stringify(buttonStates));

// Visibility state
let buttonsVisible = localStorage.getItem('ytp-buttons-visible') !== 'false';

// Global variables
let socket = null;
let reconnectAttempts = 0;
let maxReconnectAttempts = 3; // Reduced to limit spam when server is unavailable
let reconnectInterval = 2000;
let isExtensionValid = true;

// Observer instances to disconnect on invalidation
let mainMutationObserver = null;
let ytPlayerObserver = null;

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
        
        socket = io('http://localhost:3002', {
            transports: ['websocket', 'polling'],
            upgrade: true,
            rememberUpgrade: false,
            timeout: 10000,
            forceNew: true,
            autoConnect: false,
            query: {
                client_type: 'chrome'
            }
        });
        
        console.log('🔌 [SOCKET] Initializing connection with client_type=chrome');

        socket.on('connect_error', (error) => {
            // Only log connection errors if not expected (when Premiere is closed)
            if (!error.message.includes('ECONNREFUSED') && !error.message.includes('websocket error')) {
                console.error('❌ [SOCKET] Connection ERROR:', error.message);
            }
        });

        socket.on('disconnect', (reason) => {
            // Only log unexpected disconnections, not when server is simply not available
            if (reason !== 'transport close' && reason !== 'transport error') {
                console.log('🔌 [SOCKET] Disconnected from server, reason:', reason);
            }
            
            // Only attempt reconnection if extension is still valid and disconnect wasn't intentional
            // Also, increase reconnection interval to reduce spam
            if (isExtensionValid && reason !== 'io client disconnect' && reconnectAttempts < maxReconnectAttempts) {
                const delayMs = Math.min(reconnectInterval * Math.pow(2, reconnectAttempts), 30000); // Exponential backoff, max 30s
                setTimeout(() => {
                    if (validateExtensionContext()) {
                        attemptReconnection();
                    }
                }, delayMs);
            }
        });

        socket.on('connect', () => {
            // Log successful connection
            console.log('🔌 [SOCKET] Successfully connected to Python server on port 3002');
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
                // For non-timecode progress, show all progress updates immediately
                // The server already handles throttling, so no need to throttle again
                updateProgressSafely(data);
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
                // For numeric percentages, determine which button is downloading
                let activeButtonType = null;
                for (const [checkType, state] of Object.entries(buttonStates)) {
                    if (state.isDownloading) {
                        activeButtonType = checkType;
                        break;
                    }
                }
                
                targetType = activeButtonType || data.type || 'full';
                
                // Convert percentage and show as progress
                const percentage = percentageText.replace('%', '');
                
                updateProgressSafely({
                    progress: percentage,
                    type: targetType
                });
            }
        });

        socket.on('complete', (data) => {
            if (!validateExtensionContext()) return;
            handleDownloadComplete(data);
        });

        socket.on('download-complete', (data) => {
            if (!validateExtensionContext()) return;
            handleDownloadComplete(data);
        });

        // Add listener for import_complete as well
        socket.on('import_complete', (data) => {
            if (!validateExtensionContext()) return;
            if (data.success) {
                // Don't assume type 'full' - let handleDownloadComplete determine from path or use generic handling
                handleDownloadComplete({success: true, path: data.path});
            }
        });

        socket.on('download-failed', (data) => {
            console.log('YTP: Download failed:', data);
            if (!validateExtensionContext()) return;
            resetAllButtons();
            
            let errorMessage = data.message || data.error || 'Erreur de téléchargement inconnue';
            
            // Check for specific error types and provide better messages
            if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
                errorMessage = 'Erreur d\'authentification YouTube (403). Veuillez vous reconnecter à YouTube et réessayer.';
                // Show additional help for 403 errors
                setTimeout(() => {
                    showNotification('Conseil: Rafraîchissez la page YouTube et assurez-vous d\'être connecté.', 'info', 8000);
                }, 2000);
            } else if (errorMessage.includes('age') || errorMessage.includes('restriction')) {
                errorMessage = 'Cette vidéo est soumise à une restriction d\'âge. Veuillez vous connecter à YouTube.';
            } else if (errorMessage.includes('private') || errorMessage.includes('members-only')) {
                errorMessage = 'Cette vidéo est privée ou réservée aux membres.';
            } else if (errorMessage.includes('geo') || errorMessage.includes('region')) {
                errorMessage = 'Cette vidéo n\'est pas disponible dans votre région.';
            } else if (errorMessage.includes('unavailable') || errorMessage.includes('removed')) {
                errorMessage = 'Cette vidéo n\'est plus disponible.';
            }
            
            showNotification(errorMessage, 'error', 10000);
        });

        socket.on('error', (data) => {
            // Silently handle server errors to prevent console spam
            if (!validateExtensionContext()) return;
            resetAllButtons();
            showNotification(data.message || 'Erreur du serveur', 'error');
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

            if (button && buttonStates[buttonType].isDownloading) {
                console.log('📊 [PROCESSING] Button found and is downloading:', button.id);
                
                // Transition from loading to downloading state smoothly
                button.classList.remove('loading');
                button.classList.add('downloading');
                
                const progressText = button.querySelector('.progress-text');
                if (progressText) {
                    console.log('📊 [PROCESSING] Updating progress text with message:', data.message);
                    progressText.innerHTML = '';
                    
                    const icon = document.createElement('span');
                    icon.className = 'button-icon';
                    if (button.id === 'send-to-premiere-button') {
                        icon.textContent = 'movie';
                    } else if (button.id === 'clip-button') {
                        icon.textContent = 'content_cut';
                    } else if (button.id === 'audio-button') {
                        icon.textContent = 'music_note';
                    }
                    
                    progressText.appendChild(icon);
                    const message = data.message || 'Traitement...';
                    progressText.appendChild(document.createTextNode(' ' + message));
                }
            } else {
                console.log('📊 [PROCESSING] Button not found or not downloading - button:', !!button, 'isDownloading:', buttonStates[buttonType]?.isDownloading);
            }
        });

        // Listen for connection status confirmation from server
        socket.on('connection_status', (data) => {
            // Silently handle connection status - no need to log
        });

        // Handle ping from server (to keep connection alive)
        socket.on('ping', (data) => {
            // Silently handle pings - no need to log
        });



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
                'Extension rechargée. Rafraîchissez la page pour continuer.',
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
                'Impossible de se reconnecter au serveur. Veuillez rafraîchir la page.',
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
            // Ensure button is in downloading state when receiving progress
            if (!button.classList.contains('downloading')) {
                button.classList.remove('loading');
                button.classList.add('downloading');
                buttonStates[buttonType].isDownloading = true;
            }
            
            const progressText = button.querySelector('.progress-text');
            if (progressText) {
                // Clear content and re-add icon with progress
                progressText.innerHTML = '';
                
                const icon = document.createElement('span');
                icon.className = 'button-icon';
                if (button.id === 'send-to-premiere-button') {
                    icon.textContent = 'movie';
                } else if (button.id === 'clip-button') {
                    icon.textContent = 'content_cut';
                } else if (button.id === 'audio-button') {
                    icon.textContent = 'music_note';
                }
                
                // Add space and progress text
                const progressSpan = document.createElement('span');
                progressSpan.className = 'progress-value';
                
                // Show progress for all button types
                // Priority: message > progress > default
                if (data.message !== undefined && data.message !== null) {
                    // For clip timecode messages, show them directly
                    if (data.message.includes(':') || data.message.includes('Clip:')) {
                        progressSpan.textContent = ` ${data.message}`;
                    } else {
                        progressSpan.textContent = ` ${data.message}`;
                    }
                } else if (data.progress !== undefined && data.progress !== null) {
                    // Ensure progress is displayed as percentage
                    const progressValue = data.progress.toString().replace('%', '');
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
    button.className = 'download-button';
    button.id = id;
    button.dataset.originalText = text;
    button.dataset.type = id === 'send-to-premiere-button' ? 'premiere' : 
                         id === 'clip-button' ? 'clip' : 'audio';

    // Add icon based on button type
    const icon = document.createElement('span');
    icon.className = 'button-icon';
    if (id === 'send-to-premiere-button') {
        icon.textContent = 'movie'; // Video icon
    } else if (id === 'clip-button') {
        icon.textContent = 'content_cut'; // Scissors icon for clip
    } else if (id === 'audio-button') {
        icon.textContent = 'music_note'; // Music note icon
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
        const buttonType = button.dataset.type;
        if (buttonStates[buttonType].isDownloading) {
            console.log('Cancelling download for:', buttonType);
            socket.emit('cancel-download', { type: buttonType === 'premiere' ? 'full' : buttonType });
            resetButtonState(button);
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
    buttonStates[buttonType].isDownloading = false;
    
    // Clear any timeout
    if (button.downloadTimeout) {
        clearTimeout(button.downloadTimeout);
        button.downloadTimeout = null;
    }
    
    // Reset both main and fallback buttons
    const allButtons = document.querySelectorAll(`[data-type="${buttonType}"]`);
    allButtons.forEach(btn => {
        btn.classList.remove('downloading', 'loading', 'success', 'failure');
        btn.dataset.downloading = 'false';
        
        // Clear any timeout on this button too
        if (btn.downloadTimeout) {
            clearTimeout(btn.downloadTimeout);
            btn.downloadTimeout = null;
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
                icon.textContent = 'movie';
            } else if (btn.id === 'clip-button' || btn.id.includes('clip')) {
                icon.textContent = 'content_cut';
            } else if (btn.id === 'audio-button' || btn.id.includes('audio')) {
                icon.textContent = 'music_note';
            }
            
            progressText.appendChild(icon);
            progressText.appendChild(document.createTextNode(btn.dataset.originalText));
        }
    });
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

function sendURL(downloadType, additionalData = {}) {
    const buttonType = downloadType === 'full' ? 'premiere' : downloadType;
    if (buttonStates[buttonType].isDownloading) return;
    
    // Reset all button states first
    Object.keys(buttonStates).forEach(type => {
        buttonStates[type].isDownloading = false;
    });
    
    const button = document.getElementById(
        buttonType === 'premiere' ? 'send-to-premiere-button' :
        buttonType === 'clip' ? 'clip-button' : 'audio-button'
    );

    if (button) {
        // Always proceed with download but check authentication for warnings
        enhancedAuthCheck().then(isAuthenticated => {
            if (!isAuthenticated) {
                // Show warning but continue with download
                console.warn('YTP: Authentication warning - user may not be fully logged in');
                showNotification(
                    'Attention: Authentification YouTube incomplète. Le téléchargement peut échouer pour certaines vidéos privées ou avec restrictions d\'âge.',
                    'warning',
                    8000
                );
            }
            
            // Continue with download regardless of authentication status
            proceedWithServerCheck();
        }).catch(error => {
            console.error('YTP: Auth check failed:', error);
            // Proceed anyway but warn user
            showNotification('Impossible de vérifier l\'authentification. Tentative de téléchargement...', 'warning', 5000);
            proceedWithServerCheck();
        });
        
        function proceedWithServerCheck() {
        // First check if server is running
        fetch('http://localhost:3002/health')
        .then(response => {
            if (!response.ok) {
                throw new Error('Server not running');
            }
            // If server is running, then check license
            return fetch('http://localhost:3002/check-license');
        })
        .then(response => response.json())
        .then(data => {
            if (!data.isValid) {
                button.classList.add('failure');
                showNotification('Clé de licence invalide ou manquante. Veuillez entrer une clé de licence valide dans les paramètres.', 'error');
                setTimeout(() => {
                    button.classList.remove('failure');
                }, 1000);
                return;
            }

            // Continue with download if license is valid
            buttonStates[buttonType].isDownloading = true;
            button.classList.add('loading');
            button.dataset.downloading = 'true';
                
                // Add timeout to prevent infinite loading (5 minutes)
                button.downloadTimeout = setTimeout(() => {
                    console.warn('YTP: Download timeout reached for', buttonType);
                    button.classList.remove('downloading', 'loading');
                    button.classList.add('failure');
                    buttonStates[buttonType].isDownloading = false;
                    showNotification('Délai d\'attente dépassé pour le téléchargement. Veuillez réessayer.', 'error');
                    setTimeout(() => {
                        resetButtonState(button);
                    }, 3000);
                }, 300000); // 5 minutes timeout
            
            // Extract video ID from different YouTube URL formats
            let videoId = null;
            let currentVideoUrl = null;
            
            // Check if it's a regular YouTube video (/watch?v=...)
            const urlParams = new URLSearchParams(window.location.search);
            videoId = urlParams.get('v');
            
            // If no videoId found, check if it's a YouTube Short (/shorts/...)
            if (!videoId) {
                const pathname = window.location.pathname;
                const shortsMatch = pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
                if (shortsMatch) {
                    videoId = shortsMatch[1];
                }
            }
            
            // If no videoId found, try to extract from current URL
            if (!videoId) {
                // Try to extract from youtu.be links or other formats
                const urlMatch = window.location.href.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
                if (urlMatch) {
                    videoId = urlMatch[1];
                }
            }
            
            if (videoId) {
                // Use the current page URL directly to preserve all parameters and context
                currentVideoUrl = window.location.href;
                
                const serverUrl = 'http://localhost:3002/handle-video-url';
                
                // Always récupérer les cookies YouTube, même si l'authentification semble incomplète
                getCookiesForServer().then(cookiesData => {
                    console.log('YTP: Cookies retrieved for server:', cookiesData.cookies.length, 'cookies');
                    
                    // Log authentication status but don't block download
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
                        console.warn('YTP: No cookies retrieved! This may cause downloads to fail for private or age-restricted videos.');
                    }
                    
                    // Always send the request with whatever cookies we have
                    const requestData = {
                        url: currentVideoUrl,
                        type: downloadType,
                        cookies: cookiesData.cookies, // Always send cookies, even if empty
                        userAgent: navigator.userAgent,
                        ...additionalData
                    };

                    return fetch(serverUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestData)
                    });
                })
                .then(response => response.json().then(data => ({status: response.status, data})))
                .then(({status, data}) => {
                    if (status === 403) {
                        resetButtonState(button);
                        showNotification('Licence invalide ou expirée. Veuillez vérifier votre clé de licence.', 'error');
                        throw new Error('License validation failed');
                    }
                    if (status !== 200) {
                        throw new Error(data.error || 'Échec du traitement de la vidéo');
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                        
                        // Clear timeout on error
                        if (button.downloadTimeout) {
                            clearTimeout(button.downloadTimeout);
                            button.downloadTimeout = null;
                        }
                        
                    button.classList.remove('downloading', 'loading');
                    button.classList.add('failure');
                        buttonStates[buttonType].isDownloading = false;
                        
                    if (error.message === 'Failed to fetch') {
                        showNotification('Connexion au serveur échouée. Assurez-vous qu\'Adobe Premiere Pro est ouvert et que YoutubetoPremiere fonctionne.', 'error');
                    } else if (error.message === 'License validation failed') {
                        // Don't show another notification since we already showed one above
                    } else {
                        showNotification(error.message || 'Échec du traitement de la vidéo', 'error');
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
                showNotification('Impossible de détecter l\'ID de la vidéo YouTube.', 'error');
                setTimeout(() => {
                    button.classList.remove('failure');
                    buttonStates[buttonType].isDownloading = false;
                }, 1000);
            }
        })
        .catch(error => {
            console.error('Server check error:', error);
            button.classList.add('failure');
            showNotification('Veuillez vous assurer que YoutubetoPremiere fonctionne.', 'error');
            setTimeout(() => {
                button.classList.remove('failure');
            }, 1000);
        });
        }
    }
}

function createToggleButton() {
    const toggleButton = document.createElement('button');
    toggleButton.className = 'ytp-toggle-button';
    toggleButton.id = 'ytp-toggle-visibility';
    toggleButton.title = buttonsVisible ? 'Masquer les boutons' : 'Afficher les boutons';
    toggleButton.innerHTML = buttonsVisible ? 'visibility' : 'visibility_off';
    
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
            toggleButton.innerHTML = 'visibility';
            toggleButton.title = 'Masquer les boutons';
            toggleButton.setAttribute('aria-label', 'Masquer les boutons YouTube to Premiere');
        } else {
            toggleButton.classList.add('buttons-hidden');
            toggleButton.innerHTML = 'visibility_off';
            toggleButton.title = 'Afficher les boutons';
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
    e.preventDefault();
    e.stopPropagation();
    
    // Don't start drag if clicking on a button
    if (e.target.closest('.download-button, .ytp-toggle-button')) {
        return;
    }
    
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
}

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
            
            // Create container for download buttons
            const buttonsContainer = document.createElement('div');
            buttonsContainer.className = 'ytp-buttons-container';
            buttonsContainer.id = 'ytp-buttons-container';
            
            if (!buttonsVisible) {
                buttonsContainer.classList.add('hidden');
                mainContainer.classList.add('buttons-collapsed');
            }
            
            // Add download buttons to container
            buttonsContainer.appendChild(createButton('send-to-premiere-button', 'Vidéo', () => {
                sendURL('full');
            }));
            
            buttonsContainer.appendChild(createButton('clip-button', 'Clip', () => {
                const videoPlayer = document.querySelector('video');
                if (videoPlayer) {
                    const currentTime = videoPlayer.currentTime;
                    sendURL('clip', { currentTime });
                }
            }));
            
            buttonsContainer.appendChild(createButton('audio-button', 'Audio', () => {
                sendURL('audio');
            }));
            
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
        buttonsVisible = settings['ytp-buttons-visible'] === 'true';
        localStorage.setItem('ytp-buttons-visible', buttonsVisible.toString());
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

// Handle download completion with success animation
function handleDownloadComplete(data) {
    console.log('🎯 [COMPLETE] HandleDownloadComplete called with:', JSON.stringify(data));
    
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
    
    // If no type specified or button not found, find the downloading button
    if (!button || !type) {
        console.log('🎯 [COMPLETE] No type specified or button not found, searching for downloading button...');
        
        // Check which button is currently downloading
        for (const [checkType, state] of Object.entries(buttonStates)) {
            if (state.isDownloading) {
                buttonType = checkType;
                type = checkType === 'premiere' ? 'full' : checkType;
                button = document.getElementById(
                    buttonType === 'premiere' ? 'send-to-premiere-button' :
                    buttonType === 'clip' ? 'clip-button' : 'audio-button'
                );
                console.log('🎯 [COMPLETE] Found downloading button:', buttonType, 'isDownloading:', state.isDownloading);
                break;
            }
        }
    }
    
    console.log('🎯 [COMPLETE] Final determination - type:', type, 'buttonType:', buttonType, 'button found:', !!button);
    
    // Debug: Log all button states for troubleshooting
    console.log('🎯 [COMPLETE] Current button states:', Object.entries(buttonStates).map(([k,v]) => ({type: k, isDownloading: v.isDownloading})));

    if (button) {
        console.log('🎯 [COMPLETE] Button found:', button.id, 'current state:', {
            classes: button.className,
            isDownloading: buttonStates[buttonType]?.isDownloading,
            textContent: button.textContent.substring(0, 50)
        });
        
        // Clear any timeout
        if (button.downloadTimeout) {
            clearTimeout(button.downloadTimeout);
            button.downloadTimeout = null;
        }
        
        // Show success state
        button.classList.remove('downloading', 'loading');
        button.classList.add('success');
        buttonStates[buttonType].isDownloading = false;
        
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
        buttonStates[type].isDownloading = false;
        const button = document.getElementById(
            type === 'premiere' ? 'send-to-premiere-button' :
            type === 'clip' ? 'clip-button' : 'audio-button'
        );
        if (button) {
            // Clear any timeout
            if (button.downloadTimeout) {
                clearTimeout(button.downloadTimeout);
                button.downloadTimeout = null;
            }
            resetButtonState(button);
        }
    });
}

// Check authentication status on page load
async function checkAuthenticationStatus() {
    // Skip auth check if extension is invalidated
    if (invalidationHandled || !isExtensionValid) return;
    
    try {
        const authStatus = await checkYouTubeAuth();
        
        if (!authStatus.isLoggedIn) {
            // Only show notification on video pages where it's relevant
            if (isVideoPage()) {
                showNotification('Attention: Veuillez vous connecter à YouTube pour télécharger des vidéos.', 'warning', 10000);
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
                                'Erreurs de streaming détectées. Rafraîchir la page pourrait aider.',
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
    
    try {
        const authStatus = await checkYouTubeAuth();
        
        if (!authStatus.isLoggedIn) {
            // Only show notification if we're on a video page where downloads might happen
            if (isVideoPage()) {
                showNotification(
                    'Non connecté à YouTube. Les téléchargements peuvent échouer.',
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
                'Authentification YouTube incomplète. Veuillez vous reconnecter.',
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