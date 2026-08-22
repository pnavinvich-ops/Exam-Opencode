'use strict';

window.ViewsAuth = {
  renderLogin(el) {
    el.innerHTML = `
      <div class="container narrow">
        <div class="auth-hero">
          <div class="big">⚛️</div>
          <h1>${I18N.t('auth.loginTitle')}</h1>
          <p>${I18N.t('auth.loginSub')}</p>
        </div>
        <form class="card card-pad" id="login-form" novalidate>
          <div class="field">
            <label>${I18N.t('auth.username')}</label>
            <input class="input" name="username" autocomplete="username" required />
          </div>
          <div class="field">
            <label>${I18N.t('auth.password')}</label>
            <input class="input" type="password" name="password" autocomplete="current-password" required />
          </div>
          <div id="login-err" hidden></div>
          <button class="btn btn-primary btn-block" type="submit">${I18N.t('auth.login')}</button>
        </form>
        <p style="text-align:center;margin-top:16px">
          <a href="#/register" class="muted small">${I18N.t('auth.noAccount')}</a>
        </p>
        <div class="demo-note mt-16">${U.esc(I18N.t('auth.demoAccounts'))}</div>
      </div>`;

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const errBox = document.getElementById('login-err');
      errBox.hidden = true;
      try {
        const r = await API.post('/api/auth/login', { username: f.get('username'), password: f.get('password') });
        App.user = r.user;
        U.toast(I18N.lang() === 'th' ? 'เข้าสู่ระบบสำเร็จ' : 'Signed in', 'ok');
        location.hash = r.user.role === 'admin' ? '#/admin' : '#/dashboard';
        App.route();
      } catch (err) {
        errBox.hidden = false;
        errBox.className = 'form-error';
        errBox.textContent = err.retryAfterSec
          ? `${err.message} (${err.retryAfterSec}s)` : (err.message || I18N.t('err.GENERIC'));
      }
    });
  },

  renderRegister(el) {
    el.innerHTML = `
      <div class="container narrow">
        <div class="auth-hero">
          <div class="big">📝</div>
          <h1>${I18N.t('auth.registerTitle')}</h1>
          <p>${I18N.t('auth.registerSub')}</p>
        </div>
        <form class="card card-pad" id="reg-form" novalidate>
          <div class="form-grid">
            <div class="field"><label>${I18N.t('auth.firstName')} *</label><input class="input" name="firstName" required maxlength="80"/></div>
            <div class="field"><label>${I18N.t('auth.lastName')} *</label><input class="input" name="lastName" required maxlength="80"/></div>
          </div>
          <div class="field"><label>${I18N.t('auth.org')}</label><input class="input" name="org" maxlength="120"/></div>
          <div class="field"><label>${I18N.t('auth.username')} *</label><input class="input" name="username" required autocomplete="off"/>
            <div class="form-hint">a-z A-Z 0-9 . _ @ - (3–40)</div></div>
          <div class="field"><label>${I18N.t('auth.password')} *</label><input class="input" type="password" name="password" required/>
            <div class="form-hint">≥ 8 ตัวอักษร / at least 8 chars</div></div>
          <div id="reg-err" hidden></div>
          <button class="btn btn-primary btn-block" type="submit">${I18N.t('auth.register')}</button>
        </form>
        <p style="text-align:center;margin-top:16px">
          <a href="#/login" class="muted small">${I18N.t('auth.haveAccount')}</a>
        </p>
      </div>`;

    document.getElementById('reg-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const errBox = document.getElementById('reg-err');
      errBox.hidden = true;
      try {
        const r = await API.post('/api/auth/register', {
          firstName: f.get('firstName'), lastName: f.get('lastName'),
          org: f.get('org'), username: f.get('username'), password: String(f.get('password')),
        });
        this.showOtpModal(f.get('username'), r.demoCode);
      } catch (err) {
        errBox.hidden = false;
        errBox.className = 'form-error';
        errBox.textContent = err.message || I18N.t('err.GENERIC');
      }
    });
  },

  showOtpModal(username, demoCode) {
    const lang = I18N.lang();
    const m = U.modal(`
      <div class="modal-head"><h3>${I18N.t('auth.verify')}</h3></div>
      <div class="modal-body">
        <p>${I18N.t('auth.otpSent')} — ${U.esc(username)}</p>
        <div class="demo-note mb-8">${I18N.t('auth.otpDemoNote')}</div>
        <div class="otp-code">${U.esc(demoCode)}</div>
        <div class="field"><label>${I18N.t('auth.otpCode')}</label>
          <input class="input" id="otp-input" inputmode="numeric" maxlength="6" autocomplete="one-time-code"/></div>
        <div id="otp-err" hidden></div>
      </div>
      <div class="modal-foot" style="justify-content:space-between">
        <button class="btn btn-outline btn-sm" id="otp-resend">${I18N.t('auth.resend')}</button>
        <button class="btn btn-primary" id="otp-go">${I18N.t('auth.verify')}</button>
      </div>`, { locked: true });

    const doVerify = async () => {
      const code = m.el.querySelector('#otp-input').value.trim();
      try {
        const r = await API.post('/api/auth/verify-otp', { username, code });
        App.user = r.user;
        m.close();
        U.toast(lang === 'th' ? 'ยืนยันตัวตนสำเร็จ ยินดีต้อนรับ!' : 'Verified. Welcome!', 'ok');
        location.hash = '#/dashboard';
        App.route();
      } catch (err) {
        const box = m.el.querySelector('#otp-err');
        box.hidden = false; box.className = 'form-error';
        box.textContent = err.message || I18N.t('err.GENERIC');
      }
    };
    m.el.querySelector('#otp-go').addEventListener('click', doVerify);
    m.el.querySelector('#otp-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doVerify(); });
    m.el.querySelector('#otp-resend').addEventListener('click', async () => {
      try {
        const r = await API.post('/api/auth/resend-otp', { username });
        m.el.querySelector('.otp-code').textContent = r.demoCode;
        U.toast(lang === 'th' ? 'ส่งรหัสใหม่แล้ว' : 'New code sent', 'ok');
      } catch (err) { U.toast(err.message, 'err'); }
    });
  },
};
