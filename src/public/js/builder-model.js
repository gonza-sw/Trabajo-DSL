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
    groupAuto: true,   // GROUP BY = campos no agregados (si hay agregaciones)
    groupBy: [],       // solo se usa cuando groupAuto es false
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
  // nombre de salida: alias propio, o el generado (sum_cantidad), o el campo
  select.forEach((s) => projected.add(s.alias || (s.aggregate ? `${s.aggregate.toLowerCase()}_${s.field}` : s.field)));
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

// ───────────── condiciones WHERE (grupos AND/OR hasta profundidad 2) ─────────────
// Raíz = profundidad 0; un subgrupo dentro de la raíz = 1; dentro de ese = 2 (máximo).
export const MAX_DEPTH = 2;
const NUM_OPERATORS = ['=', '!=', '>', '>=', '<', '<='];
// En texto también se compara por orden (p. ej. rangos de fechas ISO); LIKE es exclusivo de texto.
const TEXT_OPERATORS = ['=', '!=', '>', '>=', '<', '<=', 'LIKE'];

export const operatorsFor = (type) => (isNumericType(type) ? NUM_OPERATORS : TEXT_OPERATORS);

const clone = (x) => JSON.parse(JSON.stringify(x));

// path = índices desde la raíz hasta el grupo: [] es la raíz, [1] el segundo hijo de la raíz, etc.
export function getGroup(root, path) {
  let g = root;
  for (const i of path) {
    g = g?.conditions?.[i];
    if (!g?.conditions) return null;
  }
  return g;
}

function editWhere(state, fn) {
  const where = clone(state.where);
  return fn(where) === false ? state : { ...state, where };
}

export function addCondition(state, path = []) {
  const first = sourceFields(state)[0];
  if (!first) return state;
  return editWhere(state, (root) => {
    const g = getGroup(root, path);
    if (!g) return false;
    g.conditions.push({ field: first.name, operator: operatorsFor(first.type)[0], value: '' });
    return true;
  });
}

export function addGroup(state, path = []) {
  if (path.length >= MAX_DEPTH) return state; // el nuevo grupo superaría la profundidad 2
  return editWhere(state, (root) => {
    const g = getGroup(root, path);
    if (!g) return false;
    g.conditions.push(emptyGroup(g.logic === 'AND' ? 'OR' : 'AND'));
    return true;
  });
}

export function setLogic(state, path, logic) {
  if (!['AND', 'OR'].includes(logic)) return state;
  return editWhere(state, (root) => {
    const g = getGroup(root, path);
    if (!g) return false;
    g.logic = logic;
    return true;
  });
}

// patch puede traer field, operator o value; al cambiar de campo se corrige el operador y se limpia el valor.
export function updateCondition(state, path, index, patch) {
  return editWhere(state, (root) => {
    const g = getGroup(root, path);
    const c = g?.conditions?.[index];
    if (!c || c.conditions) return false;
    if (patch.field !== undefined) {
      const type = fieldType(state, patch.field);
      if (type === null) return false;
      c.field = patch.field;
      if (!operatorsFor(type).includes(c.operator)) c.operator = operatorsFor(type)[0];
      c.value = '';
    }
    if (patch.operator !== undefined && operatorsFor(fieldType(state, c.field)).includes(patch.operator)) c.operator = patch.operator;
    if (patch.value !== undefined) c.value = patch.value;
    return true;
  });
}

export function removeNode(state, path, index) {
  return editWhere(state, (root) => {
    const g = getGroup(root, path);
    if (!g || index < 0 || index >= g.conditions.length) return false;
    g.conditions.splice(index, 1);
    return true;
  });
}
