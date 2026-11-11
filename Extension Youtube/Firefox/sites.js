// Supported sites: which page shows a video and which URL to send to the server.
// Loaded before content.js on every supported site, and by the background
// script for the cookie domains. Keep in step with app/sites.py.
(function (root) {
    'use strict';

    const SITE_DOMAINS = {
        youtube: ['youtube.com', 'youtu.be'],
        tiktok: ['tiktok.com'],
        instagram: ['instagram.com'],
        twitter: ['twitter.com', 'x.com'],
        dailymotion: ['dailymotion.com', 'dai.ly'],
    };

    function siteForHost(host) {
        host = String(host || '').toLowerCase();
        for (const [id, domains] of Object.entries(SITE_DOMAINS)) {
            if (domains.some(d => host === d || host.endsWith('.' + d))) return id;
        }
        return null;
    }

    // The video the user is watching: the one playing, else the most visible.
    function activeVideo() {
        let best = null;
        let bestScore = 0;
        const vh = window.innerHeight || 0;
        const vw = window.innerWidth || 0;
        for (const v of document.querySelectorAll('video')) {
            const r = v.getBoundingClientRect();
            const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
            const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
            const visible = w * h;
            if (visible <= 0) continue;
            const score = visible * (v.paused ? 1 : 1000);
            if (score > bestScore) {
                best = v;
                bestScore = score;
            }
        }
        return best;
    }

    function hasVisibleVideo() {
        return activeVideo() !== null;
    }

    const youtube = {
        id: 'youtube',
        name: 'YouTube',
        supportsClip: true,
        isVideoPage() {
            const path = location.pathname;
            return (path === '/watch' && location.search.includes('v=')) || path.startsWith('/shorts/');
        },
        getVideoUrl() {
            const v = new URLSearchParams(location.search).get('v');
            if (v) return location.href;
            if (/^\/shorts\/[\w-]+/.test(location.pathname)) return location.href;
            const m = location.href.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
            return m ? location.href : null;
        },
    };

    const tiktok = {
        id: 'tiktok',
        name: 'TikTok',
        supportsClip: false,
        isVideoPage: hasVisibleVideo,
        getVideoUrl() {
            // A single video page: /@user/video/123
            const page = location.pathname.match(/^\/(@[\w.-]+)\/video\/(\d+)/);
            const video = activeVideo();
            // Feeds: the player wrapper is id="xgwrapper-<n>-<videoId>"
            const wrapper = video && video.closest('[id^="xgwrapper-"]');
            const fromWrapper = wrapper && wrapper.id.match(/(\d{15,})$/);
            if (fromWrapper) {
                const user = page ? page[1] : '@';
                return `https://www.tiktok.com/${user}/video/${fromWrapper[1]}`;
            }
            if (page) return `https://www.tiktok.com/${page[1]}/video/${page[2]}`;
            return null;
        },
    };

    const INSTAGRAM_POST = /^\/(?:[\w.]+\/)?(p|reels?|tv)\/([\w-]{5,})\/?/;

    const instagram = {
        id: 'instagram',
        name: 'Instagram',
        supportsClip: false,
        isVideoPage: hasVisibleVideo,
        getVideoUrl() {
            const video = activeVideo();
            // Feed: the post's own link sits in the <article> around the video
            const article = video && video.closest('article');
            if (article) {
                for (const a of article.querySelectorAll('a[href]')) {
                    const m = a.getAttribute('href').match(INSTAGRAM_POST);
                    if (m && m[2] !== 'audio') return `https://www.instagram.com/p/${m[2]}/`;
                }
            }
            // Post, reel or reels-feed page: the URL follows the video on screen
            const m = location.pathname.match(INSTAGRAM_POST);
            if (m && m[2] !== 'audio') return `https://www.instagram.com/p/${m[2]}/`;
            if (/^\/stories\/[\w.]+\/\d+/.test(location.pathname)) {
                return 'https://www.instagram.com' + location.pathname;
            }
            return null;
        },
    };

    const TWEET = /^\/(\w{1,15})\/status\/(\d+)/;

    const twitter = {
        id: 'twitter',
        name: 'X',
        supportsClip: false,
        isVideoPage: hasVisibleVideo,
        getVideoUrl() {
            const video = activeVideo();
            const article = video && video.closest('article');
            if (article) {
                // The post's timestamp links to the post itself
                const time = article.querySelector('a[href*="/status/"] time');
                const links = [time && time.closest('a'), ...article.querySelectorAll('a[href*="/status/"]')];
                for (const a of links) {
                    const m = a && a.getAttribute('href').match(TWEET);
                    if (m) return `https://x.com/${m[1]}/status/${m[2]}`;
                }
            }
            const m = location.pathname.match(TWEET);
            return m ? `https://x.com/${m[1]}/status/${m[2]}` : null;
        },
    };

    const dailymotion = {
        id: 'dailymotion',
        name: 'Dailymotion',
        supportsClip: false,
        isVideoPage() {
            return /^\/video\/[a-z0-9]+/i.test(location.pathname);
        },
        getVideoUrl() {
            const m = location.pathname.match(/^\/video\/([a-z0-9]+)/i);
            return m ? `https://www.dailymotion.com/video/${m[1]}` : null;
        },
    };

    const ADAPTERS = { youtube, tiktok, instagram, twitter, dailymotion };

    root.YTP_SITE_DOMAINS = SITE_DOMAINS;
    root.ytpSiteForHost = siteForHost;
    if (typeof location !== 'undefined' && typeof document !== 'undefined') {
        root.YTP_SITE = ADAPTERS[siteForHost(location.hostname)] || youtube;
    }
})(typeof self !== 'undefined' ? self : this);
