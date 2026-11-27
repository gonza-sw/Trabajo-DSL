// @vitest-environment jsdom
// Prueba de la interfaz completa: el HTML real + cliente de API real, con fetch simulado a nivel de red.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_CATALOG } from '../fixtures/catalog.js';
import { createApi } from '../../src/public/js/api.js';
import { startApp } from '../../src/public/js/main.js';

const PUBLIC = path.resolve('src/public');
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function loadPage() {
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');
  document.body.innerHTML = body;
}

class FakeChart {
  static instances = [];
  constructor(canvas, config) { this.canvas = canvas; this.config = config; FakeChart.instances.push(this); }
  destroy() { this.destroyed = true; }
}

// Red simulada: tabla "METODO /ruta" -> { status, body } (o función)
function network(routes) {
  const calls = [];
  const fetchImpl = vi.fn(async (url, opts = {}) => {
    const key = `${opts.method ?? 'GET'} ${url}`;
    calls.push({ key, body: opts.body ? JSON.parse(opts.body) : undefined });
    const r = routes[key];
    if (!r) return { ok: false, status: 404, json: async () => ({ success: false, error: { code: 'NOT_FOUND', message: key } }) };
    const { status = 200, body } = typeof r === 'function' ? r(opts) : r;
    return { ok: status < 400, status, json: async () => body };
  });
  return { fetchImpl, calls };
}

const ADMIN = { id: 1, username: 'admin', rol: 'admin', almacen_id: null };
const okRoutes = () => ({
  'GET /api/auth/me': { body: { success: true, user: ADMIN } },
  'GET /api/schema': { body: ADMIN_CATALOG },
  'POST /api/query': { body: { success: true, sql: 'SELECT producto FROM v_inventario', params: [], columns: ['producto'], rows: [{ producto: 'Teclado' }], rowCount: 1 } },
  'GET /api/dashboard': { body: { success: true,
    stockByWarehouse: [{ label: 'Lima', value: 10 }, { label: 'Arequipa', value: 5 }, { label: 'Trujillo', value: 3 }],
    stockByCategory: [{ label: 'Perifericos', value: 12 }, { label: 'Accesorios', value: 6 }] } },
  'POST /api/auth/logout': { body: { success: true } },
});

function makeWin(search = '') {
  return { document, location: { assign: vi.fn(), search }, Chart: FakeChart };
}

describe('interfaz completa con la API real (red simulada)', () => {
  beforeEach(() => { loadPage(); FakeChart.instances.length = 0; });

  it('flujo: sesión -> esquema -> consulta -> dashboard', async () => {
    const net = network(okRoutes());
    const win = makeWin();
    const app = await startApp(win, createApi({ fetchImpl: net.fetchImpl }));
    expect(document.getElementById('user-badge').textContent).toBe('admin (admin)');
    expect([...document.querySelectorAll('#source option')].map((o) => o.value)).toEqual(['v_inventario', 'v_movimientos']);

    document.querySelector('[data-field="producto"]').click();
    document.getElementById('run').click();
    await tick();
    const q = net.calls.find((c) => c.key === 'POST /api/query');
    expect(q.body).toEqual({ source: 'v_inventario', select: [{ field: 'producto' }], where: null, groupBy: [], having: null, orderBy: [] });
    expect(document.querySelector('#result td').textContent).toBe('Teclado');
    expect(document.getElementById('sql').textContent).toBe('SELECT producto FROM v_inventario');

    document.querySelector('[data-view="dashboard"]').click();
    await tick();
    expect(net.calls.some((c) => c.key === 'GET /api/dashboard')).toBe(true);
    expect(FakeChart.instances.map((c) => c.config.type)).toEqual(['bar', 'doughnut']);
    expect(FakeChart.instances[0].config.data.datasets[0].data).toEqual([10, 5, 3]);
    expect(app.dashboard.charts.stockByCategory).toBeDefined();
  });

  it('sin sesión (401 en /api/auth/me): redirige a login y no pide esquema', async () => {
    const routes = okRoutes();
    routes['GET /api/auth/me'] = { status: 401, body: { success: false, error: { code: 'UNAUTHENTICATED', message: 'Sin sesión' } } };
    const net = network(routes);
    const win = makeWin();
    expect(await startApp(win, createApi({ fetchImpl: net.fetchImpl, onUnauthorized: () => {} }))).toBeNull();
    expect(win.location.assign).toHaveBeenCalledWith('/login.html');
    expect(net.calls.some((c) => c.key === 'GET /api/schema')).toBe(false);
  });

  it('salir: POST /api/auth/logout y vuelta a login', async () => {
    const net = network(okRoutes());
    const win = makeWin();
    await startApp(win, createApi({ fetchImpl: net.fetchImpl }));
    document.getElementById('logout').click();
    await tick();
    expect(net.calls.some((c) => c.key === 'POST /api/auth/logout')).toBe(true);
    expect(win.location.assign).toHaveBeenCalledWith('/login.html');
  });

  it('403 de la API al ejecutar: el error se muestra en el panel de resultados', async () => {
    const routes = okRoutes();
    routes['POST /api/query'] = { status: 403, body: { success: false, error: { code: 'FORBIDDEN', message: 'No tienes permiso para consultar esta fuente' } } };
    const net = network(routes);
    await startApp(makeWin(), createApi({ fetchImpl: net.fetchImpl }));
    document.querySelector('[data-field="producto"]').click();
    document.getElementById('run').click();
    await tick();
    expect(document.getElementById('result').textContent).toContain('[FORBIDDEN] No tienes permiso');
  });

  it('500 sin detalles: la interfaz muestra solo el mensaje genérico del servidor', async () => {
    const routes = okRoutes();
    routes['GET /api/dashboard'] = { status: 500, body: { success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } } };
    const net = network(routes);
    await startApp(makeWin(), createApi({ fetchImpl: net.fetchImpl }));
    document.querySelector('[data-view="dashboard"]').click();
    await tick();
    expect(document.getElementById('dashboard-error').textContent).toBe('[INTERNAL_ERROR] Error interno del servidor');
  });
});

describe('sin datos simulados en el modo normal', () => {
  it('el código público no contiene mocks ni el parámetro ?mock', () => {
    const files = [];
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'vendor') walk(p); } else files.push(p);
    });
    walk(PUBLIC);
    expect(files.some((f) => /mocks?\.js$/i.test(f))).toBe(false);
    for (const f of files) expect(fs.readFileSync(f, 'utf8'), f).not.toMatch(/mock/i);
  });

  it('aunque la URL traiga ?mock=1 se usan las rutas reales de la API', async () => {
    loadPage();
    const net = network(okRoutes());
    await startApp(makeWin('?mock=1'), createApi({ fetchImpl: net.fetchImpl }));
    expect(net.calls.map((c) => c.key)).toContain('GET /api/auth/me');
    expect(net.calls.map((c) => c.key)).toContain('GET /api/schema');
  });
});
