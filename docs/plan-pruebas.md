# Plan de Pruebas — CajaJDW

## Objetivo

Validar el comportamiento actual del sistema antes de considerar una rama o un build como estables.

## Alcance

Este plan cubre:

- arranque y ejecutable
- persistencia en Excel
- modulos operativos
- `Contadores`
- `Cuadre`
- recaudo
- diferencias clave entre ramas

## Preparacion

Antes de probar:

1. usar una carpeta de prueba por sede
2. evitar trabajar sobre datos reales
3. comprobar que el libro no este abierto en Excel
4. usar catalogos simples y repetibles

## Casos criticos

## A. Arranque

### A-01 — Splash e inicio normal

1. abrir el `.exe`
2. verificar splash
3. confirmar que luego abre el navegador

Resultado esperado:

- el servidor inicia
- la app carga sin error

### A-02 — Multiples clics

1. cerrar la app
2. abrir el `.exe`
3. hacer varios clics rapidos durante el arranque

Resultado esperado:

- no se levantan varias instancias
- no se duplican pestanas

## B. Persistencia basica

### B-01 — Creacion de libros

1. guardar datos de modulos operativos
2. guardar un `Cuadre`

Resultado esperado:

- existe `Contadores_<SEDE>_<ANO>.xlsx`
- existe `Consolidado_<SEDE>_<ANO>.xlsx`

### B-02 — Libro abierto

1. abrir el Excel
2. intentar guardar desde la app

Resultado esperado:

- la app informa archivo ocupado
- no corrompe el libro

### B-03 — Encabezado congelado en libros existentes

1. tomar un libro anual ya existente de la sede
2. guardar un modulo que escriba en ese libro desde la app
3. cerrar y volver a abrir el `.xlsx` en Excel

Resultado esperado:

- la hoja abre con encabezados visibles arriba
- la congelacion queda en `A2`
- no queda anclada visualmente a una fila vieja del historial

## C. Caja

### C-01 — Guardado normal

1. ingresar billetes, monedas y viejos
2. guardar

Resultado esperado:

- total correcto
- lectura correcta al recargar

### C-02 — Correccion de Caja

1. guardar una caja
2. volver a esa fecha
3. corregir con autorizacion

Resultado esperado:

- la fecha se reemplaza
- no quedan duplicados

## D. Bonos, Prestamos y Movimientos

### BN-00 — Autocompletado fuzzy de cliente

1. tener al menos un cliente en el catalogo, por ejemplo `Alfonso`
2. escribir una variante con error tipografico de al menos 4 caracteres, por ejemplo `Alfonos`
3. presionar `Tab` o `Enter`

Resultado esperado:

- el campo se completa con `Alfonso`
- no se crea un registro nuevo con el nombre errado

### BN-01 — Bono simple

1. registrar un bono con cliente y valor

Resultado esperado:

- se agrega a la tabla del dia
- el total diario se actualiza
- el cliente entra al catalogo local normalizado como NomPropio

### BN-02 — Edicion de un bono del dia

1. registrar al menos un bono
2. seleccionar el registro en la lista
3. pulsar editar, cambiar el valor
4. confirmar con autorizacion de admin

Resultado esperado:

- el registro actualiza su valor
- el acumulado diario por cliente se recalcula correctamente

### BN-03 — Eliminacion de un bono del dia

1. registrar al menos un bono
2. seleccionar el registro y eliminarlo con autorizacion de admin

Resultado esperado:

- el registro desaparece de la lista del dia
- el acumulado diario se recalcula y no queda rastro del bono eliminado

### PR-01 — Prestamo inicial

1. registrar un prestamo para una persona nueva

Resultado esperado:

- total prestado aumenta
- saldo pendiente aumenta

### PR-02 — Pago mayor al saldo

1. intentar registrar un pago mayor al saldo pendiente

Resultado esperado:

- la app bloquea el guardado

### PR-03 — Ciclo visible de Prestamos

1. registrar un prestamo inicial para una persona nueva
2. registrar un pago parcial para esa misma persona
3. consultar el ciclo visible de la persona en la UI

Resultado esperado:

- el ciclo visible muestra ambas operaciones en orden cronologico
- el saldo se actualiza progresivamente despues de cada operacion
- el prestamo inicial aparece como activo hasta que el saldo llegue a cero

### PR-04 — Edicion de un registro de Prestamo

1. registrar un prestamo o un pago
2. seleccionar el registro
3. editar el monto con autorizacion de admin

Resultado esperado:

- el registro actualiza su valor
- el saldo pendiente se recalcula desde el historico de la persona

### MV-01 — Movimiento simple

1. registrar un ingreso
2. registrar una salida

Resultado esperado:

- ambas filas quedan registradas
- el neto del dia coincide con el calculo manual

### MV-02 — Edicion de un Movimiento

1. registrar un ingreso o salida
2. seleccionar el registro en la lista
3. editar el monto o concepto con autorizacion de admin

Resultado esperado:

- el registro se actualiza en la lista
- el resumen de total ingresos, salidas y neto se recalcula automaticamente

## E. Contadores

### D-01 — Captura normal

1. registrar contadores validos
2. guardar

Resultado esperado:

- yield correcto
- resultado correcto

### D-02 — Referencia critica

1. provocar decremento frente a referencia
2. abrir panel de referencia critica
3. completar datos
4. confirmar con `OK`
5. guardar

Resultado esperado:

- se permite el guardado
- el registro queda consistente

### D-03 — Pausar un solo item

1. pausar un item
2. ir al dia siguiente

Resultado esperado:

- solo ese item cambia
- los demas no se alteran

### D-04 — Pausa sin borrar formulario

1. empezar a llenar varios items
2. pausar otro item

Resultado esperado:

- los inputs ya escritos en los demas items no se borran

### D-05 — Pausa historica

1. pausar un item en una fecha
2. abrir una fecha anterior

Resultado esperado:

- la pausa no contamina el pasado

## F. Cuadre

### E-01 — Calculo simple

1. registrar datos en todos los modulos necesarios
2. calcular `Cuadre`

Resultado esperado:

- `caja_teorica` correcta
- `caja_fisica` correcta
- `diferencia` correcta

### E-02 — Resincronizacion del cuadre afectado

1. guardar un `Cuadre`
2. corregir un modulo dentro de su periodo

Resultado esperado:

- el `Cuadre` afectado se actualiza

### E-03 — Cascada por Caja

1. guardar dos `Cuadres` consecutivos
2. corregir `Caja` del primero

Resultado esperado:

- se recalcula el `Cuadre` afectado
- si cambia `base_nueva`, tambien se recalcula el siguiente

### E-04 — Autoguardado de Cuadre cuando el dia queda listo

1. partir de una fecha sin `Cuadre`
2. guardar `Caja` y `Contadores` del periodo, en cualquier orden

Resultado esperado:

- el sistema autoguarda el `Cuadre`
- la hoja `Cuadre` queda creada en Excel sin tener que pulsar `Guardar Cuadre`

### E-05 — Fecha sugerida por sede solo en primera carga

1. en `main`, elegir una sede cuyo ultimo `Cuadre` sea de un dia anterior
2. abrir la app y verificar que arranca en el dia siguiente sugerido
3. moverse manualmente a otra fecha de correccion
4. hacer `F5`

Resultado esperado:

- la primera carga de la sede usa la fecha sugerida
- la recarga mantiene la fecha manual elegida en esa misma sede
- al cambiar a otra sede, se recalcula la sugerencia inicial de esa nueva sede

### E-06 — Fecha sugerida no pasa de hoy

1. en `main`, elegir una sede cuyo ultimo `Cuadre` sea de hoy
2. abrir la app en primera carga de esa sede

Resultado esperado:

- la fecha sugerida queda en hoy
- la app no intenta iniciar en manana

### E-07 — Aviso persistente de Caja sin guardar en `version-usuario`

1. en `version-usuario`, modificar algun valor de `Caja`
2. no pulsar `Guardar`
3. cambiar de foco o permanecer en la pantalla

Resultado esperado:

- se muestra un aviso persistente de cambios de `Caja` sin guardar
- el aviso desaparece despues de guardar o limpiar la captura

## G. Faltantes (`main`)

### G-01 — Apertura del modulo

1. habilitar `Faltantes` en `main`
2. abrir el modulo

Resultado esperado:

- el panel abre sin usar el date picker
- se ocultan los controles de fecha, guardar y limpiar propios de captura
- la `Semana actual` aparece visible al entrar

### G-02 — Semana actual y dia pendiente

1. abrir `Faltantes` en una sede con historico de `Cuadre`
2. revisar la fila correspondiente a `hoy()`

Resultado esperado:

- `hoy()` no aparece como diferencia cerrada
- se muestra como valor pendiente visual
- los dias previos de la semana muestran su diferencia real

### G-03 — Historico colapsado

1. abrir `Faltantes`
2. expandir una semana anterior del mes
3. expandir un mes previo del ano

Resultado esperado:

- las semanas anteriores del mes aparecen colapsadas
- los meses anteriores del ano aparecen colapsados
- cada bloque muestra su neto resumido
- al expandir, el detalle diario muestra solo `Fecha` y `Diferencia`

## H. Recaudo

### RC-01 — Panel no visible sin flag

1. asegurarse de que `config_operativa.json` no tenga `excluir_monedas_viejos_base: true`
2. abrir la app

Resultado esperado:

- el panel de recaudo no aparece

### RC-02 — Acumulado por ciclo

1. habilitar `excluir_monedas_viejos_base: true` en `config_operativa.json`
2. registrar Caja en varios dias con monedas y billetes viejos distintos de cero
3. abrir el panel de recaudo

Resultado esperado:

- el panel muestra el total recaudado correcto
- `Hoy` corresponde a la fecha consultada
- `Acumulado` crece progresivamente dentro del ciclo vigente

### RC-03 — Registrar entrega parcial

1. con ciclo activo y total recaudado mayor a cero, registrar una entrega parcial desde `main`

Resultado esperado:

- la entrega aparece en el ciclo
- el pendiente disminuye correctamente

### RC-04 — Cierre de ciclo

1. cerrar el ciclo activo desde `main`

Resultado esperado:

- el ciclo pasa al historial
- se inicia un nuevo ciclo
- el panel conserva solo el ciclo actual y el mensaje del ultimo cierre

## I. Ramas

### F-01 — `main`

Validar:

- modo super admin
- respaldos
- multisede
- administracion de recaudo

### F-02 — `version-usuario`

Validar:

- `Resumen`
- captura diaria
- launcher de usuario
- panel de recaudo solo lectura cuando aplica

### F-03 — `respaldo-version-especial`

1. abrir la app por primera vez
2. comprobar `Caja` en `ayer()`
3. pasar a `Resumen`
4. comprobar `Resumen` en `ayer()`
5. pasar a otro modulo

Resultado esperado:

- `Caja` y `Resumen` respetan `ayer()` al inicio
- al pasar a otro modulo, todo vuelve a `hoy()`

## J. Respaldo automatico (`main`)

### G-01 — Configuracion de backup

1. activar backup
2. definir carpeta
3. guardar settings

Resultado esperado:

- se dispara un respaldo inmediato

### G-02 — Idempotencia

1. ejecutar backup nuevamente el mismo dia

Resultado esperado:

- no duplica respaldos validos

## Regresion minima sugerida

Antes de cerrar una rama o build, repetir al menos:

1. A-01
2. A-02
3. B-01
4. C-01
5. BN-00
6. D-02
7. D-03
8. E-01
9. E-02
10. E-03
11. RC-02
12. RC-03
13. RC-04

## Evolucion futura de pruebas

Si el sistema sigue creciendo, el siguiente paso natural es:

- mantener estas pruebas manuales
- sumar pruebas automatizadas de servicios criticos
- preparar validaciones mas cercanas a una futura migracion a base de datos
