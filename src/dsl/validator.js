import {
  ALLOWED_SOURCES,
  ALLOWED_OPERATORS,
  ALLOWED_AGGREGATES,
  NUMERIC_AGGREGATES,
  ALLOWED_LOGIC,
  ALLOWED_DIRECTIONS,
  SQL_RESERVED_WORDS,
} from "../config/whitelist.js";
import { DSLError } from "./ast.js";

const ROOT_ALLOWED_KEYS = new Set([
  "source",
  "select",
  "where",
  "groupBy",
  "having",
  "orderBy",
]);
const IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const MAX_NESTING_DEPTH = 2;

function validateAlias(alias, seenAliases) {
  if (typeof alias !== "string" || !IDENTIFIER_REGEX.test(alias)) {
    throw new DSLError("INVALID_ALIAS", `Alias inválido: "${alias}".`);
  }
  if (SQL_RESERVED_WORDS.has(alias.toUpperCase())) {
    throw new DSLError(
      "RESERVED_ALIAS",
      `El alias "${alias}" es una palabra reservada de SQL.`,
    );
  }
  if (seenAliases.has(alias)) {
    throw new DSLError("DUPLICATE_ALIAS", `Alias duplicado: "${alias}".`);
  }
  seenAliases.add(alias);
}

function validateCondition(cond, fieldsMap) {
  const allowedKeys = new Set(["type", "field", "operator", "value"]);
  for (const key of Object.keys(cond)) {
    if (!allowedKeys.has(key)) {
      throw new DSLError(
        "UNKNOWN_PROPERTY",
        `Propiedad desconocida en condición: "${key}".`,
      );
    }
  }

  if (!cond.field || !(cond.field in fieldsMap)) {
    throw new DSLError(
      "INVALID_FIELD",
      `Columna no permitida: "${cond.field}".`,
    );
  }

  if (!ALLOWED_OPERATORS.includes(cond.operator)) {
    throw new DSLError(
      "INVALID_OPERATOR",
      `Operador no permitido: "${cond.operator}".`,
    );
  }

  const expectedType = fieldsMap[cond.field];
  if (cond.operator === "LIKE" && expectedType !== "string") {
    throw new DSLError(
      "INVALID_OPERATOR_TYPE",
      `El operador LIKE solo aplica a campos de texto ("${cond.field}").`,
    );
  }

  if (
    cond.value === null ||
    cond.value === undefined ||
    typeof cond.value !== expectedType
  ) {
    throw new DSLError(
      "TYPE_MISMATCH",
      `Tipo incompatible para "${cond.field}": se esperaba ${expectedType}, se recibió ${typeof cond.value}.`,
    );
  }
}

function validateWhereNode(node, fieldsMap, depth) {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    throw new DSLError("INVALID_WHERE", "Nodo WHERE inválido.");
  }

  if (node.type === "Group") {
    if (depth > MAX_NESTING_DEPTH) {
      throw new DSLError(
        "MAX_DEPTH_EXCEEDED",
        `Profundidad máxima de anidación excedida (máximo ${MAX_NESTING_DEPTH}).`,
      );
    }
    if (!ALLOWED_LOGIC.includes(node.logic)) {
      throw new DSLError(
        "INVALID_LOGIC",
        `Operador lógico inválido: "${node.logic}".`,
      );
    }
    if (!Array.isArray(node.conditions) || node.conditions.length === 0) {
      throw new DSLError(
        "EMPTY_GROUP",
        "Los grupos lógicos AND/OR no pueden estar vacíos.",
      );
    }
    for (const child of node.conditions) {
      validateWhereNode(child, fieldsMap, depth + 1);
    }
    return;
  }

  if (node.type === "Condition") {
    validateCondition(node, fieldsMap);
    return;
  }

  throw new DSLError(
    "INVALID_WHERE_NODE",
    "Estructura de condición desconocida.",
  );
}

export function validateQuery(ast) {
  if (!ast || ast.type !== "Query") {
    throw new DSLError("INVALID_AST", "Se requiere un nodo Query válido.");
  }

  if (Array.isArray(ast._rawKeys)) {
    for (const key of ast._rawKeys) {
      if (!ROOT_ALLOWED_KEYS.has(key)) {
        throw new DSLError(
          "UNKNOWN_PROPERTY",
          `Propiedad desconocida en consulta: "${key}".`,
        );
      }
    }
  }

  // 1. Validar fuente
  if (!ast.source || !(ast.source in ALLOWED_SOURCES)) {
    throw new DSLError(
      "INVALID_SOURCE",
      `Fuente no autorizada: "${ast.source}".`,
    );
  }
  const fieldsMap = ALLOWED_SOURCES[ast.source];

  // 2. Validar SELECT
  if (!Array.isArray(ast.select) || ast.select.length === 0) {
    throw new DSLError(
      "EMPTY_SELECT",
      "Debe seleccionar al menos un campo en select.",
    );
  }

  const seenAliases = new Set();
  const projectedNames = new Set();
  const nonAggregatedFields = [];
  let hasAggregations = false;

  for (const item of ast.select) {
    if (!item || item.type !== "Projection") {
      throw new DSLError(
        "INVALID_PROJECTION",
        "Elemento de proyección inválido.",
      );
    }
    if (!item.field || !(item.field in fieldsMap)) {
      throw new DSLError(
        "INVALID_FIELD",
        `Columna no permitida en select: "${item.field}".`,
      );
    }

    if (item.aggregate !== null) {
      hasAggregations = true;
      if (!ALLOWED_AGGREGATES.includes(item.aggregate)) {
        throw new DSLError(
          "INVALID_AGGREGATE",
          `Función de agregación no permitida: "${item.aggregate}".`,
        );
      }
      if (
        NUMERIC_AGGREGATES.includes(item.aggregate) &&
        fieldsMap[item.field] !== "number"
      ) {
        throw new DSLError(
          "INVALID_AGGREGATE_TYPE",
          `La agregación ${item.aggregate} solo aplica a campos numéricos ("${item.field}").`,
        );
      }
    } else {
      nonAggregatedFields.push(item.field);
    }

    if (item.alias !== null) {
      validateAlias(item.alias, seenAliases);
      projectedNames.add(item.alias);
    }
    projectedNames.add(item.field);
  }

  // 3. Validar WHERE
  if (ast.where !== null) {
    validateWhereNode(ast.where, fieldsMap, 0);
  }

  // 4. Validar GROUP BY
  if (!Array.isArray(ast.groupBy)) {
    throw new DSLError("INVALID_GROUP_BY", "groupBy debe ser un arreglo.");
  }
  for (const field of ast.groupBy) {
    if (!(field in fieldsMap)) {
      throw new DSLError(
        "INVALID_FIELD",
        `Columna no permitida en groupBy: "${field}".`,
      );
    }
  }

  if (hasAggregations && nonAggregatedFields.length > 0) {
    const groupSet = new Set(ast.groupBy);
    for (const field of nonAggregatedFields) {
      if (!groupSet.has(field)) {
        throw new DSLError(
          "INCOHERENT_GROUP_BY",
          `El campo no agregado "${field}" debe incluirse en groupBy.`,
        );
      }
    }
  }

  // 5. Validar HAVING
  if (ast.having !== null) {
    if (ast.having.type !== "Aggregate") {
      throw new DSLError(
        "INVALID_HAVING",
        "having debe ser una condición agregada válida.",
      );
    }
    const { field, aggregate, operator, value } = ast.having;
    if (!field || !(field in fieldsMap)) {
      throw new DSLError(
        "INVALID_FIELD",
        `Columna no permitida en having: "${field}".`,
      );
    }
    if (!ALLOWED_AGGREGATES.includes(aggregate)) {
      throw new DSLError(
        "INVALID_AGGREGATE",
        `Agregación no permitida en having: "${aggregate}".`,
      );
    }
    if (
      NUMERIC_AGGREGATES.includes(aggregate) &&
      fieldsMap[field] !== "number"
    ) {
      throw new DSLError(
        "INVALID_AGGREGATE_TYPE",
        `${aggregate} solo aplica a campos numéricos.`,
      );
    }
    if (!ALLOWED_OPERATORS.includes(operator) || operator === "LIKE") {
      throw new DSLError(
        "INVALID_OPERATOR",
        `Operador no permitido en having: "${operator}".`,
      );
    }
    if (typeof value !== "number") {
      throw new DSLError(
        "TYPE_MISMATCH",
        "El valor de comparación en having debe ser numérico.",
      );
    }
  }

  // 6. Validar ORDER BY
  if (!Array.isArray(ast.orderBy)) {
    throw new DSLError("INVALID_ORDER_BY", "orderBy debe ser un arreglo.");
  }
  for (const order of ast.orderBy) {
    if (!order || order.type !== "Order") {
      throw new DSLError("INVALID_ORDER_ITEM", "Elemento de orderBy inválido.");
    }
    if (!projectedNames.has(order.field)) {
      throw new DSLError(
        "INVALID_ORDER_FIELD",
        `Solo se puede ordenar por campos proyectados o alias definidos ("${order.field}").`,
      );
    }
    if (!ALLOWED_DIRECTIONS.includes(order.direction)) {
      throw new DSLError(
        "INVALID_ORDER_DIRECTION",
        `Dirección de orden inválida: "${order.direction}".`,
      );
    }
  }

  return true;
}
