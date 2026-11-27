export class DSLError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DSLError";
    this.code = code;
  }
}

function normalizeConditionOrGroup(node) {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return node;
  }

  if ("logic" in node || "conditions" in node) {
    return {
      type: "Group",
      logic:
        typeof node.logic === "string" ? node.logic.toUpperCase() : node.logic,
      conditions: Array.isArray(node.conditions)
        ? node.conditions.map(normalizeConditionOrGroup)
        : node.conditions,
    };
  }

  return {
    type: "Condition",
    field: node.field,
    operator:
      typeof node.operator === "string"
        ? node.operator.toUpperCase()
        : node.operator,
    value: node.value,
  };
}

function normalizeProjection(item, index) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return item;
  }

  const aggregate = item.aggregate
    ? String(item.aggregate).toUpperCase()
    : null;
  const defaultAlias = aggregate
    ? `${aggregate.toLowerCase()}_${item.field}_${index}`
    : null;

  return {
    type: "Projection",
    field: item.field,
    aggregate,
    alias: item.alias !== undefined ? item.alias : defaultAlias,
  };
}

function normalizeHaving(having) {
  if (having === null || having === undefined) return null;
  if (typeof having !== "object" || Array.isArray(having)) return having;

  return {
    type: "Aggregate",
    field: having.field,
    aggregate:
      typeof having.aggregate === "string"
        ? having.aggregate.toUpperCase()
        : having.aggregate,
    operator:
      typeof having.operator === "string"
        ? having.operator.toUpperCase()
        : having.operator,
    value: having.value,
  };
}

function normalizeOrder(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return item;
  }
  return {
    type: "Order",
    field: item.field,
    direction: item.direction ? String(item.direction).toUpperCase() : "ASC",
  };
}

export function buildAST(rawQuery) {
  if (!rawQuery || typeof rawQuery !== "object" || Array.isArray(rawQuery)) {
    throw new DSLError(
      "INVALID_QUERY",
      "La consulta debe ser un objeto JSON válido.",
    );
  }

  return {
    type: "Query",
    source: rawQuery.source,
    select: Array.isArray(rawQuery.select)
      ? rawQuery.select.map((item, idx) => normalizeProjection(item, idx))
      : rawQuery.select,
    where:
      rawQuery.where === undefined || rawQuery.where === null
        ? null
        : normalizeConditionOrGroup(rawQuery.where),
    groupBy:
      rawQuery.groupBy === undefined
        ? []
        : Array.isArray(rawQuery.groupBy)
          ? [...rawQuery.groupBy]
          : rawQuery.groupBy,
    having: normalizeHaving(rawQuery.having),
    orderBy:
      rawQuery.orderBy === undefined
        ? []
        : Array.isArray(rawQuery.orderBy)
          ? rawQuery.orderBy.map(normalizeOrder)
          : rawQuery.orderBy,
    _rawKeys: Object.keys(rawQuery),
  };
}
