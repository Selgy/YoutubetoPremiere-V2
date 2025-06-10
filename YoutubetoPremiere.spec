# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['app/YoutubetoPremiere.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[
        'yt_dlp',
        'yt_dlp.extractor',
        'yt_dlp.downloader',
        'yt_dlp.postprocessor',
        'yt_dlp.extractor.youtube',
        'yt_dlp.extractor.common',
        'yt_dlp.utils',
        'yt_dlp.utils.aes',
        'yt_dlp.jsinterp',
        'certifi',
        'curl_cffi',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='YoutubetoPremiere',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='YoutubetoPremiere',
)
app = BUNDLE(
    coll,
    name='YoutubetoPremiere.app',
    icon=None,
    bundle_identifier=None,
)
