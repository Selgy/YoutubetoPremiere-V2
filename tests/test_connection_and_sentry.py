"""Regression tests for two bugs surfaced by the 46937ca5 nightly logs.

1. is_client_connected() probed with socketio.emit(..., timeout=1). emit() has
   no `timeout` (only call() does), so it always raised TypeError, the error
   was swallowed, every live client was judged dead, and the registry was
   emptied before each targeted emit - everything fell back to broadcast.
2. The Sentry collector copied every recent file under SentryIO-db, i.e. the
   live session's metadata, announced a crash on every launch, and let those
   newer files push the one real minidump out of `limit`.
"""
import logging
import os
import re
import threading
import time

import pytest

from utils import _copy_sentry_dumps, is_sid_connected


# --------------------------------------------------------------------------
# Bug 2 - Sentry minidumps
# --------------------------------------------------------------------------
UUID = '19bcf76f-1111-2222-3333-444455556666'


def touch(path, content=b'x', age_days=0):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    t = time.time() - age_days * 86400
    os.utime(path, (t, t))
    return path


@pytest.fixture
def sentry_db(tmp_path):
    """A SentryIO-db as found on a real Mac: live-session noise + one older crash."""
    db = tmp_path / 'SentryIO-db'
    run = db / 'aaaa-live.run'
    for name in ('session.json', '__sentry-event', '__sentry-breadcrumb1'):
        touch(run / name)                                  # brand new, every session
    touch(db / 'aaaa-live.run.lock')
    touch(db / 'settings.dat')
    touch(db / 'completed' / f'{UUID}.dmp', b'MDMP', age_days=1)   # the real crash
    touch(db / 'attachments' / UUID / '__sentry-event', b'{}', age_days=1)
    touch(db / 'attachments' / UUID / '__sentry-breadcrumb1', b'{}', age_days=1)
    return db


def cutoff(days=14):
    return time.time() - days * 86400


class TestSentryDumps:
    def test_only_the_minidump_is_copied(self, tmp_path, sentry_db):
        dest = tmp_path / 'logs'
        n = _copy_sentry_dumps([str(sentry_db)], str(dest), cutoff(), limit=5)
        out = dest / 'crash_reports' / 'sentry'
        dumps = [f for f in os.listdir(out) if f.endswith('.dmp')]
        assert n == 1
        assert len(dumps) == 1 and dumps[0].startswith('minidump_') and UUID in dumps[0]
        for noise in ('session.json', 'settings.dat', 'aaaa-live.run.lock'):
            assert not (out / noise).exists(), f"live-session file {noise} was copied"
        assert not (out / '__sentry-event').exists()

    def test_real_dump_survives_the_limit(self, tmp_path, sentry_db):
        """Newer session files used to evict it from the limit."""
        assert _copy_sentry_dumps([str(sentry_db)], str(tmp_path / 'l'), cutoff(), limit=1) == 1

    def test_no_crash_warning_for_metadata_only(self, tmp_path, caplog):
        db = tmp_path / 'SentryIO-db'
        touch(db / 'x.run' / 'session.json')
        touch(db / 'settings.dat')
        with caplog.at_level(logging.INFO):
            n = _copy_sentry_dumps([str(db)], str(tmp_path / 'l'), cutoff(), limit=5)
        assert n == 0
        assert 'crash was caught' not in caplog.text

    def test_crash_warning_when_a_dump_exists(self, tmp_path, sentry_db, caplog):
        with caplog.at_level(logging.WARNING):
            _copy_sentry_dumps([str(sentry_db)], str(tmp_path / 'l'), cutoff(), limit=5)
        assert 'crash was caught' in caplog.text

    def test_same_name_in_pending_and_completed_do_not_overwrite(self, tmp_path):
        db = tmp_path / 'SentryIO-db'
        touch(db / 'pending' / f'{UUID}.dmp', b'PENDING')
        touch(db / 'completed' / f'{UUID}.dmp', b'COMPLETED')
        out = tmp_path / 'l' / 'crash_reports' / 'sentry'
        assert _copy_sentry_dumps([str(db)], str(tmp_path / 'l'), cutoff(), limit=5) == 2
        contents = sorted((out / f).read_bytes() for f in os.listdir(out) if f.endswith('.dmp'))
        assert contents == [b'COMPLETED', b'PENDING']

    def test_matching_attachments_are_copied(self, tmp_path, sentry_db):
        _copy_sentry_dumps([str(sentry_db)], str(tmp_path / 'l'), cutoff(), limit=5)
        att = tmp_path / 'l' / 'crash_reports' / 'sentry' / f'attachments_{UUID}'
        assert sorted(os.listdir(att)) == ['__sentry-breadcrumb1', '__sentry-event']

    def test_max_age_applies(self, tmp_path, sentry_db):
        assert _copy_sentry_dumps([str(sentry_db)], str(tmp_path / 'l'), time.time(), limit=5) == 0

    def test_dumps_outside_pending_and_completed_are_ignored(self, tmp_path):
        db = tmp_path / 'SentryIO-db'
        touch(db / 'x.run' / 'stray.dmp')
        assert _copy_sentry_dumps([str(db)], str(tmp_path / 'l'), cutoff(), limit=5) == 0

    def test_noop_on_windows(self, tmp_path, monkeypatch):
        from utils import collect_premiere_crash_reports
        monkeypatch.setattr('utils.sys.platform', 'win32')
        assert collect_premiere_crash_reports(str(tmp_path)) == []
        assert not (tmp_path / 'crash_reports').exists()


# --------------------------------------------------------------------------
# Bug 1 - connection probe, against a real Flask-SocketIO server
# --------------------------------------------------------------------------
@pytest.fixture
def live_server():
    from flask import Flask, request
    from flask_socketio import SocketIO
    from werkzeug.serving import make_server

    app = Flask('probe')
    sio = SocketIO(app, async_mode='threading')
    sids = []

    @sio.on('connect')
    def on_connect():
        sids.append(request.sid)

    srv = make_server('127.0.0.1', 0, app, threaded=True)
    th = threading.Thread(target=srv.serve_forever, daemon=True)
    th.start()
    try:
        yield sio, f'http://127.0.0.1:{srv.server_port}', sids
    finally:
        srv.shutdown()


def wait_for(cond, timeout=5.0):
    end = time.time() + timeout
    while time.time() < end:
        if cond():
            return True
        time.sleep(0.05)
    return cond()


def test_is_sid_connected_tracks_a_real_polling_client(live_server):
    import socketio as sio_client

    sio, url, sids = live_server
    client = sio_client.Client()
    client.connect(url, transports=['polling'])
    try:
        assert wait_for(lambda: sids), "server never saw the connection"
        sid = sids[0]
        assert is_sid_connected(sio, sid) is True
    finally:
        client.disconnect()
    assert wait_for(lambda: not is_sid_connected(sio, sid)), \
        "still reported connected after disconnect"


def test_is_sid_connected_unknown_sid(live_server):
    sio, _url, _sids = live_server
    assert is_sid_connected(sio, 'no-such-sid') is False


def test_is_sid_connected_never_raises():
    assert is_sid_connected(object(), 'x') is False


def test_no_emit_with_timeout_in_app():
    """emit() has no timeout; passing one raises TypeError every time."""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pattern = re.compile(r'\.emit\([^)]*timeout\s*=')
    for name in os.listdir(os.path.join(root, 'app')):
        if name.endswith('.py'):
            with open(os.path.join(root, 'app', name), encoding='utf-8') as f:
                assert not pattern.search(f.read()), f"emit(..., timeout=) in {name}"
