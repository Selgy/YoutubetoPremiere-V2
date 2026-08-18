"""Regression tests for download-path resolution.

Contract (matches what the panel UI promises the user):
  settings['downloadPath'] empty     -> save next to the ACTIVE project
  settings['downloadPath'] non-empty -> the folder the user picked, always

Bugs these guard against, all of which made downloads land next to a
previously opened project:
  1. get_default_download_path() short-circuited on a cached settings value.
  2. handle_video_url() read settings['downloadPath'] directly, so the fixed
     get_default_download_path() was never called.
  3. routes.py persisted the auto-generated folder into settings, so the
     setting was never actually empty and froze onto one project.
"""
import json
import os

import pytest

import utils


@pytest.fixture
def project_dirs(tmp_path):
    """Two project folders: an old one and the currently active one."""
    old = tmp_path / "ProjectOld"
    new = tmp_path / "ProjectNew"
    old.mkdir()
    new.mkdir()
    return old, new


def _auto_path(project_dir):
    return str(project_dir / "YoutubeToPremiere_download")


class TestGetDefaultDownloadPath:
    def test_empty_setting_follows_active_project(self, monkeypatch, project_dirs):
        """The core behaviour: empty setting -> current project's folder."""
        _, new = project_dirs
        monkeypatch.setattr(utils, 'load_settings', lambda: {'downloadPath': ''})
        monkeypatch.setattr(utils, 'query_live_project_path',
                            lambda socketio, timeout=5: str(new / "current.prproj"))

        assert utils.get_default_download_path(socketio=object()) == _auto_path(new)

    def test_switching_project_changes_the_folder(self, monkeypatch, project_dirs):
        """Two downloads, two different active projects, two destinations."""
        old, new = project_dirs
        monkeypatch.setattr(utils, 'load_settings', lambda: {'downloadPath': ''})

        monkeypatch.setattr(utils, 'query_live_project_path',
                            lambda socketio, timeout=5: str(old / "a.prproj"))
        first = utils.get_default_download_path(socketio=object())

        monkeypatch.setattr(utils, 'query_live_project_path',
                            lambda socketio, timeout=5: str(new / "b.prproj"))
        second = utils.get_default_download_path(socketio=object())

        assert first == _auto_path(old)
        assert second == _auto_path(new)

    def test_custom_path_wins_and_is_never_overridden(self, monkeypatch, tmp_path, project_dirs):
        """A folder the user chose by hand must always be honoured."""
        _, new = project_dirs
        custom = tmp_path / "MyDownloads"
        custom.mkdir()
        monkeypatch.setattr(utils, 'load_settings',
                            lambda: {'downloadPath': str(custom)})
        monkeypatch.setattr(utils, 'query_live_project_path',
                            lambda socketio, timeout=5: str(new / "current.prproj"))

        assert utils.get_default_download_path(socketio=object()) == str(custom)

    def test_falls_back_when_no_project_and_no_custom_path(self, monkeypatch):
        """No panel answer and no user choice: must still return somewhere."""
        monkeypatch.setattr(utils, 'load_settings', lambda: {'downloadPath': ''})
        monkeypatch.setattr(utils, 'query_live_project_path',
                            lambda socketio, timeout=5: None)

        result = utils.get_default_download_path(socketio=object())

        assert result
        assert result.endswith('YoutubeToPremiere_download')


class TestAutoPathMigration:
    """Old builds wrote the auto folder into settings; clear it once."""

    @pytest.fixture
    def isolated_settings(self, tmp_path, monkeypatch):
        """Run load_settings() against a throwaway config dir.

        Both APPDATA and '~' must be redirected: load_settings has a legacy
        Windows migration that copies ~/.config/YoutubetoPremiere/settings.json
        over the current file, which would otherwise pull in the real machine's
        settings and silently invalidate the test.
        """
        fake_home = tmp_path / "home"
        fake_home.mkdir()
        real_expanduser = os.path.expanduser

        def fake_expanduser(path):
            if path.startswith('~'):
                return str(fake_home) + path[1:]
            return real_expanduser(path)

        monkeypatch.setattr(os.path, 'expanduser', fake_expanduser)
        monkeypatch.setattr(utils.sys, 'platform', 'win32')

        def _load(payload):
            cfg_dir = tmp_path / "appdata" / "YoutubetoPremiere"
            cfg_dir.mkdir(parents=True, exist_ok=True)
            settings_file = cfg_dir / "settings.json"
            settings_file.write_text(json.dumps(payload))
            monkeypatch.setenv('APPDATA', str(tmp_path / "appdata"))
            utils._settings_cache = None
            utils._settings_cache_time = 0
            return utils.load_settings(), settings_file

        return _load

    def test_clears_leftover_auto_path_and_flags_it(self, tmp_path, isolated_settings):
        stale = str(tmp_path / "ProjectOld" / "YoutubeToPremiere_download")

        settings, settings_file = isolated_settings({'downloadPath': stale})

        assert settings['downloadPath'] == '', "stale auto path should be cleared"
        assert settings['autoDownloadPathCleared'] is True

        on_disk = json.loads(settings_file.read_text())
        assert on_disk['downloadPath'] == ''
        assert on_disk['autoDownloadPathCleared'] is True

    def test_leaves_custom_path_untouched(self, tmp_path, isolated_settings):
        custom = str(tmp_path / "MyDownloads")

        settings, _ = isolated_settings({'downloadPath': custom})

        assert settings['downloadPath'] == custom

    def test_does_not_reclear_after_migration(self, tmp_path, isolated_settings):
        """Once flagged, a folder with that name is a deliberate user choice."""
        deliberate = str(tmp_path / "Stuff" / "YoutubeToPremiere_download")

        settings, _ = isolated_settings({
            'downloadPath': deliberate,
            'autoDownloadPathCleared': True,
        })

        assert settings['downloadPath'] == deliberate


class TestCrossPlatform:
    """The panel ships for Windows and macOS; both must resolve identically."""

    def test_posix_project_path_resolves(self, monkeypatch, tmp_path):
        """A macOS-style POSIX project path yields a sibling folder."""
        proj_dir = tmp_path / "Mac Project"
        proj_dir.mkdir()
        monkeypatch.setattr(utils, 'load_settings', lambda: {'downloadPath': ''})
        monkeypatch.setattr(utils, 'query_live_project_path',
                            lambda socketio, timeout=5: str(proj_dir / "film.prproj"))

        result = utils.get_default_download_path(socketio=object())

        assert result == str(proj_dir / "YoutubeToPremiere_download")
        assert os.path.isdir(result)

    def test_uri_encoded_path_is_decoded_when_it_resolves(self, tmp_path):
        """app.project.path returns %20 for spaces, notably on macOS."""
        real = tmp_path / "My Project"
        real.mkdir()
        encoded = str(real).replace(' ', '%20')

        assert utils.normalize_project_path(encoded) == str(real)

    def test_literal_percent_in_real_path_is_preserved(self, tmp_path):
        """A folder genuinely containing '%' must not be mangled."""
        weird = tmp_path / "100%20off"
        weird.mkdir()

        assert utils.normalize_project_path(str(weird)) == str(weird)

    def test_plain_path_untouched(self):
        assert utils.normalize_project_path('/Users/me/film.prproj') == '/Users/me/film.prproj'
        assert utils.normalize_project_path('') == ''
        assert utils.normalize_project_path(None) is None

    def test_unwritable_project_folder_falls_back(self, monkeypatch, tmp_path):
        """Read-only volume / macOS TCC denial must not break the download."""
        monkeypatch.setattr(utils, 'load_settings', lambda: {'downloadPath': ''})
        monkeypatch.setattr(utils, 'query_live_project_path',
                            lambda socketio, timeout=5: '/nope/readonly/film.prproj')

        real_makedirs = os.makedirs

        def picky_makedirs(path, **kwargs):
            if str(path).startswith(('/nope', '\\nope')):
                raise OSError(13, 'Permission denied')
            return real_makedirs(path, **kwargs)

        monkeypatch.setattr(utils.os, 'makedirs', picky_makedirs)

        result = utils.get_default_download_path(socketio=object())

        assert result
        assert not str(result).startswith('/nope')

    def test_panel_uses_fsname_for_project_path(self):
        """The JSX must convert app.project.path via File(...).fsName."""
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        src = open(os.path.join(root, 'src', 'js', 'settings', 'videoImport.js'),
                   encoding='utf-8').read()

        assert src.count('new File(app.project.path).fsName') == 2, (
            "both the connect-time push and the request_project_path handler must "
            "use File(...).fsName; raw app.project.path is URI-encoded on macOS"
        )


class TestCallersDoNotBypassResolution:
    def test_handle_video_url_delegates(self):
        """Reading downloadPath there re-introduced the bug once already."""
        import inspect
        import video_processing

        src = inspect.getsource(video_processing.handle_video_url)
        assert "settings.get('downloadPath'" not in src, (
            "handle_video_url reads downloadPath from settings directly; "
            "it must call get_default_download_path(socketio)"
        )
        assert "get_default_download_path(socketio)" in src

    def test_routes_never_persists_auto_path(self):
        """routes.py must not write the auto folder back into settings."""
        routes_src = (
            open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                              'app', 'routes.py'), encoding='utf-8').read()
        )
        assert 'save_download_path(auto_path)' not in routes_src, (
            "routes.py persists the auto folder into settings, which stops the "
            "setting from ever being empty and freezes downloads onto one project"
        )


class TestStaleAutoPathIsIgnoredAtResolution:
    r"""A stored auto folder must never beat the active project.

    Real case: settings held
        H:\RobloxFortnite\8_SAVE\YoutubeToPremiere_download
    with autoDownloadPathCleared already true, while the open project was
    E:\MONTAGE\...\Parapactum. The clip landed in the RobloxFortnite folder.

    The one-shot migration could not save this: an older build re-persisted the
    auto folder afterwards, and the panel re-sends the whole settings object on
    any change. Deciding at resolution time is what makes it self-healing.
    """

    def test_stale_auto_path_loses_to_active_project(self, monkeypatch, project_dirs):
        old, new = project_dirs
        monkeypatch.setattr(utils, 'load_settings',
                            lambda: {'downloadPath': _auto_path(old),
                                     'autoDownloadPathCleared': True})
        monkeypatch.setattr(utils, 'query_live_project_path',
                            lambda socketio, timeout=5: str(new / 'cur.prproj'))

        result = utils.get_default_download_path(socketio=object())

        assert result == _auto_path(new)
        assert 'ProjectOld' not in result

    def test_survives_being_re_persisted_by_an_old_build(self, monkeypatch, project_dirs):
        """Even re-written every time, it must never pin the download."""
        old, new = project_dirs
        monkeypatch.setattr(utils, 'query_live_project_path',
                            lambda socketio, timeout=5: str(new / 'cur.prproj'))
        for _ in range(3):
            monkeypatch.setattr(utils, 'load_settings',
                                lambda: {'downloadPath': _auto_path(old)})
            assert utils.get_default_download_path(socketio=object()) == _auto_path(new)

    def test_trailing_separator_still_detected(self, monkeypatch, project_dirs):
        old, new = project_dirs
        monkeypatch.setattr(utils, 'load_settings',
                            lambda: {'downloadPath': _auto_path(old) + '\\'})
        monkeypatch.setattr(utils, 'query_live_project_path',
                            lambda socketio, timeout=5: str(new / 'cur.prproj'))
        assert utils.get_default_download_path(socketio=object()) == _auto_path(new)

    def test_a_real_custom_folder_is_still_honoured(self, monkeypatch, tmp_path, project_dirs):
        _, new = project_dirs
        custom = tmp_path / 'Mes Telechargements'
        custom.mkdir()
        monkeypatch.setattr(utils, 'load_settings',
                            lambda: {'downloadPath': str(custom)})
        monkeypatch.setattr(utils, 'query_live_project_path',
                            lambda socketio, timeout=5: str(new / 'cur.prproj'))
        assert utils.get_default_download_path(socketio=object()) == str(custom)


def test_routes_does_not_report_a_stale_auto_path_to_the_panel():
    """The panel displays what routes reports, then saves it back."""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    src = open(os.path.join(root, 'app', 'routes.py'), encoding='utf-8').read()
    assert 'looks_auto' in src, (
        "routes still hands the panel a stored auto folder, which the panel "
        "then re-persists as if it were a user choice"
    )
    assert 'if user_path and not looks_auto:' in src
