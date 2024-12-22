// Add styles to the document
const styleSheet = document.createElement("style");
styleSheet.textContent = `
    .download-button {
        background: #2e2f77;
        color: white;
        padding: 0 12px;
        border-radius: 18px;
        border: none;
        margin: 0 4px;
        cursor: pointer;
        position: relative;
        overflow: hidden;
        transition: all 0.3s ease;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 14px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        min-width: 70px;
        text-align: center;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 36px;
    }

    #send-to-premiere-button {
        margin-left: 16px;
    }

    .download-button:hover {
        background: #4e52ff;
        transform: scale(1.05);
    }

    .download-button.downloading {
        background: #4e52ff;
        pointer-events: auto;
    }

    .download-button .progress-text {
        position: relative;
        z-index: 1;
        transition: opacity 0.3s ease;
        width: 100%;
        text-align: center;
        line-height: 36px;
        display: inline-block;
    }

    .download-button.downloading:hover .progress-text {
        opacity: 0;
    }

    .cancel-button {
        position: absolute;
        top: 0;
        right: 0;
        background: rgba(255, 78, 78, 0.9);
        color: white;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.3s ease;
        pointer-events: none;
        border-radius: 18px;
        z-index: 2;
        font-size: 14px;
    }

    .download-button:hover .cancel-button {
        opacity: 0;
        pointer-events: none;
    }

    .download-button.downloading:hover .cancel-button,
    .download-button.loading:hover .cancel-button {
        opacity: 1;
        pointer-events: auto;
    }

    @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
    }

    .download-button.downloading {
        animation: pulse 2s infinite;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
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
        width: 20px;
        height: 20px;
        border: 2px solid transparent;
        border-radius: 50%;
        border-top-color: white;
        border-right-color: white;
        animation: spin 0.8s linear infinite;
        opacity: 0.8;
    }

    .download-button.loading {
        pointer-events: none;
    }

    .download-button.loading .loading-spinner {
        display: block;
    }

    .download-button.loading .progress-text {
        opacity: 0;
    }

    @keyframes success {
        0% { transform: scale(1); background: #4e52ff; }
        50% { transform: scale(1.1); background: #22c55e; }
        100% { transform: scale(1); background: #2e2f77; }
    }

    @keyframes failure {
        0% { transform: scale(1); background: #4e52ff; }
        50% { transform: scale(1.1); background: #ef4444; }
        100% { transform: scale(1); background: #2e2f77; }
    }

    .download-button.success {
        animation: success 1s ease forwards;
    }

    .download-button.failure {
        animation: failure 1s ease forwards;
    }

    /* Add popup styles */
    .ytp-notification {
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: #2e2f77;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 200px;
        max-width: 400px;
        transform: translateY(150%);
        transition: transform 0.3s ease;
    }

    .ytp-notification.show {
        transform: translateY(0);
    }

    .ytp-notification.error {
        background: #ef4444;
    }

    .ytp-notification.warning {
        background: #f59e0b;
    }

    .ytp-notification.success {
        background: #22c55e;
    }

    .ytp-notification-icon {
        font-size: 20px;
    }

    .ytp-notification-content {
        flex: 1;
    }

    .ytp-notification-close {
        cursor: pointer;
        opacity: 0.8;
        transition: opacity 0.2s ease;
    }

    .ytp-notification-close:hover {
        opacity: 1;
    }
`;
document.head.appendChild(styleSheet);

// Track state per button type
const buttonStates = {
    premiere: { isDownloading: false },
    clip: { isDownloading: false },
    audio: { isDownloading: false }
};

// Socket.IO connection
const socket = io.connect('http://localhost:3001');

function createRipple(event, button) {
    const ripple = document.createElement('span');
    const rect = button.getBoundingClientRect();
    
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;
    
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    ripple.className = 'ripple';
    
    button.appendChild(ripple);
    ripple.addEventListener('animationend', () => {
        ripple.remove();
    });
}

function createButton(id, text, onClick) {
    const button = document.createElement('div');
    button.className = 'download-button';
    button.id = id;
    button.dataset.originalText = text;
    button.dataset.type = id === 'send-to-premiere-button' ? 'premiere' : 
                         id === 'clip-button' ? 'clip' : 'audio';

    const progressText = document.createElement('span');
    progressText.className = 'progress-text';
    progressText.textContent = text;
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

    button.addEventListener('click', onClick);
    return button;
}

function resetButtonState(button) {
    if (!button) return;
    
    const buttonType = button.dataset.type;
    buttonStates[buttonType].isDownloading = false;
    
    button.classList.remove('downloading', 'loading', 'success', 'failure');
    button.dataset.downloading = 'false';
    const progressText = button.querySelector('.progress-text');
    progressText.textContent = button.dataset.originalText;
}

socket.on('percentage', (data) => {
    console.log('Received progress:', data.percentage);
    const buttons = {
        premiere: document.getElementById('send-to-premiere-button'),
        clip: document.getElementById('clip-button'),
        audio: document.getElementById('audio-button')
    };

    // Find the active button
    const activeButtonType = Object.keys(buttonStates).find(type => buttonStates[type].isDownloading);
    const button = buttons[activeButtonType];
    
    if (button) {
        console.log('Updating button:', button.id);
        button.classList.remove('loading');
        const progressText = button.querySelector('.progress-text');
        progressText.textContent = data.percentage;
        button.dataset.downloading = 'true';
        button.classList.add('downloading');
    }
});

// Add notification functions
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

// Modify socket event handlers to use notifications
socket.on('download-failed', (data) => {
    console.error('Download failed:', data);
    const buttons = {
        premiere: document.getElementById('send-to-premiere-button'),
        clip: document.getElementById('clip-button'),
        audio: document.getElementById('audio-button')
    };

    // Find the active button
    const activeButtonType = Object.keys(buttonStates).find(type => buttonStates[type].isDownloading);
    const button = buttons[activeButtonType];
    
    if (button) {
        button.classList.add('failure');
        resetButtonState(button);
    }

    // Show specific error notifications based on error type
    if (data.error === 'Invalid license key' || data.error === 'No license key found') {
        showNotification('No valid license found. Please enter a valid license key in YoutubetoPremiere.', 'error', 8000);
    } else if (data.error === 'License expired') {
        showNotification('Your license has expired. Please renew your license in YoutubetoPremiere.', 'error', 8000);
    } else if (data.error && data.error.includes('license')) {
        showNotification('License validation failed. Please check your license key in YoutubetoPremiere.', 'error', 8000);
    } else {
        showNotification(data.message || 'Failed to download video. Please try again.', 'error', 5000);
    }
});

socket.on('download-complete', (data) => {
    console.log('Download complete:', data);
    const buttons = {
        premiere: document.getElementById('send-to-premiere-button'),
        clip: document.getElementById('clip-button'),
        audio: document.getElementById('audio-button')
    };

    // Find the active button
    const activeButtonType = Object.keys(buttonStates).find(type => buttonStates[type].isDownloading);
    const button = buttons[activeButtonType];
    
    if (button) {
        button.classList.add('success');
        resetButtonState(button);
    }

    showNotification('Download completed successfully!', 'success');
});

socket.on('download-cancelled', () => {
    console.log('Download cancelled');
    const buttons = {
        premiere: document.getElementById('send-to-premiere-button'),
        clip: document.getElementById('clip-button'),
        audio: document.getElementById('audio-button')
    };

    // Find the active button
    const activeButtonType = Object.keys(buttonStates).find(type => buttonStates[type].isDownloading);
    const button = buttons[activeButtonType];
    
    if (button) {
        resetButtonState(button);
    }

    showNotification('Download cancelled', 'warning');
});

// Add error handling for socket connection
socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    showNotification('Failed to connect to YoutubetoPremiere. Please make sure the application is running.', 'error');
});

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
        buttonStates[buttonType].isDownloading = true;
        button.classList.add('loading');
        button.dataset.downloading = 'true';
        
        const videoId = new URLSearchParams(window.location.search).get('v');
        if (videoId) {
            const currentVideoUrl = `https://youtu.be/${videoId}`;
            const serverUrl = 'http://localhost:3001/handle-video-url';
            const requestData = {
                videoUrl: currentVideoUrl,
                downloadType: downloadType,
                ...additionalData
            };

            fetch(serverUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            })
            .then(async response => {
                const data = await response.json();
                if (!response.ok) {
                    if (response.status === 403) {
                        throw { 
                            status: 403, 
                            error: 'License validation failed',
                            message: data.error || 'No valid license found. Please enter a valid license key in YoutubetoPremiere.'
                        };
                    }
                    throw { 
                        status: response.status, 
                        error: data.error || 'Failed to process video',
                        message: data.message || 'An error occurred while processing the video.'
                    };
                }
                return data;
            })
            .catch(error => {
                console.error('Error:', error);
                button.classList.remove('downloading', 'loading');
                button.classList.add('failure');
                
                // Show appropriate error notification based on error type
                if (error.status === 403) {
                    showNotification(error.message, 'error', 8000);
                } else if (error.message && error.message.includes('license')) {
                    showNotification('License validation failed. Please check your license key in YoutubetoPremiere.', 'error', 8000);
                } else {
                    showNotification(error.message || 'Failed to process video. Please try again.', 'error', 5000);
                }

                // Reset button state after error
                setTimeout(() => {
                    resetButtonState(button);
                }, 1000);
            });
        } else {
            showNotification('Could not find video ID. Please try again on a valid YouTube video page.', 'error');
            resetButtonState(button);
        }
    }
}

function addButtons() {
    const ownerContainer = document.querySelector('#owner');
    if (ownerContainer) {
        if (!document.getElementById('send-to-premiere-button')) {
            ownerContainer.appendChild(createButton('send-to-premiere-button', 'Video', () => {
                sendURL('full');
            }));
        }
        if (!document.getElementById('clip-button')) {
            ownerContainer.appendChild(createButton('clip-button', 'Clip', () => {
                const videoPlayer = document.querySelector('video');
                if (videoPlayer) {
                    sendURL('clip', { currentTime: videoPlayer.currentTime });
                }
            }));
        }
        if (!document.getElementById('audio-button')) {
            ownerContainer.appendChild(createButton('audio-button', 'Audio', () => {
                sendURL('audio');
            }));
        }
    } else {
        setTimeout(addButtons, 1000);
    }
}

// Initial call and observer setup
addButtons();
new MutationObserver(addButtons).observe(document.body, { childList: true, subtree: true });
