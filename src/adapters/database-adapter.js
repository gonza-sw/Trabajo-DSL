export class DatabaseAdapter {

    async execute(sql, params = []) {
        throw new Error('El metodo execute debe ser implementado');
    }

    async close() {
        throw new Error('El metodo close debe ser implementado');
    }

}