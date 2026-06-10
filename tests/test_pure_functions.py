"""Unit tests for pure helper functions.

These functions have no side effects (no network, no Premiere, no FFmpeg),
which makes them safe and fast to test in isolation.
"""
import os

import pytest

from utils import (
    validate_youtube_url,
    YOUTUBE_DOMAINS,
    update_current_project_path,
    query_live_project_path,
)
from video_processing import (
    sanitize_youtube_title,
    sanitize_resolution,
    get_unique_filename,
    format_timestamp,
)


# ---------------------------------------------------------------------------
# validate_youtube_url  (security-sensitive: must reject spoofed domains)
# ---------------------------------------------------------------------------
class TestValidateYoutubeUrl:
    @pytest.mark.parametrize("url", [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtube.com/watch?v=abc",
        "https://youtu.be/dQw4w9WgXcQ",
        "https://m.youtube.com/watch?v=abc",
        "http://www.youtube.com/watch?v=abc",
        "https://music.youtube.com/watch?v=abc",  # proper subdomain
        "https://www.youtube-nocookie.com/embed/abc",
        "https://user:pass@youtube.com/watch?v=abc",  # userinfo stripped
        "https://youtube.com:443/watch?v=abc",        # port stripped
        "HTTPS://YOUTUBE.COM/watch?v=abc",            # case-insensitive
    ])
    def test_accepts_valid_youtube_urls(self, url):
        assert validate_youtube_url(url) is True

    @pytest.mark.parametrize("url", [
        "",
        None,
        "https://evil-youtube.com/watch?v=abc",   # suffix-spoof must fail
        "https://notyoutube.com/watch?v=abc",
        "https://youtube.com.evil.com/watch?v=abc",
        "https://evil.com/youtube.com",
        "https://vimeo.com/12345",
        "not a url at all",
        "https://youtubeXcom/watch",
    ])
    def test_rejects_invalid_or_spoofed_urls(self, url):
        assert validate_youtube_url(url) is False

    def test_youtube_domains_constant_is_nonempty(self):
        assert "youtube.com" in YOUTUBE_DOMAINS
        assert "youtu.be" in YOUTUBE_DOMAINS


# ---------------------------------------------------------------------------
# sanitize_youtube_title
# ---------------------------------------------------------------------------
class TestSanitizeYoutubeTitle:
    def test_removes_invalid_filename_characters(self):
        assert sanitize_youtube_title('a<b>c:d"e/f\\g|h?i*j') == "abcdefghij"

    def test_replaces_whitespace_with_underscore(self):
        assert sanitize_youtube_title("hello world") == "hello_world"
        assert sanitize_youtube_title("a   b  c") == "a_b_c"

    def test_control_characters_removed_before_whitespace_collapse(self):
        # Tab (\x09) is in the \x00-\x1F range and is stripped first.
        assert sanitize_youtube_title("a\tb") == "ab"

    def test_strips_leading_trailing_whitespace(self):
        assert sanitize_youtube_title("  trimmed  ") == "trimmed"

    def test_plain_title_unchanged(self):
        assert sanitize_youtube_title("MyVideo123") == "MyVideo123"


# ---------------------------------------------------------------------------
# sanitize_resolution
# ---------------------------------------------------------------------------
class TestSanitizeResolution:
    @pytest.mark.parametrize("value,expected", [
        (1080, 1080),
        ("1080", 1080),
        ("1080p", 1080),
        ("720P", 720),
        ("  480p  ", 480),
        ("4320", 4320),
    ])
    def test_valid_resolutions(self, value, expected):
        assert sanitize_resolution(value) == expected

    @pytest.mark.parametrize("value", ["abc", "", None, "px", []])
    def test_invalid_resolution_defaults_to_1080(self, value):
        assert sanitize_resolution(value) == 1080


# ---------------------------------------------------------------------------
# format_timestamp
# ---------------------------------------------------------------------------
class TestFormatTimestamp:
    @pytest.mark.parametrize("seconds,expected", [
        (0, "00:00:00"),
        (5, "00:00:05"),
        (65, "00:01:05"),
        (3600, "01:00:00"),
        (3661, "01:01:01"),
        (3725, "01:02:05"),
    ])
    def test_format(self, seconds, expected):
        assert format_timestamp(seconds) == expected


# ---------------------------------------------------------------------------
# get_unique_filename
# ---------------------------------------------------------------------------
class TestGetUniqueFilename:
    def test_returns_plain_name_when_no_conflict(self, tmp_path):
        result = get_unique_filename(str(tmp_path), "video", "mp4")
        assert result == "video.mp4"

    def test_increments_on_conflict(self, tmp_path):
        (tmp_path / "video.mp4").write_text("x")
        result = get_unique_filename(str(tmp_path), "video", "mp4")
        assert result == "video_1.mp4"

    def test_increments_until_free_slot(self, tmp_path):
        (tmp_path / "video.mp4").write_text("x")
        (tmp_path / "video_1.mp4").write_text("x")
        (tmp_path / "video_2.mp4").write_text("x")
        result = get_unique_filename(str(tmp_path), "video", "mp4")
        assert result == "video_3.mp4"


# ---------------------------------------------------------------------------
# Live active-project tracking (fix for "video lands in last opened project")
# ---------------------------------------------------------------------------
class FakeSocketIO:
    """Minimal stand-in that records emits and replays a project path."""
    def __init__(self, reply_path=None):
        self.emitted = []
        self._reply_path = reply_path

    def emit(self, event, *args, **kwargs):
        self.emitted.append(event)
        # Simulate the panel answering the request synchronously.
        if event == "request_project_path" and self._reply_path is not None:
            update_current_project_path(self._reply_path)


class TestLiveProjectPath:
    def test_query_returns_none_without_socketio(self):
        assert query_live_project_path(None, timeout=0.1) is None

    def test_query_times_out_when_no_reply(self):
        sock = FakeSocketIO(reply_path=None)  # never answers
        assert query_live_project_path(sock, timeout=0.2) is None
        assert "request_project_path" in sock.emitted

    def test_query_returns_active_project_path(self):
        sock = FakeSocketIO(reply_path=r"C:\Projects\Current\my.prproj")
        result = query_live_project_path(sock, timeout=1)
        assert result == r"C:\Projects\Current\my.prproj"

    def test_latest_path_wins(self):
        update_current_project_path(r"C:\old\a.prproj")
        sock = FakeSocketIO(reply_path=r"C:\new\b.prproj")
        assert query_live_project_path(sock, timeout=1) == r"C:\new\b.prproj"
