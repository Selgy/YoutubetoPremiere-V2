"""Regression tests for log file writing.

The reported symptom was "the log file doesn't write properly / I have no
server logs". The logs were in fact being written, but:

  1. logging.FileHandler holds a write handle for the whole session, and on
     Windows that makes the file unreadable to any tool opening it with the
     default share mode - so the file looked empty or frozen while the app ran,
     and its size in Explorer stayed stale.
  2. startup blanked the previous logs, so a crash-and-restart destroyed the
     evidence before it could be read.
"""
import logging
import os
import subprocess
import sys

import pytest

from utils import SharedFileHandler, rotate_log_files


def make_logger(path, name, **kwargs):
    handler = SharedFileHandler(str(path), encoding='utf-8', **kwargs)
    handler.setFormatter(logging.Formatter('%(levelname)s - %(message)s'))
    log = logging.getLogger(name)
    log.handlers[:] = [handler]
    log.setLevel(logging.INFO)
    log.propagate = False
    return log, handler


class TestSharedFileHandler:
    def test_writes_records(self, tmp_path):
        f = tmp_path / 'a.log'
        log, _ = make_logger(f, 'w1')
        for i in range(20):
            log.info('line %d', i)
        assert len(f.read_text(encoding='utf-8').splitlines()) == 20

    def test_does_not_keep_the_file_open(self, tmp_path):
        """The core fix: nothing may hold a handle between records."""
        f = tmp_path / 'b.log'
        log, handler = make_logger(f, 'w2')
        log.info('something')
        assert handler.stream is None, "handler still holds an open stream"

    @pytest.mark.skipif(sys.platform != 'win32', reason='Windows share modes')
    def test_readable_by_a_default_share_mode_reader(self, tmp_path):
        """Notepad-style open (FileShare.Read) must succeed while logging."""
        f = tmp_path / 'c.log'
        log, _ = make_logger(f, 'w3')
        log.info('while running')

        ps = ('$ErrorActionPreference="Stop"; try { '
              '$b=[System.IO.File]::ReadAllBytes("%s"); "OK" '
              '} catch { "LOCKED" }') % str(f).replace('\\', '\\\\')
        out = subprocess.run(['powershell', '-NoProfile', '-Command', ps],
                             capture_output=True, text=True).stdout.strip()
        assert out == 'OK', "log file is locked against a normal reader"

    def test_nothing_is_lost_when_the_process_dies(self, tmp_path):
        """Every record must already be on disk, never sitting in a buffer."""
        f = tmp_path / 'd.log'
        log, _ = make_logger(f, 'w4')
        log.info('first')
        # No flush()/close() call: the content must be there regardless
        assert 'first' in f.read_text(encoding='utf-8')

    def test_appends_rather_than_overwrites(self, tmp_path):
        f = tmp_path / 'e.log'
        log, _ = make_logger(f, 'w5')
        log.info('one')
        log.info('two')
        body = f.read_text(encoding='utf-8')
        assert 'one' in body and 'two' in body

    def test_size_cap_truncates(self, tmp_path):
        f = tmp_path / 'f.log'
        log, _ = make_logger(f, 'w6', max_bytes=200)
        for i in range(200):
            log.info('padding %d %s', i, 'x' * 50)
        assert os.path.getsize(str(f)) < 5000, "runaway log was not capped"
        assert 'truncated' in f.read_text(encoding='utf-8')

    def test_survives_an_unwritable_target(self, tmp_path):
        """A logging failure must never crash the caller."""
        handler = SharedFileHandler(str(tmp_path / 'nope' / 'g.log'), encoding='utf-8')
        handler.setFormatter(logging.Formatter('%(message)s'))
        log = logging.getLogger('w7')
        log.handlers[:] = [handler]
        log.propagate = False
        log.setLevel(logging.INFO)
        logging.raiseExceptions = False
        try:
            log.info('should not raise')
        finally:
            logging.raiseExceptions = True


class TestRotateLogFiles:
    def test_previous_session_is_kept(self, tmp_path):
        f = tmp_path / 'main.log'
        f.write_text('previous session content', encoding='utf-8')

        rotate_log_files([str(f)])

        assert not f.exists(), "current log should have been moved aside"
        assert (tmp_path / 'main.log.1').read_text(encoding='utf-8') == \
            'previous session content'

    def test_only_one_generation_is_kept(self, tmp_path):
        f = tmp_path / 'main.log'
        f.write_text('oldest', encoding='utf-8')
        rotate_log_files([str(f)])
        f.write_text('newer', encoding='utf-8')
        rotate_log_files([str(f)])

        assert (tmp_path / 'main.log.1').read_text(encoding='utf-8') == 'newer'

    def test_empty_and_missing_files_are_skipped(self, tmp_path):
        empty = tmp_path / 'empty.log'
        empty.write_text('', encoding='utf-8')
        missing = tmp_path / 'missing.log'

        rotate_log_files([str(empty), str(missing)])

        assert empty.exists(), "an empty log should not be rotated"
        assert not (tmp_path / 'empty.log.1').exists()
        assert not (tmp_path / 'missing.log.1').exists()

    def test_never_raises(self, tmp_path):
        # A directory where a file is expected must not blow up startup
        d = tmp_path / 'weird.log'
        d.mkdir()
        rotate_log_files([str(d)])


def test_startup_no_longer_blanks_logs():
    """Guard against the old clear_previous_logs() behaviour coming back."""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    src = open(os.path.join(root, 'app', 'YoutubetoPremiere.py'),
               encoding='utf-8').read()
    assert 'clear_previous_logs' not in src, \
        "startup wipes the previous session's logs again"
    assert 'rotate_log_files' in src
    assert 'SharedFileHandler' in src, \
        "the plain FileHandler locks the log file on Windows"


def test_session_header_uses_the_real_version():
    """The header used to advertise a hardcoded v3.0.22 forever."""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    src = open(os.path.join(root, 'app', 'YoutubetoPremiere.py'),
               encoding='utf-8').read()
    assert 'v3.0.22' not in src, "session header still hardcodes a version"
    assert 'APP_VERSION' in src
