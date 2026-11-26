import Database from 'better-sqlite3';
import { DatabaseAdapter } from './database-adapter.js';

export class SQLiteAdapter extends DatabaseAdapter {

    constructor(
        dbPath = process.env.DB_PATH || 'src/db/inventory.sqlite'
    ) {
        super();

        this.db = new Database(dbPath, {
            readonly: true,
            fileMustExist: true
        });

        this.db.pragma('foreign_keys = ON');
        this.db.pragma('query_only = ON');
    }

    async execute(sql, params = []) {
        const statement = this.db.prepare(sql);

        if (!statement.reader || !statement.readonly) {
            throw new Error(
                'Solo se permiten consultas de lectura'
            );
        }

        const columns = statement.columns().map(
            column => column.name
        );

        const rows = statement.all(...params);

        return {
            columns,
            rows
        };
    }

    async close() {
        if (this.db.open) {
            this.db.close();
        }
    }

}