import { describe, it, expect } from "vitest";
import { buildAST, DSLError } from "../../src/dsl/ast.js";
import { validateQuery } from "../../src/dsl/validator.js";

function expectDslError(query, code) {
  let thrownError;
  try {
    validateQuery(buildAST(query));
  } catch (error) {
    thrownError = error;
  }
  expect(thrownError).toBeInstanceOf(DSLError);
  expect(thrownError.code).toBe(code);
}

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

  it("rechaza fuentes heredadas y fuentes que no son cadenas", () => {
    for (const source of ["__proto__", "toString", 42]) {
      expectDslError(
        { source, select: [{ field: "producto" }] },
        "INVALID_SOURCE",
      );
    }
  });

  it.each([
    [
      "SELECT heredado",
      { source: "v_inventario", select: [{ field: "constructor" }] },
    ],
    [
      "WHERE heredado",
      {
        source: "v_inventario",
        select: [{ field: "producto" }],
        where: { field: "toString", operator: "=", value: "x" },
      },
    ],
    [
      "GROUP BY heredado",
      {
        source: "v_inventario",
        select: [{ field: "producto" }],
        groupBy: ["constructor"],
      },
    ],
    [
      "HAVING heredado",
      {
        source: "v_inventario",
        select: [{ field: "cantidad", aggregate: "SUM" }],
        having: {
          field: "constructor",
          aggregate: "SUM",
          operator: ">",
          value: 1,
        },
      },
    ],
    ["SELECT no textual", { source: "v_inventario", select: [{ field: 12 }] }],
    [
      "WHERE no textual",
      {
        source: "v_inventario",
        select: [{ field: "producto" }],
        where: { field: 12, operator: "=", value: "x" },
      },
    ],
    [
      "GROUP BY no textual",
      {
        source: "v_inventario",
        select: [{ field: "producto" }],
        groupBy: [12],
      },
    ],
    [
      "HAVING no textual",
      {
        source: "v_inventario",
        select: [{ field: "cantidad", aggregate: "SUM" }],
        having: {
          field: 12,
          aggregate: "SUM",
          operator: ">",
          value: 1,
        },
      },
    ],
  ])("rechaza campos heredados o no textuales en %s", (_clause, query) => {
    expectDslError(query, "INVALID_FIELD");
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

  it("devuelve INVALID_GROUP_BY para groupBy nulo o de tipo incorrecto", () => {
    for (const groupBy of [null, "categoria"]) {
      expectDslError(
        {
          source: "v_inventario",
          select: [{ field: "categoria" }],
          groupBy,
        },
        "INVALID_GROUP_BY",
      );
    }
  });

  it("exige agrupar las proyecciones simples si hay GROUP BY o agregación", () => {
    expectDslError(
      {
        source: "v_inventario",
        select: [{ field: "categoria" }, { field: "producto" }],
        groupBy: ["categoria"],
      },
      "INCOHERENT_GROUP_BY",
    );
  });

  it("exige que HAVING tenga GROUP BY o una agregación seleccionada", () => {
    expectDslError(
      {
        source: "v_inventario",
        select: [{ field: "producto" }],
        having: {
          field: "cantidad",
          aggregate: "SUM",
          operator: ">",
          value: 1,
        },
      },
      "INVALID_HAVING",
    );
  });

  it("rechaza ORDER BY por la columna base de una proyección agregada", () => {
    expectDslError(
      {
        source: "v_inventario",
        select: [{ field: "cantidad", aggregate: "SUM", alias: "total" }],
        orderBy: [{ field: "cantidad", direction: "ASC" }],
      },
      "INVALID_ORDER_FIELD",
    );
  });
});
