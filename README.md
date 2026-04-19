# CajaJDW

Aplicación local para registrar operación diaria de caja por sede, persistirla en libros Excel anuales y reducir la edición manual directa sobre Excel.

La app sigue usando Excel como fuente de verdad operativa, pero ya centraliza captura, validación, consolidación, corrección y cierre desde una interfaz web local mucho más controlada.

## Estado actual por ramas

| Rama | Rol principal | Ejecutable | Launcher | Spec versionado en esa rama |
|---|---|---|---|---|
| `main` | super admin / multisede | `CajaSuperAdmin.exe` | `launcher_super_admin.py` | `CajaSuperAdmin.spec` |
| `version-usuario` | operación diaria por sede | `CajaJDW.exe` | `launcher.py` | `CajaJDW.spec` |
| `respaldo-version-especial` | variante operativa con arranque en `ayer()` | `CajaJDW.exe` | `launcher.py` | `CajaJDW.spec` |

La convención actual es mantener **un solo `.spec` y un solo `.exe` final por rama**.

## Qué resuelve hoy

- Captura diaria de `Caja`, `Plataformas`, `Gastos`, `Bonos`, `Préstamos`, `Movimientos` y `Contadores`.
- Cálculo y guardado de `Cuadre`.
- `Resumen` operativo en `version-usuario` y `respaldo-version-especial`.
- Catálogos editables desde la propia aplicación.
- Arranque refinado con:
  - instancia única
  - splash de inicio
  - espera correcta antes de abrir navegador
  - sin pestañas duplicadas por múltiples clics
- Persistencia anual por sede.
- Soporte multisede, referencias externas de plataformas y respaldos automáticos en `main`.

## Arranque y launcher

Los builds actuales ya no dependen del arranque “ciego” original.

El launcher compartido:

- evita doble instancia real con mutex de Windows
- muestra splash de inicio
- espera a que el servidor local esté listo antes de abrir el navegador
- reduce clics repetidos sin sentido durante el arranque

Archivo central:

- [launcher_boot.py](launcher_boot.py)

Entrypoints por variante:

- [launcher.py](launcher.py)
- [launcher_super_admin.py](launcher_super_admin.py)

## Persistencia y archivos por sede

Por sede y año se generan dos libros:

- `Contadores_{sede}_{año}.xlsx`
- `Consolidado_{sede}_{año}.xlsx`

Distribución actual:

- `Contadores_{sede}_{año}.xlsx`
  - Caja
  - Plataformas
  - Gastos
  - Bonos
  - Préstamos
  - Movimientos

- `Consolidado_{sede}_{año}.xlsx`
  - Contadores
  - Cuadre

Archivos auxiliares por sede:

- `contadores_items.json`
- `contadores_pausas.json`
- `startup_state.json`

Catálogos locales del equipo:

- `data/settings.json`
- `data/bonos_clientes.json`
- `data/gastos_conceptos.json`
- `data/prestamos_personas.json`
- `data/movimientos_conceptos.json`

## Resumen y Cuadre

`Resumen`:

- consolida y expone los datos del período
- sirve para lectura operativa
- no hace balance físico vs teórico
- hoy está disponible en `version-usuario` y `respaldo-version-especial`

`Cuadre`:

- sí balancea ingresos, egresos y caja física
- usa `base_anterior`
- calcula `caja_teorica`
- compara contra `caja_fisica`
- genera `diferencia`
- define `base_nueva`

Y esa `base_nueva` alimenta el siguiente cierre.

## Contadores y pausa por fecha

`Contadores` dejó de manejar la pausa como un booleano global del catálogo.

Hoy la pausa se guarda por fecha en:

- `contadores_pausas.json`

Eso permite:

- múltiples ciclos de pausa por ítem
- no contaminar fechas pasadas
- no afectar otros ítems

Semántica actual:

- la fila sigue visible
- `Entradas` y `Salidas` pueden apoyarse en la referencia vigente
- `Jackpot` mantiene su propia lógica
- el ítem no desaparece de la tabla

## Seguridad y contraseñas

Las contraseñas del frontend **no son seguridad fuerte**.

Su propósito actual es:

- restricción operativa básica
- alertar que se está intentando corregir en una fecha que no corresponde
- reducir edición accidental fuera del flujo esperado

No deben interpretarse como autenticación robusta de nivel backend o corporativo.

## Riesgo operativo real: Excel y locking

La app usa locking local y validaciones para reducir choques de escritura, pero el backend sigue dependiendo de Excel como fuente operativa.

Eso implica límites reales:

- no hay transacciones como en una base de datos
- Dropbox / OneDrive no resuelven concurrencia fuerte por sí solos
- si dos equipos de la misma sede escriben el mismo libro casi al mismo tiempo, sigue existiendo riesgo operativo

En otras palabras:

- la app ya mitiga parte del problema
- pero Excel compartido sigue siendo un backend frágil bajo concurrencia real

## Build y `.spec`

El `.spec` forma parte del proceso oficial de empaquetado y **debe existir en la rama que produce ese ejecutable**.

### En `main`

- [CajaSuperAdmin.spec](CajaSuperAdmin.spec)
- build esperado: `CajaSuperAdmin.exe`

### En `version-usuario` y `respaldo-version-especial`

- `CajaJDW.spec`
- build esperado: `CajaJDW.exe`

Si se clona una rama en otro equipo, el `.spec` correcto de esa rama debe venir ya en el repositorio y no recrearse a mano.

## Instalación y desarrollo

### Desarrollo

Super admin (`main`):

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python launcher_super_admin.py
```

Usuario (`version-usuario`):

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python launcher.py
```

### Instalación rápida

```text
Instalar Caja.bat
```

### Builds

Super admin:

```powershell
.\.venv\Scripts\python.exe -m PyInstaller CajaSuperAdmin.spec --clean
```

Usuario:

```powershell
.\.venv\Scripts\python.exe -m PyInstaller CajaJDW.spec --clean
```

## Scripts principales

| Archivo | Función |
|---|---|
| `launcher_boot.py` | arranque compartido |
| `launcher.py` | arranque de usuario |
| `launcher_super_admin.py` | arranque de super admin |
| `CajaSuperAdmin.spec` | build de `main` |
| `Instalar Caja.bat` | instalación rápida |
| `Construir EXE.bat` | build rápido disponible en la variante operativa |

## Limitaciones actuales

- Excel sigue siendo la fuente de verdad operativa.
- La concurrencia distribuida sigue siendo limitada.
- La seguridad sigue siendo operativa, no robusta.
- `app.js` y `excel_service.py` todavía concentran bastante responsabilidad.

## Evolución natural

La app ya justificó el salto de trabajar directo en Excel a trabajar sobre una aplicación.

El siguiente salto lógico, si crece la operación, es:

- dejar Excel como respaldo o salida analítica
- y mover la operación central a una base de datos

Eso tendrá sentido cuando:

- aumente la concurrencia por sede
- haga falta mejor trazabilidad
- Excel compartido deje de ser suficiente

## Documentación adicional

- [docs/especificacion-funcional.md](docs/especificacion-funcional.md)
- [docs/analisis-tecnico.md](docs/analisis-tecnico.md)
- [docs/plan-pruebas.md](docs/plan-pruebas.md)
