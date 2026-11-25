// Sesión del navegador. La identidad (rol, almacén) la decide SIEMPRE el servidor:
// aquí solo se consulta /api/auth/me y se redirige si no hay sesión.

export async function requireSession(api, { redirect } = {}) {
  try {
    const res = await api.me();
    return res.user ?? res;
  } catch (e) {
    if (e.status === 401 || e.code === 'UNAUTHENTICATED') {
      redirect?.('/login.html');
      return null;
    }
    throw e;
  }
}

export async function signOut(api, { redirect } = {}) {
  try { await api.logout(); } finally { redirect?.('/login.html'); }
}

export function describeUser(user) {
  if (!user) return '';
  const scope = user.almacen_id ? ` · almacén ${user.almacen_id}` : '';
  return `${user.username} (${user.rol})${scope}`;
}
