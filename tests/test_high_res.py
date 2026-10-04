"""Tests for 1440p / 4K downloads converted to H.264 for Premiere.

Rule (from the feature request):
  * 1080p and below: unchanged, AVC1 downloaded directly.
  * 1440p / 2160p requested and the video has a stream above 1080p: download
    it (VP9/AV1) and convert to H.264.
  * 1440p / 2160p requested but the video tops out at 1080p: download AVC1
    directly, no conversion.

Format fixtures mirror a real 4K YouTube video: AVC1 stops at 1080p, 1440p and
2160p exist as AV1 (https) and VP9 (https + HLS).
"""
import math
import sys
import logging
import os
import threading
import time
import shutil
import subprocess

import pytest

import high_res
from high_res import (ensure_avc1, h264_encoder_args, high_res_video_selector,
                      is_avc_codec, pick_high_res_format, plan_high_res,
                      probe_media, wants_high_res)

FFMPEG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                      'app', 'ffmpeg.exe')
if not os.path.exists(FFMPEG):
    FFMPEG = shutil.which('ffmpeg') or FFMPEG
HAVE_FFMPEG = os.path.exists(FFMPEG)


def fmt(fid, h, vcodec, proto='https', dr='SDR', tbr=1000, acodec='none'):
    return {'format_id': fid, 'height': h, 'vcodec': vcodec, 'acodec': acodec,
            'protocol': proto, 'dynamic_range': dr, 'tbr': tbr,
            'url': 'https://example.googlevideo.com/videoplayback?id=' + fid}


FOUR_K = [
    fmt('299', 1080, 'avc1.64002a'),
    fmt('312', 1080, 'avc1.64002A', proto='m3u8_native'),
    fmt('303', 1080, 'vp9'),
    fmt('400', 1440, 'av01.0.12M.08'),
    fmt('308', 1440, 'vp9'),
    fmt('623', 1440, 'vp09.00.50.08', proto='m3u8_native'),
    fmt('401', 2160, 'av01.0.13M.08', tbr=9000),
    fmt('315', 2160, 'vp9', tbr=8000),
    fmt('628', 2160, 'vp09.00.51.08', proto='m3u8_native', tbr=9500),
    fmt('140', None, 'none', acodec='mp4a.40.2'),
]
FULL_HD_ONLY = [f for f in FOUR_K if (f['height'] or 0) <= 1080]


class TestPlan:
    def test_1080_never_converts(self):
        assert plan_high_res(FOUR_K, 1080)['transcode'] is False

    @pytest.mark.parametrize('target,height', [(1440, 1440), (2160, 2160)])
    def test_high_res_video_converts(self, target, height):
        plan = plan_high_res(FOUR_K, target)
        assert plan['transcode'] is True and plan['height'] == height

    def test_video_that_tops_out_at_1080_is_not_converted(self):
        plan = plan_high_res(FULL_HD_ONLY, 2160)
        assert plan['transcode'] is False
        assert plan['best_avc1_height'] == 1080

    def test_hdr_only_above_1080_is_ignored(self):
        hdr = FULL_HD_ONLY + [fmt('337', 2160, 'vp09.02.51.10', dr='HDR10')]
        assert plan_high_res(hdr, 2160)['transcode'] is False

    @pytest.mark.parametrize('value', ['2160', '1440', 2160, '2160p'])
    def test_wants_high_res_accepts_settings_values(self, value):
        from video_processing import sanitize_resolution
        assert wants_high_res(sanitize_resolution(value))

    @pytest.mark.parametrize('value', ['1080', '720', None, 'abc'])
    def test_wants_high_res_false(self, value):
        assert not wants_high_res(value)


class TestSelectors:
    def test_selector_targets_above_1080_sdr_vp9_first(self):
        sel = high_res_video_selector(2160)
        first = sel.split('/')[0]
        assert '[height<=2160]' in first and '[height>1080]' in first
        assert '[dynamic_range=SDR]' in first and '[vcodec^=vp]' in first
        assert 'bestaudio[ext=m4a]' in first

    def test_video_only_selector_has_no_audio(self):
        assert 'bestaudio' not in high_res_video_selector(1440, with_audio=False)

    def test_pick_prefers_https_vp9_at_best_height(self):
        """VP9: every FFmpeg build decodes it; AV1 would need libdav1d."""
        assert pick_high_res_format(FOUR_K, 2160)['format_id'] == '315'
        assert pick_high_res_format(FOUR_K, 1440)['format_id'] == '308'

    def test_pick_none_when_video_tops_out_at_1080(self):
        assert pick_high_res_format(FULL_HD_ONLY, 2160) is None

    def test_pick_none_below_threshold(self):
        assert pick_high_res_format(FOUR_K, 1080) is None


class TestCodecs:
    @pytest.mark.parametrize('c', ['avc1.64002a', 'avc1.4d401e', 'h264'])
    def test_avc(self, c):
        assert is_avc_codec(c)

    @pytest.mark.parametrize('c', ['vp9', 'vp09.00.51.08', 'av01.0.13M.08', 'av1', None])
    def test_not_avc(self, c):
        assert not is_avc_codec(c)

    @pytest.mark.parametrize('enc', ['libx264', 'h264_nvenc', 'h264_qsv',
                                     'h264_amf', 'h264_videotoolbox'])
    def test_encoder_args_produce_8bit_420_h264(self, enc):
        args = h264_encoder_args(enc, 2160)
        assert args[:2] == ['-c:v', enc]
        assert args[args.index('-pix_fmt') + 1] in ('yuv420p', 'nv12')


class TestEncoderSpeed:
    """The NVENC preset, not VP9 decoding, was the bottleneck (p5: 2.8x
    realtime at 1440p60, p2: 8.9x, same picture)."""

    @pytest.fixture(autouse=True)
    def _fresh(self, monkeypatch):
        monkeypatch.setattr(high_res, '_encoder_cache', {})
        monkeypatch.setattr(high_res, '_speed_ok', {})
        monkeypatch.setattr(high_res.sys, 'platform', 'win32')

    def test_nvenc_uses_fast_preset(self, monkeypatch):
        monkeypatch.setattr(high_res, '_encoder_works', lambda f, e, extra=(): e == 'h264_nvenc')
        assert high_res.select_h264_encoder('ff') == 'h264_nvenc'
        args = h264_encoder_args('h264_nvenc', 1440)
        assert args[args.index('-preset') + 1] == 'p2'

    def test_videotoolbox_constant_quality_replaces_bitrate(self, monkeypatch):
        """M1 Pro: -q:v 65 ran 1.75x faster than the 24 Mb/s target, same size."""
        args = h264_encoder_args('h264_videotoolbox', 1440)
        assert args[args.index('-q:v') + 1] == '65'
        assert '-b:v' not in args, 'bitrate and constant quality conflict'

    def test_intel_mac_without_constant_quality_keeps_bitrate(self, monkeypatch):
        monkeypatch.setattr(high_res.sys, 'platform', 'darwin')
        monkeypatch.setattr(high_res, '_encoder_works',
                            lambda f, e, extra=(): e == 'h264_videotoolbox' and not extra)
        assert high_res.select_h264_encoder('ff') == 'h264_videotoolbox'
        args = h264_encoder_args('h264_videotoolbox', 1440)
        assert '-q:v' not in args and '-b:v' in args

    def test_speed_option_rejected_keeps_hardware_encoder(self, monkeypatch):
        """An old FFmpeg refusing the option must not push us to slow libx264."""
        monkeypatch.setattr(high_res, '_encoder_works',
                            lambda f, e, extra=(): e == 'h264_amf' and not extra)
        assert high_res.select_h264_encoder('ff') == 'h264_amf'
        assert '-quality' not in h264_encoder_args('h264_amf', 1440)

    @pytest.mark.parametrize('enc,opt', [('h264_qsv', '-preset'), ('h264_amf', '-quality'),
                                         ('h264_videotoolbox', '-q:v')])
    def test_every_hardware_encoder_gets_a_speed_setting(self, enc, opt):
        assert opt in h264_encoder_args(enc, 2160)

    @pytest.mark.skipif(not HAVE_FFMPEG, reason='ffmpeg not available')
    def test_speed_args_accepted_by_bundled_ffmpeg_on_nvidia(self):
        if not high_res._encoder_works(FFMPEG, 'h264_nvenc'):
            pytest.skip('no NVIDIA GPU here')
        assert high_res._encoder_works(FFMPEG, 'h264_nvenc', high_res._SPEED_ARGS['h264_nvenc'])


class TestMacHardwareDecode:
    """Hardware decode passes and the stall watchdog that guards them."""

    def test_mac_decodes_vp9_in_software(self):
        """M1 Pro: VideoToolbox VP9 decode ran at 2.3x realtime vs 15x in
        software, capping the whole conversion at 2.0x."""
        assert 'h264_videotoolbox' not in high_res._HW_DECODE

    def test_pix_fmt_removed_for_gpu_frames(self):
        args = high_res._without_pix_fmt(h264_encoder_args('h264_videotoolbox', 1440))
        assert '-pix_fmt' not in args and 'yuv420p' not in args

    def test_watchdog_kills_a_frozen_ffmpeg(self):
        """A frozen hardware decoder never exits by itself."""
        frozen = [sys.executable, '-c', 'import time; time.sleep(60)']
        start = time.time()
        rc = high_res._run_conversion(frozen, 10, None, None, None, stall_seconds=1.5)
        assert rc != 0 and time.time() - start < 10

    @pytest.mark.skipif(not HAVE_FFMPEG, reason='ffmpeg not available')
    def test_failed_hardware_decode_falls_back_to_software(self, tmp_path, monkeypatch, caplog):
        src = str(tmp_path / 'clip.webm')
        if not _make_vp9(src):
            pytest.skip('this ffmpeg build cannot encode VP9')
        monkeypatch.setattr(high_res, 'select_h264_encoder', lambda p: 'libx264')
        monkeypatch.setattr(high_res, '_HW_DECODE', {'libx264': ['-hwaccel', 'no_such_hwaccel']})
        with caplog.at_level(logging.INFO):
            out = ensure_avc1(FFMPEG, src, 1440)
        assert probe_media(FFMPEG, out)['vcodec'] == 'h264'
        assert 'libx264, hardware decoding' in caplog.text
        assert 'libx264, software decoding' in caplog.text

    def test_pass_order_with_hardware_decode(self, monkeypatch):
        """When an encoder has hardware decoding: that first, then software
        decoding, then libx264."""
        seen = []
        monkeypatch.setattr(high_res, '_HW_DECODE', {'h264_videotoolbox': ['-hwaccel', 'videotoolbox']})
        monkeypatch.setattr(high_res, 'select_h264_encoder', lambda p: 'h264_videotoolbox')
        monkeypatch.setattr(high_res, 'probe_media', lambda f, p: {
            'vcodec': 'vp9', 'acodec': 'opus', 'height': 1440, 'duration': 10})
        monkeypatch.setattr(high_res, '_run_conversion',
                            lambda cmd, *a, **k: seen.append(cmd) or 1)
        monkeypatch.setattr(high_res.os.path, 'exists', lambda p: True)
        with pytest.raises(RuntimeError):
            ensure_avc1('ff', 'x.webm', 2160)
        assert len(seen) == 3
        assert '-hwaccel' in seen[0] and 'h264_videotoolbox' in seen[0]
        assert '-hwaccel' not in seen[1] and 'h264_videotoolbox' in seen[1]
        assert 'libx264' in seen[2]


class TestEnsureAvc1Gating:
    def test_no_op_at_1080(self, tmp_path, monkeypatch):
        f = tmp_path / 'v.mp4'
        f.write_bytes(b'x')
        monkeypatch.setattr(high_res, 'probe_media',
                            lambda *a: pytest.fail('must not even probe at 1080p'))
        assert ensure_avc1(FFMPEG, str(f), 1080) == str(f)

    def test_already_h264_is_left_alone(self, tmp_path, monkeypatch):
        f = tmp_path / 'v.mp4'
        f.write_bytes(b'x')
        monkeypatch.setattr(high_res, 'probe_media', lambda *a: {
            'vcodec': 'h264', 'acodec': 'aac', 'height': 1080, 'duration': 10})
        monkeypatch.setattr(high_res, '_run_conversion',
                            lambda *a, **k: pytest.fail('must not convert H.264'))
        assert ensure_avc1(FFMPEG, str(f), 2160) == str(f)


def _parse_float(text):
    try:
        return float(text.replace(',', '.').strip())
    except ValueError:
        return float('nan')


def _make_vp9(path, size='320x240', seconds=2):
    """Small VP9 + Opus file, standing in for a downloaded high-res stream."""
    r = subprocess.run([FFMPEG, '-y', '-hide_banner', '-loglevel', 'error',
                        '-f', 'lavfi', '-i', f'testsrc2=size={size}:rate=25:duration={seconds}',
                        '-f', 'lavfi', '-i', f'sine=frequency=440:duration={seconds}',
                        '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8',
                        '-c:a', 'libopus', '-shortest', path],
                       capture_output=True)
    return r.returncode == 0


@pytest.mark.skipif(not HAVE_FFMPEG, reason='ffmpeg not available')
class TestRealConversion:
    def test_probe_reads_vp9_and_opus(self, tmp_path):
        src = str(tmp_path / 'clip.webm')
        if not _make_vp9(src):
            pytest.skip('this ffmpeg build cannot encode VP9')
        info = probe_media(FFMPEG, src)
        assert info['vcodec'] == 'vp9'
        assert info['acodec'] == 'opus'
        assert info['height'] == 240
        assert 1.5 < info['duration'] < 2.5

    def test_vp9_is_converted_to_h264_aac_mp4(self, tmp_path):
        src = str(tmp_path / 'clip.webm')
        if not _make_vp9(src):
            pytest.skip('this ffmpeg build cannot encode VP9')
        progress = []

        class Sock:
            def emit(self, ev, data):
                progress.append(data['percentage'])

        out = ensure_avc1(FFMPEG, src, 2160, socketio=Sock())

        assert out.endswith('.mp4') and os.path.exists(out)
        assert not os.path.exists(src), 'the VP9 original should be replaced'
        info = probe_media(FFMPEG, out)
        assert info['vcodec'] == 'h264'
        assert info['acodec'] == 'aac', 'opus must be re-encoded for Premiere'
        assert progress[0] == '0%' and progress[-1] == '100%'
        # content.js drops anything parseFloat cannot read (button froze at 100%)
        assert all(not math.isnan(_parse_float(p.replace('%', ''))) for p in progress)

    def test_failed_hardware_encoder_falls_back_to_libx264(self, tmp_path, monkeypatch):
        src = str(tmp_path / 'clip.webm')
        if not _make_vp9(src):
            pytest.skip('this ffmpeg build cannot encode VP9')
        monkeypatch.setattr(high_res, 'select_h264_encoder', lambda p: 'h264_does_not_exist')
        out = ensure_avc1(FFMPEG, src, 1440)
        assert probe_media(FFMPEG, out)['vcodec'] == 'h264'

    def test_cancellation_aborts_and_cleans_up(self, tmp_path):
        src = str(tmp_path / 'clip.webm')
        if not _make_vp9(src, seconds=4):
            pytest.skip('this ffmpeg build cannot encode VP9')
        with pytest.raises(Exception, match='cancelled'):
            ensure_avc1(FFMPEG, src, 2160, is_cancelled=lambda: True)
        assert os.path.exists(src), 'original must survive a cancelled conversion'
        assert not any('avc1-converting' in n for n in os.listdir(tmp_path))

    def test_conversion_registers_process_for_cancel(self, tmp_path):
        src = str(tmp_path / 'clip.webm')
        if not _make_vp9(src):
            pytest.skip('this ffmpeg build cannot encode VP9')
        seen = {}

        class Tracking(dict):
            def __setitem__(self, k, v):
                if v is not None:
                    seen[k] = v
                super().__setitem__(k, v)

        cd = Tracking()
        ensure_avc1(FFMPEG, src, 2160, current_download=cd)
        assert 'process' in seen, 'the cancel handler kills current_download["process"]'
        assert cd.get('process') is None, 'must be cleared once the conversion ends'

    def test_cancel_from_the_route_is_not_taken_for_an_encoder_failure(self, tmp_path, monkeypatch):
        """The cancel route terminates current_download['process'] and clears
        the slot. That exit used to look like an NVENC failure, so libx264
        restarted, the cancelled video finished and was imported anyway."""
        src = str(tmp_path / 'clip.webm')
        if not _make_vp9(src, size='1280x720', seconds=20):
            pytest.skip('this ffmpeg build cannot encode VP9')
        monkeypatch.setattr(high_res, 'select_h264_encoder', lambda p: 'libx264')
        monkeypatch.setattr(high_res, 'h264_encoder_args',
                            lambda enc, h: ['-c:v', 'libx264', '-preset', 'veryslow', '-pix_fmt', 'yuv420p'])
        started = []
        cd = {'process': None, 'ydl': None, 'cancel_callback': None}

        def cancel_route():
            # same steps as YoutubetoPremiere.py's cancel handler, minus the callback
            while cd.get('process') is None:
                time.sleep(0.05)
            started.append(cd['process'])
            cd['process'].terminate()
            cd['process'] = None

        t = threading.Thread(target=cancel_route, daemon=True)
        t.start()
        with pytest.raises(Exception, match='cancelled'):
            ensure_avc1(FFMPEG, src, 1440, current_download=cd)
        t.join(5)
        assert len(started) == 1, 'no second encoder may start after a cancel'
        assert os.path.exists(src)
        assert not any('avc1-converting' in n for n in os.listdir(tmp_path))


class TestChunkedHttpReads:
    """Strategy 1 must read googlevideo in bounded chunks.

    Measured on one URL: 0.8 MB/s open-ended (FFmpeg's default) vs 8 MB/s in
    2 MB requests; a 6 s clip went from a 90 s timeout to under a second.
    """

    @pytest.mark.skipif(not HAVE_FFMPEG, reason='ffmpeg not available')
    def test_bundled_ffmpeg_supports_request_size(self):
        import video_processing
        video_processing._http_chunk_args_cache.clear()
        args = video_processing.ffmpeg_http_chunk_args(FFMPEG)
        assert args[:2] == ['-request_size', '2000000']

    def test_unsupported_ffmpeg_gets_no_option(self, monkeypatch):
        import video_processing
        video_processing._http_chunk_args_cache.clear()

        class R:
            stdout = 'https AVOptions:\n  -seekable <boolean>'
        monkeypatch.setattr(video_processing.subprocess, 'run', lambda *a, **k: R())
        assert video_processing.ffmpeg_http_chunk_args('old-ffmpeg') == []
        video_processing._http_chunk_args_cache.clear()

    def test_both_inputs_are_chunked(self):
        import inspect
        import video_processing
        src = inspect.getsource(video_processing._try_direct_ffmpeg_clip)
        assert "['-headers', hdr] + chunk + ['-ss', ss, '-i', video_url_direct]" in src
        assert "['-headers', audio_hdr] + chunk + ['-ss', ss" in src


class TestWiring:
    """The high-res path is hooked into every download route."""

    def _src(self, name):
        import inspect
        import video_processing
        return inspect.getsource(getattr(video_processing, name))

    def test_full_video_selector_and_conversion(self):
        src = self._src('download_video')
        assert 'high_res_video_selector(max_height)' in src
        assert 'ensure_avc1(ffmpeg_path, actual_file, max_height' in self._src('_finalize_full_download')

    def test_every_full_download_route_ends_in_finalize(self):
        """The 403 retries used to return the raw file: no H.264 conversion
        and no import into Premiere."""
        src = self._src('download_video')
        assert src.count('return _finalize_full_download(') == 3  # main, 403 retries, cookie fallback
        assert 'emit_import_video' not in src, 'import must only be sent by _finalize_full_download'

    def test_403_retries_try_chrome_cookies_first(self):
        src = self._src('download_video')
        assert "ladder.insert(0, ('Chrome cookies', 'cookies'))" in src
        # the cookies file must outlive the first attempt so the retries can use it
        first_attempt_end = src.index("# cancel_callback stays set: the H.264 conversion that follows must")
        assert 'os.remove(cookies_file)' not in src[:first_attempt_end]
        assert src.rindex('os.remove(cookies_file)') > src.index("('Chrome cookies', 'cookies')")

    def test_throttled_first_attempt_is_detected_and_retried(self):
        """YouTube sometimes throttles a stream to ~65 KB/s and then resets the
        connection: the download crawled for minutes and failed with no retry."""
        from video_processing import is_retryable_download_error
        from yt_dlp.utils import ThrottledDownload
        assert is_retryable_download_error(ThrottledDownload())
        assert is_retryable_download_error(Exception(
            "ERROR: [download] Got error: ('Connection broken: ConnectionResetError(10054, ...)')"))
        src = self._src('download_video')
        first = src.index("'throttledratelimit': THROTTLED_RATE_LIMIT")
        ladder = src.index("ladder = [")
        assert first < ladder
        # the fallbacks re-extract in a loop on ThrottledDownload: no limit there
        assert 'throttledratelimit' not in src[ladder:]

    def test_conversion_stays_cancellable(self):
        """cancel_callback used to be cleared before the H.264 conversion, so the
        cancel route could only kill ffmpeg, never flag the download."""
        src = self._src('download_video')
        conversion = src.index('return _finalize_full_download(actual_file')
        assert "current_download['cancel_callback'] = None" not in src[:conversion]
        assert src.rindex("current_download['cancel_callback'] = None") > conversion

    def test_full_video_high_res_survives_the_avc1_id_override(self):
        """The verified AVC1 IDs overwrite ydl_opts['format'] just before the
        download; the high-res selector must be prepended after that, or a
        1440p/4K request silently downloads 1080p AVC1."""
        src = self._src('download_video')
        last_override = src.rindex("ydl_opts['format'] = actual_format")
        prepend = src.index("ydl_opts['format'] = high_res_video_selector(resolution) + '/' + ydl_opts['format']")
        download = src.index('ydl.process_ie_result(info.copy(), download=True)')
        assert last_override < prepend < download

    def test_clip_selector_strategy2_and_conversion(self):
        src = self._src('download_and_process_clip')
        assert 'high_res_video_selector(sanitized_resolution)' in src
        assert 'high_res_video_selector(_target_h, with_audio=False)' in src
        assert 'ensure_avc1(ffmpeg_path, video_file_path, sanitized_resolution' in src

    def test_strategy1_uses_high_res_stream(self):
        assert 'pick_high_res_format(formats, target_height)' in self._src('_try_direct_ffmpeg_clip')

    def test_panel_offers_4k_and_1440_with_1080_default(self):
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        tsx = open(os.path.join(root, 'src', 'js', 'main', 'main.tsx'), encoding='utf-8').read()
        assert '<option value="2160">' in tsx and '<option value="1440">' in tsx
        assert "resolution: '1080'" in tsx, 'default must stay 1080p (AVC1, no conversion)'
