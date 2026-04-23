# Plan de Pruebas — CajaJDW

## Objetivo

Este documento define una base de pruebas funcionales y operativas para validar el comportamiento actual de CajaJDW antes de considerar el sistema estable para uso continuo o antes de introducir cambios importantes.

Las pruebas están organizadas por:

- configuración general
- persistencia
- módulos funcionales
- concurrencia
- regresión operativa

## Alcance

Este plan cubre:

- validación manual funcional
- consistencia de guardado en Excel
- reglas de edición por fecha
- comportamiento con admin y sin admin
- riesgos asociados a uso con Dropbox

No cubre todavía:

- pruebas automatizadas
- pruebas de carga formales
- seguridad avanzada
- despliegue Linux completo

## Preparación del entorno

Antes de iniciar las pruebas:

1. Preparar una carpeta de pruebas dedicada, preferiblemente en Dropbox.
2. Configurar al menos dos sedes de prueba si se quiere validar separación por sede.
3. Tener un libro Excel de prueba por sede o permitir que la app lo cree.
4. Verificar que el equipo tenga permisos de lectura y escritura sobre la carpeta.
5. Confirmar que el archivo no esté abierto en Excel al inicio.

## Datos base sugeridos

Usar datos simples y repetibles:

- sede: `SatingaPrueba`
- fecha actual
- fecha anterior
- una fecha antigua del mismo año
- denominaciones normales de caja
- 3 clientes de bonos
- 3 personas para préstamos
- 3 conceptos de gastos
- 3 conceptos de movimientos
- 3 ítems de contadores

Catálogo sugerido para contadores:

```text
M01 | Ruleta 1 | 100
M02 | Ruleta 2 | 200
M03 | Máquina 3 | 500
```

## Criterios generales de aceptación

Se considera que una prueba pasa cuando:

- la app muestra el resultado esperado
- la API responde coherentemente
- el Excel queda consistente con la operación
- no aparecen errores inesperados
- al recargar la vista, los datos siguen correctos

## Matriz de prioridad

| Prioridad | Significado |
|---|---|
| Alta | riesgo operativo inmediato |
| Media | riesgo funcional importante, no bloqueante |
| Baja | mejora o verificación complementaria |

## Pruebas generales

## PG-01 — Inicio local

Prioridad: Alta

Pasos:

1. Ejecutar `python launcher.py` o abrir el `.exe`.
2. Confirmar que el navegador se abre automáticamente.
3. Confirmar que la interfaz carga sin errores.

Resultado esperado:

- la app abre correctamente
- la fecha y módulos visibles coinciden con la configuración

## PG-02 — Guardado de configuración

Prioridad: Alta

Pasos:

1. Entrar a Administración.
2. Cambiar sede, carpeta y módulos habilitados.
3. Guardar configuración.
4. Cerrar y volver a abrir la aplicación.

Resultado esperado:

- la configuración persiste en `data/settings.json`
- al reiniciar, la app conserva la configuración guardada

## PG-03 — Archivos anuales por sede

Prioridad: Alta

Pasos:

1. Configurar una sede nueva.
2. Guardar un registro operativo (Caja, Contadores, etc.).
3. Guardar un Cuadre.
4. Revisar la carpeta configurada.

Resultado esperado:

- se crea `Contadores_<SEDE>_<AÑO>.xlsx` con los módulos operativos
- se crea `Consolidado_<SEDE>_<AÑO>.xlsx` con el Cuadre
- ambos archivos corresponden a la sede configurada

## PG-04 — Separación entre sedes

Prioridad: Alta

Pasos:

1. Configurar sede A y guardar registros.
2. Cambiar a sede B y guardar registros.
3. Revisar los archivos generados.

Resultado esperado:

- cada sede escribe en su propio archivo
- no se mezclan registros entre sedes

## Pruebas de Caja

## CJ-01 — Guardado en modo cantidad

Prioridad: Alta

Pasos:

1. Configurar modo de entrada `cantidad`.
2. Ingresar cantidades en varias denominaciones.
3. Ingresar monedas y billetes viejos.
4. Guardar.

Resultado esperado:

- el total visible coincide con el cálculo manual
- se guardan filas de caja para la fecha
- al recargar la fecha, los valores se reconstruyen correctamente

## CJ-02 — Guardado en modo total por denominación

Prioridad: Alta

Pasos:

1. Cambiar modo de entrada a total por denominación.
2. Ingresar subtotales por billete.
3. Guardar.

Resultado esperado:

- el sistema calcula cantidades derivadas
- el total final es consistente

## CJ-03 — Corrección de fecha existente sin admin

Prioridad: Alta

Pasos:

1. Guardar una caja para una fecha.
2. Intentar volver a guardar sobre la misma fecha sin autorización admin.

Resultado esperado:

- la app bloquea la operación
- el usuario recibe un mensaje claro

## CJ-04 — Corrección de fecha existente con admin

Prioridad: Alta

Pasos:

1. Guardar una caja para una fecha.
2. Autorizar admin.
3. Guardar nuevos valores sobre la misma fecha.

Resultado esperado:

- la fecha se reemplaza correctamente
- en Excel no quedan filas duplicadas de la misma caja reemplazada

## CJ-05 — Fecha futura

Prioridad: Alta

Pasos:

1. Seleccionar una fecha futura.
2. Intentar guardar.

Resultado esperado:

- la app bloquea el guardado

## Pruebas de Plataformas

## PL-01 — Guardado del día

Prioridad: Alta

Pasos:

1. Ingresar valores en Practisistemas y Deportivas.
2. Guardar.

Resultado esperado:

- el total se calcula correctamente
- se guarda una fila en la hoja de Plataformas

## PL-02 — Deportivas negativa

Prioridad: Media

Pasos:

1. Ingresar Practisistemas positiva.
2. Ingresar Deportivas negativa.
3. Guardar.

Resultado esperado:

- el sistema permite el valor según la lógica actual
- el total final queda correcto

## PL-03 — Fecha distinta a hoy sin admin

Prioridad: Alta

Pasos:

1. Elegir una fecha anterior.
2. Intentar guardar sin autorización.

Resultado esperado:

- la app bloquea la operación

## Pruebas de Gastos

## GS-01 — Registro simple

Prioridad: Alta

Pasos:

1. Registrar un gasto con concepto y valor.

Resultado esperado:

- aparece en la tabla del día
- el total diario se actualiza
- el concepto entra al catálogo local

## GS-02 — Múltiples gastos el mismo día

Prioridad: Alta

Pasos:

1. Registrar tres gastos distintos el mismo día.

Resultado esperado:

- la tabla lista los tres
- el total coincide con la suma

## GS-03 — Fecha distinta a hoy sin admin

Prioridad: Alta

Pasos:

1. Elegir una fecha anterior.
2. Intentar registrar gasto sin admin.

Resultado esperado:

- la app bloquea la operación

## Pruebas de Bonos

## BN-01 — Registro simple

Prioridad: Alta

Pasos:

1. Registrar un bono con cliente y valor.

Resultado esperado:

- se agrega a la tabla del día
- el total diario se actualiza
- el cliente entra al catálogo local

## BN-02 — Acumulado por cliente

Prioridad: Media

Pasos:

1. Registrar dos bonos para el mismo cliente en la misma fecha.

Resultado esperado:

- la UI muestra acumulado correcto por cliente

## BN-03 — Editar último bono

Prioridad: Alta

Pasos:

1. Registrar varios bonos.
2. Editar el último.

Resultado esperado:

- solo cambia el último bono de la fecha
- el total diario se recalcula correctamente

## BN-04 — Eliminar último bono

Prioridad: Alta

Pasos:

1. Registrar varios bonos.
2. Eliminar el último.

Resultado esperado:

- desaparece solo el último bono
- el total diario se recalcula correctamente

## Pruebas de Préstamos

## PR-01 — Préstamo inicial

Prioridad: Alta

Pasos:

1. Registrar un préstamo para una persona nueva.

Resultado esperado:

- total prestado aumenta
- saldo pendiente aumenta

## PR-02 — Pago parcial

Prioridad: Alta

Pasos:

1. Con saldo pendiente existente, registrar un pago parcial.

Resultado esperado:

- total pagado aumenta
- saldo pendiente disminuye

## PR-03 — Pago total

Prioridad: Alta

Pasos:

1. Completar un pago que deje saldo en cero.

Resultado esperado:

- saldo pendiente queda en cero
- el ciclo puede considerarse cerrado en la lógica del sistema

## PR-04 — Pago mayor al saldo

Prioridad: Alta

Pasos:

1. Intentar registrar un pago mayor al saldo pendiente.

Resultado esperado:

- la app bloquea el guardado

## PR-05 — Nuevo ciclo tras saldo cero

Prioridad: Alta

Pasos:

1. Cerrar completamente un ciclo de deuda.
2. Registrar un nuevo préstamo para la misma persona.

Resultado esperado:

- el sistema maneja el nuevo ciclo como saldo activo vigente

## Pruebas de Movimientos

## MV-01 — Salida simple

Prioridad: Alta

Pasos:

1. Registrar una salida con concepto y valor.

Resultado esperado:

- aparece en el historial
- total salidas aumenta
- neto disminuye

## MV-02 — Ingreso simple

Prioridad: Alta

Pasos:

1. Registrar un ingreso con concepto y valor.

Resultado esperado:

- aparece en el historial
- total ingresos aumenta
- neto aumenta

## MV-03 — Catálogo de conceptos

Prioridad: Media

Pasos:

1. Registrar un nuevo concepto.
2. Recargar la app.

Resultado esperado:

- el concepto sigue disponible para autocompletar

## Pruebas de Contadores

## CT-01 — Captura normal

Prioridad: Alta

Pasos:

1. Configurar catálogo con al menos tres ítems.
2. Registrar contadores válidos para todos.

Resultado esperado:

- el sistema calcula yield y resultado por ítem
- el total general se calcula correctamente

## CT-02 — Guardado con referencia previa

Prioridad: Alta

Pasos:

1. Guardar contadores un día.
2. Ir al día siguiente.
3. Cargar la base para la nueva fecha.

Resultado esperado:

- la referencia vigente aparece correctamente por ítem

## CT-03 — Valor menor a referencia sin crítica

Prioridad: Alta

Pasos:

1. Cargar un ítem con valores por debajo de su referencia.
2. Intentar guardar sin referencia crítica.

Resultado esperado:

- la app bloquea el guardado

## CT-04 — Valor menor a referencia con crítica autorizada

Prioridad: Alta

Pasos:

1. Reducir un valor respecto a la referencia.
2. Abrir referencia crítica (ícono ⚠ en la fila).
3. Completar nueva referencia (campos E, S, J).
4. Si aplica, ingresar producción acumulada antes del reset en campo Pre-reset.
5. Confirmar con admin.
6. Guardar.

Resultado esperado:

- la operación se permite
- la referencia crítica queda embebida en el registro
- el campo Pre-reset suma correctamente al resultado monetario del ítem

## CT-05 — Pausar un ítem

Prioridad: Media

Pasos:

1. Pausar un ítem desde la interfaz.

Resultado esperado:

- el ítem queda marcado en pausa
- deja de capturarse normalmente

## CT-06 — Reactivar un ítem

Prioridad: Media

Pasos:

1. Reactivar un ítem pausado.

Resultado esperado:

- vuelve a mostrarse como capturable

## Pruebas de Cuadre

## CQ-00 — Archivo Consolidado

Prioridad: Alta

Pasos:

1. Tener datos completos para una fecha.
2. Guardar un Cuadre.
3. Revisar la carpeta configurada.

Resultado esperado:

- existe `Consolidado_<SEDE>_<AÑO>.xlsx` con una hoja Cuadre
- el archivo operativo `Contadores_<SEDE>_<AÑO>.xlsx` no tiene hoja Cuadre

## CQ-01 — Cuadre sin base previa

Prioridad: Alta

Pasos:

1. Asegurar que no exista cuadre anterior.
2. Tener Caja y Contadores del día.
3. Abrir módulo Cuadre.

Resultado esperado:

- el sistema pide base inicial
- permite calcular con base manual

## CQ-02 — Cuadre con base previa

Prioridad: Alta

Pasos:

1. Tener un cuadre previo.
2. Registrar operaciones en días siguientes.
3. Abrir módulo Cuadre en la fecha nueva.

Resultado esperado:

- el sistema usa la base previa automáticamente
- el período empieza después del último cuadre

## CQ-03 — Falta Caja del día

Prioridad: Alta

Pasos:

1. Tener movimientos y contadores, pero no Caja del día.
2. Abrir Cuadre.

Resultado esperado:

- el sistema bloquea el cuadre
- muestra mensaje claro

## CQ-04 — Falta Contadores del día

Prioridad: Alta

Pasos:

1. Tener Caja del día, pero no Contadores.
2. Abrir Cuadre.

Resultado esperado:

- el sistema bloquea el cuadre

## CQ-05 — Consistencia de totales

Prioridad: Alta

Pasos:

1. Registrar datos conocidos en todos los módulos.
2. Calcular el cuadre.
3. Verificar manualmente la fórmula.

Resultado esperado:

- la caja teórica coincide con el cálculo manual
- la diferencia coincide con caja física menos caja teórica

## CQ-06 — Autoguardado de Cuadre cuando el día queda listo

Prioridad: Alta

Pasos:

1. Partir de una fecha sin `Cuadre`.
2. Guardar `Caja` y `Contadores` del periodo, en cualquier orden.

Resultado esperado:

- el sistema autoguarda el `Cuadre`
- la hoja `Cuadre` queda creada en Excel sin tener que pulsar `Guardar Cuadre`

## CQ-07 — Resincronización por corrección y por cambio de Caja

Prioridad: Alta

Pasos:

1. Tener un `Cuadre` ya guardado.
2. Corregir un módulo dentro de su periodo.
3. Confirmar que el `Cuadre` afectado se actualiza.
4. Luego corregir `Caja` de un periodo que ya tenga un siguiente `Cuadre`.

Resultado esperado:

- el `Cuadre` afectado se resincroniza
- si la corrección de `Caja` cambia `base_nueva`, también se recalcula el siguiente `Cuadre`

## Pruebas de Excel y persistencia

## EX-01 — Libro abierto en Excel

Prioridad: Alta

Pasos:

1. Abrir el libro en Excel.
2. Intentar guardar desde la app.

Resultado esperado:

- la app avisa que el archivo está ocupado o en uso
- no deja el libro corrupto

## EX-02 — Relectura tras guardar

Prioridad: Alta

Pasos:

1. Guardar cualquier módulo.
2. Cambiar de fecha.
3. Volver a la fecha guardada.

Resultado esperado:

- los datos recargados coinciden con lo guardado

## EX-03 — Catálogos locales

Prioridad: Media

Pasos:

1. Registrar nuevos clientes, conceptos y personas.
2. Cerrar y reabrir la app.

Resultado esperado:

- los catálogos siguen disponibles
- los JSON locales viven dentro de `data/`

## Pruebas de concurrencia y Dropbox

## DR-01 — Doble clic en el mismo equipo

Prioridad: Alta

Pasos:

1. Con la app ya corriendo, hacer doble clic en el `.exe` nuevamente.

Resultado esperado:

- no se inicia un segundo servidor
- el navegador se abre (o se reutiliza la pestaña existente) apuntando a la instancia ya activa

## DR-02 — Dos equipos de la misma sede

Prioridad: Alta

Pasos:

1. Configurar dos equipos con la misma sede y la misma carpeta Dropbox.
2. Guardar operaciones casi simultáneas.

Resultado esperado:

- observar si Dropbox crea conflicto o versión duplicada
- documentar el comportamiento real

Nota:

Esta prueba es crítica porque refleja el límite más importante de la arquitectura actual.

## DR-03 — Dos equipos de sedes distintas

Prioridad: Alta

Pasos:

1. Configurar dos equipos con sedes distintas.
2. Guardar en paralelo.

Resultado esperado:

- no debe haber conflicto entre archivos separados

## Pruebas de regresión recomendadas después de cambios

Después de tocar código, ejecutar al menos:

1. PG-01
2. PG-02
3. PG-03
4. CJ-01
5. BN-03
6. PR-04
7. CT-03
8. CT-04
9. CQ-00
10. CQ-03
11. CQ-05
12. DR-01
13. EX-01

## Registro de resultados

Se recomienda llevar una tabla como esta:

| Caso | Fecha | Responsable | Resultado | Observaciones |
|---|---|---|---|---|
| CJ-01 | 2026-04-03 | Nombre | OK / Falla | detalle |

## Recomendación final

Si el sistema va a seguir creciendo, este plan debería convertirse más adelante en:

- pruebas manuales operativas
- pruebas automatizadas de servicios críticos
- pruebas de integración sobre Excel
- checklist de aceptación antes de distribuir una nueva versión
