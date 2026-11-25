import { promisify } from 'node:util';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const USER_FIELDS = ['id', 'username', 'rol', 'almacen_id'];

export function publicUser(user) {
  return Object.fromEntries(USER_FIELDS.map((field) => [field, user[field] ?? null]));
}

export async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  if (typeof password !== 'string' || password.length < 1) throw new TypeError('Contraseña requerida');
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') return false;
  const [algorithm, salt, digest, extra] = storedHash.split(':');
  if (algorithm !== 'scrypt' || !salt || !digest || extra !== undefined || !/^[\da-f]{128}$/i.test(digest)) return false;
  const actual = await scrypt(password, salt, KEY_LENGTH);
  return timingSafeEqual(actual, Buffer.from(digest, 'hex'));
}

export function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Inicia sesión para continuar' } });
  req.user = req.session.user;
  return next();
}

export function createAuthRouter({ userRepository } = {}) {
  if (!userRepository?.findByUsername) throw new Error('userRepository.findByUsername es requerido');
  const router = Router();

  router.post('/login', async (req, res, next) => {
    try {
      const { username, password } = req.body ?? {};
      if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
        return res.status(400).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Usuario y contraseña son requeridos' } });
      }
      const user = await userRepository.findByUsername(username.trim());
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Usuario o contraseña incorrectos' } });
      }
      if (!['admin', 'operario', 'consulta'].includes(user.rol)) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Rol sin acceso' } });
      }
      return req.session.regenerate((error) => {
        if (error) return next(error);
        req.session.user = publicUser(user);
        return req.session.save((saveError) => {
          if (saveError) return next(saveError);
          return res.json({ success: true, user: req.session.user });
        });
      });
    } catch (error) { return next(error); }
  });

  router.post('/logout', (req, res, next) => {
    if (!req.session) return res.json({ success: true });
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie('sqlinv.sid', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
      return res.json({ success: true });
    });
  });

  router.get('/me', requireAuth, (req, res) => res.json({ success: true, user: req.user }));
  return router;
}
