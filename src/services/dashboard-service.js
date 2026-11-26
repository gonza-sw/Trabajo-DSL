import { getRoleAccess } from '../security/role-policy.js';

export class DashboardService {

    constructor({ adapter }) {
        this.adapter = adapter;
    }

    async getSummary(user) {

        const access = getRoleAccess(user);

        const params = [];
        let where = '';

        if (access.warehouseId !== null) {
            where = 'WHERE almacen_id = ?';
            params.push(access.warehouseId);
        }

        const stockByWarehouse = await this.adapter.execute(
            `
            SELECT
                almacen AS label,
                SUM(cantidad) AS value
            FROM v_inventario
            ${where}
            GROUP BY almacen
            ORDER BY almacen
            `,
            params
        );

        const stockByCategory = await this.adapter.execute(
            `
            SELECT
                categoria AS label,
                SUM(cantidad) AS value
            FROM v_inventario
            ${where}
            GROUP BY categoria
            ORDER BY categoria
            `,
            params
        );

        return {
            success: true,
            stockByWarehouse: stockByWarehouse.rows,
            stockByCategory: stockByCategory.rows
        };
    }

}