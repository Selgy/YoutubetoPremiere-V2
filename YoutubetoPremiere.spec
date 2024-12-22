# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.building.build_main import Analysis, PYZ, EXE, TOC
from PyInstaller.utils.hooks import collect_submodules
import os
import sys

block_cipher = None

def get_python_path():
    return os.path.dirname(os.path.dirname(os.__file__))

# More aggressive Anaconda exclusion
def exclude_anaconda(path_str):
    lower_path = str(path_str).lower()
    return not any(x in lower_path for x in ['anaconda', 'conda', 'envs', 'conda-meta'])

a = Analysis(
    ['app\\YoutubetoPremiere.py'],
    pathex=[get_python_path()],  # Add Python path explicitly
    binaries=[],  # Remove the nested Analysis call
    datas=[('app/notification_sound.mp3', 'app')],
    hiddenimports=[
        'engineio.async_drivers.threading',
        'engineio.async_drivers.eventlet',
        'engineio.async_drivers.gevent',
        'socketio.async_drivers.threading',
        'socketio.async_drivers.eventlet',
        'socketio.async_drivers.gevent',
        'eventlet.hubs.epolls',
        'eventlet.hubs.kqueue',
        'eventlet.hubs.selects',
        'gevent.socket',
        'gevent.threading',
        'simple_websocket',
        'dns',
        'dns.dnssec',
        'dns.e164',
        'dns.hash',
        'dns.namedict',
        'dns.tsigkeyring',
        'dns.update',
        'dns.version',
        'dns.zone'
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['anaconda', 'conda', 'conda-env', 'conda-meta'],
    cipher=block_cipher,
    noarchive=False
)

# Filter out Anaconda paths from binaries
a.binaries = TOC([x for x in a.binaries if exclude_anaconda(x[1])])
a.datas = TOC([x for x in a.datas if exclude_anaconda(x[1])])

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='YoutubetoPremiere',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch='universal2' if sys.platform == 'darwin' else None,
    codesign_identity='Developer ID Application: mickael ducatez (9H8DB46V75)' if sys.platform == 'darwin' else None,
    entitlements_file='entitlements.plist' if sys.platform == 'darwin' else None
)
