// Constructor visual (capa DOM). Todo texto proveniente del servidor se inserta con
// textContent: nunca innerHTML.
import {
  createState, setSource, toggleField, sourceFields, isSelected, fieldType,
  operatorsFor, addCondition, addGroup, setLogic, updateCondition, removeNode, MAX_DEPTH,
} from './builder-model.js';

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

  const sourceSelect = doc.getElementById('source');
  const fieldList = doc.getElementById('field-list');
  const whereBox = doc.getElementById('where');

  const apply = (next) => { builder.state = next; render(); };

  function renderSources() {
    sourceSelect.replaceChildren(...catalog.sources.map((s) =>
      el(doc, 'option', { value: s.name, selected: s.name === builder.state.source }, s.name)));
  }

  function renderFields() {
    fieldList.replaceChildren(...sourceFields(builder.state).map((f) => {
      const box = el(doc, 'input', { type: 'checkbox', checked: isSelected(builder.state, f.name), 'data-field': f.name });
      box.addEventListener('change', () => apply(toggleField(builder.state, f.name)));
      return el(doc, 'label', { class: 'field-item' }, box, f.name, el(doc, 'span', { class: 'field-type' }, f.type));
    }));
  }

  // ── WHERE: grupos AND/OR recursivos ──
  function conditionRow(c, path, index) {
    const type = fieldType(builder.state, c.field);
    const field = el(doc, 'select', { 'data-role': 'field', 'aria-label': 'Campo' },
      sourceFields(builder.state).map((f) => el(doc, 'option', { value: f.name, selected: f.name === c.field }, f.name)));
    field.addEventListener('change', () => apply(updateCondition(builder.state, path, index, { field: field.value })));

    const op = el(doc, 'select', { 'data-role': 'operator', 'aria-label': 'Operador' },
      operatorsFor(type).map((o) => el(doc, 'option', { value: o, selected: o === c.operator }, o)));
    op.addEventListener('change', () => apply(updateCondition(builder.state, path, index, { operator: op.value })));

    const value = el(doc, 'input', { 'data-role': 'value', 'aria-label': 'Valor', value: c.value ?? '', placeholder: 'valor' });
    value.addEventListener('input', () => {
      builder.state = updateCondition(builder.state, path, index, { value: value.value }); // sin re-render: conserva el foco
      builder.onChange?.(builder.state);
    });

    const del = el(doc, 'button', { class: 'btn small danger', type: 'button', title: 'Quitar condición', 'data-role': 'remove' }, '✕');
    del.addEventListener('click', () => apply(removeNode(builder.state, path, index)));
    return el(doc, 'div', { class: 'row' }, field, op, value, del);
  }

  function groupView(group, path, parentRemove) {
    const logic = el(doc, 'select', { 'data-role': 'logic', 'aria-label': 'Lógica del grupo' },
      ['AND', 'OR'].map((l) => el(doc, 'option', { value: l, selected: l === group.logic }, l)));
    logic.addEventListener('change', () => apply(setLogic(builder.state, path, logic.value)));

    const addCond = el(doc, 'button', { class: 'btn small', type: 'button', 'data-role': 'add-condition' }, '+ condición');
    addCond.addEventListener('click', () => apply(addCondition(builder.state, path)));

    const head = el(doc, 'div', { class: 'row' }, el(doc, 'strong', {}, path.length === 0 ? 'Grupo raíz' : `Subgrupo (nivel ${path.length})`), logic, addCond);
    if (path.length < MAX_DEPTH) {
      const addGrp = el(doc, 'button', { class: 'btn small', type: 'button', 'data-role': 'add-group' }, '+ subgrupo');
      addGrp.addEventListener('click', () => apply(addGroup(builder.state, path)));
      head.append(addGrp);
    }
    if (parentRemove) head.append(el(doc, 'button', { class: 'btn small danger', type: 'button', 'data-role': 'remove-group', onclick: parentRemove }, 'Quitar grupo'));

    const box = el(doc, 'div', { class: 'group', 'data-depth': String(path.length) }, head);
    group.conditions.forEach((node, i) => {
      box.append(node.conditions
        ? groupView(node, [...path, i], () => apply(removeNode(builder.state, path, i)))
        : conditionRow(node, path, i));
    });
    return box;
  }

  function renderWhere() {
    whereBox.replaceChildren(groupView(builder.state.where, [], null));
  }

  function render() {
    renderFields();
    renderWhere();
    builder.onChange?.(builder.state);
  }

  sourceSelect.addEventListener('change', () => apply(setSource(builder.state, sourceSelect.value)));

  renderSources();
  render();
  return builder;
}
