// Modo desarrollo: con ?mock=1 la interfaz usa respuestas simuladas del contrato
// (sesión, esquema, consulta) para trabajar sin backend. En el modo normal NO se usa.

export const MOCK_USER = { id: 1, username: 'admin', rol: 'admin', almacen_id: null };

export const MOCK_SCHEMA = {
  success: true,
  sources: [
    { name: 'v_inventario', fields: [
      { name: 'producto_id', type: 'integer' }, { name: 'producto', type: 'text' },
      { name: 'categoria', type: 'text' }, { name: 'almacen_id', type: 'integer' },
      { name: 'almacen', type: 'text' }, { name: 'ciudad', type: 'text' },
      { name: 'cantidad', type: 'integer' }, { name: 'precio', type: 'real' },
      { name: 'stock_minimo', type: 'integer' },
    ] },
    { name: 'v_movimientos', fields: [
      { name: 'movimiento_id', type: 'integer' }, { name: 'producto', type: 'text' },
      { name: 'categoria', type: 'text' }, { name: 'almacen_id', type: 'integer' },
      { name: 'almacen', type: 'text' }, { name: 'tipo', type: 'text' },
      { name: 'cantidad', type: 'integer' }, { name: 'fecha', type: 'text' },
    ] },
  ],
};

export function createMockApi() {
  return {
    login: async () => ({ success: true, user: MOCK_USER }),
    logout: async () => ({ success: true }),
    me: async () => ({ success: true, user: MOCK_USER }),
    schema: async () => MOCK_SCHEMA,
    query: async (ast) => ({
      success: true,
      sql: `SELECT ... FROM ${ast.source}`,
      params: [],
      columns: ast.select.map((s) => s.alias ?? s.field),
      rows: [],
      rowCount: 0,
    }),
    dashboard: async () => ({ success: true, stockByWarehouse: [], stockByCategory: [] }),
  };
}

// Elige la API real o la simulada según el parámetro ?mock=1 de la URL.
export async function selectApi(win, createApi) {
  const wantsMock = new URLSearchParams(win.location.search).get('mock') === '1';
  if (wantsMock) return createMockApi();
  return createApi({
    onUnauthorized: () => win.location.assign('/login.html'),
  });
}
