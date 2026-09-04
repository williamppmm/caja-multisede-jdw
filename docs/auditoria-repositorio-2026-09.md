# Auditoría del repositorio — CajaJDW (2026-09-03)

Este documento resume la revisión que originó la corrección del proceso de empaquetado y deja registrado el estado posterior. Los datos de sincronización con `origin` deben comprobarse nuevamente antes de cada publicación porque cambian con cada commit y cada push.

## 1. Resultado

Las tres ramas generan ejecutables con nombres distintos y estables, sin necesidad de renombrarlos manualmente:

| Rama | Spec | Launcher | Ejecutable |
|---|---|---|---|
| `main` | `CajaSuperAdmin.spec` | `launcher_super_admin.py` | `admin.exe` |
| `version-usuario` | `CajaJDW.spec` | `launcher.py` | `usuario.exe` |
| `respaldo-version-especial` | `CajaJDW.spec` | `launcher.py` | `especial.exe` |

Los artefactos de `dist/` están ignorados por Git. El repositorio versiona la configuración y los scripts necesarios para reproducirlos, no los binarios generados.

## 2. Problemas encontrados y resolución

### 2.1 Atajo de compilación de `main`

Antes de la corrección, `Construir EXE.bat` invocaba `scripts/build_windows_exe.ps1`, que busca `CajaJDW.spec`. Ese spec no existe en `main`, por lo que el atajo fallaba.

Ahora el `.bat` de `main` invoca `scripts/build_super_admin_exe.ps1`, que utiliza `CajaSuperAdmin.spec` y produce `dist/admin.exe`.

### 2.2 Nombres de usuario y especial

Las ramas operativas compartían el nombre de salida `CajaJDW.exe`. Esto obligaba a renombrar el archivo manualmente y permitía que una compilación sobrescribiera la anterior.

La propiedad `name` de `CajaJDW.spec` quedó definida por rama:

- `name='usuario'` en `version-usuario`.
- `name='especial'` en `respaldo-version-especial`.

Sus scripts de compilación y documentos propios muestran las rutas `dist/usuario.exe` y `dist/especial.exe`, respectivamente.

### 2.3 Nombre del administrador

`CajaSuperAdmin.spec` pasó de `name='CajaSuperAdmin'` a `name='admin'`. El script dedicado y la documentación de `main` muestran ahora `dist/admin.exe`.

### 2.4 Documentación general

También se realizaron estas correcciones:

- La descripción de `Faltantes` quedó alineada con la agrupación actual por mes.
- Los enlaces Markdown que apuntaban a `C:\Users\User\Desktop\Caja` se sustituyeron por rutas relativas.
- El antiguo `docs/contexto-chat-handoff.md` se movió a `docs/archivo/` porque era un snapshot histórico.
- `README.md`, `docs/contexto-proyecto.md` y `docs/especificacion-funcional.md` usan la convención `admin.exe`, `usuario.exe` y `especial.exe`.

## 3. Validaciones realizadas

- Los tres archivos `.spec` tienen sintaxis Python válida.
- `scripts/build_super_admin_exe.ps1` y las dos variantes de `scripts/build_windows_exe.ps1` tienen sintaxis PowerShell válida.
- Los cambios no presentan errores de espacios detectables con `git diff --check`.
- Se generaron localmente `admin.exe`, `usuario.exe` y `especial.exe`.
- Durante la compilación original de cada variante se verificó una respuesta HTTP 200: puerto `8001` para administrador y puerto `8000` para usuario y especial.

Los directorios internos `build/CajaSuperAdmin` y `build/CajaJDW` pueden seguir apareciendo. PyInstaller deriva esos nombres del archivo `.spec`; no determinan el nombre final configurado en `EXE(name=...)`.

## 4. Commits de empaquetado revisados

| Rama | Commit | Cambio principal |
|---|---|---|
| `main` | `44bd7ec` | genera `admin.exe`, corrige el `.bat` y alinea documentación |
| `version-usuario` | `84a79e6` | genera `usuario.exe` |
| `respaldo-version-especial` | `c990507` | genera `especial.exe` |

## 5. Lista de correcciones completadas

- [x] Corregir `Construir EXE.bat` en `main`.
- [x] Configurar un nombre de salida distinto en cada rama.
- [x] Actualizar la documentación de `Faltantes`.
- [x] Sustituir enlaces absolutos rotos por rutas relativas.
- [x] Archivar el documento de handoff antiguo.
- [x] Verificar los ejecutables generados y sus puertos.
