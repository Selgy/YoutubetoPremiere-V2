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
import os
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
        assert progress[0] == 'Conversion H.264 0%' and progress[-1] == 'Conversion H.264 100%'

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
        assert 'ensure_avc1(ffmpeg_path, actual_file, max_height' in src

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
