// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createApi, ApiError } from '../../src/public/js/api.js';
import { requireSession, signOut, describeUser } from '../../src/public/js/session.js';
import { setupLogin } from '../../src/public/js/login.js';

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('cliente de API', () => {
  it('login envía credenciales como JSON y devuelve el usuario', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { success: true, user: { id: 1, username: 'admin', rol: 'admin', almacen_id: null } }));
    const api = createApi({ fetchImpl });
    const res = await api.login('admin', 'x');
    expect(res.user.username).toBe('admin');
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/auth/login');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ username: 'admin', password: 'x' });
    expect(opts.credentials).toBe('same-origin');
  });

  it('un error del contrato se convierte en ApiError con code y message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(400, { success: false, error: { code: 'INVALID_FIELD', message: 'Columna no permitida' } }));
    const api = createApi({ fetchImpl });
    await expect(api.query({})).rejects.toMatchObject({ code: 'INVALID_FIELD', message: 'Columna no permitida', status: 400 });
    await expect(api.query({})).rejects.toBeInstanceOf(ApiError);
  });

  it('401 en una ruta protegida avisa a onUnauthorized', async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(json(401, { success: false, error: { code: 'UNAUTHENTICATED', message: 'Sin sesión' } }));
    const api = createApi({ fetchImpl, onUnauthorized });
    await expect(api.schema()).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('401 en login (credenciales malas) NO dispara onUnauthorized', async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(json(401, { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Usuario o contraseña incorrectos' } }));
    const api = createApi({ fetchImpl, onUnauthorized });
    await expect(api.login('a', 'b')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('error de red -> NETWORK_ERROR; respuesta sin JSON -> REQUEST_FAILED', async () => {
    const down = createApi({ fetchImpl: vi.fn().mockRejectedValue(new Error('boom')) });
    await expect(down.me()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    const broken = createApi({ fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error('no json'); } }) });
    await expect(broken.me()).rejects.toMatchObject({ code: 'REQUEST_FAILED', status: 500 });
  });

  it('GET no envía cuerpo', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { success: true, sources: [] }));
    await createApi({ fetchImpl }).schema();
    expect(fetchImpl.mock.calls[0][1].body).toBeUndefined();
  });
});

describe('sesión', () => {
  it('requireSession devuelve el usuario cuando hay sesión', async () => {
    const api = { me: async () => ({ success: true, user: { username: 'op', rol: 'operario', almacen_id: 1 } }) };
    expect(await requireSession(api)).toMatchObject({ rol: 'operario' });
  });

  it('sin sesión redirige a login y devuelve null', async () => {
    const redirect = vi.fn();
    const api = { me: async () => { throw new ApiError('UNAUTHENTICATED', 'x', 401); } };
    expect(await requireSession(api, { redirect })).toBeNull();
    expect(redirect).toHaveBeenCalledWith('/login.html');
  });

  it('otros errores se propagan', async () => {
    const api = { me: async () => { throw new ApiError('INTERNAL_ERROR', 'x', 500); } };
    await expect(requireSession(api, {})).rejects.toMatchObject({ status: 500 });
  });

  it('signOut cierra sesión y redirige aunque falle el servidor', async () => {
    const redirect = vi.fn();
    await expect(signOut({ logout: async () => { throw new ApiError('X', 'x', 500); } }, { redirect })).rejects.toBeInstanceOf(ApiError);
    expect(redirect).toHaveBeenCalledWith('/login.html');
  });

  it('describeUser muestra rol y almacén', () => {
    expect(describeUser({ username: 'op', rol: 'operario', almacen_id: 1 })).toBe('op (operario) · almacén 1');
    expect(describeUser({ username: 'admin', rol: 'admin', almacen_id: null })).toBe('admin (admin)');
  });
});

describe('formulario de login', () => {
  const build = () => {
    document.body.innerHTML = `<form id="login-form"><input id="username"><input id="password">
      <button id="login-submit" type="submit"></button><p id="login-error" hidden></p></form>`;
  };
  const submit = () => document.getElementById('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('campos vacíos muestran error y no llaman a la API', async () => {
    build();
    const api = { login: vi.fn() };
    setupLogin(document, api, {});
    submit(); await tick();
    expect(api.login).not.toHaveBeenCalled();
    expect(document.getElementById('login-error').hidden).toBe(false);
  });

  it('login correcto redirige a index', async () => {
    build();
    document.getElementById('username').value = 'admin';
    document.getElementById('password').value = 'x';
    const redirect = vi.fn();
    setupLogin(document, { login: vi.fn().mockResolvedValue({ success: true }) }, { redirect });
    submit(); await tick();
    expect(redirect).toHaveBeenCalledWith('/index.html');
  });

  it('login fallido muestra el mensaje del servidor como texto', async () => {
    build();
    document.getElementById('username').value = 'admin';
    document.getElementById('password').value = 'mala';
    setupLogin(document, { login: vi.fn().mockRejectedValue(new ApiError('INVALID_CREDENTIALS', '<b>Usuario o contraseña incorrectos</b>', 401)) }, {});
    submit(); await tick();
    const box = document.getElementById('login-error');
    expect(box.hidden).toBe(false);
    expect(box.textContent).toContain('Usuario o contraseña incorrectos');
    expect(box.querySelector('b')).toBeNull();
  });
});
