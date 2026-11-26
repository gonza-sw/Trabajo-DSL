import { describe, it, expect, beforeEach, vi } from 'vitest';

import { QueryService } from '../../src/services/query-service.js';
import { buildAST } from '../../src/dsl/ast.js';
import { validateQuery } from '../../src/dsl/validator.js';

describe('Servicio de consultas', () => {

    let service;
    let adapter;
    let compiler;
    let policy;
    let query;
    let user;

    beforeEach(() => {

        query = {
            source: 'v_inventario',
            select: [
                { field: 'producto' },
                { field: 'cantidad' }
            ]
        };

        user = {
            rol: 'admin',
            almacen_id: null
        };

        adapter = {
            execute: vi.fn().mockResolvedValue({
                columns: ['producto', 'cantidad'],
                rows: [
                    {
                        producto: 'Laptop - Modelo 1',
                        cantidad: 309
                    }
                ]
            })
        };

        compiler = vi.fn().mockReturnValue({
            sql: 'SELECT producto, cantidad FROM v_inventario',
            params: []
        });

        policy = vi.fn(ast => ast);

        service = new QueryService({
            adapter,
            buildAST,
            validateQuery,
            applyRolePolicy: policy,
            compileQuery: compiler
        });

    });

    it('debe ejecutar una consulta valida', async () => {

        const resultado = await service.execute(query, user);

        expect(resultado.success).toBe(true);
        expect(resultado.rowCount).toBe(1);
        expect(resultado.columns).toEqual([
            'producto',
            'cantidad'
        ]);

        expect(resultado.rows).toEqual([
            {
                producto: 'Laptop - Modelo 1',
                cantidad: 309
            }
        ]);

    });

    it('debe devolver el SQL y sus parametros', async () => {

        const resultado = await service.execute(query, user);

        expect(resultado.sql).toBe(
            'SELECT producto, cantidad FROM v_inventario'
        );

        expect(resultado.params).toEqual([]);

    });

    it('debe rechazar columnas no permitidas', async () => {

        query.select = [
            { field: 'campo_inexistente' }
        ];

        await expect(
            service.execute(query, user)
        ).rejects.toMatchObject({
            code: 'INVALID_FIELD'
        });

        expect(policy).not.toHaveBeenCalled();
        expect(compiler).not.toHaveBeenCalled();
        expect(adapter.execute).not.toHaveBeenCalled();

    });

    it('debe rechazar fuentes no permitidas', async () => {

        query.source = 'usuarios';

        await expect(
            service.execute(query, user)
        ).rejects.toThrow();

        expect(policy).not.toHaveBeenCalled();
        expect(compiler).not.toHaveBeenCalled();
        expect(adapter.execute).not.toHaveBeenCalled();

    });

    it('debe enviar el usuario a la politica de acceso', async () => {

        await service.execute(query, user);

        expect(policy).toHaveBeenCalledTimes(1);

        expect(policy).toHaveBeenCalledWith(
            expect.objectContaining({
                source: 'v_inventario'
            }),
            user
        );

    });

    it('debe detener la consulta si la politica rechaza el acceso', async () => {

        policy.mockImplementation(() => {
            throw new Error('Acceso denegado');
        });

        await expect(
            service.execute(query, user)
        ).rejects.toThrow('Acceso denegado');

        expect(compiler).not.toHaveBeenCalled();
        expect(adapter.execute).not.toHaveBeenCalled();

    });

    it('debe compilar el AST autorizado', async () => {

        const authorizedAST = {
            ...buildAST(query),
            where: {
                type: 'Condition',
                field: 'almacen_id',
                operator: '=',
                value: 1
            }
        };

        policy.mockReturnValue(authorizedAST);

        await service.execute(query, user);

        expect(compiler).toHaveBeenCalledWith(
            authorizedAST
        );

    });

    it('debe enviar el SQL parametrizado al adaptador', async () => {

        const sql = `
            SELECT producto, cantidad
            FROM v_inventario
            WHERE cantidad > ?
        `;

        compiler.mockReturnValue({
            sql,
            params: [100]
        });

        const resultado = await service.execute(query, user);

        expect(adapter.execute).toHaveBeenCalledWith(
            sql,
            [100]
        );

        expect(resultado.params).toEqual([100]);

    });

    it('debe manejar consultas sin resultados', async () => {

        adapter.execute.mockResolvedValue({
            columns: ['producto', 'cantidad'],
            rows: []
        });

        const resultado = await service.execute(query, user);

        expect(resultado.success).toBe(true);
        expect(resultado.rowCount).toBe(0);
        expect(resultado.rows).toEqual([]);

        expect(resultado.columns).toEqual([
            'producto',
            'cantidad'
        ]);

    });

    it('debe propagar errores del compilador', async () => {

        compiler.mockImplementation(() => {
            throw new Error('Error de compilacion');
        });

        await expect(
            service.execute(query, user)
        ).rejects.toThrow('Error de compilacion');

        expect(adapter.execute).not.toHaveBeenCalled();

    });

    it('debe propagar errores del adaptador', async () => {

        adapter.execute.mockRejectedValue(
            new Error('Error de base de datos')
        );

        await expect(
            service.execute(query, user)
        ).rejects.toThrow('Error de base de datos');

    });

});