# Portabilidad del motor de datos

## 1. Objetivo

Demostrar que las consultas generadas por el DSL pueden ejecutarse sobre diferentes motores de base de datos sin modificar el servicio de consultas, el validador, el compilador ni las políticas de acceso.

SQLite se utiliza como motor principal y PostgreSQL como motor alternativo para verificar esta independencia.

## 2. Arquitectura de acceso a datos

El servicio de consultas recibe una representación JSON y coordina su procesamiento mediante los componentes del DSL y las políticas de acceso.

```mermaid
flowchart TD
    A[Consulta JSON] --> B[Construccion del AST]
    B --> C[Validacion]
    C --> D[Politicas de acceso sobre JSON]
    D --> E[AST autorizado]
    E --> F[Compilacion SQL]
    F --> G[Contrato DatabaseAdapter]
    G --> H[SQLiteAdapter]
    G --> I[PostgresAdapter]
    H --> J[(SQLite)]
    I --> K[(PostgreSQL)]
```

El adaptador es responsable de ejecutar la sentencia SQL y devolver los resultados utilizando una estructura común.

### 2.1. Contrato de acceso a datos

El contrato se encuentra definido en [src/adapters/database-adapter.js](../src/adapters/database-adapter.js).

| Método | Responsabilidad |
| --- | --- |
| execute(sql, params) | Ejecutar una consulta parametrizada y devolver sus columnas y registros. |
| close() | Liberar los recursos utilizados por la conexión. |

El método execute devuelve una promesa con la siguiente estructura:

```javascript
{
    columns: [],
    rows: []
}
```

Las columnas se conservan incluso cuando la consulta no devuelve registros, permitiendo mantener una estructura de respuesta uniforme.

### 2.2. Adaptador SQLite

El adaptador principal utiliza better-sqlite3 para acceder al archivo de base de datos.

La conexión se establece en modo de solo lectura y las consultas se ejecutan mediante sentencias preparadas.

Implementación:
[sqlite-adapter.js](../src/adapters/sqlite-adapter.js).

### 2.3. Adaptador PostgreSQL

El adaptador alternativo utiliza la biblioteca pg para establecer una conexión con PostgreSQL.

El compilador genera consultas utilizando marcadores de parámetros representados por signos de interrogación. El adaptador PostgreSQL transforma estos marcadores al formato requerido por su motor.

| SQL generado por el DSL | SQL ejecutado en PostgreSQL |
| --- | --- |
| WHERE almacen_id = ? | WHERE almacen_id = $1 |
| WHERE cantidad > ? AND almacen_id = ? | WHERE cantidad > $1 AND almacen_id = $2 |

Los valores se mantienen separados de la sentencia SQL.

El adaptador configura las transacciones en modo de solo lectura y normaliza los tipos numéricos utilizados en la demostración para facilitar la comparación de resultados.

Implementación:
[postgres-adapter.js](../src/adapters/postgres-adapter.js).

## 3. Equivalencia del modelo de datos

Ambos motores utilizan el mismo modelo lógico de inventario, compuesto por seis tablas relacionadas y dos vistas de consulta.

| Recurso | SQLite | PostgreSQL |
| --- | --- | --- |
| Esquema | schema.sql | schema-postgres.sql |
| Generación de datos | seed.js | seed-postgres.js |
| Tablas | 6 | 6 |
| Vistas | 2 | 2 |
| Registros | 5311 | 5311 |

El proceso de inicialización de PostgreSQL reutiliza el generador de datos de SQLite para cargar un conjunto equivalente de registros de inventario y movimientos.

Los hashes de las contraseñas utilizan valores aleatorios de salt, por lo que no se requiere que sean idénticos entre ambos motores.

## 4. Servicios de aplicación

### 4.1. Servicio de consultas

El servicio QueryService coordina las siguientes operaciones:

1. Construcción del AST de la consulta original.
2. Validación de la estructura y los elementos permitidos.
3. Aplicación de las políticas de acceso sobre el JSON.
4. Construcción del AST autorizado.
5. Compilación de la sentencia SQL parametrizada.
6. Ejecución mediante el adaptador seleccionado.
7. Construcción de la respuesta.

El servicio recibe sus dependencias mediante el constructor, lo que permite sustituir el adaptador sin modificar su lógica.

Implementación:
[query-service.js](../src/services/query-service.js).

### 4.2. Servicio de dashboard

DashboardService obtiene información agregada del inventario mediante dos consultas SQL predefinidas:

- Existencias totales por almacén.
- Existencias totales por categoría.

Las consultas incorporan las restricciones correspondientes al rol del usuario antes de calcular los resultados.

Implementación:
[dashboard-service.js](../src/services/dashboard-service.js).

## 5. Demostración de portabilidad

Para comprobar la equivalencia se ejecutó la siguiente consulta en SQLite y PostgreSQL:

```sql
SELECT almacen, SUM(cantidad) AS total_stock
FROM v_inventario
GROUP BY almacen
ORDER BY almacen;
```

### 5.1. Resultados obtenidos

| Almacén | SQLite | PostgreSQL |
| --- | ---: | ---: |
| Arequipa | 42131 | 42131 |
| Lima | 42217 | 42217 |
| Trujillo | 46745 | 46745 |
| **Total** | **131093** | **131093** |

Ambos motores devolvieron los mismos resultados utilizando un conjunto equivalente de datos.

![Comparación de resultados entre SQLite y PostgreSQL](images/portabilidad-sqlite-postgresql.png)

### 5.2. Equivalencia de las políticas de acceso

También se verificó la ejecución de una consulta agregada mediante el servicio de consultas y los componentes reales del DSL para los tres roles del sistema.

| Rol | Almacenes autorizados | Existencias totales |
| --- | --- | ---: |
| Administrador | Arequipa, Lima y Trujillo | 131093 |
| Operario | Lima | 42217 |
| Consulta | Arequipa | 42131 |

Los resultados obtenidos fueron equivalentes en ambos motores, conservando las restricciones de acceso correspondientes.

## 6. Pruebas realizadas

### 6.1. Pruebas del adaptador PostgreSQL

Se implementaron diez pruebas para verificar:

- Cumplimiento del contrato de acceso a datos.
- Ejecución de consultas parametrizadas.
- Conservación de columnas en resultados vacíos.
- Restricción de operaciones de escritura.
- Configuración de transacciones de solo lectura.
- Validación de la cantidad de parámetros.
- Equivalencia de agregaciones y filtros.
- Equivalencia de consultas sobre movimientos.

**Resultado: 10 de 10 pruebas superadas.**

![Pruebas del adaptador PostgreSQL](images/pruebas-portabilidad-postgresql.png)

### 6.2. Pruebas de integración

Se implementaron catorce pruebas utilizando los componentes reales del DSL, las políticas de acceso y los adaptadores.

| Aspecto evaluado | Pruebas |
| --- | ---: |
| Ejecución completa del DSL | 1 |
| Restricciones de acceso por rol | 3 |
| Rechazo de consultas no autorizadas | 2 |
| Condiciones OR y anidación | 2 |
| Agregaciones y políticas de acceso | 2 |
| Resultados vacíos | 1 |
| Equivalencia entre motores por rol | 3 |
| **Total** | **14** |

**Resultado: 14 de 14 pruebas superadas.**

![Pruebas de integración del DSL](images/pruebas-integracion-dsl.png)

### 6.3. Resultados generales

Al finalizar la integración de los servicios se ejecutó la suite general del proyecto.

| Indicador | Resultado |
| --- | ---: |
| Archivos de pruebas superados | 12 |
| Pruebas superadas | 124 |
| Pruebas fallidas | 0 |

Estos resultados corresponden a la ejecución local realizada durante el desarrollo de la portabilidad, con ambos motores disponibles.

## 7. Reproducción de la demostración

### 7.1. Requisitos

- Node.js 24 LTS.
- npm.
- Docker en ejecución.
- Dependencias del proyecto instaladas.

Desde la raíz del repositorio:

```bash
npm ci
npm run seed
```

### 7.2. Inicialización de PostgreSQL

Crear un contenedor local de demostración:

```bash
docker run --name sql-inv-postgres \
  -e POSTGRES_USER=sqlinv \
  -e POSTGRES_PASSWORD=SqlInvDemo2026 \
  -e POSTGRES_DB=sqlinv \
  -p 127.0.0.1:5433:5432 \
  -d postgres:17
```

Las credenciales anteriores corresponden exclusivamente a un entorno local de demostración.

Si el contenedor ya existe, utilizar:

```bash
docker start sql-inv-postgres
```

Comprobar que el servidor está disponible:

```bash
docker exec sql-inv-postgres pg_isready -U sqlinv -d sqlinv
```

Configurar la variable de entorno desde Git Bash:

```bash
export POSTGRES_URL="postgresql://sqlinv:SqlInvDemo2026@127.0.0.1:5433/sqlinv"
```

Generar los datos de demostración:

```bash
npm run seed:postgres
```

Los procesos de inicialización regeneran los registros del dataset. Deben ejecutarse únicamente sobre bases de demostración.

### 7.3. Ejecución de las pruebas

Pruebas del adaptador alternativo:

```bash
npx vitest run tests/db/postgres-adapter.test.js
```

Pruebas de integración:

```bash
npx vitest run tests/integration/query-service.test.js
```

Suite general:

```bash
npm test
```

Las pruebas que requieren PostgreSQL se omiten cuando POSTGRES_URL no está configurada.

Para detener el contenedor al finalizar:

```bash
docker stop sql-inv-postgres
```

## 8. Sustitución del motor

El servicio de consultas puede utilizar cualquiera de los adaptadores mediante la inyección de dependencias.

```javascript
const sqliteService = new QueryService({
    adapter: new SQLiteAdapter(),
    buildAST,
    validateQuery,
    applyRolePolicy,
    compileQuery
});

const postgresService = new QueryService({
    adapter: new PostgresAdapter(),
    buildAST,
    validateQuery,
    applyRolePolicy,
    compileQuery
});
```

La consulta JSON y los componentes de procesamiento permanecen sin cambios. Únicamente se sustituye el adaptador utilizado para acceder a los datos.

## 9. Alcance y consideraciones

La portabilidad demostrada corresponde al subconjunto de SQL utilizado en las consultas verificadas del proyecto.

El adaptador PostgreSQL no constituye un traductor universal entre dialectos SQL. La incorporación de nuevas construcciones podría requerir ajustes adicionales.

En un entorno de producción también sería necesario configurar usuarios de base de datos con privilegios mínimos, administrar las credenciales de forma segura y evaluar los tipos numéricos según la precisión requerida.

Las pruebas de integración verifican directamente los servicios. La conexión definitiva de estos servicios con las rutas HTTP requiere que la política de acceso se aplique una sola vez, dentro de QueryService.

## 10. Conclusión

La arquitectura de adaptadores permitió ejecutar consultas equivalentes sobre SQLite y PostgreSQL manteniendo los componentes del DSL y las políticas de acceso.

Los resultados obtenidos demuestran la independencia del servicio de consultas respecto al motor de base de datos para los casos evaluados.