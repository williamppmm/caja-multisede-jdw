# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.building.splash import Splash
from PyInstaller.utils.hooks import collect_submodules

hiddenimports = []
hiddenimports += collect_submodules('uvicorn')

# Paquetes que uvicorn[standard] arrastra pero que no se usan en esta app.
# uvicorn funciona en modo minimal con h11 (incluido) sin necesitar estos extras.
excludes = [
    # uvicorn extras opcionales
    'httptools',
    'uvloop',
    'websockets',
    'watchfiles',
    'dotenv',
    'python_dotenv',
    'aiofiles',
    # ciencia de datos / ML (nunca presentes, pero PyInstaller a veces los detecta)
    'numpy',
    'pandas',
    'matplotlib',
    'PIL',
    'scipy',
    'sklearn',
    'IPython',
    'jupyter',
    # bases de datos y ORMs no usados
    'sqlalchemy',
    'alembic',
    'pymongo',
    'psycopg2',
    # criptografía y red no usados
    'cryptography',
    'paramiko',
    'Crypto',
    # testing (no va en producción)
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

splash = Splash(
    'web/assets/launcher_splash.png',
    binaries=a.binaries,
    datas=a.datas,
    text_pos=None,
    minify_script=True,
    always_on_top=True,
)

exe = EXE(
    pyz,
    a.scripts,
    splash,
    a.binaries,
    a.datas,
    splash.binaries,
    [],
    name='CajaJDW',
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
