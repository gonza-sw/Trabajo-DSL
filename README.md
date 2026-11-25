# SQL-INV

Aplicación de consulta de inventario que modela SQL como DSL: la interfaz construye consultas JSON, el servidor aplica autenticación y políticas por rol, y los módulos de dominio compilan y ejecutan consultas parametrizadas.

## Requisitos

- Node.js 24 LTS y npm
- Docker (opcional, para ejecutar el contenedor)

## Instalación y configuración

```sh
npm ci
cp .env.example .env
```

Configura `SESSION_SECRET` en `.env` con un valor aleatorio de al menos 32 caracteres. No publiques el archivo `.env`. Al completar la integración del módulo de datos, inicializa los datos con `npm run seed`.

## Ejecución

```sh
npm start
```

La API escucha en `http://localhost:3000`. Las rutas de autenticación son `/api/auth/login`, `/api/auth/logout` y `/api/auth/me`; el esquema, las consultas y el dashboard están en `/api/schema`, `/api/query` y `/api/dashboard`.

La aplicación se construye con `createApp({ userRepository, queryService, dashboardService, schemaProvider, sessionSecret })`. La inyección permite probar la API con repositorios y servicios simulados. El arranque `src/server.js` debe recibir las implementaciones reales de los integrantes 1 y 2 antes de usarlo como demo funcional.

## Pruebas y CI

```sh
npm test
npm run test:api
```

GitHub Actions ejecuta `npm ci` y la suite disponible para los pull requests y pushes a `dev` y `main`. Las pruebas de API usan sesiones HTTP y dobles de servicios; las pruebas de DSL, datos y frontend corresponden a sus integrantes.

## Contenedor

```sh
docker build -t sql-inv .
docker run --rm -p 3000:3000 -e SESSION_SECRET="$(openssl rand -base64 48)" sql-inv
```

El contenedor ejecuta Node.js 24 como usuario sin privilegios. La API habilita cookies `Secure` cuando `NODE_ENV=production`; detrás de HTTPS, el proxy debe configurarse según las instrucciones de despliegue de Express antes de publicar el servicio.

## Documentación del proyecto

- [Contratos técnicos](docs/00-contratos-tecnicos.md)
- [Bases teóricas](docs/01-bases-teoricas.md)
- [Justificación del DSL](docs/02-justificacion-dsl.md)
- [Demostración de abstracción](docs/03-demostracion-abstraccion.md)
- [Metamodelo](docs/04-metamodelo.md)
- [Requisitos del sistema](docs/05-requisitos.md)
- [Guion de demostración](docs/06-guion-demo.md)
