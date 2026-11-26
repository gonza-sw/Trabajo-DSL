import { DSLError } from './ast.js';

function compileProjection(proj) {
  const expr = proj.aggregate
    ? `${proj.aggregate}(${proj.field})`
    : proj.field;

  return proj.alias ? `${expr} AS ${proj.alias}` : expr;
}

function compileWhereNode(node, params) {
  if (!node) return '';

  if (node.type === 'Condition') {
    params.push(node.value);
    return `${node.field} ${node.operator} ?`;
  }

  if (node.type === 'Group') {
    const compiledChildren = node.conditions.map((child) =>
      compileWhereNode(child, params)
    );
    return `(${compiledChildren.join(` ${node.logic} `)})`;
  }

  throw new DSLError('INVALID_WHERE_NODE', 'Nodo WHERE no soportado en compilación.');
}

function compileHaving(having, params) {
  if (!having) return '';
  params.push(having.value);
  return `HAVING ${having.aggregate}(${having.field}) ${having.operator} ?`;
}

function compileOrderBy(orderBy) {
  if (!Array.isArray(orderBy) || orderBy.length === 0) return '';
  const clauses = orderBy.map((item) => `${item.field} ${item.direction}`);
  return `ORDER BY ${clauses.join(', ')}`;
}

export function compileQuery(ast) {
  if (!ast || ast.type !== 'Query') {
    throw new DSLError('INVALID_AST', 'Se requiere un nodo Query válido para compilar.');
  }

  const params = [];
  const parts = [];

  // 1. SELECT y FROM
  const selectClause = ast.select.map(compileProjection).join(', ');
  parts.push(`SELECT ${selectClause}`);
  parts.push(`FROM ${ast.source}`);

  // 2. WHERE recursivo (soporta grupos anidados + filtro interno confiable)
  if (ast.where !== null) {
    const whereClause = compileWhereNode(ast.where, params);
    parts.push(`WHERE ${whereClause}`);
  }

  // 3. GROUP BY
  if (Array.isArray(ast.groupBy) && ast.groupBy.length > 0) {
    parts.push(`GROUP BY ${ast.groupBy.join(', ')}`);
  }

  // 4. HAVING (agregación parametrizada)
  if (ast.having !== null) {
    parts.push(compileHaving(ast.having, params));
  }

  // 5. ORDER BY
  if (Array.isArray(ast.orderBy) && ast.orderBy.length > 0) {
    parts.push(compileOrderBy(ast.orderBy));
  }

  return {
    sql: parts.join(' '),
    params
  };
}