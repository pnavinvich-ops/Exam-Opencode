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
      throw { error: 'NETWORK', message: I18N.t('err.GENERIC') };
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
