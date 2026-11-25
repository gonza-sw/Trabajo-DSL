import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync } from 'node:crypto';

const DB_PATH = process.env.DB_PATH || 'src/db/inventory.sqlite';

const categorias = [
    'Computadoras',
    'Componentes',
    'Perifericos',
    'Almacenamiento',
    'Accesorios'
];

const almacenes = [
    'Lima',
    'Arequipa',
    'Trujillo'
];

const catalogo = [
    ['Laptop', 'Computadora de escritorio', 'Mini PC', 'Workstation'],
    ['Procesador', 'Memoria RAM', 'Tarjeta grafica', 'Placa madre'],
    ['Teclado', 'Mouse', 'Monitor', 'Audifonos'],
    ['SSD', 'Disco duro', 'Memoria USB', 'Tarjeta SD'],
    ['Cable HDMI', 'Adaptador USB', 'Hub USB', 'Cargador']
];

function crearGenerador(semilla = 2026) {
    let estado = semilla >>> 0;

    return function (min, max) {
        estado = (Math.imul(1664525, estado) + 1013904223) >>> 0;

        return min + Math.floor(
            (estado / 4294967296) * (max - min + 1)
        );
    };
}

function generarHash(password) {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');

    return `${salt}:${hash}`;
}

export function seedDatabase(db) {
    const aleatorio = crearGenerador();

    db.pragma('foreign_keys = ON');

    const schema = readFileSync(
        new URL('./schema.sql', import.meta.url),
        'utf8'
    );

    db.exec(schema);

    const generarDatos = db.transaction(() => {

        // Limpiar los datos anteriores respetando las relaciones.

        db.exec(`
            DELETE FROM movimientos;
            DELETE FROM inventario;
            DELETE FROM usuarios;
            DELETE FROM productos;
            DELETE FROM almacenes;
            DELETE FROM categorias;
        `);

        // Generar categorias.

        const insertarCategoria = db.prepare(`
            INSERT INTO categorias (id, nombre)
            VALUES (?, ?)
        `);

        categorias.forEach((nombre, index) => {
            insertarCategoria.run(index + 1, nombre);
        });

        // Generar almacenes.

        const insertarAlmacen = db.prepare(`
            INSERT INTO almacenes (id, nombre, ciudad)
            VALUES (?, ?, ?)
        `);

        almacenes.forEach((ciudad, index) => {
            insertarAlmacen.run(index + 1, ciudad, ciudad);
        });

        // Generar 200 productos.

        const insertarProducto = db.prepare(`
            INSERT INTO productos
                (id, categoria_id, nombre, precio, stock_minimo)
            VALUES (?, ?, ?, ?, ?)
        `);

        for (let id = 1; id <= 200; id++) {
            const categoriaId = Math.floor((id - 1) / 40) + 1;
            const tipos = catalogo[categoriaId - 1];

            const tipo = tipos[(id - 1) % tipos.length];
            const nombre = `${tipo} - Modelo ${id}`;

            const precio = aleatorio(2000, 500000) / 100;
            const stockMinimo = aleatorio(5, 30);

            insertarProducto.run(
                id,
                categoriaId,
                nombre,
                precio,
                stockMinimo
            );
        }

        // Generar 600 registros de inventario.

        const insertarInventario = db.prepare(`
            INSERT INTO inventario
                (id, producto_id, almacen_id, cantidad)
            VALUES (?, ?, ?, ?)
        `);

        let inventarioId = 1;

        for (let productoId = 1; productoId <= 200; productoId++) {
            for (let almacenId = 1; almacenId <= 3; almacenId++) {

                insertarInventario.run(
                    inventarioId,
                    productoId,
                    almacenId,
                    0
                );

                inventarioId++;
            }
        }

        // Generar 4500 movimientos de inventario.

        const insertarMovimiento = db.prepare(`
            INSERT INTO movimientos
                (id, inventario_id, tipo, cantidad, fecha)
            VALUES (?, ?, ?, ?, ?)
        `);

        const actualizarStock = db.prepare(`
            UPDATE inventario
            SET cantidad = ?
            WHERE id = ?
        `);

        const saldos = Array(600).fill(0);

        for (let id = 1; id <= 4500; id++) {

            const inventarioId = id <= 600
                ? id
                : aleatorio(1, 600);

            const indice = inventarioId - 1;
            const stockActual = saldos[indice];

            const esEntrada =
                stockActual === 0 || aleatorio(1, 100) <= 60;

            const tipo = esEntrada ? 'ENTRADA' : 'SALIDA';

            const cantidad = esEntrada
                ? aleatorio(10, 100)
                : aleatorio(1, Math.min(stockActual, 40));

            const fecha = new Date(
                Date.UTC(2026, 0, 1) + (id - 1) * 3600000
            ).toISOString();

            insertarMovimiento.run(
                id,
                inventarioId,
                tipo,
                cantidad,
                fecha
            );

            saldos[indice] += esEntrada
                ? cantidad
                : -cantidad;
        }

        // Actualizar las existencias finales.

        saldos.forEach((cantidad, index) => {
            actualizarStock.run(cantidad, index + 1);
        });

        // Generar usuarios de demostracion.

        const insertarUsuario = db.prepare(`
            INSERT INTO usuarios
                (id, username, password_hash, rol, almacen_id)
            VALUES (?, ?, ?, ?, ?)
        `);

        insertarUsuario.run(
            1,
            'admin',
            generarHash('AdminDemo2026!'),
            'admin',
            null
        );

        insertarUsuario.run(
            2,
            'operario',
            generarHash('OperarioDemo2026!'),
            'operario',
            1
        );

        insertarUsuario.run(
            3,
            'consulta',
            generarHash('ConsultaDemo2026!'),
            'consulta',
            2
        );
    });

    generarDatos();

    const tablas = [
        'categorias',
        'productos',
        'almacenes',
        'inventario',
        'movimientos',
        'usuarios'
    ];

    return tablas.map(tabla => ({
        tabla,
        registros: db.prepare(
            `SELECT COUNT(*) AS total FROM ${tabla}`
        ).get().total
    }));
}

function main() {
    const ruta = resolve(DB_PATH);

    mkdirSync(dirname(ruta), { recursive: true });

    const db = new Database(ruta);

    try {
        const resultado = seedDatabase(db);

        console.log('Dataset generado correctamente.');
        console.log(`Base de datos: ${ruta}`);

        console.table(resultado);

        const total = resultado.reduce(
            (suma, fila) => suma + fila.registros,
            0
        );

        console.log(`Total de registros: ${total}`);
    } finally {
        db.close();
    }
}

if (
    process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    main();
}