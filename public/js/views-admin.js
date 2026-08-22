'use strict';

window.ViewsAdmin = {
  toLocalInput(iso) {
    const d = new Date(iso || Date.now());
    return `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}T${U.pad(d.getHours())}:${U.pad(d.getMinutes())}`;
  },
  fromLocalInput(v) {
    const d = new Date(v);
    return isNaN(d) ? null : d.toISOString();
  },

  // ================= overview =================
  async renderHome(el) {
    el.innerHTML = `<div class="container"><div class="page-loading">${I18N.t('loading')}</div></div>`;
    let st;
    try { st = await API.get('/api/admin/stats'); }
    catch (e) { U.toast(e.message, 'err'); el.querySelector('.page-loading').textContent = e.message; return; }

    const cards = [
      ['admin.stats.users', st.usersTotal], ['admin.stats.students', st.studentsActive],
      ['admin.stats.items', st.itemsActive], ['admin.stats.published', st.examsPublished],
      ['admin.stats.attempts', st.attemptsSubmitted], ['admin.stats.avg', st.meanPercent],
      ['admin.inProgress||การทำสอบขณะนี้|In progress now', st.attemptsInProgress],
      ['admin.pendingUsers||รอยืนยัน OTP|Pending OTP', st.pendingUsers],
    ];
    const cardHtml = ([key, val]) => {
      const [kth, ken] = key.split('||');
      const lbl = I18N.lang() === 'en' ? (ken || kth) : kth;
      return `<div class="card stat-card accent"><div class="num">${val}</div><div class="lbl">${U.esc(lbl)}</div></div>`;
    };

    el.innerHTML = `
      <div class="container">
        <div class="page-head">
          <h1>${I18N.t('nav.admin')}</h1>
          <span class="badge progress">🛰 ${I18N.lang() === 'th' ? 'ควบคุมสิทธิ์และติดตามระบบแบบเรียลไทม์' : 'Access control & real-time monitoring'}</span>
        </div>
        <div class="grid grid-4 mb-16">${cards.map(cardHtml).join('')}</div>
        ${st.pendingUsers > 0 ? `
          <div class="demo-note mb-16" style="cursor:pointer" id="pending-go">
            ${I18N.t('admin.pendingAlert', { n: st.pendingUsers })}
          </div>` : ''}
        <div class="section-block"><h2>${I18N.lang() === 'th' ? 'โมดูลระบบ (5 ส่วน)' : 'System modules (5 parts)'}</h2>
          <div class="grid grid-2">
            <a class="card card-pad exam-card" href="#/admin/items" style="text-decoration:none;color:inherit">
              <h3>📦 2 · ${I18N.t('items.title')}</h3><div class="exam-desc">${st.itemsActive} ${I18N.lang() === 'th' ? 'ข้อในคลัง' : 'items in bank'}</div></a>
            <a class="card card-pad exam-card" href="#/admin/exams" style="text-decoration:none;color:inherit">
              <h3>🗂 2–3 · ${I18N.t('exams.title')}</h3><div class="exam-desc">${st.examsPublished} / ${st.examsTotal} ${I18N.lang() === 'th' ? 'เผยแพร่แล้ว' : 'published'}</div></a>
            <a class="card card-pad exam-card" href="#/admin/scores" style="text-decoration:none;color:inherit">
              <h3>📊 4–5 · ${I18N.t('scores.title')}</h3><div class="exam-desc">${I18N.lang() === 'th' ? 'กราฟ · อันดับ · ส่งออก CSV/Excel/PDF' : 'Charts · ranking · CSV/Excel/PDF export'}</div></a>
            <a class="card card-pad exam-card" href="#/admin/users" style="text-decoration:none;color:inherit">
              <h3>👥 1 · User Management</h3><div class="exam-desc">${st.usersTotal} ${I18N.lang() === 'th' ? 'บัญชี · Authentication/Authorization' : 'accounts · AuthN/AuthZ'}</div></a>
          </div>
        </div>
      </div>`;

    const pg = document.getElementById('pending-go');
    if (pg) pg.addEventListener('click', () => { location.hash = '#/admin/users'; });
  },

  // ================= users =================
  async renderUsers(el) {
    const wrap = document.createElement('div');
    wrap.className = 'container';
    wrap.innerHTML = `<div class="page-loading">${I18N.t('loading')}</div>`;
    el.appendChild(wrap);

    async function load(search = '') {
      const r = await API.get(`/api/admin/users?q=${encodeURIComponent(search)}`);
      const rows = r.users.map((u) => `
        <tr>
          <td><b>${U.esc(u.username)}</b></td>
          <td>${U.esc(u.firstName)} ${U.esc(u.lastName)}</td>
          <td class="muted small">${U.esc(u.org || '—')}</td>
          <td><span class="badge ${u.role}">${U.esc(u.role)}</span></td>
          <td><span class="badge ${u.status}">${U.esc(u.status)}</span></td>
          <td class="num-cell small">${U.fmtDateTime(u.lastLoginAt)}</td>
          <td><div class="row-actions">
            ${u.status === 'pending' ? `<button class="btn btn-primary btn-sm" data-act="activate" data-id="${u.id}">${I18N.t('users.activate')}</button>` : ''}
            ${u.status !== 'pending' ? `<button class="icon-btn" data-act="toggle" data-id="${u.id}" title="${u.status === 'active' ? I18N.t('users.disable') : I18N.t('users.enable')}">${u.status === 'active' ? '⛔' : '✅'}</button>` : ''}
            <button class="icon-btn" data-act="edit" data-id="${u.id}" title="${I18N.t('edit')}">✏️</button>
            <button class="icon-btn" data-act="pw" data-id="${u.id}" title="${I18N.t('users.resetPw')}">🔑</button>
            <button class="icon-btn" data-act="del" data-id="${u.id}" title="${I18N.t('delete')}">🗑</button>
          </div></td>
        </tr>`).join('');
      wrap.innerHTML = `
        <div class="page-head">
          <h1>User Management</h1>
          <div class="head-actions">
            <input class="input" id="u-search" placeholder="${I18N.t('search')}" value="${U.esc(search)}"/>
            <button class="btn btn-outline" id="u-go">🔍</button>
            <button class="btn btn-primary" id="u-add">＋ ${I18N.t('users.addUser')}</button>
          </div>
        </div>
        <div class="card table-wrap"><table class="data">
          <thead><tr><th>${I18N.t('auth.username')}</th><th>${I18N.lang() === 'th' ? 'ชื่อ-สกุล' : 'Name'}</th><th>${I18N.t('auth.org')}</th>
          <th>${I18N.t('users.role')}</th><th>${I18N.t('users.status')}</th><th>${I18N.t('users.lastLogin')}</th><th>${I18N.t('actions')}</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:26px">—</td></tr>`}</tbody>
        </table></div>`;
      bind();
    }

    function byId(id) { return Number(id); }

    function bind() {
      const doSearch = () => load(wrap.querySelector('#u-search').value.trim());
      wrap.querySelector('#u-go').addEventListener('click', doSearch);
      wrap.querySelector('#u-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
      wrap.querySelector('#u-add').addEventListener('click', () => addModal());

      wrap.querySelectorAll('[data-act]').forEach((btn) => {
        const id = byId(btn.dataset.id);
        btn.addEventListener('click', async () => {
          try {
            const u = (await API.get('/api/admin/users')).users.find((x) => x.id === id);
            if (!u) throw { message: 'not found' };
            const act = btn.dataset.act;
            if (act === 'edit') editModal(u);
            else if (act === 'pw') pwModal(u);
            else if (act === 'toggle') {
              await API.put(`/api/admin/users/${id}`, { status: u.status === 'active' ? 'inactive' : 'active' });
              U.toast(I18N.t('profile.saved'), 'ok'); load(wrap.querySelector('#u-search').value.trim());
            } else if (act === 'activate') {
              await API.put(`/api/admin/users/${id}`, { status: 'active' });
              U.toast(I18N.t('profile.saved'), 'ok'); load('');
            } else if (act === 'del') {
              U.confirm(I18N.t('users.confirmDelete'), async () => {
                try { await API.del(`/api/admin/users/${id}`); load(wrap.querySelector('#u-search').value.trim()); }
                catch (err) { U.toast(err.message, 'err'); }
              }, I18N.t('delete'));
            }
          } catch (err) { U.toast(err.message || err.error, 'err'); }
        });
      });
    }

    function addModal() {
      const m = U.modal(`
        <div class="modal-head"><h3>${I18N.t('users.addUser')}</h3><button class="btn btn-ghost btn-sm" data-close-modal>✕</button></div>
        <form class="modal-body" id="ua-form">
          <div class="form-grid">
            <div class="field"><label>${I18N.t('auth.firstName')} *</label><input class="input" name="firstName" required/></div>
            <div class="field"><label>${I18N.t('auth.lastName')} *</label><input class="input" name="lastName" required/></div>
          </div>
          <div class="field"><label>${I18N.t('auth.org')}</label><input class="input" name="org"/></div>
          <div class="field"><label>${I18N.t('auth.email')}</label><input class="input" name="email" type="email"/></div>
          <div class="form-grid">
            <div class="field"><label>${I18N.t('auth.username')} *</label><input class="input" name="username" required/></div>
            <div class="field"><label>${I18N.t('users.role')}</label>
              <select class="input" name="role"><option value="student">student / ผู้สอบ</option><option value="admin">admin / ผู้ดูแล</option></select></div>
          </div>
          <div class="field"><label>${I18N.t('auth.password')} *</label><input class="input" type="password" name="password" required minlength="8"/></div>
          <div class="modal-foot" style="padding:0;border:0">
            <button class="btn btn-primary" type="submit">${I18N.t('save')}</button>
          </div>
        </form>`);
      m.el.querySelector('#ua-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        try {
          await API.post('/api/admin/users', Object.fromEntries(f.entries()));
          m.close(); U.toast(I18N.t('profile.saved'), 'ok');
          load(wrap.querySelector('#u-search')?.value.trim() || '');
        } catch (err) { U.toast(err.message, 'err'); }
      });
    }

    function editModal(u) {
      const m = U.modal(`
        <div class="modal-head"><h3>${I18N.t('edit')} — ${U.esc(u.username)}</h3><button class="btn btn-ghost btn-sm" data-close-modal>✕</button></div>
        <form class="modal-body" id="ue-form">
          <div class="form-grid">
            <div class="field"><label>${I18N.t('auth.firstName')} *</label><input class="input" name="firstName" value="${U.esc(u.firstName)}" required/></div>
            <div class="field"><label>${I18N.t('auth.lastName')} *</label><input class="input" name="lastName" value="${U.esc(u.lastName)}" required/></div>
          </div>
          <div class="field"><label>${I18N.t('auth.org')}</label><input class="input" name="org" value="${U.esc(u.org || '')}"/></div>
          <div class="field"><label>${I18N.t('auth.email')}</label><input class="input" name="email" value="${U.esc(u.email || '')}"/></div>
          <div class="form-grid">
            <div class="field"><label>${I18N.t('users.role')}</label>
              <select class="input" name="role">
                <option value="student" ${u.role === 'student' ? 'selected' : ''}>student</option>
                <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
              </select></div>
            <div class="field"><label>${I18N.t('users.status')}</label>
              <select class="input" name="status">
                ${['active', 'inactive', 'pending'].map((s) => `<option value="${s}" ${u.status === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select></div>
          </div>
          <div class="modal-foot" style="padding:0;border:0">
            <button class="btn btn-primary" type="submit">${I18N.t('save')}</button>
          </div>
        </form>`);
      m.el.querySelector('#ue-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        try {
          await API.put(`/api/admin/users/${u.id}`, Object.fromEntries(f.entries()));
          m.close(); U.toast(I18N.t('profile.saved'), 'ok');
          load(wrap.querySelector('#u-search')?.value.trim() || '');
        } catch (err) { U.toast(err.message, 'err'); }
      });
    }

    function pwModal(u) {
      const m = U.modal(`
        <div class="modal-head"><h3>${I18N.t('users.resetPw')} — ${U.esc(u.username)}</h3><button class="btn btn-ghost btn-sm" data-close-modal>✕</button></div>
        <form class="modal-body" id="up-form">
          <div class="field"><label>${I18N.t('profile.newPw')} *</label><input class="input" type="password" name="newPassword" required minlength="8"/></div>
          <div class="modal-foot" style="padding:0;border:0">
            <button class="btn btn-primary" type="submit">${I18N.t('save')}</button>
          </div>
        </form>`);
      m.el.querySelector('#up-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        try {
          await API.put(`/api/admin/users/${u.id}/password`, { newPassword: String(f.get('newPassword')) });
          m.close(); U.toast(I18N.t('profile.saved'), 'ok');
        } catch (err) { U.toast(err.message, 'err'); }
      });
    }

    load().catch((e) => U.toast(e.message, 'err'));
  },

  // ================= items =================
  async renderItems(el) {
    const wrap = document.createElement('div');
    wrap.className = 'container';
    wrap.innerHTML = `<div class="page-loading">${I18N.t('loading')}</div>`;
    el.appendChild(wrap);
    const state = { q: '', topicId: '', difficulty: '', page: 1, pageSize: 15, includeInactive: false };
    let topics = [];
    try { topics = (await API.get('/api/admin/topics')).topics; }
    catch (e) { U.toast(e.message, 'err'); }

    async function load() {
      const p = new URLSearchParams({
        q: state.q, page: state.page, pageSize: state.pageSize,
        ...(state.topicId ? { topicId: state.topicId } : {}),
        ...(state.difficulty ? { difficulty: state.difficulty } : {}),
        ...(state.includeInactive ? { includeInactive: '1' } : {}),
      });
      const r = await API.get(`/api/admin/items?${p}`);
      const totalPages = Math.max(1, Math.ceil(r.total / state.pageSize));
      const snippet = (s) => U.esc(s.length > 90 ? s.slice(0, 90) + '…' : s);
      wrap.innerHTML = `
        <div class="page-head">
          <h1>${I18N.t('items.title')}</h1>
          <div class="head-actions">
            <input class="input" id="i-q" placeholder="${I18N.t('search')}" value="${U.esc(state.q)}"/>
            <select class="input" id="i-topic"><option value="">${I18N.t('items.topic')}: ${I18N.lang() === 'th' ? 'ทั้งหมด' : 'All'}</option>
              ${topics.map((t) => `<option value="${t.id}" ${String(t.id) === state.topicId ? 'selected' : ''}>${U.esc(I18N.lang() === 'en' ? t.name_en : t.name_th)}</option>`).join('')}
            </select>
            <select class="input" id="i-diff">
              <option value="">${I18N.t('items.difficulty')}: ${I18N.lang() === 'th' ? 'ทั้งหมด' : 'All'}</option>
              ${[1, 2, 3, 4].map((d) => `<option value="${d}" ${state.difficulty == d ? 'selected' : ''}>${I18N.t('diff.' + d)}</option>`).join('')}
            </select>
            <button class="btn btn-outline" id="i-go">🔍</button>
          </div>
        </div>
        <div class="inline-controls mb-16">
          <button class="btn btn-primary btn-sm" id="i-add">＋ ${I18N.t('items.addItem')}</button>
          <label class="btn btn-outline btn-sm" style="cursor:pointer">⬆ ${I18N.t('items.importItems')}<input type="file" id="i-import" accept=".json" hidden/></label>
          <button class="btn btn-outline btn-sm" id="i-export">⬇ ${I18N.t('items.exportItems')}</button>
          <label style="display:flex;gap:6px;align-items:center;font-size:13px;color:var(--muted)">
            <input type="checkbox" id="i-inactive" ${state.includeInactive ? 'checked' : ''}/> ${I18N.lang() === 'th' ? 'แสดงที่ถูกเก็บถาวร' : 'Show archived'}
          </label>
        </div>
        <div class="card table-wrap"><table class="data">
          <thead><tr><th>#</th><th>${I18N.t('items.topic')}</th><th>${I18N.t('items.difficulty')}</th><th>${I18N.t('items.questionTh')}</th><th>${I18N.t('items.correct')}</th><th>${I18N.t('actions')}</th></tr></thead>
          <tbody>
            ${r.items.length ? r.items.map((it) => `
              <tr style="${it.active ? '' : 'opacity:.55'}">
                <td class="num-cell">${it.id}${it.active ? '' : ' 🗄'}</td>
                <td>${U.esc(I18N.lang() === 'en' ? it.topicEn : it.topicTh)}</td>
                <td><span class="badge diff-${it.difficulty}">${I18N.t('diff.' + it.difficulty)}</span></td>
                <td>${snippet(it.questionTh)}<div class="muted small">${snippet(it.questionEn || '')}</div></td>
                <td><b>${String.fromCharCode(65 + it.correctIndex)}</b></td>
                <td><div class="row-actions">
                  ${!it.active ? `<button class="icon-btn" data-rest="${it.id}" title="restore">♻️</button>` : ''}
                  <button class="icon-btn" data-edit="${it.id}" title="${I18N.t('edit')}">✏️</button>
                  <button class="icon-btn" data-del="${it.id}" title="${I18N.t('delete')}">🗑</button>
                </div></td>
              </tr>`).join('')
              : `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:30px">—</td></tr>`}
          </tbody>
        </table></div>
        <div class="pager">
          <span>${r.total.toLocaleString()} ${I18N.lang() === 'th' ? 'รายการ' : 'items'} · ${state.page}/${totalPages}</span>
          <button class="btn btn-outline btn-sm" id="i-prev" ${state.page <= 1 ? 'disabled' : ''}>←</button>
          <button class="btn btn-outline btn-sm" id="i-next" ${state.page >= totalPages ? 'disabled' : ''}>→</button>
        </div>`;
      bind(r.items);
    }

    const findItem = (items, id) => items.find((x) => x.id === Number(id));

    function formModal(item, reload) {
      const isEdit = !!item;
      const v = item || { topicId: topics[0]?.id || '', difficulty: 2, questionTh: '', questionEn: '', choicesTh: ['', '', '', '', ''], choicesEn: ['', '', '', '', ''], correctIndex: 0, explanationTh: '', explanationEn: '' };
      const choiceInputs = (name, arr) => [0, 1, 2, 3, 4].map((i) =>
        `<input class="input" style="margin-bottom:8px" name="${name}${i}" placeholder="${String.fromCharCode(65 + i)}" value="${U.esc(arr[i] || '')}"/>`).join('');
      const radioCorrect = () => [0, 1, 2, 3, 4].map((i) =>
        `<label style="display:inline-flex;gap:5px;margin-right:14px;font-size:14px"><input type="radio" name="correctIndex" value="${i}" ${v.correctIndex === i ? 'checked' : ''}/>${String.fromCharCode(65 + i)}</label>`).join('');

      const m = U.modal(`
        <div class="modal-head"><h3>${isEdit ? `${I18N.t('edit')} #${item.id}` : I18N.t('items.addItem')}</h3><button class="btn btn-ghost btn-sm" data-close-modal>✕</button></div>
        <form class="modal-body" id="if-form">
          <div class="form-grid">
            <div class="field"><label>${I18N.t('items.topic')}</label>
              <select class="input" name="topicId">${topics.map((t) => `<option value="${t.id}" ${v.topicId == t.id ? 'selected' : ''}>${U.esc(I18N.lang() === 'en' ? t.name_en : t.name_th)}</option>`).join('')}</select></div>
            <div class="field"><label>${I18N.t('items.difficulty')}</label>
              <select class="input" name="difficulty">${[1, 2, 3, 4].map((d) => `<option value="${d}" ${v.difficulty == d ? 'selected' : ''}>${I18N.t('diff.' + d)}</option>`).join('')}</select></div>
          </div>
          <div class="field"><label>${I18N.t('items.questionTh')} *</label><textarea class="input" name="questionTh" required>${U.esc(v.questionTh)}</textarea></div>
          <div class="field"><label>${I18N.t('items.questionEn')}</label><textarea class="input" name="questionEn">${U.esc(v.questionEn || '')}</textarea></div>
          <div class="section-block"><b>${I18N.t('items.choicesTh')} * (A–E)</b><div class="mt-8">${choiceInputs('cTh', v.choicesTh)}</div></div>
          <details class="mt-16"><summary class="mb-8" style="cursor:pointer;font-weight:600;font-size:13.5px">${I18N.t('items.choicesEn')}</summary>
            <div class="mt-8">${choiceInputs('cEn', v.choicesEn)}</div></details>
          <div class="section-block"><b>${I18N.t('items.correct')} *</b><div class="mt-8">${radioCorrect()}</div></div>
          <div class="field mt-16"><label>${I18N.t('items.explanationTh')}</label><textarea class="input" name="explanationTh">${U.esc(v.explanationTh || '')}</textarea></div>
          <details class="mt-8"><summary style="cursor:pointer;font-weight:600;font-size:13.5px">${I18N.t('items.explanationEn')}</summary>
            <textarea class="input mt-8" name="explanationEn">${U.esc(v.explanationEn || '')}</textarea></details>
        </form>
        <div class="modal-foot">
          <button class="btn btn-outline" data-close-modal>${I18N.t('cancel')}</button>
          <button class="btn btn-primary" id="if-save">${I18N.t('save')}</button>
        </div>`, { wide: true });

      m.el.querySelector('#if-save').addEventListener('click', async () => {
        const f = new FormData(m.el.querySelector('#if-form'));
        const payload = {
          topicId: Number(f.get('topicId')), difficulty: Number(f.get('difficulty')),
          questionTh: f.get('questionTh'), questionEn: f.get('questionEn') || '',
          choicesTh: [0, 1, 2, 3, 4].map((i) => f.get(`cTh${i}`) || ''),
          choicesEn: [0, 1, 2, 3, 4].map((i) => f.get(`cEn${i}`) || ''),
          correctIndex: Number(f.get('correctIndex')),
          explanationTh: f.get('explanationTh') || '', explanationEn: f.get('explanationEn') || '',
        };
        try {
          if (isEdit) await API.put(`/api/admin/items/${item.id}`, payload);
          else await API.post('/api/admin/items', payload);
          m.close(); U.toast(I18N.t('profile.saved'), 'ok'); reload();
        } catch (err) { U.toast(err.message, 'err'); }
      });
    }

    function bind(items) {
      const doSearch = () => {
        state.q = wrap.querySelector('#i-q').value.trim();
        state.topicId = wrap.querySelector('#i-topic').value;
        state.difficulty = wrap.querySelector('#i-diff').value;
        state.page = 1; load().catch((e) => U.toast(e.message, 'err'));
      };
      wrap.querySelector('#i-go').addEventListener('click', doSearch);
      wrap.querySelector('#i-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
      wrap.querySelector('#i-topic').addEventListener('change', doSearch);
      wrap.querySelector('#i-diff').addEventListener('change', doSearch);
      wrap.querySelector('#i-prev').addEventListener('click', () => { state.page--; load().catch(() => {}); });
      wrap.querySelector('#i-next').addEventListener('click', () => { state.page++; load().catch(() => {}); });
      wrap.querySelector('#i-inactive').addEventListener('change', (e) => { state.includeInactive = e.target.checked; state.page = 1; load().catch(() => {}); });
      wrap.querySelector('#i-add').addEventListener('click', () => formModal(null, () => load().catch(() => {})));

      wrap.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
        const it = findItem(items, b.dataset.edit); if (it) formModal(it, () => load().catch(() => {}));
      }));
      wrap.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
        U.confirm(I18N.t('items.confirmDelete'), async () => {
          try { const r = await API.del(`/api/admin/items/${b.dataset.del}`);
            U.toast(r.archived ? (I18N.lang() === 'th' ? 'เก็บถาวรแล้ว (ถูกใช้ในชุดสอบ)' : 'Archived (used in exam sets)') : I18N.t('profile.saved'), 'ok');
            load().catch(() => {});
          } catch (err) { U.toast(err.message, 'err'); }
        }, I18N.t('delete'));
      }));
      wrap.querySelectorAll('[data-rest]').forEach((b) => b.addEventListener('click', async () => {
        try { await API.put(`/api/admin/items/${b.dataset.rest}/restore`); U.toast(I18N.t('profile.saved'), 'ok'); load().catch(() => {}); }
        catch (err) { U.toast(err.message, 'err'); }
      }));

      wrap.querySelector('#i-export').addEventListener('click', async () => {
        try {
          const all = [];
          let page = 1;
          for (;;) {
            const r = await API.get(`/api/admin/items?page=${page}&pageSize=50`);
            all.push(...r.items);
            if (all.length >= r.total || page > 40) break;
            page++;
          }
          const out = all.filter((x) => x.active).map((x) => ({
            topicId: x.topicId, difficulty: x.difficulty,
            questionTh: x.questionTh, questionEn: x.questionEn,
            choicesTh: x.choicesTh, choicesEn: x.choicesEn,
            correctIndex: x.correctIndex,
            explanationTh: x.explanationTh, explanationEn: x.explanationEn,
          }));
          U.download('physics-item-bank.json', new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
        } catch (err) { U.toast(err.message, 'err'); }
      });

      wrap.querySelector('#i-import').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const parsed = JSON.parse(await file.text());
          const list = Array.isArray(parsed) ? parsed : parsed.items;
          const r = await API.post('/api/admin/items/import', { items: list });
          U.toast(`${I18N.t('profile.saved')}: ${r.inserted}${r.errors.length ? ` / ${I18N.lang() === 'th' ? 'ผิดพลาด' : 'errors'}: ${r.errors.length}` : ''}`, r.errors.length ? 'err' : 'ok');
          load().catch(() => {});
        } catch (err) { U.toast(err.message || err.error, 'err'); }
      });
    }

    load().catch((e) => { U.toast(e.message, 'err'); });
  },

  // ================= exams =================
  async renderExams(el) {
    const wrap = document.createElement('div');
    wrap.className = 'container';
    wrap.innerHTML = `<div class="page-loading">${I18N.t('loading')}</div>`;
    el.appendChild(wrap);

    async function load() {
      const r = await API.get('/api/admin/exams');
      const lang = I18N.lang();
      wrap.innerHTML = `
        <div class="page-head">
          <h1>${I18N.t('exams.title')}</h1>
          <button class="btn btn-primary" id="e-create">＋ ${I18N.t('exams.createExam')}</button>
        </div>
        <div class="card table-wrap"><table class="data">
          <thead><tr><th>${I18N.lang() === 'th' ? 'ชุดข้อสอบ' : 'Title'}</th><th>${I18N.t('dash.window')}</th>
          <th>${I18N.t('exams.duration')}</th><th>${I18N.t('exams.itemCount')}</th><th>${I18N.t('exams.attempts')}</th><th>${I18N.t('th.status')}</th><th>${I18N.t('actions')}</th></tr></thead>
          <tbody>${r.exams.map((e) => `
            <tr>
              <td><b>${U.esc(lang === 'en' ? (e.title_en || e.title_th) : e.title_th)}</b><div class="muted small">${U.esc(e.description || '')}</div></td>
              <td class="num-cell small">${U.fmtDateTime(e.open_at)}<br>→ ${U.fmtDateTime(e.close_at)}</td>
              <td class="num-cell">${e.duration_min}'</td>
              <td class="num-cell">${e.itemCount}</td>
              <td class="num-cell">${e.attemptCount}</td>
              <td><span class="badge ${e.published ? 'open' : 'inactive'}">${e.published ? I18N.t('exams.publish') : I18N.t('exams.unpublish')}</span></td>
              <td><div class="row-actions">
                <button class="icon-btn" data-pub="${e.id}" data-val="${e.published ? 0 : 1}" title="${e.published ? I18N.t('exams.unpublish') : I18N.t('exams.publish')}">${e.published ? '🙈' : '📢'}</button>
                <a class="icon-btn" href="#/admin/exams/${e.id}" title="${I18N.t('exams.manage')}">📡</a>
                <button class="icon-btn" data-del="${e.id}" title="${I18N.t('delete')}">🗑</button>
              </div></td>
            </tr>`).join('') || `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:30px">—</td></tr>`}
          </tbody>
        </table></div>`;
      bind();
    }

    async function wizard() {
      const tops = (await API.get('/api/admin/topics')).topics;
      const diffs = [1, 2, 3, 4];
      let mode = 'blueprint';

      const matrix = () => `
        <table class="data blueprint-table" style="width:auto">
          <thead><tr><th>${I18N.t('items.topic')}</th>${diffs.map((d) => `<th>${I18N.t('diff.' + d)}</th>`).join('')}</tr></thead>
          <tbody>${tops.map((t) => `
            <tr><td>${U.esc(I18N.lang() === 'en' ? t.name_en : t.name_th)}</td>
            ${diffs.map((d) => `<td><input class="input bp-in" data-t="${t.id}" data-d="${d}" type="number" min="0" max="20" value="0" style="width:64px;text-align:center;padding:6px"/></td>`).join('')}
            </tr>`).join('')}
          </tbody>
        </table>`;

      const m = U.modal(`
        <div class="modal-head"><h3>${I18N.t('exams.createExam')}</h3><button class="btn btn-ghost btn-sm" data-close-modal>✕</button></div>
        <form class="modal-body" id="ex-form">
          <div class="form-grid">
            <div class="field"><label>* ${I18N.lang() === 'th' ? 'ชื่อชุดข้อสอบ (ไทย)' : 'Title (Thai)'}</label><input class="input" name="titleTh" required maxlength="160"/></div>
            <div class="field"><label>${I18N.lang() === 'th' ? 'ชื่อ (English)' : 'Title (English)'}</label><input class="input" name="titleEn" maxlength="160"/></div>
          </div>
          <div class="field"><label>${I18N.lang() === 'th' ? 'คำอธิบาย' : 'Description'}</label><input class="input" name="description" maxlength="500"/></div>
          <div class="form-grid">
            <div class="field"><label>${I18N.t('exams.duration')} *</label><input class="input" name="durationMin" type="number" min="1" max="240" value="20" required/></div>
            <div class="field">&nbsp;</div>
            <div class="field"><label>${I18N.t('exams.openAt')} *</label><input class="input" name="openAt" type="datetime-local" value="${this.toLocalInput(Date.now() - 3600000)}" required/></div>
            <div class="field"><label>${I18N.t('exams.closeAt')} *</label><input class="input" name="closeAt" type="datetime-local" value="${this.toLocalInput(Date.now() + 7 * 86400000)}" required/></div>
          </div>
          <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" name="shuffle" checked/> ${I18N.t('exams.shuffle')}</label>

          <div class="section-block">
            <label style="display:flex;gap:16px;font-size:14px;font-weight:600">
              <label style="font-weight:600"><input type="radio" name="mode" value="blueprint" checked/> ${I18N.t('exams.modeBlueprint')}</label>
              <label style="font-weight:600"><input type="radio" name="mode" value="manual"/> ${I18N.t('exams.modeManual')}</label>
            </label>
            <p class="form-hint">${I18N.t('exams.blueprintHint')}</p>
            <div id="bp-zone" class="mt-8">${matrix()}</div>
            <div id="mn-zone" hidden><p class="form-hint">${I18N.lang() === 'th' ? 'กำลังโหลดคลังข้อสอบ…' : 'Loading item bank…'}</p></div>
            <p class="mt-8"><b>${I18N.t('exams.totalQuestions')}: <span id="bp-total" class="bp-total">0</span></b></p>
          </div>
        </form>
        <div class="modal-foot">
          <button class="btn btn-outline" data-close-modal>${I18N.t('cancel')}</button>
          <button class="btn btn-primary" id="ex-save">${I18N.t('save')}</button>
        </div>`, { wide: true });

      const form = m.el.querySelector('#ex-form');
      const bpZone = m.el.querySelector('#bp-zone');
      const mnZone = m.el.querySelector('#mn-zone');

      form.querySelectorAll('[name=mode]').forEach((r) => r.addEventListener('change', () => {
        mode = form.querySelector('[name=mode]:checked').value;
        bpZone.hidden = mode !== 'blueprint';
        mnZone.hidden = mode !== 'manual';
      }));

      const updTotal = () => {
        const inputs = [...bpZone.querySelectorAll('.bp-in')];
        m.el.querySelector('#bp-total').textContent = inputs.reduce((s, i) => s + (Number(i.value) || 0), 0);
      };
      bpZone.addEventListener('input', updTotal);

      mnZone.addEventListener('change', () => {
        m.el.querySelector('#bp-total').textContent = [...mnZone.querySelectorAll('input:checked')].length;
      });

      // manual picker: load up to 200 items grouped by topic
      (async () => {
        try {
          const all = [];
          let page = 1;
          for (;;) {
            const r = await API.get(`/api/admin/items?page=${page}&pageSize=50`);
            all.push(...r.items);
            if (all.length >= r.total || page >= 4) break;
            page++;
          }
          const groups = {};
          all.filter((x) => x.active).forEach((x) => { (groups[x.topicTh] = groups[x.topicTh] || []).push(x); });
          mnZone.innerHTML = Object.keys(groups).map((g) => `
            <div class="card card-pad mb-8" style="box-shadow:none">
              <b>${U.esc(g)}</b>
              ${groups[g].map((x) => `
                <label style="display:flex;gap:8px;font-size:13.5px;padding:4px 0;align-items:flex-start">
                  <input type="checkbox" class="mn-chk" value="${x.id}" data-diff="${x.difficulty}"/>
                  <span>#${x.id} <span class="badge diff-${x.difficulty}">${I18N.t('diff.' + x.difficulty)}</span> ${U.esc(x.questionTh.slice(0, 80))}</span>
                </label>`).join('')}
            </div>`).join('') || `<p class="form-hint">—</p>`;
        } catch (err) { mnZone.innerHTML = `<p class="form-error">${U.esc(err.message)}</p>`; }
      })();

      m.el.querySelector('#ex-save').addEventListener('click', async () => {
        const f = new FormData(form);
        const body = {
          titleTh: f.get('titleTh'), titleEn: f.get('titleEn') || '', description: f.get('description') || '',
          durationMin: Number(f.get('durationMin')),
          openAt: this.fromLocalInput(f.get('openAt')), closeAt: this.fromLocalInput(f.get('closeAt')),
          shuffle: form.querySelector('[name=shuffle]').checked,
          published: false, mode,
        };
        if (body.mode === 'blueprint') {
          const bp = {};
          bpZone.querySelectorAll('.bp-in').forEach((inp) => {
            const n = Number(inp.value) || 0;
            if (n > 0) {
              bp[inp.dataset.t] = bp[inp.dataset.t] || {};
              bp[inp.dataset.t][inp.dataset.d] = n;
            }
          });
          body.blueprint = bp;
        } else {
          body.itemIds = [...mnZone.querySelectorAll('.mn-chk:checked')].map((c) => Number(c.value));
        }
        try {
          const r = await API.post('/api/admin/exams/create', body);
          m.close();
          U.toast(I18N.t('exams.created', { n: r.itemCount }), 'ok');
          if (r.shortfall && r.shortfall.length) {
            U.toast(I18N.t('exams.shortfallWarn', { msg: JSON.stringify(r.shortfall) }), 'err');
          }
          load().catch(() => {});
        } catch (err) { U.toast(err.message, 'err'); }
      });
    }

    function bind() {
      wrap.querySelector('#e-create').addEventListener('click', () => wizard.call(ViewsAdmin));
      wrap.querySelectorAll('[data-pub]').forEach((b) => b.addEventListener('click', async () => {
        try {
          await API.put(`/api/admin/exams/${b.dataset.pub}/publish`, { published: b.dataset.val === '1' });
          load().catch(() => {});
        } catch (err) { U.toast(err.message, 'err'); }
      }));
      wrap.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
        U.confirm(I18N.lang() === 'th' ? 'ลบชุดข้อสอบนี้?' : 'Delete this exam set?', async () => {
          try { await API.del(`/api/admin/exams/${b.dataset.del}`); load().catch(() => {}); }
          catch (err) { U.toast(err.message, 'err'); }
        }, I18N.t('delete'));
      }));
    }

    load().catch((e) => U.toast(e.message, 'err'));
  },

  // ================= exam detail: live monitor + analysis =================
  async renderExamDetail(el, examId) {
    const wrap = document.createElement('div');
    wrap.className = 'container';
    wrap.innerHTML = `<div class="page-loading">${I18N.t('loading')}</div>`;
    el.appendChild(wrap);

    let clockOffset = 0;

    async function loadRoster(keepHead) {
      const r = await API.get(`/api/admin/exams/${examId}/roster`);
      clockOffset = Date.parse(r.serverNow) - Date.now();
      const lang = I18N.lang();
      const head = keepHead && wrap.querySelector('#ed-head') ? wrap.querySelector('#ed-head').outerHTML : headHtml(r.exam, r.roster.length);
      wrap.innerHTML = `
        ${head}
        <div class="section-block">
          <div class="flex-between mb-8">
            <h2 class="mt-0">📡 ${I18N.t('exams.rosterTitle')}</h2>
            <span class="muted small">${I18N.t('exams.liveRefresh')}</span>
          </div>
          <div class="card table-wrap"><table class="data">
            <thead><tr><th>${I18N.t('mon.student')}</th><th>${I18N.t('th.status')}</th><th>${I18N.t('mon.progress')}</th><th>${I18N.t('mon.remaining')}</th><th>${I18N.lang() === 'th' ? 'เริ่ม' : 'Started'}</th><th>${I18N.lang() === 'th' ? 'ส่ง' : 'Submitted'}</th><th>${I18N.t('th.score')}</th></tr></thead>
            <tbody>${rosterRows(r.roster, lang)}</tbody>
          </table></div>
        </div>
        <div class="section-block" id="ia-zone"><div class="page-loading">${I18N.t('loading')}</div></div>`;

      bindHead(r.exam);
      loadAnalysis(r.exam);
    }

    function headHtml(exam, attemptCount) {
      const lang = I18N.lang();
      return `
        <div id="ed-head" class="card card-pad mb-16">
          <div class="flex-between">
            <div>
              <h1 class="mt-0 mb-8">${U.esc(lang === 'en' ? (exam.titleEn || exam.titleTh) : exam.titleTh)}</h1>
              <div class="chip-row">
                <span class="badge ${exam.published ? 'open' : 'inactive'}">${exam.published ? I18N.t('exams.publish') : I18N.t('exams.unpublish')}</span>
                <span class="badge progress">⏱ ${exam.durationMin}'</span>
                <span class="badge inactive">❓ ${attemptCount}/${exam.totalQuestions} ${lang === 'th' ? 'ส่ง' : 'submitted'}</span>
              </div>
              <p class="muted small mt-8">${I18N.t('dash.window')}: ${U.fmtDateTime(exam.openAt)} → ${U.fmtDateTime(exam.closeAt)}</p>
            </div>
            <div class="head-actions">
              <a class="btn btn-outline" href="#/admin/exams">← ${I18N.t('back')}</a>
              <button class="btn ${exam.published ? 'btn-danger' : 'btn-primary'}" id="pub-toggle">${exam.published ? I18N.t('exams.unpublish') : I18N.t('exams.publish')}</button>
            </div>
          </div>
        </div>`;
    }

    function bindHead(exam) {
      wrap.querySelector('#pub-toggle').addEventListener('click', async () => {
        try {
          await API.put(`/api/admin/exams/${examId}/publish`, { published: !exam.published });
          loadRoster(false).catch(() => {});
        } catch (err) { U.toast(err.message, 'err'); }
      });
    }

    function rosterRows(roster, lang) {
      if (!roster.length) return `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:26px">${lang === 'th' ? 'ยังไม่มีผู้เข้าสอบ' : 'No attempts yet'}</td></tr>`;
      return roster.map((r) => {
        let remainTxt = '—';
        if (r.status === 'in_progress') {
          const remainMs = Date.parse(r.deadlineAt) - (Date.now() + clockOffset);
          remainTxt = U.fmtSeconds(remainMs / 1000);
        }
        const pct = r.answeredCount && r.totalQuestions ? Math.round((r.answeredCount / r.totalQuestions) * 100) : 0;
        return `
          <tr>
            <td><b>${U.esc(r.fullName)}</b> <span class="muted small">(${U.esc(r.username)})</span></td>
            <td><span class="badge ${r.status === 'submitted' ? 'submitted' : 'progress'}">${r.status === 'submitted' ? '✔ ' + (lang === 'th' ? 'ส่งแล้ว' : 'Submitted') : '⏳ ' + (lang === 'th' ? 'กำลังทำ' : 'In progress')}</span></td>
            <td style="min-width:140px"><div class="flex-between small muted num-cell">${r.answeredCount}/${r.totalQuestions}</div>
              <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div></td>
            <td class="num-cell">${remainTxt}</td>
            <td class="num-cell small">${U.fmtDateTime(r.startedAt)}</td>
            <td class="num-cell small">${U.fmtDateTime(r.submittedAt)}</td>
            <td class="num-cell"><b>${r.score != null ? `${r.score}/${r.totalQuestions}` : '—'}</b>${r.percent != null ? ` (${r.percent}%)` : ''}</td>
          </tr>`;
      }).join('');
    }

    async function loadAnalysis(exam) {
      const zone = wrap.querySelector('#ia-zone');
      try {
        const r = await API.get(`/api/admin/exams/${examId}/item-analysis`);
        zone.innerHTML = `
          <div class="flex-between mb-8"><h2 class="mt-0">🔬 ${I18N.t('exams.analysisTitle')}</h2>
            <span class="badge progress">${r.submittedAttempts} ${I18N.lang() === 'th' ? 'ชุดที่ส่ง' : 'submissions'}</span></div>
          <div class="card chart-box mb-16">
            ${Charts.bar(
              r.analysis.map((a) => `Q${a.position}·${I18N.t('diff.' + a.difficulty)}`),
              r.analysis.map((a) => a.correctRate ?? 0),
              { unit: '%', empty: I18N.lang() === 'th' ? 'ยังไม่มีข้อมูลการสอบ' : 'No submission data yet' }
            )}
          </div>
          <div class="card table-wrap"><table class="data">
            <thead><tr><th>#</th><th>${I18N.t('items.questionTh')}</th><th>${I18N.t('items.topic')}</th><th>${I18N.t('items.difficulty')}</th><th>${I18N.lang() === 'th' ? 'ตอบถูก' : 'Correct'}</th><th>%</th></tr></thead>
            <tbody>${r.analysis.map((a) => `
              <tr>
                <td class="num-cell">Q${a.position}</td>
                <td class="small">${U.esc(a.snippetTh)}…</td>
                <td class="small">${U.esc(a.topicTh)}</td>
                <td><span class="badge diff-${a.difficulty}">${I18N.t('diff.' + a.difficulty)}</span></td>
                <td class="num-cell">${a.correctCount}/${a.attemptedCount}</td>
                <td class="num-cell"><b>${a.correctRate ?? '—'}%</b></td>
              </tr>`).join('')}
            </tbody>
          </table></div>`;
      } catch (err) { zone.innerHTML = `<p class="form-error">${U.esc(err.message)}</p>`; }
    }

    loadRoster(true).catch((e) => U.toast(e.message, 'err'));
    const iv = setInterval(() => loadRoster(true).catch(() => {}), 5000);
    App.addCleanup(() => clearInterval(iv));
  },

  // ================= scores & reports =================
  async renderScores(el) {
    const wrap = document.createElement('div');
    wrap.className = 'container';
    wrap.innerHTML = `<div class="page-loading">${I18N.t('loading')}</div>`;
    el.appendChild(wrap);

    let exams = [];
    try { exams = (await API.get('/api/admin/exams')).exams; } catch { /* ignore */ }
    const state = { examId: '', q: '', from: '', to: '' };
    let lastRows = [], lastStats = null;

    async function load() {
      const p = new URLSearchParams({ ...(state.examId ? { examId: state.examId } : {}), ...(state.q ? { q: state.q } : {}), ...(state.from ? { from: state.from } : {}), ...(state.to ? { to: state.to } : {}) });
      const r = await API.get(`/api/admin/scores?${p}`);
      lastRows = r.rows; lastStats = r.stats;
      const lang = I18N.lang();

      const bands = { 'band.85-100': 0, 'band.70-84': 0, 'band.50-69': 0, 'band.0-49': 0 };
      lastRows.forEach((x) => { bands[`band.${ViewsStudent.bandOf(x.percent)}`] += 1; });

      const trend = (await API.get('/api/admin/reports/trend')).points;

      wrap.innerHTML = `
        <div class="page-head">
          <h1>${I18N.t('scores.title')}</h1>
          <div class="head-actions">
            <button class="btn btn-outline btn-sm" id="sc-csv">⬇ ${I18N.t('exportCSV')}</button>
            <button class="btn btn-outline btn-sm" id="sc-xls">⬇ ${I18N.t('exportXLS')}</button>
            <button class="btn btn-outline btn-sm" id="sc-print">🖨 ${I18N.t('scores.printReport')}</button>
          </div>
        </div>

        <div class="card card-pad mb-16 no-print">
          <div class="inline-controls">
            <select class="input" id="f-exam"><option value="">${I18N.t('scores.allExams')}</option>
              ${exams.map((e) => `<option value="${e.id}" ${String(e.id) === state.examId ? 'selected' : ''}>${U.esc(lang === 'en' ? (e.title_en || e.title_th) : e.title_th)}</option>`).join('')}
            </select>
            <input class="input" id="f-q" placeholder="${I18N.t('search')}" value="${U.esc(state.q)}"/>
            <input class="input" id="f-from" type="date" value="${state.from}"/>
            <input class="input" id="f-to" type="date" value="${state.to}"/>
            <button class="btn btn-primary btn-sm" id="f-go">${I18N.t('confirm')}</button>
          </div>
        </div>

        <div class="grid grid-4 mb-16">
          <div class="card stat-card accent"><div class="num">${lastStats.n}</div><div class="lbl">${I18N.t('scores.n')}</div></div>
          <div class="card stat-card"><div class="num">${lastStats.mean}%</div><div class="lbl">${I18N.t('scores.mean')}</div></div>
          <div class="card stat-card"><div class="num">${lastStats.median}%</div><div class="lbl">${I18N.t('scores.median')}</div></div>
          <div class="card stat-card"><div class="num">${lastStats.sd}%</div><div class="lbl">${I18N.t('scores.sd')}</div></div>
          <div class="card stat-card"><div class="num">${lastStats.high}%</div><div class="lbl">${I18N.t('scores.high')}</div></div>
          <div class="card stat-card"><div class="num">${lastStats.low}%</div><div class="lbl">${I18N.t('scores.low')}</div></div>
        </div>

        <div class="card chart-box mb-16">
          <p class="chart-title">${I18N.t('chart.barScores')}</p>
          ${Charts.bar(lastRows.slice(0, 25).map((x) => `${x.rankLabel || ''}${x.username}`), lastRows.slice(0, 25).map((x) => x.percent), { unit: '%', max: 100, empty: lang === 'th' ? 'ไม่มีข้อมูล' : 'No data' })}
        </div>
        <div class="grid grid-2 mb-16">
          <div class="card chart-box">
            <p class="chart-title">${I18N.t('chart.lineTrend')}</p>
            ${Charts.line(trend.map((t) => ({ label: lang === 'en' ? t.labelEn.slice(0, 12) : t.label.slice(0, 12), value: t.avgPercent })), { max: 100, empty: lang === 'th' ? 'ไม่มีข้อมูล' : 'No data' })}
          </div>
          <div class="card chart-box">
            <p class="chart-title">${I18N.t('chart.pieBands')}</p>
            ${Charts.pie(Object.keys(bands).filter((k) => bands[k] > 0).map((k) => ({ label: I18N.t(k), value: bands[k] })), { empty: lang === 'th' ? 'ไม่มีข้อมูล' : 'No data' })}
          </div>
        </div>

        <div class="card table-wrap"><table class="data" id="rank-table">
          <thead><tr><th>${I18N.t('scores.rank')}</th><th>${I18N.t('auth.username')}</th><th>${I18N.t('scores.student')}</th><th>${I18N.t('auth.org')}</th>
          <th>${I18N.t('th.exam')}</th><th>${I18N.t('th.score')}</th><th>%</th><th>${I18N.t('th.date')}</th></tr></thead>
          <tbody>${lastRows.map((x, i) => `
            <tr>
              <td class="num-cell"><b>${i + 1}</b></td>
              <td>${U.esc(x.username)}</td>
              <td>${U.esc(x.fullName)}</td>
              <td class="small muted">${U.esc(x.org || '—')}</td>
              <td class="small">${U.esc(x.examTitle)}</td>
              <td class="num-cell">${x.score}/${x.total}</td>
              <td class="num-cell"><b>${x.percent}%</b></td>
              <td class="num-cell small">${U.fmtDateTime(x.submittedAt)}</td>
            </tr>`).join('') || `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:30px">—</td></tr>`}
          </tbody>
        </table></div>`;
      bind();
    }

    function bind() {
      wrap.querySelector('#f-go').addEventListener('click', () => {
        state.examId = wrap.querySelector('#f-exam').value;
        state.q = wrap.querySelector('#f-q').value.trim();
        state.from = wrap.querySelector('#f-from').value;
        state.to = wrap.querySelector('#f-to').value;
        load().catch((e) => U.toast(e.message, 'err'));
      });
      const exportHeaders = [
        I18N.t('scores.rank'), I18N.t('auth.username'), I18N.t('scores.student'), I18N.t('auth.org'),
        I18N.t('th.exam'), I18N.t('th.score'), I18N.t('th.percent'), I18N.t('th.date'),
      ];
      wrap.querySelector('#sc-csv').addEventListener('click', () => {
        const rows = lastRows.map((x, i) => [i + 1, x.username, x.fullName, x.org, x.examTitle, x.score, x.total, x.percent, U.fmtDateTime(x.submittedAt)]);
        U.exportCSV('exam-scores', exportHeaders, rows);
      });
      wrap.querySelector('#sc-xls').addEventListener('click', () => {
        const rows = lastRows.map((x, i) => [i + 1, x.username, x.fullName, x.org, x.examTitle, x.score, x.total, x.percent, U.fmtDateTime(x.submittedAt)]);
        U.exportXLS('exam-scores', I18N.t('scores.title'), exportHeaders, rows);
      });
      wrap.querySelector('#sc-print').addEventListener('click', () => window.print());
    }

    load().catch((e) => U.toast(e.message, 'err'));
  },

  // ================= audit =================
  async renderAudit(el) {
    const wrap = document.createElement('div');
    wrap.className = 'container';
    wrap.innerHTML = `<div class="page-loading">${I18N.t('loading')}</div>`;
    el.appendChild(wrap);

    async function load(q = '') {
      const r = await API.get(`/api/admin/audit?q=${encodeURIComponent(q)}&limit=200`);
      wrap.innerHTML = `
        <div class="page-head">
          <h1>${I18N.t('audit.title')}</h1>
          <div class="head-actions">
            <input class="input" id="au-q" placeholder="${I18N.t('search')}" value="${U.esc(q)}"/>
            <button class="btn btn-outline" id="au-go">🔍</button>
          </div>
        </div>
        <div class="card table-wrap"><table class="data">
          <thead><tr><th>${I18N.t('audit.at')}</th><th>${I18N.t('audit.user')}</th><th>${I18N.t('audit.action')}</th><th>${I18N.t('audit.detail')}</th></tr></thead>
          <tbody>${r.entries.map((e) => `
            <tr>
              <td class="num-cell small">${U.fmtDateTime(e.at)}</td>
              <td>${U.esc(e.username || 'system')}</td>
              <td><code class="small">${U.esc(e.action)}</code></td>
              <td class="small muted">${U.esc(e.detail)}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>`;
      const doSearch = () => load(wrap.querySelector('#au-q').value.trim()).catch(() => {});
      wrap.querySelector('#au-go').addEventListener('click', doSearch);
      wrap.querySelector('#au-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
    }

    load().catch((e) => U.toast(e.message, 'err'));
  },
};
