"""Regression tests for clip audio/video sync.

Both fast clip paths cut a DASH video-only stream and an audio-only stream
separately, then mux them. If the video is *copied* (`-c:v copy`) the cut can
only start on the nearest preceding keyframe, so the video gets a lead-in with
no audio (0..GOP seconds) while the audio starts exactly at clip_start. Merged,
that plays back as "the audio is out of sync", intermittently, depending on how
far clip_start falls from a keyframe.

The fix re-encodes the video so the seek is frame-accurate and both streams
start at clip_start. These source-level guards keep either path from silently
reverting to a stream copy.
"""
import inspect

import pytest

import video_processing
from routes import parse_youtube_time_param, resolve_clip_anchor_time


def _clip_source():
    direct = inspect.getsource(video_processing._try_direct_ffmpeg_clip)
    full = inspect.getsource(video_processing.download_and_process_clip)
    return direct, full


class TestDirectFfmpegClip:
    def test_reencodes_video_not_copy(self):
        direct, _ = _clip_source()
        assert "'-c:v', 'libx264'" in direct, (
            "_try_direct_ffmpeg_clip must re-encode the video for a frame-accurate, "
            "in-sync clip start"
        )

    def test_does_not_stream_copy_video(self):
        direct, _ = _clip_source()
        assert "'-c:v', 'copy'" not in direct, (
            "stream-copying the video reintroduces the keyframe lead-in / audio "
            "desync bug"
        )

    def test_audio_is_copied(self):
        direct, _ = _clip_source()
        # Audio has no keyframes, so its seek is already accurate — no re-encode.
        assert "'-c:a', 'copy'" in direct


class TestClipPartialStrategy:
    def test_video_trim_reencodes(self):
        _, full = _clip_source()
        assert "'-c:v', 'libx264'" in full, (
            "the CLIP-PARTIAL video trim must re-encode so it lines up with the "
            "frame-accurate audio trim"
        )

    def test_video_trim_not_copy(self):
        _, full = _clip_source()
        # The only remaining '-c:v', 'copy' would be the final mux of an
        # already-accurate re-encoded clip; the trim step must not copy.
        trim_marker = "-i', _vid_actual, '-c:v', 'copy'"
        assert trim_marker not in full, (
            "CLIP-PARTIAL trims the video with stream copy, which desyncs audio"
        )


class TestParseYoutubeTimeParam:
    @pytest.mark.parametrize("value,expected", [
        ("246", 246.0),
        ("246s", 246.0),
        ("246.5", 246.5),
        ("4m6s", 246.0),
        ("1h2m3s", 3723.0),
        ("1h", 3600.0),
        ("90m", 5400.0),
    ])
    def test_valid_formats(self, value, expected):
        assert parse_youtube_time_param(value) == expected

    @pytest.mark.parametrize("value", ["", None, "abc", "h m s"])
    def test_invalid_formats(self, value):
        assert parse_youtube_time_param(value) is None


class TestResolveClipAnchorTime:
    """The clip anchor: player time when trustworthy, else the URL timestamp.

    Regression for clips landing at the video start: YouTube's SPA page can
    hold several <video> elements and the extension sometimes reported
    currentTime=0 while the URL carried the real position (t=246s).
    """

    def test_trusts_player_time_when_nonzero(self):
        t, source = resolve_clip_anchor_time(120.5, "https://www.youtube.com/watch?v=x&t=246s")
        assert t == 120.5
        assert source == 'player'

    def test_zero_player_time_falls_back_to_url_t(self):
        t, source = resolve_clip_anchor_time(0, "https://www.youtube.com/watch?v=x&t=246s")
        assert t == 246.0
        assert 'url' in source

    def test_zero_player_time_falls_back_to_url_start(self):
        t, _ = resolve_clip_anchor_time(0, "https://www.youtube.com/watch?v=x&start=90")
        assert t == 90.0

    def test_zero_with_no_url_param_stays_zero(self):
        t, source = resolve_clip_anchor_time(0, "https://www.youtube.com/watch?v=x")
        assert t == 0.0
        assert source == 'player'

    def test_none_with_url_param_uses_url(self):
        t, _ = resolve_clip_anchor_time(None, "https://www.youtube.com/watch?v=x&t=1h2m3s")
        assert t == 3723.0

    def test_string_player_time_accepted(self):
        t, source = resolve_clip_anchor_time("57.3", "https://www.youtube.com/watch?v=x")
        assert t == 57.3
        assert source == 'player'
