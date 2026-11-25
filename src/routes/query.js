import { Router } from 'express';
import { requireAuth } from '../security/auth.js';
import { applyRolePolicy, AuthorizationError } from '../security/role-policy.js';

export function createQueryRouter({ queryService } = {}) {
  if (!queryService?.execute) throw new Error('queryService.execute es requerido');
  const router = Router();
  router.post('/', requireAuth, async (req, res, next) => {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ success: false, error: { code: 'INVALID_QUERY', message: 'Se requiere una consulta JSON' } });
      }
      const query = applyRolePolicy(req.body, req.user);
      const result = await queryService.execute(query, req.user);
      return res.json(result);
    } catch (error) {
      if (error instanceof AuthorizationError) return res.status(403).json({ success: false, error: { code: error.code, message: error.message } });
      if (error?.code && /^[A-Z][A-Z0-9_]*$/.test(error.code)) {
        return res.status(400).json({ success: false, error: { code: error.code, message: error.message || 'Consulta inválida' } });
      }
      return next(error);
    }
  });
  return router;
}
