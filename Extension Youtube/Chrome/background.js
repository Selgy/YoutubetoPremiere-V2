// background.js

// Debug: Version check
console.log('YTP: Background script loaded - Version 3.0.20 with Enhanced Cookie Extraction & Performance Optimizations');

// Cookie cache to avoid repeated extractions
let cookiesCache = { data: null, timestamp: 0 };
const COOKIES_CACHE_DURATION = 30000; // 30 seconds

chrome.action.onClicked.addListener((tab) => {
    // Perform action when the extension icon is clicked
    console.log("Extension icon clicked!");
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('YTP: Background script received message:', message);
    
    if (message.type === 'GET_YOUTUBE_COOKIES') {
        console.log('YTP: Processing GET_YOUTUBE_COOKIES request');
        
        // Check cache first to avoid repeated extractions
        const now = Date.now();
        if (cookiesCache.data && (now - cookiesCache.timestamp) < COOKIES_CACHE_DURATION) {
            console.log('YTP: Serving cookies from cache:', cookiesCache.data.length, 'cookies');
            sendResponse({ cookies: cookiesCache.data });
            return true;
        }
        
        // Cache miss - get fresh cookies
        console.log('YTP: Cookie cache miss - extracting fresh cookies');
        getYouTubeCookies().then(cookies => {
            console.log('YTP: Successfully retrieved cookies:', cookies.length);
            
            // Update cache
            cookiesCache.data = cookies;
            cookiesCache.timestamp = now;
            
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
                return fetch('http://localhost:17845/send-url', {
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
    
    // Handle health check requests from content scripts (to avoid CORS issues)
    if (message.type === 'CHECK_SERVER_HEALTH') {
        console.log('YTP: Processing CHECK_SERVER_HEALTH request');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        fetch('http://localhost:17845/health', {
            method: 'GET',
            signal: controller.signal
        })
        .then(response => {
            clearTimeout(timeoutId);
            sendResponse({ 
                success: response.ok, 
                status: response.status,
                available: response.ok 
            });
        })
        .catch(error => {
            clearTimeout(timeoutId);
            console.log('YTP: Health check failed:', error.message);
            sendResponse({ 
                success: false, 
                available: false,
                error: error.message 
            });
        });
        return true; // Keep message channel open for async response
    }
    
    // Handle license check requests from content scripts (to avoid CORS issues)
    if (message.type === 'CHECK_LICENSE') {
        console.log('YTP: Processing CHECK_LICENSE request');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        fetch('http://localhost:17845/check-license', {
            method: 'GET',
            signal: controller.signal
        })
        .then(response => {
            clearTimeout(timeoutId);
            if (!response.ok) {
                throw new Error('Server not running');
            }
            return response.json();
        })
        .then(data => {
            sendResponse({ 
                success: true, 
                isValid: data.isValid || false,
                data: data 
            });
        })
        .catch(error => {
            clearTimeout(timeoutId);
            console.log('YTP: License check failed:', error.message);
            sendResponse({ 
                success: false, 
                isValid: false,
                error: error.message 
            });
        });
        return true; // Keep message channel open for async response
    }
    
    // Handle generic localhost fetch requests from content scripts
    if (message.type === 'FETCH_LOCALHOST') {
        console.log('YTP: Processing FETCH_LOCALHOST request:', message.url);
        const fetchOptions = message.options || { method: 'GET' };
        const timeout = message.timeout || 5000;
        
        // Create AbortController for timeout (more compatible than AbortSignal.timeout)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        fetch(`http://localhost:17845${message.url}`, {
            ...fetchOptions,
            signal: controller.signal
        })
        .then(async response => {
            clearTimeout(timeoutId);
            const contentType = response.headers.get('content-type');
            let data;
            
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }
            
            sendResponse({ 
                success: response.ok, 
                status: response.status,
                data: data,
                ok: response.ok
            });
        })
        .catch(error => {
            clearTimeout(timeoutId);
            console.log('YTP: Localhost fetch failed:', error.message);
            sendResponse({ 
                success: false, 
                error: error.message,
                ok: false,
                status: error.name === 'AbortError' ? 408 : 500
            });
        });
        return true; // Keep message channel open for async response
    }
});

// Function to get YouTube cookies with advanced extraction
async function getYouTubeCookies() {
    try {
        console.log('YTP: Starting comprehensive cookie extraction...');
        
        // Get cookies from essential YouTube-related domains only
        const domains = [
            '.youtube.com',
            'www.youtube.com', 
            '.google.com',
            'accounts.google.com'
        ];
        
        // OPTIMIZATION: Parallel cookie extraction instead of sequential
        console.log('YTP: Extracting cookies in parallel from', domains.length, 'domains');
        const cookiePromises = domains.map(async (domain) => {
            try {
                const domainCookies = await chrome.cookies.getAll({ domain });
                console.log(`YTP: Retrieved ${domainCookies.length} cookies from ${domain}`);
                return domainCookies;
            } catch (error) {
                console.warn(`YTP: Could not get cookies from ${domain}:`, error);
                return [];
            }
        });
        
        // Wait for all cookie extractions to complete in parallel
        const cookieArrays = await Promise.all(cookiePromises);
        let allCookies = cookieArrays.flat();
        
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
        
        // OPTIMIZATION: Filter to essential authentication cookies only
        const essentialCookieNames = [
            'LOGIN_INFO', '__Secure-3PAPISID', '__Secure-3PSID', '__Secure-3PSIDCC', '__Secure-3PSIDTS',
            'SAPISID', 'APISID', 'HSID', 'SSID', 'SID', 'SIDCC', 'NID'
        ];
        
        const essentialCookies = uniqueCookies.filter(cookie => 
            essentialCookieNames.includes(cookie.name)
        );
        
        // Sort auth cookies by importance
        const authCookiesSorted = essentialCookies.sort((a, b) => {
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
        console.log(`YTP: Essential authentication cookies found: ${authCookiesSorted.length}`);
        
        // Log authentication cookies with detailed info
        authCookiesSorted.forEach(cookie => {
            const expiry = cookie.expirationDate ? new Date(cookie.expirationDate * 1000).toISOString() : 'Session';
            console.log(`YTP: 🔑 ${cookie.name} (${cookie.domain}) = ${cookie.value.substring(0, 15)}... [expires: ${expiry}]`);
        });
        
        // Check authentication status
        const hasLoginInfo = authCookiesSorted.some(c => c.name === 'LOGIN_INFO');
        const hasSecureAuth = authCookiesSorted.some(c => c.name === '__Secure-3PAPISID');
        const hasSapisid = authCookiesSorted.some(c => c.name === 'SAPISID');
        
        if (!hasLoginInfo && !hasSecureAuth && !hasSapisid) {
            console.warn('🚨 YTP: Critical authentication cookies missing! User likely not logged in.');
        } else if (hasLoginInfo && hasSecureAuth) {
            console.log('✅ YTP: Full authentication detected - should handle age-restricted content.');
        } else {
            console.log('⚠️ YTP: Partial authentication detected - may have issues with age-restricted content.');
        }
        
        // Return only essential cookies (much smaller payload)
        console.log(`YTP: Returning ${authCookiesSorted.length} essential cookies (reduced from ${uniqueCookies.length})`);
        return authCookiesSorted;
        
    } catch (error) {
        console.error('YTP: Error retrieving YouTube cookies:', error);
        return [];
    }
}


















































































