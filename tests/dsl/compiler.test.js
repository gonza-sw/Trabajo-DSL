import { describe, it, expect } from "vitest";
import { buildAST } from "../../src/dsl/ast.js";
import { validateQuery } from "../../src/dsl/validator.js";
import { compileQuery } from "../../src/dsl/compiler.js";

describe("DSL Compilación SQL (PR 2)", () => {
  it("compila una consulta SELECT simple sin filtros", () => {
    const ast = buildAST({
      source: "v_inventario",
      select: [{ field: "cantidad" }],
    });
    validateQuery(ast);

    const result = compileQuery(ast);
    expect(result).toEqual({
      sql: "SELECT cantidad FROM v_inventario",
      params: [],
    });
  });

  it("compila la consulta avanzada del contrato con parámetros en orden exacto", () => {
    const contractQuery = {
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
      having: {
        field: "cantidad",
        aggregate: "SUM",
        operator: ">",
        value: 100,
      },
      orderBy: [{ field: "total_stock", direction: "DESC" }],
    };

    const ast = buildAST(contractQuery);
    validateQuery(ast);
    const result = compileQuery(ast);

    expect(result.sql).toBe(
      "SELECT categoria, SUM(cantidad) AS total_stock " +
        "FROM v_inventario " +
        "WHERE (precio < ? AND (almacen = ? OR (almacen = ? AND cantidad > ?))) " +
        "GROUP BY categoria " +
        "HAVING SUM(cantidad) > ? " +
        "ORDER BY total_stock DESC",
    );
    expect(result.params).toEqual([500, "Lima", "Arequipa", 0, 100]);
  });

  it("conserva valores con comillas y caracteres especiales como parámetros sin concatenar", () => {
    const ast = buildAST({
      source: "v_inventario",
      select: [{ field: "producto" }],
      where: {
        logic: "AND",
        conditions: [
          { field: "producto", operator: "LIKE", value: '%Laptop\'s "Pro"%' },
        ],
      },
    });
    validateQuery(ast);

    const result = compileQuery(ast);
    expect(result.sql).toBe(
      "SELECT producto FROM v_inventario WHERE (producto LIKE ?)",
    );
    expect(result.params).toEqual(['%Laptop\'s "Pro"%']);
  });

  it("compila restricción interna de acceso (rol) envolviendo el OR del usuario sin romper seguridad", () => {
    const userAst = buildAST({
      source: "v_inventario",
      select: [{ field: "producto" }],
      where: {
        logic: "OR",
        conditions: [
          { field: "categoria", operator: "=", value: "Computadoras" },
          { field: "categoria", operator: "=", value: "Perifericos" },
        ],
      },
    });
    validateQuery(userAst);

    // Simula el nodo que inyecta applyRolePolicy (Integrante 4) después de validar profundidad
    const authorizedAst = {
      ...userAst,
      where: {
        type: "Group",
        logic: "AND",
        conditions: [
          { type: "Condition", field: "almacen_id", operator: "=", value: 1 },
          userAst.where,
        ],
      },
    };

    const result = compileQuery(authorizedAst);
    expect(result.sql).toBe(
      "SELECT producto FROM v_inventario WHERE (almacen_id = ? AND (categoria = ? OR categoria = ?))",
    );
    expect(result.params).toEqual([1, "Computadoras", "Perifericos"]);
  });
});
