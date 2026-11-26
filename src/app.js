import express from 'express';
import session from 'express-session';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuthRouter } from './routes/auth.js';
import { createQueryRouter } from './routes/query.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { requireAuth } from './security/auth.js';
import { filterSchemaForRole } from './security/role-policy.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp({
  userRepository,
  queryService,
  dashboardService,
  schemaProvider = () => ({}),
  sessionSecret = process.env.SESSION_SECRET,
  secureCookies = process.env.NODE_ENV === 'production',
  sessionStore,
  logger = console,
} = {}) {
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET debe tener al menos 32 caracteres');
  }
  if (!userRepository) throw new Error('Se requiere userRepository');

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb', strict: true }));
  app.use(session({
    name: 'sqlinv.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    ...(sessionStore ? { store: sessionStore } : {}),
    cookie: { httpOnly: true, sameSite: 'strict', secure: secureCookies, maxAge: 30 * 60 * 1000 },
  }));

  app.use('/api/auth', createAuthRouter({ userRepository }));
  app.get('/api/schema', requireAuth, (req, res, next) => {
    try {
      const schema = schemaProvider(req.session.user);
      return res.json({ success: true, ...filterSchemaForRole(schema, req.session.user) });
    } catch (error) { return next(error); }
  });
  app.use('/api/query', createQueryRouter({ queryService }));
  app.use('/api/dashboard', createDashboardRouter({ dashboardService }));
  app.use(express.static(path.join(here, 'public')));

  app.use((req, res) => res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large') {
      const tooLarge = error.type === 'entity.too.large';
      return res.status(tooLarge ? 413 : 400).json({ success: false, error: { code: tooLarge ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON', message: tooLarge ? 'Solicitud demasiado grande' : 'JSON inválido' } });
    }
    logger.error?.('Error interno en API', error);
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } });
  });
  return app;
}
