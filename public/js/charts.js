'use strict';

window.Charts = (function () {
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  const PALETTE = ['#3556e0', '#178a50', '#b26a00', '#c2373c', '#7a3cc9', '#0e7490'];

  // values: numbers; labels: strings
  function bar(labels, values, opts = {}) {
    if (!values.length) return `<div class="chart-empty">${esc(opts.empty || '—')}</div>`;
    const W = opts.width || 640;
    const rowH = 30;
    const padL = Math.min(220, Math.max(...labels.map((l) => l.length)) * 7 + 20);
    const H = values.length * rowH + 16;
    const max = Math.max(...values, 1);
    const unit = opts.unit || '';
    let out = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
    values.forEach((v, i) => {
      const y = i * rowH + 8;
      const w = Math.max(2, (W - padL - 70) * (v / max));
      const color = PALETTE[i % PALETTE.length];
      out += `<text x="${padL - 8}" y="${y + 15}" text-anchor="end" font-size="12" fill="#44506b">${esc(labels[i].slice(0, 34))}</text>`;
      out += `<rect x="${padL}" y="${y + 3}" width="${w}" height="18" rx="5" fill="${color}"></rect>`;
      out += `<text x="${padL + w + 6}" y="${y + 17}" font-size="12" fill="#1c2434" font-weight="600">${opts.fmt ? opts.fmt(v) : v}${unit}</text>`;
    });
    out += '</svg>';
    return out;
  }

  // points: [{label, value}]
  function line(points, opts = {}) {
    if (!points.length) return `<div class="chart-empty">${esc(opts.empty || '—')}</div>`;
    const W = opts.width || 680;
    const H = 240;
    const pad = { l: 46, r: 20, t: 18, b: 44 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const maxV = opts.max != null ? opts.max : Math.max(...points.map((p) => p.value), 10);
    const stepX = points.length > 1 ? iw / (points.length - 1) : 0;

    let path = '';
    let dots = '';
    let grid = '';
    for (let g = 0; g <= 4; g++) {
      const gy = pad.t + ih - (ih * g) / 4;
      const gv = Math.round((maxV * g) / 4);
      grid += `<line x1="${pad.l}" y1="${gy}" x2="${W - pad.r}" y2="${gy}" stroke="#e3e8f2"></line>`;
      grid += `<text x="${pad.l - 8}" y="${gy + 4}" font-size="11" fill="#8892aa" text-anchor="end">${gv}</text>`;
    }
    points.forEach((p, i) => {
      const x = pad.l + stepX * i;
      const y = pad.t + ih - (p.value / maxV) * ih;
      path += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)} `;
      dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#3556e0"><title>${esc(p.label)}: ${p.value}</title></circle>`;
      dots += `<text x="${x.toFixed(1)}" y="${H - 22}" font-size="11" fill="#44506b" text-anchor="middle">${esc(String(p.label).slice(0, 14))}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}">${grid}<path d="${path}" fill="none" stroke="#3556e0" stroke-width="2.5" stroke-linejoin="round"/>${dots}</svg>`;
  }

  // slices: [{label, value}]
  function pie(slices, opts = {}) {
    const total = slices.reduce((s, x) => s + x.value, 0);
    if (!total) return `<div class="chart-empty">${esc(opts.empty || '—')}</div>`;
    const cx = 110, cy = 110, r = 86;
    let angle = -Math.PI / 2;
    let paths = '';
    slices.forEach((s, i) => {
      const frac = s.value / total;
      const a2 = angle + frac * Math.PI * 2;
      const large = frac > 0.5 ? 1 : 0;
      const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
      if (frac >= 0.9999) {
        paths += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${PALETTE[i % PALETTE.length]}"><title>${esc(s.label)}: ${s.value}</title></circle>`;
      } else if (frac > 0.0001) {
        paths += `<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z"
          fill="${PALETTE[i % PALETTE.length]}"><title>${esc(s.label)}: ${s.value}</title></path>`;
      }
      angle = a2;
    });
    let legend = '<g>';
    slices.forEach((s, i) => {
      const ly = 24 + i * 24;
      legend += `<rect x="238" y="${ly - 10}" width="13" height="13" rx="3" fill="${PALETTE[i % PALETTE.length]}"></rect>`;
      legend += `<text x="258" y="${ly + 1}" font-size="12.5" fill="#333f58">${esc(s.label)} — ${s.value}</text>`;
    });
    legend += '</g>';
    return `<svg viewBox="0 0 520 230">${paths}${legend}</svg>`;
  }

  return { bar, line, pie };
})();
