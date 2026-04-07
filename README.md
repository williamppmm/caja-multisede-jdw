# CajaJDW — Capturadora Multimódulo

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

- `Caja_{sede}_{año}.xlsx` — módulos operativos (Caja, Plataformas, Gastos, Bonos, Préstamos, Movimientos, Contadores)
- `Consolidado_{sede}_{año}.xlsx` — cuadres del período

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

También puedes usar:

```powershell
scripts/install_windows.ps1
```

### Construcción del EXE

1. Ejecutar `Instalar Caja.bat`.
2. Ejecutar `Construir EXE.bat`.
3. El ejecutable quedará en `dist\CajaJDW.exe`.

Características del EXE:

- abre el servidor local automáticamente
- abre la interfaz en el navegador
- no requiere consola visible
- detecta un puerto libre entre 8000 y 8009
- instancia única: si ya está corriendo, el segundo clic solo abre el navegador sin iniciar un servidor nuevo
- se apaga automáticamente si el navegador se cierra (watchdog de 75 s sin heartbeat)

## Configuración inicial por equipo

Después de abrir la app:

1. Entrar a Administración.
2. Definir la sede.
3. Elegir la carpeta donde se guardarán los libros.
4. Seleccionar los módulos habilitados.
5. Elegir el módulo por defecto si aplica.

La configuración se guarda en `settings.json`.

## Módulos disponibles

| Módulo | Uso principal | Regla de edición |
|---|---|---|
| `Caja` | Arqueo físico del día | si la fecha ya existe, requiere admin |
| `Plataformas` | Ventas de plataformas | fecha actual libre, otra fecha requiere admin |
| `Gastos` | Egresos del día | fecha actual libre, otra fecha requiere admin |
| `Bonos` | Bonos por cliente | fecha actual libre, otra fecha requiere admin |
| `Prestamos` | Préstamos y pagos | fecha actual libre, otra fecha requiere admin |
| `Movimientos` | Ingresos y salidas extraordinarias | fecha actual libre, otra fecha requiere admin |
| `Contadores` | Captura por ítem con referencias | si la fecha ya existe, requiere admin |
| `Cuadre` | Consolidación del período | si ya existe, corregir requiere admin |

## Catálogos locales

La app mantiene catálogos JSON por equipo:

- `bonos_clientes.json`
- `gastos_conceptos.json`
- `prestamos_personas.json`
- `movimientos_conceptos.json`
- `contadores_items.json`
- `settings.json`

Estos archivos son locales y no se comparten por Dropbox.

## Uso con varias sedes

Cada sede debe escribir en su propio libro anual.

Ventajas:

- reduce conflictos
- facilita consolidación
- mantiene el libro más claro para revisión manual

Ejemplo:

| Sede | Operativo | Cuadres |
|---|---|---|
| Barbacoas | `Caja_Barbacoas_2026.xlsx` | `Consolidado_Barbacoas_2026.xlsx` |
| SanJose | `Caja_SanJose_2026.xlsx` | `Consolidado_SanJose_2026.xlsx` |
| Satinga | `Caja_Satinga_2026.xlsx` | `Consolidado_Satinga_2026.xlsx` |

## Límite importante con Dropbox

La app usa un bloqueo local `.lock` para reducir guardados simultáneos en el mismo equipo, pero no tiene coordinación central entre varios equipos.

Eso significa:

- funciona bien si cada sede trabaja sobre su propio archivo
- puede haber conflictos si dos equipos de la misma sede escriben el mismo libro casi al mismo tiempo

## Compatibilidad actual

- objetivo principal: Windows
- Linux: posible a futuro, pero todavía no es prioridad ni está completamente preparado

## Documentación técnica

El análisis técnico completo del proyecto quedó separado aquí:

[docs/analisis-tecnico.md](docs/analisis-tecnico.md)

Ese documento cubre:

- arquitectura completa
- lógica por módulo
- persistencia Excel
- riesgos y limitaciones
- prioridades de prueba
- recomendaciones de evolución futura

## Archivos que normalmente no deben versionarse

```text
settings.json
bonos_clientes.json
gastos_conceptos.json
prestamos_personas.json
movimientos_conceptos.json
contadores_items.json
startup_state.json
Caja_*.xlsx
Consolidado_*.xlsx
~$*.xlsx
*.lock
```

## Scripts auxiliares

| Archivo | Función |
|---|---|
| `Instalar Caja.bat` | instalación rápida |
| `Iniciar Caja.bat` | inicio local |
| `Construir EXE.bat` | build del ejecutable |
| `scripts/install_windows.ps1` | instalación detallada |
| `scripts/build_windows_exe.ps1` | build detallado del EXE |
| `CajaJDW.spec` | configuración de PyInstaller |

## Estado actual

El proyecto ya es usable como herramienta operativa diaria si se trabaja por sede y se acepta que el Excel sigue siendo la fuente principal.

Su siguiente límite natural, si crece la concurrencia o la exigencia de seguridad, será migrar la operación central a una base de datos y dejar Excel como respaldo o salida analítica.
