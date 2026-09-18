/* =============================================================================
   charts.js — hand-written SVG charts. No CDN chart library is used because the
   Content-Security-Policy only allows scripts from this origin.
   ========================================================================== */

/* Wrapped in an IIFE: every page script is a classic (non-module) script, so
   top-level `const` declarations share one global lexical scope and would
   otherwise collide with the same names in core.js. */
(function () {


const { esc, money } = window.SUQ;

function niceMax(value) {
  const v = Math.max(1, Number(value) || 0);
  const mag = 10 ** Math.floor(Math.log10(v));
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10];
  for (const s of steps) if (v <= s * mag) return s * mag;
  return 10 * mag;
}

function shortNum(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return `${(v / 1e6).toFixed(0)}M`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e5) return `${(v / 1e3).toFixed(0)}k`;
  if (Math.abs(v) >= 1000) return `${(v / 1e3).toFixed(1)}k`;
  return String(Math.round(v));
}

/**
 * Area + line trend chart.
 * points: [{ label, value }]
 */
function lineChart(points, opts = {}) {
  const data = (points || []).map((p) => ({ label: String(p.label ?? ''), value: Number(p.value) || 0 }));
  if (!data.length) return '<p class="muted tiny">No data for this period yet.</p>';
  const w = opts.width || 680;
  const h = opts.height || 240;
  const pad = { t: 16, r: 14, b: 30, l: 46 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const stepX = data.length > 1 ? iw / (data.length - 1) : 0;
  const x = (i) => pad.l + (data.length > 1 ? i * stepX : iw / 2);
  const y = (v) => pad.t + ih - (v / max) * ih;

  /* One data point is not a trend. Drawing it as a line chart leaves a single
     dot floating in an empty grid, which reads as a rendering fault. Instead
     draw a level marker across the plot and say why below the chart. */
  const single = data.length === 1;
  const line = single
    ? `M${pad.l},${y(data[0].value).toFixed(1)} L${(w - pad.r).toFixed(1)},${y(data[0].value).toFixed(1)}`
    : data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const area = single
    ? `${line} L${(w - pad.r).toFixed(1)},${(pad.t + ih).toFixed(1)} L${pad.l},${(pad.t + ih).toFixed(1)} Z`
    : `${line} L${x(data.length - 1).toFixed(1)},${(pad.t + ih).toFixed(1)} L${x(0).toFixed(1)},${(pad.t + ih).toFixed(1)} Z`;
  const gridCount = 4;
  const grid = Array.from({ length: gridCount + 1 }, (_, i) => {
    const value = (max / gridCount) * i;
    const gy = y(value).toFixed(1);
    return `<line class="ch-grid" x1="${pad.l}" y1="${gy}" x2="${w - pad.r}" y2="${gy}"></line>
            <text class="ch-axis" x="${pad.l - 8}" y="${gy}" text-anchor="end" dominant-baseline="middle">${shortNum(value)}</text>`;
  }).join('');

  const everyN = Math.ceil(data.length / (opts.maxLabels || 7));
  const labels = data.map((d, i) => (i % everyN === 0 || i === data.length - 1
    ? `<text class="ch-axis" x="${x(i).toFixed(1)}" y="${h - 8}" text-anchor="middle">${esc(d.label)}</text>` : '')).join('');

  const dots = data.map((d, i) => `<circle class="ch-dot" cx="${x(i).toFixed(1)}" cy="${y(d.value).toFixed(1)}" r="3.4">
      <title>${esc(d.label)}: ${esc(opts.currency ? money(d.value, opts.currency) : String(d.value))}</title></circle>`).join('');

  const gid = `grad-${Math.random().toString(36).slice(2, 8)}`;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(opts.title || 'Trend chart')}" preserveAspectRatio="none">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--chart-fill-top)"></stop>
      <stop offset="100%" stop-color="var(--chart-fill-bottom)"></stop>
    </linearGradient></defs>
    ${grid}
    <path class="ch-area" d="${area}" fill="url(#${gid})"></path>
    <path class="ch-line" d="${line}"></path>
    ${dots}${labels}
  </svg>${single ? `<p class="chart-single-note">Showing ${esc(data[0].label)} only. A trend line appears once there are at least two periods of data.</p>` : ''}`;
}

/**
 * Vertical bar chart. bars: [{ label, value, tone? }]
 */
function barChart(bars, opts = {}) {
  const data = (bars || []).map((b) => ({ label: String(b.label ?? ''), value: Number(b.value) || 0, tone: b.tone || '' }));
  if (!data.length) return '<p class="muted tiny">No data for this period yet.</p>';
  const w = opts.width || 680;
  const h = opts.height || 240;
  const pad = { t: 16, r: 14, b: 34, l: 46 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const slot = iw / data.length;
  const bw = Math.min(46, slot * 0.58);
  const grid = Array.from({ length: 5 }, (_, i) => {
    const value = (max / 4) * i;
    const gy = (pad.t + ih - (value / max) * ih).toFixed(1);
    return `<line class="ch-grid" x1="${pad.l}" y1="${gy}" x2="${w - pad.r}" y2="${gy}"></line>
            <text class="ch-axis" x="${pad.l - 8}" y="${gy}" text-anchor="end" dominant-baseline="middle">${shortNum(value)}</text>`;
  }).join('');
  const items = data.map((d, i) => {
    const bh = Math.max(d.value > 0 ? 2 : 0, (d.value / max) * ih);
    const bx = pad.l + slot * i + (slot - bw) / 2;
    const by = pad.t + ih - bh;
    const label = String(d.label).length > 12 ? `${String(d.label).slice(0, 11)}…` : d.label;
    return `<g><rect class="ch-bar ${d.tone ? `ch-bar-${d.tone}` : ''}" x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="5">
        <title>${esc(d.label)}: ${esc(opts.currency ? money(d.value, opts.currency) : String(d.value))}</title></rect>
      <text class="ch-axis" x="${(bx + bw / 2).toFixed(1)}" y="${h - 10}" text-anchor="middle">${esc(label)}</text></g>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(opts.title || 'Bar chart')}" preserveAspectRatio="none">
    ${grid}${items}</svg>`;
}

/**
 * Donut chart. slices: [{ label, value, color }]
 */
function donutChart(slices, opts = {}) {
  const data = (slices || []).filter((s) => Number(s.value) > 0)
    .map((s) => ({ label: String(s.label ?? ''), value: Number(s.value), color: s.color || 'var(--green-600)' }));
  const total = data.reduce((sum, s) => sum + s.value, 0);
  if (!total) return `<div class="donut-empty">${esc(opts.emptyText || 'No data yet')}</div>`;
  const size = opts.size || 180;
  const stroke = opts.stroke || 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = data.map((s) => {
    const len = (s.value / total) * c;
    const seg = `<circle class="ch-arc" cx="${size / 2}" cy="${size / 2}" r="${r.toFixed(2)}"
      stroke="${s.color}" stroke-width="${stroke}" fill="none"
      stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}"
      stroke-dashoffset="${(-offset).toFixed(2)}" stroke-linecap="butt">
      <title>${esc(s.label)}: ${s.value} (${Math.round((s.value / total) * 100)}%)</title></circle>`;
    offset += len;
    return seg;
  }).join('');
  const center = opts.centerValue !== undefined
    ? `<text class="ch-center-value" x="${size / 2}" y="${size / 2 - 2}" text-anchor="middle">${esc(opts.centerValue)}</text>
       <text class="ch-center-label" x="${size / 2}" y="${size / 2 + 18}" text-anchor="middle">${esc(opts.centerLabel || '')}</text>`
    : '';
  const legend = opts.legend === false ? '' : `<ul class="chart-legend">${data.map((s) => `
      <li><span class="dot" style="background:${s.color}"></span>${esc(s.label)}
      <strong>${opts.currency ? esc(money(s.value, opts.currency)) : s.value}</strong></li>`).join('')}</ul>`;
  return `<div class="donut-wrap"><svg class="donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"
      role="img" aria-label="${esc(opts.title || 'Distribution chart')}">
      <g transform="rotate(-90 ${size / 2} ${size / 2})">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r.toFixed(2)}" stroke="var(--chart-track)" stroke-width="${stroke}" fill="none"></circle>
        ${arcs}
      </g>${center}</svg>${legend}</div>`;
}

/** Horizontal proportion bars — good for "by method" / "by course" breakdowns. */
function hBars(rows, opts = {}) {
  const data = (rows || []).map((r) => ({ label: String(r.label ?? ''), value: Number(r.value) || 0, meta: r.meta || '' }));
  if (!data.length) return '<p class="muted tiny">Nothing recorded yet.</p>';
  const max = Math.max(...data.map((d) => d.value)) || 1;
  return `<ul class="hbars">${data.map((d) => `
    <li><div class="hbar-head"><span>${esc(d.label)}</span>
      <strong>${opts.currency ? esc(money(d.value, opts.currency)) : esc(String(d.value))}${d.meta ? ` <span class="muted tiny">${esc(d.meta)}</span>` : ''}</strong></div>
      <div class="hbar-track"><span class="hbar-fill" style="width:${((d.value / max) * 100).toFixed(1)}%"></span></div></li>`).join('')}</ul>`;
}

/** Tiny inline sparkline for stat cards. */
function sparkline(values, opts = {}) {
  const data = (values || []).map(Number).filter((n) => Number.isFinite(n));
  if (data.length < 2) return '';
  const w = opts.width || 96;
  const h = opts.height || 28;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const path = data.map((v, i) => `${i ? 'L' : 'M'}${((i / (data.length - 1)) * w).toFixed(1)},${(h - ((v - min) / span) * (h - 4) - 2).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${path}"></path></svg>`;
}

window.SUQCharts = { lineChart, barChart, donutChart, hBars, sparkline, shortNum };
})();
