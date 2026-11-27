# 06 — Demostración funcional del sistema

## 1. Objetivo

Demostrar el funcionamiento de SQL-INV mediante la construcción y ejecución de consultas de inventario, verificando las capacidades del DSL, la generación de SQL parametrizado, las políticas de acceso por rol y la independencia del motor de datos.

## 2. Preparación del entorno

Instalar las dependencias del proyecto y crear el archivo de configuración local:

```sh
npm ci
cp .env.example .env
```

Configurar `SESSION_SECRET` con un valor aleatorio de al menos 32 caracteres e inicializar la base de datos SQLite:

```sh
npm run seed
npm start
```

Acceder al aplicativo desde `http://localhost:3000`. El dataset de demostración contiene 5311 registros distribuidos en seis tablas relacionadas y dos vistas de consulta.

## 3. Acceso al sistema

El aplicativo dispone de tres cuentas de demostración con diferentes permisos.

| Usuario | Rol | Alcance |
| --- | --- | --- |
| admin | Administrador | Inventario y movimientos de todos los almacenes. |
| operario | Operario | Inventario y movimientos del almacén de Lima. |
| consulta | Consulta | Únicamente inventario del almacén de Arequipa. |

Las credenciales corresponden exclusivamente al entorno de demostración y se generan durante la inicialización del dataset.

## 4. Construcción y ejecución de consultas

### 4.1. Consulta básica

Seleccionar la fuente `v_inventario` y los campos `producto`, `categoria`, `almacen` y `cantidad`.

El DSL genera la siguiente sentencia SQL:

```sql
SELECT producto, categoria, almacen, cantidad
FROM v_inventario
```

Con el rol administrador, la consulta devuelve 600 registros correspondientes a los 200 productos distribuidos en los tres almacenes.

### 4.2. Consulta parametrizada

Agregar una condición sobre el campo `almacen` con el operador `=` y el valor `Lima`.

```sql
SELECT producto, categoria, almacen, cantidad
FROM v_inventario
WHERE (almacen = ?)
```

Parámetros:

```json
["Lima"]
```

La consulta devuelve 200 registros. El valor de comparación se transmite como parámetro independiente, sin concatenarlo directamente en la sentencia SQL.

### 4.3. Consulta avanzada

Configurar una consulta que permita obtener el stock total por categoría en el almacén de Lima, considerando únicamente las categorías con más de 8000 unidades.

| Elemento | Configuración |
| --- | --- |
| Fuente | v_inventario |
| Proyección | categoria |
| Agregación | SUM(cantidad) AS total_stock |
| WHERE | almacen = Lima |
| GROUP BY | categoria |
| HAVING | SUM(cantidad) > 8000 |
| ORDER BY | total_stock DESC |

La sentencia generada es:

```sql
SELECT categoria, SUM(cantidad) AS total_stock
FROM v_inventario
WHERE (almacen = ?)
GROUP BY categoria
HAVING SUM(cantidad) > ?
ORDER BY total_stock DESC
```

Parámetros:

```json
["Lima", 8000]
```

Resultado esperado:

| Categoría | Stock total |
| --- | ---: |
| Perifericos | 9496 |
| Almacenamiento | 9155 |
| Componentes | 8749 |

Esta consulta demuestra la capacidad del DSL para combinar filtros, agregaciones, agrupaciones, condiciones sobre resultados agregados y ordenamiento.

### 4.4. Condiciones lógicas anidadas

Construir una consulta que combine condiciones mediante los operadores AND y OR, respetando la profundidad máxima de anidación establecida por el DSL.

```sql
SELECT producto, almacen, cantidad
FROM v_inventario
WHERE (cantidad > ? AND (almacen = ? OR almacen = ?))
```

Parámetros:

```json
[100, "Lima", "Arequipa"]
```

El compilador conserva la estructura lógica de las condiciones y el orden de los parámetros.

## 5. Validación y políticas de acceso

El servidor valida las consultas antes de ejecutarlas, verificando las fuentes, columnas, operadores, tipos de datos y coherencia de las agrupaciones.

Las consultas inválidas se rechazan antes de llegar al adaptador de base de datos.

Para comprobar las políticas de acceso, ejecutar una consulta de inventario sin filtros utilizando cada uno de los roles disponibles.

| Rol | Registros esperados | Almacenes disponibles |
| --- | ---: | --- |
| Administrador | 600 | Lima, Arequipa y Trujillo |
| Operario | 200 | Lima |
| Consulta | 200 | Arequipa |

Para los roles restringidos, el servidor incorpora automáticamente una condición sobre `almacen_id`, independientemente de los filtros definidos desde la interfaz.

Cuando existen condiciones OR, la política de acceso se incorpora mediante un AND externo para conservar la restricción correspondiente al usuario.

El rol consulta tampoco dispone de autorización para acceder a la vista `v_movimientos`.

## 6. Visualización de estadísticas

El dashboard presenta dos gráficos generados a partir de consultas SQL de agregación:

- Stock total por almacén.
- Distribución del stock por categoría.

Los resultados respetan las políticas de acceso del usuario autenticado.

| Rol | Stock total disponible |
| --- | ---: |
| Administrador | 131093 |
| Operario | 42217 |
| Consulta | 42131 |

Las estadísticas se calculan desde la base de datos y se entregan a la interfaz mediante el servicio de dashboard.

## 7. Abstracción y portabilidad

La construcción visual de consultas permite expresar operaciones de inventario mediante el DSL sin implementar manualmente los recorridos, filtros y agrupaciones sobre colecciones de datos.

La comparación entre una implementación convencional en JavaScript y una consulta SQL se desarrolla en la [demostración de abstracción](03-demostracion-abstraccion.md).

El contrato común de los adaptadores permite ejecutar consultas equivalentes en SQLite y PostgreSQL sin modificar la lógica del servicio de consultas.

Las instrucciones y pruebas correspondientes se encuentran en la [documentación de portabilidad](07-portabilidad.md).

## 8. Pruebas automatizadas

Ejecutar la suite de pruebas del proyecto:

```sh
npm test
npm run test:coverage
```

Las pruebas comprenden la construcción y validación del DSL, compilación SQL, integridad de datos, adaptadores, servicios, interfaz gráfica, API, autenticación y políticas de acceso.

Las pruebas de PostgreSQL requieren configurar previamente la variable de entorno `POSTGRES_URL` e inicializar el dataset correspondiente.

## 9. Ejecución mediante Docker

Construir la imagen del aplicativo:

```sh
docker build -t sql-inv .
```

Ejecutar el contenedor para una demostración local:

```sh
docker run --rm --name sql-inv-demo \
  -p 127.0.0.1:3000:3000 \
  -e NODE_ENV=development \
  -e SESSION_SECRET="$(node -e 'console.log(require("node:crypto").randomBytes(48).toString("hex"))')" \
  sql-inv
```

La imagen incorpora su propia base de datos SQLite, generada durante el proceso de construcción. El aplicativo queda disponible en `http://localhost:3000` sin requerir una instalación externa del motor de datos.