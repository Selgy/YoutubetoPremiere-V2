const buttonStyles = `
    padding: 9px 18px;
    font-family: "Roboto","Arial",sans-serif;
    font-size: 14px;
    font-weight: 500;
    border: none;
    background-color: #00005B;
    color: #9999FF;
    border-radius: 18px;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: background-color 0.3s ease;
    margin-left: 5px;
    width: 100px;
    text-align: center;
`;

let lastClickedButton = null;
let isRequestInProgress = false;

// Socket.IO connection
const socket = io.connect('http://localhost:3001');

socket.on('percentage', (data) => {
    let button;
    if (lastClickedButton === 'premiere') {
        button = document.getElementById('send-to-premiere-button');
    } else if (lastClickedButton === 'clip') {
        button = document.getElementById('clip-button');
    } else if (lastClickedButton === 'audio') {
        button = document.getElementById('audio-button');
    }
    if (button) {
        button.innerText = `${data.percentage}`;
    }
});

socket.on('download-complete', () => {
    const premiereButton = document.getElementById('send-to-premiere-button');
    const clipButton = document.getElementById('clip-button');
    const audioButton = document.getElementById('audio-button');
    if (premiereButton) premiereButton.innerText = 'Video';
    if (clipButton) clipButton.innerText = 'Clip';
    if (audioButton) audioButton.innerText = 'Audio';
});

function createButton(id, text, onClick, onMouseEnterColor) {
    const button = document.createElement('button');
    button.textContent = text;
    button.id = id;
    button.style.cssText = buttonStyles;
    button.onclick = onClick;
    button.onmouseenter = () => button.style.backgroundColor = onMouseEnterColor;
    button.onmouseleave = () => button.style.backgroundColor = '#00005B';
    return button;
}

function sendURL(downloadType, additionalData = {}) {
    if (isRequestInProgress) return;
    
    isRequestInProgress = true;
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
        }).catch(error => console.error('Error:', error))
        .finally(() => isRequestInProgress = false);
    }
}

// Add buttons to YouTube page
function addButtons() {
    const ownerContainer = document.querySelector('#owner');
    if (ownerContainer) {
        if (!document.getElementById('send-to-premiere-button')) {
            ownerContainer.appendChild(createButton('send-to-premiere-button', 'Video', () => {
                lastClickedButton = 'premiere';
                sendURL('full');
            }, '#1E1E59'));
        }
        if (!document.getElementById('clip-button')) {
            ownerContainer.appendChild(createButton('clip-button', 'Clip', () => {
                lastClickedButton = 'clip';
                const videoPlayer = document.querySelector('video');
                if (videoPlayer) {
                    sendURL('clip', { currentTime: videoPlayer.currentTime });
                }
            }, '#2E2E5F'));
        }
        if (!document.getElementById('audio-button')) {
            ownerContainer.appendChild(createButton('audio-button', 'Audio', () => {
                lastClickedButton = 'audio';
                sendURL('audio');
            }, '#3E3E6F'));
        }
    } else {
        setTimeout(addButtons, 1000);
    }
}

// Initial call and observer setup
addButtons();
new MutationObserver(addButtons).observe(document.body, { childList: true, subtree: true });
