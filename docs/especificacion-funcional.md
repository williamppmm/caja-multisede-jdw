# Especificación Funcional — CajaJDW

Documento de referencia exhaustiva del comportamiento de la aplicación. Describe cada módulo, cada regla de negocio, cada validación y cada comportamiento específico tal como está implementado. Dirigido a quien necesite entender con precisión cómo funciona el sistema, ya sea para operar, probar o continuar desarrollando.

---

## 1. Ciclo de vida de la aplicación

### 1.1 Arranque

Al ejecutar `CajaJDW.exe` (o `python launcher.py`):

1. Se verifica si el puerto por defecto (`8000`) ya está en uso.
2. **Si ya hay una instancia corriendo:** se abre el navegador apuntando a `http://127.0.0.1:8000` y el proceso termina. No se inicia ningún servidor adicional.
3. **Si el puerto está libre:** se busca el primer puerto disponible entre `8000` y `8009`. Se inicia Uvicorn con FastAPI en ese puerto. En paralelo, un hilo verifica cada 500 ms si el servidor ya responde; en cuanto lo hace, abre el navegador. El tiempo típico de arranque hasta que la UI es usable es de 2 a 4 segundos.

### 1.2 Heartbeat y auto-apagado

Mientras el navegador tenga la pestaña abierta, envía automáticamente un `POST /api/app/heartbeat` cada **30 segundos**. Este ping activa un watchdog en el servidor: si transcurren **75 segundos** sin recibir ningún heartbeat, el proceso termina por sí solo (`os._exit(0)`).

Esto cubre el caso en que el usuario cierra el navegador sin usar el botón **Finalizar**. El servidor no queda huérfano.

Si el usuario deja la pestaña abierta y se aleja, el heartbeat sigue enviándose; el servidor no se apaga.

### 1.3 Cierre explícito

El botón **Finalizar** en la interfaz pide confirmación y luego envía `POST /api/app/shutdown`. El servidor responde, lanza un `threading.Timer(0.3, os._exit, args=(0,))` y retorna. La UI muestra "La aplicación se está cerrando..." y llama a `window.close()` 300 ms después.

---

## 2. Configuración inicial — Administración

Accesible con el botón ⚙ en la esquina superior derecha. Protegida por contraseña de administrador.

### 2.1 Campos de configuración

| Campo | Descripción |
|---|---|
| **Sede** | Nombre de la sede. Se normaliza para nombrar los archivos Excel (sin tildes, sin espacios, CamelCase). |
| **Carpeta de datos** | Ruta donde se crearán/leerán los libros Excel. Puede ser local o una carpeta de Dropbox/nube. Se elige con selector de carpeta. |
| **Módulos habilitados** | Checkboxes para activar/desactivar cada módulo. Solo los habilitados aparecen como pestañas en la interfaz. |
| **Módulo por defecto** | Cuál módulo se muestra al abrir la app. Solo puede ser uno de los habilitados. |

### 2.2 Persistencia de configuración

Se guarda en `settings.json` junto al ejecutable. Al iniciar la app, se carga este archivo. Si no existe, la app funciona con valores en blanco hasta que el usuario configure.

### 2.3 Estado de inicio (Startup State)

Sección especial dentro de Administración. Permite definir valores de partida para el sistema cuando aún no hay histórico:

| Campo | Descripción |
|---|---|
| **Activado** | Toggle. Si está desactivado, los campos no se usan aunque estén rellenos. |
| **Fecha de inicio** | Fecha desde la cual aplica la base inicial. |
| **Caja inicial** | Monto en caja al arrancar (usado como `base_anterior` del primer Cuadre). |
| **Contadores iniciales** | Por cada ítem del catálogo: Entradas, Salidas y Jackpot en la fecha de inicio. Sirven como referencia vigente antes del primer registro real. |

Se guarda en `startup_state.json`. El efecto:
- Si un ítem de Contadores no tiene ningún registro previo, el sistema busca en `startup_state` una referencia para ese `item_id`. Si la encuentra y la fecha de inicio ≤ fecha actual, la usa como referencia de tipo `referencia_inicial`.
- Si Cuadre no tiene ningún cuadre previo, busca en `startup_state` la `caja_inicial` como base anterior.

### 2.4 Gestión del catálogo de Contadores

Desde Administración se mantiene el catálogo de ítems de Contadores (`contadores_items.json`). Cada ítem tiene:

| Campo | Regla |
|---|---|
| `item_id` | Identificador único. No puede estar vacío. Duplicados son eliminados (se conserva el primero). |
| `nombre` | Nombre descriptivo. No puede estar vacío. |
| `denominacion` | Valor monetario por unidad de yield. Debe ser > 0. |
| `activo` | Siempre `true` en el catálogo actual. |
| `pausado` | Estado de pausa. Se cambia desde la interfaz de Contadores, no desde Administración. |

Los cambios en el catálogo se guardan al pulsar **Guardar catálogo**. El orden en el catálogo define el orden de las filas en Contadores.

### 2.5 Importación de nombres para Bonos

Permite cargar nombres de clientes desde un archivo de texto (uno por línea) directamente al catálogo local de autocompletado de Bonos.

---

## 3. Comportamientos transversales

### 3.1 Fecha compartida

La aplicación mantiene una **fecha única compartida** entre todos los módulos. Cuando el usuario cambia la fecha en el selector, todos los módulos se actualizan para mostrar la información de esa fecha. No es posible tener distintas fechas en distintos módulos simultáneamente.

**Restricción:** No se puede seleccionar una fecha futura. El selector bloquea ese caso y la API lo rechaza también.

**Fecha por defecto:** La primera vez que se abre la app en una sesión, la fecha es hoy. Si la página se recarga (F5), la fecha persiste desde `sessionStorage`.

### 3.2 Persistencia de borradores en sesión

Los módulos **Caja** y **Contadores** guardan sus borradores en `sessionStorage` automáticamente mientras el usuario escribe. Si la página se recarga, los valores no se pierden. Los borradores se eliminan cuando el usuario guarda o limpia el formulario.

### 3.3 Módulo activo

El módulo seleccionado (pestaña activa) también persiste en `sessionStorage`. Al recargar, el usuario vuelve al mismo módulo.

### 3.4 Autorización de administrador

El modo admin se activa ingresando la contraseña desde ⚙. Una vez activo:

- Se muestra un **banner de edición** con el nombre del módulo y fecha en edición protegida.
- Los módulos que normalmente están bloqueados (fecha ya guardada o fecha distinta a hoy) pasan a ser editables.
- El banner tiene un botón **Cancelar edición** que desactiva el modo admin y restaura el estado anterior.
- El modo admin es específico por módulo y fecha: al cambiar de módulo o fecha, se evalúa si sigue activo o no.

### 3.5 Tarjeta flotante de autorización

Cuando el usuario intenta interactuar con un control bloqueado (campo, botón, selector), aparece una tarjeta flotante anclada al control que muestra un campo de contraseña. Al ingresar la contraseña correcta desde ahí, se activa el modo admin para ese módulo sin necesidad de abrir el panel de Administración completo.

### 3.6 Navegación con teclado

**Módulos de formulario simple (Caja, Plataformas, Gastos, Bonos, Préstamos, Movimientos, Cuadre):** Tab y Enter funcionan según el comportamiento estándar del navegador.

**Contadores — campos principales (Entradas, Salidas, Jackpot):** Tab y Enter saltan al siguiente campo de la misma columna (siguiente ítem). Al llegar al último ítem de una columna, pasan a la primera celda de la columna siguiente.

**Contadores — sub-módulo de referencia crítica:** Tab y Enter recorren los campos en orden: E → S → J → Pre-reset → Clave → botón OK. Desde el botón OK, Enter confirma la autorización.

**Cuadre — campo Practisistemas:** Tab y Enter saltan a Deportivas.

**Cuadre — campo Deportivas:** Tab y Enter mueven el foco al botón Guardar cuadre.

### 3.7 Indicador de estado de fecha

Junto al selector de fecha hay un indicador textual que muestra si la fecha ya tiene datos guardados en el módulo activo, si está libre, o si requiere admin para editar.

---

## 4. Módulo Caja

**Propósito:** Registrar el arqueo físico de caja al cierre del día.

### 4.1 Campos

| Campo | Descripción |
|---|---|
| **Billetes** | Cantidad por denominación (200, 100, 50, 20, 10, 5, 2, 1). El sistema calcula el subtotal. |
| **Total monedas** | Valor total de monedas sin desglose por denominación. |
| **Billetes viejos** | Valor total de billetes fuera de circulación o deteriorados. |

**Modo de entrada:** Configurable en Administración.
- **Modo cantidad:** el usuario ingresa cuántos billetes hay de cada denominación.
- **Modo total por denominación:** el usuario ingresa el subtotal de cada denominación y el sistema calcula la cantidad.

### 4.2 Cálculo

```
Total billetes = Σ (cantidad × denominación)
Total caja física = Total billetes + Total monedas + Billetes viejos
```

### 4.3 Reglas de edición

| Situación | Comportamiento |
|---|---|
| Fecha libre (sin registro) | Guardar libre, sin admin. |
| Fecha ya guardada | Requiere admin para sobrescribir. |
| Fecha futura | Bloqueado siempre. |

Con admin activo, guardar sobre una fecha existente **reemplaza** completamente el registro anterior en Excel. No se acumulan filas duplicadas.

### 4.4 Persistencia en Excel

Hoja `Caja` del libro `Caja_{sede}_{año}.xlsx`. Columnas:

| Fecha | Tipo | Concepto | Denominación | Cantidad | Valor unitario | Subtotal | Timestamp |
|---|---|---|---|---|---|---|---|

Tipos de fila: `billete`, `manual` (monedas, billetes viejos), `resumen` (total caja física).

---

## 5. Módulo Plataformas

**Propósito:** Registrar las ventas de plataformas externas del día.

### 5.1 Campos

| Campo | Regla |
|---|---|
| **Practisistemas** | Valor ≥ 0. |
| **Deportivas** | Permite valor negativo (descuento o reverso). |

### 5.2 Cálculo

```
Total plataformas = Practisistemas + Deportivas
```

### 5.3 Reglas de edición

| Situación | Comportamiento |
|---|---|
| Fecha actual, sin registro | Guardar libre. |
| Fecha actual, con registro | Guardar libre (sobrescribe). |
| Fecha distinta a hoy | Requiere admin. |
| Fecha futura | Bloqueado siempre. |

### 5.4 Persistencia en Excel

Hoja `Plataformas` del libro `Caja_{sede}_{año}.xlsx`. Una fila por día:

| Fecha | Practisistemas | Deportivas | Total | Timestamp |
|---|---|---|---|---|

---

## 6. Módulo Gastos

**Propósito:** Registrar egresos del día con concepto libre.

### 6.1 Campos por ítem

| Campo | Regla |
|---|---|
| **Concepto** | Texto libre. No puede ser solo numérico. No puede estar vacío. |
| **Valor** | Numérico > 0. |

### 6.2 Comportamiento

- Se pueden registrar múltiples gastos el mismo día. Cada registro agrega una fila, no sobrescribe.
- El total diario se acumula con cada nuevo registro.
- Los conceptos nuevos se agregan automáticamente al catálogo local (`gastos_conceptos.json`) para autocompletado en registros futuros.

### 6.3 Reglas de edición

| Situación | Comportamiento |
|---|---|
| Fecha actual | Guardar libre. |
| Fecha distinta a hoy | Requiere admin. |
| Fecha futura | Bloqueado siempre. |

### 6.4 Persistencia en Excel

Hoja `Gastos` del libro `Caja_{sede}_{año}.xlsx`. Una fila por concepto registrado:

| Fecha | Tipo | Concepto | (vacíos) | Valor | Timestamp |
|---|---|---|---|---|---|

---

## 7. Módulo Bonos

**Propósito:** Registrar bonos entregados a clientes.

### 7.1 Campos

| Campo | Regla |
|---|---|
| **Cliente** | Texto libre. No puede ser solo numérico. No puede estar vacío. |
| **Valor** | Numérico > 0. |

### 7.2 Comportamiento de registro

- Cada bono es una entrada independiente. Se pueden registrar múltiples bonos para el mismo cliente en el mismo día.
- El total diario se muestra acumulado por todos los bonos del día.
- Se muestra el **acumulado por cliente** dentro del día para facilitar el control.
- El cliente se agrega al catálogo local (`bonos_clientes.json`) para autocompletado.

### 7.3 Editar el último bono

Permite cambiar cliente y valor del **bono con timestamp más reciente** de la fecha activa. No afecta bonos anteriores. Requiere que exista al menos un bono en la fecha.

### 7.4 Eliminar el último bono

Elimina el **bono con timestamp más reciente** de la fecha activa. El total se recalcula. Si no hay bonos, la operación no hace nada.

### 7.5 Reglas de edición

| Situación | Comportamiento |
|---|---|
| Fecha actual | Registrar, editar y eliminar libres. |
| Fecha distinta a hoy | Requiere admin. |
| Fecha futura | Bloqueado siempre. |

### 7.6 Persistencia en Excel

Hoja `Bonos` del libro `Caja_{sede}_{año}.xlsx`. Una fila por bono:

| Fecha | Tipo | Cliente | (vacíos) | Valor | Timestamp |
|---|---|---|---|---|---|

---

## 8. Módulo Préstamos

**Propósito:** Registrar préstamos y pagos por persona, manteniendo el saldo vivo.

### 8.1 Campos

| Campo | Regla |
|---|---|
| **Persona** | Texto libre. No puede ser solo numérico. No puede estar vacío. |
| **Tipo** | `prestamo` o `pago`. |
| **Valor** | Numérico > 0. |

### 8.2 Lógica de saldo

El saldo de cada persona se calcula en tiempo real sumando todos los préstamos y restando todos los pagos del histórico completo (sin límite de ciclos ni fechas):

```
Saldo pendiente = Σ préstamos − Σ pagos
```

Si el usuario intenta registrar un **pago mayor al saldo pendiente**, la operación es rechazada por el backend con mensaje de error. La validación usa el saldo calculado desde Excel en el momento del guardado.

### 8.3 Ciclos de deuda

El sistema no tiene un concepto explícito de "ciclos". Una vez que el saldo llega a cero, el usuario puede registrar un nuevo préstamo para la misma persona y el saldo vuelve a acumularse. El historial es continuo.

### 8.4 Resumen visible

La interfaz muestra por persona:
- Total prestado acumulado
- Total pagado acumulado
- Saldo pendiente vigente

### 8.5 Reglas de edición

| Situación | Comportamiento |
|---|---|
| Fecha actual | Registrar libre. |
| Fecha distinta a hoy | Requiere admin. |
| Fecha futura | Bloqueado siempre. |

No existe función de editar o eliminar un préstamo individual (a diferencia de Bonos).

### 8.6 Persistencia en Excel

Hoja `Prestamos` del libro `Caja_{sede}_{año}.xlsx`. Una fila por movimiento:

| Fecha | Tipo | Persona | (vacíos) | Valor | Timestamp |
|---|---|---|---|---|---|

---

## 9. Módulo Movimientos

**Propósito:** Registrar ingresos y salidas extraordinarias no cubiertas por otros módulos.

### 9.1 Campos

| Campo | Regla |
|---|---|
| **Tipo** | `ingreso` o `salida`. |
| **Concepto** | Texto libre. No puede ser solo numérico. No puede estar vacío. |
| **Valor** | Numérico > 0. |
| **Observación** | Texto libre opcional. |

### 9.2 Comportamiento

- Múltiples movimientos por día.
- Los conceptos se agregan al catálogo local (`movimientos_conceptos.json`) para autocompletado.
- El resumen del día muestra: Total ingresos, Total salidas, Neto (ingresos − salidas).

### 9.3 Reglas de edición

| Situación | Comportamiento |
|---|---|
| Fecha actual | Registrar libre. |
| Fecha distinta a hoy | Requiere admin. |
| Fecha futura | Bloqueado siempre. |

### 9.4 Persistencia en Excel

Hoja `Movimientos` del libro `Caja_{sede}_{año}.xlsx`. Una fila por movimiento:

| Fecha | Tipo | Concepto | (vacíos) | Valor | Timestamp |
|---|---|---|---|---|---|

---

## 10. Módulo Contadores

El módulo de mayor complejidad. Captura los contadores internos de cada máquina o ítem, calcula producción por diferencia respecto a una referencia, y gestiona casos especiales (alertas, resets técnicos, pausas).

### 10.1 Catálogo de ítems

Cada ítem tiene `item_id`, `nombre`, `denominacion` y `pausado`. El catálogo define el orden de filas en la tabla. Los ítems pausados aparecen en la tabla con estilo atenuado y no capturan valores.

### 10.2 Campos de captura por ítem

| Campo | Descripción |
|---|---|
| **Entradas** | Contador acumulado de entradas de la máquina. |
| **Salidas** | Contador acumulado de salidas. |
| **Jackpot** | Contador acumulado de jackpots. |

Los tres campos son enteros no negativos.

### 10.3 Cálculo de Yield

```
Yield actual = Entradas − Salidas − Jackpot
Yield referencia = Entradas_ref − Salidas_ref − Jackpot_ref
Resultado (unidades) = Yield actual − Yield referencia
Resultado monetario = Resultado (unidades) × Denominación
```

La referencia es el último registro guardado para ese ítem en fechas anteriores a la actual.

### 10.4 Tipos de referencia

| Tipo | Origen |
|---|---|
| `sin_referencia` | No hay historial ni startup state. El cálculo no es posible hasta tener datos previos. |
| `referencia_inicial` | Proviene de `startup_state.json`. Usado cuando no hay ningún registro real previo pero el sistema tiene una base configurada. |
| `registro` (Normal) | Último registro guardado de fechas anteriores. Es el caso habitual después del primer día. |
| `referencia_critica` | Referencia definida manualmente por admin durante el guardado del día. Aplica cuando hubo un reset técnico. |

La referencia vigente en cada fecha se determina tomando el **registro más reciente anterior a la fecha actual**, considerando también los eventos de referencia crítica ordenados cronológicamente.

El indicador de fecha de referencia se muestra como un punto `·` en la celda Yield ref. Al pasar el cursor, un tooltip muestra la fecha exacta de la referencia o la leyenda "Autorizado" si es referencia crítica.

### 10.5 Alerta por decremento

Se genera una **alerta** cuando, con la captura completa, cualquiera de los tres contadores es menor al valor correspondiente en la referencia:

```
alerta = (Entradas < Entradas_ref) OR (Salidas < Salidas_ref) OR (Jackpot < Jackpot_ref)
```

La alerta se muestra visualmente en la fila. Si el usuario intenta guardar con alertas activas y **sin** referencia crítica autorizada, el backend rechaza el guardado.

### 10.6 Referencia crítica

Mecanismo para casos donde hubo un reset técnico de los contadores de la máquina. Aparece como un micro-control (ícono ⚠ ó ✓) que se despliega como panel flotante anclado a la fila.

**Cuándo aparece el ícono:**
- Cuando se detecta una alerta (decremento respecto a referencia).
- Cuando ya fue autorizado para esa fila (muestra ✓).
- Cuando el usuario lo expandió manualmente.

**Flujo de autorización:**

1. El usuario expande el panel de referencia crítica (⚠).
2. Ingresa los valores de los contadores en el punto exacto del reset: **E** (Entradas), **S** (Salidas), **J** (Jackpot).
3. Opcionalmente ingresa el valor en el campo **Pre-reset** (producción monetaria acumulada antes del reset).
4. Ingresa la **Clave** de administrador.
5. Pulsa **OK** (o Enter en el campo Clave, o Tab desde el último campo).

**Efecto de la autorización:**
- El panel muestra ✓ y el texto "Autorizado".
- `criticaAutorizada = '1'` en el dataset de la fila.
- El yield de referencia pasa a calcularse con los valores E, S, J ingresados.
- El resultado incluye el campo Pre-reset.

**Re-edición de una referencia crítica ya autorizada:**
Si el usuario necesita corregir una referencia ya autorizada, puede expandir el panel (aunque muestre ✓). Al modificar cualquier campo, la autorización se invalida (`guardado='0'`) y el usuario debe volver a confirmar con contraseña. Esto aplica también cuando ya fue guardado en Excel, siempre que el modo admin esté activo.

**Fórmula con referencia crítica:**
```
Yield referencia = E_critica − S_critica − J_critica
Resultado (unidades) = Yield actual − Yield referencia
Resultado monetario = Resultado (unidades) × Denominación + Pre-reset
```

### 10.7 Campo Pre-reset

Permite registrar la producción monetaria acumulada hasta el momento del reset técnico. Solo activo cuando hay referencia crítica autorizada. Valor entero no negativo. Se suma directamente al resultado monetario del ítem en el período.

### 10.8 Pausa de ítems

Desde el micro-control ⏸ de cada fila (requiere contraseña admin):

- **Pausar:** el ítem queda marcado como `pausado: true` en el catálogo. Aparece visualmente atenuado. No se captura ni guarda en el período. No contribuye al total.
- **Reactivar:** con el ícono ▶ en la fila pausada. El ítem vuelve a estado normal.

La pausa/reactivación es persistente en `contadores_items.json`. No afecta el historial de registros pasados.

### 10.9 Guardado

El guardado envía todos los ítems activos (no pausados). Las reglas:

- Si `usar_referencia_critica = true`, el payload debe incluir el objeto `referencia_critica` completo (E, S, J, observacion) y `forzar = true` (admin). Sin esto, el backend rechaza el ítem.
- Los ítems con alerta no autorizada son omitidos del guardado; si hay alguno, el guardado completo falla con mensaje de error.
- El campo `produccion_pre_reset` solo se persiste si `usar_referencia_critica = true`; en caso contrario se guarda como `0`.

### 10.10 Reglas de edición

| Situación | Comportamiento |
|---|---|
| Fecha sin registro | Guardar libre. |
| Fecha con registro | Requiere admin para sobrescribir. |
| Fecha futura | Bloqueado siempre. |

### 10.11 Persistencia en Excel

Hoja `Contadores` del libro `Caja_{sede}_{año}.xlsx`. Una fila por ítem por día:

| Fecha | item_id | nombre | denominacion | entradas | salidas | jackpot | yield_actual | ref_entradas | ref_salidas | ref_jackpot | yield_referencia | produccion_pre_reset | observacion | resultado_monetario | Timestamp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

`ref_entradas/salidas/jackpot` son `None` cuando no hubo referencia crítica (caso normal).

### 10.12 Borradores en sesión

Los valores capturados en Contadores se guardan automáticamente en `sessionStorage` mientras el usuario escribe. Si la página se recarga (F5), los valores se restauran. Los borradores se identifican por `item_id` y se eliminan al guardar o limpiar.

---

## 11. Módulo Cuadre

**Propósito:** Calcular el cierre contable de un período, comparando la caja teórica (calculada desde todos los módulos) con la caja física (Caja del día del cuadre).

### 11.1 Precondiciones

Para poder calcular el Cuadre de una fecha, el sistema exige:

1. Que existan **Contadores** guardados para esa fecha.
2. Que exista **Caja** guardada para esa fecha.

Si falta alguno, la interfaz muestra un mensaje de bloqueo y no permite guardar.

### 11.2 Período del cuadre

El período es el rango de días desde el día siguiente al **último cuadre previo** hasta la **fecha del cuadre actual**, ambos inclusive.

Si no existe ningún cuadre previo:
- Se usa la fecha de inicio del `startup_state` como punto de partida.
- Dentro de ese rango, se toma como inicio la primera fecha en que aparece algún registro en cualquier módulo.

Si tampoco hay `startup_state` activo, el período es solo el día del cuadre.

### 11.3 Fórmula del cuadre

```
Caja teórica =
    Base anterior
  + Total contadores (resultado monetario del período)
  + Practisistemas (suma del período)
  + Deportivas (suma del período)
  − Bonos (suma del período)
  − Gastos (suma del período)
  + Neto préstamos (pagos recibidos − préstamos entregados del período)
  + Neto movimientos (ingresos − salidas del período)

Diferencia = Caja física − Caja teórica
Base nueva = Caja física
```

La **caja física** viene exclusivamente del registro de Caja del **día del cuadre** (no del período). Los demás módulos se acumulan por todo el período.

### 11.4 Base anterior

Es el valor de `base_nueva` del cuadre inmediatamente anterior. En el primer cuadre:
- Si `startup_state` está activo: usa `caja_inicial`.
- Si no: el usuario puede ingresar una base manualmente en la interfaz (campo editable en el formulario del Cuadre).

### 11.5 Vista del cuadre

La interfaz muestra:

- **Período:** fechas de inicio y fin.
- **Desglose de caja física:** billetes por denominación, monedas, billetes viejos, total.
- **Detalle por módulo:** total de cada módulo en el período.
- **Contadores:** resultado por ítem (nombre y monto).
- **Bonos:** top 5 clientes y total.
- **Gastos:** listado de conceptos y total.
- **Préstamos:** resumen por persona (prestado, pagado, neto) y totales.
- **Movimientos:** total ingresos, total salidas, neto.
- **Cuadre final:** Caja teórica, Caja física, **Diferencia** (positiva = sobrante, negativa = faltante).

### 11.6 Reglas de edición

| Situación | Comportamiento |
|---|---|
| Fecha sin cuadre previo | Calcular y guardar libre. |
| Fecha con cuadre ya guardado | Requiere admin para sobrescribir. |
| Fecha futura | Bloqueado siempre. |

### 11.7 Persistencia en Excel

**Archivo separado:** `Consolidado_{sede}_{año}.xlsx`, hoja `Cuadre`. Una fila por cuadre guardado:

| Fecha cuadre | Fecha inicio período | Base anterior | Total contadores | Practisistemas | Deportivas | Bonos | Gastos | Préstamos salida | Préstamos entrada | Neto préstamos | Mov. ingresos | Mov. salidas | Neto movimientos | Caja teórica | Caja física | Diferencia | Base nueva | Timestamp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

---

## 12. Persistencia general — Archivos Excel

### 12.1 Estructura de archivos

| Archivo | Contenido |
|---|---|
| `Caja_{sede}_{año}.xlsx` | Módulos operativos: Caja, Plataformas, Gastos, Bonos, Prestamos, Movimientos, Contadores |
| `Consolidado_{sede}_{año}.xlsx` | Cuadre |

Un par de archivos por sede y por año. La normalización del nombre de sede elimina tildes, espacios y caracteres especiales.

### 12.2 Lock de archivo

Antes de abrir un archivo para escritura, el sistema crea un archivo `.lock` en la misma carpeta. Al terminar, lo elimina. Si el lock ya existe cuando se intenta escribir, la operación falla con un mensaje de error indicando que el archivo está en uso. Esto protege contra escrituras simultáneas en el mismo equipo.

### 12.3 Libro abierto en Excel

Si el archivo `.xlsx` está abierto en Excel en el mismo equipo, openpyxl detectará el error de acceso y el sistema devuelve el mensaje de archivo ocupado sin corromper el libro.

### 12.4 Reemplazo de fechas

Cuando se guarda sobre una fecha existente (con admin), el sistema elimina todas las filas de esa fecha en la hoja correspondiente y escribe las nuevas. Nunca se acumulan filas duplicadas de la misma fecha en un módulo.

### 12.5 Catálogos locales

Archivos JSON que viven junto al ejecutable y no se sincronizan por Dropbox:

| Archivo | Contenido |
|---|---|
| `settings.json` | Sede, carpeta de datos, módulos habilitados, módulo por defecto |
| `startup_state.json` | Base inicial: fecha, caja, referencias de contadores |
| `contadores_items.json` | Catálogo de ítems de Contadores (id, nombre, denominación, pausa) |
| `bonos_clientes.json` | Catálogo de clientes para autocompletado en Bonos |
| `gastos_conceptos.json` | Catálogo de conceptos para autocompletado en Gastos |
| `prestamos_personas.json` | Catálogo de personas para autocompletado en Préstamos |
| `movimientos_conceptos.json` | Catálogo de conceptos para autocompletado en Movimientos |

---

## 13. Validaciones de modelos (backend)

El backend valida todos los datos de entrada con Pydantic v2. Las reglas:

### 13.1 Reglas generales

- Las fechas futuras son rechazadas en todos los módulos.
- Los campos de texto (`concepto`, `cliente`, `persona`) no pueden ser solo numéricos ni vacíos.
- Los valores monetarios deben ser > 0 en Bonos, Préstamos y Movimientos.
- Los contadores (Entradas, Salidas, Jackpot, Pre-reset) no pueden ser negativos.
- El campo `forzar: true` habilita sobrescritura y edición de fechas pasadas; el frontend solo lo envía cuando el modo admin está activo.

### 13.2 Validaciones específicas por módulo

**Caja:**
- Solo denominaciones reconocidas en `DENOMINACIONES` (1, 2, 5, 10, 20, 50, 100, 200).
- Cantidades enteras ≥ 0.
- `total_monedas` y `billetes_viejos` ≥ 0.

**Plataformas:**
- `venta_practisistemas` ≥ 0.
- `venta_deportivas` puede ser negativa (sin validación de signo).

**Préstamos:**
- `tipo_movimiento` debe ser exactamente `prestamo` o `pago`.
- Un pago no puede superar el saldo pendiente actual de la persona (validado en el servicio, no en el modelo).

**Movimientos:**
- `tipo_movimiento` debe ser exactamente `ingreso` o `salida`.

**Contadores:**
- Si `usar_referencia_critica = true`, el objeto `referencia_critica` no puede ser `None`.
- Los valores de referencia crítica (E, S, J) no pueden ser negativos.
- El `item_id` no puede estar vacío.

**Catálogo de Contadores:**
- `item_id` y `nombre` no pueden estar vacíos.
- `denominacion` debe ser > 0.
- IDs duplicados en un mismo guardado de catálogo: se conserva el primero y se descartan los siguientes.

---

## 14. API REST — resumen de endpoints

Todos bajo el prefijo `/api`.

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/api/settings` | Obtiene configuración actual y hojas activas |
| POST | `/api/settings` | Guarda configuración |
| GET | `/api/settings/startup` | Obtiene estado de inicio |
| POST | `/api/settings/startup` | Guarda estado de inicio |
| POST | `/api/settings/browse-directory` | Abre selector de carpeta |
| POST | `/api/app/heartbeat` | Ping de vida del navegador |
| POST | `/api/app/shutdown` | Apaga el servidor |
| GET | `/api/modulos/{modulo}/fecha/{fecha}/estado` | Estado de la fecha en un módulo |
| GET | `/api/modulos/{modulo}/fecha/{fecha}/datos` | Datos guardados de una fecha |
| GET | `/api/modulos/{modulo}/ultima-fecha` | Última fecha registrada en un módulo |
| POST | `/api/modulos/{modulo}/guardar` | Guarda datos de módulos simples (gastos, bonos, prestamos, movimientos) |
| POST | `/api/modulos/caja/guardar` | Guarda Caja |
| POST | `/api/modulos/plataformas/guardar` | Guarda Plataformas |
| POST | `/api/modulos/contadores/guardar` | Guarda Contadores |
| POST | `/api/modulos/cuadre/guardar` | Guarda Cuadre |
| GET | `/api/modulos/cuadre/calcular/{fecha}` | Calcula cuadre sin guardar |
| GET | `/api/modulos/cuadre/fecha/{fecha}/estado` | Estado del cuadre para una fecha |
| GET | `/api/modulos/cuadre/fecha/{fecha}/datos` | Datos del cuadre guardado |
| POST | `/api/modulos/bonos/editar-ultimo` | Edita el último bono de la fecha |
| POST | `/api/modulos/bonos/eliminar-ultimo` | Elimina el último bono de la fecha |
| GET | `/api/modulos/contadores/catalogo` | Obtiene el catálogo de ítems |
| POST | `/api/modulos/contadores/catalogo` | Guarda el catálogo de ítems |
| POST | `/api/modulos/contadores/pausa` | Pausa o reactiva un ítem |
| GET | `/api/modulos/contadores/fecha/{fecha}` | Base completa de Contadores para una fecha |
| GET | `/api/modulos/nombres/{tipo}` | Obtiene catálogo de nombres (bonos, gastos, etc.) |
| POST | `/api/modulos/nombres/{tipo}/importar` | Importa nombres desde texto |

**Nota de orden de rutas:** el endpoint específico `POST /api/modulos/cuadre/guardar` está registrado **antes** de `POST /api/modulos/{modulo}/guardar` para evitar que FastAPI capture "cuadre" como valor del parámetro `{modulo}`.
