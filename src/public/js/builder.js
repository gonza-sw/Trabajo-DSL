// Constructor visual (capa DOM). Todo texto proveniente del servidor se inserta con
// textContent: nunca innerHTML.
import {
  createState, setSource, toggleField, sourceFields, isSelected, fieldType,
  operatorsFor, addCondition, addGroup, setLogic, updateCondition, removeNode, MAX_DEPTH,
} from './builder-model.js';
import {
  AGGREGATES, aggregatesFor, addAggregate, setSelectAggregate, setAlias, removeSelect, outputNames,
  setGroupAuto, toggleGroupBy, effectiveGroupBy, setHaving, addOrder, updateOrder, removeOrder, serializeQuery,
  reconcileOrder, havingAggregatesFor,
  validateState,
} from './builder-query.js';
import { renderIdle, renderLoading, renderError, renderResult, renderSql, renderProblems } from './results.js';

export function el(doc, tag, attrs = {}, ...kids) {
  const n = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : doc.createTextNode(String(k)));
  return n;
}

export async function initBuilder(doc, api) {
  const catalog = await api.schema();
  const builder = { state: createState(catalog) };

  const $ = (id) => doc.getElementById(id);
  const sourceSelect = $('source');

  const apply = (next) => { builder.state = reconcileOrder(builder.state, next); render(); };
  // cambios de texto: se actualiza el estado sin re-render para no perder el foco
  const applyQuiet = (next) => { builder.state = reconcileOrder(builder.state, next); renderPreview(); builder.onChange?.(builder.state); };

  const btn = (label, role, onclick, cls = 'btn small') =>
    el(doc, 'button', { class: cls, type: 'button', 'data-role': role, onclick }, label);
  const options = (values, selected) => values.map((v) => el(doc, 'option', { value: v, selected: v === selected }, v));

  function renderSources() {
    sourceSelect.replaceChildren(...catalog.sources.map((s) =>
      el(doc, 'option', { value: s.name, selected: s.name === builder.state.source }, s.name)));
  }

  function renderFields() {
    $('field-list').replaceChildren(...sourceFields(builder.state).map((f) => {
      const box = el(doc, 'input', { type: 'checkbox', checked: isSelected(builder.state, f.name), 'data-field': f.name });
      box.addEventListener('change', () => apply(toggleField(builder.state, f.name)));
      return el(doc, 'label', { class: 'field-item' }, box, f.name, el(doc, 'span', { class: 'field-type' }, f.type));
    }));
  }

  // ── SELECT con agregaciones ──
  function renderSelect() {
    const names = outputNames(builder.state);
    const rows = builder.state.select.map((s, i) => {
      const type = fieldType(builder.state, s.field);
      const agg = el(doc, 'select', { 'data-role': 'aggregate', 'aria-label': `Agregación de ${s.field}` },
        el(doc, 'option', { value: '', selected: !s.aggregate }, '— sin agregación'),
        options(aggregatesFor(type), s.aggregate));
      agg.addEventListener('change', () => apply(setSelectAggregate(builder.state, i, agg.value)));
      const alias = el(doc, 'input', { 'data-role': 'alias', 'aria-label': `Alias de ${s.field}`, value: s.alias, placeholder: names[i] });
      alias.addEventListener('input', () => applyQuiet(setAlias(builder.state, i, alias.value)));
      alias.addEventListener('change', () => apply(builder.state));
      return el(doc, 'div', { class: 'row', 'data-select-row': String(i) },
        el(doc, 'strong', {}, s.field), agg, alias, btn('✕', 'remove-select', () => apply(removeSelect(builder.state, i)), 'btn small danger'));
    });
    if (!rows.length) rows.push(el(doc, 'p', { class: 'muted small' }, 'Marque campos arriba o agregue una agregación.'));

    // alta de agregación: campo + función
    const fields = sourceFields(builder.state);
    const fieldSel = el(doc, 'select', { id: 'agg-field', 'aria-label': 'Campo a agregar' }, fields.map((f) => el(doc, 'option', { value: f.name }, f.name)));
    const fnSel = el(doc, 'select', { id: 'agg-fn', 'aria-label': 'Función' }, AGGREGATES.map((a) => el(doc, 'option', { value: a }, a)));
    rows.push(el(doc, 'div', { class: 'row' }, fnSel, fieldSel,
      btn('+ agregación', 'add-aggregate', () => apply(addAggregate(builder.state, fieldSel.value, fnSel.value)))));
    $('select-rows').replaceChildren(...rows);
  }

  // ayuda sobre el formato esperado del valor
  function valueHint(c) {
    if (c.operator === 'LIKE') return '%texto%';
    return c.field === 'fecha' ? 'AAAA-MM-DD' : 'valor';
  }

  // ── WHERE: grupos AND/OR recursivos ──
  function conditionRow(c, path, index) {
    const type = fieldType(builder.state, c.field);
    const field = el(doc, 'select', { 'data-role': 'field', 'aria-label': 'Campo' },
      sourceFields(builder.state).map((f) => el(doc, 'option', { value: f.name, selected: f.name === c.field }, f.name)));
    field.addEventListener('change', () => apply(updateCondition(builder.state, path, index, { field: field.value })));
    const op = el(doc, 'select', { 'data-role': 'operator', 'aria-label': 'Operador' }, options(operatorsFor(type), c.operator));
    op.addEventListener('change', () => apply(updateCondition(builder.state, path, index, { operator: op.value })));
    const value = el(doc, 'input', { 'data-role': 'value', 'aria-label': 'Valor', value: c.value ?? '', placeholder: valueHint(c) });
    value.addEventListener('input', () => applyQuiet(updateCondition(builder.state, path, index, { value: value.value })));
    return el(doc, 'div', { class: 'row' }, field, op, value,
      btn('✕', 'remove', () => apply(removeNode(builder.state, path, index)), 'btn small danger'));
  }

  function groupView(group, path, onRemove) {
    const logic = el(doc, 'select', { 'data-role': 'logic', 'aria-label': 'Lógica del grupo' }, options(['AND', 'OR'], group.logic));
    logic.addEventListener('change', () => apply(setLogic(builder.state, path, logic.value)));
    const head = el(doc, 'div', { class: 'row' },
      el(doc, 'strong', {}, path.length === 0 ? 'Grupo raíz' : `Subgrupo (nivel ${path.length})`), logic,
      btn('+ condición', 'add-condition', () => apply(addCondition(builder.state, path))));
    if (path.length < MAX_DEPTH) head.append(btn('+ subgrupo', 'add-group', () => apply(addGroup(builder.state, path))));
    if (onRemove) head.append(btn('Quitar grupo', 'remove-group', onRemove, 'btn small danger'));
    const box = el(doc, 'div', { class: 'group', 'data-depth': String(path.length) }, head);
    group.conditions.forEach((node, i) => {
      box.append(node.conditions
        ? groupView(node, [...path, i], () => apply(removeNode(builder.state, path, i)))
        : conditionRow(node, path, i));
    });
    return box;
  }

  // ── GROUP BY / HAVING ──
  function renderGroupBy() {
    const st = builder.state;
    const auto = $('group-auto');
    auto.checked = st.groupAuto;
    const manual = $('group-manual');
    manual.hidden = st.groupAuto;
    manual.replaceChildren(...sourceFields(st).map((f) => {
      const box = el(doc, 'input', { type: 'checkbox', checked: st.groupBy.includes(f.name), 'data-groupby': f.name });
      box.addEventListener('change', () => apply(toggleGroupBy(builder.state, f.name)));
      return el(doc, 'label', { class: 'field-item' }, box, f.name);
    }));
    $('group-effective').textContent = effectiveGroupBy(st).length ? `GROUP BY ${effectiveGroupBy(st).join(', ')}` : 'Sin GROUP BY';
  }

  function renderHaving() {
    const h = builder.state.having;
    const box = $('having');
    if (!h) {
      box.replaceChildren(btn('+ HAVING', 'add-having', () => apply(setHaving(builder.state, {}))));
      return;
    }
    const agg = el(doc, 'select', { 'data-role': 'having-aggregate', 'aria-label': 'Agregación' }, options(havingAggregatesFor(fieldType(builder.state, h.field)), h.aggregate));
    agg.addEventListener('change', () => apply(setHaving(builder.state, { aggregate: agg.value })));
    const field = el(doc, 'select', { 'data-role': 'having-field', 'aria-label': 'Campo' },
      sourceFields(builder.state).map((f) => el(doc, 'option', { value: f.name, selected: f.name === h.field }, f.name)));
    field.addEventListener('change', () => apply(setHaving(builder.state, { field: field.value })));
    const op = el(doc, 'select', { 'data-role': 'having-operator', 'aria-label': 'Operador' }, options(operatorsFor('integer'), h.operator));
    op.addEventListener('change', () => apply(setHaving(builder.state, { operator: op.value })));
    const value = el(doc, 'input', { 'data-role': 'having-value', 'aria-label': 'Valor', value: h.value ?? '', placeholder: 'valor' });
    value.addEventListener('input', () => applyQuiet(setHaving(builder.state, { value: value.value })));
    box.replaceChildren(el(doc, 'div', { class: 'row' }, agg, field, op, value,
      btn('✕', 'remove-having', () => apply(setHaving(builder.state, null)), 'btn small danger')));
  }

  // ── ORDER BY (solo campos proyectados o alias) ──
  function renderOrder() {
    const names = outputNames(builder.state);
    $('order-rows').replaceChildren(...builder.state.orderBy.map((o, i) => {
      const field = el(doc, 'select', { 'data-role': 'order-field', 'aria-label': 'Ordenar por' }, options(names, o.field));
      field.addEventListener('change', () => apply(updateOrder(builder.state, i, { field: field.value })));
      const dir = el(doc, 'select', { 'data-role': 'order-direction', 'aria-label': 'Dirección' }, options(['ASC', 'DESC'], o.direction));
      dir.addEventListener('change', () => apply(updateOrder(builder.state, i, { direction: dir.value })));
      return el(doc, 'div', { class: 'row' }, field, dir, btn('✕', 'remove-order', () => apply(removeOrder(builder.state, i)), 'btn small danger'));
    }));
  }

  // JSON exacto que se enviará a la API
  function renderPreview() {
    $('json-preview').textContent = JSON.stringify(serializeQuery(builder.state), null, 2);
  }

  function render() {
    renderFields();
    renderSelect();
    $('where').replaceChildren(groupView(builder.state.where, [], null));
    renderGroupBy();
    renderHaving();
    renderOrder();
    renderPreview();
    builder.onChange?.(builder.state);
  }

  // ── ejecución ──
  let runId = 0;

  // Quita todo lo que pertenezca a una ejecución anterior.
  function clearResults() {
    renderSql(doc, $('sql'), $('params'), null);
    renderIdle(doc, $('result'));
    delete builder.lastResult;
  }

  async function run() {
    const problems = validateState(builder.state);
    renderProblems(doc, $('problems'), problems);
    const id = ++runId;                      // descarta respuestas de ejecuciones anteriores
    const runBtn = $('run');
    if (problems.length) {                   // no se envía: no deben quedar resultados anteriores
      clearResults();
      runBtn.disabled = false;
      return null;
    }
    clearResults();                          // lo visible debe corresponder a esta ejecución
    runBtn.disabled = true;
    renderLoading(doc, $('result'));
    try {
      const result = await api.query(serializeQuery(builder.state));
      if (id !== runId) return null;
      renderSql(doc, $('sql'), $('params'), result);
      renderResult(doc, $('result'), result);
      builder.lastResult = result;
      return result;
    } catch (e) {
      if (id !== runId) return null;
      renderError(doc, $('result'), e);
      return null;
    } finally {
      if (id === runId) runBtn.disabled = false;
    }
  }
  builder.run = run;
  $('run').addEventListener('click', run);

  sourceSelect.addEventListener('change', () => apply(setSource(builder.state, sourceSelect.value)));
  $('group-auto').addEventListener('change', (e) => apply(setGroupAuto(builder.state, e.target.checked)));
  $('add-order').addEventListener('click', () => apply(addOrder(builder.state)));

  renderSources();
  render();
  return builder;
}
