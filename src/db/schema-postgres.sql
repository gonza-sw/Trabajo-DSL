CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY,
    categoria_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    precio DOUBLE PRECISION NOT NULL CHECK (precio >= 0),
    stock_minimo INTEGER NOT NULL CHECK (stock_minimo >= 0),
    FOREIGN KEY (categoria_id) REFERENCES categorias(id)
);

CREATE TABLE IF NOT EXISTS almacenes (
    id INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    ciudad TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventario (
    id INTEGER PRIMARY KEY,
    producto_id INTEGER NOT NULL,
    almacen_id INTEGER NOT NULL,
    cantidad INTEGER NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
    FOREIGN KEY (producto_id) REFERENCES productos(id),
    FOREIGN KEY (almacen_id) REFERENCES almacenes(id),
    UNIQUE (producto_id, almacen_id)
);

CREATE TABLE IF NOT EXISTS movimientos (
    id INTEGER PRIMARY KEY,
    inventario_id INTEGER NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('ENTRADA', 'SALIDA')),
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    fecha TEXT NOT NULL,
    FOREIGN KEY (inventario_id) REFERENCES inventario(id)
);

CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    rol TEXT NOT NULL CHECK (rol IN ('admin', 'operario', 'consulta')),
    almacen_id INTEGER,
    FOREIGN KEY (almacen_id) REFERENCES almacenes(id),
    CHECK (
        (rol = 'admin' AND almacen_id IS NULL)
        OR
        (rol IN ('operario', 'consulta') AND almacen_id IS NOT NULL)
    )
);

CREATE OR REPLACE VIEW v_inventario AS
SELECT
    p.id AS producto_id,
    p.nombre AS producto,
    c.nombre AS categoria,
    a.id AS almacen_id,
    a.nombre AS almacen,
    a.ciudad AS ciudad,
    i.cantidad AS cantidad,
    p.precio AS precio,
    p.stock_minimo AS stock_minimo
FROM inventario i
INNER JOIN productos p ON i.producto_id = p.id
INNER JOIN categorias c ON p.categoria_id = c.id
INNER JOIN almacenes a ON i.almacen_id = a.id;

CREATE OR REPLACE VIEW v_movimientos AS
SELECT
    m.id AS movimiento_id,
    p.nombre AS producto,
    c.nombre AS categoria,
    a.id AS almacen_id,
    a.nombre AS almacen,
    m.tipo AS tipo,
    m.cantidad AS cantidad,
    m.fecha AS fecha
FROM movimientos m
INNER JOIN inventario i ON m.inventario_id = i.id
INNER JOIN productos p ON i.producto_id = p.id
INNER JOIN categorias c ON p.categoria_id = c.id
INNER JOIN almacenes a ON i.almacen_id = a.id;