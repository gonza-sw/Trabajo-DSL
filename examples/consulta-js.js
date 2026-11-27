/**
 * Implementación imperativa en JavaScript puro equivalente a la consulta
 * avanzada del contrato SQL-INV sobre v_inventario.
 */
export function ejecutarConsultaImperativa(registrosInventario) {
  if (!Array.isArray(registrosInventario)) {
    throw new TypeError("Se esperaba un arreglo de registros de inventario.");
  }

  // 1. Filtrado equivalente a:
  // WHERE precio < 500 AND (almacen = 'Lima' OR (almacen = 'Arequipa' AND cantidad > 0))
  const filtrados = [];
  for (let i = 0; i < registrosInventario.length; i += 1) {
    const fila = registrosInventario[i];
    const cumplePrecio = typeof fila.precio === "number" && fila.precio < 500;
    const esLima = fila.almacen === "Lima";
    const esArequipaConStock = fila.almacen === "Arequipa" && fila.cantidad > 0;

    if (cumplePrecio && (esLima || esArequipaConStock)) {
      filtrados.push(fila);
    }
  }

  // 2. Agrupación y suma equivalente a:
  // SELECT categoria, SUM(cantidad) AS total_stock ... GROUP BY categoria
  const acumuladorPorCategoria = new Map();
  for (const item of filtrados) {
    const categoria = item.categoria;
    const cantidadActual = acumuladorPorCategoria.get(categoria) ?? 0;
    const sumaParcial = cantidadActual + Number(item.cantidad || 0);
    acumuladorPorCategoria.set(categoria, sumaParcial);
  }

  // 3. Filtro de grupos equivalente a:
  // HAVING SUM(cantidad) > 100
  const gruposFiltrados = [];
  for (const [categoria, totalStock] of acumuladorPorCategoria.entries()) {
    if (totalStock > 100) {
      gruposFiltrados.push({
        categoria,
        total_stock: totalStock,
      });
    }
  }

  // 4. Ordenamiento equivalente a:
  // ORDER BY total_stock DESC
  gruposFiltrados.sort((a, b) => {
    if (b.total_stock !== a.total_stock) {
      return b.total_stock - a.total_stock;
    }
    return a.categoria.localeCompare(b.categoria);
  });

  return gruposFiltrados;
}
