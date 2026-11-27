// Presentación de resultados: SQL, parámetros, tabla y estados (cargando / error / vacío).
// Todo valor se escribe con textContent: un dato con HTML se muestra como texto.

function node(doc, tag, className, text) {
  const n = doc.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function formatCell(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' && !Number.isInteger(value)) {
    return value.toLocaleString('es-PE', { maximumFractionDigits: 2 });
  }
  return String(value);
}

export function renderLoading(doc, box) {
  box.replaceChildren(node(doc, 'div', 'state', 'Ejecutando consulta…'));
  box.setAttribute('aria-busy', 'true');
}

export function renderError(doc, box, error) {
  box.removeAttribute('aria-busy');
  const p = node(doc, 'p', 'error');
  p.setAttribute('role', 'alert');
  p.textContent = `${error?.code ? `[${error.code}] ` : ''}${error?.message || 'Error inesperado'}`;
  box.replaceChildren(p);
}

export function renderProblems(doc, box, problems) {
  box.replaceChildren();
  box.hidden = problems.length === 0;
  for (const p of problems) box.append(node(doc, 'li', '', p.message));
}

// result = { sql, params, columns: [nombres], rows: [objetos], rowCount }
export function renderResult(doc, box, result) {
  box.removeAttribute('aria-busy');
  const columns = result.columns ?? [];
  const rows = result.rows ?? [];

  const table = node(doc, 'table');
  const thead = node(doc, 'thead');
  const hr = node(doc, 'tr');
  columns.forEach((c) => hr.append(node(doc, 'th', '', c)));
  thead.append(hr);
  const tbody = node(doc, 'tbody');

  if (!rows.length) {
    const tr = node(doc, 'tr');
    const td = node(doc, 'td', 'state', 'La consulta no devolvió filas');
    td.colSpan = Math.max(columns.length, 1);
    tr.append(td);
    tbody.append(tr);
  }
  for (const row of rows) {
    const tr = node(doc, 'tr');
    for (const c of columns) {
      const v = row[c];
      tr.append(node(doc, 'td', typeof v === 'number' ? 'num' : '', formatCell(v)));
    }
    tbody.append(tr);
  }
  table.append(thead, tbody);

  const wrap = node(doc, 'div', 'table-wrap');
  wrap.append(table);
  const count = node(doc, 'p', 'muted small', `${result.rowCount ?? rows.length} fila(s)`);
  box.replaceChildren(count, wrap);
}

export function renderSql(doc, sqlBox, paramsBox, result) {
  sqlBox.textContent = result?.sql ?? '';
  paramsBox.textContent = JSON.stringify(result?.params ?? []);
}
