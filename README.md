# CajaJDW

Aplicacion local para registrar operacion diaria de caja por sede, persistirla en libros Excel anuales y reducir la edicion manual directa sobre Excel.

La app sigue usando Excel como fuente de verdad operativa, pero ya centraliza captura, validacion, consolidacion, correccion y cierre desde una interfaz web local mucho mas controlada.

## Estado actual por ramas

| Rama | Rol principal | Ejecutable | Launcher | Spec versionado en esa rama |
|---|---|---|---|---|
| `main` | super admin / multisede | `CajaSuperAdmin.exe` | `launcher_super_admin.py` | `CajaSuperAdmin.spec` |
| `version-usuario` | operacion diaria por sede | `CajaJDW.exe` | `launcher.py` | `CajaJDW.spec` |
| `respaldo-version-especial` | variante operativa con arranque en `ayer()` | `CajaJDW.exe` | `launcher.py` | `CajaJDW.spec` |

La convencion actual es mantener un solo `.spec` y un solo `.exe` final por rama.

## Que resuelve hoy

- Captura diaria de `Caja`, `Plataformas`, `Gastos`, `Bonos`, `Prestamos`, `Movimientos` y `Contadores`.
- Calculo y guardado de `Cuadre`.
- `Resumen` operativo en `version-usuario` y `respaldo-version-especial`.
- Catalogos editables desde la propia aplicacion.
- Arranque refinado con instancia unica, splash y espera correcta antes de abrir navegador.
- Persistencia anual por sede.
- Soporte multisede, referencias externas de plataformas y respaldos automaticos en `main`.
- Autocompletado por coincidencia exacta, prefijo y fuzzy en modulos con catalogo.
- Normalizacion de clientes y personas como NomPropios en Bonos y Prestamos.
- Panel de recaudo para sedes que separan monedas y billetes viejos de la base operativa.
- Ciclo visible de `Prestamos`: muestra el ciclo activo completo por persona; en el dia de cierre, las filas saldadas se muestran con tachado y desaparecen al dia siguiente.
- Edicion y eliminacion historica sin restriccion de fecha en `main` (super admin con sede activa puede operar cualquier fecha con registros).
- Preservacion de inputs de `Contadores` al pausar o reactivar una maquina.
- `config_operativa.json` por sede controla `excluir_monedas_viejos_base` de forma independiente al `settings.json` local.

## Estructura principal

```text
app/
  config.py
  main.py
  runtime_paths.py
  models/
  routers/
  services/
web/
  index.html
  app.js
  styles.css
  assets/
scripts/
  install_windows.ps1
  build_windows_exe.ps1
docs/
  especificacion-funcional.md
  analisis-tecnico.md
  plan-pruebas.md
data/                         <- archivos locales del equipo (no versionados)
launcher.py
launcher_boot.py
launcher_super_admin.py
CajaJDW.spec
CajaSuperAdmin.spec
Instalar Caja.bat
Iniciar Caja.bat
Construir EXE.bat
README.md
requirements.txt
```

## Arranque y launcher

El launcher compartido:

- evita doble instancia real con mutex de Windows
- muestra splash de inicio
- espera a que el servidor local este listo antes de abrir el navegador
- reduce clics repetidos sin sentido durante el arranque

Archivo central:

- [launcher_boot.py](C:\Users\User\Desktop\Caja\launcher_boot.py)

Entrypoints por variante:

- [launcher.py](C:\Users\User\Desktop\Caja\launcher.py)
- [launcher_super_admin.py](C:\Users\User\Desktop\Caja\launcher_super_admin.py)

## Persistencia y archivos por sede

Por sede y ano se generan dos libros:

- `Contadores_{sede}_{ano}.xlsx`
- `Consolidado_{sede}_{ano}.xlsx`

Distribucion actual:

- `Contadores_{sede}_{ano}.xlsx`
  - Caja
  - Plataformas
  - Gastos
  - Bonos
  - Prestamos
  - Movimientos
  - Contadores

- `Consolidado_{sede}_{ano}.xlsx`
  - Cuadre

Archivos auxiliares por sede:

- `contadores_items.json`
- `contadores_pausas.json`
- `startup_state.json`
- `config_operativa.json`
- `recaudo_ciclos.json` cuando la sede usa recaudo separado

Catalogos locales del equipo:

- `data/settings.json`
- `data/bonos_clientes.json`
- `data/gastos_conceptos.json`
- `data/prestamos_personas.json`
- `data/movimientos_conceptos.json`

Importante:

- los JSON en `data/` son locales y no se comparten por Dropbox
- `config_operativa.json` y `recaudo_ciclos.json` viven junto a los Excel de la sede, asi que si son compartidos por usuario y super admin

## Resumen y Cuadre

`Resumen`:

- consolida y expone los datos del periodo
- sirve para lectura operativa
- no hace balance fisico vs teorico
- hoy esta disponible en `version-usuario` y `respaldo-version-especial`

`Cuadre`:

- si balancea ingresos, egresos y caja fisica
- usa `base_anterior`
- calcula `caja_teorica`
- compara contra `caja_fisica`
- genera `diferencia`
- define `base_nueva`

En sedes con `excluir_monedas_viejos_base: true` en `config_operativa.json`, la `base_nueva` excluye `total_monedas` y `billetes_viejos`, y esa misma regla debe verse igual en `version-usuario`, `main` y `respaldo-version-especial`.

## Recaudo por monedas y billetes viejos

Cuando una sede separa monedas y billetes viejos del siguiente ciclo:

- `Caja fisica` sigue contando esos valores para el cierre del dia
- `Base nueva` puede excluirlos si la sede lo define en `config_operativa.json`
- el sistema muestra un panel de recaudo en `Caja`
- el estado del ciclo se guarda en `recaudo_ciclos.json`

En `version-usuario` el panel es informativo.

En `main`, super admin puede:

- registrar entregas
- cerrar ciclos

## Respaldos automaticos

Solo en `main` (super admin). Cuando se configura una carpeta de backup:

- se dispara automaticamente 10 minutos despues del arranque
- se repite cada 4 horas
- por cada sede remota registrada copia los `.xlsx` y los JSON auxiliares
- conserva los ultimos 3 dias por sede (elimina lo anterior)
- los archivos se validan antes de copiar (openpyxl + JSON parse)
- tambien se puede disparar manualmente desde la interfaz

## Contadores y pausa por fecha

`Contadores` dejo de manejar la pausa como un booleano global del catalogo.

Hoy la pausa se guarda por fecha en:

- `contadores_pausas.json`

Eso permite:

- multiples ciclos de pausa por item
- no contaminar fechas pasadas
- no afectar otros items

## Seguridad y contrasenas

Las contrasenas del frontend no son seguridad fuerte.

Su proposito actual es:

- restriccion operativa basica
- alertar que se esta intentando corregir en una fecha que no corresponde
- reducir edicion accidental fuera del flujo esperado

## Riesgo operativo real: Excel y locking

La app usa locking local y validaciones para reducir choques de escritura, pero el backend sigue dependiendo de Excel como fuente operativa.

Eso implica limites reales:

- no hay transacciones como en una base de datos
- Dropbox / OneDrive no resuelven concurrencia fuerte por si solos
- si dos equipos de la misma sede escriben el mismo libro casi al mismo tiempo, sigue existiendo riesgo operativo

## Build y `.spec`

El `.spec` forma parte del proceso oficial de empaquetado y debe existir en la rama que produce ese ejecutable.

### En `main`

- [CajaSuperAdmin.spec](C:\Users\User\Desktop\Caja\CajaSuperAdmin.spec)
- build esperado: `CajaSuperAdmin.exe`

### En `version-usuario` y `respaldo-version-especial`

- `CajaJDW.spec`
- build esperado: `CajaJDW.exe`

## Instalacion y desarrollo

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

Con recarga automatica:

```powershell
uvicorn app.main:app --reload
```

### Instalacion rapida en Windows

1. Descargar o clonar el proyecto.
2. Ejecutar `Instalar Caja.bat`.

Tambien puedes usar:

```powershell
scripts/install_windows.ps1
```

### Construccion del EXE

Super admin:

```powershell
.\.venv\Scripts\python.exe -m PyInstaller CajaSuperAdmin.spec --clean
```

Usuario:

```powershell
.\.venv\Scripts\python.exe -m PyInstaller CajaJDW.spec --clean
```

## Modelo de ramas

Cada rama es una version de produccion con su propio proposito, ejecutable y `.spec`. No son feature branches temporales — son versiones activas en paralelo.

| Rama | Version | Para quien |
|---|---|---|
| `main` | Super admin | Auditor, opera multisede, corrige registros historicos |
| `version-usuario` | Operativa diaria | Caja de la sede, captura del dia |
| `respaldo-version-especial` | Variante operativa | Igual a `version-usuario` pero arranca en `ayer()` |

Las ramas se retroalimentan entre ellas: una mejora de logica en una rama (ciclo de prestamos, pausa de contadores, preservacion de inputs, validacion de saldo con fecha) se evalua y porta a las demas cuando aplica. El criterio es si el cambio es transversal, exclusivo de auditoria, o exclusivo de operacion diaria.

Regla de trabajo: no asumir que un cambio de una rama aplica automaticamente a las otras. Evaluar siempre antes de portar.

## Limitaciones actuales

- Excel sigue siendo la fuente de verdad operativa.
- La concurrencia distribuida sigue siendo limitada.
- La seguridad sigue siendo operativa, no robusta.

## Evolucion natural

La app ya justifico el salto de trabajar directo en Excel a trabajar sobre una aplicacion.

El siguiente salto logico, si crece la operacion, es:

- dejar Excel como respaldo o salida analitica
- y mover la operacion central a una base de datos

## Documentacion adicional

- [docs/especificacion-funcional.md](C:\Users\User\Desktop\Caja\docs\especificacion-funcional.md)
- [docs/analisis-tecnico.md](C:\Users\User\Desktop\Caja\docs\analisis-tecnico.md)
- [docs/plan-pruebas.md](C:\Users\User\Desktop\Caja\docs\plan-pruebas.md)
