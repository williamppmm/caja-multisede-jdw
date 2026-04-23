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

- la primera carga de esa sede puede sugerir el dia siguiente al ultimo `Cuadre`
- una recarga posterior (`F5`) dentro de la misma sede conserva la fecha que ya estaba usando la sesion
- al cambiar de sede, se recalcula la sugerencia inicial propia de esa sede

Excepcion:

- en `respaldo-version-especial`, durante la primera interaccion:
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

Persistencia:

- hoja `Plataformas`

### Gastos

Proposito:

- registrar egresos por concepto

Reglas:

- se pueden registrar multiples gastos el mismo dia
- cada gasto agrega una fila nueva
- los conceptos nuevos se agregan al catalogo local para autocompletado

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

- el saldo pendiente se calcula desde el historico
- un pago no puede superar el saldo pendiente
- las personas se agregan al catalogo local y se normalizan como NomPropios

Persistencia:

- hoja `Prestamos`

### Movimientos

Proposito:

- registrar ingresos y salidas extraordinarias

Reglas:

- multiples movimientos por dia
- conceptos nuevos se agregan al catalogo local
- el resumen muestra total ingresos, total salidas y neto

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
- estado inicial
- referencia critica autorizada

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

Cuando un periodo ya tiene `Caja` y `Contadores` listos, el sistema puede autoguardar su `Cuadre`.

Cuando se corrige informacion que afecta un periodo ya cuadrado:

- se resincroniza el `Cuadre` cuyo periodo contiene esa fecha

Si la correccion es en `Caja` y cambia la `base_nueva`:

- tambien se resincroniza el siguiente `Cuadre`

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

### `main`

- super admin con acceso a multisede
- respaldos automaticos programados (10 min arranque, cada 4 h, retencion 3 dias)
- referencias externas de plataformas por sede
- administracion de recaudo (registrar entregas, cerrar ciclos)
- port 8001, mutex independiente del usuario
- `CajaSuperAdmin.spec` / `CajaSuperAdmin.exe`

### `version-usuario`

- operacion diaria por sede
- modulo `Resumen`
- panel de recaudo solo lectura
- port 8000
- `CajaJDW.spec` / `CajaJDW.exe`

### `respaldo-version-especial`

- base de `version-usuario`
- en la primera interaccion del dia, `Caja`, `Plataformas`, `Contadores` y `Resumen` abren en `ayer()`
- util como variante de cierre nocturno
- port 8000
- `CajaJDW.spec` / `CajaJDW.exe`

Nota de mantenimiento:

- la rama especial se mantiene reconstruyendola sobre la base mas nueva de `version-usuario`
- despues se reaplica solo su diferencia propia
- no conviene dejarla divergir durante muchas tandas seguidas

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
- `POST /api/modulos/bonos/editar-ultimo`
- `POST /api/modulos/bonos/eliminar-ultimo`
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
