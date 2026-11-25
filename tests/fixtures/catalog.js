// Catálogo de prueba independiente de la base de demostración (formato de GET /api/schema).
export const ADMIN_CATALOG = {
  success: true,
  sources: [
    { name: 'v_inventario', fields: [
      { name: 'producto', type: 'text' }, { name: 'categoria', type: 'text' },
      { name: 'almacen_id', type: 'integer' }, { name: 'almacen', type: 'text' },
      { name: 'cantidad', type: 'integer' }, { name: 'precio', type: 'real' },
    ] },
    { name: 'v_movimientos', fields: [
      { name: 'producto', type: 'text' }, { name: 'categoria', type: 'text' },
      { name: 'almacen', type: 'text' }, { name: 'tipo', type: 'text' },
      { name: 'cantidad', type: 'integer' }, { name: 'fecha', type: 'text' },
    ] },
  ],
};

// Rol "consulta": solo ve inventario.
export const CONSULTA_CATALOG = { success: true, sources: [ADMIN_CATALOG.sources[0]] };
