/* common.js — tiện ích dùng chung. Phần mềm: Lê Duy Nam — GV Trường CĐ Dầu khí */
(function (root) {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ----------------------------- lưu trữ cục bộ ----------------------------- */
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('quizapp.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('quizapp.' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem('quizapp.' + k); } catch (e) { /* bỏ qua */ } }
  };
  const IDB = {
    _db: null,
    open() {
      if (this._db) return Promise.resolve(this._db);
      return new Promise((res, rej) => {
        let rq;
        try { rq = indexedDB.open('quizapp', 1); } catch (e) { rej(e); return; }
        rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
        rq.onsuccess = () => { this._db = rq.result; res(this._db); };
        rq.onerror = () => rej(rq.error);
      });
    },
    async get(k) { try { const db = await this.open(); return await new Promise((res) => { const r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); }); } catch (e) { return undefined; } },
    async set(k, v) { try { const db = await this.open(); return await new Promise((res) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(true); t.onerror = () => res(false); }); } catch (e) { return false; } }
  };

  /* --------------------------------- API --------------------------------- */
  function apiFromParams(params) {
    if (params.get('api')) return params.get('api');
    if (params.get('s')) return 'https://script.google.com/macros/s/' + params.get('s') + '/exec';
    if (root.QUIZ_API) return root.QUIZ_API;
    return LS.get('apiUrl', '');
  }
  function linkParamForApi(url) {
    if (root.QUIZ_API && url === root.QUIZ_API) return '';
    const m = String(url).match(/script\.google\.com\/macros\/s\/([^/]+)\/exec/);
    return m ? '&s=' + m[1] : '&api=' + encodeURIComponent(url);
  }
  async function api(url, payload, tries) {
    if (!url) throw new Error('Chưa cài đặt địa chỉ máy chủ (Apps Script)');
    tries = tries || 3;
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try {
        const r = await fetch(url, { method: 'POST', body: JSON.stringify(payload), redirect: 'follow' });
        const t = await r.text();
        let j; try { j = JSON.parse(t); } catch (e) { throw new Error('Máy chủ trả về dữ liệu lạ — kiểm tra lại bước triển khai Apps Script (quyền truy cập "Bất kỳ ai").'); }
        if (!j.ok) { const e = new Error(j.error || 'Lỗi máy chủ'); e.server = true; throw e; }
        return j;
      } catch (e) {
        lastErr = e;
        if (e.server) throw e;
        await new Promise(r => setTimeout(r, 800 * (i + 1)));
      }
    }
    if (lastErr && /Failed to fetch|NetworkError|Load failed/i.test(lastErr.message)) throw new Error('Không kết nối được máy chủ. Kiểm tra mạng Internet rồi thử lại.');
    throw lastErr;
  }

  /* ------------------------------ ZIP (store) ------------------------------ */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zipStore(files) {
    const enc = new TextEncoder();
    const parts = [], central = []; let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ------------------------------ XLSX writer ------------------------------ */
  // sheets: [{name, rows:[[v | {v, s}]], cols:[width], merges:['A1:F1'], freeze: rowCount}]
  // s: 0 thường | 1 tiêu đề cột | 2 ô có viền | 3 số 0.0 có viền | 4 số nguyên có viền | 5 tiêu đề lớn | 6 chữ nghiêng
  function colName(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function xmlEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }
  function buildXlsx(sheets) {
    const files = [];
    const sheetXml = sheets.map((sh) => {
      let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
      if (sh.freeze) x += '<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + sh.freeze + '" topLeftCell="A' + (sh.freeze + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
      if (sh.cols && sh.cols.length) x += '<cols>' + sh.cols.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>';
      x += '<sheetData>';
      sh.rows.forEach((row, ri) => {
        x += '<row r="' + (ri + 1) + '">';
        row.forEach((c, ci) => {
          if (c == null || c === '') { return; }
          const cell = (typeof c === 'object' && !(c instanceof Date)) ? c : { v: c };
          const ref = colName(ci) + (ri + 1), s = cell.s ? ' s="' + cell.s + '"' : '';
          if (cell.v == null || cell.v === '') { if (cell.s) x += '<c r="' + ref + '"' + s + '/>'; return; }
          if (typeof cell.v === 'number' && isFinite(cell.v)) x += '<c r="' + ref + '"' + s + '><v>' + cell.v + '</v></c>';
          else x += '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(cell.v) + '</t></is></c>';
        });
        x += '</row>';
      });
      x += '</sheetData>';
      if (sh.merges && sh.merges.length) x += '<mergeCells count="' + sh.merges.length + '">' + sh.merges.map(m => '<mergeCell ref="' + m + '"/>').join('') + '</mergeCells>';
      x += '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/></worksheet>';
      return x;
    });
    files.push({ name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>' });
    files.push({ name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' });
    files.push({ name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map((s, i) => '<sheet name="' + xmlEsc(s.name.slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>' });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' });
    files.push({ name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.0"/></numFmts><fonts count="4"><font><sz val="12"/><name val="Times New Roman"/></font><font><b/><sz val="12"/><name val="Times New Roman"/></font><font><b/><sz val="14"/><color rgb="FF0B3D5C"/><name val="Times New Roman"/></font><font><i/><sz val="11"/><color rgb="FF555555"/><name val="Times New Roman"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE9F2"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF7F8C96"/></left><right style="thin"><color rgb="FF7F8C96"/></right><top style="thin"><color rgb="FF7F8C96"/></top><bottom style="thin"><color rgb="FF7F8C96"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' });
    sheetXml.forEach((x, i) => files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: x }));
    return zipStore(files);
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  /* ------------------------------- định dạng ------------------------------- */
  function fmtSec(s) { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); }
  function fmtDur(s) { s = Math.round(+s || 0); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ' giờ ' : '') + (m ? m + ' phút ' : '') + (h ? '' : x + ' giây'); }
  function fmtTime(t) { if (!t) return ''; const d = new Date(t); if (isNaN(d)) return String(t); const p = (n) => String(n).padStart(2, '0'); return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function toast(msg, kind) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99;max-width:92vw;padding:11px 16px;border-radius:11px;font-weight:600;box-shadow:0 8px 30px rgba(0,0,0,.25);transition:opacity .25s'; document.body.appendChild(t); }
    t.textContent = msg;
    t.style.background = kind === 'bad' ? '#c0362c' : kind === 'ok' ? '#138a52' : '#0b3d5c'; t.style.color = '#fff'; t.style.opacity = '1';
    clearTimeout(t._h); t._h = setTimeout(() => { t.style.opacity = '0'; }, kind === 'bad' ? 5200 : 2800);
  }
  /** Đang chạy trong phần mềm Windows/Mac? (ứng dụng gắn dấu hiệu vào User-Agent) */
  const isApp = /TronDeThiApp\//.test(navigator.userAgent || '');
  const AUTHOR_HTML = '<div class="author"><img src="img/avatar-nam.jpg" alt="Lê Duy Nam"><div><b>Phần mềm được tạo bởi Lê Duy Nam</b><span>Giảng viên Trường Cao đẳng Dầu khí (PV College)</span></div></div>';

  /* ------------------------------- nhạc nền ------------------------------- */
  const Music = (() => {
    let audio = null, yt = null, ytReady = null, vol = 35, muted = false, on = false;
    function parse(url) {
      url = String(url || '').trim(); if (!url) return null;
      let m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/|music\.youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/);
      const list = (url.match(/[?&]list=([\w-]+)/) || [])[1];
      if (m) return { kind: 'yt', id: m[1], list };
      if (/youtube\.com/.test(url) && list) return { kind: 'yt', list };
      m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?(?:.*&)?id=|uc\?(?:.*&)?id=)([\w-]{20,})/);
      if (m) return { kind: 'audio', src: 'https://drive.google.com/uc?export=download&id=' + m[1], drive: true };
      if (/dropbox\.com/.test(url)) return { kind: 'audio', src: url.replace(/([?&])dl=0/, '$1raw=1') };
      return { kind: 'audio', src: url };
    }
    function loadYT() {
      if (ytReady) return ytReady;
      ytReady = new Promise((res, rej) => {
        if (root.YT && root.YT.Player) return res();
        const prev = root.onYouTubeIframeAPIReady;
        root.onYouTubeIframeAPIReady = () => { if (prev) prev(); res(); };
        const sc = document.createElement('script'); sc.src = 'https://www.youtube.com/iframe_api';
        sc.onerror = () => { ytReady = null; rej(new Error('Không tải được YouTube')); };
        document.head.appendChild(sc);
      });
      return ytReady;
    }
    function host() {
      let h = document.getElementById('ytMusic');
      if (!h) { h = document.createElement('div'); h.id = 'ytMusic'; h.setAttribute('aria-hidden', 'true'); h.style.cssText = 'position:fixed;left:-10000px;top:0;width:220px;height:220px;opacity:0;pointer-events:none;overflow:hidden'; document.body.appendChild(h); }
      h.innerHTML = '<div id="ytMusicPlayer"></div>';
      return h;
    }
    function stop() {
      on = false;
      if (audio) { try { audio.pause(); } catch (e) { /* bỏ qua */ } audio.src = ''; audio = null; }
      if (yt) { try { yt.destroy(); } catch (e) { /* bỏ qua */ } yt = null; }
      const h = document.getElementById('ytMusic'); if (h) h.innerHTML = '';
    }
    /** Phát nhạc (gọi ngay trong sự kiện bấm nút để trình duyệt cho phép phát tiếng) */
    async function start(url, volume, onErr) {
      stop();
      const p = parse(url); if (!p) return false;
      vol = Math.max(0, Math.min(100, +volume || 35));
      const fail = (msg) => { on = false; if (onErr) onErr(msg); };
      if (p.kind === 'audio') {
        audio = new Audio(); audio.loop = true; audio.preload = 'auto'; audio.volume = vol / 100; audio.muted = muted;
        audio.onerror = () => fail(p.drive ? 'Không phát được file Google Drive — kiểm tra file đã chia sẻ “Bất kỳ ai có đường liên kết” và là file nhạc (mp3/m4a).' : 'Không phát được link nhạc này — cần link trực tiếp tới file .mp3/.m4a/.ogg, link YouTube hoặc Google Drive.');
        audio.src = p.src;
        try { await audio.play(); on = true; return true; } catch (e) { if (e && e.name === 'NotAllowedError') fail('Trình duyệt chặn tự phát nhạc — bấm nút 🔊 để bật.'); return false; }
      }
      try { await loadYT(); } catch (e) { fail('Không tải được YouTube (mạng chặn YouTube?).'); return false; }
      host();
      on = true;
      const pv = { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1, rel: 0, loop: 1, fs: 0, iv_load_policy: 3 };
      if (p.list) { pv.listType = 'playlist'; pv.list = p.list; } else pv.playlist = p.id;
      yt = new root.YT.Player('ytMusicPlayer', {
        width: 220, height: 220, videoId: p.id || undefined, playerVars: pv,
        events: {
          onReady: (e) => { try { e.target.setVolume(vol); if (muted) e.target.mute(); e.target.playVideo(); } catch (x) { /* bỏ qua */ } },
          onError: (e) => fail(e && (e.data === 101 || e.data === 150) ? 'Video YouTube này không cho phát nhúng — hãy chọn video khác.' : 'Không phát được video YouTube này (link sai hoặc video bị xóa).')
        }
      });
      return true;
    }
    function setVol(v) { vol = Math.max(0, Math.min(100, +v || 0)); if (audio) audio.volume = vol / 100; if (yt && yt.setVolume) try { yt.setVolume(vol); } catch (e) { /* bỏ qua */ } }
    function setMuted(m) { muted = !!m; if (audio) audio.muted = muted; if (yt && yt.mute) try { muted ? yt.mute() : (yt.unMute(), yt.playVideo()); } catch (e) { /* bỏ qua */ } if (!muted && audio && audio.paused) audio.play().catch(() => {}); }
    return { start, stop, setVol, setMuted, muted: () => muted, playing: () => on, kind: (u) => (parse(u) || {}).kind };
  })();

  root.QA = { isApp, Music, $, $$, esc, LS, IDB, api, apiFromParams, linkParamForApi, buildXlsx, download, fmtSec, fmtDur, fmtTime, toast, colName, AUTHOR_HTML };
})(window);
