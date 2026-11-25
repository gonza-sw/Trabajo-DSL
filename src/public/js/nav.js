// Navegación entre las dos vistas (constructor / dashboard).
// Funciona sobre cualquier documento (se usa tal cual en las pruebas con jsdom).

export function showView(doc, name) {
  const panels = [...doc.querySelectorAll('[data-view-panel]')];
  if (!panels.some((p) => p.dataset.viewPanel === name)) return false; // no tocar nada si no existe
  panels.forEach((p) => { p.hidden = p.dataset.viewPanel !== name; });
  doc.querySelectorAll('.nav-tab').forEach((t) => {
    t.setAttribute('aria-selected', String(t.dataset.view === name));
  });
  return true;
}

export function setupNavigation(doc, { onChange } = {}) {
  const tabs = doc.querySelectorAll('.nav-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      if (showView(doc, tab.dataset.view)) onChange?.(tab.dataset.view);
    });
  });
}
