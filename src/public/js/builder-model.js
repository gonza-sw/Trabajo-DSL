// Modelo del constructor: lógica pura, sin DOM (se prueba sin navegador).
// El estado se transforma después en el JSON del contrato (ver serializeQuery).

const NUMERIC_TYPES = ['integer', 'int', 'real', 'number', 'numeric', 'float'];

export const isNumericType = (type) => NUMERIC_TYPES.includes(String(type).toLowerCase());

export function emptyGroup(logic = 'AND') {
  return { logic, conditions: [] };
}

export function createState(catalog) {
  const first = catalog?.sources?.[0]?.name ?? '';
  return {
    catalog,
    source: first,
    select: [],        // [{ field, aggregate: null|'SUM'|..., alias: '' }]
    where: emptyGroup(),
    groupBy: [],
    having: null,
    orderBy: [],
  };
}

export function sourceFields(state, source = state.source) {
  return state.catalog?.sources?.find((s) => s.name === source)?.fields ?? [];
}

export function fieldType(state, field, source = state.source) {
  return sourceFields(state, source).find((f) => f.name === field)?.type ?? null;
}

// Quita de una condición/grupo todo campo que no exista (o cambie de tipo) en la nueva fuente.
function pruneGroup(group, keep) {
  const conditions = [];
  for (const c of group.conditions) {
    if (c.conditions) {
      const sub = pruneGroup(c, keep);
      if (sub.conditions.length) conditions.push(sub);
    } else if (keep(c.field)) {
      conditions.push(c);
    }
  }
  return { ...group, conditions };
}

// Cambia la fuente y conserva solo lo que sigue siendo válido (mismo nombre y tipo).
export function setSource(state, name) {
  if (!state.catalog?.sources?.some((s) => s.name === name)) return state;
  const old = state.source;
  const keep = (field) => {
    const before = fieldType(state, field, old);
    const after = fieldType(state, field, name);
    return after !== null && before === after;
  };
  const projected = new Set();
  const select = state.select.filter((s) => keep(s.field));
  select.forEach((s) => projected.add(s.aggregate ? (s.alias || s.field) : s.field));
  return {
    ...state,
    source: name,
    select,
    where: pruneGroup(state.where, keep),
    groupBy: state.groupBy.filter(keep),
    having: state.having && keep(state.having.field) ? state.having : null,
    orderBy: state.orderBy.filter((o) => projected.has(o.field)),
  };
}

export function toggleField(state, field) {
  if (!sourceFields(state).some((f) => f.name === field)) return state;
  const exists = state.select.some((s) => s.field === field && !s.aggregate);
  const select = exists
    ? state.select.filter((s) => !(s.field === field && !s.aggregate))
    : [...state.select, { field, aggregate: null, alias: '' }];
  return { ...state, select };
}

export const isSelected = (state, field) => state.select.some((s) => s.field === field && !s.aggregate);
