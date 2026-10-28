"""yt-dlp 2026.10.x: YouTube stream URLs answer 403 until 'available_at'.

yt-dlp's downloader sleeps until then; the direct-ffmpeg clip path did not,
so every fast clip failed with 403 and fell back to the slow strategy (29 s
instead of ~7 s for a 6 s clip).
"""
import video_processing
from video_processing import MAX_AVAILABLE_AT_WAIT, _pick_audio_format, _wait_until_available


class Clock:
    def __init__(self, t=1000.0):
        self.t = t
        self.slept = 0.0

    def now(self):
        return self.t

    def sleep(self, s):
        self.t += s
        self.slept += s


def test_waits_until_the_latest_available_at():
    c = Clock()
    fmts = [{'available_at': 1003}, {'available_at': 1005}]
    assert _wait_until_available(fmts, now=c.now, sleep=c.sleep) is True
    assert c.t >= 1005


def test_no_wait_when_already_available_or_absent():
    c = Clock()
    assert _wait_until_available([{'available_at': 900}, {}, None], now=c.now, sleep=c.sleep)
    assert c.slept == 0


def test_too_long_a_wait_is_left_to_yt_dlp():
    c = Clock()
    fmts = [{'available_at': 1000 + MAX_AVAILABLE_AT_WAIT + 10}]
    assert _wait_until_available(fmts, now=c.now, sleep=c.sleep) is False
    assert c.slept == 0


def test_cancel_during_the_wait():
    c = Clock()
    assert _wait_until_available([{'available_at': 1010}], lambda: c.t > 1002,
                                 now=c.now, sleep=c.sleep) is False
    assert c.t < 1010


def test_direct_clip_waits_before_running_ffmpeg():
    import inspect
    src = inspect.getsource(video_processing._try_direct_ffmpeg_clip)
    assert src.index('_wait_until_available([video_fmt, audio_fmt]') < src.index('subprocess.Popen(')


def test_drc_audio_is_skipped_when_the_plain_track_exists():
    fmts = [{'format_id': '140-drc', 'abr': 129.5, 'language_preference': 10},
            {'format_id': '140', 'abr': 129.4, 'language_preference': 10}]
    assert _pick_audio_format(fmts, 'original')['format_id'] == '140'


def test_drc_audio_used_when_it_is_the_only_one():
    assert _pick_audio_format([{'format_id': '140-drc', 'abr': 129}], 'original')['format_id'] == '140-drc'
