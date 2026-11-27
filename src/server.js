import { createApp } from './app.js';
import Database from 'better-sqlite3';
import { ALLOWED_SOURCES } from './config/whitelist.js';
import { SQLiteAdapter } from './adapters/sqlite-adapter.js';
import { QueryService } from './services/query-service.js';
import { DashboardService } from './services/dashboard-service.js';
import { buildAST } from './dsl/ast.js';
import { validateQuery } from './dsl/validator.js';
import { compileQuery } from './dsl/compiler.js';
import { applyRolePolicy } from './security/role-policy.js';

const usersDb = new Database(process.env.DB_PATH || 'src/db/inventory.sqlite', {
  readonly: true,
  fileMustExist: true,
});
usersDb.pragma('foreign_keys = ON');
usersDb.pragma('query_only = ON');

const userRepository = {
  async findByUsername(username) {
    return usersDb.prepare(`
      SELECT id, username, password_hash, rol, almacen_id
      FROM usuarios
      WHERE username = ?
    `).get(username);
  },
};
const adapter = new SQLiteAdapter();
const queryService = new QueryService({ adapter, buildAST, validateQuery, applyRolePolicy, compileQuery });
const dashboardService = new DashboardService({ adapter });
const app = createApp({
  userRepository,
  queryService,
  dashboardService,
  schemaProvider: () => ({
    sources: Object.entries(ALLOWED_SOURCES).map(([name, fields]) => ({
      name,
      fields: Object.entries(fields).map(([field, type]) => ({ name: field, type })),
    })),
  }),
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`SQL-INV escuchando en el puerto ${port}`));
