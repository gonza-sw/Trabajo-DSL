// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ADMIN_CATALOG } from '../fixtures/catalog.js';
import { initBuilder } from '../../src/public/js/builder.js';
import { renderResult, renderError, renderLoading, renderSql, renderProblems, formatCell } from '../../src/public/js/results.js';
import { ApiError } from '../../src/public/js/api.js';

const page = () => {
  document.body.innerHTML = `<select id="source"></select><div id="field-list"></div><div id="where"></div>
    <div id="select-rows"></div><input type="checkbox" id="group-auto" checked><div id="group-manual"></div><p id="group-effective"></p>
    <div id="having"></div><div id="order-rows"></div><button id="add-order"></button><pre id="json-preview"></pre>
    <button id="run"></button><ul id="problems" hidden></ul><pre id="sql"></pre><code id="params"></code><div id="result"></div>`;
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const rowsText = () => [...document.querySelectorAll('#result tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent));

describe('render de resultados', () => {
  beforeEach(page);

  it('tabla con datos: encabezados, filas y conteo', () => {
    renderResult(document, document.getElementById('result'), {
      columns: ['categoria', 'total'], rows: [{ categoria: 'Perifericos', total: 120 }, { categoria: 'Accesorios', total: 8 }], rowCount: 2,
    });
    expect([...document.querySelectorAll('#result th')].map((t) => t.textContent)).toEqual(['categoria', 'total']);
    expect(rowsText()).toEqual([['Perifericos', '120'], ['Accesorios', '8']]);
    expect(document.querySelector('#result td.num').textContent).toBe('120');
    expect(document.getElementById('result').textContent).toContain('2 fila(s)');
  });

  it('sin filas conserva las columnas y muestra un mensaje', () => {
    renderResult(document, document.getElementById('result'), { columns: ['a', 'b'], rows: [], rowCount: 0 });
    expect([...document.querySelectorAll('#result th')].map((t) => t.textContent)).toEqual(['a', 'b']);
    expect(document.querySelector('#result tbody td').textContent).toContain('no devolvió filas');
    expect(document.querySelector('#result tbody td').colSpan).toBe(2);
  });

  it('un valor con HTML se muestra como texto, no se interpreta', () => {
    renderResult(document, document.getElementById('result'), {
      columns: ['producto'], rows: [{ producto: '<img src=x onerror=alert(1)>' }], rowCount: 1,
    });
    expect(document.querySelector('#result img')).toBeNull();
    expect(document.querySelector('#result td').textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('estado de carga y de error (el mensaje del servidor es texto)', () => {
    const box = document.getElementById('result');
    renderLoading(document, box);
    expect(box.textContent).toContain('Ejecutando');
    expect(box.getAttribute('aria-busy')).toBe('true');
    renderError(document, box, new ApiError('INVALID_FIELD', '<b>Columna no permitida</b>', 400));
    expect(box.textContent).toBe('[INVALID_FIELD] <b>Columna no permitida</b>');
    expect(box.querySelector('b')).toBeNull();
    expect(box.querySelector('[role="alert"]')).not.toBeNull();
    expect(box.hasAttribute('aria-busy')).toBe(false);
  });

  it('SQL y parámetros se muestran como texto', () => {
    renderSql(document, document.getElementById('sql'), document.getElementById('params'), { sql: 'SELECT a FROM v WHERE x > ?', params: [500, "O'Brien"] });
    expect(document.getElementById('sql').textContent).toBe('SELECT a FROM v WHERE x > ?');
    expect(document.getElementById('params').textContent).toBe('[500,"O\'Brien"]');
  });

  it('formatCell: null, decimales y texto', () => {
    expect(formatCell(null)).toBe('NULL');
    expect(formatCell(12)).toBe('12');
    expect(formatCell(1234.567)).toMatch(/1[.,\s]?234[.,]57/);
    expect(formatCell('x')).toBe('x');
  });

  it('renderProblems muestra y oculta la lista', () => {
    const ul = document.getElementById('problems');
    renderProblems(document, ul, [{ message: 'a' }, { message: 'b' }]);
    expect(ul.hidden).toBe(false);
    expect([...ul.children].map((l) => l.textContent)).toEqual(['a', 'b']);
    renderProblems(document, ul, []);
    expect(ul.hidden).toBe(true);
  });
});

describe('ejecución desde el constructor', () => {
  beforeEach(page);

  it('no llama a la API si la consulta no es válida y explica el problema', async () => {
    const api = { schema: async () => ADMIN_CATALOG, query: vi.fn() };
    const b = await initBuilder(document, api);
    document.getElementById('run').click(); await tick();
    expect(api.query).not.toHaveBeenCalled();
    expect(document.getElementById('problems').textContent).toContain('al menos un campo');
    expect(b.lastResult).toBeUndefined();
  });

  it('envía el JSON del contrato y muestra SQL, parámetros y tabla', async () => {
    const query = vi.fn().mockResolvedValue({ success: true, sql: 'SELECT producto FROM v_inventario', params: [], columns: ['producto'], rows: [{ producto: 'Mouse' }], rowCount: 1 });
    const b = await initBuilder(document, { schema: async () => ADMIN_CATALOG, query });
    document.querySelector('[data-field="producto"]').click();
    document.getElementById('run').click(); await tick();
    expect(query).toHaveBeenCalledWith({ source: 'v_inventario', select: [{ field: 'producto' }], where: null, groupBy: [], having: null, orderBy: [] });
    expect(document.getElementById('sql').textContent).toBe('SELECT producto FROM v_inventario');
    expect(rowsText()).toEqual([['Mouse']]);
    expect(document.getElementById('run').disabled).toBe(false);
    expect(b.lastResult.rowCount).toBe(1);
  });

  it('un error de la API se muestra y el botón vuelve a habilitarse', async () => {
    const query = vi.fn().mockRejectedValue(new ApiError('FORBIDDEN', 'No tienes permiso para consultar esta fuente', 403));
    await initBuilder(document, { schema: async () => ADMIN_CATALOG, query });
    document.querySelector('[data-field="producto"]').click();
    document.getElementById('run').click(); await tick();
    expect(document.getElementById('result').textContent).toContain('[FORBIDDEN] No tienes permiso');
    expect(document.getElementById('run').disabled).toBe(false);
  });

  it('mientras carga, el botón queda deshabilitado y se muestra el estado', async () => {
    let finish;
    const query = vi.fn(() => new Promise((res) => { finish = res; }));
    await initBuilder(document, { schema: async () => ADMIN_CATALOG, query });
    document.querySelector('[data-field="producto"]').click();
    document.getElementById('run').click();
    expect(document.getElementById('run').disabled).toBe(true);
    expect(document.getElementById('result').textContent).toContain('Ejecutando');
    finish({ sql: 'S', params: [], columns: ['producto'], rows: [], rowCount: 0 }); await tick();
    expect(document.getElementById('run').disabled).toBe(false);
  });

  it('descarta la respuesta de una ejecución anterior', async () => {
    const resolvers = [];
    const query = vi.fn(() => new Promise((res) => { resolvers.push(res); }));
    await initBuilder(document, { schema: async () => ADMIN_CATALOG, query });
    document.querySelector('[data-field="producto"]').click();
    const btn = document.getElementById('run');
    btn.click(); btn.disabled = false; btn.click();
    resolvers[1]({ sql: 'NUEVA', params: [], columns: ['producto'], rows: [{ producto: 'B' }], rowCount: 1 });
    await tick();
    resolvers[0]({ sql: 'VIEJA', params: [], columns: ['producto'], rows: [{ producto: 'A' }], rowCount: 1 });
    await tick();
    expect(document.getElementById('sql').textContent).toBe('NUEVA');
    expect(rowsText()).toEqual([['B']]);
  });

  it('una consulta con filtro de texto envía el valor como dato, no como SQL', async () => {
    const query = vi.fn().mockResolvedValue({ sql: 'S', params: [], columns: ['producto'], rows: [], rowCount: 0 });
    await initBuilder(document, { schema: async () => ADMIN_CATALOG, query });
    document.querySelector('[data-field="producto"]').click();
    document.querySelector('[data-role="add-condition"]').click();
    const value = document.querySelector('[data-role="value"]');
    value.value = "' OR 1=1 --"; value.dispatchEvent(new Event('input'));
    document.getElementById('run').click(); await tick();
    const sent = query.mock.calls[0][0];
    expect(sent.where.conditions[0].value).toBe("' OR 1=1 --");
    expect(Object.keys(sent)).not.toContain('sql');
  });
});
