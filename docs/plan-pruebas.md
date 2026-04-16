# Plan de Pruebas — CajaJDW

## Objetivo

Validar el comportamiento actual del sistema antes de considerar una rama o un build como estables.

## Alcance

Este plan cubre:

- arranque y ejecutable
- persistencia en Excel
- módulos operativos
- `Contadores`
- `Cuadre`
- diferencias clave entre ramas

## Preparación

Antes de probar:

1. usar una carpeta de prueba por sede
2. evitar trabajar sobre datos reales
3. comprobar que el libro no esté abierto en Excel
4. usar catálogos simples y repetibles

## Casos críticos

## A. Arranque

### A-01 — Splash e inicio normal

1. abrir el `.exe`
2. verificar splash
3. confirmar que luego abre el navegador

Resultado esperado:

- el servidor inicia
- la app carga sin error

### A-02 — Múltiples clics

1. cerrar la app
2. abrir el `.exe`
3. hacer varios clics rápidos durante el arranque

Resultado esperado:

- no se levantan varias instancias
- no se duplican pestañas

## B. Persistencia básica

### B-01 — Creación de libros

1. guardar datos de módulos operativos
2. guardar un `Cuadre`

Resultado esperado:

- existe `Contadores_<SEDE>_<AÑO>.xlsx`
- existe `Consolidado_<SEDE>_<AÑO>.xlsx`

### B-02 — Libro abierto

1. abrir el Excel
2. intentar guardar desde la app

Resultado esperado:

- la app informa archivo ocupado
- no corrompe el libro

## C. Caja

### C-01 — Guardado normal

1. ingresar billetes, monedas y viejos
2. guardar

Resultado esperado:

- total correcto
- lectura correcta al recargar

### C-02 — Corrección de Caja

1. guardar una caja
2. volver a esa fecha
3. corregir con autorización

Resultado esperado:

- la fecha se reemplaza
- no quedan duplicados

## D. Contadores

### D-01 — Captura normal

1. registrar contadores válidos
2. guardar

Resultado esperado:

- yield correcto
- resultado correcto

### D-02 — Referencia crítica

1. provocar decremento frente a referencia
2. abrir panel de referencia crítica
3. completar datos
4. confirmar con `OK`
5. guardar

Resultado esperado:

- se permite el guardado
- el registro queda consistente

### D-03 — Pausar un solo ítem

1. pausar un ítem
2. ir al día siguiente

Resultado esperado:

- solo ese ítem cambia
- los demás no se alteran

### D-04 — Pausa sin borrar formulario

1. empezar a llenar varios ítems
2. pausar otro ítem

Resultado esperado:

- los inputs ya escritos en los demás ítems no se borran

### D-05 — Pausa histórica

1. pausar un ítem en una fecha
2. abrir una fecha anterior

Resultado esperado:

- la pausa no contamina el pasado

## E. Cuadre

### E-01 — Cálculo simple

1. registrar datos en todos los módulos necesarios
2. calcular `Cuadre`

Resultado esperado:

- `caja_teorica` correcta
- `caja_fisica` correcta
- `diferencia` correcta

### E-02 — Resincronización del cuadre afectado

1. guardar un `Cuadre`
2. corregir un módulo dentro de su período

Resultado esperado:

- el `Cuadre` afectado se actualiza

### E-03 — Cascada por Caja

1. guardar dos `Cuadres` consecutivos
2. corregir `Caja` del primero

Resultado esperado:

- se recalcula el `Cuadre` afectado
- si cambia `base_nueva`, también se recalcula el siguiente

## F. Ramas

### F-01 — `main`

Validar:

- modo super admin
- respaldos
- multisede

### F-02 — `version-usuario`

Validar:

- `Resumen`
- captura diaria
- launcher de usuario

### F-03 — `respaldo-version-especial`

Validar:

1. abrir la app por primera vez
2. comprobar `Caja` en `ayer()`
3. pasar a `Resumen`
4. comprobar `Resumen` en `ayer()`
5. pasar a otro módulo

Resultado esperado:

- `Caja` y `Resumen` respetan `ayer()` al inicio
- al pasar a otro módulo, todo vuelve a `hoy()`

## G. Respaldo automático (`main`)

### G-01 — Configuración de backup

1. activar backup
2. definir carpeta
3. guardar settings

Resultado esperado:

- se dispara un respaldo inmediato

### G-02 — Idempotencia

1. ejecutar backup nuevamente el mismo día

Resultado esperado:

- no duplica respaldos válidos

## Regresión mínima sugerida

Antes de cerrar una rama o build, repetir al menos:

1. A-01
2. A-02
3. B-01
4. C-01
5. D-02
6. D-03
7. D-04
8. E-01
9. E-02
10. E-03

## Evolución futura de pruebas

Si el sistema sigue creciendo, el siguiente paso natural es:

- mantener estas pruebas manuales
- sumar pruebas automatizadas de servicios críticos
- preparar validaciones más cercanas a una futura migración a base de datos
