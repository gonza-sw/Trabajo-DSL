# SQL-INV

Aplicación de consulta de inventario que modela SQL como DSL: la interfaz construye consultas JSON, el servidor aplica autenticación y políticas por rol, y los módulos de dominio compilan y ejecutan consultas parametrizadas.

## Requisitos

- Node.js 24 LTS y npm.
- Docker (opcional, para ejecutar el contenedor y las pruebas de portabilidad con PostgreSQL).

## Instalación y configuración

```sh
npm ci
cp .env.example .env
```

Configura `SESSION_SECRET` en `.env` con un valor aleatorio de al menos 32 caracteres. No publiques el archivo `.env`.

Inicializa la base de datos SQLite:

```sh
npm run seed
```

Este comando genera el esquema relacional, las vistas de consulta y un dataset de demostración de 5311 registros.

## Ejecución

```sh
npm start
```

La API escucha en `http://localhost:3000`. Las rutas de autenticación son `/api/auth/login`, `/api/auth/logout` y `/api/auth/me`; el esquema, las consultas y el dashboard están en `/api/schema`, `/api/query` y `/api/dashboard`.

El comando `npm start` carga las variables definidas en `.env` si el archivo existe. También puedes definirlas en el entorno; estas tienen prioridad sobre los valores del archivo.

## Pruebas y CI

```sh
npm test
npm run test:api
```

GitHub Actions ejecuta `npm ci` y la suite disponible para los pull requests y pushes a `dev` y `main`. Las pruebas de API usan sesiones HTTP y dobles de servicios; las pruebas de DSL, datos y frontend corresponden a sus respectivos módulos.

## Datos y portabilidad

SQLite es el motor principal del sistema. El modelo de datos está compuesto por seis tablas relacionadas y dos vistas de consulta.

| Tabla | Registros |
| --- | ---: |
| categorias | 5 |
| productos | 200 |
| almacenes | 3 |
| inventario | 600 |
| movimientos | 4500 |
| usuarios | 3 |
| **Total** | **5311** |

Para inicializar los datos y ejecutar las pruebas del módulo:

```sh
npm run seed
npm run test:db
npx vitest run tests/integration/query-service.test.js
```

El proyecto también incorpora un adaptador PostgreSQL para demostrar la independencia del DSL respecto al motor de base de datos. Ambos adaptadores implementan un contrato común que permite ejecutar consultas parametrizadas sin modificar la lógica del servicio de consultas.

Las pruebas que requieren PostgreSQL se omiten cuando la variable de entorno `POSTGRES_URL` no está configurada.

Las instrucciones de configuración, inicialización, ejecución y las evidencias de equivalencia entre ambos motores se encuentran en la [documentación de portabilidad](docs/07-portabilidad.md).

## Contenedor

```sh
docker build -t sql-inv .
docker run --rm --name sql-inv-demo \
  -p 127.0.0.1:3000:3000 \
  -e NODE_ENV=development \
  -e SESSION_SECRET="$(node -e 'console.log(require("node:crypto").randomBytes(48).toString("hex"))')" \
  sql-inv
```

La imagen crea su propia base SQLite de demostración durante la construcción. El contenedor se ejecuta como usuario sin privilegios. El comando anterior es para una demostración local por HTTP y publica el puerto solo en loopback. Para un despliegue público, usa HTTPS, mantén `NODE_ENV=production` para habilitar cookies `Secure`, configura el proxy de confianza según Express y usa un almacenamiento de sesiones apropiado.

## Documentación del proyecto

- [Contratos técnicos](docs/00-contratos-tecnicos.md)
- [Bases teóricas](docs/01-bases-teoricas.md)
- [Justificación del DSL](docs/02-justificacion-dsl.md)
- [Demostración de abstracción](docs/03-demostracion-abstraccion.md)
- [Metamodelo](docs/04-metamodelo.md)
- [Requisitos del sistema](docs/05-requisitos.md)
- [Guion de demostración](docs/06-guion-demo.md)
- [Portabilidad del motor de datos](docs/07-portabilidad.md)
