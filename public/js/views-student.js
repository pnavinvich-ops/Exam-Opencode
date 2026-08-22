'use strict';

window.ViewsStudent = {
  examTitle(e) {
    return I18N.lang() === 'en' ? (e.titleEn || e.titleTh) : e.titleTh;
  },

  qText(q) { return I18N.lang() === 'en' && q.questionEn ? q.questionEn : q.questionTh; },
  qChoices(q) {
    const th = q.choicesTh || [];
    const en = q.choicesEn || [];
    return th.map((c, i) => (I18N.lang() === 'en' && en[i] ? en[i] : c));
  },
  diffBadge(d) {
    const names = ['—', 'diff.1', 'diff.2', 'diff.3', 'diff.4'];
    return `<span class="badge diff-${d}">${I18N.t(names[d] || 'none')}</span>`;
  },

  // ---------------- dashboard ----------------
  async renderDashboard(el) {
    el.innerHTML = `<div class="container"><div class="page-loading">${I18N.t('loading')}</div></div>`;
    let exams = [], myResults = [];
    try {
      const [a, b] = await Promise.all([API.get('/api/exams/available'), API.get('/api/my/results')]);
      exams = a.exams; myResults = b.results;
    } catch (e) { U.toast(e.message || e.error, 'err'); }

    const submitted = myResults.filter((r) => r.status === 'submitted');
    const avgPct = submitted.length
      ? Math.round(submitted.reduce((s, r) => s + r.percent, 0) / submitted.length * 10) / 10 : null;

    const cards = `
      <div class="grid grid-4 mb-16">
        <div class="card stat-card accent"><div class="num">${exams.filter((x) => x.state === 'open').length}</div><div class="lbl">${I18N.t('dash.openExams')}</div></div>
        <div class="card stat-card"><div class="num">${submitted.length}</div><div class="lbl">${I18N.t('dash.myAttempts')}</div></div>
        <div class="card stat-card"><div class="num">${avgPct == null ? '—' : avgPct}</div><div class="lbl">${I18N.t('dash.avgPercent')}</div></div>
      </div>`;

    if (!exams.length) {
      el.innerHTML = `<div class="container">${cards}<div class="card card-pad" style="text-align:center;color:var(--muted)">${I18N.t('dash.empty')}</div></div>`;
      return;
    }

    const lang = I18N.lang();
    const order = { open: 0, upcoming: 1, closed: 2 };
    const sorted = [...exams].sort((a, b) => (order[a.state] - order[b.state]) || Date.parse(a.closeAt) - Date.parse(b.closeAt));

    const cardHtml = (e) => {
      const badgeCls = e.state;
      const badgeTxt = e.state === 'open' ? (lang === 'th' ? 'เปิดรับสอบ' : 'Open')
        : e.state === 'upcoming' ? I18N.t('dash.notOpenYet') : I18N.t('dash.examClosed');
      let cta = '';
      if (e.state === 'upcoming') {
        cta = `<button class="btn btn-outline" disabled>${I18N.t('dash.notOpenYet')}</button>`;
      } else if (e.myAttempt && e.myAttempt.status === 'in_progress') {
        cta = `<a class="btn btn-primary" href="#/exam/${e.myAttempt.id}">${I18N.t('dash.resumeExam')}</a>
               <button class="btn btn-outline" disabled>${I18N.t('dash.alreadyTaken')}…</button>`;
      } else if (e.myAttempt && e.myAttempt.status === 'submitted') {
        cta = `<span class="badge submitted">✔ ${U.esc(I18N.t('dash.alreadyTaken'))}</span>
               <a class="btn btn-outline" href="#/result/${e.myAttempt.id}">${I18N.t('dash.viewResult')}</a>`;
      } else if (e.state === 'open') {
        cta = `<button class="btn btn-primary" data-start="${e.id}">${I18N.t('dash.enterExam')}</button>`;
      }
      return `
        <div class="card card-pad exam-card">
          <div class="flex-between">
            <h3>${U.esc(this.examTitle(e))}</h3>
            <span class="badge ${badgeCls}">${U.esc(badgeTxt)}</span>
          </div>
          <div class="exam-desc">${U.esc(e.description || '')}</div>
          <div class="exam-meta">
            <span>⏱ ${I18N.t('dash.duration', { n: e.durationMin })}</span>
            <span>❓ ${I18N.t('dash.questions', { n: e.questionCount })}</span>
          </div>
          <div class="exam-meta small">
            <span>${I18N.t('dash.window')}: ${U.fmtDateTime(e.openAt)} → ${U.fmtDateTime(e.closeAt)}</span>
            <span data-countdown data-open="${e.openAt}" data-close="${e.closeAt}" data-state="${e.state}"></span>
          </div>
          <div class="chip-row" style="margin-top:auto;padding-top:6px">${cta}</div>
        </div>`;
    };

    el.innerHTML = `
      <div class="container">
        <div class="page-head">
          <div><h1>${I18N.t('nav.dashboard')}</h1><p>${U.esc(App.user.firstName)} · <span class="muted small">${U.esc(App.user.org || '')}</span></p></div>
          <div class="head-actions"><button class="btn btn-outline btn-sm" id="d-refresh">⟳ ${I18N.t('refresh')}</button></div>
        </div>
        ${cards}
        <div class="grid grid-2">${sorted.map(cardHtml.bind(this)).join('')}</div>
      </div>`;

    el.querySelectorAll('[data-start]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const r = await API.post('/api/attempts/start', { examId: Number(btn.dataset.start) });
          location.hash = `#/exam/${r.attemptId}`;
        } catch (err) { U.toast(err.message, 'err'); App.route(); }
      });
    });

    const tick = () => {
      el.querySelectorAll('[data-countdown]').forEach((n) => {
        const now = Date.now();
        const open = Date.parse(n.dataset.open);
        const close = Date.parse(n.dataset.close);
        const st = n.dataset.state;
        if (st === 'upcoming') {
          const p = U.countdownParts(open - now);
          n.textContent = I18N.t('dash.opensIn', { d: p.d, h: p.h });
        } else if (st === 'open') {
          const p = U.countdownParts(close - now);
          n.textContent = I18N.t('dash.closesIn', { d: p.d, h: p.h });
        } else n.textContent = '';
      });
    };
    tick();
    const iv = setInterval(tick, 30000);
    App.addCleanup(() => clearInterval(iv));
    document.getElementById('d-refresh').addEventListener('click', () => this.renderDashboard(el));
  },

  // ---------------- CBT runner ----------------
  async renderExam(el, attemptId) {
    let data;
    try {
      const r = await API.get(`/api/attempts/${attemptId}`);
      if (r.submitted) { location.hash = `#/result/${attemptId}`; return; }
      data = r;
    } catch (e) {
      U.toast(e.message, 'err');
      location.hash = '#/dashboard';
      return;
    }

    const state = {
      idx: Math.min(App._runnerIdx || 0, data.questions.length - 1),
      answers: { ...data.answers },
      flagged: new Set(data.flagged),
      clockOffset: Date.parse(data.serverNow) - Date.now(),
      deadlineMs: Date.parse(data.deadlineAt),
      timer: null,
    };
    App._runnerIdx = state.idx;

    const guard = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    App.addCleanup(() => window.removeEventListener('beforeunload', guard));

    const totalQ = data.questions.length;

    el.innerHTML = `
      <div class="container" style="max-width:1080px">
        <div class="timer-bar">
          <div>
            <b>${U.esc(this.examTitle(data.exam))}</b>
            <div class="muted small">${totalQ} ${langWord()}</div>
          </div>
          <div style="display:flex;align-items:center;gap:16px">
            <span class="save-indicator" id="save-ind"></span>
            <div style="text-align:right">
              <div class="muted small">${I18N.t('run.timeLeft')}</div>
              <div class="timer-chip" id="timer-chip">--:--</div>
            </div>
            <button class="btn btn-danger" id="submit-btn">${I18N.t('run.submit')}</button>
          </div>
        </div>
        <div class="runner-shell">
          <div class="runner-main">
            <div class="card q-card" id="q-card"></div>
            <div class="flex-between mt-16">
              <button class="btn btn-outline" id="prev-btn">← ${I18N.t('run.prev')}</button>
              <button class="btn btn-outline" id="next-btn">${I18N.t('run.next')} →</button>
            </div>
          </div>
          <aside class="card card-pad">
            <b>${I18N.t('run.palette')}</b>
            <p class="muted small mt-8"><span class="badge diff-1">●</span> ${I18N.t('run.answered')} · ○ ${I18N.t('run.unanswered')}</p>
            <div class="palette" id="palette"></div>
          </aside>
        </div>
      </div>`;

    function langWord() { return I18N.lang() === 'th' ? 'ข้อ (5 ตัวเลือก)' : 'questions (5 choices)'; }

    const qCard = document.getElementById('q-card');
    const paletteEl = document.getElementById('palette');

    function renderPalette() {
      paletteEl.innerHTML = data.questions.map((q, i) => {
        const cls = [
          state.answers[q.itemId] !== undefined ? 'answered' : '',
          i === state.idx ? 'current' : '',
          state.flagged.has(q.itemId) ? 'flagged' : '',
        ].join(' ');
        return `<button type="button" class="pal-btn ${cls}" data-idx="${i}">${i + 1}</button>`;
      }).join('');
      paletteEl.querySelectorAll('.pal-btn').forEach((b) =>
        b.addEventListener('click', () => { state.idx = Number(b.dataset.idx); App._runnerIdx = state.idx; renderQuestion(); }));
    }

    function markSaved(ok, txt) {
      const ind = document.getElementById('save-ind');
      if (ok) {
        ind.style.color = 'var(--green)';
        ind.textContent = `✓ ${I18N.t('run.saved')} ${new Date().toLocaleTimeString(I18N.lang() === 'th' ? 'th-TH' : 'en-GB')}`;
      } else {
        ind.style.color = 'var(--red)';
        ind.textContent = txt || '';
      }
    }

    function renderQuestion() {
      const q = data.questions[state.idx];
      const picked = state.answers[q.itemId];
      qCard.innerHTML = `
        <div class="q-head">
          <span class="badge submitted">${I18N.lang() === 'th' ? 'ข้อ' : 'Q'} ${state.idx + 1}/${totalQ}</span>
          <div class="chip-row">
            <span class="badge diff-${q.difficulty}">${U.esc(diffName(q.difficulty))}</span>
            <button type="button" class="icon-btn" id="flag-btn">${state.flagged.has(q.itemId) ? '🚩 ' + I18N.t('run.unflag') : '⚐ ' + I18N.t('run.flag')}</button>
          </div>
        </div>
        <p class="q-text">${q.position}. ${U.esc(ViewsStudent.qText(q))}</p>
        ${ViewsStudent.qChoices(q).map((c, ci) => `
          <label class="choice ${picked === ci ? 'selected' : ''}">
            <input type="radio" name="ch" value="${ci}" ${picked === ci ? 'checked' : ''}/>
            <span class="letter">${String.fromCharCode(65 + ci)}</span>
            <span>${U.esc(c)}</span>
          </label>`).join('')}
        <div class="flex-between mt-24">
          <button type="button" class="btn btn-ghost btn-sm" id="clear-btn" ${picked === undefined ? 'disabled' : ''}>${I18N.lang() === 'th' ? 'ล้างคำตอบข้อนี้' : 'Clear answer'}</button>
          <span class="muted small">${I18N.t('run.saved')} ${state.answers[q.itemId] !== undefined ? '✓' : ''}</span>
        </div>`;

      qCard.querySelectorAll('.choice input').forEach((inp) => {
        inp.addEventListener('change', async () => {
          const choice = Number(inp.value);
          state.answers[q.itemId] = choice;
          qCard.querySelectorAll('.choice').forEach((c, ci) => c.classList.toggle('selected', ci === choice));
          try {
            await API.post(`/api/attempts/${attemptId}/answer`, { itemId: q.itemId, choice });
            markSaved(true);
            renderPalette();
          } catch (err) { markSaved(false, err.message); U.toast(err.message, 'err'); }
        });
      });

      const clearBtn = qCard.querySelector('#clear-btn');
      clearBtn.addEventListener('click', async () => {
        delete state.answers[q.itemId];
        try {
          await API.post(`/api/attempts/${attemptId}/answer`, { itemId: q.itemId, choice: null });
          renderQuestion(); renderPalette(); markSaved(true);
        } catch (err) { U.toast(err.message, 'err'); }
      });

      const flagBtn = qCard.querySelector('#flag-btn');
      flagBtn.addEventListener('click', async () => {
        const want = !state.flagged.has(q.itemId);
        try {
          await API.post(`/api/attempts/${attemptId}/flag`, { itemId: q.itemId, flagged: want });
          if (want) state.flagged.add(q.itemId); else state.flagged.delete(q.itemId);
          renderQuestion(); renderPalette();
        } catch (err) { U.toast(err.message, 'err'); }
      });

      document.getElementById('prev-btn').disabled = state.idx === 0;
      document.getElementById('next-btn').disabled = state.idx === totalQ - 1;
    }

    function diffName(d) { return I18N.t(`diff.${d}`); }

    document.getElementById('prev-btn').addEventListener('click', () => { if (state.idx > 0) { state.idx--; App._runnerIdx = state.idx; renderQuestion(); } });
    document.getElementById('next-btn').addEventListener('click', () => { if (state.idx < totalQ - 1) { state.idx++; App._runnerIdx = state.idx; renderQuestion(); } });

    const chip = document.getElementById('timer-chip');
    const finish = async () => {
      clearInterval(state.timer);
      try { await API.post(`/api/attempts/${attemptId}/submit`); } catch { /* already */ }
      location.hash = `#/result/${attemptId}`;
    };
    const tickTimer = () => {
      const remainMs = state.deadlineMs - (Date.now() + state.clockOffset);
      chip.textContent = U.fmtSeconds(remainMs / 1000);
      chip.className = 'timer-chip' + (remainMs < 60000 ? ' danger' : remainMs < 300000 ? ' warn' : '');
      if (remainMs <= 0) {
        U.toast(I18N.t('err.TIME_UP'), 'err');
        finish();
      }
    };
    tickTimer();
    state.timer = setInterval(tickTimer, 1000);
    App.addCleanup(() => clearInterval(state.timer));

    document.getElementById('submit-btn').addEventListener('click', () => {
      const unanswered = data.questions.filter((q) => state.answers[q.itemId] === undefined).length;
      const msg = unanswered
        ? I18N.t('run.submitConfirm', { n: unanswered })
        : I18N.t('run.submitConfirmAll');
      U.confirm(U.esc(msg), finish);
    });

    renderPalette();
    renderQuestion();
    markSaved(true, '');
  },

  // ---------------- result / review ----------------
  bandOf(pct) { return pct >= 85 ? '85-100' : pct >= 70 ? '70-84' : pct >= 50 ? '50-69' : '0-49'; },

  async renderResult(el, attemptId) {
    el.innerHTML = `<div class="container"><div class="page-loading">${I18N.t('loading')}</div></div>`;
    let res;
    try { res = await API.get(`/api/attempts/${attemptId}/result`); }
    catch (e) { U.toast(e.message, 'err'); location.hash = '#/results'; return; }

    const u = App.user;
    const studentName = `${u.firstName} ${u.lastName}`;
    let wrongOnly = false;

    const itemHtml = (q) => {
      const ok = q.yourChoice === q.correctIndex;
      const choices = ViewsStudent.qChoices(q);
      const letter = (i) => String.fromCharCode(65 + i);
      return `
        <div class="card card-pad review-item">
          <div class="q-head">
            <span class="badge submitted">${I18N.lang() === 'th' ? 'ข้อ' : 'Q'} ${q.position}</span>
            <div class="chip-row">
              <span class="badge diff-${q.difficulty}">${U.esc(I18N.t('diff.' + q.difficulty))}</span>
              <span class="badge ${ok ? 'open' : 'closed'}">${ok ? '✓' : '✗'}</span>
            </div>
          </div>
          <p class="q-text">${U.esc(ViewsStudent.qText(q))}</p>
          ${choices.map((c, i) => {
            let cls = 'choice review-choice';
            if (i === q.correctIndex) cls += ' correct';
            if (i === q.yourChoice && !ok) cls += ' wrong-pick';
            const marks = `${i === q.correctIndex ? ` ✔ <small><b>${I18N.t('res.correctAnswer')}</b></small>` : ''}${i === q.yourChoice ? ` &nbsp;<small>(${I18N.t('res.yourAnswer')})</small>` : ''}`;
            return `<div class="${cls}" style="cursor:default">
              <span class="letter">${letter(i)}</span><span>${U.esc(c)}${marks}</span></div>`;
          }).join('')}
          ${(q.yourChoice == null) ? `<div class="muted small mt-8">⚠ ${I18N.t('res.notAnswered')}</div>` : ''}
          <div class="explain-box">💡 <b>${I18N.t('res.explanation')}:</b> ${U.esc((I18N.lang() === 'en' && q.explanationEn) ? q.explanationEn : q.explanationTh)}</div>
        </div>`;
    };

    const listHtml = () => res.questions
      .filter((q) => !wrongOnly || q.yourChoice !== q.correctIndex)
      .map(itemHtml).join('');

    el.innerHTML = `
      <div class="container" style="max-width:900px">
        <div class="print-doc-header print-only">
          <h2>${I18N.t('res.certTitle')}</h2>
          <div>${I18N.t('res.certSystem')}</div>
        </div>
        <div class="score-hero card mb-16 no-print">
          <div class="score-ring">${res.score}/${res.total}</div>
          <div style="flex:1;min-width:220px">
            <h2 class="mt-0 mb-8">${U.esc(this.examTitle(res.exam))}</h2>
            <div class="chip-row">
              <span class="badge open">${res.percent}% · ${I18N.t('band.' + this.bandOf(res.percent))}</span>
              <span class="badge progress">${I18N.t('res.submittedAt')}: ${U.fmtDateTime(res.submittedAt)}</span>
            </div>
          </div>
          <div class="head-actions">
            <a class="btn btn-outline" href="#/results">${I18N.t('myresults.title')}</a>
            <button class="btn btn-primary no-print" id="print-btn">🖨 ${I18N.t('print')}</button>
          </div>
        </div>

        <div class="card card-pad mb-16 print-only">
          <table style="width:100%;font-size:14px;line-height:1.9">
            <tr><td width="160"><b>${I18N.t('res.certStudent')}</b></td><td>: ${U.esc(studentName)} (${U.esc(u.username)})</td></tr>
            <tr><td><b>${I18N.t('res.certOrg')}</b></td><td>: ${U.esc(u.org || '-')}</td></tr>
            <tr><td><b>${I18N.t('res.certExam')}</b></td><td>: ${U.esc(this.examTitle(res.exam))}</td></tr>
            <tr><td><b>${I18N.t('res.certScore')}</b></td><td>: ${res.score} / ${res.total} (${res.percent}%)</td></tr>
            <tr><td><b>${I18N.t('res.certDate')}</b></td><td>: ${U.fmtDateTime(res.submittedAt)}</td></tr>
          </table>
        </div>

        <label class="no-print" style="display:flex;gap:8px;align-items:center;margin-bottom:14px;font-size:14px">
          <input type="checkbox" id="wrong-only"/> ${I18N.t('res.showWrongOnly')}
        </label>
        <div id="review-list">${listHtml()}</div>
      </div>`;

    document.getElementById('wrong-only').addEventListener('change', (e) => {
      wrongOnly = e.target.checked;
      document.getElementById('review-list').innerHTML = listHtml();
    });
    document.getElementById('print-btn').addEventListener('click', () => window.print());
  },

  // ---------------- results list ----------------
  async renderResults(el) {
    el.innerHTML = `<div class="container"><div class="page-loading">${I18N.t('loading')}</div></div>`;
    let results = [];
    try { results = (await API.get('/api/my/results')).results; }
    catch (e) { U.toast(e.message, 'err'); }

    const done = results.filter((r) => r.status === 'submitted' && r.percent != null)
      .slice().reverse();

    const trendPoints = done.map((r) => ({ label: U.fmtDate(r.submittedAt), value: r.percent }));

    el.innerHTML = `
      <div class="container">
        <div class="page-head"><h1>${I18N.t('myresults.title')}</h1></div>
        ${done.length > 1 ? `
          <div class="card chart-box mb-16">
            <p class="chart-title">${I18N.t('myresults.trend')}</p>
            ${Charts.line(trendPoints)}
          </div>` : ''}
        <div class="card table-wrap">
          <table class="data">
            <thead><tr>
              <th>${I18N.t('th.exam')}</th><th>${I18N.t('th.date')}</th>
              <th>${I18N.t('th.score')}</th><th>${I18N.t('th.percent')}</th>
              <th>${I18N.t('th.status')}</th><th></th>
            </tr></thead>
            <tbody>
              ${results.length ? results.map((r) => `
                <tr>
                  <td>${U.esc(this.examTitle(r))}</td>
                  <td class="num-cell">${U.fmtDateTime(r.submittedAt || r.startedAt)}</td>
                  <td class="num-cell">${r.score != null ? `${r.score}/${r.total}` : '—'}</td>
                  <td class="num-cell">${r.percent != null ? r.percent + '%' : '—'}</td>
                  <td>${r.status === 'submitted'
                    ? '<span class="badge submitted">✔</span>'
                    : `<a href="#/exam/${r.attemptId}" class="badge progress">${I18N.t('dash.resumeExam')}</a>`}</td>
                  <td>${r.status === 'submitted' ? `<a class="btn btn-outline btn-sm" href="#/result/${r.attemptId}">${I18N.t('dash.viewResult')} / 🖨</a>` : ''}</td>
                </tr>`).join('')
                : `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:30px">${I18N.t('dash.empty')}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  // ---------------- profile ----------------
  renderProfile(el) {
    const u = App.user;
    el.innerHTML = `
      <div class="container narrow">
        <div class="page-head"><h1>${I18N.t('profile.title')}</h1></div>
        <form class="card card-pad" id="pf-form">
          <div class="field"><label>${I18N.t('auth.username')}</label><input class="input" value="${U.esc(u.username)}" disabled/></div>
          <div class="form-grid">
            <div class="field"><label>${I18N.t('auth.firstName')}</label><input class="input" name="firstName" value="${U.esc(u.firstName)}" required/></div>
            <div class="field"><label>${I18N.t('auth.lastName')}</label><input class="input" name="lastName" value="${U.esc(u.lastName)}" required/></div>
          </div>
          <div class="field"><label>${I18N.t('auth.org')}</label><input class="input" name="org" value="${U.esc(u.org || '')}"/></div>
          <div class="field"><label>${I18N.t('profile.email')}</label><input class="input" name="email" type="email" value="${U.esc(u.email || '')}"/></div>
          <div class="chip-row"><span class="badge ${u.role}">${I18N.t('users.role')}: ${U.esc(u.role)}</span>
          <span class="badge active">${I18N.t('users.status')}: ${U.esc(u.status)}</span></div>
          <button class="btn btn-primary mt-16" type="submit">${I18N.t('save')}</button>
        </form>

        <form class="card card-pad section-block" id="pw-form">
          <h2 class="mt-0">${I18N.t('profile.changePw')}</h2>
          <div class="field"><label>${I18N.t('profile.currentPw')}</label><input class="input" type="password" name="currentPassword" required autocomplete="current-password"/></div>
          <div class="field"><label>${I18N.t('profile.newPw')}</label><input class="input" type="password" name="newPassword" required minlength="8" autocomplete="new-password"/></div>
          <button class="btn btn-primary" type="submit">${I18N.t('save')}</button>
        </form>
      </div>`;

    document.getElementById('pf-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        const r = await API.put('/api/me', {
          firstName: f.get('firstName'), lastName: f.get('lastName'),
          org: f.get('org'), email: f.get('email'),
        });
        App.user = r.user;
        App.rerenderHeader();
        U.toast(I18N.t('profile.saved'), 'ok');
      } catch (err) { U.toast(err.message, 'err'); }
    });

    document.getElementById('pw-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        await API.put('/api/me/password', { currentPassword: f.get('currentPassword'), newPassword: String(f.get('newPassword')) });
        e.target.reset();
        U.toast(I18N.t('profile.saved'), 'ok');
      } catch (err) { U.toast(err.message, 'err'); }
    });
  },
};
