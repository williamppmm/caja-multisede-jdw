# caja-multisede-jdw

Aplicación local para registrar arqueos de caja por sede y guardarlos en un mismo libro anual de Excel compartido.

## Resumen

La interfaz corre en cada equipo de forma local, por ejemplo en `http://localhost:8000`.

Cada computador puede configurarse para:

- usar una sede distinta, como `Barbacoas`, `SanJose` o `Satinga`
- escribir en una hoja distinta dentro del mismo libro anual
- apuntar a una carpeta compartida, por ejemplo en Dropbox, donde viven archivos como `Caja_2026.xlsx`, `Caja_2027.xlsx`, etc.

Esto permite que varias sedes alimenten un mismo archivo por año, separadas por hoja, para luego consolidar información con Power Query u otros procesos contables.

## Qué hace

- Captura arqueos diarios desde una interfaz web local.
- Guarda la información en archivos anuales como `Caja_2026.xlsx`, `Caja_2027.xlsx`, etc.
- Permite configurar desde administración qué hoja del libro alimenta cada equipo.
- Permite configurar localmente la carpeta compartida donde se guardan o consultan los libros anuales.
- Si el libro todavía tiene la hoja antigua `RegistrosDiarios`, la app puede migrarla a la hoja configurada para la sede.
- Muestra un mensaje amigable si el archivo está ocupado al momento de guardar.

## Tecnologías

- Python
- FastAPI
- OpenPyXL
- Pydantic
- HTML, CSS y JavaScript

## Requisitos

- Python 3.11 o superior recomendado
- Acceso a la carpeta compartida donde estarán los archivos Excel
- Dependencias del proyecto instaladas con `pip`

## Instalación local

1. Clonar el repositorio o descargarlo como ZIP en una carpeta local del equipo.
2. Crear entorno virtual:

```bash
python -m venv .venv
```

3. Activar entorno virtual en Windows:

```bash
.venv\Scripts\activate
```

4. Instalar dependencias:

```bash
pip install -r requirements.txt
```

## Instalación rápida en Windows

Si prefieres dejar el equipo listo con doble clic:

1. Descargar o clonar este proyecto en una carpeta local.
2. Ejecutar `Instalar Caja.bat`.
3. El instalador:
   crea `.venv`,
   instala dependencias,
   y crea un acceso directo `Iniciar Caja` en el escritorio.

También puedes ejecutar directamente `scripts/install_windows.ps1` desde PowerShell.

## Opción recomendada para usuarios finales: EXE

Si el equipo no tiene Python y quieres evitar instalaciones manuales, la mejor opción es distribuir un ejecutable.

Flujo recomendado:

1. En un equipo de preparación, ejecutar `Instalar Caja.bat`.
2. Luego ejecutar `Construir EXE.bat`.
3. El ejecutable quedará en:

```text
dist\CajaJDW.exe
```

Ese archivo puede copiarse a otros equipos Windows para iniciar la capturadora sin instalar Python manualmente.

Al abrir el `.exe`, la aplicación levanta el servidor local y abre la interfaz en el navegador.

## Ejecución local

Iniciar el servidor:

```bash
uvicorn app.main:app --reload
```

Abrir en el navegador:

```text
http://localhost:8000
```

En Windows, después de instalar, también puedes usar `Iniciar Caja.bat`.

## Configuración inicial por equipo

Después de abrir la app:

1. Entrar al menú de administración.
2. Definir la sede o nombre de hoja que usará ese equipo.
3. Elegir la carpeta compartida donde viven los archivos anuales de Excel.

La configuración local se guarda en `settings.json`.

## Carpeta compartida y archivos anuales

La app no queda amarrada a un archivo fijo.

Si en administración configuras una carpeta como:

```text
C:\Users\Usuario\Dropbox\Contabilidad\Caja
```

entonces la aplicación usará automáticamente:

- `Caja_2026.xlsx` para registros del año 2026
- `Caja_2027.xlsx` para registros del año 2027
- y así sucesivamente

Esto permite conservar el histórico por año sin tener que cambiar la configuración cada enero, siempre que la carpeta siga siendo la misma.

## Uso con varias sedes

Ejemplo:

- Equipo 1: sede `Barbacoas`
- Equipo 2: sede `SanJose`
- Equipo 3: sede `Satinga`

Todos pueden apuntar a la misma carpeta compartida y al mismo archivo anual, pero cada uno escribirá en su propia hoja dentro del libro.

## Recomendación de despliegue

Se recomienda:

- dejar el código del proyecto en una carpeta local de cada equipo
- dejar los archivos Excel en la carpeta compartida de Dropbox
- no ejecutar el proyecto directamente dentro de la carpeta sincronizada

En otras palabras:

- el programa vive localmente en cada PC
- el libro Excel vive en la carpeta compartida

## Concurrencia y bloqueos

La app incluye un bloqueo local para evitar guardados simultáneos inmediatos en el mismo equipo o cuando el archivo está momentáneamente ocupado. En esos casos mostrará un mensaje pidiendo volver a intentar.

Aun así, si varios computadores escriben casi exactamente al mismo tiempo sobre un archivo sincronizado por Dropbox, puede existir riesgo de conflicto de sincronización porque no hay un servidor central coordinando escrituras. En operación normal esto debería ser poco frecuente, pero es importante tenerlo presente.

## Archivos que no se versionan

Este repositorio no incluye:

- `settings.json`
- archivos `*.xlsx`
- archivos temporales de Excel como `~$Caja_2026.xlsx`

## Estado actual

Actualmente la aplicación ya permite:

- capturar arqueos
- editar registros existentes
- configurar la sede por equipo
- configurar la carpeta compartida del Excel
- trabajar con libros anuales por año

## Archivos de apoyo para Windows

- `Instalar Caja.bat`: ejecuta el instalador con doble clic
- `Iniciar Caja.bat`: abre la capturadora local
- `Construir EXE.bat`: genera el ejecutable para distribución
- `scripts/install_windows.ps1`: instalador en PowerShell
- `scripts/build_windows_exe.ps1`: construye el `.exe` con PyInstaller
