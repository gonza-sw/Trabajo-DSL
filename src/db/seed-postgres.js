import Database from 'better-sqlite3';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { seedDatabase } from './seed.js';

const { Client } = pg;

const tables = [
    'categorias',
    'productos',
    'almacenes',
    'inventario',
    'movimientos',
    'usuarios'
];

async function seedPostgres() {

    const connectionString = process.env.POSTGRES_URL;

    if (!connectionString) {
        throw new Error('Se requiere POSTGRES_URL');
    }

    const sqlite = new Database(':memory:');
    const postgres = new Client({ connectionString });

    try {
        seedDatabase(sqlite);

        await postgres.connect();
        await postgres.query('BEGIN');

        const schema = readFileSync(
            new URL('./schema-postgres.sql', import.meta.url),
            'utf8'
        );

        await postgres.query(schema);

        // Eliminar datos anteriores respetando las relaciones.
        for (const table of [...tables].reverse()) {
            await postgres.query(`DELETE FROM ${table}`);
        }

        const results = [];

        for (const table of tables) {

            const rows = sqlite
                .prepare(`SELECT * FROM ${table} ORDER BY id`)
                .all();

            if (rows.length === 0) {
                results.push({
                    tabla: table,
                    registros: 0
                });

                continue;
            }

            const columns = Object.keys(rows[0]);
            const batchSize = 200;

            for (let i = 0; i < rows.length; i += batchSize) {

                const batch = rows.slice(i, i + batchSize);
                const params = [];

                const placeholders = batch.map(row => {

                    const values = columns.map(column => {
                        params.push(row[column]);
                        return `$${params.length}`;
                    });

                    return `(${values.join(', ')})`;
                });

                const sql = `
                    INSERT INTO ${table} (${columns.join(', ')})
                    VALUES ${placeholders.join(', ')}
                `;

                await postgres.query(sql, params);
            }

            results.push({
                tabla: table,
                registros: rows.length
            });
        }

        await postgres.query('COMMIT');

        console.log('Dataset PostgreSQL generado correctamente');
        console.table(results);

        const total = results.reduce(
            (sum, item) => sum + item.registros,
            0
        );

        console.log(`Total de registros: ${total}`);

    } catch (error) {

        await postgres.query('ROLLBACK').catch(() => {});

        throw error;

    } finally {

        sqlite.close();
        await postgres.end();
    }
}

seedPostgres().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});