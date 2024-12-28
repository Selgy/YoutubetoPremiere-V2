# -*- mode: python ; coding: utf-8 -*-
import os
from PyInstaller.building.build_main import Analysis, PYZ, EXE, TOC
from PyInstaller.utils.hooks import collect_submodules
import sys

# Create necessary directories
dist_dir = os.path.join('dist')
work_dir = os.path.join('build')
if not os.path.exists(dist_dir):
    os.makedirs(dist_dir)
if not os.path.exists(work_dir):
    os.makedirs(work_dir)

block_cipher = None

def get_python_path():
    return os.path.dirname(os.path.dirname(os.__file__))

# More aggressive Anaconda exclusion
def exclude_anaconda(path_str):
    lower_path = str(path_str).lower()
    return not any(x in lower_path for x in ['anaconda', 'conda', 'envs', 'conda-meta'])

# Ensure paths use correct separators for the platform
app_path = os.path.join('app')
main_script = os.path.join(app_path, 'YoutubetoPremiere.py')

a = Analysis(
    [main_script],
    pathex=[get_python_path()],
    binaries=[],
    datas=[(app_path, 'app')],
    hiddenimports=[
        'engineio.async_drivers.threading',
        'engineio.async_drivers.eventlet',
        'engineio.async_drivers.gevent',
        'eventlet.hubs.epolls',
        'eventlet.hubs.kqueue',
        'eventlet.hubs.selects',
        'gevent.socket',
        'gevent.threading',
        'simple_websocket',
        'dns',
        'dns.dnssec',
        'dns.e164',
        'dns.namedict',
        'dns.tsigkeyring',
        'dns.update',
        'dns.version',
        'dns.zone',
        'pygame',
        'pygame.base',
        'pygame.constants',
        'pygame.version',
        'pygame.rect',
        'pygame.compat',
        'pygame.rwobject',
        'pygame.surflock',
        'pygame.color',
        'pygame.colordict',
        'pygame.cdrom',
        'pygame.cursors',
        'pygame.display',
        'pygame.draw',
        'pygame.event',
        'pygame.image',
        'pygame.joystick',
        'pygame.key',
        'pygame.mouse',
        'pygame.sprite',
        'pygame.threads',
        'pygame.time',
        'pygame.transform',
        'pygame.surface',
        'pygame.bufferproxy',
        'pygame.pixelarray',
        'pygame.mask',
        'pygame.font',
        'pygame.sysfont',
        'pygame.mixer',
        'pygame.mixer_music',
        'pygame.scrap',
        'pygame.sndarray',
        'pygame.surfarray',
        'pygame.fastevent',
        'pygame.imageext',
        'pygame.pkgdata'
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

# macOS specific configuration
target_arch = None  # Let PyInstaller detect the architecture
codesign_identity = None  # Will be handled in GitHub Actions
entitlements_file = 'entitlements.plist'
bundle_identifier = "com.mickaelducatez.youtubetopremiereV2"
info_plist = {
    'CFBundleIdentifier': bundle_identifier,
    'CFBundleName': 'YoutubetoPremiere',
    'CFBundleDisplayName': 'YoutubetoPremiere',
    'CFBundlePackageType': 'APPL',
    'CFBundleShortVersionString': '3.0.4',
    'LSMinimumSystemVersion': '10.13',
    'NSHighResolutionCapable': True,
}

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
    console=False,  # Use GUI mode for macOS
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=target_arch,
    codesign_identity=codesign_identity,
    entitlements_file=entitlements_file,
    info_plist=info_plist,
    bundle_identifier=bundle_identifier
) 