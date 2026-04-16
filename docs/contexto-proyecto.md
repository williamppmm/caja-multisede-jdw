# Contexto del Proyecto — CajaJDW

## 1. Qué es hoy

CajaJDW es una aplicación local para captura diaria, consolidación y corrección operativa de caja por sede. Corre en Windows, sirve una interfaz web local en el navegador y persiste la información en archivos Excel anuales.

El proyecto ya no está en fase de “prototipo sobre Excel”. Hoy resuelve:

- captura guiada por módulo
- validaciones de negocio
- consolidación de cierres
- correcciones administrativas
- operación multisede en `main`
- builds distribuibles por rama

Excel sigue siendo la fuente de verdad, pero la operación ya ocurre sobre la aplicación.

## 2. Ramas activas

| Rama | Ejecutable final | Propósito |
|---|---|---|
| `main` | `CajaSuperAdmin.exe` | supervisión, auditoría, multisede, respaldos |
| `version-usuario` | `CajaJDW.exe` | captura operativa diaria |
| `respaldo-version-especial` | `CajaJDW.exe` | misma base de usuario, pero `Caja` y `Resumen` arrancan en `ayer()` durante la primera interacción |

Regla de trabajo:

- no asumir que un cambio de una rama aplica automáticamente a las otras
- evaluar siempre si el cambio es:
  - transversal
  - exclusivo de auditoría
  - exclusivo de operación

## 3. Arquitectura general

Capas principales:

- backend: FastAPI + Uvicorn
- frontend: HTML + CSS + JavaScript vanilla
- persistencia: OpenPyXL sobre archivos Excel
- empaquetado: PyInstaller
- sincronización entre equipos: Dropbox por carpeta de sede

## 4. Archivos principales del proyecto

```text
Caja/
├── launcher.py
├── launcher_super_admin.py
├── launcher_boot.py
├── CajaJDW.spec
├── CajaSuperAdmin.spec
├── app/
│   ├── main.py
│   ├── config.py
│   ├── runtime_paths.py
│   ├── models/
│   ├── routers/
│   └── services/
├── web/
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   └── assets/
└── docs/
```

## 5. Persistencia de datos

### Libros por sede y año

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

### Archivos auxiliares por sede

Viven junto a los Excel de la sede:

- `contadores_items.json`
- `contadores_pausas.json`
- `startup_state.json`

### Archivos locales del equipo

Viven en `data/`:

- `settings.json`
- `bonos_clientes.json`
- `gastos_conceptos.json`
- `prestamos_personas.json`
- `movimientos_conceptos.json`

## 6. Launcher y distribución

El arranque actual ya fue refinado.

Lo que hace hoy:

- splash de inicio
- instancia única real con mutex de Windows
- espera del servidor antes de abrir navegador
- evita pestañas duplicadas por múltiples clics

Archivo central:

- [launcher_boot.py](../launcher_boot.py)

## 7. Decisiones funcionales importantes ya fijadas

### Pausa en Contadores

La pausa ya no es un booleano global del catálogo.

Ahora:

- se persiste por fecha en `contadores_pausas.json`
- puede haber múltiples intervalos por ítem
- solo afecta al ítem pausado
- no debe contaminar fechas pasadas ni futuras

Semántica operativa:

- la fila sigue visible
- `Entradas` y `Salidas` se apoyan en la referencia vigente
- el resto de la tabla no se toca

### Referencia crítica

La referencia crítica sigue siendo la vía para resets técnicos, pero el microflujo de confirmación se simplificó:

- confirmación por `OK`
- sin exigir contraseña dentro del propio panel

La autorización general por fecha sigue siendo otra capa aparte cuando aplica.

### Cuadre y resincronización

El sistema ya resincroniza el `Cuadre` afectado cuando una corrección cambia datos de un período cerrado.

Además, si una corrección en `Caja` cambia la `base_nueva` de un cierre:

- también se resincroniza el siguiente `Cuadre`

Eso cubre la dependencia real:

- `base_nueva` de un cierre
- alimenta la `base_anterior` del siguiente

## 8. Diferencia entre Resumen y Cuadre

`Resumen`:

- agrupa y expone información del período
- sirve para revisión operativa
- no resuelve el balance físico contra teórico

`Cuadre`:

- sí hace el cierre contable del período
- parte de `base_anterior`
- calcula `caja_teorica`
- compara contra `caja_fisica`
- produce `diferencia`
- deja `base_nueva`

## 9. Estado por rama

### `main`

Incluye:

- multisede
- super admin
- edición/eliminación por registro
- referencias de plataformas
- respaldos automáticos
- resincronización de `Cuadre`
- cascada `Caja -> siguiente Cuadre`

### `version-usuario`

Incluye:

- flujo operativo de sede
- `Resumen`
- pausa refinada de `Contadores`
- resincronización de `Cuadre`
- cascada `Caja -> siguiente Cuadre`

### `respaldo-version-especial`

Base actualizada de `version-usuario` con una regla extra:

- en la primera interacción de la sesión:
  - `Caja` arranca en `ayer()`
  - `Resumen` también puede verse en `ayer()`
- al pasar a cualquier otro módulo, todo vuelve a `hoy()`

## 10. Límites actuales

- Excel compartido no escala bien como backend multiusuario fuerte
- Dropbox no resuelve concurrencia transaccional
- la operación depende del reloj local del equipo
- la capa de seguridad sigue siendo operativa, no de nivel corporativo

## 11. Evolución natural

La siguiente etapa lógica, si crece la operación, será:

- mantener Excel como respaldo o salida analítica
- migrar la operación central a una base de datos

Eso sería especialmente razonable cuando:

- aumente la concurrencia por sede
- haga falta trazabilidad más fuerte
- Dropbox deje de ser suficiente como infraestructura operativa
