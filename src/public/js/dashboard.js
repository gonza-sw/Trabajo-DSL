// Dashboard: dos gráficos con Chart.js a partir de GET /api/dashboard.
//   stockByWarehouse -> barras      stockByCategory -> distribución (dona)
// La interfaz no calcula ni inventa datos: solo transforma [{label,value}] en series.

const PALETTE = ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

// [{label, value}] -> { labels, values }; descarta elementos mal formados.
export function toSeries(items) {
  const clean = (Array.isArray(items) ? items : []).filter((i) => i && typeof i.label === 'string' && Number.isFinite(Number(i.value)));
  return { labels: clean.map((i) => i.label), values: clean.map((i) => Number(i.value)) };
}

export function barConfig(series, label = 'Unidades en stock') {
  return {
    type: 'bar',
    data: { labels: series.labels, datasets: [{ label, data: series.values, backgroundColor: PALETTE[0] }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
  };
}

export function doughnutConfig(series) {
  return {
    type: 'doughnut',
    data: { labels: series.labels, datasets: [{ data: series.values, backgroundColor: series.labels.map((_, i) => PALETTE[i % PALETTE.length]) }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } },
  };
}

export function createDashboard({ doc, api, ChartCtor }) {
  const charts = {};
  const slots = [
    { key: 'stockByWarehouse', canvas: 'chart-warehouse', empty: 'empty-warehouse', config: (s) => barConfig(s) },
    { key: 'stockByCategory', canvas: 'chart-category', empty: 'empty-category', config: (s) => doughnutConfig(s) },
  ];
  const errorBox = () => doc.getElementById('dashboard-error');

  function destroy() {
    for (const k of Object.keys(charts)) { charts[k].destroy(); delete charts[k]; }
  }

  // Siempre vuelve a pedir los datos: tras cambiar de sesión los gráficos reflejan el nuevo alcance.
  async function load() {
    const box = errorBox();
    box.hidden = true;
    let data;
    try {
      data = await api.dashboard();
    } catch (e) {
      destroy();
      box.textContent = `${e.code ? `[${e.code}] ` : ''}${e.message || 'No se pudo cargar el dashboard'}`;
      box.hidden = false;
      slots.forEach((s) => { doc.getElementById(s.empty).hidden = true; });
      return null;
    }
    destroy();
    for (const slot of slots) {
      const series = toSeries(data[slot.key]);
      const canvas = doc.getElementById(slot.canvas);
      const empty = doc.getElementById(slot.empty);
      const hasData = series.values.length > 0;
      empty.hidden = hasData;
      canvas.hidden = !hasData;
      if (hasData) charts[slot.key] = new ChartCtor(canvas, slot.config(series));
    }
    return data;
  }

  return { load, destroy, charts };
}
