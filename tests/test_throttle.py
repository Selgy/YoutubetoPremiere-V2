"""Throttled downloads against a real, deliberately slow local HTTP server.

YouTube sometimes serves a stream URL at ~65 KB/s and then resets the
connection. The first attempt sets throttledratelimit so the URL is given up
within seconds, and the fallbacks fetch fresh URLs. That only works when the
ThrottledDownload escapes: ydl.download() wraps the download in yt-dlp's
re-extraction loop and would retry forever on a genuinely slow line.
"""
import logging
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
import yt_dlp
from yt_dlp.utils import ThrottledDownload

import video_processing
from video_processing import THROTTLED_RATE_LIMIT, is_retryable_download_error

BODY = b'\0' * 1_200_000
RATE = 30_000  # bytes/s, well under THROTTLED_RATE_LIMIT


class _Slow(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _headers(self):
        self.send_response(200)
        self.send_header('Content-Type', 'video/mp4')
        self.send_header('Content-Length', str(len(BODY)))
        self.end_headers()

    def do_HEAD(self):
        self._headers()

    def do_GET(self):
        self._headers()
        step = RATE // 10
        try:
            for i in range(0, len(BODY), step):
                self.wfile.write(BODY[i:i + step])
                time.sleep(0.1)
        except (ConnectionError, OSError):
            pass


@pytest.fixture
def slow_url():
    srv = ThreadingHTTPServer(('127.0.0.1', 0), _Slow)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        yield f'http://127.0.0.1:{srv.server_port}/video.mp4'
    finally:
        srv.shutdown()


def _opts(tmp_path, **extra):
    return {'quiet': True, 'no_warnings': True, 'retries': 0,
            'outtmpl': str(tmp_path / '%(id)s.%(ext)s'), **extra}


def test_extract_then_process_raises_once_and_fast(slow_url, tmp_path):
    """The pattern download_video uses on its first attempt."""
    start = time.time()
    with yt_dlp.YoutubeDL(_opts(tmp_path, throttledratelimit=THROTTLED_RATE_LIMIT)) as ydl:
        info = ydl.extract_info(slow_url, download=False)
        with pytest.raises(ThrottledDownload):
            ydl.process_ie_result(info, download=True)
    assert time.time() - start < 15, 'a throttled URL must be given up within seconds'


def test_without_limit_a_slow_line_still_finishes(slow_url, tmp_path):
    """What the fallbacks do: no limit, so a genuinely slow line completes."""
    with yt_dlp.YoutubeDL(_opts(tmp_path)) as ydl:
        ydl.download([slow_url])
    files = [f for f in os.listdir(tmp_path) if not f.endswith('.part')]
    assert files and os.path.getsize(tmp_path / files[0]) == len(BODY)


def test_throttle_and_resets_are_retryable_but_timeouts_are_not():
    assert is_retryable_download_error(ThrottledDownload())
    assert is_retryable_download_error(Exception(
        "ERROR: [download] Got error: ('Connection broken: ConnectionResetError(10054, ...)')"))
    # offline: every fallback would time out again and delay the error
    assert not is_retryable_download_error(Exception('Read timed out. (read timeout=60)'))


def _src(name):
    import inspect
    return inspect.getsource(getattr(video_processing, name))


def test_full_video_first_attempt_never_uses_ydl_download():
    src = _src('download_video')
    first = src.index("'throttledratelimit': THROTTLED_RATE_LIMIT")
    ladder = src.index('ladder = [')
    code = '\n'.join(l for l in src[first:ladder].splitlines() if not l.strip().startswith('#'))
    assert 'ydl.download(' not in code, 'ydl.download() loops on ThrottledDownload instead of raising'
    assert 'throttledratelimit' not in src[ladder:]


def test_audio_first_attempt_limited_fallbacks_not():
    src = _src('download_audio')
    limit = src.index("ydl_opts['throttledratelimit'] = THROTTLED_RATE_LIMIT")
    first = src.index('ydl_download.process_ie_result(info, download=True)')
    assert limit < first
    assert 'throttledratelimit' not in src[first:]
