import { describe, expect, it } from 'vitest';
import { applyRolePolicy, canAccessSource, filterSchemaForRole } from '../../src/security/role-policy.js';

const query = { source: 'v_inventario', select: [{ field: 'cantidad' }], where: { logic: 'OR', conditions: [{ field: 'almacen', operator: '=', value: 'Lima' }, { field: 'almacen', operator: '=', value: 'Trujillo' }] }, groupBy: [], orderBy: [] };

describe('políticas por rol', () => {
  it('mantiene la consulta original y agrega el límite de almacén con AND externo', () => {
    const before = structuredClone(query);
    const scoped = applyRolePolicy(query, { rol: 'operario' });
    expect(query).toEqual(before);
    expect(scoped.where.logic).toBe('AND');
    expect(scoped.where.conditions[0]).toEqual(query.where);
    expect(scoped.where.conditions[1]).toMatchObject({ field: 'almacen_id', value: 1, internal: true });
  });

  it('limita consulta a inventario y almacén Arequipa', () => {
    const scoped = applyRolePolicy(query, { rol: 'consulta' });
    expect(scoped.where.conditions[0].value).toBe(2);
    expect(canAccessSource({ rol: 'consulta' }, 'v_inventario')).toBe(true);
    expect(canAccessSource({ rol: 'consulta' }, 'v_movimientos')).toBe(false);
  });

  it('deja al admin sin filtro y restringe el schema según el rol', () => {
    expect(applyRolePolicy(query, { rol: 'admin' })).toEqual(query);
    const schema = { sources: [{ name: 'v_inventario' }, { name: 'v_movimientos' }] };
    expect(filterSchemaForRole(schema, { rol: 'consulta' })).toEqual({ sources: [{ name: 'v_inventario' }] });
  });
});
