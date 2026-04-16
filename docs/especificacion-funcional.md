# Especificación Funcional — CajaJDW

Documento de referencia funcional del comportamiento actual del sistema.

## 1. Arranque

Al ejecutar el `.exe` o el launcher Python:

1. Se muestra splash de inicio.
2. El launcher garantiza instancia única.
3. Si la app ya está arrancando, los clics extra no deben abrir pestañas duplicadas.
4. Cuando el servidor local responde, se abre el navegador.

Además:

- el navegador envía heartbeat cada 30 segundos
- si el proceso no recibe heartbeat por 75 segundos, se apaga solo

## 2. Configuración base

Desde Administración se define:

- sede
- carpeta de datos
- módulos habilitados
- módulo por defecto
- estado inicial del sistema

El estado inicial (`startup_state.json`) permite definir:

- fecha de inicio
- caja inicial
- referencias iniciales por ítem de Contadores

## 3. Reglas transversales

### Fecha de trabajo

En general la sesión usa una fecha compartida entre módulos.

Excepción:

- en `respaldo-version-especial`, durante la primera interacción:
  - `Caja` y `Resumen` pueden abrir en `ayer()`
  - al pasar a otro módulo, la sesión vuelve a `hoy()`

### Borradores

Los módulos con borrador de sesión más delicado son:

- `Caja`
- `Contadores`

### Autorización

Hay dos niveles distintos:

1. autorización general por fecha o corrección
2. microflujos internos dentro de `Contadores`

En `Contadores`, los paneles de:

- referencia crítica
- pausa / reactivación

se confirman con `OK`, sin contraseña dentro del propio panel.

## 4. Módulos

### Caja

Propósito:

- registrar caja física del día

Entradas principales:

- billetes por denominación
- total monedas
- billetes viejos

Cálculo:

- `total_caja_fisica = billetes + monedas + billetes viejos`

Persistencia:

- hoja `Caja` de `Contadores_{sede}_{año}.xlsx`

### Plataformas

Propósito:

- registrar ventas de plataformas del día

Campos:

- Practisistemas
- Deportivas

Persistencia:

- hoja `Plataformas` de `Contadores_{sede}_{año}.xlsx`

#### Referencias externas (solo super admin con sede activa)

En el build super admin, al abrir el módulo se consultan dos archivos externos de solo lectura:

- `Ventas_dia_Practisistemas.xlsx` (hoja `Resumen`, columna configurable por sede)
- `Ventas_dia_Bet.xlsm` (hoja `xDias`, columna configurable por sede)

Los valores aparecen como referencia visual debajo del formulario de captura. Se comparan contra lo ingresado mostrando `Coincide` o `Difiere Δ`. No se guardan en ningún Excel propio.

Condiciones para que aparezca el panel:

- build super admin activo (`CAJA_SUPER_ADMIN=1`)
- sede activa seleccionada explícitamente
- rutas y columnas configuradas en el panel de administración

### Gastos

Propósito:

- registrar egresos por concepto

Persistencia:

- hoja `Gastos` de `Contadores_{sede}_{año}.xlsx`

### Bonos

Propósito:

- registrar bonos por cliente

Persistencia:

- hoja `Bonos` de `Contadores_{sede}_{año}.xlsx`

### Préstamos

Propósito:

- registrar préstamos y pagos por persona

El saldo pendiente se calcula desde el histórico.

Persistencia:

- hoja `Prestamos` de `Contadores_{sede}_{año}.xlsx`

### Movimientos

Propósito:

- registrar ingresos y salidas extraordinarias

Persistencia:

- hoja `Movimientos` de `Contadores_{sede}_{año}.xlsx`

### Contadores

Es el módulo más sensible del sistema.

#### Catálogo

Cada ítem tiene:

- `item_id`
- `nombre`
- `denominacion`

El estado de pausa ya no vive como booleano persistente del catálogo. La fuente de verdad temporal es:

- `contadores_pausas.json`

#### Referencia

La referencia vigente de cada ítem puede venir de:

- último registro guardado
- estado inicial
- referencia crítica autorizada

#### Yield y resultado

Regla base:

- `yield_actual = entradas - salidas - jackpot`
- `yield_ref = ref_entradas - ref_salidas - ref_jackpot`
- `resultado = (yield_actual - yield_ref) * denominacion`

#### Referencia crítica

Se usa cuando hubo reset o incoherencia real de contadores.

Hoy el flujo es:

1. se abre el panel del ítem
2. se ingresan los valores de referencia crítica
3. se confirma con `OK`

No requiere contraseña dentro del panel.

#### Pausa

La pausa actual es por fecha.

Reglas:

- solo afecta al ítem pausado
- no debe modificar otros ítems
- la fila sigue visible
- `Entradas` y `Salidas` se apoyan en la referencia vigente
- `Jackpot` sigue su propia lógica normal

La pausa sirve para no bloquear el guardado cuando una máquina está temporalmente fuera de captura, sin perder la estructura del formulario.

#### Guardado

`Contadores` se guarda en:

- hoja `Contadores` de `Consolidado_{sede}_{año}.xlsx`

### Resumen

Disponible en la versión usuario y en la versión especial.

Propósito:

- agrupar por período la información de módulos
- exponer totales y detalle operativo

No hace balance contable completo.

### Cuadre

Propósito:

- cerrar el período comparando caja teórica contra caja física

Elementos clave:

- `base_anterior`
- totales por módulo del período
- `caja_teorica`
- `caja_fisica`
- `diferencia`
- `base_nueva`

Persistencia:

- hoja `Cuadre` de `Consolidado_{sede}_{año}.xlsx`

## 5. Resincronización de Cuadre

Cuando se corrige información que afecta un período ya cuadrado:

- se resincroniza el `Cuadre` cuyo período contiene esa fecha

Además, si la corrección es en `Caja` y cambia la `base_nueva` del cuadre recalculado:

- también se resincroniza el siguiente `Cuadre`

Esto existe porque:

- `base_nueva` del cierre actual
- es la `base_anterior` del siguiente cierre

## 6. Archivos de datos

### Libros Excel

- `Contadores_{sede}_{año}.xlsx`
- `Consolidado_{sede}_{año}.xlsx`

### Auxiliares por sede

- `contadores_items.json`
- `contadores_pausas.json`
- `startup_state.json`

### Locales del equipo

- `data/settings.json`
- `data/bonos_clientes.json`
- `data/gastos_conceptos.json`
- `data/prestamos_personas.json`
- `data/movimientos_conceptos.json`

## 7. API relevante

Algunos endpoints importantes:

- `POST /api/modulos/caja/guardar`
- `POST /api/modulos/plataformas/guardar`
- `GET  /api/modulos/plataformas/fecha/{fecha}/datos`
- `GET  /api/modulos/plataformas/fecha/{fecha}/referencias` — valores de archivos externos (solo super admin)
- `POST /api/modulos/contadores/guardar`
- `POST /api/modulos/cuadre/guardar`
- `GET  /api/modulos/cuadre/calcular/{fecha}`
- `POST /api/modulos/contadores/catalogo/{item_id}/pausar`
- `GET  /api/settings` — retorna configuración incluyendo `is_super_admin_build`
- `POST /api/settings` — guarda configuración, retorna `active_site`
- `POST /api/settings/remote-sites` — guarda lista de sedes, retorna `sites` y `active_site`
- `POST /api/settings/active-site` — cambia sede activa
- `POST /api/settings/remote-sites/validate` — verifica carpeta y detecta sede
- `POST /api/app/heartbeat`
- `POST /api/app/shutdown`

## 8. Diferencias entre ramas

### `main`

- super admin
- multisede
- respaldos
- referencias de plataformas

### `version-usuario`

- operación diaria
- `Resumen`

### `respaldo-version-especial`

- misma base de usuario
- `Caja` y `Resumen` arrancan en `ayer()` al inicio de la sesión
