import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { hashPassword } from '../../src/security/auth.js';

let app;
let users;
let calls;

beforeAll(async () => {
  users = [
    { id: 1, username: 'admin', password_hash: await hashPassword('admin-pass'), rol: 'admin', almacen_id: null },
    { id: 2, username: 'operario', password_hash: await hashPassword('operator-pass'), rol: 'operario', almacen_id: 1 },
    { id: 3, username: 'consulta', password_hash: await hashPassword('reader-pass'), rol: 'consulta', almacen_id: 2 },
  ];
  calls = [];
  app = createApp({
    sessionSecret: 'test-session-secret-at-least-32-chars',
    userRepository: { findByUsername: async (username) => users.find((user) => user.username === username) },
    schemaProvider: () => ({ sources: [
      { name: 'v_inventario', fields: [{ name: 'cantidad', type: 'number' }] },
      { name: 'v_movimientos', fields: [{ name: 'tipo', type: 'text' }] },
    ] }),
    queryService: { execute: async (query, user) => {
      calls.push({ query, user });
      return { success: true, sql: 'SELECT cantidad FROM v_inventario', params: [], columns: ['cantidad'], rows: [], rowCount: 0 };
    } },
    dashboardService: { getSummary: async (user) => ({ stockByWarehouse: [{ label: String(user.almacen_id ?? 'todos'), value: 0 }], stockByCategory: [] }) },
    logger: { error() {} },
  });
});

describe('API y sesiones', () => {
  it('exige autenticación para me, schema, query y dashboard', async () => {
    for (const response of await Promise.all([
      request(app).get('/api/auth/me'), request(app).get('/api/schema'),
      request(app).post('/api/query').send({ source: 'v_inventario', select: [{ field: 'cantidad' }] }),
      request(app).get('/api/dashboard'),
    ])) expect(response.status).toBe(401);
  });

  it('autentica, limita el objeto expuesto y conserva la identidad del login', async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin-pass', rol: 'consulta' });
    expect(login.status).toBe(200);
    expect(login.body.user).toEqual({ id: 1, username: 'admin', rol: 'admin', almacen_id: null });
    expect(login.body.user.password_hash).toBeUndefined();
    expect((await agent.get('/api/auth/me')).body.user.rol).toBe('admin');
  });

  it('rechaza credenciales inválidas y carga JSON inválido', async () => {
    expect((await request(app).post('/api/auth/login').send({ username: 'admin', password: 'bad' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ username: 'admin' })).status).toBe(400);
  });

  it('destruye la sesión en logout', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin-pass' });
    expect((await agent.post('/api/auth/logout')).status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('filtra schema y entrega la consulta original al servicio con la identidad autenticada', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'operario', password: 'operator-pass' });
    const schema = await agent.get('/api/schema');
    expect(schema.body.sources.map((source) => source.name)).toEqual(['v_inventario', 'v_movimientos']);
    await agent.post('/api/query').send({ source: 'v_inventario', select: [{ field: 'cantidad' }], where: { logic: 'OR', conditions: [{ field: 'almacen', operator: '=', value: 'Lima' }, { field: 'almacen', operator: '=', value: 'Trujillo' }] } });
    expect(calls.at(-1).query.where).toEqual({ logic: 'OR', conditions: [{ field: 'almacen', operator: '=', value: 'Lima' }, { field: 'almacen', operator: '=', value: 'Trujillo' }] });
    expect(calls.at(-1).user).toMatchObject({ username: 'operario', rol: 'operario', almacen_id: 1 });
  });

  it('deniega movimientos al rol consulta y responde 403', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'consulta', password: 'reader-pass' });
    const response = await agent.post('/api/query').send({ source: 'v_movimientos', select: [{ field: 'tipo' }] });
    expect(response.status).toBe(403);
  });

  it('entrega dashboard con los datos del usuario autenticado', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'consulta', password: 'reader-pass' });
    const response = await agent.get('/api/dashboard');
    expect(response.status).toBe(200);
    expect(response.body.stockByWarehouse).toEqual([{ label: '2', value: 0 }]);
  });

  it('no filtra mensajes de fallos internos', async () => {
    const broken = createApp({
      sessionSecret: 'test-session-secret-at-least-32-chars',
      userRepository: { findByUsername: async () => { throw new Error('secret db password'); } },
      queryService: { execute: async () => ({}) }, dashboardService: { getSummary: async () => ({}) }, logger: { error() {} },
    });
    const response = await request(broken).post('/api/auth/login').send({ username: 'x', password: 'x' });
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('secret db password');
  });
});
