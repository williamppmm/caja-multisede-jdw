# caja-multisede-jdw

Aplicación local para registrar arqueos de caja por sede en un mismo libro anual de Excel.

## Qué hace

- Captura arqueos diarios desde una interfaz web local.
- Guarda la información en archivos anuales como `Caja_2026.xlsx`, `Caja_2027.xlsx`, etc.
- Permite configurar desde administración qué hoja del libro alimenta cada equipo, por ejemplo `Barbacoas`, `SanJose` o `Satinga`.
- Mantiene separados los registros por sede dentro del mismo archivo para facilitar consolidación y consulta con Power Query.

## Tecnologías

- Python
- FastAPI
- OpenPyXL
- HTML, CSS y JavaScript

## Uso local

1. Crear y activar un entorno virtual.
2. Instalar dependencias:

```bash
pip install -r requirements.txt
```

3. Iniciar el servidor:

```bash
uvicorn app.main:app --reload
```

4. Abrir en el navegador:

```text
http://localhost:8000
```

## Notas

- La configuración de sede se guarda localmente por equipo en `settings.json`.
- Los libros de Excel y configuraciones locales no se versionan en este repositorio.
- Para operación compartida con Dropbox, se recomienda que cada equipo use su propia hoja configurada dentro del libro anual.
