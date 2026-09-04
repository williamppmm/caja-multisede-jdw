# Handoff Completo De Contexto

Este documento resume el contexto técnico y operativo más importante de este ciclo de trabajo para poder continuar en un chat nuevo sin perder continuidad.

La idea es que sirva como:
- memoria de decisiones
- mapa de arquitectura reciente
- resumen de ramas
- lista de funcionalidades ya implementadas
- lista de criterios de negocio que no deben romperse
- referencia rápida de ejecutables, archivos y flujos

---

## 1. Proyecto y ramas principales

El proyecto está en:

- `C:\Users\User\Desktop\Caja`

Ramas relevantes:

- `main`
  - versión super admin
  - usada para auditoría, revisión, correcciones y administración multisede
- `version-usuario`
  - versión operativa del digitante / usuario final
  - suele ser la primera rama donde se prueban cambios de flujo operativo diario
- `respaldo-version-especial`
  - rama especial que normalmente se reconstruye sobre la base más nueva de `version-usuario`
  - luego se reaplica su única lógica especial de `ayer()`

Patrón de trabajo acordado:

1. muchas mejoras se prueban primero en `version-usuario`
2. luego se portan selectivamente a `main`
3. después se reconstruye `respaldo-version-especial` sobre la base nueva
4. en la rama especial se reaplica solo su diferencia propia

Ese patrón ya se usó varias veces y es importante mantenerlo.

---

## 2. Archivos y binarios principales

Ejecutables en `dist`:

- `CajaSuperAdmin.exe`
  - corresponde a `main`
- `CajaJDW.exe`
  - suele usarse para `version-usuario` o para la rama especial dependiendo del `.spec` activo
- `CajaUsuarioJDW.exe`
  - binario usuario persistente visible en algunos momentos
- `CajaEspecialJDW.exe`
  - binario específico de la rama especial

En el momento de este handoff:

- `main` quedó con cambios recientes ya committeados y pusheados
- el último ajuste fuerte fue acumulación de referencias externas de `Plataformas`
- el `.exe` bueno de `main` quedó actualizado

Último `.exe` relevante de `main`:

- `dist\CajaSuperAdmin.exe`
- tamaño: `17,577,006`
- fecha: `21/04/2026 12:30:10 a. m.`

---

## 3. Estado actual de `main`

La rama `main` quedó limpia y sincronizada con remoto.

Último commit importante del cierre reciente:

- `3dd5403` — `feat: accumulate plataformas references across open periods`

`main` ahora ya tiene:

- manejo de `config_operativa.json` por sede
- manejo de `recaudo_ciclos.json`
- panel de recaudo en Caja
- administración de recaudo desde super admin
  - registrar entrega
  - cerrar ciclo
- `Cuadre` consistente con `version-usuario` para sedes con exclusión de monedas y billetes viejos
- mejoras en `Préstamos` para ciclo visible y fecha correcta
- mejora visual en mini módulo de préstamos (`Fecha / Hora`)
- corrección de resumen diario de préstamos
- referencias externas de `Plataformas` acumulables según período operativo sin cierre

---

## 4. Estado actual de `version-usuario`

`version-usuario` fue la base funcional para varias de estas mejoras.

Allí ya quedaron validadas:

- `config_operativa.json` por sede
- exclusión de `monedas` y `billetes viejos` de la `Base nueva (próximo período)`
- mini panel de recaudo en Caja
- lectura de `recaudo_ciclos.json`
- comportamiento del ciclo actual + último cierre
- mejoras de `Préstamos`
- catálogos / autocompletado de personas
- múltiples ajustes UI y flujo que luego se portaron o compararon contra `main`

Patrón importante:

- cuando se termina una tanda grande en `version-usuario`
- luego se reconstruye `respaldo-version-especial`

---

## 5. Estado actual de `respaldo-version-especial`

La rama especial se reconstruye normalmente así:

1. se aplasta / reemplaza sobre la base más nueva de `version-usuario`
2. luego se reaplica su único commit diferencial

Su diferencia propia es la lógica especial relacionada con `ayer()`, aplicada en:

- `Caja`
- `Plataformas`
- `Contadores`
- `Resumen`

Pero todo lo demás importante se intenta heredar de la base más nueva de `version-usuario`.

Esto ya se hizo varias veces durante este ciclo.

---

## 6. Decisión estructural clave: `config_operativa.json`

Uno de los puntos más importantes del proyecto es esta decisión:

### Reglas operativas por sede no deben vivir en `settings.json`

Razón:

- `settings.json` es local a una instalación
- super admin no lo comparte
- podría hacer que usuario y super admin vieran cálculos distintos

### Sí deben vivir en `config_operativa.json`

Razón:

- vive junto a los `.xlsx`
- está en el `data_dir` compartido de la sede
- lo leen tanto `version-usuario` como `main`

Ejemplo de regla ya usada:

```json
{
  "excluir_monedas_viejos_base": true
}
```

Consecuencia importante:

- si una sede activa esa regla en `config_operativa.json`
- `main` y `version-usuario` deben calcular igual el `Cuadre`

Eso no es opcional: es un criterio de consistencia clave.

---

## 7. Regla operativa de monedas y billetes viejos

Problema resuelto:

En algunas sedes:

- `monedas`
- `billetes viejos`

sí se cuentan en el cierre del día, pero:

- no entran a la caja operativa del siguiente ciclo

Entonces la regla correcta es:

- `Caja física` sigue contando todo
- pero `Base nueva (próximo período)` debe calcularse así:

```text
Base nueva = Caja física - Total monedas - Billetes viejos
```

Esto:

- ya fue implementado y validado
- debe verse exactamente igual en `main` y `version-usuario`

---

## 8. Recaudo apartado: concepto

Además de excluir monedas y billetes viejos de la base siguiente, apareció una necesidad operativa adicional:

Llevar control del dinero apartado que:

- ya no pertenece a la caja operativa del siguiente día
- pero sigue existiendo físicamente
- y debe controlarse hasta que sea entregado / recogido

Se decidió:

- no tocar la estructura de Excel
- no meter esto en `Movimientos`
- no usar otro módulo contable artificial

Se creó una solución separada:

- `recaudo_ciclos.json`

---

## 9. `recaudo_ciclos.json`

Archivo por sede, en el mismo `data_dir`.

Sirve para guardar:

- ciclo actual
- entregas registradas
- historial de cierres

La fuente de verdad de los montos diarios sigue siendo Excel.

Eso es importante:

- el JSON no duplica los valores diarios de monedas y billetes viejos
- los montos diarios se leen desde Caja
- el JSON solo guarda estado del ciclo y eventos administrativos

Ejemplo conceptual:

```json
{
  "ciclo_actual": {
    "desde": "2026-04-18",
    "entregas": []
  },
  "historial": [
    {
      "desde": "2026-04-16",
      "hasta": "2026-04-17",
      "total_monedas": 12500,
      "total_billetes_viejos": 0,
      "total_recaudado": 12500,
      "total_entregado": 12500,
      "pendiente_final": 0,
      "entregas": [
        {
          "fecha": "2026-04-18",
          "monto": 12500,
          "nota": "Entrega de lo acumulado del 16 y 17 de abril"
        }
      ]
    }
  ]
}
```

---

## 10. Lógica final aprobada del panel de recaudo

Después de varias iteraciones, la lógica aceptada del mini panel fue esta:

### Mostrar:

- ciclo vigente
- último cierre

### No mostrar:

- histórico completo
- múltiples ciclos viejos en la interfaz

### Campos del mini panel:

- `Desde`
- `Hoy`
- `Acumulado`
- `Entregado`
- `Pendiente`
- una línea compacta con el último cierre

Texto visual acordado:

- título: `Billetes viejos y monedas`
- descripción: `Dinero guardado de billetes y monedas no entregados a la fecha.`

Regla funcional del cierre:

- si el ciclo se cierra el día `18`
- se entiende que se entregó lo acumulado hasta el `17`
- y el nuevo ciclo comienza el `18`

Eso fue importante y se probó explícitamente con JSON manual.

---

## 11. Diferencia entre `version-usuario` y `main` para recaudo

### `version-usuario`

Rol:

- informar
- visualizar

Puede ver:

- el panel de recaudo
- el ciclo actual
- el último cierre

No administra:

- ni entrega
- ni cierre de ciclo

### `main`

Rol:

- administrar
- corregir
- auditar

Puede:

- ver el mismo panel
- `Registrar entrega`
- `Cerrar ciclo`

Importante:

- `Registrar entrega` y `Cerrar ciclo` solo afectan `recaudo_ciclos.json`
- no modifican los `.xlsx`

Razón:

- Excel sigue siendo la fuente del dato diario
- JSON solo guarda estado del recaudo

---

## 12. `Préstamos`: arquitectura correcta

Hubo una confusión inicial importante que ya quedó aclarada:

### `prestamos_personas.json` NO define la deuda activa

Ese JSON sirve para:

- catálogo de nombres
- autocompletado

La deuda activa real se calcula desde Excel.

### La deuda activa la decide el backend leyendo el histórico Excel

Piezas relevantes:

- `app/services/excel_service.py`
- `app/services/prestamos_service.py`

La lógica correcta del ciclo de deuda:

- si una persona queda con saldo pendiente:
  - se muestra el ciclo activo completo
- si una persona paga y el saldo vuelve a 0:
  - el ciclo se considera cerrado
- más adelante, si vuelve a tomar un préstamo:
  - comienza un nuevo ciclo

Esto ya fue alineado en `main`.

---

## 13. `Préstamos`: mejoras implementadas en `main`

Se hicieron varios ajustes importantes para alinear `main` con `version-usuario`.

### 13.1. Validación histórica por fecha

Problema:

- antes se validaba un movimiento histórico contra la deuda “actual”
- eso podía mezclar pasado con saldo futuro

Corrección:

- se agregó `fecha_hasta` a:
  - `obtener_movimientos_prestamos(...)`
  - `obtener_resumen_prestamos(...)`
- al guardar o editar histórico se valida con la fecha del movimiento

### 13.2. Edición y eliminación histórica

Se ajustó para que:

- `actualizar_prestamo_por_ts(...)`
- `eliminar_prestamo_por_ts(...)`

devuelvan el resumen recalculado con:

- `fecha_hasta=fecha`

### 13.3. Catálogo de personas

Se portó la lógica de nombres normalizados:

- `juan`
- `Juan`
- `JUAN`

deben converger al mismo valor:

- `Juan`

Eso se logró portando helpers a `nombres_service.py`.

### 13.4. Ruta vieja

La ruta antigua de préstamos no se eliminó, pero:

- se alineó para no usar una lógica distinta

### 13.5. UI del mini módulo en `main`

Se ajustó para que la tabla muestre:

- `Fecha / Hora`

en vez de solo:

- `Hora`

Y además se corrigió una inconsistencia importante:

#### Problema detectado

En una fecha como `19-04-2026`:

- la tabla derecha mostraba bien el ciclo activo acumulado
- pero el resumen izquierdo decía:
  - `Prestado del día: $330.000`

cuando realmente ese día eran:

- `$20.000`

#### Corrección

Se separó:

- `items`: ciclo visible acumulado para la tabla
- `total_prestado` y `total_pagado`: solo movimientos del día consultado
- `deuda_total_activa`: acumulada, como corresponde

Resultado esperado:

- `Prestado del día`: solo lo del día
- `Deuda total activa`: acumulada
- tabla derecha: ciclo visible acumulado

Eso ya quedó corregido en `main`.

---

## 14. `Contadores`: pausa sin borrar inputs

Se ajustó en `main` para alinearlo con la intención de `version-usuario`.

Problema:

- al pausar o reactivar un ítem en `Contadores`
- podían perderse inputs ya escritos en otras filas

Corrección:

- se preservan los valores ingresados
- se restauran correctamente al recargar
- el draft de la fecha sigue consistente

Esto fue committeado en `main`.

---

## 15. Caja en super admin: draft local y falso “cache”

Se detectó una situación en `main`:

- si se borraba una caja directamente desde el `.xlsx`
- la interfaz podía seguir mostrando valores viejos

La causa no era el Excel:

- era un draft local en `sessionStorage`

Se ajustó la lógica para que en super admin:

- si Caja ya no existe en backend/Excel
- la UI se limpie
- y no la reviva desde el draft local

Esto era importante sobre todo para auditoría y pruebas.

---

## 16. `Plataformas`: referencias externas

Hay un servicio específico:

- `app/services/plataformas_referencia_service.py`

Este servicio lee referencias externas desde archivos como:

- `Ventas_dia_Practisistemas.xlsx`
- `Ventas_dia_Bet.xlsm`

Esos datos:

- son solo referencia visual
- nunca se guardan en los `.xlsx` propios

### Problema detectado

Cuando había días con ventas en plataformas pero sin cierre/cuadre:

- el valor real digitado al día siguiente era acumulado

Ejemplo:

- `15 abril`: hubo ventas, pero no hubo cuadre
- `16 abril`: se registra el acumulado del 15 + 16

Pero antes la referencia externa mostraba solo el `16`.

Eso era confuso para super admin.

---

## 17. `Plataformas`: criterio final aprobado

El criterio correcto acordado fue:

### La referencia externa debe acumularse cuando no hubo `Cuadre` válido que corte el período

No es simplemente:

- “si faltó Caja”
- “si faltó Contadores”

El criterio bueno es:

- si la fecha pertenece a un período operativo abierto sin cierre intermedio

Entonces la referencia externa de `Plataformas` debe:

- usar el mismo período operativo que usaría `Cuadre`
- sumar referencias externas de todos los días de ese período

Ejemplo:

- `15` sin cuadre
- `16` con trabajo operativo del período

La referencia visual del `16` debe ser:

- `Practisistemas = 15 + 16`
- `Deportivas = 15 + 16`

---

## 18. `Plataformas`: implementación final en `main`

### Backend

Archivo:

- `app/services/plataformas_referencia_service.py`

Qué hace ahora:

- llama a `cuadre_service.resolver_periodo_operativo(fecha)`
- toma su período
- normaliza esas fechas
- consulta los valores externos por cada fecha
- acumula valores disponibles
- devuelve:
  - `valor`
  - `status`
  - `desde`
  - `hasta`
  - `dias`

Estados relevantes:

- `ok`
- `parcial`
- `sin_dato`
- `sin_ruta`
- `sin_mapeo`
- `archivo_no_encontrado`
- etc.

### Frontend

Archivo:

- `web/app.js`

Qué hace:

- renderiza la referencia
- si el período es de varios días, muestra algo tipo:
  - `Acum. 15-04-2026 a 16-04-2026`
- si faltó algún día externo:
  - `Acumulado parcial`

### Bug importante corregido

Después de implementar la acumulación, el panel desapareció en super admin.

Causa:

- `resolver_periodo_operativo()` estaba devolviendo fechas como strings en ese flujo
- el servicio asumía objetos `date`
- eso disparaba excepción silenciosa
- el frontend ocultaba el panel

Corrección:

- se agregó normalización de fechas (`_coerce_fecha`)
- ahora soporta strings y objetos `date`

Resultado:

- el panel volvió a mostrarse
- se mantuvo la lógica de acumulado

Esto ya quedó committeado y pusheado en `main`.

Commit:

- `3dd5403` — `feat: accumulate plataformas references across open periods`

---

## 19. Criterios de negocio que no deben romperse

### 19.1. `Cuadre`

Si una sede tiene activa la opción de excluir monedas y billetes viejos:

- `main` y `version-usuario` deben mostrar el mismo `Cuadre`

### 19.2. Recaudo

- Excel sigue siendo la fuente del dato diario
- `recaudo_ciclos.json` guarda estado administrativo
- `Registrar entrega` y `Cerrar ciclo` no deben tocar Excel

### 19.3. `Préstamos`

- la deuda activa visible se calcula desde Excel
- no desde `prestamos_personas.json`
- el resumen izquierdo y la tabla derecha no deben confundirse:
  - izquierda = día
  - derecha = ciclo visible

### 19.4. `Plataformas`

- la referencia externa no se acumula por capricho
- solo se acumula cuando no hubo `Cuadre` que corte el período operativo

### 19.5. Rama especial

- no debe evolucionar aislada
- debe reconstruirse sobre la base más nueva de `version-usuario`
- y luego reaplicar su diferencia propia

---

## 20. Archivos clave por funcionalidad

### Config operativa y settings

- `app/services/operativa_config_service.py`
- `app/services/settings_service.py`
- `app/routers/settings.py`

### Cuadre

- `app/services/cuadre_service.py`
- `app/services/excel_service.py`

### Recaudo

- `app/services/recaudo_service.py`
- `app/routers/recaudo.py`

### Préstamos

- `app/services/prestamos_service.py`
- `app/services/excel_service.py`
- `app/services/nombres_service.py`
- `app/routers/modules.py`
- `web/app.js`
- `web/index.html`

### Plataformas

- `app/services/plataformas_referencia_service.py`
- `app/routers/modules.py`
- `web/app.js`
- `web/index.html`

### Contadores

- `web/app.js`
- catálogo / referencias iniciales / pausa

---

## 21. Secuencia de trabajo recomendada para continuar en otro chat

Si se abre un chat nuevo, conviene que el nuevo contexto parta de esto:

1. proyecto `Caja`, ramas:
   - `main`
   - `version-usuario`
   - `respaldo-version-especial`
2. la decisión estructural fuerte:
   - reglas de sede en `config_operativa.json`
3. la solución de recaudo:
   - `recaudo_ciclos.json`
4. `Préstamos`:
   - ciclo visible + resumen diario separados
5. `Plataformas`:
   - referencias acumulables según período operativo sin cuadre
6. rama especial:
   - siempre se reconstruye sobre la base nueva de `version-usuario`

---

## 22. Resumen ejecutivo corto

Si hubiera que explicarlo en pocas líneas:

- `main` es la versión super admin multisede
- `version-usuario` es la versión operativa
- reglas de sede compartidas viven en `config_operativa.json`, no en `settings.json`
- el recaudo de monedas y billetes viejos se controla con `recaudo_ciclos.json`
- `Préstamos` ya quedó alineado para mostrar:
  - resumen diario correcto
  - ciclo activo visible correcto
- `Plataformas` ya acumula referencias externas cuando no hubo `Cuadre`
- la rama especial siempre se rehace sobre la base más nueva de `version-usuario`

---

## 23. Estado final al cerrar este handoff

`main`:

- limpia
- sincronizada
- último commit relevante:
  - `3dd5403`

`CajaSuperAdmin.exe`:

- actualizado
- listo para pruebas

Ruta:

- [CajaSuperAdmin.exe](C:/Users/User/Desktop/Caja/dist/CajaSuperAdmin.exe)

Documento creado para continuidad:

- [contexto-chat-handoff.md](C:/Users/User/Desktop/Caja/docs/contexto-chat-handoff.md)

