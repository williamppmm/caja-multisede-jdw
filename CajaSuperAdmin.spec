# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_submodules

hiddenimports = []
hiddenimports += collect_submodules('uvicorn')

excludes = [
    'httptools',
    'uvloop',
    'websockets',
    'watchfiles',
    'dotenv',
    'python_dotenv',
    'aiofiles',
    'numpy',
    'pandas',
    'matplotlib',
    'PIL',
    'scipy',
    'sklearn',
    'IPython',
    'jupyter',
    'sqlalchemy',
    'alembic',
    'pymongo',
    'psycopg2',
    'cryptography',
    'paramiko',
    'Crypto',
    'pytest',
    '_pytest',
    'unittest',
]

a = Analysis(
    ['launcher.py'],
    pathex=[],
    binaries=[],
    datas=[('web', 'web')],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    noarchive=False,
    optimize=1,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='CajaSuperAdmin',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='web/assets/favicon.ico',
)
