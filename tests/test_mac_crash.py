"""Regression tests for the Premiere crash during downloads (macOS, 26.x).

Root cause, established by reproduction on a Mac (Premiere 26.3.2):

1. app.sourceMonitor.openProjectItem() with an invalid argument does not throw:
   Premiere calls dvacore::config::Abort() and the whole app dies.
2. project.importFiles() returns a BOOLEAN, not an array of ProjectItems.
3. So the JSX fallback `importedFiles[0]` was `undefined`, fed straight into
   openProjectItem().
4. That fallback was reached when the item landed outside the diffed bin...
5. ...which happened because the backend emitted import_video twice, 2 ms apart.
6. The panel was never registered as a 'premiere' client: routes.py's 'connect'
   handler replaced the real one.
7. These crashes produce no Apple report: Adobe's Sentry handler keeps the
   minidump in SentryIO-db, then uploads and deletes it.
"""
import os
import re
import sys

import pytest

import video_processing
from utils import collect_premiere_crash_reports

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSX_COPIES = [
    os.path.join(ROOT, 'src', 'js', 'settings', 'importVideo.jsx'),   # loaded last: the live one
    os.path.join(ROOT, 'src', 'jsx', 'ppro', 'ppro.ts'),
    os.path.join(ROOT, 'src', 'jsx', 'ppro', 'ppro.js'),
]


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def code_only(src):
    """Strip // comments so explanatory text cannot satisfy or fail a check."""
    return re.sub(r'//[^\n]*', '', src)


@pytest.mark.parametrize('path', JSX_COPIES, ids=lambda p: os.path.basename(p))
class TestJsxNeverFeedsOpenProjectItemGarbage:
    def test_import_result_is_never_indexed_as_an_array(self, path):
        assert 'importedFiles[0]' not in code_only(read(path)), (
            "importFiles() returns a boolean; [0] is undefined and undefined in "
            "openProjectItem() aborts Premiere")

    def test_open_project_item_is_guarded(self, path):
        src = code_only(read(path))
        call = src.index('app.sourceMonitor.openProjectItem(')
        guard = src.rfind('isUsableProjectItem(importedItem)', 0, call)
        assert guard != -1, "openProjectItem() is reachable without validating its argument"

    def test_item_is_found_by_media_path(self, path):
        assert 'getMediaPath()' in code_only(read(path))


def test_live_jsx_diffs_the_whole_project_not_one_bin():
    src = code_only(read(JSX_COPIES[0]))
    assert '$._ext.collectNodeIds(rootItem' in src
    assert 'importOk === false' in src, "a false import must be reported as a failure"


class TestImportEmittedOnce:
    @pytest.fixture(autouse=True)
    def _isolate(self, monkeypatch):
        monkeypatch.setattr(video_processing, '_recent_import_emits', {})
        self.sent = []
        monkeypatch.setattr(video_processing, '_emit_to_client_type',
                            lambda ev, data, ct: self.sent.append((ev, data['path'], ct)))

    def test_duplicate_within_window_is_dropped(self):
        payload = {'path': '/v/clip1.mp4', 'bin': ''}
        video_processing.emit_import_video(None, payload)
        video_processing.emit_import_video(None, payload)
        assert self.sent == [('import_video', '/v/clip1.mp4', 'premiere')]

    def test_different_files_both_go_out(self):
        video_processing.emit_import_video(None, {'path': '/v/a.mp4'})
        video_processing.emit_import_video(None, {'path': '/v/b.mp4'})
        assert [p for _, p, _ in self.sent] == ['/v/a.mp4', '/v/b.mp4']

    def test_same_file_again_after_the_window(self):
        video_processing.emit_import_video(None, {'path': '/v/a.mp4'})
        video_processing._recent_import_emits['/v/a.mp4'] -= video_processing.IMPORT_DEDUP_SECONDS + 1
        video_processing.emit_import_video(None, {'path': '/v/a.mp4'})
        assert len(self.sent) == 2


def test_premiere_panel_reaches_the_real_connect_handler():
    """routes.py must not register a competing 'connect' handler."""
    from flask import Flask, request
    from flask_socketio import SocketIO
    import routes

    app = Flask('probe')
    sio = SocketIO(app, async_mode='threading')
    hits = []

    @sio.on('connect')  # stands for YoutubetoPremiere.py's module-level handler
    def real_connect():
        hits.append(request.args.get('client_type'))

    routes.register_routes(app, sio, {}, emit_fn=lambda *a, **k: None)
    sio.test_client(app, query_string='client_type=premiere')
    assert hits == ['premiere'], "the real connect handler was overridden"


class TestSentryDumps:
    def test_copies_recent_sentry_dumps(self, tmp_path):
        root = tmp_path / 'Premiere Pro' / '26.0' / 'SentryIO-db' / 'completed'
        root.mkdir(parents=True)
        (root / 'abc.dmp').write_bytes(b'MDMP')
        (root / 'abc.envelope').write_text('{}')
        collect_premiere_crash_reports(str(tmp_path / 'logs'),
                                       report_dirs=[str(tmp_path / 'none')],
                                       sentry_roots=[str(tmp_path / 'Premiere Pro' / '26.0' / 'SentryIO-db')])
        out = tmp_path / 'logs' / 'crash_reports' / 'sentry'
        assert sorted(os.listdir(out)) == ['abc.dmp', 'abc.envelope']

    def test_no_sentry_folder_is_fine(self, tmp_path):
        collect_premiere_crash_reports(str(tmp_path), report_dirs=[], sentry_roots=[str(tmp_path / 'x')])
        assert not (tmp_path / 'crash_reports' / 'sentry').exists()
