"""Regression tests for 403 handling on downloads.

Reported symptom: "Failed to download a video", with the log showing

    Successfully extracted audio info WITHOUT cookies
    ERROR: unable to download video data: HTTP Error 403: Forbidden
    Error downloading audio: ...

and no retry in between. YouTube ties stream URLs to the player client that
requested them and rejects them with 403 unpredictably, so a retry with a
different client is the remedy. Fallback chains existed in both the audio and
video paths, but were gated on the wrong condition:

  * audio: only ran for "empty file" errors
  * video: only ran for cookie-format errors

so a 403 failed instantly.
"""
import inspect
import re

import pytest

import video_processing
from video_processing import is_retryable_download_error


class TestIsRetryableDownloadError:
    @pytest.mark.parametrize('message', [
        'ERROR: unable to download video data: HTTP Error 403: Forbidden',
        'HTTP Error 403: Forbidden',
        'urllib.error.HTTPError: Forbidden',
        'Downloaded file is empty',
        'The downloaded file is empty',
        'unable to download fragment 7',
        'Requested format is not available',
        'unable to download webpage',
    ])
    def test_retryable(self, message):
        assert is_retryable_download_error(message) is True

    @pytest.mark.parametrize('message', [
        'Video unavailable',
        'Private video. Sign in if you have been granted access',
        'Download cancelled by user',
        'Sign in to confirm your age',
        'This video is no longer available',
        'Invalid license key',
    ])
    def test_not_retryable(self, message):
        assert is_retryable_download_error(message) is False

    def test_accepts_an_exception_object(self):
        assert is_retryable_download_error(
            Exception('HTTP Error 403: Forbidden')) is True

    def test_is_case_insensitive(self):
        assert is_retryable_download_error('http error 403: FORBIDDEN') is True


class TestAudioPathRetriesOn403:
    def test_gate_uses_the_classifier(self):
        src = inspect.getsource(video_processing.download_audio)
        assert 'is_retryable_download_error(download_error)' in src, (
            "the audio fallback chain must run for 403s, not only 'empty file'"
        )

    def test_old_empty_only_gate_is_gone(self):
        src = inspect.getsource(video_processing.download_audio)
        assert "if 'empty' in error_str.lower() or 'downloaded file is empty'" not in src, (
            "the empty-file-only gate is back; 403s would fail without a retry"
        )

    def test_fallback_chain_still_present(self):
        src = inspect.getsource(video_processing.download_audio)
        for marker in ('Fallback 1', 'Fallback 2', 'Fallback 3'):
            assert marker in src, "lost %s" % marker

    def test_fallbacks_use_clients_that_serve_audio(self):
        """'web' and bare 'ios' expose no usable audio format for many videos."""
        src = inspect.getsource(video_processing.download_audio)
        assert "'player_client': ['web']}" not in src
        assert "'player_client': ['ios']}" not in src
        assert "web_safari" in src


class TestVideoPathRetriesOn403:
    def test_video_path_has_a_403_retry(self):
        src = inspect.getsource(video_processing.download_video)
        assert 'is_retryable_download_error(e)' in src, (
            "the video path still only retries on cookie errors"
        )

    def test_video_retry_tries_several_clients(self):
        src = inspect.getsource(video_processing.download_video)
        assert 'android_vr' in src and 'web_safari' in src, (
            "video retry should walk a ladder of player clients"
        )

    def test_video_retry_reextracts_instead_of_reusing_info(self):
        """Fresh URLs from the retry client, not the rejected ones."""
        src = inspect.getsource(video_processing.download_video)
        retry_block = src[src.index('trying fallback clients'):]
        retry_block = retry_block[:retry_block.index('Check for cookie-related')]
        assert 'ydl_retry.download([video_url])' in retry_block
        assert 'process_ie_result' not in retry_block

    def test_cancellation_is_not_retried(self):
        src = inspect.getsource(video_processing.download_video)
        assert "'cancelled' not in str(e).lower()" in src, (
            "a user cancellation must not trigger the retry ladder"
        )


class TestDirectFfmpegHeaders:
    """Strategy 1 hands a URL to ffmpeg itself, so it must send the same
    headers yt-dlp would: googlevideo answers 403 when the request that
    fetches a URL does not match the one it was issued for. Building the
    block by hand dropped what yt-dlp adds per format (X-Forwarded-For from
    geo_bypass, Sec-Fetch-Mode, Accept-Encoding).
    """

    def test_uses_the_formats_own_headers(self):
        src = inspect.getsource(video_processing._try_direct_ffmpeg_clip)
        assert "fmt.get('http_headers')" in src, (
            "must reuse yt-dlp's per-format headers, not a hand-built set"
        )

    def test_no_hardcoded_single_ua_block(self):
        src = inspect.getsource(video_processing._try_direct_ffmpeg_clip)
        assert r"hdr = f'User-Agent: {ua}\r\nAccept: */*" not in src

    def test_audio_input_gets_its_own_headers(self):
        src = inspect.getsource(video_processing._try_direct_ffmpeg_clip)
        assert "'-headers', audio_hdr" in src, (
            "the audio input is a different format and needs its own headers"
        )

    def test_header_block_ends_with_crlf(self):
        """ffmpeg warns "No trailing CRLF found in HTTP header. Adding it."."""
        src = inspect.getsource(video_processing._try_direct_ffmpeg_clip)
        assert r"\r\n' for k, v in headers.items()" in src

    def test_ffmpeg_exit_code_is_retryable(self):
        assert is_retryable_download_error(
            'ERROR: ffmpeg exited with code 3436169992') is True
