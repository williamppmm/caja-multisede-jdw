# Contexto del Proyecto — CajaJDW

## 1. Descripción general

CajaJDW es una capturadora contable multisede para operación diaria y auditoría. Proyecto real ligado a un flujo de trabajo contable operativo, construido con foco práctico y ajustado progresivamente según necesidades reales.

La aplicación corre como desktop app en Windows: backend FastAPI (Python), frontend HTML/CSS/JS vanilla, empaquetado con PyInstaller. La UI se sirve en el browser local (`Chrome`/`Edge`) apuntando a `127.0.0.1`.

---

## 2. Stack técnico

| Capa | Tecnología |
|---|---|
| Backend | FastAPI + uvicorn |
| Datos | openpyxl sobre archivos Excel (sin base de datos) |
| Frontend | HTML5 + CSS3 + JavaScript vanilla (ES6+) |
| Empaquetado | PyInstaller |
| Sincronización | Dropbox por carpetas de sede |
| Validación | Pydantic v2 |
| OS | Windows únicamente |

**Dependencias clave (`requirements.txt`):**
- `fastapi >= 0.111.0`
- `uvicorn[standard] >= 0.29.0`
- `openpyxl >= 3.1.2`
- `pydantic >= 2.7.0`

**Importante:** `openpyxl.Workbook` **no es context manager**. No se puede usar `with load_workbook(...) as wb`. Hay que llamar `wb.close()` manualmente en `try/finally`.

---

## 3. Ramas y ejecutables

| Rama | Ejecutable(s) | Puerto | Propósito |
|---|---|---|---|
| `main` | `CajaSuperAdmin.exe`, `CajaJDW_SuperAdmin.exe` | 8001 | Auditoría, corrección, multisede, respaldos |
| `version-usuario` | `CajaJDW_Usuario.exe` | 8000 | Operación diaria, captura controlada |
| `respaldo-version-especial` | `CajaJDW_Especial.exe` | 8000 | Igual a usuario, pero Caja inicia en `ayer()` primer cargue |

El build super admin detecta su identidad por `os.getenv("CAJA_SUPER_ADMIN") == "1"`, seteado en `launcher_super_admin.py`. No se persiste en disco. `settings_service.is_super_admin_build()` es el punto de chequeo en todo el código.

**No mezclar ramas sin intención explícita.** Siempre verificar si un cambio aplica a `main`, `version-usuario`, `respaldo-version-especial` o a varias.

---

## 4. Estructura completa del proyecto

```text
Caja/
├── launcher.py                        # Arranca usuario (puerto 8000)
├── launcher_super_admin.py            # Arranca super admin (puerto 8001), setea CAJA_SUPER_ADMIN=1
├── CajaJDW.spec                       # PyInstaller spec → CajaJDW.exe
├── CajaSuperAdmin.spec                # PyInstaller spec → CajaSuperAdmin.exe
├── Construir EXE.bat
├── Iniciar Caja.bat
├── Instalar Caja.bat
├── requirements.txt
├── app/
│   ├── main.py                        # FastAPI app + lifespan hook (dispara backup en SA)
│   ├── config.py                      # DENOMINACIONES, rutas Excel, get_excel_folder()
│   ├── runtime_paths.py               # get_base_dir(), frozen detection, get_app_data_dir()
│   ├── models/
│   │   ├── caja_models.py             # CajaEntrada, CajaRespuesta
│   │   ├── cuadre_models.py           # CuadreEntrada, CuadreRespuesta
│   │   └── contadores_models.py       # ContadoresEntrada, ContadorFilaEntrada, ReferenciaCriticaEntrada
│   ├── routers/
│   │   ├── modules.py                 # /api/modulos/* — todos los módulos operativos
│   │   └── settings.py                # /api/settings/*, /api/backup/*, heartbeat, shutdown
│   └── services/
│       ├── settings_service.py        # Lectura/escritura settings.json, multi-sede, SA detection
│       ├── excel_service.py           # Lectura/escritura de todos los módulos en xlsx (~1585 líneas)
│       ├── cuadre_service.py          # Lógica cuadre: cálculo, acumulación, precondiciones (~495 líneas)
│       ├── contadores_service.py      # Catálogo, referencias vigentes, guardar contadores (~396 líneas)
│       ├── caja_service.py            # Gestión caja (~188 líneas)
│       ├── bonos_service.py           # Gestión bonos (~126 líneas)
│       ├── prestamos_service.py       # Gestión préstamos (~113 líneas)
│       ├── movimientos_service.py     # Gestión movimientos (~102 líneas)
│       ├── gastos_service.py          # Gestión gastos (~46 líneas)
│       ├── startup_state_service.py   # startup_state.json: Día 0, base anterior, refs contadores
│       ├── backup_service.py          # Respaldo automático multisede, solo super admin (~351 líneas)
│       ├── plataformas_referencia_service.py  # Lee xlsx externos de referencia (Practisistemas/Bet)
│       ├── nombres_service.py         # Catálogos de nombres para bonos, préstamos, movimientos, gastos
│       ├── local_data_service.py      # Rutas a data/ local (settings y catálogos estrictamente locales)
│       └── super_admin_audit_service.py  # Log de auditoría de acciones SA (append a super_admin_audit.jsonl)
├── web/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── scripts/
│   ├── build_super_admin_exe.ps1
│   ├── build_windows_exe.ps1
│   └── install_windows.ps1
└── docs/
    ├── contexto-proyecto.md           # Este archivo
    ├── analisis-tecnico.md
    ├── especificacion-funcional.md
    └── plan-pruebas.md
```

---

## 5. Arquitectura de datos

### 5.1 Libros Excel por sede

#### `Contadores_{sede}_{año}.xlsx`
Hojas: `Caja{sede}` · `Plataformas{sede}` · `Bonos{sede}` · `Gastos{sede}` · `Prestamos{sede}` · `Movimientos{sede}`

#### `Consolidado_{sede}_{año}.xlsx`
Hojas: `Contadores{sede}` · `Cuadre{sede}`

> Contadores y Cuadre fueron migrados a Consolidado (commit `59162d8`). Los datos anteriores a esa migración en el archivo original no son recuperables por código.

### 5.2 Nombres de hojas

Generados dinámicamente por `_obtener_nombre_hoja_seccion(modulo)`:
```python
f"{SECTION_PREFIXES[modulo]}{sede}"
# Ej: módulo "contadores" + sede "Barbacoas" → "ContadoresBarbacoas"
```

`SECTION_PREFIXES`: `caja→Caja`, `plataformas→Plataformas`, `bonos→Bonos`, `gastos→Gastos`, `prestamos→Prestamos`, `movimientos→Movimientos`, `contadores→Contadores`, `cuadre→Cuadre`

### 5.3 Archivos auxiliares por sede

En el `data_dir` de cada sede:
- `contadores_items.json` — catálogo de ítems/máquinas de contadores
- `startup_state.json` — estado del Día 0 (fecha inicio, caja inicial, referencias contadores)

### 5.4 Constantes de dominio

```python
DENOMINACIONES = [100000, 50000, 20000, 10000, 5000, 2000]  # billetes aceptados
HOJA_REGISTROS = "RegistrosDiarios"  # hoja legacy (referencia histórica)
```

---

## 6. Resolución de rutas y contexto de sede

```text
get_excel_folder()
  → _get_active_dir_and_sede()         [config.py]
    → si super_admin_mode: get_active_site()  → site["data_dir"], site["sede"]
    → si no: settings["data_dir"], settings["sede"]
```

Todos los servicios pasan por esta cadena. No hay rutas hardcodeadas. Si `active_site_id` no encuentra match en `remote_sites` y solo hay un site configurado, devuelve ese único site.

---

## 7. Configuración — `settings.json`

Vive en la ruta local del proceso (`data/settings.json`).

```json
{
  "sede": "Principal",
  "data_dir": "C:\\ContabilidadJDW",
  "modo_entrada": "cantidad",
  "enabled_modules": ["caja", "gastos"],
  "default_module": "caja",
  "super_admin_mode": true,
  "active_site_id": "barbacoas",
  "remote_sites": [
    { "id": "magui",     "sede": "Magui",     "data_dir": "C:\\...\\Magui",     "label": "Magui" },
    { "id": "barbacoas", "sede": "Barbacoas", "data_dir": "C:\\...\\Barbacoas", "label": "Barbacoas" }
  ],
  "plataformas_ref_practi_path": "",
  "plataformas_ref_bet_path": "",
  "plataformas_ref": { "practi_header": "", "bet_header": "" },
  "backup_enabled": false,
  "backup_root": ""
}
```

En super admin build (`CAJA_SUPER_ADMIN=1`), `enabled_modules` siempre incluye todos los módulos, independientemente de lo que diga el archivo.

**Caché de settings:** `settings_service` cachea por `mtime` del archivo. Se invalida automáticamente al guardar.

---

## 8. API — Superficie de endpoints

### `/api/modulos/`

| Endpoint | Método | Descripción |
|---|---|---|
| `/{modulo}/fecha/{fecha}/datos` | GET | Datos guardados de una fecha |
| `/{modulo}/fecha/{fecha}/estado` | GET | Estado y precondiciones del módulo |
| `/{modulo}/ultima` | GET | Última fecha con registros |
| `/caja/guardar` | POST | Guardar arqueo de caja |
| `/plataformas/guardar` | POST | Guardar plataformas |
| `/contadores/guardar` | POST | Guardar contadores (dispara autoguardado cuadre) |
| `/cuadre/guardar` | POST | Guardar cuadre |
| `/cuadre/calcular/{fecha}` | GET | Calcular cuadre sin guardar |
| `/{modulo}/registrar` | POST | Agregar ítem (bonos, préstamos, movimientos, gastos) |
| `/{modulo}/registro/editar` | POST | Editar ítem por timestamp |
| `/{modulo}/registro/eliminar` | POST | Eliminar ítem por timestamp |
| `/catalogo/{tipo}` | GET/POST | Leer/guardar catálogos |
| `/prestamos/saldos` | GET | Saldos acumulados por persona |

### `/api/settings/`

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/settings` | GET/POST | Leer/guardar configuración general |
| `/api/settings/remote-sites` | GET/POST | Sedes remotas |
| `/api/settings/active-site` | POST | Cambiar sede activa |
| `/api/settings/remote-sites/validate` | POST | Verificar acceso a carpeta de sede |
| `/api/settings/remote-sites/browse` | POST | Abrir diálogo de carpeta |
| `/api/settings/startup` | GET/POST | Estado Día 0 |
| `/api/settings/open-module-xlsx` | POST | Abrir xlsx en hoja correcta vía PowerShell COM |
| `/api/backup/status` | GET | Estado del último respaldo |
| `/api/backup/run-now` | POST | Ejecutar respaldo inmediato |
| `/api/backup/validate-root` | POST | Verificar carpeta de respaldos |
| `/api/app/heartbeat` | POST | Keepalive (watchdog 75 s) |
| `/api/app/shutdown` | POST | Apagar proceso |

---

## 9. Modelos Pydantic (`app/models/`)

### Entradas principales

- `CajaEntrada` — `fecha`, `billetes: dict[str, int]`, `total_monedas`, `billetes_viejos`, `forzar`
- `PlataformasEntrada` — `fecha`, `venta_practisistemas`, `venta_deportivas`, `forzar`
- `ContadoresEntrada` — `fecha`, `items: list[ContadorFilaEntrada]`, `forzar`
- `ContadorFilaEntrada` — `item_id`, `entradas`, `salidas`, `jackpot`, `usar_referencia_critica`, `referencia_critica?`, `produccion_pre_reset`
- `ReferenciaCriticaEntrada` — `entradas`, `salidas`, `jackpot`, `observacion`
- `CuadreEntrada` — `fecha`, `base_anterior`, `forzar`
- `BonoEntrada` / `PrestamoEntrada` / `MovimientoEntrada` / `GastoEntrada` — `fecha`, `hora`, tipo/concepto/persona, `valor`, `forzar`

### Respuestas

Todas incluyen: `ok`, `mensaje`, `fecha`. Específicas: `total`, `fecha_hora_registro`, campos del módulo.

---

## 10. Módulos y diferencias entre versiones

| Módulo | Usuario | SA | Notas |
|---|---|---|---|
| Caja | ✓ | ✓ | SA: edición/eliminación amplia, contexto auditoría |
| Bonos | ✓ | ✓ | |
| Gastos | ✓ | ✓ | |
| Préstamos | ✓ | ✓ | Usuario: ciclo activo visible · SA: auditoría por día con saldo acumulado |
| Movimientos | ✓ | ✓ | |
| Plataformas | ✓ | ✓ | Corrección permite `0 / 0` con autorización |
| Contadores | ✓ | ✓ | Ítems pausados se omiten silenciosamente al guardar |
| Cuadre | ✓ | ✓ | Puede acumular períodos sin Caja+Contadores |
| Resumen | ✓ | ✗ | Solo versión usuario |

---

## 11. Lógica de Cuadre (`cuadre_service.py`)

### Funciones clave

**`verificar_precondiciones(fecha_cuadre)`** → retorna:
- `ok`, `puede_guardar`
- `tiene_caja_dia`, `tiene_contadores_dia`
- `dias_acumulados` — fechas sin Caja ni Contadores (se pueden incluir en el período)
- `dias_inconsistentes` — fechas con solo uno de los dos (bloquean el cuadre)
- `tiene_base_anterior`, `base_anterior: float`
- `periodo` — lista de fechas del período del cuadre

**`obtener_base_anterior_valor(fecha_cuadre)`** → resuelve en orden:
1. Último cuadre guardado antes de `fecha_cuadre`
2. Si no existe: `startup_state` (fecha_inicio + caja_inicial)
3. Si nada: `None`

**`calcular_cuadre(fecha_cuadre, base_anterior)`** → dict con:
- Totales: contadores, bonos, gastos, plataformas (practi/dep), préstamos (entrada/salida), movimientos (ingresos/salidas)
- Caja física desglosada (billetes por denominación, monedas, viejos)
- `caja_teorica = base_anterior + ingresos - egresos`
- `diferencia = caja_fisica - caja_teorica`
- `base_nueva = caja_fisica`

**`resolver_periodo_operativo(fecha_cuadre)`** — busca hacia atrás el último día con Caja + Contadores y clasifica días intermedios.

**`autoguardar_cuadre_si_listo(fecha)`** — llamado automáticamente tras guardar Contadores. Si Caja + Contadores del día existen y hay base anterior resuelta, guarda el cuadre sin intervención del usuario.

### Principio de acumulación

Cuadre puede abarcar varios días si hubo días sin Caja+Contadores. El período se consolida en un solo cuadre. Esto responde a la realidad operativa: no siempre se cierra el mismo día.

---

## 12. Frontend — variables globales críticas (`app.js`)

| Variable | Tipo | Propósito |
|---|---|---|
| `MODULE_META` | object | `{caja: {label, panelId, dateLabel}, ...}` — mapa completo de módulos |
| `currentModule` | string | Módulo activo visible |
| `enabledModules` | array | Módulos habilitados en esta sesión |
| `moduleDates` | object | Última fecha cargada por módulo (compartida entre módulos) |
| `configSuperAdminMode` | bool | True si modo SA activo |
| `configSuperAdminBuild` | bool | True si proceso es CajaSuperAdmin.exe |
| `configActiveSite` | object | Site activo: `{id, sede, data_dir, label}` |
| `configRemoteSites` | array | Todos los sites remotos configurados |
| `configSede` | string | Sede local (versión usuario) |
| `adminOverride` | object | `{modulo: fecha_autorizada}` — override activo por módulo |
| `pendingAdminAction` | function | Acción a ejecutar tras autorización exitosa |
| `moduleStatusCache` | object | Cache de estado de módulo por fecha |
| `cajaLocked` | bool | Caja bloqueada para edición |
| `cajaDrafts` | object | Borradores de caja por fecha |
| `contadoresLocked` | bool | Contadores bloqueado |
| `contadoresDrafts` | object | Borradores de contadores por fecha |
| `cuadreDatos` | object | Datos del cuadre calculado (aún no guardado) |
| `_cerrando` | bool | Flag que suprime `beforeunload` cuando el cierre fue confirmado |
| `DENOMINACIONES` | array | `[100000, 50000, 20000, 10000, 5000, 2000]` |
| `CONTRASENA` | string | `'1980'` — para autorizar edición de fechas pasadas |
| `ADMIN_CONTRASENA` | string | `'190380'` — para panel de administración |
| `OBSERVACION_CRITICA_DEFAULT` | string | `'reinicio técnico'` |

### Funciones de autorización

**`esSuperAdminActivo()`** → `Boolean(configSuperAdminMode && configActiveSite)`

**`isOverrideActive(modulo, fecha)`** → true si `adminOverride[modulo] === fecha`

**`requiereAutorizacionParaFecha(modulo, fecha)`** → true si la fecha es pasada, no hay override y no es SA activo

**`bloquearIntentoEdicion(control, evento)`** → intercepta edición, lanza tarjeta de autorización modal

**`mostrarBannerAutorizacion({titulo, descripcion, onSuccess, focusSelector})`** → modal de contraseña, tras éxito ejecuta `onSuccess` y restaura foco

### Flujo de autorización típico

1. Usuario edita campo en fecha pasada
2. `bloquearIntentoEdicion()` intercepta
3. Valida `requiereAutorizacionParaFecha()` → true
4. Abre tarjeta modal con `CONTRASENA = '1980'`
5. Tras validación: `setOverride(modulo, fecha)` + ejecuta acción pendiente

---

## 13. Frontend — paneles en `index.html`

| ID | Panel | Notas |
|---|---|---|
| `panel-caja` | Arqueo caja | Billetes, monedas, viejos |
| `panel-plataformas` | Plataformas | Practisistemas + Deportivas |
| `panel-gastos` | Gastos | Conceptos y valores |
| `panel-bonos` | Bonos | Cliente, valor, listado |
| `panel-prestamos` | Préstamos | Persona, tipo, saldos |
| `panel-movimientos` | Movimientos | Ingresos/salidas |
| `panel-contadores` | Contadores | Tabla ítems, referencias críticas, pausas |
| `panel-cuadre` | Cuadre | Grid 3 columnas compacto |

**Elementos globales clave:**
- `#super-admin-sede-banner` — selector de sede activa (solo SA)
- `#auth-card` — tarjeta modal de ingreso de contraseña
- `#fecha` — input date compartido entre módulos
- `#modulo-tabs` — tabs dinámicos según `enabledModules`
- `#mensaje` — área de mensajes del sistema
- `#btn-abrir-xlsx` — botón contextual Abrir Excel (solo SA)
- `#modal-admin` — modal de configuración admin

---

## 14. Cierre de la aplicación

### Botón "Finalizar"

`cerrarAplicacion()` muestra **un solo** `confirm`:
- Con datos sin guardar: `"Tienes datos sin guardar en X. ¿Cerrar sin guardar?"`
- Sin pendientes: `"¿Desea finalizar ahora?"`

Tras confirmar: `_cerrando = true` → `POST /api/app/shutdown` → `window.close()`

### `beforeunload`

```js
window.addEventListener('beforeunload', e => {
  if (_cerrando) return;                          // ya confirmado por Finalizar
  if (!obtenerModulosConCambiosSinGuardar().length) return;
  e.preventDefault();
  e.returnValue = '';  // requerido por Chromium para mostrar el diálogo nativo
});
```

Los módulos con cambios sin guardar detectados: **Caja** y **Contadores** (via `cajaDrafts` y `contadoresDrafts`).

---

## 15. Excel directo desde super admin

Botón `Abrir Excel` en toolbar (visible solo cuando `esSuperAdminActivo()`):
- Lee `currentModule` y `obtenerFechaModuloActual()`
- Llama `POST /api/settings/open-module-xlsx` con `{modulo, year}`
- Backend resuelve path con `_path_modulo(modulo, year)` y hoja con `_obtener_nombre_hoja_seccion(modulo)`
- Abre Excel vía **PowerShell COM** (`New-Object -ComObject Excel.Application`) y activa la hoja
- PowerShell espera máximo 2 s para detectar fallos rápidos; si sigue corriendo = éxito

| Módulo | Archivo |
|---|---|
| caja, bonos, gastos, préstamos, movimientos, plataformas | `Contadores_{sede}_{año}.xlsx` |
| contadores, cuadre | `Consolidado_{sede}_{año}.xlsx` |

---

## 16. Respaldos automáticos (`backup_service.py`, solo `main`)

### Configuración

Campos en `settings.json`: `backup_enabled` (bool, default `false`), `backup_root` (string, default `""`).

El backup no corre si `backup_root` está vacío, incluso si `backup_enabled` es `true`.
La ruta de respaldos no está fija en código: se define desde el panel admin del super admin.

### Timing

- **Primer intento:** 10 minutos después del arranque (hilo daemon con `time.sleep`)
- **Loop periódico:** cada 4 horas (el hilo no termina, repite indefinidamente)
- **Disparo inmediato:** al guardar settings en super admin, si `backup_enabled` y `backup_root` están configurados (`POST /api/settings` dispara `threading.Thread(target=_run_con_lock).start()`)

### Archivos respaldados por sede

`Contadores_*.xlsx`, `Consolidado_*.xlsx`, `contadores_items.json`, `startup_state.json`

### Estructura de destino

```
{backup_root}/
  {sede}/
    2026-04-14/
      Contadores_Sede_2026.xlsx
      Consolidado_Sede_2026.xlsx
      contadores_items.json
      startup_state.json
      manifest.json              ← {sede, fecha_backup, archivos_copiados, archivos_fallidos, valido}
  backup_log.jsonl               ← append, una línea JSON por ejecución
```

### Criterio de completitud

Un respaldo del día se considera completo si: carpeta existe + `manifest.json` existe + `manifest.json` tiene `valido: true`. Sin este criterio, una carpeta incompleta haría que el backup se saltara por error.

### Copia atómica

Cada archivo se copia primero a un `.tmp` (via `tempfile.NamedTemporaryFile`), luego se renombra. Evita respaldos a medias si se interrumpe el proceso.

### Retención

3 días por sede. Carpetas más antiguas se eliminan automáticamente.

### Guards

- `_backup_lock` — evita ejecuciones solapadas
- `_backup_dia_completo()` — skip si el día ya fue respaldado correctamente
- No sobreescribe archivo destino existente si la fuente no pasa validación

---

## 17. Empaquetado y distribución

### Specs PyInstaller

- `CajaJDW.spec` → `launcher.py` → `CajaJDW.exe` (usuario)
- `CajaSuperAdmin.spec` → `launcher_super_admin.py` → `CajaSuperAdmin.exe` (super admin)

Ambos incluyen `web/` como datos. Excluyen librerías pesadas no usadas (numpy, pandas, PIL, sklearn) y extras de uvicorn (httptools, uvloop, websockets).

### Scripts de build

```
scripts/
├── build_windows_exe.ps1        # Build versión usuario
├── build_super_admin_exe.ps1    # Build super admin
└── install_windows.ps1          # Setup inicial en equipo nuevo
```

### `.gitignore` notable

Excluidos del repositorio: `data/`, `settings.json`, `contadores_items.json`, `startup_state.json`, `*.xlsx`, `~$*.xlsx`, `build/`, `dist/`, `.claude/`.

---

## 18. Decisiones de diseño fijas

- Excel es la fuente de verdad; no hay base de datos
- Fecha depende del reloj local del equipo, nunca del servidor
- Contadores y Cuadre siempre en `Consolidado_*.xlsx`; resto en `Contadores_*.xlsx`
- `sessionStorage` persiste fechas y estados de sesión entre navegaciones
- `beforeunload` requiere `e.preventDefault()` + `e.returnValue = ''` para Chromium (aunque `returnValue` está deprecado en el spec, Chrome lo sigue requiriendo en la práctica)
- `Workbook` de openpyxl no es context manager — usar `try/finally` + `wb.close()`
- Caja en SA es de solo lectura en contextos de auditoría sin override activo
- Ítem pausado en Contadores se omite silenciosamente al guardar
- Los ajustes de usuario no se asumen automáticamente válidos para SA, ni viceversa
- `autocomplete="new-password"` para evitar interferencias del navegador en campos sensibles
- Plataformas: corrección permite `0 / 0` solo con autorización
- El cuadre puede acumular días sin Caja+Contadores (realidad operativa real)

---

## 19. Riesgos operativos conocidos

- Dropbox puede generar conflictos o dejar archivos bloqueados temporalmente
- Excel abierto en otro proceso impide escritura (`ArchivoCajaOcupadoError`)
- Un reloj de sistema incorrecto afecta registros y cierres
- Archivos Excel compartidos entre usuario y auditoría simultáneamente pueden corromperse
- Los respaldos son la principal defensa; restauración automática no está implementada (intencional en v1)

---

## 20. Convenciones de trabajo

- Leer el archivo antes de editar
- Analizar antes de implementar cuando el cambio afecta datos, rutas o Excel
- No mezclar ramas sin intención explícita
- Siempre distinguir: ¿este cambio aplica a `main`, `version-usuario`, `respaldo-version-especial` o a varias?
- Verificar en local antes de cerrar cambios sensibles
- Commits claros con alcance explícito; el usuario hace sus propios commits
- Antes de proponer código que afecte Excel o multi-sede: contrastar con comportamiento real

---

## 21. Estado actual (2026-04-14)

| Rama | Estado |
|---|---|
| `main` | Super admin actualizada y funcional. Backup automático, Abrir Excel, layout Cuadre 3 cols, cierre mejorado, visibilidad módulos. |
| `version-usuario` | Estable. Resumen + Cuadre compactados, visibilidad de módulos, cierre mejorado. |
| `respaldo-version-especial` | Estable. Caja inicia en `ayer()` solo al primer cargue de la sesión. |

---

## 22. Criterio de recuperación ante corrupción

1. Recuperar último respaldo válido (`manifest.json` con `valido: true`)
2. Reingresar lo faltante si aplica
3. Continuar operación; el cuadre puede absorber el acumulado

El sistema prioriza continuidad operativa y trazabilidad por encima de restauración automática compleja.
