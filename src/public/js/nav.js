// Navegación entre las dos vistas (constructor / dashboard).
// Funciona sobre cualquier documento (se usa tal cual en las pruebas con jsdom).

export function showView(doc, name) {
  const panels = doc.querySelectorAll('[data-view-panel]');
  let found = false;
  panels.forEach((p) => {
    const match = p.dataset.viewPanel === name;
    p.hidden = !match;
    if (match) found = true;
  });
  if (!found) return false;
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
