import pg from 'pg';
import { DatabaseAdapter } from './database-adapter.js';

const { Pool, types } = pg;

export class PostgresAdapter extends DatabaseAdapter {

    constructor(connectionString = process.env.POSTGRES_URL) {
        super();

        if (!connectionString) {
            throw new Error('Se requiere POSTGRES_URL');
        }

        this.pool = new Pool({
            connectionString,
            options: '-c default_transaction_read_only=on',
            types: {
                getTypeParser(oid, format) {
                    if (oid === 20 || oid === 1700) {
                        return Number;
                    }

                    return types.getTypeParser(oid, format);
                }
            }
        });
    }

    async execute(sql, params = []) {

        if (!/^\s*SELECT\b/i.test(sql)) {
            throw new Error('Solo se permiten consultas de lectura');
        }

        let parameterIndex = 0;

        const postgresSQL = sql.replace(
            /\?/g,
            () => `$${++parameterIndex}`
        );

        if (parameterIndex !== params.length) {
            throw new Error('Cantidad de parametros incorrecta');
        }

        const result = await this.pool.query({
            text: postgresSQL,
            values: params,
            queryMode: 'extended'
        });

        return {
            columns: result.fields.map(field => field.name),
            rows: result.rows
        };
    }

    async close() {
        await this.pool.end();
    }
}