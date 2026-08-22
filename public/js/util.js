'use strict';

window.U = {
  esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    const lang = window.I18N ? I18N.lang() : 'th';
    return d.toLocaleString(lang === 'en' ? 'en-GB' : 'th-TH', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  },

  fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    const lang = window.I18N ? I18N.lang() : 'th';
    return d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
  },

  pad(n) { return String(n).padStart(2, '0'); },

  fmtSeconds(total) {
    total = Math.max(0, Math.floor(total));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? `${h}:${this.pad(m)}:${this.pad(s)}` : `${this.pad(m)}:${this.pad(s)}`;
  },

  countdownParts(ms) {
    ms = Math.max(0, ms);
    return {
      d: Math.floor(ms / 86400000),
      h: Math.floor((ms % 86400000) / 3600000),
      m: Math.floor((ms % 3600000) / 60000),
      s: Math.floor((ms % 60000) / 1000),
    };
  },

  download(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 400);
  },

  csvString(headers, rows) {
    const qcell = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers.map(qcell).join(',')];
    for (const r of rows) lines.push(r.map(qcell).join(','));
    return '\ufeff' + lines.join('\r\n');
  },

  exportCSV(filename, headers, rows) {
    this.download(filename.endsWith('.csv') ? filename : filename + '.csv',
      new Blob([this.csvString(headers, rows)], { type: 'text/csv;charset=utf-8' }));
  },

  xlsString(title, headers, rows) {
    const escHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>`;
    html += `<h3>${escHtml(title)}</h3><table border="1"><thead><tr>`;
    headers.forEach((h) => { html += `<th style="background:#dfe6f5">${escHtml(h)}</th>`; });
    html += '</tr></thead><tbody>';
    rows.forEach((r) => {
      html += '<tr>';
      r.forEach((c) => {
        const numeric = typeof c === 'number';
        html += `<td${numeric ? ' style="mso-number-format:\'0.0\\0\'"' : ''}>${escHtml(c)}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table></body></html>';
    return '\ufeff' + html;
  },

  exportXLS(filename, title, headers, rows) {
    this.download(filename.endsWith('.xls') ? filename : filename + '.xls',
      new Blob([this.xlsString(title, headers, rows)], { type: 'application/vnd.ms-excel;charset=utf-8' }));
  },

  toast(msg, type = '') {
    const wrap = document.getElementById('toast-wrap');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  },

  modal(html, opts = {}) {
    const root = document.getElementById('modal-root');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''}">${html}</div>`;
    root.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay && !opts.locked) close(); });
    overlay.querySelectorAll('[data-close-modal]').forEach((b) => b.addEventListener('click', close));
    return { el: overlay, close };
  },

  confirm(msg, onYes, yesLabel) {
    const lang = I18N.lang();
    const m = this.modal(`
      <div class="modal-body" style="font-size:15px">${U.esc(msg)}</div>
      <div class="modal-foot">
        <button class="btn btn-outline" data-close-modal>${I18N.t('cancel')}</button>
        <button class="btn btn-danger" id="cf-yes">${U.esc(yesLabel || I18N.t('confirm'))}</button>
      </div>`);
    m.el.querySelector('#cf-yes').addEventListener('click', () => { m.close(); onYes(); });
    void lang;
  },
};
