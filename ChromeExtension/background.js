// background.js

// Debug: Version check
console.log('YTP: Background script loaded - Version 3.0.0 with Enhanced Cookie Extraction');

chrome.action.onClicked.addListener((tab) => {
    // Perform action when the extension icon is clicked
    console.log("Extension icon clicked!");
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('YTP: Background script received message:', message);
    
    if (message.type === 'GET_YOUTUBE_COOKIES') {
        console.log('YTP: Processing GET_YOUTUBE_COOKIES request');
        
        // Get YouTube cookies
        getYouTubeCookies().then(cookies => {
            console.log('YTP: Successfully retrieved cookies:', cookies.length);
            sendResponse({ cookies: cookies });
        }).catch(error => {
            console.error('YTP: Error getting cookies:', error);
            sendResponse({ cookies: [], error: error.message });
        });
        return true; // Keep the message channel open for async response
    }
    
    if (message.action === 'sendURL') {
        chrome.tabs.query({ active: true, currentWindow: true })
            .then(function (tabs) {
                let url = tabs[0].url;
                return fetch('http://localhost:3002/send-url', {
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

// Function to get YouTube cookies with advanced extraction
async function getYouTubeCookies() {
    try {
        console.log('YTP: Starting comprehensive cookie extraction...');
        
        // Get cookies from all YouTube-related domains with specific patterns
        const domains = [
            '.youtube.com',
            'www.youtube.com', 
            'youtube.com',
            'm.youtube.com',
            '.google.com',
            'accounts.google.com',
            '.googleapis.com',
            'myaccount.google.com',
            'play.google.com'
        ];
        
        let allCookies = [];
        
        // Extract cookies from each domain
        for (const domain of domains) {
            try {
                const domainCookies = await chrome.cookies.getAll({ domain });
                
                // Also try with URL-based extraction for better results
                try {
                    const urlCookies = await chrome.cookies.getAll({ 
                        url: `https://${domain.replace('.', '')}` 
                    });
                    domainCookies.push(...urlCookies);
                } catch (e) {
                    console.debug(`YTP: URL-based extraction failed for ${domain}:`, e);
                }
                
                allCookies.push(...domainCookies);
                console.log(`YTP: Retrieved ${domainCookies.length} cookies from ${domain}`);
                
                // Log specific auth cookies for this domain
                const domainAuthCookies = domainCookies.filter(cookie => 
                    ['SAPISID', 'APISID', 'HSID', 'SSID', 'LOGIN_INFO', '__Secure-3PAPISID', '__Secure-3PSID', 'SID', '__Secure-1PAPISID', '__Secure-1PSID'].includes(cookie.name)
                );
                if (domainAuthCookies.length > 0) {
                    console.log(`YTP: Found ${domainAuthCookies.length} auth cookies on ${domain}:`, 
                        domainAuthCookies.map(c => c.name).join(', '));
                }
                
            } catch (error) {
                console.warn(`YTP: Could not get cookies from ${domain}:`, error);
            }
        }
        
        // Try to get cookies from the current YouTube tab if available
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0] && tabs[0].url && tabs[0].url.includes('youtube.com')) {
                const tabCookies = await chrome.cookies.getAll({ url: tabs[0].url });
                allCookies.push(...tabCookies);
                console.log(`YTP: Retrieved ${tabCookies.length} cookies from current YouTube tab`);
            }
        } catch (error) {
            console.debug('YTP: Could not get cookies from current tab:', error);
        }
        
        // Deduplicate cookies by name and domain, keeping the most recent
        const cookieMap = new Map();
        allCookies.forEach(cookie => {
            const key = `${cookie.name}:${cookie.domain}`;
            const existing = cookieMap.get(key);
            if (!existing || (cookie.expirationDate && (!existing.expirationDate || cookie.expirationDate > existing.expirationDate))) {
                cookieMap.set(key, cookie);
            }
        });
        
        const uniqueCookies = Array.from(cookieMap.values());
        
        // Filter and analyze authentication cookies
        const authCookieNames = [
            'SAPISID', 'APISID', 'HSID', 'SSID', 'SID', 'LOGIN_INFO',
            '__Secure-1PAPISID', '__Secure-1PSID', '__Secure-1PSIDCC', '__Secure-1PSIDTS',
            '__Secure-3PAPISID', '__Secure-3PSID', '__Secure-3PSIDCC', '__Secure-3PSIDTS',
            'SIDCC', 'NID', '__Secure-ROLLOUT_TOKEN'
        ];
        
        const authCookies = uniqueCookies.filter(cookie => 
            authCookieNames.includes(cookie.name)
        );
        
        // Sort auth cookies by importance
        const authCookiesSorted = authCookies.sort((a, b) => {
            const importance = {
                'LOGIN_INFO': 10,
                '__Secure-3PAPISID': 9,
                '__Secure-3PSID': 8,
                'SAPISID': 7,
                'APISID': 6,
                'SID': 5,
                'HSID': 4,
                'SSID': 3
            };
            return (importance[b.name] || 0) - (importance[a.name] || 0);
        });
        
        console.log(`YTP: Total unique cookies: ${uniqueCookies.length}`);
        console.log(`YTP: Authentication cookies found: ${authCookies.length}`);
        
        // Log authentication cookies with detailed info
        authCookiesSorted.forEach(cookie => {
            const expiry = cookie.expirationDate ? new Date(cookie.expirationDate * 1000).toISOString() : 'Session';
            console.log(`YTP: 🔑 ${cookie.name} (${cookie.domain}) = ${cookie.value.substring(0, 15)}... [expires: ${expiry}]`);
        });
        
        // Check authentication status
        const hasLoginInfo = authCookies.some(c => c.name === 'LOGIN_INFO');
        const hasSecureAuth = authCookies.some(c => c.name === '__Secure-3PAPISID');
        const hasSapisid = authCookies.some(c => c.name === 'SAPISID');
        
        if (!hasLoginInfo && !hasSecureAuth && !hasSapisid) {
            console.warn('🚨 YTP: Critical authentication cookies missing! User likely not logged in.');
        } else if (hasLoginInfo && hasSecureAuth) {
            console.log('✅ YTP: Full authentication detected - should handle age-restricted content.');
        } else {
            console.log('⚠️ YTP: Partial authentication detected - may have issues with age-restricted content.');
        }
        
        // Return cookies sorted by importance (auth cookies first)
        const otherCookies = uniqueCookies.filter(cookie => !authCookieNames.includes(cookie.name));
        return [...authCookiesSorted, ...otherCookies];
        
    } catch (error) {
        console.error('YTP: Error retrieving YouTube cookies:', error);
        return [];
    }
}



























