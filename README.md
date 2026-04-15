# CajaJDW — Capturadora Multimódulo

> **Rama `main` — build super admin.**
> Esta es la versión de supervisión centralizada. Para la versión de operador de sede consulta la rama `version-usuario`; para la versión especial (arranca en ayer) consulta `respaldo-version-especial`.

Aplicación local para capturar información diaria de caja por sede y guardarla en archivos Excel anuales, pensados tanto como respaldo operativo como fuente para análisis posterior en Excel o Power Query.

La app corre localmente en cada equipo, abre una interfaz web en el navegador y escribe sobre libros Excel anuales por sede dentro de una carpeta compartida, por ejemplo Dropbox.

## Qué hace

- Registra arqueos de caja.
- Registra plataformas.
- Registra gastos.
- Registra bonos por cliente.
- Registra préstamos y pagos por persona.
- Registra movimientos extraordinarios.
- Registra contadores por ítem.
- Calcula el cuadre del período.
- Guarda todo en archivos Excel anuales por sede.

## Enfoque de trabajo

- cada equipo usa la app localmente
- cada equipo configura su sede
- cada sede escribe en su propio archivo anual
- el Excel sigue siendo útil como respaldo, consulta y fuente para Power Query

Archivos que genera por sede y año:

- `Contadores_{sede}_{año}.xlsx` — módulos operativos (Caja, Plataformas, Gastos, Bonos, Préstamos, Movimientos)
- `Consolidado_{sede}_{año}.xlsx` — consolidación del período (Contadores, Cuadre)

## Tecnologías

- Python 3.11+
- FastAPI
- Uvicorn
- OpenPyXL
- Pydantic
- HTML, CSS y JavaScript
- PyInstaller para el `.exe`

## Estructura resumida

```text
app/
  main.py
  config.py
  runtime_paths.py
  models/
  routers/
  services/
web/
  index.html
  app.js
  styles.css
scripts/
launcher.py
CajaJDW.spec
README.md
data/
docs/
  analisis-tecnico.md
```

## Instalación local

### Desarrollo

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python launcher.py
```

Con recarga automática:

```bash
uvicorn app.main:app --reload
```

### Instalación rápida en Windows

1. Descargar o clonar el proyecto.
2. Ejecutar `Instalar Caja.bat`.

El instalador crea `.venv`, instala dependencias y deja un acceso directo `Iniciar Caja.lnk` en el escritorio.

También puedes usar:

```powershell
scripts/install_windows.ps1
```

### Construcción del EXE

#### Versión usuario (`CajaJDW.exe`)

1. Ejecutar `Instalar Caja.bat`.
2. Ejecutar `Construir EXE.bat`.
3. El ejecutable quedará en `dist\CajaJDW.exe`.

#### Versión super admin (`CajaSuperAdmin.exe`)

1. Ejecutar `Instalar Caja.bat`.
2. Ejecutar `scripts\build_super_admin_exe.ps1` (o ejecutar PyInstaller manualmente con `CajaSuperAdmin.spec`).
3. El ejecutable quedará en `dist\CajaSuperAdmin.exe`.

Este build usa `launcher_super_admin.py`, que arranca la app con `is_super_admin_build = True`. Eso habilita el modo super admin sin contraseña desde el primer arranque.

Características del EXE:

- abre el servidor local automáticamente
- abre la interfaz en el navegador
- no requiere consola visible
- detecta un puerto libre entre 8000 y 8009
- instancia única: si ya está corriendo, el segundo clic solo abre el navegador sin iniciar un servidor nuevo
- se apaga automáticamente si el navegador se cierra (watchdog de 75 s sin heartbeat)

`Iniciar Caja.bat` usa el mismo `launcher.py`, así que en desarrollo conserva ese comportamiento de arranque.

## Configuración inicial por equipo

Después de abrir la app:

1. Entrar a Administración.
2. Definir la sede.
3. Elegir la carpeta donde se guardarán los libros.
4. Seleccionar los módulos habilitados.
5. Elegir el módulo por defecto si aplica.
6. Opcionalmente definir un estado inicial del sistema:
   - fecha de inicio
   - caja inicial
   - referencias iniciales por ítem para Contadores

La configuración local se reparte entre:

- `data/settings.json`
- `startup_state.json` en la carpeta activa de la sede

## Módulos disponibles

| Módulo | Uso principal | Regla de edición (modo usuario) | Regla de edición (modo super admin) |
|---|---|---|---|
| `Caja` | Arqueo físico del día | si la fecha ya existe, requiere admin | cualquier fecha libre; pide confirmación al sobrescribir |
| `Plataformas` | Ventas de plataformas | fecha actual libre, otra fecha requiere admin | cualquier fecha libre |
| `Gastos` | Egresos del día | fecha actual libre, otra fecha requiere admin | edición y eliminación por fila en cualquier fecha |
| `Bonos` | Bonos por cliente | fecha actual libre, otra fecha requiere admin | edición y eliminación por fila en cualquier fecha |
| `Prestamos` | Préstamos y pagos | fecha actual libre, otra fecha requiere admin | edición y eliminación por fila en cualquier fecha |
| `Movimientos` | Ingresos y salidas extraordinarias | fecha actual libre, otra fecha requiere admin | edición y eliminación por fila en cualquier fecha |
| `Contadores` | Captura por ítem con referencias | si la fecha ya existe, requiere admin | cualquier fecha libre |
| `Cuadre` | Consolidación del período | si ya existe, corregir requiere admin | cualquier fecha libre; pide confirmación al sobrescribir |

## Catálogos locales y auxiliares

La app mantiene JSON locales por equipo dentro de `data/`:

- `data/bonos_clientes.json`
- `data/gastos_conceptos.json`
- `data/prestamos_personas.json`
- `data/movimientos_conceptos.json`
- `data/settings.json`

Además, por cada sede activa existen dos archivos auxiliares que viven junto a los `.xlsx` en `data_dir`:

- `contadores_items.json`
- `startup_state.json`

Los catálogos de bonos, gastos, préstamos y movimientos son locales al equipo. En cambio, `contadores_items.json` y `startup_state.json` siguen la sede activa y se comparten operativamente con sus libros Excel.

También se pueden administrar desde la interfaz:

- importar nombres de bonos desde `.txt`
- editar catálogos de gastos, préstamos, movimientos y contadores
- pausar ítems de Contadores sin eliminar su historial

## Modo super admin

El modo super admin está pensado para un equipo de supervisión centralizado que necesita operar sobre múltiples sedes remotas sin ingresar contraseña.

### Activación

- **Build dedicado (`CajaSuperAdmin.exe`):** el modo se activa automáticamente al arrancar. No hay toggle ni contraseña.
- **Build usuario con toggle:** se puede activar desde Administración → Sedes remotas → "Activar modo super admin". Solo para uso administrativo.

### Diferencias de comportamiento

| Aspecto | Modo usuario | Modo super admin |
|---|---|---|
| Contraseña admin | requerida para fechas pasadas | nunca requerida |
| Edición de registros | no disponible o solo en fecha actual | ✎/✕ por fila en cualquier fecha |
| Sedes | una sola (local) | múltiples sedes remotas configurables |
| Referencias plataformas | no disponible | compara contra Practisistemas y Bet/Deportivas |
| Catálogos de módulos | editables | ocultos (no aplica en supervisión) |
| Banner | sin indicador especial | banner "⚙ SUPER ADMIN" con sede activa |

### Configuración de sedes remotas

Desde Administración → Sedes remotas se configuran las sedes. Cada sede requiere:

| Campo | Descripción |
|---|---|
| **Nombre visible** | Etiqueta para el selector de sede en el banner. |
| **Sede** | Nombre normalizado que aparece en el nombre del Excel (`Contadores_{sede}_{año}.xlsx`). Se detecta automáticamente al verificar la carpeta. |
| **Carpeta Dropbox** | Ruta local a la carpeta de la sede (normalmente sincronizada por Dropbox). Se puede elegir con selector o verificar acceso. |
| **Columna Practisistemas** | Nombre exacto de la columna en `Ventas_dia_Practisistemas.xlsx` para comparar referencias. |
| **Columna Deportivas/Bet** | Nombre exacto de la columna en `Ventas_dia_Bet.xlsm` para comparar referencias. |

Al cambiar de sede activa desde el banner, la app recarga el módulo actual apuntando al Excel de la sede seleccionada.

### Referencias de plataformas

Cuando hay una sede activa con carpeta configurada, el módulo Plataformas compara los valores ingresados contra las columnas correspondientes en los archivos de referencia de la carpeta. Si hay diferencia, se muestra un aviso visual.

## Uso con varias sedes

Cada sede debe escribir en su propio libro anual.

Ventajas:

- reduce conflictos
- facilita consolidación
- mantiene el libro más claro para revisión manual

Ejemplo:

| Sede | Operativo | Cuadres |
|---|---|---|
| Barbacoas | `Contadores_Barbacoas_2026.xlsx` | `Consolidado_Barbacoas_2026.xlsx` |
| SanJose | `Contadores_SanJose_2026.xlsx` | `Consolidado_SanJose_2026.xlsx` |
| Satinga | `Contadores_Satinga_2026.xlsx` | `Consolidado_Satinga_2026.xlsx` |

## Límite importante con Dropbox

La app usa un bloqueo local `.lock` para reducir guardados simultáneos en el mismo equipo, pero no tiene coordinación central entre varios equipos.

Eso significa:

- funciona bien si cada sede trabaja sobre su propio archivo
- puede haber conflictos si dos equipos de la misma sede escriben el mismo libro casi al mismo tiempo

## Compatibilidad actual

- objetivo principal: Windows
- Linux: posible a futuro, pero todavía no es prioridad ni está completamente preparado

## Documentación técnica

| Documento | Contenido |
|---|---|
| [docs/contexto-proyecto.md](docs/contexto-proyecto.md) | Documento maestro del contexto real del proyecto, ramas, arquitectura de datos, decisiones operativas y estado actual |
| [docs/especificacion-funcional.md](docs/especificacion-funcional.md) | Descripción exhaustiva de cada módulo, regla de negocio, validación y comportamiento |
| [docs/analisis-tecnico.md](docs/analisis-tecnico.md) | Arquitectura, capas del sistema, riesgos y escenarios de evolución |
| [docs/plan-pruebas.md](docs/plan-pruebas.md) | Plan de pruebas funcionales y operativas |

Ese documento cubre:

- arquitectura completa
- lógica por módulo
- persistencia Excel
- riesgos y limitaciones
- prioridades de prueba
- recomendaciones de evolución futura

## Archivos que normalmente no deben versionarse

```text
data/settings.json
data/bonos_clientes.json
data/gastos_conceptos.json
data/prestamos_personas.json
data/movimientos_conceptos.json
data/contadores_items.json
data/startup_state.json
Contadores_*.xlsx
Consolidado_*.xlsx
~$*.xlsx
*.lock
```

## Scripts auxiliares

| Archivo | Función |
|---|---|
| `Instalar Caja.bat` | instalación rápida |
| `Iniciar Caja.bat` | inicio local |
| `Construir EXE.bat` | build del ejecutable usuario |
| `scripts/install_windows.ps1` | instalación detallada |
| `scripts/build_windows_exe.ps1` | build detallado del EXE usuario |
| `scripts/build_super_admin_exe.ps1` | build del EXE super admin |
| `CajaJDW.spec` | configuración PyInstaller — versión usuario |
| `CajaSuperAdmin.spec` | configuración PyInstaller — versión super admin |
| `launcher.py` | launcher para versión usuario |
| `launcher_super_admin.py` | launcher para versión super admin (activa `is_super_admin_build`) |

## Estado actual

El proyecto ya es usable como herramienta operativa diaria si se trabaja por sede y se acepta que el Excel sigue siendo la fuente principal.

Puntos auditados en esta versión:

- flujo local estable con launcher, instancia única y cierre automático por heartbeat
- comportamiento de cierre mejorado: un solo diálogo contextual (avisa sobre datos sin guardar si los hay), sin dobles confirmaciones; el evento `beforeunload` solo se activa si hay cambios pendientes y el cierre no fue iniciado desde el botón Finalizar
- configuración administrativa más completa, incluyendo estado inicial del sistema
- persistencia operativa en `Contadores_{sede}_{año}.xlsx` y consolidado en `Consolidado_{sede}_{año}.xlsx` (contiene Contadores y Cuadre)
- catálogos locales editables desde la propia app
- modo super admin con gestión de sedes remotas, edición/eliminación por fila en cualquier fecha y referencias de plataformas
- build dedicado `CajaSuperAdmin.exe` que arranca en modo super admin sin contraseña
- apertura de libros Excel directamente desde la interfaz (botón por módulo, abre en la hoja correspondiente)
- respaldos automáticos en super admin: copia periódica de los libros de cada sede a una carpeta central configurable, con rotación de los últimos 3 días, validación de integridad y log de resultados

Su siguiente límite natural, si crece la concurrencia o la exigencia de seguridad, será migrar la operación central a una base de datos y dejar Excel como respaldo o salida analítica.
