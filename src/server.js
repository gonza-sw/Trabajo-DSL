import { createApp } from './app.js';

function unavailable(name) {
  return async () => { throw new Error(`${name} aún no está configurado`); };
}

const userRepository = {
  findByUsername: unavailable('Repositorio de usuarios'),
};
const app = createApp({
  userRepository,
  queryService: { execute: unavailable('Servicio de consultas') },
  dashboardService: { getSummary: unavailable('Servicio de dashboard') },
  schemaProvider: () => ({ sources: [] }),
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`SQL-INV escuchando en el puerto ${port}`));
