# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.building.build_main import Analysis, PYZ, EXE, TOC, COLLECT
from PyInstaller.utils.hooks import collect_submodules
import os
import sys
import platform
import shutil

block_cipher = None

# Clean build and dist directories
def clean_directories():
    dirs_to_clean = [
        os.path.join('build', 'YoutubetoPremiere'),
        os.path.join('build', 'YoutubetoPremiere', 'localpycs'),
        'dist',
        'build'
    ]
    for dir_path in dirs_to_clean:
        if os.path.exists(dir_path):
            try:
                shutil.rmtree(dir_path)
            except Exception as e:
                print(f"Warning: Could not remove {dir_path}: {e}")
        try:
            os.makedirs(dir_path, exist_ok=True)
        except Exception as e:
            print(f"Warning: Could not create {dir_path}: {e}")

clean_directories()

def get_python_path():
    return os.path.dirname(os.path.dirname(os.__file__))

# More aggressive Anaconda exclusion
def exclude_anaconda(path_str):
    lower_path = str(path_str).lower()
    return not any(x in lower_path for x in ['anaconda', 'conda', 'envs', 'conda-meta'])

# Determine target architecture
def get_target_arch():
    if sys.platform != 'darwin':
        return None
    machine = platform.machine()
    if machine == 'arm64':
        return 'arm64'
    return 'x86_64'

a = Analysis(
    [os.path.join('app', 'YoutubetoPremiere.py')],
    pathex=[get_python_path()],  # Add Python path explicitly
    binaries=[],  # Remove the nested Analysis call
    datas=[(os.path.join('app'), 'app')],  # Only include the app directory
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
    [],
    exclude_binaries=True,
    name='YoutubetoPremiere',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=get_target_arch(),
    codesign_identity='Developer ID Application: mickael ducatez (9H8DB46V75)' if sys.platform == 'darwin' else None,
    entitlements_file='entitlements.plist' if sys.platform == 'darwin' else None
)

collect_all = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='YoutubetoPremiere'
)
