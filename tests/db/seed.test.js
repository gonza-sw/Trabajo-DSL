import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { seedDatabase } from '../../src/db/seed.js';
import { verifyPassword } from '../../src/security/auth.js';

describe('Esquema relacional y dataset de inventario', () => {

    let db;

    beforeAll(() => {
        db = new Database(':memory:');
        seedDatabase(db);
    });

    afterAll(() => {
        db.close();
    });

    it('debe generar la cantidad esperada de registros', () => {
        const cantidades = {
            categorias: 5,
            productos: 200,
            almacenes: 3,
            inventario: 600,
            movimientos: 4500,
            usuarios: 3
        };

        let total = 0;

        for (const [tabla, esperado] of Object.entries(cantidades)) {
            const resultado = db.prepare(
                `SELECT COUNT(*) AS total FROM ${tabla}`
            ).get();

            expect(resultado.total).toBe(esperado);

            total += resultado.total;
        }

        expect(total).toBe(5311);
    });

    it('debe mantener activadas las claves foraneas', () => {
        const resultado = db.pragma('foreign_keys', {
            simple: true
        });

        expect(resultado).toBe(1);
    });

    it('no debe contener relaciones invalidas', () => {
        const errores = db.pragma('foreign_key_check');

        expect(errores).toHaveLength(0);
    });

    it('debe tener cada producto en los tres almacenes', () => {
        const resultado = db.prepare(`
            SELECT producto_id
            FROM inventario
            GROUP BY producto_id
            HAVING COUNT(DISTINCT almacen_id) <> 3
        `).all();

        expect(resultado).toHaveLength(0);
    });

    it('no debe permitir inventarios duplicados', () => {
        expect(() => {
            db.prepare(`
                INSERT INTO inventario
                    (producto_id, almacen_id, cantidad)
                VALUES (1, 1, 50)
            `).run();
        }).toThrow(/UNIQUE constraint failed/);
    });

    it('no debe permitir cantidades negativas', () => {
        expect(() => {
            db.prepare(`
                UPDATE inventario
                SET cantidad = -10
                WHERE id = 1
            `).run();
        }).toThrow(/CHECK constraint failed/);
    });

    it('no debe contener existencias negativas', () => {
        const resultado = db.prepare(`
            SELECT id
            FROM inventario
            WHERE cantidad < 0
        `).all();

        expect(resultado).toHaveLength(0);
    });

    it('debe mantener el stock consistente con los movimientos', () => {
        const diferencias = db.prepare(`
            SELECT
                i.id,
                i.cantidad AS stock_actual,
                COALESCE(
                    SUM(
                        CASE
                            WHEN m.tipo = 'ENTRADA'
                            THEN m.cantidad
                            ELSE -m.cantidad
                        END
                    ), 0
                ) AS stock_calculado
            FROM inventario i
            LEFT JOIN movimientos m
                ON i.id = m.inventario_id
            GROUP BY i.id, i.cantidad
            HAVING stock_actual <> stock_calculado
        `).all();

        expect(diferencias).toHaveLength(0);
    });

    it('no debe generar saldos negativos durante los movimientos', () => {
        const resultado = db.prepare(`
            WITH saldos AS (
                SELECT
                    inventario_id,
                    SUM(
                        CASE
                            WHEN tipo = 'ENTRADA'
                            THEN cantidad
                            ELSE -cantidad
                        END
                    ) OVER (
                        PARTITION BY inventario_id
                        ORDER BY fecha, id
                        ROWS BETWEEN UNBOUNDED PRECEDING
                        AND CURRENT ROW
                    ) AS saldo
                FROM movimientos
            )
            SELECT *
            FROM saldos
            WHERE saldo < 0
        `).all();

        expect(resultado).toHaveLength(0);
    });

    it('debe consultar correctamente la vista de inventario', () => {
        const resultado = db.prepare(`
            SELECT * FROM v_inventario
        `).all();

        expect(resultado).toHaveLength(600);

        expect(Object.keys(resultado[0])).toEqual([
            'producto_id',
            'producto',
            'categoria',
            'almacen_id',
            'almacen',
            'ciudad',
            'cantidad',
            'precio',
            'stock_minimo'
        ]);
    });

    it('debe consultar correctamente la vista de movimientos', () => {
        const resultado = db.prepare(`
            SELECT * FROM v_movimientos
        `).all();

        expect(resultado).toHaveLength(4500);

        expect(Object.keys(resultado[0])).toEqual([
            'movimiento_id',
            'producto',
            'categoria',
            'almacen_id',
            'almacen',
            'tipo',
            'cantidad',
            'fecha'
        ]);
    });

    it('debe generar usuarios con roles y almacenes correctos', () => {
        const usuarios = db.prepare(`
            SELECT username, rol, almacen_id
            FROM usuarios
            ORDER BY id
        `).all();

        expect(usuarios).toEqual([
            {
                username: 'admin',
                rol: 'admin',
                almacen_id: null
            },
            {
                username: 'operario',
                rol: 'operario',
                almacen_id: 1
            },
            {
                username: 'consulta',
                rol: 'consulta',
                almacen_id: 2
            }
        ]);
    });

    it('debe almacenar las contrasenas mediante hashes', () => {
        const usuarios = db.prepare(`
            SELECT password_hash
            FROM usuarios
        `).all();

        for (const usuario of usuarios) {
            expect(usuario.password_hash).toMatch(
                /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/
            );
        }
    });

    it('debe generar datos de inventario reproducibles', () => {
        const segundaDb = new Database(':memory:');

        try {
            seedDatabase(segundaDb);

            const tablas = [
                'categorias',
                'productos',
                'almacenes',
                'inventario',
                'movimientos'
            ];

            for (const tabla of tablas) {
                const consulta = `
                    SELECT * FROM ${tabla}
                    ORDER BY id
                `;

                const original = db.prepare(consulta).all();
                const copia = segundaDb.prepare(consulta).all();

                expect(copia).toEqual(original);
            }
        } finally {
            segundaDb.close();
        }
    });

    it('debe permitir regenerar el dataset sin duplicar registros', () => {
        const temporalDb = new Database(':memory:');

        try {
            seedDatabase(temporalDb);
            const resultado = seedDatabase(temporalDb);

            const total = resultado.reduce(
                (suma, fila) => suma + fila.registros,
                0
            );

            expect(total).toBe(5311);

            expect(
                temporalDb.pragma('foreign_key_check')
            ).toHaveLength(0);
        } finally {
            temporalDb.close();
        }
    });

    it('debe generar contrasenas compatibles con la autenticacion', async () => {
        const credenciales = [
            ['admin', 'AdminDemo2026!'],
            ['operario', 'OperarioDemo2026!'],
            ['consulta', 'ConsultaDemo2026!']
        ];

        for (const [username, password] of credenciales) {
            const usuario = db.prepare(`
                SELECT password_hash
                FROM usuarios
                WHERE username = ?
            `).get(username);

            expect(usuario).toBeDefined();

            expect(
                await verifyPassword(password, usuario.password_hash)
            ).toBe(true);

            expect(
                await verifyPassword('incorrecta', usuario.password_hash)
            ).toBe(false);
        }
    });

});