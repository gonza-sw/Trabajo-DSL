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
