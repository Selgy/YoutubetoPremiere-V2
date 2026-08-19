"""Regression tests for the preferred audio language.

A clip came out in German. YouTube publishes every dub as its own audio format
at practically the same bitrate (measured on a real video: German 48.788 kbps,
English original 48.788), so the direct-ffmpeg path — which sorted purely on
bitrate and never looked at the language — picked an effectively random track.

yt-dlp's own format selection is fine: it sorts on language_preference, so
'140/bestaudio[ext=m4a]/bestaudio' already returns the original. Only the
hand-rolled picker in strategy 1 was wrong.
"""
import inspect

import pytest

import video_processing
from video_processing import _pick_audio_format


def track(fmt_id, lang, langpref=-1, abr=48.788, ext='m4a'):
    return {'format_id': fmt_id, 'language': lang, 'language_preference': langpref,
            'abr': abr, 'ext': ext}


# Mirrors a real multi-language video: many dubs, one original, near-identical
# bitrates, and the original last in the list.
TRACKS = [
    track('140-4', 'de'),
    track('140-9', 'fr'),
    track('140-14', 'ru', abr=48.789),   # highest bitrate, but a dub
    track('140-23', 'en-US', langpref=10),
]


class TestPickAudioFormat:
    def test_original_wins_over_a_higher_bitrate_dub(self):
        picked = _pick_audio_format(TRACKS, 'original')
        assert picked['language'] == 'en-US'
        assert picked['language_preference'] == 10

    def test_no_preference_behaves_as_original(self):
        assert _pick_audio_format(TRACKS, None)['language'] == 'en-US'
        assert _pick_audio_format(TRACKS, '')['language'] == 'en-US'

    def test_specific_language_is_honoured(self):
        assert _pick_audio_format(TRACKS, 'fr')['format_id'] == '140-9'
        assert _pick_audio_format(TRACKS, 'de')['format_id'] == '140-4'

    def test_region_suffix_matches_the_base_language(self):
        """'en' must match a track tagged 'en-US'."""
        assert _pick_audio_format(TRACKS, 'en')['format_id'] == '140-23'

    def test_missing_language_falls_back_to_original_not_a_random_dub(self):
        picked = _pick_audio_format(TRACKS, 'ja')
        assert picked['language'] == 'en-US', "should fall back to the original track"

    def test_single_track_without_language_metadata(self):
        only = [track('140', None, langpref=None)]
        assert _pick_audio_format(only, 'original')['format_id'] == '140'

    def test_no_candidates(self):
        assert _pick_audio_format([], 'original') is None

    def test_bitrate_still_decides_within_one_language(self):
        same = [track('a', 'en-US', langpref=10, abr=70),
                track('b', 'en-US', langpref=10, abr=130)]
        assert _pick_audio_format(same, 'original')['format_id'] == 'b'


class TestStrategyOneUsesThePicker:
    def test_direct_clip_accepts_the_preference(self):
        sig = inspect.signature(video_processing._try_direct_ffmpeg_clip)
        assert 'preferred_language' in sig.parameters

    def test_direct_clip_no_longer_sorts_audio_on_bitrate_alone(self):
        src = inspect.getsource(video_processing._try_direct_ffmpeg_clip)
        assert '_pick_audio_format' in src
        assert "m4a.sort(key=lambda f: f.get('abr', 0)" not in src, (
            "bitrate-only sort is back; it picks an arbitrary language"
        )

    def test_call_site_passes_the_setting(self):
        src = inspect.getsource(video_processing.download_and_process_clip)
        assert "preferred_language=settings.get('preferredAudioLanguage'" in src


class TestStrategyTwoHonoursASpecificLanguage:
    def test_language_filter_is_applied(self):
        src = inspect.getsource(video_processing.download_and_process_clip)
        assert 'language^=' in src, (
            "the partial-clip audio download ignores the requested language"
        )

    def test_original_keeps_yt_dlp_default_ordering(self):
        """yt-dlp already prefers language_preference 10 — do not fight it."""
        src = inspect.getsource(video_processing.download_and_process_clip)
        assert "'140/bestaudio[ext=m4a]/bestaudio'" in src
