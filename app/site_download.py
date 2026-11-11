"""Video and audio downloads from TikTok, Instagram, X (Twitter) and Dailymotion.

The YouTube pipeline in video_processing.py is built around YouTube's formats
(separate AVC1 video and AAC audio streams, SABR, player clients). These sites
mostly serve ready-muxed MP4 or HLS, so this path is short: pick the best
H.264 rendition, let yt-dlp download and merge, convert to H.264 only when the
site had nothing else, then hand the file to Premiere like every other route.
"""
import logging
import os
import re
import tempfile
import time

import yt_dlp

import sites
import video_processing as vp
from high_res import ensure_avc1

MAX_TITLE_CHARS = 80

# Errors that mean "log in on the site in your browser"
_LOGIN_HINTS = ('login required', 'log in', 'logged-in', 'cookies', 'rate-limit',
                'not available', 'private', 'requested content is not available')


def video_sort(height):
    """yt-dlp sort order for a full video. 'res' is the smaller dimension, so a
    vertical 720x1280 TikTok/Reel counts as 720p, not as over 1080p. Then H.264
    and AAC, which Premiere imports without conversion."""
    return [f'res:{int(height)}', 'vcodec:h264', 'acodec:aac', 'ext:mp4:m4a']


def safe_title(info):
    """Short file name: TikTok and X use the whole post text as title."""
    title = info.get('title') or info.get('description') or info.get('id') or 'video'
    if re.fullmatch(r'TikTok video #\d+', str(title)) and info.get('uploader'):
        # A TikTok without caption: yt-dlp's placeholder says nothing useful
        title = f"{info['uploader']} {info.get('id', '')}"
    title = re.sub(r'#\S+', '', str(title))           # hashtags
    title = re.sub(r'https?://\S+', '', title)         # links
    title = vp.sanitize_youtube_title(title)
    title = re.sub(r'[^\w.\-]+', '_', title, flags=re.UNICODE).strip('._-')
    title = title[:MAX_TITLE_CHARS].rstrip('._-')
    return title or str(info.get('id') or 'video')


def write_cookies_file(cookies, site):
    """Netscape cookie file holding only the browser cookies of `site`."""
    kept = [c for c in (cookies or [])
            if c.get('name') and c.get('value') is not None
            and sites.cookie_matches_site(c.get('domain'), site)]
    if not kept:
        return None
    folder = os.path.join(os.environ.get('TEMP', tempfile.gettempdir()), 'YoutubetoPremiere')
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f'{site}_cookies_{int(time.time() * 1000)}.txt')
    with open(path, 'w', encoding='utf-8') as f:
        f.write('# Netscape HTTP Cookie File\n')
        for c in kept:
            domain = str(c.get('domain'))
            fields = [domain, 'TRUE' if domain.startswith('.') else 'FALSE',
                      str(c.get('path') or '/'), 'TRUE' if c.get('secure') else 'FALSE',
                      str(int(float(c.get('expirationDate') or 0))),
                      str(c.get('name')), str(c.get('value'))]
            if any(ch in field for field in fields for ch in '\t\r\n'):
                continue
            f.write('\t'.join(fields) + '\n')
    logging.info(f'[SITE] {len(kept)} {site} cookies passed to yt-dlp')
    return path


def friendly_error(error, site):
    msg = re.sub(r'\x1B\[[0-?]*[ -/]*[@-~]', '', str(error)).replace('ERROR: ', '').strip()
    name = sites.SITE_NAMES.get(site, site)
    if 'audio codec' in msg.lower():
        # Instagram only serves the sound track to logged-in users
        return (f"{name} n'a pas fourni de piste audio pour cette vidéo. Connecte-toi à "
                f"{name} dans ton navigateur puis réessaie.")
    if any(h in msg.lower() for h in _LOGIN_HINTS):
        return (f"{name} refuse l'accès à cette vidéo. Connecte-toi à {name} dans ton "
                f"navigateur puis réessaie. ({msg[:200]})")
    return f'{name} : {msg[:300]}'


def download_from_site(video_url, kind, download_path, ffmpeg_path, socketio, settings,
                       current_download=None, cookies=None, user_agent=None, resolution='1080'):
    """Download `video_url` ('full' video or 'audio') and send it to Premiere.

    Returns {'path': ...} or {'error': message}; the caller reports errors.
    """
    site = sites.site_of(video_url)
    is_audio = kind == 'audio'
    progress_type = 'audio' if is_audio else 'full'
    is_cancelled = [False]

    def cancel_callback():
        is_cancelled[0] = True
        return True

    if current_download is not None:
        current_download['cancel_callback'] = cancel_callback

    last_pct = [-1]

    def progress_hook(d):
        if is_cancelled[0]:
            raise Exception('Download cancelled by user')
        if d.get('status') == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate')
            if total:
                pct = int(d.get('downloaded_bytes', 0) * 100 / total)
            else:  # HLS: fragments
                n = d.get('fragment_count')
                pct = int((d.get('fragment_index') or 0) * 100 / n) if n else 0
            pct = max(0, min(pct, 99))
            if pct > last_pct[0]:
                last_pct[0] = pct
                socketio.emit('progress', {'progress': str(pct), 'type': progress_type})
                socketio.emit('percentage', {'percentage': f'{pct}%'})

    cookies_file = None
    try:
        cookies_file = write_cookies_file(cookies, site)
        opts = vp.get_robust_ydl_options(ffmpeg_path, cookies_file, user_agent)
        opts.pop('extractor_args', None)  # YouTube player clients only
        opts.update({
            'progress_hooks': [progress_hook],
            'noplaylist': True,
            'playlist_items': '1',  # an Instagram carousel or X thread: first video
            'concurrent_fragment_downloads': 4,
        })
        try:
            height = int(str(resolution).rstrip('p'))
        except (TypeError, ValueError):
            height = 1080
        if is_audio:
            opts['format'] = 'ba[acodec~=\'^(mp4a|aac)\']/ba/b'
            opts['postprocessors'] = [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'm4a'}]
        else:
            opts['format'] = 'bv*+ba/b'
            opts['format_sort'] = video_sort(height)
            opts['merge_output_format'] = 'mp4'

        socketio.emit('percentage', {'percentage': '0%'})
        with yt_dlp.YoutubeDL(opts) as ydl:
            if current_download is not None:
                current_download['ydl'] = ydl
            info = ydl.extract_info(video_url, download=False)
            if info.get('_type') == 'playlist':
                entries = [e for e in (info.get('entries') or []) if e]
                if not entries:
                    raise Exception('No video found on this page')
                info = entries[0]
            ext = 'm4a' if is_audio else 'mp4'
            name = vp.get_unique_filename(download_path, safe_title(info), ext)
            ydl.params['outtmpl'] = {'default': os.path.join(download_path, os.path.splitext(name)[0] + '.%(ext)s')}
            logging.info(f'[SITE] {site} {kind}: {video_url} -> {name}')
            info = ydl.process_ie_result(info, download=True)

        downloads = info.get('requested_downloads') or []
        path = downloads[0].get('filepath') if downloads else None
        if not path or not os.path.exists(path):
            raise Exception('Download finished but the file is missing')

        if is_audio:
            socketio.emit('progress', {'progress': '100', 'type': 'audio', 'status': 'complete'})
            socketio.emit('percentage', {'percentage': '100%'})
            vp.emit_import_video(socketio, {'path': path, 'bin': settings.get('premiereBin', '')})
            socketio.emit('download-complete', {'url': video_url, 'path': path})
            logging.info(f'[SITE] Audio ready: {path}')
            return {'path': path}

        # Only re-encodes when the site had no H.264 rendition at all
        path = ensure_avc1(ffmpeg_path, path, height, socketio=socketio,
                           current_download=current_download,
                           is_cancelled=lambda: is_cancelled[0], force=True)
        path = vp._finalize_full_download(path, video_url, height, ffmpeg_path, socketio,
                                          settings, current_download, lambda: is_cancelled[0])
        return {'path': path}
    except Exception as e:
        if is_cancelled[0] or 'cancelled' in str(e).lower():
            logging.info(f'[SITE] {site} download cancelled')
            return {'error': 'Download cancelled by user', 'cancelled': True}
        logging.error(f'[SITE] {site} {kind} failed: {e}')
        return {'error': friendly_error(e, site)}
    finally:
        if current_download is not None:
            current_download['ydl'] = None
            current_download['cancel_callback'] = None
        if cookies_file:
            try:
                os.remove(cookies_file)
            except OSError:
                pass
