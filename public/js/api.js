'use strict';

window.API = {
  async request(method, url, body) {
    const opts = { method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(url, opts);
    } catch (e) {
      const th = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ❌ วิธีแก้: (1) เปิด terminal ในโฟลเดอร์โปรเจกต์ รันคำสั่ง npm install แล้ว npm start (2) เปิดเบราว์เซอร์ที่ http://localhost:3000 — ห้ามดับเบิลคลิกไฟล์ index.html โดยตรง';
      const en = 'Cannot reach the server ❌ Fix: (1) In the project folder run: npm install then npm start  (2) Open your browser at http://localhost:3000 — do NOT open index.html directly from the file system.';
      throw { error: 'NETWORK', status: 0, message: I18N.lang() === 'th' ? th : en };
    }
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    if (!res.ok) {
      const code = data && data.error ? data.error : 'GENERIC';
      throw {
        status: res.status,
        error: code,
        retryAfterSec: data && data.retryAfterSec,
        message: I18N.t('err.' + code) !== 'err.' + code ? I18N.t('err.' + code) : (code || I18N.t('err.GENERIC')),
      };
    }
    return data;
  },

  get(url) { return this.request('GET', url); },
  post(url, body) { return this.request('POST', url, body); },
  put(url, body) { return this.request('PUT', url, body); },
  del(url) { return this.request('DELETE', url); },
};
