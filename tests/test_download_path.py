"""Regression tests for download-path resolution.

The bug these guard against: downloads landed next to the *previously opened*
Premiere project. Two distinct causes, both covered here:

1. get_default_download_path() short-circuited on the cached settings value.
2. handle_video_url() read settings['downloadPath'] directly, so the fixed
   get_default_download_path() was never even called.
"""
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
    def test_follows_live_project_not_stale_auto_path(self, monkeypatch, project_dirs):
        """The core bug: a stale auto path must lose to the live project."""
        old, new = project_dirs
        monkeypatch.setattr(utils, 'load_settings',
                            lambda: {'downloadPath': _auto_path(old)})
        monkeypatch.setattr(utils, 'query_live_project_path',
                            lambda socketio, timeout=5: str(new / "current.prproj"))

        result = utils.get_default_download_path(socketio=object())

        assert result == _auto_path(new)
        assert "ProjectOld" not in result

    def test_explicit_custom_path_wins_over_live_query(self, monkeypatch, tmp_path, project_dirs):
        """A folder the user chose by hand must not be overridden."""
        _, new = project_dirs
        custom = tmp_path / "MyDownloads"
        custom.mkdir()
        monkeypatch.setattr(utils, 'load_settings',
                            lambda: {'downloadPath': str(custom)})
        monkeypatch.setattr(utils, 'query_live_project_path',
                            lambda socketio, timeout=5: str(new / "current.prproj"))

        result = utils.get_default_download_path(socketio=object())

        assert result == str(custom)

    def test_falls_back_to_cached_path_when_live_query_fails(self, monkeypatch, project_dirs):
        """No panel answer (no project open / timeout): keep working."""
        old, _ = project_dirs
        os.makedirs(_auto_path(old), exist_ok=True)
        monkeypatch.setattr(utils, 'load_settings',
                            lambda: {'downloadPath': _auto_path(old)})
        monkeypatch.setattr(utils, 'query_live_project_path',
                            lambda socketio, timeout=5: None)

        result = utils.get_default_download_path(socketio=object())

        assert result == _auto_path(old)

    def test_empty_settings_uses_live_project(self, monkeypatch, project_dirs):
        _, new = project_dirs
        monkeypatch.setattr(utils, 'load_settings', lambda: {'downloadPath': ''})
        monkeypatch.setattr(utils, 'query_live_project_path',
                            lambda socketio, timeout=5: str(new / "current.prproj"))

        assert utils.get_default_download_path(socketio=object()) == _auto_path(new)


class TestHandleVideoUrlResolvesPathLive:
    def test_does_not_read_download_path_from_settings(self):
        """handle_video_url must delegate to get_default_download_path.

        Reading settings['downloadPath'] there re-introduced the bug even
        after get_default_download_path itself was fixed.
        """
        import inspect
        import video_processing

        src = inspect.getsource(video_processing.handle_video_url)
        assert "settings.get('downloadPath'" not in src, (
            "handle_video_url reads downloadPath from settings directly; "
            "it must call get_default_download_path(socketio) so the download "
            "follows the currently active project"
        )
        assert "get_default_download_path(socketio)" in src
