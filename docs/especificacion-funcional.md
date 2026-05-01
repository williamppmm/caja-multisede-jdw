# Especificacion Funcional — CajaJDW

Documento de referencia funcional del comportamiento actual del sistema.

## 1. Arranque

Al ejecutar el `.exe` o el launcher Python:

1. se muestra splash de inicio
2. el launcher garantiza instancia unica
3. si la app ya esta arrancando, los clics extra no deben abrir pestanas duplicadas
4. cuando el servidor local responde, se abre el navegador

Ademas:

- el navegador envia heartbeat periodico
- si el proceso no recibe heartbeat durante el tiempo de gracia, se apaga solo

## 2. Configuracion base

Desde Administracion se define:

- sede
- carpeta de datos
- modulos habilitados
- modulo por defecto
- estado inicial del sistema

El estado inicial (`startup_state.json`) permite definir:

- fecha de inicio
- caja inicial
- referencias iniciales por item de `Contadores`

## 3. Reglas transversales

### Fecha de trabajo

En general la sesion usa una fecha compartida entre modulos.

En `main`, cuando hay sede activa:

- la primera carga de esa sede puede sugerir el dia siguiente al ultimo `Cuadre`, sin pasar de hoy
- una recarga posterior (`F5`) dentro de la misma sede conserva la fecha que ya estaba usando la sesion
- al cambiar de sede, se recalcula la sugerencia inicial propia de esa sede

Excepcion:

- en `respaldo-version-especial`, durante el estado especial inicial:
  - `Caja`
  - `Plataformas`
  - `Contadores`
  - `Resumen`
  pueden abrir en `ayer()`

### Borradores

Los borradores de sesion mas sensibles hoy son:

- `Caja`
- `Contadores`

### Naturaleza de las contrasenas

Las contrasenas visibles en el frontend deben entenderse como:

- restriccion operativa basica
- aviso de que se intenta editar en una fecha no prevista

No son autenticacion fuerte.

### Autorizacion por modulo

| Accion | Requiere autorizacion |
|---|---|
| Guardar `Caja` en `hoy()` | no |
| Guardar `Caja` en fecha anterior | si |
| Guardar `Contadores` en `hoy()` | no |
| Guardar `Contadores` en fecha anterior | si |
| Editar o eliminar un bono del dia | si |
| Editar o eliminar un gasto del dia | si |
| Editar o eliminar un prestamo o pago del dia | si |
| Editar o eliminar un movimiento del dia | si |
| Guardar `Cuadre` manualmente | si |
| Ingresar referencia critica en `Contadores` | si |
| Pausar un item en `Contadores` | no |
| Registrar entrega de recaudo | si (solo `main`) |
| Cerrar ciclo de recaudo | si (solo `main`) |

## 4. Modulos

### Caja

Proposito:

- registrar caja fisica del dia

Campos principales:

| Campo | Descripcion |
|---|---|
| Billetes | Cantidad por denominacion: 100.000, 50.000, 20.000, 10.000, 5.000, 2.000 |
| Total monedas | Valor total de monedas sin desglose |
| Billetes viejos | Valor total de billetes fuera de circulacion o deteriorados |

Calculo:

- `total_caja_fisica = billetes + monedas + billetes viejos`

Persistencia:

- hoja `Caja` de `Contadores_{sede}_{ano}.xlsx`

### Plataformas

Proposito:

- registrar ventas de plataformas del dia

Campos:

- Practisistemas
- Deportivas

Referencias externas (solo `main`):

- `main` puede leer referencias de plataformas desde archivos Excel externos
- los archivos de referencia son `Ventas_dia_Practisistemas.xlsx` y `Ventas_dia_Bet.xlsm`
- el super admin configura rutas globales para esos archivos y, por sede, los encabezados que identifican sus valores
- cuando no existe un `Cuadre` intermedio en el periodo, los valores se acumulan sumando todos los dias del periodo
- en `version-usuario` este mecanismo no existe; el operador ingresa los valores manualmente

Persistencia:

- hoja `Plataformas`

### Gastos

Proposito:

- registrar egresos por concepto

Reglas:

- se pueden registrar multiples gastos el mismo dia
- cada gasto agrega una fila nueva
- los conceptos nuevos se agregan al catalogo local para autocompletado

Edicion y eliminacion:

- la lista del dia muestra los gastos en orden cronologico inverso
- cualquier gasto del dia puede editarse o eliminarse con autorizacion de admin
- la operacion identifica el registro por su timestamp exacto
- tras editar o eliminar, el total del dia se recalcula automaticamente

Persistencia:

- hoja `Gastos`

### Bonos

Proposito:

- registrar bonos por cliente

Reglas:

- se pueden registrar multiples bonos del mismo cliente el mismo dia
- se muestra acumulado diario por cliente
- el cliente se agrega al catalogo local `data/bonos_clientes.json`
- el nombre se normaliza como NomPropio

Edicion y eliminacion:

- la lista del dia muestra los bonos en orden cronologico inverso
- cualquier bono del dia puede editarse o eliminarse con autorizacion de admin
- la operacion identifica el registro por su timestamp exacto
- tras editar o eliminar, el acumulado diario por cliente se recalcula automaticamente

### Autocompletado de clientes y personas

El campo usa tres niveles en orden:

1. coincidencia exacta
2. coincidencia por prefijo
3. coincidencia fuzzy si el texto tiene al menos 4 caracteres

Esto aplica a:

- Bonos
- Gastos
- Prestamos
- Movimientos

En Bonos y Prestamos los nombres se normalizan como NomPropios.

### Prestamos

Proposito:

- registrar prestamos y pagos por persona

Reglas:

- el saldo pendiente se calcula recorriendo todo el historico de esa persona
- un pago no puede superar el saldo pendiente
- las personas se agregan al catalogo local y se normalizan como NomPropios

Ciclo visible:

- la UI muestra el ciclo activo visible de la persona, calculado desde su historico
- cada fila indica si es prestamo o pago, el monto y el saldo acumulado tras esa operacion
- las operaciones cuyo saldo quedo en cero se muestran tachadas visualmente para distinguirlas de las activas
- el saldo pendiente actual se calcula en tiempo real antes de registrar un nuevo movimiento

Edicion y eliminacion:

- cualquier registro del dia puede editarse o eliminarse con autorizacion de admin
- la operacion identifica el registro por su timestamp exacto
- tras editar o eliminar, el saldo pendiente se recalcula desde el historial completo

Persistencia:

- hoja `Prestamos`

### Movimientos

Proposito:

- registrar ingresos y salidas extraordinarias

Reglas:

- multiples movimientos por dia
- conceptos nuevos se agregan al catalogo local
- el resumen muestra total ingresos, total salidas y neto

Edicion y eliminacion:

- la lista del dia muestra los movimientos en orden cronologico inverso
- cualquier movimiento del dia puede editarse o eliminarse con autorizacion de admin
- la operacion identifica el registro por su timestamp exacto
- tras editar o eliminar, el resumen neto del dia se recalcula automaticamente

Persistencia:

- hoja `Movimientos`

### Contadores

Es el modulo mas sensible del sistema.

#### Catalogo

Cada item tiene:

- `item_id`
- `nombre`
- `denominacion`

La pausa temporal por fecha vive en:

- `contadores_pausas.json`

#### Referencia

La referencia vigente de cada item puede venir de:

- ultimo registro guardado
- estado inicial (`startup_state.json`)
- referencia critica autorizada

Orden de resolucion (de mayor a menor prioridad):

1. referencia critica autorizada, si fue ingresada para esa fecha o la ultima anterior disponible
2. ultimo registro guardado, cuando existe historial previo del item
3. estado inicial definido en `startup_state.json`, cuando no hay historial

La referencia critica sobreescribe la referencia normal desde la fecha en que se autorizo. Se usa cuando los contadores fisicos fueron reiniciados o presentaron una incoherencia reconocida. El sistema exige completar este paso antes de permitir el guardado en esos casos.

#### Yield y resultado

Regla base:

- `yield_actual = entradas - salidas - jackpot`
- `yield_ref = ref_entradas - ref_salidas - ref_jackpot`
- `resultado = (yield_actual - yield_ref) * denominacion`

#### Referencia critica

Se usa cuando hubo reset o incoherencia real de contadores.

Flujo:

1. se abre el panel del item
2. se ingresan los valores de referencia critica
3. se confirma con `OK`

#### Pausa

La pausa actual es por fecha.

Reglas:

- solo afecta al item pausado
- no modifica otros items
- la fila sigue visible
- `Entradas` y `Salidas` pueden apoyarse en la referencia vigente
- `Jackpot` sigue su propia logica

#### Navegacion de teclado

Reglas actuales:

- `Tab` y `Enter` recorren solo `Entradas` y `Salidas`
- `Jackpot` queda fuera del flujo operativo diario
- las flechas permiten navegacion tipo grilla
- `Escape` restaura el valor original del campo enfocado

### Resumen

`Resumen` existe como modulo formal en:

- `version-usuario`
- `respaldo-version-especial`

Proposito:

- agrupar por periodo la informacion de modulos

### Faltantes

`Faltantes` existe como modulo formal en:

- `main`

Proposito:

- volver visible el historico operativo de diferencias de `Cuadre`
- ayudar a detectar faltantes recurrentes sin obligar al usuario a abrir Excel

Reglas:

- no depende del date picker compartido
- trabaja anclado al presente operativo
- `hoy()` se muestra como pendiente visual y no entra como cierre evaluado
- usa solo el `Consolidado_{sede}_{ano}.xlsx` del ano actual
- no crea persistencia nueva

Estados operativos internos:

- `FALTANTE`
- `SOBRANTE`
- `OK`
- `PENDIENTE`
- `NO OPERO`

Presentacion actual:

- `Semana actual` abierta por defecto
- `Semanas anteriores del mes` colapsadas
- `Meses anteriores del ano` colapsados
- el detalle visible por dia muestra solo:
  - fecha
  - diferencia

La intencion del modulo no es rehacer `Cuadre`, sino exponer de forma legible el comportamiento acumulado de sus diferencias.
- exponer totales y detalle operativo

No hace balance contable completo.

### Cuadre

Proposito:

- cerrar el periodo comparando caja teorica contra caja fisica

Elementos clave:

- `base_anterior`
- totales por modulo del periodo
- `caja_teorica`
- `caja_fisica`
- `diferencia`
- `base_nueva`

Persistencia:

- hoja `Cuadre` de `Consolidado_{sede}_{ano}.xlsx`

## 5. Resincronizacion de Cuadre

### Autoguardado

Cuando un periodo ya tiene tanto `Caja` como `Contadores` guardados, el sistema intenta autoguardar el `Cuadre` de ese periodo sin que el operador tenga que pulsarlo manualmente.

Esto ocurre:

- al guardar `Caja` en modo normal (sin forzar)
- al guardar `Contadores` en cualquier modo

El orden en que se guardan `Caja` y `Contadores` no importa. Ambos modulos disparan la misma verificacion al terminar. Cuando el segundo en guardarse detecta que el primero ya existe, el `Cuadre` se crea automaticamente.

### Resincronizacion por correccion

Cuando se corrige informacion que afecta un periodo ya cerrado:

- se identifica el `Cuadre` cuyo periodo contiene la fecha corregida
- ese `Cuadre` se recalcula con los datos actualizados

Si la correccion es en `Caja` (con autorizacion) y el recalculo cambia `base_nueva`:

- tambien se resincroniza el siguiente `Cuadre`

La cascada se detiene ahi de forma intencional. No se propaga mas alla del siguiente cierre para evitar efectos no controlados sobre periodos mas antiguos.

### Distincion entre modos

| Accion del operador | Efecto sobre Cuadre |
|---|---|
| Guardar `Caja` normal | autoguarda Cuadre si Contadores ya existe para el periodo |
| Guardar `Contadores` | autoguarda Cuadre si Caja ya existe para el periodo |
| Corregir `Caja` con autorizacion | resincroniza Cuadre del periodo + siguiente si cambia base_nueva |
| Corregir `Contadores` con autorizacion | resincroniza Cuadre del periodo solamente |

## 6. Recaudo de billetes viejos y monedas

Disponible solo cuando la sede tiene:

- `excluir_monedas_viejos_base: true`

en `config_operativa.json`.

Reglas:

- `Caja fisica` sigue contando monedas y billetes viejos
- `base_nueva` excluye esos valores cuando la sede lo define
- el panel muestra el ciclo vigente y el ultimo cierre

### Estado persistido

- `recaudo_ciclos.json`

vive en la misma carpeta que los Excel de la sede.

### En `version-usuario`

- el panel es informativo

### En `main`

- super admin puede registrar entregas
- super admin puede cerrar ciclos

## 7. Archivos de datos

### Libros Excel

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
- `Consolidado_{sede}_{ano}.xlsx`
  - Contadores
  - Cuadre

### Auxiliares por sede

- `contadores_items.json`
- `contadores_pausas.json`
- `startup_state.json`
- `config_operativa.json`
- `recaudo_ciclos.json`

Regla funcional:

- estos archivos viven junto a los Excel de la sede
- por eso deben ser legibles tanto por `version-usuario` como por `main`
- una regla operativa compartida no debe guardarse solo en `data/settings.json`

### Locales del equipo

- `data/settings.json`
- `data/bonos_clientes.json`
- `data/gastos_conceptos.json`
- `data/prestamos_personas.json`
- `data/movimientos_conceptos.json`

## 8. Riesgo operativo con Excel

La aplicacion ya tiene mitigaciones de locking y validacion, pero el riesgo estructural sigue siendo:

- Excel compartido no es una base de datos
- no hay concurrencia fuerte distribuida
- Dropbox / OneDrive no sustituyen una capa transaccional

## 9. Diferencias entre ramas

### Tabla comparativa

| Funcionalidad | `main` | `version-usuario` | `respaldo-version-especial` |
|---|---|---|---|
| Rol | super admin multisede | operador diario | operador con cierre nocturno |
| Multisede | si | no | no |
| Modulo `Faltantes` | si | no | no |
| Modulo `Resumen` | no | si | si |
| Respaldos automaticos | si (10 min arranque, cada 4 h) | no | no |
| Retencion de respaldos | 3 dias por sede | — | — |
| Referencias externas de plataformas | si, rutas globales y mapeo por sede | no | no |
| Recaudo: registrar entregas | si | no | no |
| Recaudo: cerrar ciclos | si | no | no |
| Recaudo: panel informativo | si | si (solo lectura) | si (solo lectura) |
| Fecha al arrancar | sugerida por sede (dia siguiente al ultimo Cuadre, sin pasar de hoy) | hoy | ayer en modulos de cierre durante el estado especial inicial |
| Port | 8001 | 8000 | 8000 |
| Mutex | independiente del usuario del equipo | por usuario del equipo | por usuario del equipo |
| Ejecutable | `CajaSuperAdmin.exe` | `CajaJDW.exe` | `CajaJDW.exe` |
| Spec de empaquetado | `CajaSuperAdmin.spec` | `CajaJDW.spec` | `CajaJDW.spec` |

### `main`

- acceso a todas las sedes registradas en `data/settings.json`
- puede corregir datos de cualquier sede sin importar en que equipo corren
- ejecuta respaldos automaticos: primer intento 10 min despues del arranque, luego cada 4 horas
- retencion de 3 dias por sede en la carpeta de backup
- puede leer referencias externas de plataformas con rutas globales y mapeo por sede
- puede registrar entregas y cerrar ciclos de recaudo
- expone el modulo `Faltantes` para seguimiento operativo de diferencias historicas

### `version-usuario`

- trabaja sobre una sola sede a la vez
- captura diaria de todos los modulos operativos
- modulo `Resumen` para consulta consolidada de periodos
- panel de recaudo en modo solo lectura cuando la sede lo tiene habilitado
- no tiene acceso a administracion de respaldos ni de recaudo

### `respaldo-version-especial`

- derivada de `version-usuario`, comparte su base de codigo
- diferencia funcional unica: durante el estado especial inicial, los modulos `Caja`, `Plataformas`, `Contadores` y `Resumen` abren en `ayer()` en lugar de `hoy()`
- util para operadores que hacen el cierre al inicio del dia siguiente en lugar de al final del dia anterior
- al salir de esos modulos hacia otro flujo, la fecha vuelve a `hoy()` normalmente

Nota de mantenimiento:

- la rama especial se mantiene reconstruyendola sobre la base mas nueva de `version-usuario`
- se reaplica solo su diferencia propia (la logica de `ayer()` en el estado especial inicial)
- no conviene dejarla divergir durante muchas tandas seguidas para simplificar el rebase

## 10. API REST de referencia

### Configuracion y ciclo de vida

- `GET /api/settings` — configuracion actual
- `POST /api/settings` — guardar configuracion
- `GET /api/settings/startup` — estado de inicio
- `POST /api/settings/startup` — guardar estado de inicio
- `POST /api/settings/browse-directory` — abrir selector de carpeta
- `GET /api/settings/remote-sites` — sedes remotas registradas (super admin)
- `POST /api/settings/remote-sites` — guardar sedes remotas (super admin)
- `POST /api/app/heartbeat` — ping del navegador
- `POST /api/app/shutdown` — apagar el servidor

### Modulos operativos

- `GET /api/modulos/{modulo}/fecha/{fecha}/estado`
- `GET /api/modulos/{modulo}/fecha/{fecha}/datos`
- `GET /api/modulos/{modulo}/ultima-fecha`
- `POST /api/modulos/{modulo}/guardar`
- `POST /api/modulos/caja/guardar`
- `POST /api/modulos/plataformas/guardar`
- `POST /api/modulos/contadores/guardar`
- `POST /api/modulos/cuadre/guardar`
- `GET /api/modulos/cuadre/calcular/{fecha}`
- `GET /api/modulos/cuadre/fecha/{fecha}/estado`
- `GET /api/modulos/cuadre/fecha/{fecha}/datos`
- `POST /api/modulos/bonos/registro/editar`
- `POST /api/modulos/bonos/registro/eliminar`
- `POST /api/modulos/gastos/registro/editar`
- `POST /api/modulos/gastos/registro/eliminar`
- `POST /api/modulos/prestamos/registro/editar`
- `POST /api/modulos/prestamos/registro/eliminar`
- `POST /api/modulos/movimientos/registro/editar`
- `POST /api/modulos/movimientos/registro/eliminar`
- `GET /api/modulos/contadores/catalogo`
- `POST /api/modulos/contadores/catalogo`
- `POST /api/modulos/contadores/pausa`
- `GET /api/modulos/contadores/fecha/{fecha}`

### Catalogos de autocompletado

- `GET /api/modulos/bonos/nombres`
- `GET /api/modulos/gastos/conceptos`
- `GET /api/modulos/prestamos/personas`
- `GET /api/modulos/movimientos/conceptos`
- `POST /api/modulos/bonos/nombres/importar`

### Recaudo

- `GET /api/recaudo` — resumen del ciclo activo (`?fecha=YYYY-MM-DD` opcional)
- `POST /api/recaudo/registrar-entrega` — registrar entrega parcial
- `POST /api/recaudo/cerrar-ciclo` — cerrar ciclo activo

### Respaldos (solo super admin)

- `GET /api/backup/status` — estado del ultimo respaldo por sede
- `POST /api/backup/run-now` — disparar respaldo inmediato
