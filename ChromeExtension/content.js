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

    @keyframes failure {
        0% { 
            transform: scale(1); 
            background: linear-gradient(135deg, #2e2f77 0%, #4e52ff 100%); 
        }
        25% { 
            transform: translateX(-5px) scale(1.02); 
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        }
        50% { 
            transform: translateX(5px) scale(1.02); 
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            box-shadow: 0 8px 25px rgba(239, 68, 68, 0.6);
        }
        75% { 
            transform: translateX(-5px) scale(1.02); 
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        }
        100% { 
            transform: translateX(0) scale(1); 
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
        margin-left: 4px;
        margin-right: 4px;
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
        margin: 0 4px;
        flex-shrink: 0 !important;
        order: -999 !important;
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
        bottom: 20px !important;
        left: 20px !important;
        z-index: 10000 !important;
        pointer-events: auto !important;
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
        padding: 4px 4px 4px 0px !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
        transition: padding 0.3s ease !important;
    }
    
    /* Adjust padding when buttons are hidden */
    .ytp-floating-container .ytp-main-container.buttons-collapsed {
        padding: 4px !important;
    }
    
    /* Center toggle button when buttons are hidden */
    .ytp-floating-container .ytp-main-container.buttons-collapsed .ytp-toggle-button {
        margin: 0 !important;
    }
    
    /* Force nos boutons à rester visibles dans notre container flottant */
    .ytp-floating-container .ytp-buttons-container,
    .ytp-floating-container .download-button,
    .ytp-floating-container .ytp-toggle-button {
        position: relative !important;
        visibility: visible !important;
        display: inline-flex !important;
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
        margin-left: 8px;
        margin-right: 0;
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
        
        if (isVideoPage() && !isFullscreen) {
            floatingContainer.style.display = 'block';
            floatingContainer.style.visibility = 'visible';
        } else {
            floatingContainer.style.display = 'none';
            floatingContainer.style.visibility = 'hidden';
        }
    }
}

function initializeSocket() {
    if (socket && socket.connected) {
        return;
    }

    try {
        socket = io('http://localhost:3001', {
            transports: ['polling', 'websocket'],
            timeout: 10000,
            forceNew: true,
            upgrade: true,
            rememberUpgrade: false,
            maxHttpBufferSize: 1e8,
            pingTimeout: 60000,
            pingInterval: 25000
        });

        socket.on('connect', () => {
            console.log('Connected to server');
        });

        socket.on('connect_error', (error) => {
            console.log('Connection error:', error);
            // Retry connection after a delay
            setTimeout(() => {
                if (!socket.connected) {
                    console.log('Attempting to reconnect...');
                    socket.connect();
                }
            }, 2000);
        });

        socket.on('reconnect', (attemptNumber) => {
            console.log('Reconnected successfully on attempt:', attemptNumber);
        });

        socket.on('progress', (data) => {
            console.log('Progress data:', data);
            
            const buttonType = data.type === 'full' ? 'premiere' : data.type;
            const button = document.getElementById(
                buttonType === 'premiere' ? 'send-to-premiere-button' :
                buttonType === 'clip' ? 'clip-button' : 'audio-button'
            );

            if (button && buttonStates[buttonType].isDownloading) {
                button.classList.remove('loading');
                button.classList.add('downloading');
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
                    
                    progressText.appendChild(icon);
                    progressText.appendChild(document.createTextNode(`${data.progress}%`));
                }
            }
        });

        socket.on('complete', (data) => {
            console.log('Download complete:', data);
            
            const buttonType = data.type === 'full' ? 'premiere' : data.type;
            const button = document.getElementById(
                buttonType === 'premiere' ? 'send-to-premiere-button' :
                buttonType === 'clip' ? 'clip-button' : 'audio-button'
            );

            if (button) {
                button.classList.remove('downloading', 'loading');
                button.classList.add('success');
                const progressText = button.querySelector('.progress-text');
                if (progressText) {
                    // Clear content and show success with icon
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
                    progressText.appendChild(document.createTextNode('Succès !'));
                }

                setTimeout(() => {
                    resetButtonState(button);
                }, 2000);

                if (data.message) {
                    showNotification(data.message, 'success');
                }
            }
        });

        socket.on('error', (data) => {
            console.log('Download error:', data);
            
            const buttonType = data.type === 'full' ? 'premiere' : data.type;
            const button = document.getElementById(
                buttonType === 'premiere' ? 'send-to-premiere-button' :
                buttonType === 'clip' ? 'clip-button' : 'audio-button'
            );

            if (button) {
                button.classList.remove('downloading', 'loading');
                button.classList.add('failure');
                const progressText = button.querySelector('.progress-text');
                if (progressText) {
                    // Clear content and show error with icon
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
                    progressText.appendChild(document.createTextNode('Erreur'));
                }

                setTimeout(() => {
                    resetButtonState(button);
                }, 3000);

                if (data.message) {
                    showNotification(data.message, 'error');
                }
            }
        });

        socket.on('download-complete', (data) => {
            console.log('Download completed:', data);
            // Reset all downloading states
            Object.keys(buttonStates).forEach(type => {
                buttonStates[type].isDownloading = false;
                const button = document.getElementById(
                    type === 'premiere' ? 'send-to-premiere-button' :
                    type === 'clip' ? 'clip-button' : 'audio-button'
                );
                if (button && button.classList.contains('downloading')) {
                    resetButtonState(button);
                }
            });
        });

        socket.on('download-failed', (data) => {
            console.log('Download failed:', data);
            // Reset all downloading states and show error
            Object.keys(buttonStates).forEach(type => {
                buttonStates[type].isDownloading = false;
                const button = document.getElementById(
                    type === 'premiere' ? 'send-to-premiere-button' :
                    type === 'clip' ? 'clip-button' : 'audio-button'
                );
                if (button && button.classList.contains('downloading')) {
                    button.classList.remove('downloading', 'loading');
                    button.classList.add('failure');
                    const progressText = button.querySelector('.progress-text');
                    if (progressText) {
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
                        progressText.appendChild(document.createTextNode('Erreur'));
                    }
                    setTimeout(() => resetButtonState(button), 3000);
                }
            });
            if (data.message) {
                showNotification(data.message, 'error');
            }
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from server');
        });

    } catch (error) {
        console.error('Socket initialization error:', error);
    }
}

// Initialize socket when page loads
setTimeout(initializeSocket, 1000);

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
    
    // Reset both main and fallback buttons
    const allButtons = document.querySelectorAll(`[data-type="${buttonType}"]`);
    allButtons.forEach(btn => {
        btn.classList.remove('downloading', 'loading', 'success', 'failure');
        btn.dataset.downloading = 'false';
        
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
        // First check if server is running
        fetch('http://localhost:3001/health')
        .then(response => {
            if (!response.ok) {
                throw new Error('Server not running');
            }
            // If server is running, then check license
            return fetch('http://localhost:3001/check-license');
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
                
                const serverUrl = 'http://localhost:3001/handle-video-url';
                
                // Récupérer les cookies YouTube avant d'envoyer la requête
                getCookiesForServer().then(cookiesData => {
                    console.log('YTP: Cookies retrieved for server:', cookiesData.cookies.length, 'cookies');
                    
                    if (cookiesData.cookies.length > 0) {
                        // Log authentication cookies for debugging
                        const authCookies = cookiesData.cookies.filter(cookie => 
                            ['SAPISID', 'APISID', 'HSID', 'SSID', 'LOGIN_INFO', '__Secure-3PAPISID', '__Secure-3PSID', 'SID'].includes(cookie.name)
                        );
                        
                        console.log('YTP: Authentication cookies found:', authCookies.length);
                        console.log('YTP: Cookie domains:', [...new Set(cookiesData.cookies.map(c => c.domain))]);
                        
                        if (authCookies.length === 0) {
                            console.warn('YTP: WARNING - No authentication cookies found! User may not be logged in.');
                            showNotification('Attention: Aucun cookie d\'authentification trouvé. Veuillez vous connecter à YouTube.', 'warning', 8000);
                        } else {
                            console.log('YTP: User appears authenticated - found', authCookies.length, 'auth cookies');
                        }
                    } else {
                        console.warn('YTP: No cookies retrieved!');
                        showNotification('Attention: Aucun cookie trouvé. Veuillez vous connecter à YouTube.', 'warning', 8000);
                    }
                    
                    const requestData = {
                        url: currentVideoUrl,
                        type: downloadType,
                        cookies: cookiesData.cookies,
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
                    button.classList.remove('downloading', 'loading');
                    button.classList.add('failure');
                    if (error.message === 'Failed to fetch') {
                        showNotification('Connexion au serveur échouée. Assurez-vous qu\'Adobe Premiere Pro est ouvert et que YoutubetoPremiere fonctionne.', 'error');
                    } else if (error.message === 'License validation failed') {
                        // Don't show another notification since we already showed one above
                    } else {
                        showNotification(error.message || 'Échec du traitement de la vidéo', 'error');
                    }
                    setTimeout(() => {
                        button.classList.remove('failure');
                        buttonStates[buttonType].isDownloading = false;
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

function repositionButtons() {
    // Fixed positioning means no repositioning needed
    console.log('YTP: Buttons use fixed positioning, no repositioning needed');
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
                    sendURL('clip', { currentTime: videoPlayer.currentTime });
                }
            }));
            
            buttonsContainer.appendChild(createButton('audio-button', 'Audio', () => {
                sendURL('audio');
            }));
            
            // Create toggle button
            const toggleButton = createToggleButton();
            
            // Add both containers to main container - toggle button first (left side)
            mainContainer.appendChild(toggleButton);
            mainContainer.appendChild(buttonsContainer);
            
            // Ensure buttons are visible by default
            mainContainer.style.display = 'inline-flex';
            mainContainer.style.visibility = 'visible';
            
            // Add to container
            targetContainer.appendChild(mainContainer);
            
            // Simple responsive check for mobile
            window.addEventListener('resize', checkAvailableSpace);
            setTimeout(checkAvailableSpace, 500);
            
            // Show first-time notification about the toggle button
            showFirstTimeNotification();
        }
        
        // Update visibility based on current page
        updateButtonsVisibility();
    } else {
        setTimeout(addButtons, 1000);
    }
}

// Simple observer to recreate buttons if they're removed
const setupObservers = () => {
    new MutationObserver(() => {
        // Always update button visibility based on current page
        updateButtonsVisibility();
        
        // Check if our container was removed and recreate if needed (only on video pages)
        if (isVideoPage() && (!document.getElementById('ytp-floating-container') || 
            !document.getElementById('ytp-main-container'))) {
            setTimeout(addButtons, 100);
        }
    }).observe(document.body, { 
        childList: true, 
        subtree: true
    });
    
    // Add fullscreen event listeners to hide/show buttons
    document.addEventListener('fullscreenchange', updateButtonsVisibility);
    document.addEventListener('webkitfullscreenchange', updateButtonsVisibility);
    document.addEventListener('mozfullscreenchange', updateButtonsVisibility);
    document.addEventListener('MSFullscreenChange', updateButtonsVisibility);
    
    // Also listen for YouTube-specific fullscreen changes
    const ytPlayerObserver = new MutationObserver(() => {
        updateButtonsVisibility();
    });
    
    // Observe changes in the YouTube player for fullscreen class changes
    const checkForYtPlayer = () => {
        const ytPlayer = document.querySelector('#movie_player, .html5-video-player');
        if (ytPlayer) {
            ytPlayerObserver.observe(ytPlayer, { 
                attributes: true, 
                attributeFilter: ['class'],
                subtree: false
            });
        } else {
            // If player not found, retry in a bit
            setTimeout(checkForYtPlayer, 1000);
        }
    };
    
    checkForYtPlayer();
};

// Initial call and observer setup
addButtons();
setupObservers();



// Simple navigation listener for YouTube page changes
document.addEventListener('yt-navigate-finish', () => {
    setTimeout(() => {
        // Update button visibility for any page change
        updateButtonsVisibility();
        
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
            updateButtonsVisibility();
            if (isVideoPage() && !document.getElementById('ytp-floating-container')) {
                addButtons();
            }
        }, 500);
    }
}, 1000);

 