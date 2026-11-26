# Justificación del DSL

## 1. Problemática

La gestión de inventario requiere consultar información sobre productos, categorías, existencias, almacenes y movimientos. Estas consultas pueden incluir filtros, agrupaciones, ordenamientos y operaciones de agregación que varían según las necesidades del usuario.

Implementar cada consulta mediante funciones específicas en JavaScript implicaría desarrollar diferentes procedimientos para recorrer registros, evaluar condiciones, agrupar resultados y calcular totales. Esto incrementaría la cantidad de código y dificultaría su mantenimiento conforme aumenten las necesidades de consulta.

SQL-INV utiliza SQL como lenguaje específico de dominio para expresar estas operaciones de manera declarativa.

## 2. Elección de SQL como DSL

SQL es un lenguaje orientado a la definición, manipulación y consulta de datos relacionales. A diferencia de un lenguaje de propósito general, permite expresar qué información se necesita sin especificar detalladamente el procedimiento para obtenerla.

En SQL-INV se utiliza un subconjunto de SQL enfocado exclusivamente en consultas de lectura sobre información de inventario.

| Construcción | Aplicación en el sistema |
| --- | --- |
| SELECT | Seleccionar los campos que se desean consultar. |
| WHERE | Filtrar registros según determinadas condiciones. |
| AND / OR | Combinar condiciones simples y anidadas. |
| GROUP BY | Agrupar información por almacén, categoría u otros campos. |
| HAVING | Filtrar resultados obtenidos mediante agregaciones. |
| ORDER BY | Ordenar los resultados de una consulta. |
| SUM, COUNT, AVG, MIN, MAX | Obtener totales, cantidades, promedios y valores extremos. |

La elección de SQL permite delegar estas operaciones al motor de base de datos, evitando implementar manualmente la lógica de procesamiento de registros en JavaScript.

## 3. Aplicación del DSL en SQL-INV

El usuario no necesita escribir directamente una sentencia SQL. La interfaz permite seleccionar campos, operadores, condiciones y funciones de agregación, generando una representación JSON de la consulta.

Esta representación es procesada por los componentes del DSL para construir un árbol de sintaxis abstracta (AST), validar su estructura y generar una sentencia SQL parametrizada.

Por ejemplo, para consultar las existencias totales por almacén:

```sql
SELECT almacen, SUM(cantidad) AS total_stock
FROM v_inventario
GROUP BY almacen
ORDER BY almacen ASC;
```

La consulta expresa directamente el resultado esperado, sin necesidad de recorrer los registros, crear estructuras auxiliares de agrupación o implementar algoritmos de ordenamiento en la aplicación.

El uso de SQL también permite incorporar nuevas combinaciones de consultas sin desarrollar una función independiente para cada una.

## 4. Elección del modelo relacional

La información del inventario presenta relaciones definidas entre productos, categorías, almacenes, existencias y movimientos.

El modelo relacional permite representar estas relaciones mediante claves primarias y foráneas, mantener la integridad de los datos y evitar duplicidades innecesarias.

### 4.1. Estructura de datos

| Tabla | Descripción | Registros |
| --- | --- | ---: |
| categorias | Clasificación de los productos. | 5 |
| productos | Catálogo de productos y sus características. | 200 |
| almacenes | Almacenes ubicados en Lima, Arequipa y Trujillo. | 3 |
| inventario | Existencias de cada producto por almacén. | 600 |
| movimientos | Historial de entradas y salidas de inventario. | 4500 |
| usuarios | Usuarios de demostración y sus roles. | 3 |
| **Total** | | **5311** |

El inventario mantiene una combinación única de producto y almacén. Los movimientos registran las entradas y salidas asociadas a cada registro de inventario.

Los datos se generan mediante un proceso reproducible que conserva la consistencia entre los movimientos registrados y las existencias finales de cada producto.

### 4.2. Vistas de consulta

Para simplificar las consultas del DSL se utilizan dos vistas:

| Vista | Finalidad |
| --- | --- |
| v_inventario | Consultar productos, categorías, almacenes, precios y existencias. |
| v_movimientos | Consultar el historial de entradas y salidas de inventario. |

Las vistas encapsulan las relaciones entre las tablas y presentan una estructura adecuada para las consultas del usuario.

Esto evita que el DSL tenga que generar dinámicamente operaciones JOIN y permite limitar las fuentes de información disponibles.

## 5. Elección del motor de base de datos

### 5.1. SQLite como motor principal

SQLite fue seleccionado como motor principal debido a que permite implementar una base de datos relacional sin instalar ni configurar un servidor independiente.

Su integración con Node.js mediante better-sqlite3 facilita la ejecución de consultas parametrizadas, la generación de datos de prueba y la reproducción del proyecto en diferentes equipos.

SQLite resulta adecuado para el alcance académico de SQL-INV, orientado principalmente a consultas de lectura sobre un conjunto controlado de datos.

### 5.2. PostgreSQL como motor alternativo

PostgreSQL se utiliza para demostrar que el procesamiento del DSL no depende exclusivamente de SQLite.

Ambos motores admiten las principales construcciones SQL utilizadas por el sistema, lo que permite ejecutar consultas equivalentes mediante adaptadores independientes.

PostgreSQL también representa una alternativa para escenarios que requieran un servidor de base de datos independiente y una mayor capacidad de administración y concurrencia.

### 5.3. Comparación de motores

| Criterio | SQLite | PostgreSQL |
| --- | --- | --- |
| Arquitectura | Base de datos embebida. | Cliente-servidor. |
| Almacenamiento | Archivo local. | Administrado por el servidor. |
| Configuración | Reducida. | Requiere configurar un servidor. |
| Parámetros SQL | Marcadores ?. | Marcadores $1, $2, etc. |
| Aplicación en SQL-INV | Motor principal. | Demostración de portabilidad. |

No se requiere incorporar un servidor de base de datos para la ejecución principal del proyecto. PostgreSQL se mantiene como alternativa para comprobar la independencia entre el DSL y el motor.

## 6. Seguridad de las consultas

El sistema utiliza mecanismos complementarios para controlar las consultas generadas:

- Validación de fuentes, campos, operadores y funciones permitidas.
- Separación de las sentencias SQL y los valores mediante parámetros.
- Restricción de las operaciones a consultas de lectura.
- Aplicación de políticas de acceso según el rol del usuario.

| Rol | Alcance de consulta |
| --- | --- |
| Administrador | Inventario y movimientos de todos los almacenes. |
| Operario | Inventario y movimientos del almacén de Lima. |
| Consulta | Inventario del almacén de Arequipa. |

Las restricciones se incorporan antes de ejecutar la consulta, de modo que las operaciones de agrupación y agregación se realizan únicamente sobre los registros autorizados.

## 7. Independencia del motor de datos

La ejecución de consultas se realiza mediante un contrato común implementado por los adaptadores de SQLite y PostgreSQL.

El servicio de consultas utiliza este contrato sin depender directamente de las bibliotecas particulares de cada motor.

Esta separación permite mantener el AST, el validador, el compilador y las políticas de acceso al utilizar un motor alternativo compatible.

La implementación y las pruebas de equivalencia se detallan en [Portabilidad del motor de datos](07-portabilidad.md).

## 8. Conclusión

SQL permite expresar las necesidades de consulta del inventario mediante construcciones declarativas especializadas, reduciendo la necesidad de implementar procedimientos particulares en JavaScript.

El modelo relacional, las vistas de consulta, la parametrización y la arquitectura de adaptadores complementan el uso del DSL, facilitando el mantenimiento del sistema y su independencia respecto al motor de base de datos.