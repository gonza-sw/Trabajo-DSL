import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll,
    vi
} from 'vitest';

import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { seedDatabase } from '../../src/db/seed.js';
import { SQLiteAdapter } from '../../src/adapters/sqlite-adapter.js';
import { DashboardService } from '../../src/services/dashboard-service.js';

describe('Servicio del dashboard', () => {

    let directorio;
    let adapter;
    let service;

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

    const sumar = registros => registros.reduce(
        (total, item) => total + item.value, 0
    );

    beforeAll(() => {

        directorio = mkdtempSync(
            join(tmpdir(), 'sql-inv-dashboard-')
        );

        const rutaDb = join(directorio, 'test.sqlite');

        const db = new Database(rutaDb);

        try {
            seedDatabase(db);
        } finally {
            db.close();
        }

        adapter = new SQLiteAdapter(rutaDb);

        service = new DashboardService({ adapter });

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

    it('debe devolver la estructura esperada del dashboard', async () => {

        const resultado = await service.getSummary(admin);

        expect(resultado.success).toBe(true);

        expect(
            Array.isArray(resultado.stockByWarehouse)
        ).toBe(true);

        expect(
            Array.isArray(resultado.stockByCategory)
        ).toBe(true);

        for (const item of [
            ...resultado.stockByWarehouse,
            ...resultado.stockByCategory
        ]) {
            expect(typeof item.label).toBe('string');
            expect(typeof item.value).toBe('number');
            expect(item.value).toBeGreaterThanOrEqual(0);
        }

    });

    it('debe mostrar todos los almacenes al administrador', async () => {

        const resultado = await service.getSummary(admin);

        expect(resultado.stockByWarehouse).toEqual([
            { label: 'Arequipa', value: 42131 },
            { label: 'Lima', value: 42217 },
            { label: 'Trujillo', value: 46745 }
        ]);

    });

    it('debe mostrar las cinco categorias al administrador', async () => {

        const resultado = await service.getSummary(admin);

        expect(resultado.stockByCategory).toEqual([
            { label: 'Accesorios', value: 23870 },
            { label: 'Almacenamiento', value: 28283 },
            { label: 'Componentes', value: 25007 },
            { label: 'Computadoras', value: 24357 },
            { label: 'Perifericos', value: 29576 }
        ]);

    });

    it('debe restringir al operario al almacen de Lima', async () => {

        const resultado = await service.getSummary(operario);

        expect(resultado.stockByWarehouse).toEqual([
            { label: 'Lima', value: 42217 }
        ]);

    });

    it('debe calcular las categorias exclusivamente para Lima', async () => {

        const resultado = await service.getSummary(operario);

        expect(resultado.stockByCategory).toEqual([
            { label: 'Accesorios', value: 7170 },
            { label: 'Almacenamiento', value: 9155 },
            { label: 'Componentes', value: 8749 },
            { label: 'Computadoras', value: 7647 },
            { label: 'Perifericos', value: 9496 }
        ]);

    });

    it('debe restringir al usuario de consulta a Arequipa', async () => {

        const resultado = await service.getSummary(consulta);

        expect(resultado.stockByWarehouse).toEqual([
            { label: 'Arequipa', value: 42131 }
        ]);

    });

    it('debe calcular las categorias exclusivamente para Arequipa', async () => {

        const resultado = await service.getSummary(consulta);

        expect(resultado.stockByCategory).toEqual([
            { label: 'Accesorios', value: 8286 },
            { label: 'Almacenamiento', value: 9285 },
            { label: 'Componentes', value: 7316 },
            { label: 'Computadoras', value: 7547 },
            { label: 'Perifericos', value: 9697 }
        ]);

    });

    it('debe mantener totales consistentes para los tres roles', async () => {

        for (const user of [admin, operario, consulta]) {

            const resultado = await service.getSummary(user);

            expect(
                sumar(resultado.stockByWarehouse)
            ).toBe(
                sumar(resultado.stockByCategory)
            );

        }

    });

    it('debe rechazar roles no autorizados sin ejecutar consultas', async () => {

        const adapterMock = {
            execute: vi.fn()
        };

        const serviceMock = new DashboardService({
            adapter: adapterMock
        });

        await expect(
            serviceMock.getSummary({
                rol: 'invitado',
                almacen_id: null
            })
        ).rejects.toMatchObject({
            code: 'FORBIDDEN'
        });

        expect(adapterMock.execute).not.toHaveBeenCalled();

    });

    it('debe utilizar parametros para restringir las agregaciones', async () => {

        const adapterMock = {
            execute: vi.fn().mockResolvedValue({
                columns: ['label', 'value'],
                rows: []
            })
        };

        const serviceMock = new DashboardService({
            adapter: adapterMock
        });

        await serviceMock.getSummary(operario);

        expect(adapterMock.execute).toHaveBeenCalledTimes(2);

        for (const llamada of adapterMock.execute.mock.calls) {

            const [sql, params] = llamada;

            expect(sql).toContain('WHERE almacen_id = ?');
            expect(params).toEqual([1]);

        }

    });

    it('debe propagar errores de la base de datos', async () => {

        const adapterMock = {
            execute: vi.fn().mockRejectedValue(
                new Error('Error de base de datos')
            )
        };

        const serviceMock = new DashboardService({
            adapter: adapterMock
        });

        await expect(
            serviceMock.getSummary(admin)
        ).rejects.toThrow('Error de base de datos');

    });

});