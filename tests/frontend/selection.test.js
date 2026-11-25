// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { ADMIN_CATALOG, CONSULTA_CATALOG } from '../fixtures/catalog.js';
import { createState, setSource, toggleField, isSelected, sourceFields } from '../../src/public/js/builder-model.js';
import { initBuilder } from '../../src/public/js/builder.js';
import { showView, setupNavigation } from '../../src/public/js/nav.js';

const page = () => {
  document.body.innerHTML = `
    <nav><button class="nav-tab" data-view="builder" aria-selected="true"></button>
         <button class="nav-tab" data-view="dashboard" aria-selected="false"></button></nav>
    <section data-view-panel="builder"></section><section data-view-panel="dashboard" hidden></section>
    <select id="source"></select><div id="field-list"></div><div id="where"></div>
    <div id="select-rows"></div><input type="checkbox" id="group-auto" checked><div id="group-manual"></div><p id="group-effective"></p>
    <div id="having"></div><div id="order-rows"></div><button id="add-order"></button><pre id="json-preview"></pre>`;
};
const names = () => [...document.querySelectorAll('#field-list [data-field]')].map((i) => i.dataset.field);
const checked = () => [...document.querySelectorAll('#field-list [data-field]')].filter((i) => i.checked).map((i) => i.dataset.field);

describe('modelo: selección de campos', () => {
  it('la fuente inicial es la primera del catálogo', () => {
    expect(createState(ADMIN_CATALOG).source).toBe('v_inventario');
  });

  it('toggleField agrega y quita un campo proyectado', () => {
    let s = createState(ADMIN_CATALOG);
    s = toggleField(s, 'producto');
    expect(isSelected(s, 'producto')).toBe(true);
    s = toggleField(s, 'producto');
    expect(isSelected(s, 'producto')).toBe(false);
  });

  it('ignora campos que no existen en la fuente', () => {
    const s = createState(ADMIN_CATALOG);
    expect(toggleField(s, 'password_hash')).toBe(s);
  });

  it('cambiar de fuente conserva campos compatibles y limpia los demás', () => {
    let s = createState(ADMIN_CATALOG);
    s = toggleField(toggleField(toggleField(s, 'producto'), 'precio'), 'cantidad');
    s = { ...s, where: { logic: 'AND', conditions: [
      { field: 'precio', operator: '<', value: 500 },
      { logic: 'OR', conditions: [{ field: 'almacen', operator: '=', value: 'Lima' }] },
    ] } };
    s = setSource(s, 'v_movimientos');
    expect(s.source).toBe('v_movimientos');
    expect(s.select.map((x) => x.field)).toEqual(['producto', 'cantidad']); // 'precio' no existe en movimientos
    // la condición sobre precio desaparece; la de almacen (existe en ambas) se conserva
    expect(s.where.conditions).toHaveLength(1);
    expect(s.where.conditions[0].conditions[0].field).toBe('almacen');
  });

  it('un campo con el mismo nombre pero distinto tipo se considera incompatible', () => {
    const cat = { sources: [
      { name: 'a', fields: [{ name: 'x', type: 'integer' }] },
      { name: 'b', fields: [{ name: 'x', type: 'text' }] },
    ] };
    let s = toggleField(createState(cat), 'x');
    s = setSource(s, 'b');
    expect(s.select).toEqual([]);
  });

  it('una fuente inexistente no cambia el estado', () => {
    const s = createState(ADMIN_CATALOG);
    expect(setSource(s, 'usuarios')).toBe(s);
  });

  it('sourceFields devuelve los campos de la fuente activa', () => {
    expect(sourceFields(createState(ADMIN_CATALOG)).map((f) => f.name)).toContain('precio');
  });
});

describe('interfaz: fuentes y columnas autorizadas', () => {
  beforeEach(page);

  it('lista solo las fuentes y campos que entrega el esquema (rol admin)', async () => {
    await initBuilder(document, { schema: async () => ADMIN_CATALOG });
    expect([...document.querySelectorAll('#source option')].map((o) => o.value)).toEqual(['v_inventario', 'v_movimientos']);
    expect(names()).toEqual(['producto', 'categoria', 'almacen_id', 'almacen', 'cantidad', 'precio']);
  });

  it('el rol consulta solo ve v_inventario', async () => {
    await initBuilder(document, { schema: async () => CONSULTA_CATALOG });
    expect([...document.querySelectorAll('#source option')].map((o) => o.value)).toEqual(['v_inventario']);
  });

  it('marcar un campo lo agrega al estado y cambiar la fuente re-renderiza los campos', async () => {
    const b = await initBuilder(document, { schema: async () => ADMIN_CATALOG });
    document.querySelector('[data-field="precio"]').click();
    document.querySelector('[data-field="cantidad"]').click();
    expect(b.state.select.map((s) => s.field)).toEqual(['precio', 'cantidad']);

    const src = document.getElementById('source');
    src.value = 'v_movimientos';
    src.dispatchEvent(new Event('change'));
    expect(names()).toEqual(['producto', 'categoria', 'almacen', 'tipo', 'cantidad', 'fecha']);
    expect(checked()).toEqual(['cantidad']); // 'precio' se descartó
  });

  it('los nombres de campo se muestran como texto, no como HTML', async () => {
    document.getElementById('field-list');
    const evil = { sources: [{ name: 's', fields: [{ name: '<img src=x onerror=alert(1)>', type: 'text' }] }] };
    await initBuilder(document, { schema: async () => evil });
    expect(document.querySelector('#field-list img')).toBeNull();
    expect(document.getElementById('field-list').textContent).toContain('<img src=x');
  });
});

describe('navegación', () => {
  beforeEach(page);

  it('showView muestra solo la vista pedida y marca la pestaña', () => {
    expect(showView(document, 'dashboard')).toBe(true);
    expect(document.querySelector('[data-view-panel="builder"]').hidden).toBe(true);
    expect(document.querySelector('[data-view-panel="dashboard"]').hidden).toBe(false);
    expect(document.querySelector('[data-view="dashboard"]').getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector('[data-view="builder"]').getAttribute('aria-selected')).toBe('false');
  });

  it('una vista inexistente no cambia nada', () => {
    expect(showView(document, 'otra')).toBe(false);
    expect(document.querySelector('[data-view-panel="builder"]').hidden).toBe(false);
  });

  it('clic en una pestaña cambia de vista y notifica', () => {
    const seen = [];
    setupNavigation(document, { onChange: (v) => seen.push(v) });
    document.querySelector('[data-view="dashboard"]').click();
    expect(seen).toEqual(['dashboard']);
    expect(document.querySelector('[data-view-panel="dashboard"]').hidden).toBe(false);
  });
});
