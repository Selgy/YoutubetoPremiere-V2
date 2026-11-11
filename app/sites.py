"""Video sites the extension works on, besides YouTube.

YouTube keeps its own download pipeline (video_processing.py). The other sites
go through site_download.py, which leans on yt-dlp's extractors for them.
Clips are YouTube-only.
"""
from urllib.parse import urlparse

# site id -> registrable domains (a subdomain of any of them belongs to the site)
SITE_DOMAINS = {
    'youtube': ('youtube.com', 'youtu.be', 'youtube-nocookie.com'),
    'tiktok': ('tiktok.com',),
    'instagram': ('instagram.com',),
    'twitter': ('twitter.com', 'x.com'),
    'dailymotion': ('dailymotion.com', 'dai.ly'),
}

SITE_NAMES = {
    'youtube': 'YouTube',
    'tiktok': 'TikTok',
    'instagram': 'Instagram',
    'twitter': 'X (Twitter)',
    'dailymotion': 'Dailymotion',
}


def _hostname(url):
    try:
        parsed = urlparse(url)
    except (TypeError, ValueError, AttributeError):
        return None
    if parsed.scheme not in ('http', 'https'):
        return None
    return (parsed.hostname or '').lower() or None


def _matches(host, domains):
    # Exact match or a real subdomain: 'evil-x.com' must not pass as 'x.com'
    return any(host == d or host.endswith('.' + d) for d in domains)


def site_of(url):
    """Site id for a URL, or None when it is not a supported site."""
    host = _hostname(url)
    if not host:
        return None
    for site, domains in SITE_DOMAINS.items():
        if _matches(host, domains):
            return site
    return None


def is_supported_url(url):
    return site_of(url) is not None


def is_youtube_url(url):
    return site_of(url) == 'youtube'


def cookie_matches_site(cookie_domain, site):
    """True when a browser cookie belongs to `site` (its domain may start with '.')."""
    host = str(cookie_domain or '').lower().lstrip('.')
    return bool(host) and _matches(host, SITE_DOMAINS.get(site, ()))
