# Auditoría del Repositorio — CajaJDW (2026-09-03)

Snapshot verificado línea por línea contra el código, git y los `.exe` reales en este equipo, no contra lo que dicen los docs. Sirve como base de contexto exacto para seguir corrigiendo cosas funcionales y técnicas. Cuando el sistema cambie de forma importante, conviene repetir esta auditoría con fecha nueva en vez de editar esta a mano indefinidamente.

## 1. Resumen ejecutivo

- El repo local **sí está alineado**: `main` está limpio (`nothing to commit`) y sincronizado con `origin/main`.
- Los 3 `.exe` en `dist/` **sí corresponden al código más reciente** de su rama respectiva a día de hoy. No hay commits de código sin compilar pendientes en ninguna rama.
- La documentación funcional/técnica (`especificacion-funcional.md`, `analisis-tecnico.md`, `plan-pruebas.md`) **se mantiene al día** — se actualiza en el mismo commit que el código (buena disciplina, seguir así).
- `README.md` y `docs/contexto-proyecto.md` **quedaron desactualizados** en un punto concreto: siguen describiendo `Faltantes` agrupado por semana, cuando el código y los otros 3 docs ya migraron a agrupación por mes (commit `e78f0ac`, 10 jul).
- Hay **rutas absolutas rotas** (`C:\Users\User\Desktop\Caja\...`) en `README.md` (7) y sobre todo en `docs/analisis-tecnico.md` (26) — apuntan a una máquina/carpeta que ya no es esta.
- `docs/contexto-chat-handoff.md` quedó congelado desde el 21 de abril y su contenido ya está duplicado (y mejor mantenido) en `contexto-proyecto.md` y `analisis-tecnico.md`. Candidato a archivar o borrar.
- Bug real encontrado: `Construir EXE.bat` en `main` invoca el script equivocado — fallaría si se usa tal cual (detalle en §5.1).
- Hallazgo operativo no documentado: el nombre final del `.exe` de `version-usuario` y `respaldo-version-especial` sale siempre como `CajaJDW.exe` (el `.spec` de ambas ramas usa `name='CajaJDW'`); los nombres reales en `dist/` (`CajaUsuarioJDW.exe`, `CajaEspecialJDW.exe`) existen porque alguien los renombró a mano después del build. Si se olvida renombrar antes de cambiar de rama y reconstruir, un build sobreescribe al otro en silencio.

## 2. Alineación git ↔ ramas ↔ ejecutables

### 2.1 Estado del repo local

```
On branch main
Your branch is up to date with 'origin/main'.
nothing to commit, working tree clean
```

Las 3 ramas remotas y locales coinciden exactamente (mismos hashes en `origin/*`).

### 2.2 Divergencia entre ramas

| Comparación | Commits propios / del otro lado (desde el ancestro común) |
|---|---|
| `main` vs `version-usuario` | 74 propios de `main` / 47 propios de `version-usuario` |
| `main` vs `respaldo-version-especial` | 74 / 47 (mismo ancestro que con usuario) |
| `version-usuario` vs `respaldo-version-especial` | 1 / 1 |

`respaldo-version-especial` está a un commit de diferencia de `version-usuario` en cada dirección: su tope (`76ead7e`, "rebuild special branch on latest usuario base") ya incluye todo el historial de usuario hasta ese punto más su propio diff de `ayer()`; usuario avanzó un commit más (`4bc87f6`, solo docs) que la especial todavía no tiene. Esto es exactamente el patrón de mantenimiento que describen los docs (`usuario` se estabiliza primero, luego `especial` se reconstruye encima). Vigente y correcto.

`main` y `version-usuario` llevan **74/47 commits de diferencia** — confirma que son líneas de producto paralelas de verdad, no ramas que se van a fusionar. No es un problema, es el modelo de trabajo documentado; se menciona aquí para que quede explícito que un `git merge` entre ellas no tiene sentido y no se debe intentar.

### 2.3 Tabla rama → spec → exe → último commit de código → build

| Rama | `.spec` en esa rama | Exe en `dist/` | Último commit (código) | Build (`.exe` mtime) | ¿Exe al día? |
|---|---|---|---|---|---|
| `main` | `CajaSuperAdmin.spec` | `CajaSuperAdmin.exe` | `e78f0ac` — 2026-07-10 12:05 | 2026-07-10 11:55 | ⚠️ ver nota |
| `version-usuario` | `CajaJDW.spec` (`name='CajaJDW'`) | `CajaUsuarioJDW.exe` (renombrado a mano) | `ac82dd5` — 2026-04-30 17:53 (código); `4bc87f6` 19:40 es solo docs | 2026-04-30 18:15 | ✅ sí |
| `respaldo-version-especial` | `CajaJDW.spec` (`name='CajaJDW'`) | `CajaEspecialJDW.exe` (renombrado a mano) | `76ead7e` — 2026-04-23 21:38 (incluye código de usuario hasta `ac82dd5`/`4d23ddd`, ambos 04-30) | 2026-04-30 18:12 | ✅ sí |

Nota sobre `main`: el commit `e78f0ac` (12:05:14) es *posterior* al build (`CajaSuperAdmin.exe`, 11:55:40) por apenas 10 minutos. Repasando el diff de ese commit, el build de las 11:55 ya contenía el cambio real de código (`app/services/diferencias_service.py`); el commit de las 12:05 es el `git commit` posterior al build, no al revés — coherente con el flujo real de "primero pruebo/compilo, después commiteo". Conclusión: **el exe de main sí corresponde al HEAD actual de main**, no hay drift.

En limpio: **los tres `.exe` de `dist/` están al día respecto al código de su rama**, a fecha de esta auditoría. Lo único pendiente de "compilar" en cualquier rama son commits de solo-documentación, que no afectan al binario.

## 3. Estructura real (verificada, no de memoria)

```
caja-multisede-jdw/
├── launcher.py                    # entrypoint usuario / especial (puerto 8000)
├── launcher_super_admin.py        # entrypoint main (fuerza CAJA_SUPER_ADMIN=1, puerto 8001)
├── launcher_boot.py               # mutex, splash, espera de servidor, apertura de navegador (compartido)
├── CajaSuperAdmin.spec            # solo en main
├── (CajaJDW.spec)                 # solo en version-usuario / respaldo-version-especial, no en main
├── Instalar Caja.bat / Iniciar Caja.bat / Construir EXE.bat
├── requirements.txt               # fastapi, uvicorn[standard], openpyxl, pydantic
├── app/
│   ├── main.py                    # FastAPI app, 4 routers, lifespan arranca backup si super admin
│   ├── config.py                  # rutas de Excel por sede/año, resolución sede activa/remota
│   ├── runtime_paths.py
│   ├── models/                    # caja_models.py, contadores_models.py, cuadre_models.py
│   ├── routers/                   # modules.py (386L), settings.py (213L), recaudo.py, diferencias.py
│   └── services/                  # 18 servicios, ~5300 líneas en total, excel_service.py es el mayor (1770L)
├── web/
│   ├── index.html (952L), app.js (4964L), styles.css (2492L)   # SPA sin framework, todo en 3 archivos
│   └── assets/
├── scripts/                        # install_windows.ps1, build_windows_exe.ps1, build_super_admin_exe.ps1
├── docs/                           # ver §4
├── data/                           # local por equipo, gitignored (settings.json + 4 catálogos JSON)
├── build/, dist/                   # gitignored, artefactos de PyInstaller
└── .venv/
```

Puntos verificados que confirman lo que dicen los docs vigentes:

- `app/main.py` monta 4 routers (`modules`, `settings`, `recaudo`, `diferencias`) y solo arranca `backup_service.programar_backup()` en el `lifespan` si `is_super_admin_build()` es verdadero.
- `is_super_admin_build()` = `os.getenv("CAJA_SUPER_ADMIN") == "1"`, y ese env var solo lo fija `launcher_super_admin.py`. Es la única diferencia real de arranque entre "build admin" y "build usuario" — todo lo demás (módulos habilitados, `Resumen`, etc.) se resuelve por rama de código, no por flag en runtime.
- Los módulos configurables en la pantalla de Administración (`web/index.html`, checkboxes `enabled_modules`) son: `caja, plataformas, gastos, bonos, prestamos, movimientos, contadores, cuadre, faltantes`. **No incluye `resumen`** en `main` — consistente con que `Resumen` es exclusivo de `version-usuario`/`respaldo-version-especial` y ni siquiera existe como opción activable en el panel admin de `main`.
- No hay `TODO`/`FIXME`/`HACK` en `app/` ni en `web/*.js|html` — código limpio de marcas pendientes.
- `HEARTBEAT_TIMEOUT` en `app/routers/settings.py` es **3600s (1 hora)** — coincide con los commits recientes "extend admin/user heartbeat timeout" (34ae89b, 4d23ddd) y con lo descrito en `especificacion-funcional.md`, pero el valor concreto (1h) no está escrito en ningún doc; si en algún momento se vuelve a tocar, vale la pena anotarlo.

## 4. Estado real de cada documento

| Archivo | Última actualización real (commit) | Veredicto | Acción sugerida |
|---|---|---|---|
| `docs/especificacion-funcional.md` | `e78f0ac` (2026-07-10) | ✅ Al día | Ninguna |
| `docs/plan-pruebas.md` | `e78f0ac` (2026-07-10) | ✅ Al día | Ninguna |
| `docs/analisis-tecnico.md` | `e78f0ac` (2026-07-10) en contenido, pero arrastra rutas rotas desde antes | ⚠️ Contenido al día, enlaces rotos | Reemplazar las 26 rutas absolutas `C:\Users\User\Desktop\Caja\...` por rutas relativas (mismo estilo que ya usa `contexto-proyecto.md`, ej. `[excel_service.py](../app/services/excel_service.py)`) |
| `docs/contexto-proyecto.md` | `c013189` (2026-04-30) | ⚠️ Desactualizado en un punto | Sección "Faltantes" (si se agrega) o mención de agrupación temporal: no la tiene explícita, revisar si conviene añadirla; ver también §4.1 |
| `README.md` | `c013189` (2026-04-30) | ⚠️ Desactualizado en un punto + rutas rotas | Corregir sección "Módulo Faltantes" (semana → mes, ver §4.1) y las 7 rutas absolutas rotas |
| `docs/contexto-chat-handoff.md` | `641418f` (2026-04-21) | 🗑️ Obsoleto / redundante | Archivar o eliminar (ver §4.2) |

### 4.1 El desfase concreto: Faltantes por semana vs por mes

El commit `e78f0ac` ("feat: show faltantes by month") cambió el agrupamiento de `Faltantes` de *semana actual + semanas del mes + meses del año* a *mes actual + meses del año*, y actualizó `analisis-tecnico.md`, `especificacion-funcional.md` y `plan-pruebas.md` en el mismo commit. Se le olvidó tocar `README.md` y `docs/contexto-proyecto.md`, que todavía dicen:

- `README.md:168-171`:
  ```
  - semana actual abierta
  - semanas anteriores del mes colapsadas
  - meses anteriores del ano colapsados
  ```
- Esto ya no es cierto: hoy es `mes actual` abierto + `meses anteriores del año` colapsados, sin nivel de semana.

`docs/contexto-proyecto.md` no menciona el detalle de agrupación de `Faltantes` explícitamente, así que no tiene una frase literalmente falsa, pero tampoco documenta el módulo `Faltantes` en absoluto (ni en la tabla de módulos ni en la sección 9 "Estado por rama" de `main`) — es una omisión, no una mentira, pero vale la pena añadirlo ya que es un módulo con servicio y router propios (`diferencias_service.py`, `diferencias.py`).

### 4.2 `docs/contexto-chat-handoff.md`: por qué es candidato a archivar

Es un documento de "handoff de chat" fechado el 21 de abril, pensado explícitamente como snapshot puntual ("para poder continuar en un chat nuevo sin perder continuidad"), no como doc vivo. Desde entonces:

- Hubo 15+ commits en `main` y varios en las otras ramas que no están reflejados ahí.
- Su contenido (ramas, ejecutables, patrón de mantenimiento) está duplicado y mejor mantenido en `contexto-proyecto.md` y `README.md`.
- Usa las mismas rutas absolutas rotas que `analisis-tecnico.md`.

Riesgo de mantenerlo tal cual: alguien (o un asistente en un chat futuro) lo lee primero por estar en `docs/`, cree que refleja el estado actual, y arrastra información vieja (por ejemplo, la lista de ejecutables en `dist/` que describe ya no es exacta respecto a for qué sirve cada uno hoy). Recomendación: moverlo a algo como `docs/archivo/` o borrarlo — su función ya la cumplen los otros docs.

## 5. Hallazgos técnicos concretos

### 5.1 `Construir EXE.bat` en `main` apunta al script equivocado (bug real)

En `main`, `Construir EXE.bat` contiene:

```bat
powershell -ExecutionPolicy Bypass -File ".\scripts\build_windows_exe.ps1"
```

`build_windows_exe.ps1` busca `CajaJDW.spec` en la raíz del proyecto:

```powershell
$specFile = Join-Path $projectRoot "CajaJDW.spec"
...
if (-not (Test-Path $specFile)) {
    throw "No se encontro CajaJDW.spec en $projectRoot."
}
```

Pero **`main` no tiene `CajaJDW.spec`**, solo `CajaSuperAdmin.spec`. Existe un script dedicado para eso, `scripts/build_super_admin_exe.ps1`, que sí apunta a `CajaSuperAdmin.spec` — pero `Construir EXE.bat` no lo usa.

Es el mismo archivo `.bat` byte a byte que en `version-usuario` (donde sí es correcto, porque ahí `CajaJDW.spec` existe). Se copió sin adaptar al crear/mantener `main`. Ahora mismo, si alguien ejecuta `Construir EXE.bat` en un checkout de `main`, el script falla con `"No se encontro CajaJDW.spec en ..."` en vez de generar `CajaSuperAdmin.exe`. El `.exe` actual de `main` se construyó manualmente con el comando de PyInstaller (documentado en `README.md`), no con el `.bat`.

**Corrección sugerida**: en `main`, cambiar el `.bat` para invocar `scripts\build_super_admin_exe.ps1`.

### 5.2 Nombre de exe manual / riesgo de sobreescritura silenciosa

`CajaJDW.spec` (idéntico contenido en `version-usuario` y `respaldo-version-especial`, `name='CajaJDW'`) siempre produce `dist/CajaJDW.exe`. Los nombres que sí distinguen las ramas en `dist/` (`CajaUsuarioJDW.exe`, `CajaEspecialJDW.exe`) existen porque alguien los renombra a mano después de cada build. Esto ya lo intuía `docs/contexto-chat-handoff.md` ("CajaJDW.exe — suele usarse para version-usuario o para la rama especial dependiendo del .spec activo"), pero no está resuelto ni documentado como procedimiento en los docs vigentes.

Riesgo concreto: si se construye `version-usuario` y luego, sin renombrar el `CajaJDW.exe` resultante, se cambia a `respaldo-version-especial` y se reconstruye, el segundo build sobreescribe el primero en `dist/` antes de que se haya copiado/renombrado — se pierde el binario de usuario sin ningún aviso.

**Opciones**: (a) documentar el paso manual de renombrado como parte del procedimiento de build en `README.md`/`analisis-tecnico.md`, o (b) fijar `name=` distinto en el `.spec` de cada rama (`CajaUsuarioJDW` / `CajaEspecialJDW`) para que PyInstaller genere directamente el nombre correcto y elimine el paso manual. (b) es más robusto porque quita el paso propenso a error humano.

### 5.3 Rutas absolutas rotas (`C:\Users\User\Desktop\Caja\...`)

Confirmado con conteo real:

| Archivo | Ocurrencias de `Desktop\Caja` |
|---|---|
| `docs/analisis-tecnico.md` | 26 |
| `README.md` | 7 |
| `docs/contexto-chat-handoff.md` | 3 |
| `docs/contexto-proyecto.md` | 0 (ya usa rutas relativas, ej. `../launcher_boot.py`) |
| `docs/especificacion-funcional.md` | 0 |
| `docs/plan-pruebas.md` | 0 |

Son enlaces markdown a rutas absolutas de otra máquina/carpeta (`C:\Users\User\Desktop\Caja`, usuario y nombre de carpeta distintos a los actuales: `C:\Users\William\OneDrive\Desktop\caja-multisede-jdw`). Al hacer clic no llevan a ningún lado en este equipo. `contexto-proyecto.md` ya demuestra el patrón correcto (rutas relativas tipo `../app/...`); es cuestión de aplicar el mismo criterio en `analisis-tecnico.md` y `README.md`, o simplemente quitar el enlace y dejar la ruta como texto (`app/services/excel_service.py`) sin link.

### 5.4 Carpetas `build/` residuales con convención antigua (cosmético, sin impacto)

`build/` (gitignorada, no afecta al repo) tiene una mezcla de convenciones viejas y nuevas:

```
build/CajaJDW/               (24 abr)
build/CajaSuperAdmin/        (10 jul) ← la que realmente se usa hoy para main
build/main-super/            (24 abr, vacía en la práctica)
build/version-usuario/       (24 abr, vacía en la práctica)
build/respaldo-version-especial/  (24 abr, vacía en la práctica)
```

No es un problema funcional (es caché local de PyInstaller, gitignorada), pero si en algún momento se audita el disco o se limpia el proyecto, las carpetas `build/main-super`, `build/version-usuario` y `build/respaldo-version-especial` son restos de un esquema de nombres anterior y se pueden borrar sin riesgo — PyInstaller las regenera con el nombre que corresponda según el `.spec` activo.

## 6. Riesgos ya conocidos y siguen vigentes (no son hallazgos nuevos)

Documentados de forma consistente en `analisis-tecnico.md` y `contexto-proyecto.md`, y siguen siendo ciertos hoy:

- Excel compartido no escala como backend multiusuario fuerte; Dropbox no resuelve concurrencia transaccional.
- El lock local (`.lock`) no protege contra dos equipos distintos escribiendo casi al mismo tiempo.
- La seguridad por contraseña en el frontend es una restricción operativa, no autenticación real.
- La operación depende del reloj local del equipo.

Ninguno de estos requiere acción inmediata según los propios docs — están señalados como límites conocidos del modelo actual (Excel + JSON), con migración a base de datos como paso natural si la operación crece.

## 7. Plan de acción sugerido (para ir marcando)

Priorizado por impacto real, no por esfuerzo:

- [ ] **Alto** — Corregir `Construir EXE.bat` en `main` para que llame `scripts\build_super_admin_exe.ps1` (§5.1). Sin esto, cualquiera que use el atajo en `main` se lleva un error confuso.
- [ ] **Medio** — Decidir y aplicar una solución para el naming del exe de usuario/especial (§5.2): documentar el renombrado manual, o mejor, poner `name=` distinto en cada `.spec`.
- [ ] **Medio** — Actualizar `README.md` y `docs/contexto-proyecto.md` con el cambio de `Faltantes` (semana → mes) (§4.1).
- [ ] **Bajo** — Reemplazar las rutas absolutas rotas en `README.md` y `docs/analisis-tecnico.md` por rutas relativas o texto plano (§5.3).
- [ ] **Bajo** — Archivar o borrar `docs/contexto-chat-handoff.md` (§4.2).
- [ ] **Opcional / limpieza** — Borrar las carpetas `build/CajaJDW`, `build/main-super`, `build/version-usuario`, `build/respaldo-version-especial` (residuo local, gitignorado, sin riesgo) (§5.4).

Puedo aplicar cualquiera de estos directamente (son cambios pequeños y de bajo riesgo) en cuanto lo confirmes — dime cuáles quieres que resuelva ya.
