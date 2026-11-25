// Constructor visual (capa DOM). Todo texto proveniente del servidor se inserta con
// textContent: nunca innerHTML.
import { createState, setSource, toggleField, sourceFields, isSelected } from './builder-model.js';

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

  function renderSources() {
    sourceSelect.replaceChildren(...catalog.sources.map((s) =>
      el(doc, 'option', { value: s.name, selected: s.name === builder.state.source }, s.name)));
  }

  function renderFields() {
    fieldList.replaceChildren(...sourceFields(builder.state).map((f) => {
      const box = el(doc, 'input', { type: 'checkbox', checked: isSelected(builder.state, f.name), 'data-field': f.name });
      box.addEventListener('change', () => {
        builder.state = toggleField(builder.state, f.name);
        render();
      });
      return el(doc, 'label', { class: 'field-item' }, box, f.name, el(doc, 'span', { class: 'field-type' }, f.type));
    }));
  }

  function render() {
    renderFields();
    builder.onChange?.(builder.state);
  }

  sourceSelect.addEventListener('change', () => {
    builder.state = setSource(builder.state, sourceSelect.value);
    render();
  });

  renderSources();
  render();
  return builder;
}
