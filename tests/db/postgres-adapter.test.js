import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseAdapter } from '../../src/adapters/database-adapter.js';
import { SQLiteAdapter } from '../../src/adapters/sqlite-adapter.js';
import { PostgresAdapter } from '../../src/adapters/postgres-adapter.js';

describe.skipIf(!process.env.POSTGRES_URL)(
    'Adaptador PostgreSQL y portabilidad entre motores',
    () => {

        let sqlite;
        let postgres;

        beforeAll(() => {
            sqlite = new SQLiteAdapter();
            postgres = new PostgresAdapter();
        });

        afterAll(async () => {
            await sqlite?.close();
            await postgres?.close();
        });

        it('debe implementar el contrato DatabaseAdapter', () => {
            expect(postgres).toBeInstanceOf(DatabaseAdapter);
        });

        it('debe ejecutar consultas parametrizadas', async () => {
            const result = await postgres.execute(
                'SELECT producto, almacen, cantidad FROM v_inventario WHERE almacen = ?',
                ['Lima']
            );

            expect(result.columns).toEqual([
                'producto',
                'almacen',
                'cantidad'
            ]);

            expect(result.rows).toHaveLength(200);

            expect(
                result.rows.every(row => row.almacen === 'Lima')
            ).toBe(true);
        });

        it('debe conservar las columnas en resultados vacios', async () => {
            const result = await postgres.execute(
                'SELECT producto, cantidad FROM v_inventario WHERE almacen = ?',
                ['Inexistente']
            );

            expect(result.columns).toEqual([
                'producto',
                'cantidad'
            ]);

            expect(result.rows).toEqual([]);
        });

        it('debe rechazar instrucciones de escritura', async () => {
            await expect(
                postgres.execute(
                    'UPDATE inventario SET cantidad = cantidad WHERE id = ?',
                    [1]
                )
            ).rejects.toThrow(
                'Solo se permiten consultas de lectura'
            );
        });

        it('debe trabajar en modo de solo lectura', async () => {
            const result = await postgres.execute(
                'SELECT current_setting(?) AS modo_lectura',
                ['transaction_read_only']
            );

            expect(result.rows).toEqual([
                { modo_lectura: 'on' }
            ]);
        });

        it('debe rechazar una cantidad incorrecta de parametros', async () => {
            await expect(
                postgres.execute(
                    'SELECT producto FROM v_inventario WHERE almacen = ?',
                    []
                )
            ).rejects.toThrow(
                'Cantidad de parametros incorrecta'
            );
        });

        it('debe obtener el mismo stock por almacen en ambos motores', async () => {
            const sql = `
                SELECT almacen, SUM(cantidad) AS total_stock
                FROM v_inventario
                GROUP BY almacen
                ORDER BY almacen
            `;

            const resultSQLite = await sqlite.execute(sql);
            const resultPostgres = await postgres.execute(sql);

            expect(resultPostgres).toEqual(resultSQLite);

            expect(resultPostgres.rows).toEqual([
                { almacen: 'Arequipa', total_stock: 42131 },
                { almacen: 'Lima', total_stock: 42217 },
                { almacen: 'Trujillo', total_stock: 46745 }
            ]);
        });

        it('debe obtener el mismo stock por categoria en ambos motores', async () => {
            const sql = `
                SELECT categoria, SUM(cantidad) AS total_stock
                FROM v_inventario
                GROUP BY categoria
                ORDER BY categoria
            `;

            const resultSQLite = await sqlite.execute(sql);
            const resultPostgres = await postgres.execute(sql);

            expect(resultPostgres).toEqual(resultSQLite);
        });

        it('debe obtener resultados equivalentes con filtros y agregaciones', async () => {
            const sql = `
                SELECT categoria, SUM(cantidad) AS total_stock
                FROM v_inventario
                WHERE almacen = ? AND cantidad > ?
                GROUP BY categoria
                HAVING SUM(cantidad) > ?
                ORDER BY total_stock DESC, categoria ASC
            `;

            const params = ['Lima', 100, 500];

            const resultSQLite = await sqlite.execute(sql, params);
            const resultPostgres = await postgres.execute(sql, params);

            expect(resultSQLite.rows.length).toBeGreaterThan(0);
            expect(resultPostgres).toEqual(resultSQLite);
        });

        it('debe obtener la misma cantidad de movimientos en ambos motores', async () => {
            const sql = `
                SELECT tipo, COUNT(movimiento_id) AS total
                FROM v_movimientos
                GROUP BY tipo
                ORDER BY tipo
            `;

            const resultSQLite = await sqlite.execute(sql);
            const resultPostgres = await postgres.execute(sql);

            expect(resultPostgres).toEqual(resultSQLite);

            const total = resultPostgres.rows.reduce(
                (sum, row) => sum + row.total,
                0
            );

            expect(total).toBe(4500);
        });
    }
);