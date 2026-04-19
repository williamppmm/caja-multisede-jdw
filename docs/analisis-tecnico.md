# Análisis Técnico — CajaJDW

## Resumen

CajaJDW ya funciona como una capa operativa por encima de Excel.

Su valor actual es:

- reduce edición manual directa sobre hojas
- centraliza validaciones
- controla cierres
- mejora la corrección de datos
- mantiene Excel como respaldo operativo y salida analítica

## Arquitectura

Capas principales:

1. launcher Python / `.exe`
2. FastAPI
3. frontend web local
4. servicios por módulo
5. persistencia Excel y JSON auxiliares

## Arranque y launcher

El arranque ya no es el del prototipo original.

Hoy incluye:

- instancia única
- splash de inicio
- espera del servidor antes de abrir navegador
- reducción de pestañas duplicadas al hacer varios clics

Archivos principales:

- [launcher_boot.py](../launcher_boot.py)
- [launcher.py](../launcher.py)
- [launcher_super_admin.py](../launcher_super_admin.py)

### Rol de `launcher_boot.py`

`launcher_boot.py` concentra la lógica compartida de:

- mutex por instancia
- selección y reserva de puerto
- splash
- poll del servidor
- apertura de navegador
- apagado controlado

Eso hace que el launcher ya no sea un script menor, sino una parte real de la experiencia de producto.

## `.spec` y empaquetado

El `.spec` no es accesorio en este proyecto.

Define:

- qué launcher entra al build
- qué recursos se empaquetan
- cómo se configura splash
- si el ejecutable es windowed

### Convención actual

En `main`:

- [CajaSuperAdmin.spec](../CajaSuperAdmin.spec)

En ramas operativas:

- `CajaJDW.spec`

La regla actual es:

- **un `.spec` oficial por rama**
- **un `.exe` final por rama**

Esto permite que otro equipo clone la rama correcta y tenga ya el `.spec` esperado para construir sin recrearlo manualmente.

## Persistencia

La decisión técnica fuerte del sistema sigue siendo:

- Excel es la fuente de verdad operativa

Ventajas:

- adopción rápida
- continuidad con el proceso real del negocio
- facilidad de revisión manual
- compatibilidad con Power Query

Límites:

- no hay transacciones reales
- no hay concurrencia distribuida fuerte
- Dropbox / OneDrive no sustituyen una base de datos

## Distribución de datos

Por sede y año existen dos libros:

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

Archivos auxiliares:

- `contadores_items.json`
- `contadores_pausas.json`
- `startup_state.json`

## Servicios críticos

### `excel_service.py`

Es el corazón técnico de la persistencia.

Responsabilidades:

- lectura por módulo
- escritura por módulo
- reemplazo por fecha o registro
- búsqueda de períodos
- lectura de `Cuadre`
- resolución de archivos por sede y año

Es el punto más delicado del sistema por densidad funcional y por dependencia del backend Excel.

### `contadores_service.py`

Es el módulo con mayor complejidad de negocio.

Hoy resuelve:

- referencias vigentes
- referencia crítica
- pausa por fecha
- guardado controlado
- soporte a filas congeladas

La mejora técnica más importante fue abandonar la pausa global del catálogo y pasar a una pausa temporal por fecha.

### `cuadre_service.py`

Ya no solo calcula cierres; también coordina resincronización.

Puntos clave:

- recalcula el `Cuadre` afectado por una corrección
- si una corrección en `Caja` cambia `base_nueva`, arrastra el siguiente cierre

Eso corrige un problema contable real que antes quedaba desalineado.

### `resumen_service.py`

Existe en las ramas operativas y encapsula la consolidación de período para `Resumen`.

Técnicamente:

- no hace balance físico vs teórico
- no encadena cierres
- sirve como lectura operativa agregada del período

## Diferencia técnica entre Resumen y Cuadre

`Resumen`:

- consolida por período
- sirve para lectura operativa
- no hace balance físico vs teórico
- no define bases para el siguiente cierre

`Cuadre`:

- sí hace cierre contable
- depende de `base_anterior`
- define `base_nueva`
- puede encadenarse con el siguiente cierre

## Seguridad real vs restricción operativa

El proyecto no implementa autenticación robusta como objetivo principal.

Las contraseñas del frontend hoy cumplen una función distinta:

- restricción operativa
- reducción de edición accidental
- aviso de fecha incorrecta

Eso es útil para operación, pero no debe interpretarse como seguridad fuerte de backend.

## Riesgo operativo real: Excel y locking

La app ya tiene mejoras de locking y coordinación local, pero el riesgo estructural importante sigue siendo Excel compartido.

Escenarios delicados:

- dos equipos escribiendo el mismo libro de la misma sede
- Excel abierto manualmente durante un guardado
- sincronización lenta o conflictiva de Dropbox / OneDrive

Conclusión técnica:

- el locking actual mitiga
- no elimina por completo el riesgo operativo

Ese riesgo sí merece estar documentado porque afecta comportamiento real del sistema en producción.

## Fortalezas actuales

- muy alineado con la operación real
- sin dependencia de infraestructura compleja
- instalación y despliegue simples
- build distribuible por rama
- launcher más maduro
- mejor captura y corrección en módulos críticos

## Riesgos actuales

- Excel compartido sigue siendo frágil bajo concurrencia real
- `web/app.js` sigue concentrando mucha lógica de UI y reglas de flujo
- `excel_service.py` sigue concentrando mucha responsabilidad de persistencia
- la seguridad es operativa, no robusta

## Evolución futura

La siguiente decisión grande no será de frontend ni de launcher, sino de persistencia.

Cuando la operación crezca, lo natural será:

- mover la operación principal a base de datos
- dejar Excel como:
  - respaldo
  - exportación
  - insumo analítico

Eso tendrá sentido especialmente si:

- aumenta la concurrencia
- se necesita mejor trazabilidad
- Excel compartido deja de ser suficiente

## Conclusión

Hoy CajaJDW ya es una aplicación operativa real, no solo un “frontend para Excel”.

El sistema ganó:

- control de captura
- control de cierres
- mejor arranque
- corrección más segura
- una arquitectura por ramas más clara

Su siguiente límite natural no es funcional, sino estructural:

- cuándo dejar de usar Excel como backend primario
