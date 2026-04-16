# Análisis Técnico — CajaJDW

## Resumen

CajaJDW ya funciona como una capa operativa por encima de Excel. Ese es su valor actual:

- reduce edición manual directa sobre hojas
- centraliza validaciones
- controla cierres
- mejora la corrección de datos
- mantiene Excel como respaldo y salida analítica

## Arquitectura

Capas principales:

1. launchers Python / EXE
2. FastAPI
3. frontend web local
4. servicios por módulo
5. persistencia Excel

## Arranque

El arranque ya no es el del prototipo original.

Hoy incluye:

- instancia única
- splash
- espera del servidor antes de abrir navegador
- protección contra pestañas duplicadas al hacer varios clics

Archivo central:

- [launcher_boot.py](../launcher_boot.py)

Esto mejoró mucho la experiencia del ejecutable, especialmente para usuarios no técnicos.

## Persistencia

El sistema sigue teniendo una decisión fuerte:

- Excel es la fuente de verdad

Eso tiene ventajas:

- adopción rápida
- continuidad con el proceso real del negocio
- facilidad de revisión manual
- compatibilidad con Power Query

Y también límites:

- no hay transacciones reales
- no hay concurrencia distribuida fuerte
- Dropbox no reemplaza una base de datos

## Servicios críticos

### `excel_service.py`

Es el corazón técnico de la persistencia.

Responsabilidades:

- lectura por módulo
- escritura por módulo
- reemplazo por fecha
- búsqueda de períodos
- lectura de `Cuadre` y dependencia entre cierres

Es el punto más delicado del sistema.

### `contadores_service.py`

Es el módulo con mayor complejidad de negocio.

Hoy resuelve:

- referencias vigentes
- referencia crítica
- pausas por fecha
- guardado controlado

La mejora más importante fue abandonar la pausa global del catálogo y pasar a una pausa temporal por fecha.

### `cuadre_service.py`

Ya no solo calcula el cierre; también coordina resincronización.

Puntos clave:

- recalcula el `Cuadre` afectado por una corrección
- si una corrección en `Caja` cambia `base_nueva`, arrastra el siguiente cierre

Eso corrige un problema contable real que antes quedaba desalineado.

## Diferencia entre Resumen y Cuadre

`Resumen`:

- consolida por período
- sirve para lectura operativa
- no hace balance físico vs teórico

`Cuadre`:

- sí hace el cierre contable
- depende de `base_anterior`
- define `base_nueva`

Técnicamente, `Cuadre` tiene dependencia encadenada entre cierres.  
`Resumen` no.

## Fortalezas actuales

- muy alineado con la operación real
- sin dependencia de infraestructura compleja
- instalación y despliegue simples
- build distribuible por rama
- buena cobertura funcional para el tamaño actual de la operación

## Riesgos actuales

- Excel compartido sigue siendo frágil si dos equipos escriben el mismo libro
- varios comportamientos dependen del reloj local del equipo
- `app.js` y `excel_service.py` siguen concentrando bastante responsabilidad
- la seguridad es operativa, no robusta

## Qué ya mejoró mucho

### 1. Arranque

Antes:

- doble clic podía provocar múltiples pestañas o confusión

Ahora:

- el launcher es predecible

### 2. Contadores

Antes:

- la pausa era global y podía contaminar históricos

Ahora:

- la pausa es temporal y acotada por ítem

### 3. Cuadre

Antes:

- una corrección podía dejar cierres siguientes con base desactualizada

Ahora:

- la base de `Caja` puede cascader al siguiente `Cuadre`

## Evolución futura

La siguiente decisión grande no será de frontend ni de launcher, sino de persistencia.

Cuando la operación crezca, lo natural será:

- mover la operación principal a base de datos
- dejar Excel como:
  - respaldo
  - exportación
  - insumo analítico

Eso tendría sentido especialmente si:

- aumenta la concurrencia
- se necesita mejor trazabilidad
- Dropbox deja de ser suficiente

## Conclusión

Hoy CajaJDW ya es una aplicación operativa real, no un simple “frontend para Excel”.

El sistema ganó:

- control de captura
- control de cierres
- corrección más segura
- mejor experiencia de arranque

Su siguiente límite natural no es funcional, sino estructural:

- cuándo dejar de usar Excel como backend primario
