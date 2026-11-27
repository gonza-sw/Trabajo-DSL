// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { toSeries, barConfig, doughnutConfig, createDashboard, readTheme } from '../../src/public/js/dashboard.js';
import { ApiError } from '../../src/public/js/api.js';

const page = () => {
  document.body.innerHTML = `
    <p id="dashboard-error" hidden></p>
    <canvas id="chart-warehouse"></canvas><p id="empty-warehouse" hidden></p>
    <canvas id="chart-category"></canvas><p id="empty-category" hidden></p>`;
};

// Doble de Chart.js: registra qué se dibuja y si se destruyó.
function fakeChart() {
  const instances = [];
  class FakeChart {
    constructor(canvas, config) { this.canvas = canvas; this.config = config; this.destroyed = false; instances.push(this); }
    destroy() { this.destroyed = true; }
  }
  return { FakeChart, instances };
}

const admin = {
  success: true,
  stockByWarehouse: [{ label: 'Lima', value: 900 }, { label: 'Arequipa', value: 450 }, { label: 'Trujillo', value: 300 }],
  stockByCategory: [{ label: 'Computadoras', value: 700 }, { label: 'Accesorios', value: 950 }],
};
const operario = {
  success: true,
  stockByWarehouse: [{ label: 'Lima', value: 900 }],
  stockByCategory: [{ label: 'Computadoras', value: 400 }],
};

describe('transformación de series', () => {
  it('convierte [{label,value}] en etiquetas y valores numéricos', () => {
    expect(toSeries([{ label: 'A', value: 3 }, { label: 'B', value: '4.5' }])).toEqual({ labels: ['A', 'B'], values: [3, 4.5] });
  });

  it('descarta elementos mal formados y tolera entradas no válidas', () => {
    expect(toSeries([{ label: 'A', value: 1 }, { label: 5, value: 2 }, { label: 'C', value: 'x' }, null, {}])).toEqual({ labels: ['A'], values: [1] });
    expect(toSeries(undefined)).toEqual({ labels: [], values: [] });
    expect(toSeries('texto')).toEqual({ labels: [], values: [] });
  });

  it('barras para almacenes y dona para categorías, con los datos de la serie', () => {
    const s = toSeries(admin.stockByWarehouse);
    const bar = barConfig(s);
    expect(bar.type).toBe('bar');
    expect(bar.data.labels).toEqual(['Lima', 'Arequipa', 'Trujillo']);
    expect(bar.data.datasets[0].data).toEqual([900, 450, 300]);
    const dn = doughnutConfig(toSeries(admin.stockByCategory));
    expect(dn.type).toBe('doughnut');
    expect(dn.data.datasets[0].backgroundColor).toHaveLength(2);
  });
});

describe('dashboard con la API', () => {
  beforeEach(page);

  it('dibuja los dos gráficos con los datos de la API', async () => {
    const { FakeChart, instances } = fakeChart();
    const dash = createDashboard({ doc: document, api: { dashboard: async () => admin }, ChartCtor: FakeChart });
    await dash.load();
    expect(instances).toHaveLength(2);
    expect(instances[0].canvas.id).toBe('chart-warehouse');
    expect(instances[0].config.data.datasets[0].data).toEqual([900, 450, 300]);
    expect(instances[1].canvas.id).toBe('chart-category');
    expect(instances[1].config.data.labels).toEqual(['Computadoras', 'Accesorios']);
  });

  it('cambio de sesión: al recargar destruye los gráficos previos y muestra el nuevo alcance', async () => {
    const { FakeChart, instances } = fakeChart();
    let current = admin;
    const dash = createDashboard({ doc: document, api: { dashboard: async () => current }, ChartCtor: FakeChart });
    await dash.load();
    current = operario; // otro usuario con menos alcance
    await dash.load();
    expect(instances).toHaveLength(4);
    expect(instances[0].destroyed).toBe(true);
    expect(instances[1].destroyed).toBe(true);
    expect(instances[2].config.data.labels).toEqual(['Lima']); // solo su almacén
    expect(instances[2].destroyed).toBe(false);
    expect(Object.keys(dash.charts)).toHaveLength(2);
  });

  it('los textos y la rejilla usan los colores del tema activo', async () => {
    document.documentElement.style.setProperty('--text', '#e7edf5');
    document.documentElement.style.setProperty('--border', '#2b3441');
    expect(readTheme(document)).toEqual({ text: '#e7edf5', grid: '#2b3441' });
    const { FakeChart, instances } = fakeChart();
    await createDashboard({ doc: document, api: { dashboard: async () => admin }, ChartCtor: FakeChart }).load();
    expect(instances[0].config.options.scales.y.ticks.color).toBe('#e7edf5');
    expect(instances[0].config.options.scales.x.grid.color).toBe('#2b3441');
    expect(instances[1].config.options.plugins.legend.labels.color).toBe('#e7edf5');
    document.documentElement.removeAttribute('style');
  });

  it('series vacías: no se dibuja el gráfico y se muestra el mensaje', async () => {
    const { FakeChart, instances } = fakeChart();
    const api = { dashboard: async () => ({ success: true, stockByWarehouse: [], stockByCategory: [{ label: 'X', value: 1 }] }) };
    await createDashboard({ doc: document, api, ChartCtor: FakeChart }).load();
    expect(instances).toHaveLength(1);
    expect(document.getElementById('empty-warehouse').hidden).toBe(false);
    expect(document.getElementById('chart-warehouse').hidden).toBe(true);
    expect(document.getElementById('empty-category').hidden).toBe(true);
  });

  it('error de la API: muestra el mensaje como texto y limpia los gráficos', async () => {
    const { FakeChart, instances } = fakeChart();
    let fail = false;
    const api = { dashboard: async () => { if (fail) throw new ApiError('FORBIDDEN', '<i>Sin permiso</i>', 403); return admin; } };
    const dash = createDashboard({ doc: document, api, ChartCtor: FakeChart });
    await dash.load();
    fail = true;
    expect(await dash.load()).toBeNull();
    const box = document.getElementById('dashboard-error');
    expect(box.hidden).toBe(false);
    expect(box.textContent).toBe('[FORBIDDEN] <i>Sin permiso</i>');
    expect(box.querySelector('i')).toBeNull();
    expect(instances.every((c) => c.destroyed)).toBe(true);
    expect(Object.keys(dash.charts)).toHaveLength(0);
  });

  it('una recarga exitosa oculta el error anterior', async () => {
    const { FakeChart } = fakeChart();
    let fail = true;
    const api = { dashboard: async () => { if (fail) throw new ApiError('X', 'caída', 500); return admin; } };
    const dash = createDashboard({ doc: document, api, ChartCtor: FakeChart });
    await dash.load();
    fail = false;
    await dash.load();
    expect(document.getElementById('dashboard-error').hidden).toBe(true);
  });

  it('no inventa datos: solo usa lo que devuelve api.dashboard', async () => {
    const { FakeChart, instances } = fakeChart();
    const dashboard = vi.fn().mockResolvedValue({ success: true, stockByWarehouse: [{ label: 'Solo', value: 7 }], stockByCategory: [] });
    await createDashboard({ doc: document, api: { dashboard }, ChartCtor: FakeChart }).load();
    expect(dashboard).toHaveBeenCalledTimes(1);
    expect(instances[0].config.data.datasets[0].data).toEqual([7]);
    expect(instances).toHaveLength(1);
  });
});
