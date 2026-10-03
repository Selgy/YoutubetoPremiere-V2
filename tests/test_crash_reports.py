"""Tests for the Premiere crash report collector.

Mac users report Premiere crashing during downloads, but no crash report ever
reached us. The app now gathers them itself on startup; these tests pin the
parsing of both macOS formats and the never-raise guarantee.
"""
import json
import os
import time

from utils import collect_premiere_crash_reports, summarize_crash_report


def write_ips(path, frames, faulting=0, exc_type='EXC_BAD_ACCESS', signal='SIGSEGV'):
    header = {'app_name': 'Adobe Premiere Pro 2026', 'app_version': '26.5.1',
              'timestamp': '2026-09-16 14:35:10.00 +0200', 'bug_type': '309'}
    images = [{'name': 'Adobe Premiere Pro'}, {'name': 'CEPHtmlEngine'}, {'name': 'libsystem_kernel.dylib'}]
    body = {
        'procName': 'Adobe Premiere Pro 2026',
        'exception': {'type': exc_type, 'signal': signal},
        'faultingThread': faulting,
        'threads': [{'queue': 'com.apple.main-thread', 'frames': [
            {'imageIndex': i, 'symbol': s} for i, s in frames]}],
        'usedImages': images,
    }
    path.write_text(json.dumps(header) + '\n' + json.dumps(body), encoding='utf-8')


LEGACY = """Process:               Adobe Premiere Pro 2026 [812]
Version:               26.5.1
Date/Time:             2026-09-16 14:35:10 +0200
Exception Type:        EXC_CRASH (SIGABRT)

Thread 0 Crashed:: Dispatch queue: com.apple.main-thread
0   libsystem_kernel.dylib        0x00007ff8 __pthread_kill + 10
1   CEPHtmlEngine                 0x0000000104 cef::ProcessMessage + 88

Thread 1:
0   libsystem_kernel.dylib        0x00007ff8 mach_msg_trap + 10
"""


class TestSummarize:
    def test_ips_crashed_thread_frames_and_images(self, tmp_path):
        p = tmp_path / 'Adobe Premiere Pro 2026-2026-09-16-143510.ips'
        write_ips(p, [(2, '__pthread_kill'), (1, 'cef::ProcessMessage')])
        s = summarize_crash_report(str(p))
        assert s['version'] == '26.5.1'
        assert s['exception'] == 'EXC_BAD_ACCESS SIGSEGV'
        assert s['thread'] == 'com.apple.main-thread'
        assert s['frames'][1] == 'CEPHtmlEngine  cef::ProcessMessage'

    def test_legacy_crash_text(self, tmp_path):
        p = tmp_path / 'Adobe Premiere Pro.crash'
        p.write_text(LEGACY, encoding='utf-8')
        s = summarize_crash_report(str(p))
        assert s['exception'] == 'EXC_CRASH (SIGABRT)'
        assert len(s['frames']) == 2, "must stop at the end of the crashed thread"
        assert s['frames'][1].startswith('CEPHtmlEngine')

    def test_garbage_does_not_raise(self, tmp_path):
        p = tmp_path / 'Adobe Premiere Pro.ips'
        p.write_text('{not json', encoding='utf-8')
        summarize_crash_report(str(p))  # must not raise

    def test_missing_file_returns_none(self, tmp_path):
        assert summarize_crash_report(str(tmp_path / 'nope.ips')) is None


class TestCollect:
    def test_copies_recent_premiere_reports_only(self, tmp_path):
        src, dest = tmp_path / 'reports', tmp_path / 'logs'
        src.mkdir()
        write_ips(src / 'Adobe Premiere Pro 2026-new.ips', [(0, 'main')])
        old = src / 'Adobe Premiere Pro 2026-old.ips'
        write_ips(old, [(0, 'main')])
        past = time.time() - 30 * 86400
        os.utime(old, (past, past))
        write_ips(src / 'Safari-new.ips', [(0, 'main')])

        out = collect_premiere_crash_reports(str(dest), report_dirs=[str(src)])

        copied = sorted(os.listdir(dest / 'crash_reports'))
        assert copied == ['Adobe Premiere Pro 2026-new.ips']
        assert len(out) == 1

    def test_respects_limit_newest_first(self, tmp_path):
        src = tmp_path / 'r'
        src.mkdir()
        for i in range(4):
            p = src / f'Adobe Premiere Pro-{i}.ips'
            write_ips(p, [(0, 'main')])
            t = time.time() - i * 60
            os.utime(p, (t, t))
        collect_premiere_crash_reports(str(tmp_path / 'l'), limit=2, report_dirs=[str(src)])
        assert sorted(os.listdir(tmp_path / 'l' / 'crash_reports')) == \
            ['Adobe Premiere Pro-0.ips', 'Adobe Premiere Pro-1.ips']

    def test_nothing_to_collect(self, tmp_path):
        assert collect_premiere_crash_reports(str(tmp_path), report_dirs=[str(tmp_path / 'none')]) == []

    def test_never_raises_on_unwritable_destination(self, tmp_path):
        src = tmp_path / 'r'
        src.mkdir()
        write_ips(src / 'Adobe Premiere Pro.ips', [(0, 'main')])
        blocker = tmp_path / 'file'
        blocker.write_text('x')
        collect_premiere_crash_reports(str(blocker), report_dirs=[str(src)])

    def test_noop_off_macos_without_explicit_dirs(self, tmp_path, monkeypatch):
        monkeypatch.setattr('utils.sys.platform', 'win32')
        assert collect_premiere_crash_reports(str(tmp_path)) == []
