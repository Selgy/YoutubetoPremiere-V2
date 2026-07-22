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

import video_processing


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
