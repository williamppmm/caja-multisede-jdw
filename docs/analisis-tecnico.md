# Analisis Tecnico — CajaJDW

## Resumen

CajaJDW funciona como una capa operativa por encima de Excel.

Su valor actual es:

- reduce edicion manual directa sobre hojas
- centraliza validaciones
- controla cierres
- mejora la correccion de datos
- mantiene Excel como respaldo operativo y salida analitica

## Arquitectura

Capas principales:

1. launcher Python / `.exe`
2. FastAPI
3. frontend web local
4. servicios por modulo
5. persistencia Excel y JSON auxiliares

## Arranque y launcher

Hoy incluye:

- instancia unica
- splash de inicio
- espera del servidor antes de abrir navegador
- reduccion de pestanas duplicadas al hacer varios clics

Archivos principales:

- [launcher_boot.py](C:\Users\User\Desktop\Caja\launcher_boot.py)
- [launcher.py](C:\Users\User\Desktop\Caja\launcher.py)
- [launcher_super_admin.py](C:\Users\User\Desktop\Caja\launcher_super_admin.py)

`launcher_boot.py` concentra la logica compartida de mutex, seleccion de puerto, splash, poll del servidor, apertura de navegador y apagado controlado.

## `.spec` y empaquetado

En `main`:

- [CajaSuperAdmin.spec](C:\Users\User\Desktop\Caja\CajaSuperAdmin.spec)

En ramas operativas:

- `CajaJDW.spec`

La regla actual es:

- un `.spec` oficial por rama
- un `.exe` final por rama

## Persistencia

La decision tecnica fuerte del sistema sigue siendo:

- Excel es la fuente de verdad operativa

La persistencia principal esta en:

- [excel_service.py](C:\Users\User\Desktop\Caja\app\services\excel_service.py)

Este servicio:

- abre o crea workbooks
- genera hojas por modulo y sede
- escribe encabezados y formatos
- consulta registros por fecha
- reemplaza registros de una fecha cuando se corrige
- administra un lock local `.lock`
- mantiene compatibilidad con algunos formatos legacy

## Diseno de los libros

Dos libros por sede y ano:

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

JSON auxiliares por sede:

- `contadores_items.json`
- `contadores_pausas.json`
- `startup_state.json`
- `config_operativa.json`
- `recaudo_ciclos.json`

JSON locales del equipo:

- `data/settings.json`
- catalogos de nombres, conceptos y personas

## Limitaciones del modelo Excel

1. No hay transacciones reales.
2. No hay control distribuido entre varios equipos.
3. El lock local no resuelve conflictos entre clientes distintos.
4. Dropbox puede producir conflictos de sincronizacion si dos usuarios de la misma sede escriben casi a la vez.

## Modelos de datos

Modelos principales:

- [caja_models.py](C:\Users\User\Desktop\Caja\app\models\caja_models.py)
- [contadores_models.py](C:\Users\User\Desktop\Caja\app\models\contadores_models.py)
- [cuadre_models.py](C:\Users\User\Desktop\Caja\app\models\cuadre_models.py)

La validacion con Pydantic cubre tipos, no negativos, obligatoriedad y estructura minima del payload.

## Routers

### Router principal

- [modules.py](C:\Users\User\Desktop\Caja\app\routers\modules.py)

Agrupa endpoints para guardar registros, consultar estado por fecha, consultar datos guardados, administrar catalogos y ejecutar operaciones especiales.

### Router de settings

- [settings.py](C:\Users\User\Desktop\Caja\app\routers\settings.py)

Responsabilidades:

- leer settings
- guardar settings
- abrir selector de carpeta
- apagar la app
- recibir heartbeat del navegador

### Router de recaudo

- [recaudo.py](C:\Users\User\Desktop\Caja\app\routers\recaudo.py)

Responsabilidades:

- exponer el resumen del ciclo activo
- registrar entregas parciales
- cerrar ciclos

## Servicios por modulo

### Caja y modulos simples

- [caja_service.py](C:\Users\User\Desktop\Caja\app\services\caja_service.py)

Contiene la logica para construir filas, guardar Caja, guardar Plataformas y preparar modulos simples por items.

### Bonos

- [bonos_service.py](C:\Users\User\Desktop\Caja\app\services\bonos_service.py)

Maneja registro, consulta, edicion y eliminacion del ultimo bono de la fecha.

### Prestamos

- [prestamos_service.py](C:\Users\User\Desktop\Caja\app\services\prestamos_service.py)

Registra prestamos y pagos, y valida que un pago no supere el saldo pendiente.

### Movimientos

- [movimientos_service.py](C:\Users\User\Desktop\Caja\app\services\movimientos_service.py)

Registra ingresos y salidas extraordinarias y resume netos del dia.

### Catalogos y autocompletado

- [nombres_service.py](C:\Users\User\Desktop\Caja\app\services\nombres_service.py)

Responsabilidades:

- mantener catalogos JSON locales
- agregar entradas nuevas sin duplicar
- normalizar clientes y personas como NomPropios
- exponer catalogos por tipo

El frontend aplica autocompletado en tres niveles:

1. coincidencia exacta
2. prefijo
3. fuzzy por distancia de edicion

### Contadores

- [contadores_service.py](C:\Users\User\Desktop\Caja\app\services\contadores_service.py)

Es el modulo de mayor complejidad.

Responsabilidades:

- administrar catalogo de items
- pausar o reactivar items por fecha
- reconstruir referencias vigentes desde historial
- calcular yield actual
- detectar alertas
- exigir referencia critica si hay decrementos frente a referencia

### Cuadre

- [cuadre_service.py](C:\Users\User\Desktop\Caja\app\services\cuadre_service.py)

Responsabilidades:

- encontrar ultimo cuadre previo
- calcular el periodo contable
- sumar y restar modulos implicados
- comparar caja teorica vs caja fisica
- guardar el resultado final del cierre

Punto tecnico importante:

- si una correccion en `Caja` cambia `base_nueva`, se resincroniza el siguiente cierre afectado

### Recaudo

- [recaudo_service.py](C:\Users\User\Desktop\Caja\app\services\recaudo_service.py)

Responsabilidades:

- acumular el total de monedas y billetes viejos de Caja por ciclo
- registrar entregas parciales
- cerrar ciclos y llevar historial
- exponer el ciclo actual y el ultimo cierre

Estado persistido:

- `recaudo_ciclos.json` en la carpeta de la sede

### Configuracion operativa

- [operativa_config_service.py](C:\Users\User\Desktop\Caja\app\services\operativa_config_service.py)

Responsabilidades:

- leer y guardar `config_operativa.json`
- exponer reglas compartidas por sede
- hoy gestiona `excluir_monedas_viejos_base`

## Frontend

Archivos principales:

- [index.html](C:\Users\User\Desktop\Caja\web\index.html)
- [app.js](C:\Users\User\Desktop\Caja\web\app.js)

El frontend es una SPA simple sin framework.

`app.js` concentra:

- render de modulos
- validaciones
- control de pestanas
- manejo de fecha
- autorizacion admin
- consumo de API
- borradores temporales de Caja y Contadores
- render de Cuadre
- administracion de catalogos
- autocompletado
- panel de recaudo

## Recaudo y configuracion compartida

La regla `excluir_monedas_viejos_base` no vive en `settings.json`.

Debe vivir en:

- `config_operativa.json`

Motivo:

- `settings.json` es local al equipo
- `config_operativa.json` si es visible para usuario y super admin

Cuando la regla esta activa:

- `Caja fisica` sigue contando monedas y viejos
- `base_nueva` puede excluirlos
- el panel de recaudo usa `recaudo_ciclos.json`

## Seguridad real vs restriccion operativa

Las contrasenas del frontend cumplen hoy una funcion operativa:

- restringir correcciones
- reducir edicion accidental
- avisar que se esta entrando a un flujo sensible

No son autenticacion fuerte.

## Riesgos principales

- Excel compartido sigue siendo fragil bajo concurrencia real
- `web/app.js` concentra mucha logica de UI y flujo
- `excel_service.py` concentra mucha responsabilidad de persistencia
- la seguridad es operativa, no robusta

## Evolucion futura

Cuando la operacion crezca, lo natural sera:

- mover la operacion principal a base de datos
- dejar Excel como respaldo, exportacion o salida analitica

## Conclusion

Hoy CajaJDW ya es una aplicacion operativa real, no solo un frontend para Excel.

Su siguiente limite natural no es funcional sino estructural:

- cuando Excel deje de ser suficiente como backend principal
