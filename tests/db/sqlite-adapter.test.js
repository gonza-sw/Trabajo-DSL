import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll
} from 'vitest';

import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { seedDatabase } from '../../src/db/seed.js';
import { DatabaseAdapter } from '../../src/adapters/database-adapter.js';
import { SQLiteAdapter } from '../../src/adapters/sqlite-adapter.js';

describe('Adaptador SQLite', () => {

    let directorio;
    let rutaDb;
    let adapter;

    beforeAll(() => {
        directorio = mkdtempSync(
            join(tmpdir(), 'sql-inv-')
        );

        rutaDb = join(directorio, 'test.sqlite');

        const db = new Database(rutaDb);

        try {
            seedDatabase(db);
        } finally {
            db.close();
        }

        adapter = new SQLiteAdapter(rutaDb);
    });

    afterAll(async () => {
        if (adapter) {
            await adapter.close();
        }

        if (directorio) {
            rmSync(directorio, {
                recursive: true,
                force: true
            });
        }
    });

    it('debe cumplir el contrato DatabaseAdapter', () => {
        expect(adapter).toBeInstanceOf(DatabaseAdapter);
    });

    it('debe ejecutar consultas correctamente', async () => {
        const resultado = await adapter.execute(`
            SELECT producto, cantidad
            FROM v_inventario
            LIMIT 5
        `);

        expect(resultado.columns).toEqual([
            'producto',
            'cantidad'
        ]);

        expect(resultado.rows).toHaveLength(5);
    });

    it('debe ejecutar consultas parametrizadas', async () => {
        const resultado = await adapter.execute(`
            SELECT producto, almacen, cantidad
            FROM v_inventario
            WHERE almacen = ?
        `, ['Lima']);

        expect(resultado.rows).toHaveLength(200);

        expect(
            resultado.rows.every(
                fila => fila.almacen === 'Lima'
            )
        ).toBe(true);
    });

    it('debe conservar las columnas sin resultados', async () => {
        const resultado = await adapter.execute(`
            SELECT producto, cantidad
            FROM v_inventario
            WHERE almacen = ?
        `, ['Almacen inexistente']);

        expect(resultado.columns).toEqual([
            'producto',
            'cantidad'
        ]);

        expect(resultado.rows).toEqual([]);
    });

    it('debe rechazar operaciones de escritura', async () => {
        await expect(
            adapter.execute(`
                UPDATE inventario
                SET cantidad = 100
                WHERE id = ?
            `, [1])
        ).rejects.toThrow(
            'Solo se permiten consultas de lectura'
        );
    });

    it('debe ejecutar consultas de agregacion', async () => {
        const resultado = await adapter.execute(`
            SELECT
                almacen AS label,
                SUM(cantidad) AS value
            FROM v_inventario
            GROUP BY almacen
            ORDER BY almacen
        `);

        expect(resultado.columns).toEqual([
            'label',
            'value'
        ]);

        expect(resultado.rows).toEqual([
            { label: 'Arequipa', value: 42131 },
            { label: 'Lima', value: 42217 },
            { label: 'Trujillo', value: 46745 }
        ]);
    });

    it('debe informar errores de consultas invalidas', async () => {
        await expect(
            adapter.execute(`
                SELECT campo_inexistente
                FROM v_inventario
            `)
        ).rejects.toThrow();
    });

    it('debe rechazar una base de datos inexistente', () => {
        const rutaInexistente = join(
            directorio,
            'inexistente.sqlite'
        );

        expect(() => {
            new SQLiteAdapter(rutaInexistente);
        }).toThrow();
    });

    it('debe permitir cerrar la conexion', async () => {
        const temporal = new SQLiteAdapter(rutaDb);

        await temporal.close();

        await expect(
            temporal.execute('SELECT 1')
        ).rejects.toThrow();
    });

    it('debe permitir cerrar la conexion mas de una vez', async () => {
        const temporal = new SQLiteAdapter(rutaDb);

        await temporal.close();

        await expect(
            temporal.close()
        ).resolves.toBeUndefined();
    });

    it('debe exigir la implementacion del metodo execute', async () => {
        const base = new DatabaseAdapter();

        await expect(
            base.execute('SELECT 1')
        ).rejects.toThrow(
            'El metodo execute debe ser implementado'
        );

    });

    it('debe exigir la implementacion del metodo close', async () => {
        const base = new DatabaseAdapter();

        await expect(
            base.close()
        ).rejects.toThrow(
            'El metodo close debe ser implementado'
        );

    });
});