"""The local server must only answer its own clients (see app/security.py)."""
import pytest

import security


@pytest.mark.parametrize('origin', [
    None, '',
    'https://www.youtube.com', 'https://m.youtube.com', 'https://youtube.com',
    'chrome-extension://' + 'a' * 32,
    'moz-extension://12345678-1234-1234-1234-123456789abc',
    'http://localhost:3000', 'http://127.0.0.1', 'file://', 'null',
])
def test_own_clients_are_allowed(origin):
    assert security.is_allowed_origin(origin)


@pytest.mark.parametrize('origin', [
    'https://evil.com', 'https://youtube.com.evil.com', 'https://evilyoutube.com',
    'http://www.youtube.com',  # plain http YouTube is not a real client
    'http://192.168.1.10:8080', 'chrome-extension://short',
    'http://localhost.evil.com',
])
def test_foreign_origins_are_refused(origin):
    assert not security.is_allowed_origin(origin)


@pytest.mark.parametrize('host,ok', [
    ('localhost:17845', True), ('127.0.0.1:17845', True), ('[::1]:17845', True),
    ('LOCALHOST', True), (None, True),
    ('evil.com:17845', False), ('192.168.1.10:17845', False),
    ('localhost.evil.com', False),
])
def test_host_header_blocks_dns_rebinding(host, ok):
    assert security.is_allowed_host(host) is ok


def test_request_needs_both_host_and_origin():
    assert security.is_request_allowed({'Host': 'localhost:17845', 'Origin': 'https://www.youtube.com'})
    assert not security.is_request_allowed({'Host': 'localhost:17845', 'Origin': 'https://evil.com'})
    assert not security.is_request_allowed({'Host': 'evil.com', 'Origin': 'https://www.youtube.com'})


def test_server_binds_to_loopback_only():
    assert security.BIND_HOST == '127.0.0.1'


@pytest.mark.parametrize('url', [
    'https://github.com/Selgy/YoutubetoPremiere-V2/releases/download/v3.1.0/YouTubetoPremiere-Setup.exe',
    'https://github.com/Selgy/YoutubetoPremiere-V2/releases/download/v3.1.0/YouTubetoPremiere-macOS.pkg',
])
def test_update_from_our_releases_is_trusted(url):
    assert security.is_trusted_update_url(url)


@pytest.mark.parametrize('url', [
    None, '', 'https://evil.com/YouTubetoPremiere-Setup.exe',
    'http://github.com/Selgy/YoutubetoPremiere-V2/releases/download/v1/YouTubetoPremiere-Setup.exe',
    'https://github.com/Other/YoutubetoPremiere-V2/releases/download/v1/YouTubetoPremiere-Setup.exe',
    'https://github.com/Selgy/YoutubetoPremiere-V2/releases/download/v1/evil.exe',
    'https://github.com/Selgy/YoutubetoPremiere-V2/releases/../../Evil/x/releases/YouTubetoPremiere-Setup.exe',
    'https://github.com/Selgy/YoutubetoPremiere-V2/releases/download/v1/YouTubetoPremiere-Setup.exe.bat',
])
def test_any_other_update_url_is_refused(url):
    assert not security.is_trusted_update_url(url)


def test_settings_writes_cannot_touch_licence_or_internals():
    data = {'resolution': '1080', 'licenseKey': 'stolen', 'ffmpeg_path': '/tmp/evil',
            'SETTINGS_FILE': '/etc/passwd', 'downloadPath': 'D:/clips'}
    assert security.filter_writable_settings(data) == {'resolution': '1080', 'downloadPath': 'D:/clips'}
    assert security.filter_writable_settings(['not', 'a', 'dict']) == {}


def test_public_settings_hide_the_licence_key():
    out = security.public_settings({'licenseKey': 'SECRET', 'ffmpeg_path': 'x', 'resolution': '1080'})
    assert 'licenseKey' not in out and 'ffmpeg_path' not in out
    assert out['hasLicense'] is True and out['resolution'] == '1080'
    assert security.public_settings({})['hasLicense'] is False


def test_duplicate_download_guard():
    import routes
    key = routes.download_key('https://www.youtube.com/watch?v=abc', 'clip', 12.5)
    assert key != routes.download_key('https://www.youtube.com/watch?v=abc', 'clip', 30)
    assert routes.begin_download(key)
    try:
        assert not routes.begin_download(key), 'a second identical request must be refused'
    finally:
        routes.end_download(key)
    assert routes.begin_download(key)
    routes.end_download(key)
