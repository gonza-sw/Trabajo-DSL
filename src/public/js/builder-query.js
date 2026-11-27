// Agregaciones, GROUP BY, HAVING, ORDER BY, validación y serialización al JSON del contrato.
// Lógica pura (sin DOM). Complementa a builder-model.js.
import { sourceFields, fieldType, isNumericType } from './builder-model.js';

export const AGGREGATES = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];
// SUM/AVG solo sobre campos numéricos.
export const aggregatesFor = (type) => (isNumericType(type) ? AGGREGATES : ['COUNT', 'MIN', 'MAX']);

const RESERVED = new Set(['select', 'from', 'where', 'group', 'order', 'by', 'having', 'and', 'or', 'not', 'null',
  'like', 'as', 'limit', 'join', 'on', 'union', 'insert', 'update', 'delete', 'drop', 'count', 'sum', 'avg', 'min', 'max']);
const ALIAS_RE = /^[A-Za-z_][A-Za-z0-9_]{0,30}$/;
export const isValidAlias = (a) => ALIAS_RE.test(a) && !RESERVED.has(a.toLowerCase());

export function addAggregate(state, field, aggregate) {
  const type = fieldType(state, field);
  if (type === null || !aggregatesFor(type).includes(aggregate)) return state;
  return { ...state, select: [...state.select, { field, aggregate, alias: '' }] };
}

export function setSelectAggregate(state, index, aggregate) {
  const item = state.select[index];
  if (!item) return state;
  if (aggregate && !aggregatesFor(fieldType(state, item.field)).includes(aggregate)) return state;
  return { ...state, select: state.select.map((s, i) => (i === index ? { ...s, aggregate: aggregate || null } : s)) };
}

export function setAlias(state, index, alias) {
  if (!state.select[index]) return state;
  return { ...state, select: state.select.map((s, i) => (i === index ? { ...s, alias: alias.trim() } : s)) };
}

export function removeSelect(state, index) {
  return { ...state, select: state.select.filter((_, i) => i !== index) };
}

// Nombre de cada columna en el resultado: alias propio válido o generado por el sistema (sum_cantidad).
export function outputNames(state) {
  const used = new Set();
  return state.select.map((s) => {
    let name = s.alias && isValidAlias(s.alias) ? s.alias : (s.aggregate ? `${s.aggregate.toLowerCase()}_${s.field}` : s.field);
    const base = name;
    let n = 2;
    while (used.has(name)) name = `${base}_${n++}`;
    used.add(name);
    return name;
  });
}

export const hasAggregate = (state) => state.select.some((s) => s.aggregate);

export const setGroupAuto = (state, on) => ({ ...state, groupAuto: Boolean(on) });

export function toggleGroupBy(state, field) {
  if (fieldType(state, field) === null) return state;
  const groupBy = state.groupBy.includes(field) ? state.groupBy.filter((f) => f !== field) : [...state.groupBy, field];
  return { ...state, groupBy };
}

export function effectiveGroupBy(state) {
  if (!state.groupAuto) return state.groupBy;
  if (!hasAggregate(state) && !state.having) return []; // HAVING también vuelve agrupada la consulta
  return [...new Set(state.select.filter((s) => !s.aggregate).map((s) => s.field))];
}

// HAVING compara contra un número: sobre texto solo tiene sentido COUNT.
export const havingAggregatesFor = (type) => (isNumericType(type) ? AGGREGATES : ['COUNT']);

// Propuesta inicial de HAVING: la agregación que ya está en el SELECT; si no hay,
// SUM del primer campo numérico que no sea un identificador.
function defaultHaving(state) {
  const projected = state.select.find((s) => s.aggregate);
  if (projected && havingAggregatesFor(fieldType(state, projected.field)).includes(projected.aggregate)) {
    return { aggregate: projected.aggregate, field: projected.field, operator: '>', value: '' };
  }
  const fields = sourceFields(state);
  const numeric = fields.filter((f) => isNumericType(f.type));
  const measure = numeric.find((f) => !/(^|_)id$/.test(f.name)) ?? numeric[0] ?? fields[0];
  return { aggregate: 'SUM', field: measure?.name, operator: '>', value: '' };
}

// HAVING admite una sola condición agregada.
export function setHaving(state, patch) {
  if (patch === null) return { ...state, having: null };
  const base = state.having ?? defaultHaving(state);
  const next = { ...base, ...patch };
  const type = fieldType(state, next.field);
  if (type === null) return state;
  if (!havingAggregatesFor(type).includes(next.aggregate)) next.aggregate = 'COUNT'; // p. ej. SUM o MIN sobre texto
  return { ...state, having: next };
}

// Mantiene el ORDER BY coherente cuando cambian las columnas: sigue el nuevo nombre si se
// renombra una columna y descarta el orden si la columna deja de estar proyectada.
export function reconcileOrder(prev, next) {
  if (prev.select === next.select || !next.orderBy.length) return next;
  const before = outputNames(prev);
  const after = outputNames(next);
  const sameColumns = before.length === after.length; // renombrado o cambio de agregación
  const orderBy = [];
  for (const o of next.orderBy) {
    const i = before.indexOf(o.field);
    if (sameColumns && i >= 0) orderBy.push({ ...o, field: after[i] });
    else if (after.includes(o.field)) orderBy.push(o);
  }
  return { ...next, orderBy };
}

export function addOrder(state) {
  const first = outputNames(state)[0];
  if (!first) return state;
  return { ...state, orderBy: [...state.orderBy, { field: first, direction: 'ASC' }] };
}

export function updateOrder(state, index, patch) {
  const o = state.orderBy[index];
  if (!o) return state;
  const next = { ...o, ...patch };
  if (!['ASC', 'DESC'].includes(next.direction)) return state;
  return { ...state, orderBy: state.orderBy.map((x, i) => (i === index ? next : x)) };
}

export function removeOrder(state, index) {
  return { ...state, orderBy: state.orderBy.filter((_, i) => i !== index) };
}

// ───────────── validación en cliente (el servidor valida igualmente) ─────────────
const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';
const coerce = (type, raw) => (isNumericType(type) ? (isBlank(raw) ? NaN : Number(raw)) : String(raw));
const badValue = (type, raw) => isBlank(raw) || (isNumericType(type) && Number.isNaN(coerce(type, raw)));

export function validateState(state) {
  const problems = [];
  const add = (code, message) => problems.push({ code, message });

  if (!state.select.length) add('NO_SELECT', 'Seleccione al menos un campo');
  state.select.forEach((s) => { if (s.alias && !isValidAlias(s.alias)) add('BAD_ALIAS', `Alias no válido: ${s.alias}`); });

  const visit = (group) => group.conditions.forEach((c) => {
    if (c.conditions) { visit(c); return; }
    if (badValue(fieldType(state, c.field), c.value)) add('EMPTY_VALUE', `Falta un valor válido para el filtro de ${c.field}`);
  });
  visit(state.where);

  if (!state.groupAuto && (hasAggregate(state) || state.having || state.groupBy.length)) {
    for (const s of state.select) {
      if (!s.aggregate && !state.groupBy.includes(s.field)) add('GROUP_MISMATCH', `${s.field} debe estar en GROUP BY`);
    }
  }
  if (state.having) {
    if (!hasAggregate(state) && !effectiveGroupBy(state).length) add('HAVING_NO_GROUP', 'HAVING requiere agregaciones o GROUP BY');
    if (badValue('number', state.having.value)) add('HAVING_VALUE', 'Falta un valor numérico para HAVING');
  }
  const names = outputNames(state);
  state.orderBy.forEach((o) => { if (!names.includes(o.field)) add('BAD_ORDER', `ORDER BY usa un campo no proyectado: ${o.field}`); });
  return problems;
}

// ───────────── serialización: JSON exacto del contrato (docs/00-contratos-tecnicos.md §4) ─────────────
function serializeGroup(state, group) {
  const conditions = [];
  for (const c of group.conditions) {
    if (c.conditions) {
      const sub = serializeGroup(state, c);
      if (sub) conditions.push(sub); // los grupos vacíos se descartan
    } else {
      conditions.push({ field: c.field, operator: c.operator, value: coerce(fieldType(state, c.field), c.value) });
    }
  }
  return conditions.length ? { logic: group.logic, conditions } : null;
}

export function serializeQuery(state) {
  const names = outputNames(state);
  const select = state.select.map((s, i) => {
    if (s.aggregate) return { field: s.field, aggregate: s.aggregate, alias: names[i] };
    // sin agregación, el alias se envía solo si renombra la columna (ORDER BY puede usarlo)
    return names[i] === s.field ? { field: s.field } : { field: s.field, alias: names[i] };
  });
  const having = state.having
    ? { field: state.having.field, aggregate: state.having.aggregate, operator: state.having.operator, value: coerce('number', state.having.value) }
    : null;
  return {
    source: state.source,
    select,
    where: serializeGroup(state, state.where),
    groupBy: effectiveGroupBy(state),
    having,
    orderBy: state.orderBy.map((o) => ({ field: o.field, direction: o.direction })),
  };
}
