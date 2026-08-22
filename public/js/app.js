'use strict';

window.App = {
  user: null,
  _cleanups: [],
  _runnerIdx: 0,

  addCleanup(fn) { this._cleanups.push(fn); },

  _runCleanups() {
    this._cleanups.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
    this._cleanups = [];
  },

  // ---------- header / navigation ----------
  rerenderHeader() {
    const nav = document.getElementById('main-nav');
    const chip = document.getElementById('user-chip');
    const logoutBtn = document.getElementById('logout-btn');
    const langBtn = document.getElementById('lang-btn');
    const brand = document.getElementById('brand-link');

    const u = this.user;
    chip.hidden = !u;
    logoutBtn.hidden = !u;

    if (u) {
      chip.innerHTML = `<b>${U.esc(u.firstName)} ${U.esc(u.lastName)}</b>
        <span>${U.esc(u.role === 'admin' ? (I18N.lang() === 'th' ? 'ผู้ดูแลระบบ' : 'Administrator') : (I18N.lang() === 'th' ? 'ผู้เข้าสอบ' : 'Examinee'))}</span>`;
    }

    langBtn.textContent = I18N.lang() === 'th' ? 'EN' : 'ไทย';
    brand.setAttribute('href', u ? (u.role === 'admin' ? '#/admin' : '#/dashboard') : '#/login');

    let links = [];
    if (!u) {
      links = [];
    } else if (u.role === 'admin') {
      links = [
        ['#/admin', 'nav.admin'],
        ['#/admin/users', 'nav.users'],
        ['#/admin/items', 'nav.items'],
        ['#/admin/exams', 'nav.exams'],
        ['#/admin/scores', 'nav.scores'],
        ['#/admin/audit', 'nav.audit'],
      ];
    } else {
      links = [
        ['#/dashboard', 'nav.dashboard'],
        ['#/results', 'nav.results'],
        ['#/profile', 'nav.profile'],
      ];
    }
    const cur = location.hash || '#/';
    nav.innerHTML = links.map(([href, key]) =>
      `<a href="${href}" class="${cur.startsWith(href) ? 'active' : ''}">${I18N.t(key)}</a>`).join('');
  },

  // ---------- routing ----------
  routes() {
    const el = document.getElementById('app');
    return [
      { re: /^#\/login\/?$/, guest: true, go: () => ViewsAuth.renderLogin(el) },
      { re: /^#\/register\/?$/, guest: true, go: () => ViewsAuth.renderRegister(el) },

      { re: /^#\/dashboard\/?$/, role: 'any', go: () => ViewsStudent.renderDashboard(el) },
      { re: /^#\/exam\/(\d+)\/?$/, role: 'any', go: (m) => ViewsStudent.renderExam(el, Number(m[1])) },
      { re: /^#\/result\/(\d+)\/?$/, role: 'any', go: (m) => ViewsStudent.renderResult(el, Number(m[1])) },
      { re: /^#\/results\/?$/, role: 'any', go: () => ViewsStudent.renderResults(el) },
      { re: /^#\/profile\/?$/, role: 'any', go: () => ViewsStudent.renderProfile(el) },

      { re: /^#\/admin\/?$/, role: 'admin', go: () => ViewsAdmin.renderHome(el) },
      { re: /^#\/admin\/users\/?$/, role: 'admin', go: () => ViewsAdmin.renderUsers(el) },
      { re: /^#\/admin\/items\/?$/, role: 'admin', go: () => ViewsAdmin.renderItems(el) },
      { re: /^#\/admin\/exams\/?$/, role: 'admin', go: () => ViewsAdmin.renderExams(el) },
      { re: /^#\/admin\/exams\/(\d+)\/?$/, role: 'admin', go: (m) => ViewsAdmin.renderExamDetail(el, Number(m[1])) },
      { re: /^#\/admin\/scores\/?$/, role: 'admin', go: () => ViewsAdmin.renderScores(el) },
      { re: /^#\/admin\/audit\/?$/, role: 'admin', go: () => ViewsAdmin.renderAudit(el) },
    ];
  },

  route() {
    this._runCleanups();
    this.rerenderHeader();

    const hash = location.hash || '#/';
    const el = document.getElementById('app');
    const u = this.user;

    const redirectHome = () => {
      const home = !u ? '#/login' : u.role === 'admin' ? '#/admin' : '#/dashboard';
      if (location.hash !== home) { location.hash = home; return true; }
      return false;
    };

    if (!hash || hash === '#' || hash === '#/') { if (redirectHome()) return; }

    const table = this.routes();
    let match = null;
    for (const r of table) {
      const m = hash.match(r.re);
      if (m) { match = { def: r, m }; break; }
    }

    if (!match) { redirectHome(); return; }

    if (match.def.guest && u) { if (redirectHome()) return; }
    if (!match.def.guest && !u) { location.hash = '#/login'; return; }
    if (match.def.role === 'admin' && u && u.role !== 'admin') { location.hash = '#/dashboard'; return; }

    try {
      match.def.go(match.m);
    } catch (e) {
      console.error(e);
      el.innerHTML = `<div class="container"><div class="form-error">${U.esc(I18N.t('err.GENERIC'))}</div></div>`;
    }
  },

  async logout() {
    try { await API.post('/api/auth/logout'); } catch { /* ignore */ }
    this.user = null;
    U.toast(I18N.t('auth.logout'), 'ok');
    location.hash = '#/login';
    this.route();
  },

  // ---------- boot ----------
  async boot() {
    document.getElementById('lang-btn').addEventListener('click', () => I18N.toggle());
    document.getElementById('logout-btn').addEventListener('click', () => this.logout());
    window.addEventListener('hashchange', () => this.route());

    try {
      const r = await API.get('/api/me');
      this.user = r.user;
    } catch {
      this.user = null;
    }

    if (!location.hash) location.hash = '#/';
    this.route();
  },
};

document.addEventListener('DOMContentLoaded', () => App.boot());
