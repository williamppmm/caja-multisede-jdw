# Especificación Funcional — CajaJDW

Documento de referencia funcional del comportamiento actual del sistema.

## 1. Arranque

Al ejecutar el `.exe` o el launcher Python:

1. se muestra splash de inicio
2. el launcher garantiza instancia única
3. si la app ya está arrancando, los clics extra no deben abrir pestañas duplicadas
4. cuando el servidor local responde, se abre el navegador

Además:

- el navegador envía heartbeat periódico
- si el proceso no recibe heartbeat durante el tiempo de gracia, se apaga solo

## 2. Configuración base

Desde Administración se define:

- sede
- carpeta de datos
- módulos habilitados
- módulo por defecto
- estado inicial del sistema

El estado inicial (`startup_state.json`) permite definir:

- fecha de inicio
- caja inicial
- referencias iniciales por ítem de `Contadores`

## 3. Reglas transversales

### Fecha de trabajo

En general la sesión usa una fecha compartida entre módulos.

Excepción:

- en `respaldo-version-especial`, durante la primera interacción:
  - `Caja`
  - `Plataformas`
  - `Contadores`
  - `Resumen`
  pueden abrir en `ayer()`
- al pasar a módulos fuera de ese grupo, la sesión vuelve a `hoy()`

### Borradores

Los borradores de sesión más sensibles hoy son:

- `Caja`
- `Contadores`

### Autorización

Hay dos niveles distintos:

1. autorización general por fecha o corrección
2. microflujos internos dentro de `Contadores`

En `Contadores`, los paneles de:

- referencia crítica
- pausa / reactivación

se confirman con `OK`, sin contraseña dentro del propio panel.

### Naturaleza de las contraseñas

Las contraseñas visibles en el frontend deben entenderse como:

- restricción operativa básica
- aviso de que se intenta editar en una fecha no prevista

No son autenticación fuerte ni un modelo de seguridad robusto de backend.

## 4. Módulos

### Caja

Propósito:

- registrar caja física del día

Entradas principales:

- billetes por denominación
- total monedas
- billetes viejos

Cálculo:

- `total_caja_fisica = billetes + monedas + billetes viejos`

Persistencia:

- hoja `Caja` de `Contadores_{sede}_{año}.xlsx`

### Plataformas

Propósito:

- registrar ventas de plataformas del día

Campos:

- Practisistemas
- Deportivas

Persistencia:

- hoja `Plataformas` de `Contadores_{sede}_{año}.xlsx`

#### Referencias externas (solo super admin)

En `main`, si hay sede activa configurada, el módulo puede leer referencias de archivos externos de solo lectura:

- `Ventas_dia_Practisistemas.xlsx`
- `Ventas_dia_Bet.xlsm`

Esos valores se usan como referencia visual y de contraste, no como fuente de guardado propia.

### Gastos

Propósito:

- registrar egresos por concepto

Persistencia:

- hoja `Gastos` de `Contadores_{sede}_{año}.xlsx`

### Bonos

Propósito:

- registrar bonos por cliente

Persistencia:

- hoja `Bonos` de `Contadores_{sede}_{año}.xlsx`

### Préstamos

Propósito:

- registrar préstamos y pagos por persona

El saldo pendiente se calcula desde el histórico.

Persistencia:

- hoja `Prestamos` de `Contadores_{sede}_{año}.xlsx`

### Movimientos

Propósito:

- registrar ingresos y salidas extraordinarias

Persistencia:

- hoja `Movimientos` de `Contadores_{sede}_{año}.xlsx`

### Contadores

Es el módulo más sensible del sistema.

#### Catálogo

Cada ítem tiene:

- `item_id`
- `nombre`
- `denominacion`

La pausa ya no vive como booleano persistente del catálogo. La fuente de verdad temporal es:

- `contadores_pausas.json`

#### Referencia

La referencia vigente de cada ítem puede venir de:

- último registro guardado
- estado inicial
- referencia crítica autorizada

#### Yield y resultado

Regla base:

- `yield_actual = entradas - salidas - jackpot`
- `yield_ref = ref_entradas - ref_salidas - ref_jackpot`
- `resultado = (yield_actual - yield_ref) * denominacion`

#### Referencia crítica

Se usa cuando hubo reset o incoherencia real de contadores.

Flujo:

1. se abre el panel del ítem
2. se ingresan los valores de referencia crítica
3. se confirma con `OK`

No requiere contraseña dentro del panel.

#### Pausa

La pausa actual es por fecha.

Reglas:

- solo afecta al ítem pausado
- no modifica otros ítems
- la fila sigue visible
- `Entradas` y `Salidas` pueden apoyarse en la referencia vigente
- `Jackpot` sigue su propia lógica

#### Navegación de teclado

`Contadores` ya no se comporta como un formulario lineal simple.

Reglas actuales:

- `Tab` y `Enter` recorren solo:
  - `Entradas`
  - `Salidas`
- `Jackpot` queda fuera del flujo operativo diario
- `Jackpot` sigue siendo editable por clic directo
- las flechas permiten navegación tipo grilla
- `Escape` restaura el valor original del campo enfocado

### Resumen

`Resumen` existe como módulo formal en:

- `version-usuario`
- `respaldo-version-especial`

Propósito:

- agrupar por período la información de módulos
- exponer totales y detalle operativo

No hace balance contable completo.

En `main`, hoy no se usa como módulo operativo equivalente al de la rama usuario.

### Cuadre

Propósito:

- cerrar el período comparando caja teórica contra caja física

Elementos clave:

- `base_anterior`
- totales por módulo del período
- `caja_teorica`
- `caja_fisica`
- `diferencia`
- `base_nueva`

Persistencia:

- hoja `Cuadre` de `Consolidado_{sede}_{año}.xlsx`

## 5. Resincronización de Cuadre

Cuando se corrige información que afecta un período ya cuadrado:

- se resincroniza el `Cuadre` cuyo período contiene esa fecha

Además, si la corrección es en `Caja` y cambia la `base_nueva` del cuadre recalculado:

- también se resincroniza el siguiente `Cuadre`

Esto existe porque:

- la `base_nueva` de un cierre
- es la `base_anterior` del siguiente

## 6. Archivos de datos

### Libros Excel

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

### Auxiliares por sede

- `contadores_items.json`
- `contadores_pausas.json`
- `startup_state.json`

### Locales del equipo

- `data/settings.json`
- `data/bonos_clientes.json`
- `data/gastos_conceptos.json`
- `data/prestamos_personas.json`
- `data/movimientos_conceptos.json`

## 7. Arranque, splash y build

Archivos clave:

- `launcher_boot.py`
- `launcher.py`
- `launcher_super_admin.py`

Comportamiento del launcher:

- instancia única
- splash de inicio
- espera del servidor antes de abrir navegador
- reducción de clics duplicados

### `.spec` por rama

La rama `main` usa:

- `CajaSuperAdmin.spec`

Las ramas operativas usan:

- `CajaJDW.spec`

Cada rama debe transportar el `.spec` correspondiente a su ejecutable.

## 8. Riesgo operativo con Excel

La aplicación ya tiene mitigaciones de locking y validación, pero el riesgo estructural sigue siendo:

- Excel compartido no es una base de datos
- no hay concurrencia fuerte distribuida
- Dropbox / OneDrive no sustituyen una capa transaccional

Esto no invalida la app; solo define su límite operativo real.

## 9. Diferencias entre ramas

### `main`

- super admin
- multisede
- respaldos
- referencias externas de plataformas
- `CajaSuperAdmin.spec`

### `version-usuario`

- operación diaria
- `Resumen`
- `CajaJDW.spec`

### `respaldo-version-especial`

- base de usuario
- arranque inicial en `ayer()` para módulos de cierre
- `CajaJDW.spec`
