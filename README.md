# CajaJDW — Capturadora Multimódulo

Aplicación local para registrar arqueos de caja, gastos, bonos y un prototipo funcional de contadores por sede, guardando un archivo anual independiente por cada sede.

## Qué hace

- Captura arqueos diarios de caja desde una interfaz web local.
- Registra gastos del día en hoja separada por sede.
- Registra bonos del día con nombre de cliente en hoja separada por sede.
- Registra préstamos a personas y pagos a cuenta, con saldo pendiente en tiempo real.
- Incluye un módulo local de Contadores para capturar Entradas, Salidas, Jackpot y Cancelled por ítem.
- Guarda la información en archivos anuales por sede: `Contadores_Barbacoas_2026.xlsx`.
- Soporte multi-sede: cada equipo configura su sede y escribe en su propio libro anual.
- Configura la carpeta compartida (ej. Dropbox) desde el panel de administración.
- Migra automáticamente hojas en formato antiguo (`RegistrosDiarios`) al nuevo esquema por sede.
- Muestra un mensaje claro si el archivo está ocupado al momento de guardar.
- Modo de ingreso configurable: por cantidad de billetes o por total por denominación.
- Corrección de registros existentes protegida por contraseña de administrador.
- Autocompletado de clientes (bonos) y conceptos (gastos) a partir de catálogos locales.

## Tecnologías

- Python + FastAPI
- OpenPyXL
- Pydantic
- HTML, CSS y JavaScript (sin dependencias externas de frontend)

## Estructura del proyecto

```
app/
  main.py                  # Punto de entrada FastAPI (factory)
  config.py                # Constantes, denominaciones y get_excel_path()
  runtime_paths.py         # Resolución de rutas (desarrollo / EXE)
  models/
    caja_models.py         # Modelos Pydantic de Caja, Gastos, Bonos y Préstamos
    contadores_models.py   # Modelos Pydantic de Contadores y catálogo de ítems
  routers/
    modules.py             # Endpoints /api/modulos/* (caja, gastos, bonos, préstamos, contadores)
    settings.py            # Endpoints /api/settings/* y /api/app/shutdown
  services/
    caja_service.py        # Lógica de negocio para caja, gastos y estado de módulos
    excel_service.py       # Lectura y escritura de Excel (openpyxl)
    settings_service.py    # Configuración local y diálogos de carpeta
    bonos_service.py       # Operaciones individuales sobre bonos
    prestamos_service.py   # Lógica de negocio para préstamos y pagos
    nombres_service.py     # Catálogos locales (clientes, personas y conceptos)
    contadores_service.py  # Catálogo, referencias y lógica de Contadores
web/
  index.html               # Interfaz principal
  app.js                   # Lógica de frontend
  styles.css               # Estilos
  assets/
    favicon.ico
launcher.py                # Arranca el servidor, detecta puerto libre y abre el navegador
CajaJDW.spec               # Configuración de PyInstaller para el EXE
```

## Requisitos

- Python 3.11 o superior
- Acceso a la carpeta compartida donde vivirán los archivos Excel anuales por sede

## Instalación local (desarrollo)

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

El EXE:
- Se construye a partir de `CajaJDW.spec`, que excluye paquetes no utilizados para reducir su tamaño.
- Al abrirse, levanta el servidor local automáticamente y abre la interfaz en el navegador.
- No requiere consola ni instalación adicional en el equipo de destino.
- Detecta automáticamente un puerto libre entre 8000 y 8009 si el predeterminado está ocupado.

## Ejecución en desarrollo

```bash
python launcher.py
```

O con recarga automática:

```bash
uvicorn app.main:app --reload
```

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

| Sede        | Archivo anual                          | Hojas internas (según módulos habilitados)                                             |
|-------------|----------------------------------------|----------------------------------------------------------------------------------------|
| Barbacoas   | `Contadores_Barbacoas_2026.xlsx`       | `CajaBarbacoas`, `GastosBarbacoas`, `BonosBarbacoas`, `PrestamosBarbacoas`, `ContadoresBarbacoas` |
| SanJose     | `Contadores_SanJose_2026.xlsx`         | `CajaSanJose`, `GastosSanJose`, `BonosSanJose`, `PrestamosSanJose`, `ContadoresSanJose` |
| Satinga     | `Contadores_Satinga_2026.xlsx`         | `CajaSatinga`, `GastosSatinga`, `BonosSatinga`, `PrestamosSatinga`, `ContadoresSatinga` |

Esto facilita consolidar información con Power Query u otros procesos contables y reduce conflictos de sincronización entre sedes.

## Módulos disponibles

| Módulo         | Descripción                                                        | Restricción de fecha                               |
|----------------|--------------------------------------------------------------------|----------------------------------------------------||
| **Caja**       | Arqueo de billetes + monedas + ventas informativas                 | Requiere admin para corregir una fecha ya guardada |
| **Gastos**     | Lista de gastos del día con concepto y valor                       | Hoy sin restricción; otro día requiere admin       |
| **Bonos**      | Lista de bonos del día con cliente y valor                         | Hoy sin restricción; otro día requiere admin       |
| **Préstamos**  | Registro de préstamos a personas y pagos asociados; saldo en tiempo real | Solo fecha actual sin restricción; otro día requiere admin |
| **Contadores** | Captura por ítem de Entradas, Salidas, Jackpot y Cancelled         | Requiere admin para corregir una fecha ya guardada |

## Catálogos locales

La app mantiene archivos locales en el mismo directorio que el EXE (o raíz del proyecto en desarrollo):

| Archivo                                  | Contenido                                         |
|------------------------------------------|---------------------------------------------------|
| `bonos_clientes.json`                    | Nombres de clientes para bonos                    |
| `gastos_conceptos.json`                  | Conceptos usados en gastos                        |
| `prestamos_personas.json`                | Nombres de personas para préstamos                |
| `contadores_items.json`                  | Catálogo de ítems de Contadores                   |
| `settings.json`                          | Configuración local del equipo                    |

Estos archivos se actualizan automáticamente al usar la app. Son locales a cada equipo y no se comparten por Dropbox.

## Concurrencia y bloqueos

La app incluye un bloqueo de archivo para evitar guardados simultáneos en el mismo equipo. Al usar un archivo distinto por sede, el riesgo de conflicto por Dropbox baja mucho. Aun así, si dos personas de la misma sede escriben sobre el mismo archivo al mismo tiempo, sigue existiendo posibilidad de conflicto porque no hay un servidor central coordinando escrituras.

## Archivos que no se versionan

```
settings.json
bonos_clientes.json
gastos_conceptos.json
prestamos_personas.json
contadores_items.json
*.xlsx
~$*.xlsx          # Archivos temporales de Excel
*.lock
```

## Archivos de apoyo en Windows

| Archivo                          | Función                                                  |
|----------------------------------|----------------------------------------------------------|
| `Instalar Caja.bat`              | Crea el entorno virtual e instala todo                   |
| `Iniciar Caja.bat`               | Abre la capturadora local (modo desarrollo)              |
| `Construir EXE.bat`              | Genera `dist\CajaJDW.exe` usando `CajaJDW.spec`          |
| `scripts/install_windows.ps1`    | Instalador detallado en PowerShell                       |
| `scripts/build_windows_exe.ps1`  | Construye el EXE con PyInstaller usando el spec          |
| `CajaJDW.spec`                   | Configuración del EXE: exclusiones, recursos y optimización |
