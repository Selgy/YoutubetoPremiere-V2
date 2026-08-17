"""Regression tests for the automatic clip retry.

From the user's logs (8 clip attempts, 3 failures):

  15:48:33  strategy 1 403, strategy 2 403, strategy 3 403   -> FAILED
  15:48:43  manual retry                                     -> OK
  16:26:21  strategy 1 403, strategy 2 403, strategy 3 403   -> FAILED
  16:26:33  manual retry                                     -> OK
  16:39:52  strategy 1 403, strategy 2 403, strategy 3 403   -> FAILED
  16:43:09  manual retry                                     -> OK

Every failure is all three strategies being refused inside a ~4s burst, and
every manual retry 10s+ later succeeds. handle_video_url now waits and retries
by itself instead of reporting a failure the user has to click through.
"""
import inspect

import video_processing
from video_processing import is_retryable_download_error


class TestClipRetryLoop:
    def _src(self):
        return inspect.getsource(video_processing.handle_video_url)

    def test_clip_call_is_wrapped_in_a_retry_loop(self):
        src = self._src()
        assert 'CLIP_RETRY_DELAYS' in src, "clips no longer retry automatically"
        assert 'for attempt in range' in src

    def test_waits_between_attempts(self):
        """Retrying instantly is useless: the burst is what gets refused."""
        src = self._src()
        assert 'time.sleep(delay)' in src
        assert 'CLIP_RETRY_DELAYS = [8, 20]' in src, (
            "delays should straddle the 10s+ gap that worked in the logs"
        )

    def test_stops_on_success(self):
        src = self._src()
        assert 'if result and result.get("success"):' in src
        assert 'break' in src

    def test_does_not_retry_cancellations(self):
        src = self._src()
        assert "'cancelled' in error_text.lower()" in src

    def test_only_retries_transient_errors(self):
        src = self._src()
        assert 'is_retryable_download_error(error_text)' in src

    def test_gives_up_after_the_configured_attempts(self):
        src = self._src()
        assert 'attempt >= len(CLIP_RETRY_DELAYS)' in src
        assert 'giving up' in src

    def test_tells_the_user_it_is_retrying(self):
        """Otherwise the panel just looks frozen for 8 seconds."""
        src = self._src()
        assert "socketio.emit('percentage'" in src


class TestErrorsSeenInTheLogs:
    """The exact failure strings must be classified as retryable."""

    def test_strategy_3_ffmpeg_exit(self):
        assert is_retryable_download_error(
            'Error downloading clip: ERROR: ffmpeg exited with code 3436169992')

    def test_strategy_2_forbidden(self):
        assert is_retryable_download_error(
            'ERROR: unable to download video data: HTTP Error 403: Forbidden')

    def test_generic_failure_is_not_retried_forever(self):
        assert not is_retryable_download_error('Failed to download clip')
