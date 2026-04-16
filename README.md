# CajaJDW

Aplicación local para registrar operación diaria de caja por sede, persistirla en libros Excel anuales y consolidar cierres con una interfaz mucho más manejable que trabajar directo sobre Excel.

El sistema sigue usando Excel como fuente de verdad operativa, pero ya resuelve buena parte de la captura, validación, consolidación y corrección desde la propia app. Ese salto ya es importante: la operación deja de depender de fórmulas manuales y de edición directa de hojas, aunque el archivo siga siendo el respaldo natural y la salida analítica para Power Query.

## Estado actual

- `main` es la versión super admin.
- `version-usuario` es la versión operativa de sede.
- `respaldo-version-especial` parte de `version-usuario`, pero arranca `Caja` y `Resumen` en `ayer()` durante la primera interacción de la sesión.

## Ejecutables por rama

| Rama | Ejecutable final | Puerto | Uso |
|---|---|---:|---|
| `main` | `CajaSuperAdmin.exe` | 8001 | supervisión, auditoría, multisede, respaldos |
| `version-usuario` | `CajaJDW.exe` | 8000 | captura operativa diaria |
| `respaldo-version-especial` | `CajaJDW.exe` | 8000 | cierre en la mañana del día anterior |

La convención actual es mantener **un solo `.exe` final por rama**.

## Qué resuelve hoy

- Captura diaria de `Caja`, `Plataformas`, `Gastos`, `Bonos`, `Préstamos`, `Movimientos` y `Contadores`.
- Cálculo y guardado de `Cuadre`.
- `Resumen` operativo en la versión usuario.
- Catálogos editables desde la propia aplicación.
- Arranque amigable con:
  - instancia única
  - splash de inicio
  - espera correcta antes de abrir el navegador
  - sin pestañas duplicadas por múltiples clics
- Persistencia en Excel por sede y año.
- Soporte multisede, referencias externas de plataformas y respaldos automáticos en `main`.

## Cambios importantes ya incorporados

### 1. Launcher refinado

Los builds actuales ya no dependen del arranque “ciego” original.

El launcher ahora:

- evita doble instancia real con mutex de Windows
- evita pestañas duplicadas durante el arranque
- espera a que el servidor esté listo antes de abrir el navegador
- usa splash nativo de PyInstaller

Archivo compartido:

- [launcher_boot.py](launcher_boot.py)

Entrypoints:

- [launcher.py](launcher.py)
- [launcher_super_admin.py](launcher_super_admin.py)

## 2. Contadores más operable

`Contadores` dejó de ser un formulario rígido y se volvió más fiel a la operación real.

### Pausa por fecha

La pausa ya no es un booleano global del catálogo. Ahora se guarda por fecha en:

- `contadores_pausas.json`

Eso permite:

- múltiples pausas por ítem
- no contaminar fechas pasadas
- no afectar otros ítems

### Semántica actual de pausa

La pausa no “elimina” la fila.

Mientras un ítem está pausado en una fecha:

- la fila sigue visible
- `Entradas` y `Salidas` se cargan con la referencia vigente
- `Jackpot` sigue su lógica normal
- el resultado cae por aritmética natural
- el resto de la tabla no se toca

### Referencia crítica y pausa con confirmación simple

Los microflujos de:

- referencia crítica
- pausa / reactivación

ya no exigen contraseña dentro del panel. La confirmación es con `OK`. La autorización general por fecha sigue siendo un flujo aparte cuando aplica.

## 3. Cuadre más consistente

El `Cuadre` ya no se queda congelado cuando una corrección cambia datos clave del período.

Hoy el sistema resincroniza:

- el `Cuadre` cuyo período contiene la fecha corregida

Y además, si una corrección en `Caja` cambia la `base_nueva` de ese cuadre:

- también resincroniza el siguiente `Cuadre`, porque esa base es la `base_anterior` del siguiente cierre

Eso cubre el caso contable más delicado:

- una corrección en caja de un cierre previo puede mover la base del cierre siguiente

## Estructura de datos

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

## Diferencia entre `Resumen` y `Cuadre`

`Resumen`:

- consolida y expone los datos del período
- sirve para revisar qué pasó por módulo
- no hace el balance físico vs teórico

`Cuadre`:

- sí balancea ingresos, egresos y caja física
- usa `base_anterior`
- calcula `caja_teorica`
- compara contra `caja_fisica`
- genera `diferencia`
- define `base_nueva`

Y esa `base_nueva` es la que alimenta el siguiente cierre.

## Flujo por ramas

### `main`

Pensada para supervisión:

- multisede
- super admin sin contraseña operativa
- edición y eliminación por registro
- referencias de plataformas
- respaldos automáticos

### `version-usuario`

Pensada para captura controlada:

- operación diaria
- `Resumen`
- `Cuadre`
- menos superficie administrativa

### `respaldo-version-especial`

Base de usuario con una diferencia concreta:

- en el primer arranque de la sesión, `Caja` y `Resumen` inician en `ayer()`
- al pasar a cualquier otro módulo, la sesión vuelve a `hoy()`

## Instalación y desarrollo

### Desarrollo

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

Usuario:

```powershell
.\.venv\Scripts\pyinstaller.exe CajaJDW.spec --noconfirm
```

Super admin:

```powershell
.\.venv\Scripts\pyinstaller.exe CajaSuperAdmin.spec --noconfirm
```

## Scripts principales

| Archivo | Función |
|---|---|
| `launcher.py` | arranque de usuario |
| `launcher_super_admin.py` | arranque de super admin |
| `launcher_boot.py` | lógica compartida de arranque |
| `CajaJDW.spec` | build usuario |
| `CajaSuperAdmin.spec` | build super admin |
| `Instalar Caja.bat` | instalación rápida |
| `Construir EXE.bat` | build rápido de usuario |

## Limitaciones actuales

- Excel sigue siendo la fuente de verdad operativa.
- Dropbox no resuelve concurrencia real entre dos equipos escribiendo el mismo libro al mismo tiempo.
- No hay transacciones reales como en una base de datos.
- La seguridad sigue siendo operativa, no de nivel corporativo.

## Siguiente evolución natural

Hoy la app ya justificó el salto de trabajar directo en Excel a trabajar sobre una aplicación.  
El siguiente salto lógico, si crece la operación, es:

- dejar Excel como respaldo o salida analítica
- y pasar la operación central a una base de datos

Probablemente eso tendrá sentido cuando:

- aumente la concurrencia por sede
- haga falta más trazabilidad
- Dropbox deje de ser suficiente como mecanismo de sincronización

## Documentación adicional

- [docs/contexto-proyecto.md](docs/contexto-proyecto.md)
- [docs/especificacion-funcional.md](docs/especificacion-funcional.md)
- [docs/analisis-tecnico.md](docs/analisis-tecnico.md)
- [docs/plan-pruebas.md](docs/plan-pruebas.md)
