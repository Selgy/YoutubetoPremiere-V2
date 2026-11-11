"""TikTok, Instagram, X and Dailymotion support (app/sites.py, app/site_download.py)."""
import json
import os
import re

import pytest

import security
import sites
import site_download

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.mark.parametrize('url,site', [
    ('https://www.youtube.com/watch?v=abc', 'youtube'),
    ('https://youtu.be/abc', 'youtube'),
    ('https://www.tiktok.com/@user/video/7702181336823418119', 'tiktok'),
    ('https://www.instagram.com/reel/Chunk8-jurw/', 'instagram'),
    ('https://x.com/user/status/2120448358821298541', 'twitter'),
    ('https://twitter.com/user/status/1', 'twitter'),
    ('https://mobile.twitter.com/user/status/1', 'twitter'),
    ('https://www.dailymotion.com/video/xbvpep6', 'dailymotion'),
    ('https://dai.ly/xbvpep6', 'dailymotion'),
])
def test_supported_sites(url, site):
    assert sites.site_of(url) == site
    assert sites.is_supported_url(url)


@pytest.mark.parametrize('url', [
    None, '', 'not a url', 'file:///etc/passwd', 'ftp://x.com/a',
    'https://evil.com/watch?v=abc', 'https://notx.com/a/status/1',
    'https://tiktok.com.evil.com/@u/video/1', 'https://evil-youtube.com/watch?v=a',
    'https://x.com@evil.com/a/status/1',
])
def test_other_urls_are_refused(url):
    assert not sites.is_supported_url(url)


def test_youtube_keeps_its_own_pipeline():
    assert sites.is_youtube_url('https://m.youtube.com/watch?v=abc')
    assert not sites.is_youtube_url('https://www.tiktok.com/@u/video/1')


@pytest.mark.parametrize('origin', [
    'https://www.tiktok.com', 'https://www.instagram.com', 'https://x.com',
    'https://twitter.com', 'https://www.dailymotion.com',
])
def test_content_script_origins_are_allowed(origin):
    assert security.is_allowed_origin(origin)


@pytest.mark.parametrize('origin', ['https://evilx.com', 'https://x.com.evil.com', 'http://x.com'])
def test_lookalike_origins_are_refused(origin):
    assert not security.is_allowed_origin(origin)


def test_cookie_file_keeps_only_the_sites_cookies(tmp_path, monkeypatch):
    monkeypatch.setenv('TEMP', str(tmp_path))
    cookies = [
        {'name': 'sessionid', 'value': 's1', 'domain': '.instagram.com', 'path': '/', 'secure': True,
         'expirationDate': 1900000000.5},
        {'name': 'SID', 'value': 'google', 'domain': '.google.com', 'path': '/'},
        {'name': 'auth_token', 'value': 'x', 'domain': '.x.com', 'path': '/'},
        {'name': 'bad', 'value': 'a\tb', 'domain': '.instagram.com', 'path': '/'},
    ]
    path = site_download.write_cookies_file(cookies, 'instagram')
    text = open(path, encoding='utf-8').read()
    assert text.startswith('# Netscape HTTP Cookie File')
    assert '.instagram.com\tTRUE\t/\tTRUE\t1900000000\tsessionid\ts1' in text
    assert 'google' not in text and 'auth_token' not in text and 'bad' not in text
    assert site_download.write_cookies_file([cookies[1]], 'instagram') is None


def test_titles_are_short_file_names():
    info = {'id': '7702', 'title': '2e soir à paris c’était fou #fyp #paris https://t.co/x ' + 'a' * 200}
    title = site_download.safe_title(info)
    assert len(title) <= site_download.MAX_TITLE_CHARS
    assert '#' not in title and 'http' not in title and '/' not in title
    assert title.startswith('2e_soir')
    assert site_download.safe_title({'id': '123', 'title': '###'}) == '123'
    # A TikTok without caption gets yt-dlp's placeholder title
    assert site_download.safe_title({'id': '77056', 'title': 'TikTok video #77056',
                                     'uploader': 'ratomilton'}) == 'ratomilton_77056'


def test_vertical_videos_are_sorted_by_their_short_side():
    # 'res' is the smaller dimension in yt-dlp: a 720x1280 reel is 720p
    assert site_download.video_sort(1080)[0] == 'res:1080'
    assert 'vcodec:h264' in site_download.video_sort(1080)


def test_login_errors_tell_the_user_to_log_in():
    msg = site_download.friendly_error(Exception('ERROR: [Instagram] x: login required'), 'instagram')
    assert 'Connecte-toi à Instagram' in msg
    msg = site_download.friendly_error(
        Exception('Postprocessing: WARNING: unable to obtain file audio codec with ffprobe'), 'instagram')
    assert 'piste audio' in msg


def test_clips_are_refused_outside_youtube(monkeypatch):
    import video_processing as vp
    monkeypatch.setattr(vp, 'check_ffmpeg', lambda s, io: {'success': True, 'path': 'ffmpeg'})
    monkeypatch.setattr(vp, 'get_default_download_path', lambda io: '/tmp', raising=False)
    res = vp.handle_video_url('https://www.tiktok.com/@u/video/1', 'clip', {}, None, {},
                              clip_start=1, clip_end=5)
    assert 'YouTube' in res['error']


class TestExtension:
    BROWSERS = ('Chrome', 'Firefox')

    def _read(self, browser, name):
        with open(os.path.join(ROOT, 'Extension Youtube', browser, name), encoding='utf-8') as f:
            return f.read()

    @pytest.mark.parametrize('browser', BROWSERS)
    def test_sites_js_loads_before_content_js(self, browser):
        js = json.loads(self._read(browser, 'manifest.json'))['content_scripts'][0]['js']
        assert js.index('sites.js') < js.index('content.js')

    @pytest.mark.parametrize('browser', BROWSERS)
    def test_content_script_runs_on_every_site(self, browser):
        matches = ' '.join(json.loads(self._read(browser, 'manifest.json'))['content_scripts'][0]['matches'])
        for domain in ('youtube.com', 'tiktok.com', 'instagram.com', 'x.com', 'twitter.com', 'dailymotion.com'):
            assert domain in matches

    @pytest.mark.parametrize('browser', BROWSERS)
    def test_extension_and_server_agree_on_domains(self, browser):
        src = self._read(browser, 'sites.js')
        block = src[src.index('const SITE_DOMAINS'):src.index('};', src.index('const SITE_DOMAINS'))]
        js_domains = set(re.findall(r"'([a-z.-]+\.[a-z]+)'", block))
        py_domains = {d for ds in sites.SITE_DOMAINS.values() for d in ds} - {'youtube-nocookie.com'}
        assert js_domains == py_domains

    @pytest.mark.parametrize('browser', BROWSERS)
    def test_clip_button_is_youtube_only(self, browser):
        src = self._read(browser, 'content.js')
        clip = src.index("createButton('clip-button'")
        assert 'if (YTP_SITE.supportsClip)' in src[clip - 200:clip]
        assert 'supportsClip: true' in self._read(browser, 'sites.js').split('const tiktok')[0]
        assert self._read(browser, 'sites.js').count('supportsClip: false') == 4

    def test_chrome_and_firefox_share_sites_js(self):
        assert self._read('Chrome', 'sites.js') == self._read('Firefox', 'sites.js')
