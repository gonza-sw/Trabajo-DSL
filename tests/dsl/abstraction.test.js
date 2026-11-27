import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { buildAST } from "../../src/dsl/ast.js";
import { validateQuery } from "../../src/dsl/validator.js";
import { compileQuery } from "../../src/dsl/compiler.js";
import { ejecutarConsultaImperativa } from "../../examples/consulta-js.js";

describe("DSL Abstracción y Equivalencia JS vs SQL (PR 3)", () => {
  const datasetPrueba = [
    { categoria: "Perifericos", almacen: "Lima", precio: 120, cantidad: 80 },
    {
      categoria: "Perifericos",
      almacen: "Arequipa",
      precio: 250,
      cantidad: 45,
    },
    {
      categoria: "Perifericos",
      almacen: "Trujillo",
      precio: 90,
      cantidad: 200,
    }, // excluido por almacén
    { categoria: "Accesorios", almacen: "Lima", precio: 50, cantidad: 150 },
    { categoria: "Accesorios", almacen: "Arequipa", precio: 600, cantidad: 90 }, // excluido por precio >= 500
    { categoria: "Componentes", almacen: "Arequipa", precio: 300, cantidad: 0 }, // excluido por cantidad = 0
    { categoria: "Componentes", almacen: "Lima", precio: 400, cantidad: 60 }, // excluido por HAVING <= 100
  ];

  const contratoJson = {
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

  it("el script imperativo JS y el SQL compilado por el DSL devuelven exactamente las mismas filas", () => {
    // 1. Ejecución imperativa en JS puro
    const resultadoJS = ejecutarConsultaImperativa(datasetPrueba);

    // 2. Ejecución mediante el pipeline completo del DSL sobre SQLite en memoria
    const ast = buildAST(contratoJson);
    validateQuery(ast);
    const { sql, params } = compileQuery(ast);

    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE v_inventario (
        categoria TEXT,
        almacen TEXT,
        precio REAL,
        cantidad INTEGER
      );
    `);
    const insert = db.prepare(
      "INSERT INTO v_inventario (categoria, almacen, precio, cantidad) VALUES (?, ?, ?, ?)",
    );
    for (const row of datasetPrueba) {
      insert.run(row.categoria, row.almacen, row.precio, row.cantidad);
    }

    const stmt = db.prepare(sql);
    const resultadoSQL = stmt.all(...params).map((r) => ({ ...r }));

    expect(resultadoSQL).toEqual([
      { categoria: "Accesorios", total_stock: 150 },
      { categoria: "Perifericos", total_stock: 125 },
    ]);
    expect(resultadoJS).toEqual(resultadoSQL);
  });
});
