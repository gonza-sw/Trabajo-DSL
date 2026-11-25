// Cliente de la API REST (mismo origen). Respeta el contrato del manual:
//   éxito  -> { success: true, ... }
//   error  -> { success: false, error: { code, message } }
// Cualquier fallo se convierte en ApiError para que la interfaz maneje un solo tipo de error.

export class ApiError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export function createApi({ fetchImpl = (...a) => globalThis.fetch(...a), baseUrl = '', onUnauthorized } = {}) {
  async function request(method, path, body) {
    let res;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError('NETWORK_ERROR', 'No se pudo conectar con el servidor');
    }
    let data = null;
    try { data = await res.json(); } catch { /* respuesta sin JSON */ }

    if (res.status === 401) {
      // en login un 401 es "credenciales incorrectas", no una sesión vencida
      if (path !== '/api/auth/login') onUnauthorized?.();
      throw new ApiError(data?.error?.code ?? 'UNAUTHENTICATED', data?.error?.message ?? 'Sesión no válida', 401);
    }
    if (!res.ok || !data || data.success === false) {
      throw new ApiError(data?.error?.code ?? 'REQUEST_FAILED', data?.error?.message ?? 'La solicitud no pudo completarse', res.status);
    }
    return data;
  }

  return {
    login: (username, password) => request('POST', '/api/auth/login', { username, password }),
    logout: () => request('POST', '/api/auth/logout', {}),
    me: () => request('GET', '/api/auth/me'),
    schema: () => request('GET', '/api/schema'),
    query: (ast) => request('POST', '/api/query', ast),
    dashboard: () => request('GET', '/api/dashboard'),
  };
}
