import { describe, it, expect } from "vitest";
import { buildAST } from "../../src/dsl/ast.js";
import { validateQuery } from "../../src/dsl/validator.js";

describe("DSL AST y Validación (PR 1)", () => {
  const validContractQuery = {
    source: "v_inventario",
    select: [
      { field: "categoria" },
      { field: "cantidad", aggregate: "SUM", alias: "total_stock" },
    ],
    where: {
      logic: "AND",
      conditions: [
        { field: "precio", operator: "<", value: 500 },
        {
          logic: "OR",
          conditions: [
            { field: "almacen", operator: "=", value: "Lima" },
            {
              logic: "AND",
              conditions: [
                { field: "almacen", operator: "=", value: "Arequipa" },
                { field: "cantidad", operator: ">", value: 0 },
              ],
            },
          ],
        },
      ],
    },
    groupBy: ["categoria"],
    having: { field: "cantidad", aggregate: "SUM", operator: ">", value: 100 },
    orderBy: [{ field: "total_stock", direction: "DESC" }],
  };

  it("valida correctamente la consulta completa del contrato sin mutar el JSON original", () => {
    const snapshot = structuredClone(validContractQuery);
    const ast = buildAST(validContractQuery);
    expect(validateQuery(ast)).toBe(true);
    expect(validContractQuery).toEqual(snapshot);
  });

  it('rechaza fuente no autorizada como "usuarios"', () => {
    const ast = buildAST({
      source: "usuarios",
      select: [{ field: "username" }],
    });
    expect(() => validateQuery(ast)).toThrowError(/Fuente no autorizada/);
  });

  it("rechaza columna inexistente en la vista", () => {
    const ast = buildAST({
      source: "v_inventario",
      select: [{ field: "password_hash" }],
    });
    expect(() => validateQuery(ast)).toThrowError(/Columna no permitida/);
  });

  it("rechaza operador desconocido o inyección SQL", () => {
    const ast = buildAST({
      source: "v_inventario",
      select: [{ field: "producto" }],
      where: {
        logic: "AND",
        conditions: [{ field: "precio", operator: "DROP TABLE", value: 10 }],
      },
    });
    expect(() => validateQuery(ast)).toThrowError(/Operador no permitido/);
  });

  it("rechaza tipos incompatibles (número en campo de texto y SUM en texto)", () => {
    const astType = buildAST({
      source: "v_inventario",
      select: [{ field: "producto" }],
      where: {
        logic: "AND",
        conditions: [{ field: "almacen", operator: "=", value: 123 }],
      },
    });
    expect(() => validateQuery(astType)).toThrowError(/Tipo incompatible/);

    const astAgg = buildAST({
      source: "v_inventario",
      select: [{ field: "producto", aggregate: "SUM" }],
    });
    expect(() => validateQuery(astAgg)).toThrowError(
      /solo aplica a campos numéricos/,
    );
  });

  it("rechaza anidación mayor a profundidad 2 y grupos vacíos", () => {
    const depth3Query = {
      source: "v_inventario",
      select: [{ field: "producto" }],
      where: {
        logic: "AND", // profundidad 0
        conditions: [
          {
            logic: "OR", // profundidad 1
            conditions: [
              {
                logic: "AND", // profundidad 2
                conditions: [
                  {
                    logic: "OR", // profundidad 3 -> debe fallar
                    conditions: [
                      { field: "cantidad", operator: ">", value: 1 },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    expect(() => validateQuery(buildAST(depth3Query))).toThrowError(
      /Profundidad máxima/,
    );

    const emptyGroupQuery = {
      source: "v_inventario",
      select: [{ field: "producto" }],
      where: { logic: "AND", conditions: [] },
    };
    expect(() => validateQuery(buildAST(emptyGroupQuery))).toThrowError(
      /no pueden estar vacíos/,
    );
  });

  it("rechaza agrupación incoherente y ORDER BY sobre campos no proyectados", () => {
    const badGroup = buildAST({
      source: "v_inventario",
      select: [{ field: "categoria" }, { field: "cantidad", aggregate: "SUM" }],
      groupBy: [],
    });
    expect(() => validateQuery(badGroup)).toThrowError(
      /debe incluirse en groupBy/,
    );

    const badOrder = buildAST({
      source: "v_inventario",
      select: [{ field: "categoria" }],
      orderBy: [{ field: "precio", direction: "ASC" }],
    });
    expect(() => validateQuery(badOrder)).toThrowError(
      /campos proyectados o alias/,
    );
  });
});
