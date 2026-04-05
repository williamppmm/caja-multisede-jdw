# Análisis Técnico — CajaJDW

## Resumen ejecutivo

CajaJDW es una aplicación local orientada a captura operativa y respaldo en Excel. Su diseño actual prioriza velocidad de adopción, compatibilidad con la forma de trabajo tradicional en hojas de cálculo y facilidad de explotación posterior con Excel o Power Query.

La arquitectura es adecuada para un escenario con:

- pocos usuarios concurrentes por sede
- necesidad de seguir usando Excel como formato natural
- captura local desde equipos Windows

Su límite más importante no está en la funcionalidad diaria, sino en concurrencia distribuida, seguridad fuerte y mantenibilidad a medida que el sistema crece.

## Arquitectura general

La aplicación funciona como un sistema local cliente-servidor:

1. `launcher.py` inicia Uvicorn.
2. `app/main.py` monta FastAPI y sirve la interfaz.
3. `web/index.html` y `web/app.js` implementan la UI.
4. `app/routers/` expone la API REST.
5. `app/services/` implementa la lógica de negocio.
6. `app/services/excel_service.py` persiste en Excel.

## Capas del sistema

### Arranque

[launcher.py](C:\Users\User\Desktop\Proyectos\Caja\launcher.py)

Responsabilidades:

- detectar puerto libre entre 8000 y 8009
- iniciar el servidor local
- abrir el navegador automáticamente

Observaciones:

- útil para operación no técnica
- muy adecuado para distribución como `.exe`

### Aplicación FastAPI

[app/main.py](C:\Users\User\Desktop\Proyectos\Caja\app\main.py)

Responsabilidades:

- crear la app
- montar `/static`
- incluir routers
- servir `index.html`

### Configuración y rutas

[app/config.py](C:\Users\User\Desktop\Proyectos\Caja\app\config.py)
[app/runtime_paths.py](C:\Users\User\Desktop\Proyectos\Caja\app\runtime_paths.py)

Responsabilidades:

- definir denominaciones
- resolver nombres de archivo Excel
- resolver rutas en desarrollo o en modo `.exe`

Observaciones:

- la lógica de nombre por sede y año está bien encapsulada
- la ruta final del libro depende de `settings.json`

## Persistencia

## Modelo principal

La persistencia principal está en:

[app/services/excel_service.py](C:\Users\User\Desktop\Proyectos\Caja\app\services\excel_service.py)

Este servicio:

- abre o crea workbooks
- genera hojas por módulo y sede
- escribe encabezados y formatos
- consulta registros por fecha
- reemplaza registros de una fecha cuando se corrige
- administra un lock local `.lock`
- mantiene compatibilidad con algunos formatos legacy

## Diseño del libro

Un libro por:

- sede
- año

Una hoja por:

- Caja
- Plataformas
- Gastos
- Bonos
- Prestamos
- Movimientos
- Contadores
- Cuadre

Ventajas del diseño:

- separa bien dominios de información
- simplifica auditoría manual
- hace más estable la lectura con Power Query
- reduce conflicto entre sedes

## Limitaciones del modelo Excel

1. No hay transacciones reales.
2. No hay control distribuido entre varios equipos.
3. El lock local no resuelve conflictos entre clientes distintos.
4. Dropbox puede producir conflictos de sincronización si dos usuarios de la misma sede escriben casi a la vez.

Conclusión:

- como almacenamiento operativo local es válido
- como almacenamiento multiusuario concurrente es frágil

## Modelos de datos

[app/models/caja_models.py](C:\Users\User\Desktop\Proyectos\Caja\app\models\caja_models.py)
[app/models/contadores_models.py](C:\Users\User\Desktop\Proyectos\Caja\app\models\contadores_models.py)
[app/models/cuadre_models.py](C:\Users\User\Desktop\Proyectos\Caja\app\models\cuadre_models.py)

La validación de entrada con Pydantic cubre bien:

- tipos
- no negativos
- obligatoriedad de campos clave
- tipos válidos de movimiento
- estructura requerida para referencia crítica

Esto le da a la app una base bastante sana del lado backend.

## Routers

## Router principal

[app/routers/modules.py](C:\Users\User\Desktop\Proyectos\Caja\app\routers\modules.py)

Agrupa endpoints para:

- guardar registros
- consultar estado por fecha
- consultar datos de una fecha
- consultar última fecha registrada
- administrar catálogos
- operaciones especiales como editar/eliminar último bono

Observación:

- el router es claro y funcional
- la API es relativamente consistente
- varios endpoints están muy orientados a la interfaz actual

## Router de settings

[app/routers/settings.py](C:\Users\User\Desktop\Proyectos\Caja\app\routers\settings.py)

Responsabilidades:

- leer settings
- guardar settings
- abrir selector de carpeta
- apagar la app

Observación:

- suficiente para una app local de escritorio

## Servicios por módulo

## Caja y módulos simples

[app/services/caja_service.py](C:\Users\User\Desktop\Proyectos\Caja\app\services\caja_service.py)

Contiene la lógica para:

- construir filas de Caja
- construir filas de módulos simples por items
- guardar Caja
- guardar Plataformas
- guardar Gastos
- consultar estado de edición por fecha

Fortalezas:

- lógica clara
- separación razonable entre preparación de filas y persistencia

## Bonos

[app/services/bonos_service.py](C:\Users\User\Desktop\Proyectos\Caja\app\services\bonos_service.py)

Responsabilidades:

- registrar bono
- consultar bonos por fecha
- actualizar último bono
- eliminar último bono

Punto importante:

- el criterio de “último bono” depende del timestamp más reciente de la fecha

## Préstamos

[app/services/prestamos_service.py](C:\Users\User\Desktop\Proyectos\Caja\app\services\prestamos_service.py)

Responsabilidades:

- registrar préstamo o pago
- impedir pagos mayores al saldo pendiente
- devolver resumen vigente

Punto importante:

- la lógica de saldo vivo depende del historial consolidado leído desde Excel

## Movimientos

[app/services/movimientos_service.py](C:\Users\User\Desktop\Proyectos\Caja\app\services\movimientos_service.py)

Responsabilidades:

- registrar ingresos y salidas extraordinarias
- resumir netos del día

## Contadores

[app/services/contadores_service.py](C:\Users\User\Desktop\Proyectos\Caja\app\services\contadores_service.py)

Es el módulo de mayor complejidad.

Responsabilidades:

- administrar catálogo de ítems
- pausar o reactivar ítems
- reconstruir referencias vigentes desde historial
- calcular yield actual
- detectar alertas
- exigir referencia crítica si hay decrementos frente a referencia

Lógica central:

- cada ítem tiene una referencia vigente basada en eventos anteriores
- si el valor actual baja respecto a esa referencia, se bloquea el guardado normal
- si el usuario tiene admin, puede definir una nueva referencia crítica

Esto convierte el módulo en algo más cercano a control operativo que a mera captura.

## Cuadre

[app/services/cuadre_service.py](C:\Users\User\Desktop\Proyectos\Caja\app\services\cuadre_service.py)

Responsabilidades:

- encontrar último cuadre previo
- calcular el período contable
- verificar precondiciones
- sumar y restar los módulos implicados
- comparar caja teórica vs caja física
- guardar el resultado final del cierre

Fortalezas:

- lógica útil y bastante bien alineada con el negocio
- contempla períodos de varios días
- permite primera base manual

Riesgo:

- cualquier inconsistencia previa en módulos origen afecta el cuadre completo

## Frontend

[web/index.html](C:\Users\User\Desktop\Proyectos\Caja\web\index.html)
[web/app.js](C:\Users\User\Desktop\Proyectos\Caja\web\app.js)

## Estado actual

El frontend es una SPA simple sin framework.

`app.js` concentra:

- render de módulos
- validaciones
- control de pestañas
- manejo de fecha
- autorización admin
- consumo de API
- borradores temporales de Caja y Contadores
- render del Cuadre
- administración de catálogos

Ventajas:

- desarrollo rápido
- baja complejidad de tooling
- fácil despliegue con FastAPI + estáticos

Desventajas:

- demasiada responsabilidad en un solo archivo
- alto acoplamiento al DOM
- cambios de UI pueden afectar lógica lateral

## Seguridad

Estado actual:

- existe una contraseña admin fija en frontend
- la autorización se usa para habilitar correcciones y acciones especiales

Problema:

- no debe considerarse seguridad real
- cualquier persona con acceso al frontend o al código puede verla

Conclusión:

- esto sirve como barrera operativa básica
- no sirve como control fuerte ni auditoría real

## Compatibilidad con Windows y Linux

## Windows

Es la plataforma mejor soportada hoy.

Razones:

- `.bat`
- scripts PowerShell
- empaquetado con PyInstaller
- selectores de archivos y carpetas integrados

## Linux

Todavía no es prioridad, pero el análisis deja claro lo siguiente:

Lo más portable:

- FastAPI
- servicios Python
- estructura de datos
- lógica de negocio

Lo menos portable:

- scripts de instalación
- build actual del `.exe`
- parte de la experiencia de escritorio
- selectores de archivo orientados a Windows

## Riesgos principales

1. Persistencia distribuida frágil con Dropbox.
2. Seguridad admin débil.
3. `excel_service.py` demasiado central y crítico.
4. `web/app.js` demasiado grande y acoplado.
5. Ausencia de pruebas automatizadas.
6. Dependencia fuerte de Windows para distribución cómoda.

## Prioridades de prueba

## Alta prioridad

- corrección de fechas existentes
- guardado concurrente con libro abierto
- comportamiento de Contadores con referencia crítica
- préstamos con varios ciclos de deuda
- cuadre en períodos de varios días
- validación contra conflicto de Dropbox entre equipos de la misma sede

## Media prioridad

- migración desde hojas legacy
- catálogos locales en instalaciones distintas
- edición del último bono
- cambio de sede o carpeta compartida

## Baja prioridad por ahora

- compatibilidad Linux
- refactor frontend
- desacoplar persistencia Excel de la lógica de negocio

## Escenarios recomendados de evolución

## Escenario 1: seguir con Excel como operación principal

Conviene si:

- la concurrencia sigue siendo baja
- una sede no tiene muchos capturadores simultáneos
- el valor principal sigue siendo rapidez y familiaridad con Excel

En este escenario conviene mejorar:

- documentación operativa
- pruebas manuales
- backups
- revisión de conflictos de Dropbox

## Escenario 2: Excel como respaldo y MySQL como fuente principal

Conviene si:

- varias personas capturan sobre la misma sede
- se necesita mejor auditoría
- se requiere seguridad real
- se quiere crecer sin depender de sincronización de archivos

En ese escenario:

- MySQL sería la fuente transaccional
- la app seguiría capturando igual desde frontend
- Excel pasaría a exportación o réplica analítica
- Power Query seguiría siendo útil

## Conclusión

CajaJDW ya no es un boceto. Tiene lógica operativa real y una base bastante sólida para el escenario actual de trabajo por sede con respaldo en Excel.

Su mayor valor hoy es que encaja con la operación real del negocio sin obligar a abandonar Excel.

Su mayor límite futuro es que Excel compartido no escala bien como fuente operativa multiusuario.

La decisión futura más importante no será “si seguir con Excel”, sino cuándo conviene que Excel deje de ser la fuente primaria y pase a ser salida o respaldo de una base central.
