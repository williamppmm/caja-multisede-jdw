# CajaJDW — Capturadora Multimódulo

Aplicación local para registrar arqueos de caja, gastos y bonos por sede, guardando un archivo anual independiente por cada sede.

## Qué hace

- Captura arqueos diarios de caja desde una interfaz web local.
- Registra gastos del día en hoja separada por sede.
- Registra bonos del día en hoja separada por sede.
- Guarda la información en archivos anuales por sede, como `Contadores_Barbacoas_2026.xlsx`.
- Soporte multi-sede: cada equipo configura su sede y escribe en su propio libro anual.
- Configura la carpeta compartida (ej. Dropbox) desde el panel de administración.
- Migra automáticamente hojas en formato antiguo (`RegistrosDiarios`) al nuevo esquema por sede.
- Muestra un mensaje claro si el archivo está ocupado al momento de guardar.
- Modo de ingreso configurable: por cantidad de billetes o por total por denominación.
- Corrección de registros existentes protegida por contraseña de administrador.

## Tecnologías

- Python + FastAPI
- OpenPyXL
- Pydantic
- HTML, CSS y JavaScript (sin dependencias externas de frontend)

## Estructura del proyecto

```
app/
  main.py                  # Punto de entrada FastAPI (factory)
  config.py                # Constantes y rutas globales
  runtime_paths.py         # Resolución de rutas (desarrollo / EXE)
  models/
    caja_models.py         # Modelos Pydantic de entrada y respuesta
  routers/
    modules.py             # Endpoints /api/modulos/* (caja, gastos, bonos)
    settings.py            # Endpoints /api/settings/* y /api/app/shutdown
  services/
    caja_service.py        # Lógica de negocio para caja y módulos de items
    excel_service.py       # Lectura y escritura de Excel (openpyxl)
    settings_service.py    # Configuración local y diálogos de archivo
    bonos_service.py       # Operaciones individuales sobre bonos
    nombres_service.py     # Registro de nombres de clientes para autocompletar
web/
  index.html               # Interfaz principal
  app.js                   # Lógica de frontend
  styles.css               # Estilos
  assets/
    favicon.ico
launcher.py                # Arranca el servidor y abre el navegador
```

## Requisitos

- Python 3.11 o superior
- Acceso a la carpeta compartida donde vivirán los archivos Excel anuales por sede

## Instalación local

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
```

## Instalación rápida en Windows

1. Descargar o clonar el proyecto en una carpeta local.
2. Ejecutar `Instalar Caja.bat` con doble clic.
   - Crea `.venv`, instala dependencias y crea el acceso directo `Iniciar Caja` en el escritorio.

También puedes ejecutar directamente `scripts/install_windows.ps1` desde PowerShell.

## Distribuir como EXE (sin Python)

Para equipos sin Python instalado:

1. En un equipo de preparación, ejecutar `Instalar Caja.bat`.
2. Luego ejecutar `Construir EXE.bat`.
3. El ejecutable quedará en `dist\CajaJDW.exe`.

Ese archivo puede copiarse a otros equipos Windows. Al abrirlo levanta el servidor local y abre la interfaz en el navegador.

## Ejecución en desarrollo

```bash
uvicorn app.main:app --reload
```

Abrir en el navegador: `http://localhost:8000`

En Windows, después de instalar, también puedes usar `Iniciar Caja.bat`.

## Configuración inicial por equipo

Después de abrir la app por primera vez:

1. Entrar al menú de administración (ícono ⚙ en la esquina superior derecha).
2. Definir la **sede** que usará ese equipo (ej. `Barbacoas`).
3. Elegir la carpeta donde se crearán los archivos anuales por sede.
4. Seleccionar los módulos a habilitar (Caja, Gastos, Bonos).

La configuración se guarda en `settings.json` localmente en cada equipo.

## Archivos anuales y carpeta compartida

La app genera un archivo por año y por sede dentro de la carpeta configurada:

```
C:\Users\Usuario\Dropbox\Contabilidad\Caja\
  Contadores_Barbacoas_2025.xlsx
  Contadores_Barbacoas_2026.xlsx
  Contadores_Magui_2026.xlsx
  ...
```

El año se toma automáticamente de la fecha del registro, por lo que al cambiar de año no se necesita hacer nada.

## Uso con varias sedes

Cada equipo configura una sede distinta. Todos pueden apuntar a la misma carpeta compartida, pero cada uno escribirá en su propio archivo anual:

| Sede        | Archivo anual                          | Hojas internas |
|-------------|-----------------------------------------|----------------|
| Barbacoas   | `Contadores_Barbacoas_2026.xlsx`        | `CajaBarbacoas`, `GastosBarbacoas`, `BonosBarbacoas` |
| SanJose     | `Contadores_SanJose_2026.xlsx`          | `CajaSanJose`, `GastosSanJose`, `BonosSanJose` |
| Satinga     | `Contadores_Satinga_2026.xlsx`          | `CajaSatinga`, `GastosSatinga`, `BonosSatinga` |

Esto facilita consolidar información con Power Query u otros procesos contables y reduce conflictos de sincronización entre sedes.

## Módulos disponibles

| Módulo   | Descripción                                          | Restricción de fecha            |
|----------|------------------------------------------------------|---------------------------------|
| **Caja** | Arqueo de billetes + monedas + ventas informativas   | Requiere admin para corregir    |
| **Gastos** | Lista de gastos del día con concepto y valor       | Hoy sin restricción; otro día requiere admin |
| **Bonos**  | Lista de bonos del día con cliente y valor         | Hoy sin restricción; otro día requiere admin |

## Concurrencia y bloqueos

La app incluye un bloqueo de archivo para evitar guardados simultáneos en el mismo equipo. Al usar un archivo distinto por sede, el riesgo de conflicto por Dropbox baja mucho. Aun así, si dos personas de la misma sede escriben sobre el mismo archivo al mismo tiempo, sigue existiendo posibilidad de conflicto porque no hay un servidor central coordinando escrituras.

## Archivos que no se versionan

```
settings.json
*.xlsx
~$*.xlsx          # Archivos temporales de Excel
bonos_clientes.json
```

## Archivos de apoyo en Windows

| Archivo                          | Función                                     |
|----------------------------------|---------------------------------------------|
| `Instalar Caja.bat`              | Crea el entorno virtual e instala todo      |
| `Iniciar Caja.bat`               | Abre la capturadora local                   |
| `Construir EXE.bat`              | Genera `dist\CajaJDW.exe` con PyInstaller   |
| `scripts/install_windows.ps1`    | Instalador en PowerShell                    |
| `scripts/build_windows_exe.ps1`  | Construye el EXE con PyInstaller            |
