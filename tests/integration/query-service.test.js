import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { seedDatabase } from '../../src/db/seed.js';
import { SQLiteAdapter } from '../../src/adapters/sqlite-adapter.js';
import { PostgresAdapter } from '../../src/adapters/postgres-adapter.js';
import { QueryService } from '../../src/services/query-service.js';

import { buildAST } from '../../src/dsl/ast.js';
import { validateQuery } from '../../src/dsl/validator.js';
import { compileQuery } from '../../src/dsl/compiler.js';
import { applyRolePolicy } from '../../src/security/role-policy.js';

const admin = {
    rol: 'admin',
    almacen_id: null
};

const operario = {
    rol: 'operario',
    almacen_id: 1
};

const consulta = {
    rol: 'consulta',
    almacen_id: 2
};

function createService(adapter) {
    return new QueryService({
        adapter,
        buildAST,
        validateQuery,
        applyRolePolicy,
        compileQuery
    });
}

function inventoryQuery() {
    return {
        source: 'v_inventario',
        select: [
            { field: 'producto' },
            { field: 'almacen' },
            { field: 'cantidad' }
        ]
    };
}

function aggregateQuery() {
    return {
        source: 'v_inventario',
        select: [
            { field: 'almacen' },
            {
                field: 'cantidad',
                aggregate: 'SUM',
                alias: 'total_stock'
            }
        ],
        groupBy: ['almacen'],
        orderBy: [
            {
                field: 'almacen',
                direction: 'ASC'
            }
        ]
    };
}

describe('Integracion del DSL y politicas de acceso', () => {

    let directory;
    let adapter;
    let service;

    beforeAll(() => {

        directory = mkdtempSync(
            join(tmpdir(), 'sql-inv-integration-')
        );

        const dbPath = join(directory, 'test.sqlite');

        const db = new Database(dbPath);

        try {
            seedDatabase(db);
        } finally {
            db.close();
        }

        adapter = new SQLiteAdapter(dbPath);
        service = createService(adapter);

    });

    afterAll(async () => {

        if (adapter) {
            await adapter.close();
        }

        if (directory) {
            rmSync(directory, {
                recursive: true,
                force: true
            });
        }

    });

    it('debe ejecutar el flujo completo del DSL', async () => {

        const result = await service.execute(
            inventoryQuery(),
            admin
        );

        expect(result.success).toBe(true);
        expect(result.rowCount).toBe(600);

        expect(result.columns).toEqual([
            'producto',
            'almacen',
            'cantidad'
        ]);

    });

    it('debe permitir al administrador consultar todos los almacenes', async () => {

        const result = await service.execute(
            inventoryQuery(),
            admin
        );

        const warehouses = [
            ...new Set(result.rows.map(row => row.almacen))
        ].sort();

        expect(warehouses).toEqual([
            'Arequipa',
            'Lima',
            'Trujillo'
        ]);

        expect(result.params).toEqual([]);

    });

    it('debe restringir al operario al almacen de Lima', async () => {

        const result = await service.execute(
            inventoryQuery(),
            operario
        );

        expect(result.rowCount).toBe(200);

        expect(
            result.rows.every(row => row.almacen === 'Lima')
        ).toBe(true);

        expect(result.params).toEqual([1]);

    });

    it('debe restringir al usuario consulta a Arequipa', async () => {

        const result = await service.execute(
            inventoryQuery(),
            consulta
        );

        expect(result.rowCount).toBe(200);

        expect(
            result.rows.every(row => row.almacen === 'Arequipa')
        ).toBe(true);

        expect(result.params).toEqual([2]);

    });

    it('debe rechazar movimientos para el usuario consulta', async () => {

        const query = {
            source: 'v_movimientos',
            select: [
                { field: 'producto' },
                { field: 'cantidad' }
            ]
        };

        await expect(
            service.execute(query, consulta)
        ).rejects.toMatchObject({
            code: 'FORBIDDEN'
        });

    });

    it('debe rechazar columnas no autorizadas', async () => {

        const query = {
            source: 'v_inventario',
            select: [
                { field: 'campo_inexistente' }
            ]
        };

        await expect(
            service.execute(query, admin)
        ).rejects.toMatchObject({
            code: 'INVALID_FIELD'
        });

    });

    it('debe mantener la restriccion de almacen con condiciones OR', async () => {

        const query = {
            ...inventoryQuery(),
            where: {
                logic: 'OR',
                conditions: [
                    {
                        field: 'almacen',
                        operator: '=',
                        value: 'Lima'
                    },
                    {
                        field: 'almacen',
                        operator: '=',
                        value: 'Arequipa'
                    }
                ]
            }
        };

        const result = await service.execute(
            query,
            operario
        );

        expect(result.rowCount).toBe(200);

        expect(
            result.rows.every(row => row.almacen === 'Lima')
        ).toBe(true);

        expect(result.params).toEqual([
            'Lima',
            'Arequipa',
            1
        ]);

    });

    it('debe conservar la profundidad permitida del DSL', async () => {

        const query = {
            ...inventoryQuery(),
            where: {
                logic: 'AND',
                conditions: [
                    {
                        field: 'cantidad',
                        operator: '>=',
                        value: 0
                    },
                    {
                        logic: 'OR',
                        conditions: [
                            {
                                field: 'almacen',
                                operator: '=',
                                value: 'Lima'
                            },
                            {
                                logic: 'AND',
                                conditions: [
                                    {
                                        field: 'almacen',
                                        operator: '=',
                                        value: 'Arequipa'
                                    },
                                    {
                                        field: 'cantidad',
                                        operator: '>=',
                                        value: 0
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        };

        const original = structuredClone(query);

        const result = await service.execute(
            query,
            operario
        );

        expect(result.rowCount).toBe(200);

        expect(
            result.rows.every(row => row.almacen === 'Lima')
        ).toBe(true);

        expect(query).toEqual(original);

    });

    it('debe ejecutar agrupaciones con el compilador real', async () => {

        const result = await service.execute(
            aggregateQuery(),
            admin
        );

        expect(result.rows).toEqual([
            { almacen: 'Arequipa', total_stock: 42131 },
            { almacen: 'Lima', total_stock: 42217 },
            { almacen: 'Trujillo', total_stock: 46745 }
        ]);

    });

    it('debe aplicar las politicas antes de calcular agregaciones', async () => {

        const result = await service.execute(
            aggregateQuery(),
            operario
        );

        expect(result.rows).toEqual([
            { almacen: 'Lima', total_stock: 42217 }
        ]);

        expect(result.params).toEqual([1]);

    });

    it('debe devolver resultados vacios conservando las columnas', async () => {

        const query = {
            ...inventoryQuery(),
            where: {
                logic: 'AND',
                conditions: [
                    {
                        field: 'almacen',
                        operator: '=',
                        value: 'Trujillo'
                    }
                ]
            }
        };

        const result = await service.execute(
            query,
            operario
        );

        expect(result.success).toBe(true);
        expect(result.rowCount).toBe(0);
        expect(result.rows).toEqual([]);

        expect(result.columns).toEqual([
            'producto',
            'almacen',
            'cantidad'
        ]);

    });

});

describe.skipIf(!process.env.POSTGRES_URL)(
    'Integracion del DSL entre SQLite y PostgreSQL',
    () => {

        let sqlite;
        let postgres;
        let sqliteService;
        let postgresService;

        beforeAll(() => {

            sqlite = new SQLiteAdapter();
            postgres = new PostgresAdapter();

            sqliteService = createService(sqlite);
            postgresService = createService(postgres);

        });

        afterAll(async () => {

            if (sqlite) {
                await sqlite.close();
            }

            if (postgres) {
                await postgres.close();
            }

        });

        it.each([
            admin,
            operario,
            consulta
        ])('debe obtener resultados equivalentes para $rol', async (user) => {

            const query = aggregateQuery();

            const sqliteResult = await sqliteService.execute(
                query,
                user
            );

            const postgresResult = await postgresService.execute(
                query,
                user
            );

            expect(postgresResult).toEqual(sqliteResult);

        });

    }
);