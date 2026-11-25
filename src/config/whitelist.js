export const ALLOWED_SOURCES = Object.freeze({
  v_inventario: Object.freeze({
    producto_id: "number",
    producto: "string",
    categoria: "string",
    almacen_id: "number",
    almacen: "string",
    ciudad: "string",
    cantidad: "number",
    precio: "number",
    stock_minimo: "number",
  }),
  v_movimientos: Object.freeze({
    movimiento_id: "number",
    producto: "string",
    categoria: "string",
    almacen_id: "number",
    almacen: "string",
    tipo: "string",
    cantidad: "number",
    fecha: "string",
  }),
});

export const ALLOWED_OPERATORS = Object.freeze([
  "=",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
  "LIKE",
]);
export const ALLOWED_AGGREGATES = Object.freeze([
  "SUM",
  "COUNT",
  "AVG",
  "MIN",
  "MAX",
]);
export const NUMERIC_AGGREGATES = Object.freeze(["SUM", "AVG"]);
export const ALLOWED_LOGIC = Object.freeze(["AND", "OR"]);
export const ALLOWED_DIRECTIONS = Object.freeze(["ASC", "DESC"]);

export const SQL_RESERVED_WORDS = new Set([
  "SELECT",
  "FROM",
  "WHERE",
  "GROUP",
  "BY",
  "HAVING",
  "ORDER",
  "AND",
  "OR",
  "NOT",
  "AS",
  "IN",
  "IS",
  "NULL",
  "LIKE",
  "JOIN",
  "ON",
  "UNION",
  "ALL",
  "DISTINCT",
  "LIMIT",
  "OFFSET",
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "CREATE",
  "ALTER",
  "TABLE",
  "VIEW",
]);
