// Arranque de index.html: sesión, navegación y vistas.
import { createApi } from './api.js';
import { selectApi } from './mocks.js';
import { requireSession, signOut, describeUser } from './session.js';
import { setupNavigation } from './nav.js';
import { initBuilder } from './builder.js';
import { createDashboard } from './dashboard.js';

export async function startApp(win, api) {
  const doc = win.document;
  const goto = (url) => win.location.assign(url + win.location.search);

  const user = await requireSession(api, { redirect: goto });
  if (!user) return null;

  doc.getElementById('user-badge').textContent = describeUser(user);
  doc.getElementById('logout').addEventListener('click', () => signOut(api, { redirect: goto }));
  const builder = await initBuilder(doc, api);
  const dashboard = createDashboard({ doc, api, ChartCtor: win.Chart });
  // los datos del dashboard se piden cada vez que se abre la vista
  setupNavigation(doc, { onChange: (view) => { if (view === 'dashboard') dashboard.load(); } });
  return { user, builder, dashboard };
}

if (typeof window !== 'undefined' && window.document?.getElementById('view-builder')) {
  const api = await selectApi(window, createApi);
  await startApp(window, api).catch((e) => {
    const box = document.getElementById('app-error');
    box.textContent = e.message || 'Error al iniciar la aplicación';
    box.hidden = false;
  });
}
