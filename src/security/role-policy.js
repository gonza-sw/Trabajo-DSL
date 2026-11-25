import { cloneQuery } from '../dsl/ast.js';

const ROLE_ACCESS = Object.freeze({
  admin: Object.freeze({ sources: ['v_inventario', 'v_movimientos'], warehouseId: null }),
  operario: Object.freeze({ sources: ['v_inventario', 'v_movimientos'], warehouseId: 1 }),
  consulta: Object.freeze({ sources: ['v_inventario'], warehouseId: 2 }),
});

export class AuthorizationError extends Error {
  constructor(code, message) { super(message); this.name = 'AuthorizationError'; this.code = code; }
}

export function getRoleAccess(user) {
  const policy = ROLE_ACCESS[user?.rol];
  if (!policy) throw new AuthorizationError('FORBIDDEN', 'Rol sin permisos');
  return policy;
}

export function canAccessSource(user, source) {
  return getRoleAccess(user).sources.includes(source);
}

export function applyRolePolicy(query, user) {
  const access = getRoleAccess(user);
  if (!access.sources.includes(query.source)) throw new AuthorizationError('FORBIDDEN', 'No tienes permiso para consultar esta fuente');
  const result = cloneQuery(query);
  if (access.warehouseId === null) return result;

  const policy = {
    field: 'almacen_id', operator: '=', value: access.warehouseId,
    internal: true,
  };
  result.where = result.where
    ? { logic: 'AND', conditions: [result.where, policy], internal: true }
    : { logic: 'AND', conditions: [policy], internal: true };
  return result;
}

export function filterSchemaForRole(schema, user) {
  const access = getRoleAccess(user);
  const sources = Array.isArray(schema?.sources) ? schema.sources : [];
  return { sources: sources.filter((source) => access.sources.includes(source.name)) };
}
