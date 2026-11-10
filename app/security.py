"""Who may talk to the local server.

The server drives downloads, writes files and can launch an installer, so it
must only answer its own clients: the Premiere panel, the browser extension
and the YouTube pages the extension runs in. It used to listen on every
interface with CORS '*', which let any machine on the network (and any web
page) reach it.
"""
import re
from urllib.parse import urlparse

# Loopback only. The panel and the extension both run on the same machine.
BIND_HOST = '127.0.0.1'
PORT = 17845

# Host header values we answer to. Anything else is a DNS-rebinding attempt:
# a hostile page whose domain resolves to 127.0.0.1.
_ALLOWED_HOSTNAMES = {'localhost', '127.0.0.1', '[::1]', '::1'}

# Origins of our own clients, as regular expressions (also given to Flask-CORS).
ALLOWED_ORIGIN_PATTERNS = [
    r'^https://([a-z0-9-]+\.)*youtube\.com$',     # content script on YouTube
    r'^chrome-extension://[a-p]{32}$',            # extension background/popup
    r'^moz-extension://[0-9a-f-]{36}$',           # same, Firefox
    r'^https?://(localhost|127\.0\.0\.1)(:\d+)?$',  # panel served by the dev server
    r'^file://.*$',                               # CEP panel
    r'^null$',                                    # CEP panel (file:// serialises to "null")
]
_ORIGIN_RES = [re.compile(p, re.IGNORECASE) for p in ALLOWED_ORIGIN_PATTERNS]

# The only place an update may be downloaded from.
UPDATE_URL_PREFIX = 'https://github.com/Selgy/YoutubetoPremiere-V2/releases/'
UPDATE_ASSETS = ('YouTubetoPremiere-Setup.exe', 'YouTubetoPremiere-macOS.pkg')

# Keys the panel may write through POST /settings. licenseKey is absent on
# purpose: it is only stored by /validate-license, after the licence server
# accepted it.
WRITABLE_SETTINGS = frozenset({
    'resolution', 'downloadPath', 'downloadMP3', 'secondsBefore', 'secondsAfter',
    'notificationVolume', 'notificationSound', 'preferredAudioLanguage',
    'useYouTubeAuth', 'youtubeCookiesStatus', 'premiereBin', 'autoDownloadPathCleared',
})


def is_allowed_origin(origin):
    """True for our clients. No Origin header means a non-browser caller on
    this machine (the panel's Node side, curl, tests), which loopback binding
    already limits to local processes."""
    if not origin:
        return True
    return any(r.match(origin.strip()) for r in _ORIGIN_RES)


def is_allowed_host(host):
    """True when the Host header names this machine."""
    if not host:
        return True  # HTTP/1.0 without Host: cannot be a browser
    host = host.strip().lower()
    if host.startswith('['):                      # [::1]:17845
        name = host.split(']', 1)[0] + ']'
    else:
        name = host.rsplit(':', 1)[0] if ':' in host else host
    return name in _ALLOWED_HOSTNAMES


def is_request_allowed(headers):
    return is_allowed_host(headers.get('Host')) and is_allowed_origin(headers.get('Origin'))


def is_trusted_update_url(url):
    """Only our own GitHub release assets, over https, with no tricks."""
    if not isinstance(url, str) or not url.startswith(UPDATE_URL_PREFIX):
        return False
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.netloc != 'github.com':
        return False
    if '..' in parsed.path or '@' in parsed.netloc:
        return False
    return parsed.path.rsplit('/', 1)[-1] in UPDATE_ASSETS


def filter_writable_settings(data):
    """Keep only the settings a client is allowed to change."""
    if not isinstance(data, dict):
        return {}
    return {k: v for k, v in data.items() if k in WRITABLE_SETTINGS}


def public_settings(settings):
    """Settings as sent to clients: no internals, and never the licence key."""
    out = dict(settings)
    for key in ('SETTINGS_FILE', 'ffmpeg_path', 'ffmpeg_error', 'licenseKey'):
        out.pop(key, None)
    out['hasLicense'] = bool(settings.get('licenseKey'))
    return out
