"""High-resolution downloads (1440p / 4K) made Premiere-compatible.

YouTube only serves AVC1 (H.264) up to 1080p. Above that the streams are VP9 or
AV1, which Premiere Pro does not import reliably. So when the user asks for
1440p or 2160p:

* if the video really has a stream above 1080p, download it and convert it to
  H.264 (AVC1) before importing;
* if the video tops out at 1080p, download the AVC1 stream as usual - no
  conversion.

At 1080p and below nothing changes: AVC1 is selected directly, as before.

Measured on a real 4K video: AVC1 stops at 1080p; 1440p/2160p exist as AV1
(https) and VP9 (https + HLS). VP9 is preferred because every FFmpeg build has a
native VP9 decoder, while the bundled Windows build has no libdav1d - AV1 would
fall back to libaom, which is far too slow to decode 4K.
"""
import logging
import os
import re
import subprocess
import sys
import threading
import time

# YouTube never serves AVC1 above this height.
AVC1_MAX_HEIGHT = 1080

# Hardware encoders worth trying, per platform, before falling back to libx264.
_HW_ENCODERS = {
    'darwin': ['h264_videotoolbox'],
    'win32': ['h264_nvenc', 'h264_qsv', 'h264_amf'],
}

_encoder_cache = {}
_encoder_lock = threading.Lock()


def _creationflags():
    return subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0


def is_avc_codec(vcodec):
    """True for H.264 codec strings as yt-dlp or FFmpeg report them."""
    v = str(vcodec or '').lower()
    return v.startswith('avc') or v == 'h264' or 'h264' in v or '264' in v


def wants_high_res(target_height):
    """True when the user asked for more than YouTube's AVC1 ceiling."""
    try:
        return int(target_height) > AVC1_MAX_HEIGHT
    except (TypeError, ValueError):
        return False


def _is_sdr(f):
    # HDR (VP9.2 / AV1 HDR) converted to 8-bit H.264 without tone-mapping looks
    # washed out, so it is never selected.
    return f.get('dynamic_range') in (None, 'SDR')


def _is_video(f):
    return f.get('vcodec') not in (None, 'none', '')


def plan_high_res(formats, target_height):
    """Decide whether this video needs the high-res path.

    Returns {'transcode': bool, 'height': int|None, 'best_avc1_height': int}.
    transcode is True only when the user asked above 1080p AND the video has an
    SDR stream above both 1080p and its best AVC1 stream.
    """
    best_avc = max((f.get('height') or 0 for f in formats or []
                    if _is_video(f) and is_avc_codec(f.get('vcodec'))), default=0)
    plan = {'transcode': False, 'height': None, 'best_avc1_height': best_avc}
    if not wants_high_res(target_height):
        return plan

    target = int(target_height)
    best_hr = max((f.get('height') or 0 for f in formats or []
                   if _is_video(f) and _is_sdr(f)
                   and AVC1_MAX_HEIGHT < (f.get('height') or 0) <= target), default=0)
    if best_hr > max(best_avc, AVC1_MAX_HEIGHT):
        plan.update(transcode=True, height=best_hr)
    return plan


def high_res_video_selector(target_height, with_audio=True):
    """yt-dlp selector for the best SDR stream above 1080p, VP9 first.

    Meant to be PREPENDED to the existing AVC1 chain: when the video has nothing
    above 1080p every alternative here fails and yt-dlp falls through to AVC1.
    """
    h = int(target_height)
    base = f'bestvideo[height<={h}][height>{AVC1_MAX_HEIGHT}][dynamic_range=SDR]'
    if not with_audio:
        return f'{base}[vcodec^=vp]/{base}'
    return (f'{base}[vcodec^=vp]+bestaudio[ext=m4a]/'
            f'{base}+bestaudio[ext=m4a]/'
            f'{base}+bestaudio')


def pick_high_res_format(formats, target_height):
    """Best video-only SDR format above 1080p with a direct URL (for the direct
    FFmpeg clip path). Prefers height, then https over HLS, then VP9, then
    bitrate. None when the video has nothing above 1080p."""
    if not plan_high_res(formats, target_height)['transcode']:
        return None
    target = int(target_height)
    cands = [f for f in formats
             if _is_video(f) and _is_sdr(f)
             and f.get('acodec') in (None, 'none', '')
             and AVC1_MAX_HEIGHT < (f.get('height') or 0) <= target
             and str(f.get('url', '')).startswith('http')]
    if not cands:
        return None
    return max(cands, key=lambda f: (
        f.get('height') or 0,
        f.get('protocol') == 'https',
        str(f.get('vcodec', '')).lower().startswith('vp'),
        f.get('tbr') or 0,
    ))


def probe_media(ffmpeg_path, path):
    """Read codecs, height and duration with `ffmpeg -i` (ffprobe is not bundled)."""
    info = {'vcodec': None, 'acodec': None, 'height': None, 'duration': None}
    try:
        r = subprocess.run([ffmpeg_path, '-hide_banner', '-i', path],
                           capture_output=True, text=True, encoding='utf-8',
                           errors='replace', timeout=60, creationflags=_creationflags())
        err = r.stderr or ''
    except Exception as e:
        logging.warning(f"[HIGH-RES] Could not probe {path}: {e}")
        return info

    m = re.search(r'Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)', err)
    if m:
        info['duration'] = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    for line in err.splitlines():
        if info['vcodec'] is None:
            vm = re.search(r'Stream #\S+.*?: Video: (\w+)', line)
            if vm:
                info['vcodec'] = vm.group(1).lower()
                dm = re.search(r'\b(\d{2,5})x(\d{2,5})\b', line)
                if dm:
                    info['height'] = int(dm.group(2))
        if info['acodec'] is None:
            am = re.search(r'Stream #\S+.*?: Audio: (\w+)', line)
            if am:
                info['acodec'] = am.group(1).lower()
    return info


def _encoder_works(ffmpeg_path, encoder):
    try:
        r = subprocess.run([ffmpeg_path, '-hide_banner', '-loglevel', 'error',
                            '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=0.2',
                            '-frames:v', '3', '-c:v', encoder, '-f', 'null', '-'],
                           capture_output=True, timeout=20, creationflags=_creationflags())
        return r.returncode == 0
    except Exception:
        return False


def select_h264_encoder(ffmpeg_path):
    """First hardware H.264 encoder that actually works here, else libx264.

    A build listing an encoder does not mean the machine has the hardware, so
    each candidate is test-encoded once; the answer is cached per process.
    """
    with _encoder_lock:
        if ffmpeg_path in _encoder_cache:
            return _encoder_cache[ffmpeg_path]
        chosen = 'libx264'
        for enc in _HW_ENCODERS.get(sys.platform, []):
            if _encoder_works(ffmpeg_path, enc):
                chosen = enc
                break
        _encoder_cache[ffmpeg_path] = chosen
        logging.info(f"[HIGH-RES] H.264 encoder: {chosen}")
        return chosen


def _bitrate_for(height):
    if (height or 0) >= 2000:
        return 45_000_000
    if (height or 0) > AVC1_MAX_HEIGHT:
        return 24_000_000
    return 12_000_000


def h264_encoder_args(encoder, height):
    """Encoder arguments producing 8-bit 4:2:0 H.264, which Premiere imports."""
    if encoder == 'libx264':
        return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p']
    br = _bitrate_for(height)
    rate = ['-b:v', str(br), '-maxrate', str(int(br * 1.5)), '-bufsize', str(br * 2)]
    if encoder == 'h264_videotoolbox':
        return ['-c:v', encoder, '-allow_sw', '1', '-profile:v', 'high'] + rate + ['-pix_fmt', 'yuv420p']
    if encoder == 'h264_qsv':
        return ['-c:v', encoder, '-profile:v', 'high'] + rate + ['-pix_fmt', 'nv12']
    if encoder == 'h264_nvenc':
        return ['-c:v', encoder, '-preset', 'p5', '-profile:v', 'high'] + rate + ['-pix_fmt', 'yuv420p']
    return ['-c:v', encoder] + rate + ['-pix_fmt', 'yuv420p']


def _run_conversion(cmd, duration, progress_cb, register_process, is_cancelled):
    """Run FFmpeg with -progress on stdout; returns the exit code."""
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True, encoding='utf-8', errors='replace',
                            creationflags=_creationflags())
    if register_process:
        register_process(proc)

    tail = []

    def _drain_stderr():
        for line in proc.stderr:
            tail.append(line.rstrip())
            del tail[:-20]

    threading.Thread(target=_drain_stderr, daemon=True).start()

    last = -5
    for line in proc.stdout:
        if is_cancelled and is_cancelled():
            proc.terminate()
            break
        if line.startswith('out_time_us=') and duration and progress_cb:
            try:
                pct = int(min(99, int(line.split('=', 1)[1]) / 1e6 / duration * 100))
            except ValueError:
                continue
            if pct >= last + 5:
                last = pct
                progress_cb(pct)
    proc.wait()
    if proc.returncode != 0 and tail:
        logging.warning(f"[HIGH-RES] FFmpeg stderr: {' | '.join(tail[-5:])}")
    return proc.returncode


def ensure_avc1(ffmpeg_path, path, target_height, socketio=None,
                current_download=None, is_cancelled=None):
    """Return a Premiere-compatible version of `path`.

    No-op unless the user asked above 1080p and the file is not already H.264
    (a video that tops out at 1080p was downloaded as AVC1 and is left alone).
    Otherwise converts to H.264 + AAC .mp4, replacing the original, and returns
    the new path. Raises on failure or cancellation.
    """
    if not wants_high_res(target_height) or not path or not os.path.exists(path):
        return path

    media = probe_media(ffmpeg_path, path)
    if is_avc_codec(media['vcodec']):
        logging.info(f"[HIGH-RES] Already H.264 ({media['height']}p) - no conversion: {path}")
        return path
    if not media['vcodec']:
        logging.warning(f"[HIGH-RES] No video stream found, leaving file as is: {path}")
        return path

    base, _ext = os.path.splitext(path)
    final_path = base + '.mp4'
    tmp_path = base + '.avc1-converting.mp4'

    audio = (['-c:a', 'copy'] if media['acodec'] in ('aac', 'mp4a')
             else ['-c:a', 'aac', '-b:a', '320k'])

    def emit(pct):
        # The Chrome extension drops any percentage that does not parse as a
        # number, so a text label would leave its button frozen at 100%.
        if socketio:
            socketio.emit('percentage', {'percentage': f'{pct}%'})
        if pct % 25 == 0:
            logging.info(f"[HIGH-RES] Conversion {pct}%")

    running = []

    def register(proc):
        running[:] = [proc]
        if current_download is not None:
            current_download['process'] = proc

    def killed_by_cancel():
        # The cancel route terminates current_download['process'] and clears
        # the slot; a non-zero exit then is a cancel, not an encoder failure.
        return (current_download is not None and bool(running)
                and current_download.get('process') is not running[0])

    flag = is_cancelled or (lambda: False)

    def cancelled():
        return flag() or killed_by_cancel()
    encoder = select_h264_encoder(ffmpeg_path)
    attempts = [encoder] if encoder == 'libx264' else [encoder, 'libx264']

    logging.info(f"[HIGH-RES] Converting {media['vcodec']} {media['height']}p -> H.264 "
                 f"with {encoder}: {path}")
    emit(0)
    started = time.time()
    for enc in attempts:
        cmd = ([ffmpeg_path, '-y', '-hide_banner', '-nostdin', '-loglevel', 'error',
                '-progress', 'pipe:1', '-nostats', '-i', path,
                '-map', '0:v:0', '-map', '0:a:0?']
               + h264_encoder_args(enc, media['height'])
               + audio + ['-movflags', '+faststart', tmp_path])
        rc = _run_conversion(cmd, media['duration'], emit, register, cancelled)
        was_cancelled = cancelled()  # before freeing the slot, see killed_by_cancel
        if current_download is not None:
            current_download['process'] = None
        running.clear()
        if was_cancelled:
            _silent_remove(tmp_path)
            raise Exception('Download cancelled by user')
        if rc == 0 and os.path.exists(tmp_path) and os.path.getsize(tmp_path) > 0:
            break
        logging.warning(f"[HIGH-RES] {enc} failed (exit {rc})"
                        + (", retrying with libx264" if enc != 'libx264' else ""))
        _silent_remove(tmp_path)
    else:
        raise RuntimeError('Conversion to H.264 failed')

    if final_path != path:
        _silent_remove(path)
    _replace_with_retry(tmp_path, final_path)
    logging.info(f"[HIGH-RES] Converted in {time.time() - started:.0f}s: {final_path}")
    emit(100)
    return final_path


def _silent_remove(p):
    try:
        if os.path.exists(p):
            os.remove(p)
    except OSError:
        pass


def _replace_with_retry(src, dst, attempts=10):
    """os.replace with retries: Windows Defender briefly locks fresh files."""
    for i in range(attempts):
        try:
            os.replace(src, dst)
            return
        except OSError:
            if i == attempts - 1:
                raise
            time.sleep(1)
