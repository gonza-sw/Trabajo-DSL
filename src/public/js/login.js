import { createApi } from './api.js';

export function setupLogin(doc, api, { redirect } = {}) {
  const form = doc.getElementById('login-form');
  const errorBox = doc.getElementById('login-error');
  const submit = doc.getElementById('login-submit');

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    errorBox.hidden = true;
    const username = doc.getElementById('username').value.trim();
    const password = doc.getElementById('password').value;
    if (!username || !password) {
      errorBox.textContent = 'Ingrese usuario y contraseña';
      errorBox.hidden = false;
      return;
    }
    submit.disabled = true;
    try {
      await api.login(username, password);
      redirect?.('/index.html');
    } catch (e) {
      errorBox.textContent = e.message || 'No se pudo iniciar sesión';
      errorBox.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });
}

if (typeof window !== 'undefined' && window.document?.getElementById('login-form')) {
  const api = createApi();
  setupLogin(document, api, { redirect: (url) => window.location.assign(url) });
}
