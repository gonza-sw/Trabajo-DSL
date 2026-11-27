// @vitest-environment jsdom
// Regresiones detectadas al verificar la interfaz contra la API real.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ADMIN_CATALOG } from '../fixtures/catalog.js';
import * as M from '../../src/public/js/builder-model.js';
import * as Q from '../../src/public/js/builder-query.js';
import { initBuilder } from '../../src/public/js/builder.js';
import { ApiError } from '../../src/public/js/api.js';

const base = () => M.createState(ADMIN_CATALOG);
const pipe = (s, ...fs) => fs.reduce((a, f) => f(a), s);
const page = () => {
  document.body.innerHTML = `<select id="source"></select><div id="field-list"></div><div id="where"></div>
    <div id="select-rows"></div><input type="checkbox" id="group-auto" checked><div id="group-manual"></div><p id="group-effective"></p>
    <div id="having"></div><div id="order-rows"></div><button id="add-order"></button><pre id="json-preview"></pre>
    <button id="run"></button><ul id="problems" hidden></ul><pre id="sql"></pre><code id="params"></code><div id="result"></div>`;
};
const $ = (s) => document.querySelector(s);
const change = (n, value, type = 'change') => { n.value = value; n.dispatchEvent(new Event(type)); };
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('alias en columnas sin agregación', () => {
  it('se envía el alias para que ORDER BY pueda usarlo', () => {
    let s = pipe(base(), (x) => M.toggleField(x, 'producto'), (x) => Q.setAlias(x, 0, 'nombre_p'), (x) => Q.addOrder(x));
    const q = Q.serializeQuery(s);
    expect(q.select).toEqual([{ field: 'producto', alias: 'nombre_p' }]);
    expect(q.orderBy).toEqual([{ field: 'nombre_p', direction: 'ASC' }]);
    s = Q.setAlias(s, 0, '');
    expect(Q.serializeQuery(s).select).toEqual([{ field: 'producto' }]);
  });
});

describe('ORDER BY coherente con las columnas', () => {
  beforeEach(page);

  it('quitar una columna elimina el orden que la usaba', async () => {
    const b = await initBuilder(document, { schema: async () => ADMIN_CATALOG });
    $('[data-field="categoria"]').click();
    $('#agg-fn').value = 'SUM'; $('#agg-field').value = 'cantidad'; $('[data-role="add-aggregate"]').click();
    $('#add-order').click();
    change($('[data-role="order-field"]'), 'sum_cantidad');
    document.querySelectorAll('[data-role="remove-select"]')[1].click();
    expect(b.state.orderBy).toEqual([]);
    expect(Q.validateState(b.state)).toEqual([]);
  });

  it('desmarcar un campo conserva los órdenes de las demás columnas', async () => {
    const b = await initBuilder(document, { schema: async () => ADMIN_CATALOG });
    $('[data-field="producto"]').click(); $('[data-field="precio"]').click();
    $('#add-order').click(); $('#add-order').click();
    change(document.querySelectorAll('[data-role="order-field"]')[1], 'precio');
    $('[data-field="producto"]').click();
    expect(b.state.orderBy).toEqual([{ field: 'precio', direction: 'ASC' }]);
  });

  it('renombrar el alias actualiza el ORDER BY mientras se escribe', async () => {
    const b = await initBuilder(document, { schema: async () => ADMIN_CATALOG });
    $('[data-field="categoria"]').click();
    $('#agg-fn').value = 'SUM'; $('#agg-field').value = 'cantidad'; $('[data-role="add-aggregate"]').click();
    $('#add-order').click();
    change($('[data-role="order-field"]'), 'sum_cantidad');
    const alias = document.querySelectorAll('[data-role="alias"]')[1];
    for (const typed of ['t', 'to', 'total']) change(alias, typed, 'input');
    expect(b.state.orderBy).toEqual([{ field: 'total', direction: 'ASC' }]);
    alias.dispatchEvent(new Event('change'));
    expect($('[data-role="order-field"]').value).toBe('total');
  });
});

describe('HAVING coherente con las reglas del DSL', () => {
  it('con HAVING y sin agregación en SELECT se genera el GROUP BY automático', () => {
    const s = pipe(base(), (x) => M.toggleField(x, 'categoria'), (x) => Q.setHaving(x, { value: '100' }));
    expect(Q.serializeQuery(s).groupBy).toEqual(['categoria']);
    expect(Q.validateState(s)).toEqual([]);
  });

  it('en modo manual exige que las columnas no agregadas estén en GROUP BY', () => {
    let s = pipe(base(), (x) => M.toggleField(x, 'categoria'), (x) => Q.setGroupAuto(x, false), (x) => Q.setHaving(x, { value: '1' }));
    expect(Q.validateState(s).map((p) => p.code)).toEqual(expect.arrayContaining(['GROUP_MISMATCH', 'HAVING_NO_GROUP']));
    s = Q.toggleGroupBy(s, 'categoria');
    expect(Q.validateState(s)).toEqual([]);
  });

  it('sobre un campo de texto solo ofrece COUNT', () => {
    expect(Q.havingAggregatesFor('string')).toEqual(['COUNT']);
    expect(Q.havingAggregatesFor('number')).toContain('MIN');
    const s = Q.setHaving(base(), { field: 'producto', aggregate: 'MIN' });
    expect(s.having.aggregate).toBe('COUNT');
  });

  it('no propone MIN/MAX de texto aunque esté en el SELECT', () => {
    const s = pipe(base(), (x) => Q.addAggregate(x, 'producto', 'MAX'), (x) => Q.setHaving(x, {}));
    expect(s.having).toMatchObject({ field: 'cantidad', aggregate: 'SUM' });
  });
});
