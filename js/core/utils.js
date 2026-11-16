/**
 * core/utils.js — utilidades transversales: formatos, fechas, RUT, CSV, hashing.
 * Se carga primero. Define el espacio de nombres global `VG`.
 * (Se usan scripts clásicos en vez de ES modules para que la app funcione
 *  abriendo index.html con doble clic: los navegadores bloquean `import`
 *  bajo el protocolo file://.)
 */
window.VG = window.VG || {};

(function (VG) {
  'use strict';

  /** Versión central del sistema. Debe coincidir con el archivo VERSION (lo valida el workflow de release). */
  VG.VERSION = '1.0.2';
  VG.BUILD_DATE = '2026-11-13';

  const params = new URLSearchParams(location.search);
  /** Modo desarrollo: index.html?dev=1 */
  VG.DEV = params.get('dev') === '1';

  const nfCLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
  const nf0 = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /**
   * ¿El almacenamiento local puede no ser confiable? Firefox y Safari aíslan cada archivo
   * abierto con doble clic (file://) y no garantizan conservar sus datos. Chrome y Edge sí.
   */
  VG.STORAGE_RISK = location.protocol === 'file:' && (/firefox|fxios/i.test(navigator.userAgent) || (/safari/i.test(navigator.userAgent) && !/chrome|chromium|crios|edg/i.test(navigator.userAgent)));
  VG.STORAGE_RISK_MSG = 'Abriste la app como archivo en ' + (/firefox|fxios/i.test(navigator.userAgent) ? 'Firefox' : 'Safari') + ', que puede no conservar tus datos al cerrar. Usa Chrome o Edge, o ábrela con el lanzador "Iniciar Winzer" incluido en la carpeta (funciona en cualquier navegador). Exporta un respaldo antes de cerrar.';

  const U = {
    /** Log solo en modo desarrollo. */
    log(...a) { if (VG.DEV) console.log('[VG]', ...a); },
    warn(...a) { if (VG.DEV) console.warn('[VG]', ...a); },

    /** Identificador único corto. */
    uid(prefix = '') {
      return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    },

    /** Número seguro: convierte strings con coma decimal; devuelve 0 si no es número. */
    n(v) {
      if (v === null || v === undefined || v === '') return 0;
      if (typeof v === 'number') return isFinite(v) ? v : 0;
      const x = parseFloat(String(v).replace(/\./g, (m, i, s) => (s.indexOf(',') > -1 ? '' : m)).replace(',', '.'));
      return isFinite(x) ? x : 0;
    },
    round(v, d = 0) { const f = Math.pow(10, d); return Math.round(U.n(v) * f) / f; },
    sum(arr, fn) { return arr.reduce((a, x) => a + U.n(fn ? fn(x) : x), 0); },
    avg(arr, fn) { return arr.length ? U.sum(arr, fn) / arr.length : 0; },
    groupBy(arr, fn) { return arr.reduce((m, x) => { const k = fn(x); (m[k] = m[k] || []).push(x); return m; }, {}); },
    clamp(v, a, b) { return Math.max(a, Math.min(b, v)); },

    /* ---------- Formatos ---------- */
    clp(v) { return nfCLP.format(Math.round(U.n(v))); },
    int(v) { return nf0.format(U.n(v)); },
    dec1(v) { return nf1.format(U.n(v)); },
    dec2(v) { return nf2.format(U.n(v)); },
    pct(v, d = 1) { return (U.n(v) * 100).toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'; },
    lt(v) { return nf0.format(U.n(v)) + ' L'; },
    kg(v) { return nf0.format(U.n(v)) + ' kg'; },
    compact(v) {
      const x = U.n(v), a = Math.abs(x);
      if (a >= 1e9) return (x / 1e9).toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' MM';
      if (a >= 1e6) return (x / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' M';
      if (a >= 1e3) return (x / 1e3).toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' mil';
      return nf0.format(x);
    },
    compactCLP(v) { return '$' + U.compact(v); },

    /* ---------- Fechas (ISO yyyy-mm-dd, zona local) ---------- */
    today() { return U.isoDate(new Date()); },
    isoDate(d) {
      if (!d) return '';
      const x = d instanceof Date ? d : new Date(d + (String(d).length === 10 ? 'T12:00:00' : ''));
      if (isNaN(x)) return '';
      return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    },
    parseDate(s) { if (!s) return null; const d = new Date(String(s).slice(0, 10) + 'T12:00:00'); return isNaN(d) ? null : d; },
    fmtDate(s) { const d = U.parseDate(s); return d ? d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'; },
    fmtDateTime(s) { const d = new Date(s); return isNaN(d) ? '—' : d.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }); },
    addDays(s, n) { const d = U.parseDate(s); if (!d) return ''; d.setDate(d.getDate() + Math.round(U.n(n))); return U.isoDate(d); },
    diffDays(a, b) { const x = U.parseDate(a), y = U.parseDate(b); if (!x || !y) return null; return Math.round((y - x) / 86400000); },
    year(s) { const d = U.parseDate(s); return d ? d.getFullYear() : null; },
    month(s) { return s ? String(s).slice(0, 7) : ''; },
    monthName(ym) {
      const [y, m] = String(ym).split('-').map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString('es-CL', { month: 'short', year: '2-digit' }).replace('.', '');
    },
    monthsOfYear(y) { return Array.from({ length: 12 }, (_, i) => y + '-' + String(i + 1).padStart(2, '0')); },
    MESES: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],

    /* ---------- RUT chileno ---------- */
    /** Limpia un RUT: deja dígitos y K. */
    rutClean(r) { return String(r || '').replace(/[^0-9kK]/g, '').toUpperCase(); },
    /** Calcula el dígito verificador (módulo 11). */
    rutDV(body) {
      let s = 0, m = 2;
      for (let i = String(body).length - 1; i >= 0; i--) { s += Number(String(body)[i]) * m; m = m === 7 ? 2 : m + 1; }
      const r = 11 - (s % 11);
      return r === 11 ? '0' : r === 10 ? 'K' : String(r);
    },
    /** Valida un RUT con dígito verificador. */
    rutValid(r) {
      const c = U.rutClean(r);
      if (c.length < 2) return false;
      const body = c.slice(0, -1), dv = c.slice(-1);
      if (!/^\d+$/.test(body)) return false;
      return U.rutDV(body) === dv;
    },
    /** Formatea 12345678-5 → 12.345.678-5 */
    rutFormat(r) {
      const c = U.rutClean(r);
      if (c.length < 2) return r || '';
      const body = c.slice(0, -1), dv = c.slice(-1);
      return body.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv;
    },
    /** RUT sin puntos (formato SII para XML): 12345678-5 */
    rutSII(r) { const c = U.rutClean(r); return c ? c.slice(0, -1) + '-' + c.slice(-1) : ''; },

    /* ---------- HTML / DOM ---------- */
    esc(s) {
      return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    /** Crea un elemento desde HTML. */
    html(str) { const t = document.createElement('template'); t.innerHTML = str.trim(); return t.content.firstElementChild; },
    $(sel, root = document) { return root.querySelector(sel); },
    $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); },
    debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },

    /** Memoización simple por clave, invalidada por la versión de datos de db. */
    memo(key, fn) {
      const v = VG.db ? VG.db.version : 0;
      U._memo = U._memo || {};
      const e = U._memo[key];
      if (e && e.v === v) return e.val;
      const val = fn();
      U._memo[key] = { v, val };
      return val;
    },

    /* ---------- Archivos ---------- */
    download(filename, content, mime = 'text/plain;charset=utf-8') {
      const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
    /** Genera CSV (separador ; para Excel en español, con BOM UTF-8). */
    toCSV(rows, cols) {
      const q = v => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const head = cols.map(c => q(c.label)).join(';');
      const body = rows.map(r => cols.map(c => q(c.csv ? c.csv(r) : (typeof c.value === 'function' ? c.value(r) : r[c.key]))).join(';')).join('\r\n');
      return '﻿' + head + '\r\n' + body;
    },
    /** Parser CSV tolerante (autodetecta ; o ,). Devuelve array de arrays. */
    parseCSV(text) {
      text = String(text).replace(/^﻿/, '');
      const first = text.split(/\r?\n/)[0] || '';
      const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
      const rows = []; let row = [], cur = '', inQ = false;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQ) {
          if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
          else if (c === '"') inQ = false;
          else cur += c;
        } else if (c === '"') inQ = true;
        else if (c === sep) { row.push(cur); cur = ''; }
        else if (c === '\n' || c === '\r') {
          if (c === '\r' && text[i + 1] === '\n') i++;
          row.push(cur); cur = '';
          if (row.some(x => x !== '')) rows.push(row);
          row = [];
        } else cur += c;
      }
      row.push(cur); if (row.some(x => x !== '')) rows.push(row);
      return rows;
    },
    readFile(file) {
      return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); });
    },

    /* ---------- Hash SHA-256 ---------- */
    /**
     * SHA-256 en hex. Usa crypto.subtle si está disponible (contextos seguros,
     * incluido file:// en navegadores modernos) o una implementación JS de respaldo.
     */
    async sha256(text) {
      const data = new TextEncoder().encode(text);
      if (window.crypto && crypto.subtle && crypto.subtle.digest) {
        try {
          const buf = await crypto.subtle.digest('SHA-256', data);
          return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) { /* respaldo */ }
      }
      return sha256js(data);
    }
  };

  /** Implementación JS compacta de SHA-256 (respaldo). */
  function sha256js(bytes) {
    const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const l = bytes.length, bitLen = l * 8;
    const withPad = new Uint8Array(((l + 9 + 63) >> 6) << 6);
    withPad.set(bytes); withPad[l] = 0x80;
    const dv = new DataView(withPad.buffer);
    dv.setUint32(withPad.length - 4, bitLen >>> 0); dv.setUint32(withPad.length - 8, Math.floor(bitLen / 2 ** 32));
    const W = new Uint32Array(64), r = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < withPad.length; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = r(W[i - 15], 7) ^ r(W[i - 15], 18) ^ (W[i - 15] >>> 3);
        const s1 = r(W[i - 2], 17) ^ r(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
        const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H = H.map((x, i) => (x + [a, b, c, d, e, f, g, h][i]) >>> 0);
    }
    return H.map(x => x.toString(16).padStart(8, '0')).join('');
  }

  VG.utils = U;
})(window.VG);
