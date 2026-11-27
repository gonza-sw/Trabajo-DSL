// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { ADMIN_CATALOG } from '../fixtures/catalog.js';
import {
  createState, toggleField, addCondition, addGroup, setLogic, updateCondition, removeNode, setSource, getGroup, operatorsFor,
} from '../../src/public/js/builder-model.js';
import {
  addAggregate, setSelectAggregate, setAlias, outputNames, setGroupAuto, toggleGroupBy, effectiveGroupBy,
  setHaving, addOrder, updateOrder, serializeQuery, validateState, aggregatesFor, isValidAlias,
} from '../../src/public/js/builder-query.js';

const base = () => createState(ADMIN_CATALOG);
const pipe = (s, ...fns) => fns.reduce((acc, f) => f(acc), s);

describe('serialización al JSON del contrato', () => {
  it('consulta simple: select, where null, arreglos vacíos', () => {
    const s = pipe(base(), (x) => toggleField(x, 'producto'), (x) => toggleField(x, 'cantidad'));
    expect(serializeQuery(s)).toEqual({
      source: 'v_inventario',
      select: [{ field: 'producto' }, { field: 'cantidad' }],
      where: null, groupBy: [], having: null, orderBy: [],
    });
  });

  it('reproduce exactamente el ejemplo del contrato (agregación, anidación a 2 niveles, HAVING, ORDER BY)', () => {
    let s = base();
    s = toggleField(s, 'categoria');
    s = addAggregate(s, 'cantidad', 'SUM');
    s = setAlias(s, 1, 'total_stock');
    // WHERE: precio < 500 AND ( almacen = Lima OR ( almacen = Arequipa AND cantidad > 0 ) )
    s = addCondition(s, []);                        s = updateCondition(s, [], 0, { field: 'precio', operator: '<', value: '500' });
    s = addGroup(s, []);                            s = setLogic(s, [1], 'OR');
    s = addCondition(s, [1]);                       s = updateCondition(s, [1], 0, { field: 'almacen', value: 'Lima' });
    s = addGroup(s, [1]);                           s = setLogic(s, [1, 1], 'AND');
    s = addCondition(s, [1, 1]);                    s = updateCondition(s, [1, 1], 0, { field: 'almacen', value: 'Arequipa' });
    s = addCondition(s, [1, 1]);                    s = updateCondition(s, [1, 1], 1, { field: 'cantidad', operator: '>', value: '0' });
    s = setHaving(s, { aggregate: 'SUM', field: 'cantidad', operator: '>', value: '100' });
    s = addOrder(s);                                s = updateOrder(s, 0, { field: 'total_stock', direction: 'DESC' });

    expect(serializeQuery(s)).toEqual({
      source: 'v_inventario',
      select: [{ field: 'categoria' }, { field: 'cantidad', aggregate: 'SUM', alias: 'total_stock' }],
      where: { logic: 'AND', conditions: [
        { field: 'precio', operator: '<', value: 500 },
        { logic: 'OR', conditions: [
          { field: 'almacen', operator: '=', value: 'Lima' },
          { logic: 'AND', conditions: [
            { field: 'almacen', operator: '=', value: 'Arequipa' },
            { field: 'cantidad', operator: '>', value: 0 },
          ] },
        ] },
      ] },
      groupBy: ['categoria'],
      having: { field: 'cantidad', aggregate: 'SUM', operator: '>', value: 100 },
      orderBy: [{ field: 'total_stock', direction: 'DESC' }],
    });
    expect(validateState(s)).toEqual([]);
  });

  it('los valores numéricos se envían como número y los de texto como string', () => {
    let s = pipe(base(), (x) => toggleField(x, 'producto'), (x) => addCondition(x, []), (x) => addCondition(x, []));
    s = updateCondition(s, [], 0, { field: 'precio', operator: '>=', value: '99.5' });
    s = updateCondition(s, [], 1, { field: 'producto', operator: 'LIKE', value: '123' });
    const [c1, c2] = serializeQuery(s).where.conditions;
    expect(c1.value).toBe(99.5);
    expect(c2.value).toBe('123');
  });

  it('un valor con comillas o SQL se conserva tal cual (el servidor lo parametriza)', () => {
    let s = pipe(base(), (x) => toggleField(x, 'producto'), (x) => addCondition(x, []));
    s = updateCondition(s, [], 0, { field: 'producto', value: "x'; DROP TABLE usuarios; --" });
    expect(serializeQuery(s).where.conditions[0].value).toBe("x'; DROP TABLE usuarios; --");
    expect(JSON.stringify(serializeQuery(s))).not.toMatch(/SELECT|FROM/);
  });

  it('los grupos vacíos se descartan y where queda null si no hay condiciones', () => {
    let s = pipe(base(), (x) => toggleField(x, 'producto'), (x) => addGroup(x, []));
    expect(serializeQuery(s).where).toBeNull();
    s = addCondition(s, []);
    s = updateCondition(s, [], 0, { value: 'a' });
    expect(serializeQuery(s).where.conditions).toHaveLength(1); // el subgrupo vacío no se envía
  });

  it('la salida nunca contiene propiedades de UI (groupAuto, catalog...)', () => {
    const q = serializeQuery(pipe(base(), (x) => toggleField(x, 'producto')));
    expect(Object.keys(q).sort()).toEqual(['groupBy', 'having', 'orderBy', 'select', 'source', 'where']);
  });
});

describe('anidación de grupos', () => {
  it('permite grupos hasta profundidad 2 y rechaza la 3', () => {
    let s = base();
    s = addGroup(s, []);        // profundidad 1
    s = addGroup(s, [0]);       // profundidad 2
    expect(getGroup(s.where, [0, 0])).not.toBeNull();
    const before = s;
    s = addGroup(s, [0, 0]);    // profundidad 3: rechazado
    expect(s).toBe(before);
    expect(getGroup(s.where, [0, 0]).conditions).toHaveLength(0);
  });

  it('los cambios no mutan el estado anterior', () => {
    const s0 = base();
    const s1 = addCondition(s0, []);
    expect(s0.where.conditions).toHaveLength(0);
    expect(s1.where.conditions).toHaveLength(1);
  });

  it('cambiar el campo ajusta el operador al tipo y limpia el valor', () => {
    let s = addCondition(base(), []);
    s = updateCondition(s, [], 0, { field: 'producto', operator: 'LIKE', value: 'abc' });
    s = updateCondition(s, [], 0, { field: 'precio' });
    const c = s.where.conditions[0];
    expect(c.operator).toBe('='); // LIKE no es válido para numéricos
    expect(c.value).toBe('');
    expect(operatorsFor('real')).not.toContain('LIKE');
  });

  it('un operador no permitido para el tipo se ignora', () => {
    let s = addCondition(base(), []);
    s = updateCondition(s, [], 0, { field: 'precio' });
    const same = updateCondition(s, [], 0, { operator: 'LIKE' });
    expect(same.where.conditions[0].operator).toBe('=');
  });

  it('removeNode elimina una condición y un subgrupo completo', () => {
    let s = addCondition(addGroup(addCondition(base(), []), []), [1]);
    expect(s.where.conditions).toHaveLength(2);
    s = removeNode(s, [], 1);
    expect(s.where.conditions).toHaveLength(1);
  });

  it('setLogic solo acepta AND/OR', () => {
    const s = base();
    expect(setLogic(s, [], 'XOR')).toBe(s);
    expect(setLogic(s, [], 'OR').where.logic).toBe('OR');
  });
});

describe('agregaciones, GROUP BY, HAVING y ORDER BY', () => {
  it('SUM/AVG solo para campos numéricos', () => {
    expect(aggregatesFor('integer')).toContain('SUM');
    expect(aggregatesFor('text')).not.toContain('SUM');
    expect(aggregatesFor('text')).not.toContain('AVG');
    const s = base();
    expect(addAggregate(s, 'producto', 'SUM')).toBe(s);
    expect(addAggregate(s, 'producto', 'COUNT').select).toHaveLength(1);
  });

  it('GROUP BY automático toma los campos no agregados cuando hay agregaciones', () => {
    let s = pipe(base(), (x) => toggleField(x, 'categoria'), (x) => toggleField(x, 'almacen'), (x) => addAggregate(x, 'cantidad', 'SUM'));
    expect(effectiveGroupBy(s)).toEqual(['categoria', 'almacen']);
    s = pipe(base(), (x) => toggleField(x, 'categoria'));
    expect(effectiveGroupBy(s)).toEqual([]);
  });

  it('GROUP BY manual incoherente se detecta antes de enviar', () => {
    let s = pipe(base(), (x) => toggleField(x, 'categoria'), (x) => toggleField(x, 'almacen'), (x) => addAggregate(x, 'cantidad', 'SUM'), (x) => setGroupAuto(x, false));
    s = toggleGroupBy(s, 'categoria');
    expect(validateState(s).map((p) => p.code)).toContain('GROUP_MISMATCH');
    s = toggleGroupBy(s, 'almacen');
    expect(validateState(s)).toEqual([]);
    expect(serializeQuery(s).groupBy).toEqual(['categoria', 'almacen']);
  });

  it('alias: se generan nombres únicos y se rechazan alias inválidos o reservados', () => {
    let s = pipe(base(), (x) => addAggregate(x, 'cantidad', 'SUM'), (x) => addAggregate(x, 'cantidad', 'SUM'));
    expect(outputNames(s)).toEqual(['sum_cantidad', 'sum_cantidad_2']);
    expect(isValidAlias('total_stock')).toBe(true);
    for (const bad of ['1abc', 'a b', 'x;DROP', 'select', 'COUNT', '']) expect(isValidAlias(bad)).toBe(false);
    s = setAlias(s, 0, 'select');
    expect(validateState(s).map((p) => p.code)).toContain('BAD_ALIAS');
  });

  it('HAVING requiere agregaciones o GROUP BY y un valor numérico', () => {
    let s = pipe(base(), (x) => toggleField(x, 'producto'), (x) => setHaving(x, { value: '10' }));
    expect(validateState(s).map((p) => p.code)).toContain('HAVING_NO_GROUP');
    s = pipe(base(), (x) => toggleField(x, 'categoria'), (x) => addAggregate(x, 'cantidad', 'SUM'), (x) => setHaving(x, { value: 'abc' }));
    expect(validateState(s).map((p) => p.code)).toContain('HAVING_VALUE');
  });

  it('HAVING propone la agregación ya proyectada', () => {
    const s = pipe(base(), (x) => toggleField(x, 'categoria'), (x) => addAggregate(x, 'cantidad', 'AVG'), (x) => setHaving(x, {}));
    expect(s.having).toMatchObject({ aggregate: 'AVG', field: 'cantidad' });
  });

  it('HAVING sin agregaciones evita proponer un identificador', () => {
    const s = setHaving(base(), {});
    expect(s.having).toMatchObject({ aggregate: 'SUM', field: 'cantidad' }); // no almacen_id
  });

  it('HAVING con SUM sobre un campo de texto se corrige a COUNT', () => {
    const s = setHaving(base(), { field: 'producto', aggregate: 'SUM' });
    expect(s.having.aggregate).toBe('COUNT');
  });

  it('ORDER BY solo acepta campos proyectados o alias', () => {
    let s = pipe(base(), (x) => toggleField(x, 'categoria'), (x) => addAggregate(x, 'cantidad', 'SUM'), (x) => addOrder(x));
    expect(s.orderBy[0].field).toBe('categoria');
    s = updateOrder(s, 0, { field: 'sum_cantidad', direction: 'DESC' });
    expect(validateState(s)).toEqual([]);
    s = updateOrder(s, 0, { field: 'precio' }); // no proyectado
    expect(validateState(s).map((p) => p.code)).toContain('BAD_ORDER');
    expect(updateOrder(s, 0, { direction: 'SIDEWAYS' })).toBe(s);
  });

  it('sin campos seleccionados o con filtros vacíos no se puede enviar', () => {
    expect(validateState(base()).map((p) => p.code)).toContain('NO_SELECT');
    const s = pipe(base(), (x) => toggleField(x, 'producto'), (x) => addCondition(x, []));
    expect(validateState(s).map((p) => p.code)).toContain('EMPTY_VALUE');
    const num = pipe(s, (x) => updateCondition(x, [], 0, { field: 'precio', value: 'abc' }));
    expect(validateState(num).map((p) => p.code)).toContain('EMPTY_VALUE');
  });

  it('cambiar de fuente conserva el ORDER BY sobre una agregación con alias generado', () => {
    let s = pipe(base(), (x) => toggleField(x, 'categoria'), (x) => addAggregate(x, 'cantidad', 'SUM'), (x) => addOrder(x), (x) => updateOrder(x, 0, { field: 'sum_cantidad' }));
    s = setSource(s, 'v_movimientos');
    expect(s.orderBy).toEqual([{ field: 'sum_cantidad', direction: 'ASC' }]);
    expect(setSelectAggregate(s, 0, 'SUM')).toBe(s); // categoria es texto
  });
});
