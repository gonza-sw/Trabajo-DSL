-- Consulta SQL parametrizada generada por SQL-INV equivalente a examples/consulta-js.js
-- Parámetros enlazados: [500, 'Lima', 'Arequipa', 0, 100]

SELECT categoria, SUM(cantidad) AS total_stock
FROM v_inventario
WHERE (precio < ? AND (almacen = ? OR (almacen = ? AND cantidad > ?)))
GROUP BY categoria
HAVING SUM(cantidad) > ?
ORDER BY total_stock DESC;