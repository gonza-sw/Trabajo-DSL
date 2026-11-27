import { Router } from 'express';
import { requireAuth } from '../security/auth.js';

export function createDashboardRouter({ dashboardService } = {}) {
  if (!dashboardService?.getSummary) throw new Error('dashboardService.getSummary es requerido');
  const router = Router();
  router.get('/', requireAuth, async (req, res, next) => {
    try {
      const summary = await dashboardService.getSummary(req.user);
      return res.json({ success: true, ...summary });
    } catch (error) { return next(error); }
  });
  return router;
}
