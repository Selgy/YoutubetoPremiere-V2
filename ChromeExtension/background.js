// background.js

chrome.action.onClicked.addListener((tab) => {
    // Perform action when the extension icon is clicked
    console.log("Extension icon clicked!");

    // Example action: sending the active tab's URL
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'sendURL') {
            chrome.tabs.query({ active: true, currentWindow: true })
                .then(function (tabs) {
                    let url = tabs[0].url;
                    return fetch('http://localhost:3001/send-url', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ url: url })
                    });
                })
                .then(response => response.json()) // Assuming your server returns JSON
                .then(data => console.log(data))
                .catch(error => console.error('Error:', error));
        }
    });
});
