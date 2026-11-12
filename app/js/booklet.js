/* booklet.js — Nạp "Đề TOEIC nguyên bộ": sách đề PDF + đáp án + file nghe theo Part.
 * Học sinh xem đúng trang đề gốc (ảnh), tô phiếu trả lời trên màn hình, nghe file theo từng Part.
 * Phần mềm: Lê Duy Nam — GV Trường CĐ Dầu khí */
(function (root) {
  'use strict';
  const { $, $$, esc, toast } = QA;
  const L = 'ABCD';
  const STD_PARTS = '1:1-6, 2:7-31, 3:32-70, 4:71-100, 5:101-130, 6:131-146, 7:147-200';
  const PAGE_W = 1500;

  /* ------------------------------ tiện ích ------------------------------ */
  function parseParts(s) {
    const out = [];
    String(s || '').split(/[,;\n]+/).forEach(x => {
      const m = x.match(/^\s*(?:part\s*)?([1-7])\s*[:=]\s*(\d+)\s*[-–]\s*(\d+)\s*$/i);
      if (m) out.push({ part: +m[1], a: +m[2], b: +m[3] });
    });
    return out.sort((x, y) => x.a - y.a);
  }
  const partOf = (parts, n) => { const p = parts.find(x => n >= x.a && n <= x.b); return p ? p.part : 0; };
  const skillOfPart = (p) => (p >= 1 && p <= 4 ? 'L' : 'R');
  /** Đọc đáp án: "1 (D) 2 (A)…", "1.D 2-A", "1D", hoặc chuỗi liền "DACBC…" (dòng RC / Reading bắt đầu từ câu 101) */
  function parseKey(txt) {
    const map = {}; let ptr = 1;
    String(txt || '').split(/\r?\n/).forEach(line => {
      const l = line.trim(); if (!l) return;
      const re = /(\d{1,3})\s*[.):\-–]?\s*\(?\s*([A-Da-d])\s*\)?(?![A-Za-z])/g;
      let m, found = false;
      while ((m = re.exec(l))) { const n = +m[1]; if (n >= 1 && n <= 300) { map[n] = 'ABCD'.indexOf(m[2].toUpperCase()); ptr = n + 1; found = true; } }
      if (found) return;
      let body = l, label = '';
      const lm = l.match(/^([^:]{0,30}):(.*)$/); if (lm) { label = lm[1]; body = lm[2]; }
      const letters = body.replace(/[\s,.;|/_-]+/g, '');
      if (letters.length >= 3 && /^[A-Da-d]+$/.test(letters)) {
        if (/\b(RC|READING)\b|ĐỌC|DOC/i.test(label) && ptr <= 100) ptr = 101;
        if (/\b(LC|LISTENING)\b|NGHE/i.test(label)) ptr = 1;
        const st = label.match(/(\d{1,3})\s*$/); if (st) ptr = +st[1];
        for (const ch of letters) map[ptr++] = 'ABCD'.indexOf(ch.toUpperCase());
      } else if (/^\s*(RC|READING|ĐỌC)\b/i.test(l) && ptr <= 100) ptr = 101;
    });
    return map;
  }
  const keyText = (map) => {
    const nums = Object.keys(map).map(Number).sort((a, b) => a - b);
    const lines = []; let cur = [];
    nums.forEach(n => { cur.push(n + L[map[n]]); if (cur.length === 10) { lines.push(cur.join(' ')); cur = []; } });
    if (cur.length) lines.push(cur.join(' '));
    return lines.join('\n');
  };
  function blobB64(b) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(b); }); }
  const extOf = (n) => (String(n).match(/\.([a-z0-9]+)$/i) || ['', ''])[1].toLowerCase();
  const AUD_EXT = ['mp3', 'm4a', 'wav', 'ogg', 'aac', 'wma', 'oga', 'webm'];
  const IMG_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
  const MIME = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', aac: 'audio/aac', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf' };
  const baseName = (n) => String(n).split('/').pop();

  /** Giải nén .zip (bộ đề tải về) thành danh sách file */
  async function unzipAll(file) {
    const z = await QuizDocx.readZip(await file.arrayBuffer());
    const out = [];
    for (const name of z.names) {
      if (/\/$/.test(name) || /(^|\/)(__MACOSX|\.DS_Store)/.test(name)) continue;
      const ext = extOf(name);
      if (!['pdf', 'docx', 'txt', 'csv'].concat(AUD_EXT, IMG_EXT).includes(ext)) continue;
      const data = await z.get(name); if (!data) continue;
      out.push(new File([data], baseName(name), { type: MIME[ext] || '' }));
    }
    return out;
  }
  /** Lấy chữ + hình trong file đáp án .docx (đáp án thường là ảnh chụp bảng) */
  async function readKeyDocx(file) {
    const z = await QuizDocx.readZip(await file.arrayBuffer());
    const td = new TextDecoder('utf-8');
    const xml = td.decode((await z.get('word/document.xml')) || new Uint8Array());
    const text = xml.replace(/<w:tab\/>/g, ' ').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const imgs = [];
    for (const n of z.names.filter(n => /^word\/media\/.+\.(png|jpe?g|gif|webp)$/i.test(n)).sort()) {
      const d = await z.get(n); if (d) imgs.push(URL.createObjectURL(new Blob([d], { type: MIME[extOf(n)] || 'image/png' })));
    }
    return { text, imgs };
  }

  /* ------------------------------ PDF ------------------------------ */
  let pdfjs = null;
  async function pdfLib() {
    if (pdfjs) return pdfjs;
    const base = new URL('js/vendor/', location.href).href;
    pdfjs = await import(base + 'pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
    return pdfjs;
  }
  /** Vẽ từng trang PDF thành ảnh JPEG + ảnh nhỏ; đọc số câu in trên trang (nếu PDF có lớp chữ) */
  async function renderPdf(file, onPage) {
    const lib = await pdfLib();
    const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const doc = await task.promise;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const vp1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: PAGE_W / vp1.width });
      const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.72));
      const tw = 150, th = Math.round(cv.height * tw / cv.width);
      const tc = document.createElement('canvas'); tc.width = tw; tc.height = th;
      tc.getContext('2d').drawImage(cv, 0, 0, tw, th);
      const thumb = tc.toDataURL('image/jpeg', 0.6);
      let nums = [];
      try {
        const txt = await page.getTextContent();
        txt.items.forEach(it => { const m = /^\s*(\d{1,3})\s*[.,]\s*/.exec(it.str || ''); if (m) nums.push(+m[1]); });
      } catch (e) { nums = []; }
      onPage({ blob, thumb, w: cv.width, h: cv.height, nums: Array.from(new Set(nums)).sort((a, b) => a - b), n: i, total: doc.numPages });
      page.cleanup();
    }
    try { task.destroy(); } catch (e) { /* bỏ qua */ }
  }

  /* ------------------------ gán trang cho từng câu ------------------------ */
  /** pages: [{sec, first}] ; trả về chỉ số trang chứa câu n (trang cuối có "câu đầu" ≤ n, cùng phần thi) */
  function pageOfNum(pages, n, sec) {
    let best = null;
    pages.forEach((p, i) => { if (p.first != null && p.first !== '' && +p.first <= n && (!sec || !p.sec || p.sec === sec || p.sec === 'LR')) best = i; });
    return best;
  }
  function autoFirst(pages, valid) {
    let prev = 0;
    pages.forEach(p => {
      const c = (p.nums || []).filter(n => valid(n, p.sec) && n > prev);
      p.first = c.length ? c[0] : null;
      if (p.first) prev = c[c.length - 1];
    });
  }
  function assignPages(bank) {
    const pages = bank.book.pages;
    bank.questions.forEach(q => { q.page = pageOfNum(pages, q.num, q.skill); });
  }

  /** Ô "dán nhanh": câu đầu của các trang trong một file PDF, cách nhau bằng dấu phẩy (bỏ trống = trang không có câu hỏi) */
  function quickLists(pages) {
    const files = Array.from(new Set(pages.map(p => p.file)));
    return '<div class="grid g2" style="margin:6px 0">' + files.map(f => {
      const ps = pages.filter(p => p.file === f);
      return '<div><label>' + esc((ps[0].sec === 'L' ? 'LC' : ps[0].sec === 'R' ? 'RC' : 'PDF') + ' — ' + (f || '')) + ' (' + ps.length + ' trang): câu đầu mỗi trang</label><input type="text" data-quick="' + esc(f) + '" value="' + ps.map(p => p.first || '').join(', ') + '" placeholder="vd: 101, 109, 121, , 131 (bỏ trống = trang không có câu)"></div>';
    }).join('') + '</div>';
  }
  function bindQuick(box, pages, after) {
    $$('[data-quick]', box).forEach(inp => inp.onchange = () => {
      const ps = pages.filter(p => p.file === inp.dataset.quick);
      const vals = inp.value.split(/[,;]/).map(x => x.trim());
      ps.forEach((p, i) => { const v = vals[i]; p.first = v && /^\d+$/.test(v) ? +v : null; });
      after();
    });
  }

  /* ------------------------------ màn hình nạp ------------------------------ */
  function openImport(ctx) {
    const st = { pdfs: [], auds: [], keyImgs: [], keyText: '', name: '', pages: [], rendered: false };
    const partSel = (v) => '<select data-apart>' + [['1', 'Part 1'], ['2', 'Part 2'], ['3', 'Part 3'], ['4', 'Part 4'], ['all', 'Toàn bộ phần Nghe (1 file)'], ['', '— không dùng —']].map(o => '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>';
    const secSel = (v) => '<select data-psec>' + [['L', 'Phần Nghe (Listening)'], ['R', 'Phần Đọc (Reading)'], ['LR', 'Cả Nghe và Đọc']].map(o => '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>';
    const render = () => {
      const km = parseKey(st.keyText), kn = Object.keys(km).length;
      ctx.modal('<div class="row"><h2 style="margin:0">Nạp đề TOEIC nguyên bộ</h2><span class="spacer"></span><button class="btn sm" id="bkClose">Đóng</button></div>' +
        '<p class="hint">Dùng cho bộ đề TOEIC / ETS có sẵn: <b>file PDF đề</b> (LC, RC), <b>đáp án</b> và <b>file nghe theo Part</b>. Học sinh xem đúng trang đề gốc trên điện thoại/máy tính, chọn đáp án ở phiếu trả lời ngay dưới trang đề, file nghe tự phát lần lượt Part 1 → 4. Có thể chọn thẳng file <b>.zip</b> của bộ đề.</p>' +
        '<label class="drop" id="bkDrop" for="bkIn"><b>Kéo thả hoặc bấm để chọn file</b> — .zip bộ đề, hoặc các file .pdf, .mp3, file đáp án (.docx / .txt / ảnh)<div class="hint">Chọn được nhiều file cùng lúc.</div></label><input type="file" id="bkIn" class="hide" multiple accept=".zip,.pdf,.docx,.txt,.csv,audio/*,image/*,.mp3,.m4a,.wav">' +
        '<div id="bkMsg"></div>' +
        (st.pdfs.length || st.auds.length ? '<div class="grid g2" style="margin-top:10px">' +
          '<div><h3 style="margin:4px 0">📄 File đề PDF</h3>' + (st.pdfs.length ? '<table class="tbl">' + st.pdfs.map((p, i) => '<tr data-pi="' + i + '"><td>' + esc(p.file.name) + '<div class="hint">' + (p.count ? p.count + ' trang' : '') + '</div></td><td>' + secSel(p.sec) + '</td></tr>').join('') + '</table>' : '<div class="msg warn">Chưa có file PDF đề.</div>') + '</div>' +
          '<div><h3 style="margin:4px 0">🎧 File nghe</h3>' + (st.auds.length ? '<table class="tbl">' + st.auds.map((a, i) => '<tr data-ai="' + i + '"><td>' + esc(a.file.name) + '<div class="hint">' + (a.file.size / 1048576).toFixed(1) + ' MB' + (a.file.size > 30 * 1048576 ? ' — <b style="color:var(--bad)">quá 30 MB, hãy nén lại</b>' : '') + '</div></td><td>' + partSel(a.part) + '</td></tr>').join('') + '</table>' : '<div class="msg warn">Chưa có file nghe (đề chỉ có phần Đọc thì bỏ qua).</div>') + '</div></div>' : '') +
        '<div class="grid g2" style="margin-top:10px"><div><label>Tên đề (ngân hàng)</label><input type="text" id="bkName" value="' + esc(st.name) + '" placeholder="VD: ETS 2026 – Test 09"></div>' +
        '<div><label>Cấu trúc Part (số câu)</label><input type="text" id="bkParts" value="' + esc(st.partsTxt || STD_PARTS) + '"><div class="hint">Mặc định theo đề TOEIC chuẩn 200 câu. Part 2 có 3 phương án A–C.</div></div></div>' +
        '<div style="margin-top:10px"><label>Đáp án <span class="pill ' + (kn ? 'ok' : 'warn') + '" id="bkKeyN">' + kn + ' câu</span></label>' +
        '<div class="bkkey"><textarea id="bkKey" rows="7" placeholder="Gõ hoặc dán đáp án, ví dụ:&#10;1D 2A 3C 4B 5C …   hoặc   1 (D) 2 (A) …&#10;hoặc mỗi phần một dòng chữ liền:&#10;LC: DACBCCCABB…&#10;RC: ABBCAACABD…">' + esc(st.keyText) + '</textarea>' +
        (st.keyImgs.length ? '<div class="keyimgs">' + st.keyImgs.map(u => '<img src="' + u + '" alt="Đáp án">').join('') + '<div class="hint">Ảnh đáp án trong file — nhìn ảnh và gõ vào ô bên cạnh (gõ chữ liền: DACBC…).</div></div>' : '') + '</div></div>' +
        '<div class="row" style="margin-top:12px"><button class="btn primary" id="bkRender"' + (st.pdfs.length ? '' : ' disabled') + '>' + (st.rendered ? 'Đọc lại file PDF' : 'Bước tiếp: đọc file PDF đề') + '</button><span class="hint" id="bkProg"></span></div>' +
        '<div id="bkPages"></div>');
      $('#bkClose').onclick = ctx.closeModal;
      const inp = $('#bkIn');
      inp.onchange = () => { addFiles(Array.from(inp.files)); inp.value = ''; };
      const dz = $('#bkDrop');
      dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('over'));
      dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); addFiles(Array.from(e.dataTransfer.files)); });
      $$('[data-pi]').forEach(tr => { tr.querySelector('select').onchange = (e) => { st.pdfs[+tr.dataset.pi].sec = e.target.value; }; });
      $$('[data-ai]').forEach(tr => { tr.querySelector('select').onchange = (e) => { st.auds[+tr.dataset.ai].part = e.target.value; }; });
      $('#bkName').oninput = (e) => { st.name = e.target.value; };
      $('#bkParts').oninput = (e) => { st.partsTxt = e.target.value; };
      $('#bkKey').oninput = (e) => { st.keyText = e.target.value; const n = Object.keys(parseKey(st.keyText)).length; const p = $('#bkKeyN'); p.textContent = n + ' câu'; p.className = 'pill ' + (n ? 'ok' : 'warn'); if (st.rendered) pagesUI(); };
      $('#bkRender').onclick = renderAll;
      if (st.rendered) pagesUI();
    };
    const msg = (cls, t) => { const b = $('#bkMsg'); if (b) b.innerHTML += '<div class="msg ' + cls + '">' + t + '</div>'; };
    async function addFiles(files) {
      let list = [];
      for (const f of files) {
        if (extOf(f.name) === 'zip') { try { list = list.concat(await unzipAll(f)); } catch (e) { msg('bad', esc(f.name) + ': không giải nén được (' + esc(e.message) + ')'); } }
        else list.push(f);
      }
      for (const f of list) {
        const ext = extOf(f.name);
        if (ext === 'pdf') {
          const sec = /(^|[^a-z])(lc|listening|nghe)([^a-z]|$)/i.test(f.name) ? 'L' : /(^|[^a-z])(rc|reading|doc|đọc)([^a-z]|$)/i.test(f.name) ? 'R' : 'LR';
          st.pdfs.push({ file: f, sec }); st.rendered = false;
        } else if (AUD_EXT.includes(ext)) {
          const m = f.name.match(/part\s*[_\-.]?\s*([1-4])/i);
          st.auds.push({ file: f, part: m ? m[1] : '' });
        } else if (ext === 'docx') {
          try { const r = await readKeyDocx(f); st.keyImgs = st.keyImgs.concat(r.imgs); const km = parseKey(r.text); if (Object.keys(km).length >= 5 && !st.keyText.trim()) st.keyText = keyText(km); else if (!r.imgs.length && !Object.keys(km).length) msg('warn', esc(f.name) + ': không thấy đáp án trong file.'); } catch (e) { msg('bad', esc(f.name) + ': ' + esc(e.message)); }
        } else if (ext === 'txt' || ext === 'csv') {
          const t = await f.text(); const km = parseKey(t);
          if (Object.keys(km).length) st.keyText = (st.keyText.trim() ? st.keyText + '\n' : '') + keyText(km); else msg('warn', esc(f.name) + ': không đọc được đáp án.');
        } else if (IMG_EXT.includes(ext)) {
          st.keyImgs.push(URL.createObjectURL(f));
        }
      }
      // một file nghe duy nhất, không ghi Part => toàn bộ phần Nghe
      if (st.auds.length === 1 && !st.auds[0].part) st.auds[0].part = 'all';
      st.pdfs.sort((a, b) => (a.sec === 'L' ? 0 : a.sec === 'LR' ? 1 : 2) - (b.sec === 'L' ? 0 : b.sec === 'LR' ? 1 : 2));
      if (!st.name && st.pdfs.length) st.name = st.pdfs[0].file.name.replace(/\.pdf$/i, '').replace(/[\s_-]*(LC|RC)\b.*$/i, '').replace(/[_]+/g, ' ').trim();
      render();
    }
    async function renderAll() {
      const btn = $('#bkRender'); btn.disabled = true;
      st.pages = [];
      try {
        for (const p of st.pdfs) {
          let cnt = 0;
          await renderPdf(p.file, (pg) => {
            cnt = pg.total;
            st.pages.push({ sec: p.sec, file: p.file.name, n: pg.n, blob: pg.blob, thumb: pg.thumb, w: pg.w, h: pg.h, nums: pg.nums, first: null });
            const pr = $('#bkProg'); if (pr) pr.textContent = 'Đang đọc ' + p.file.name + ': trang ' + pg.n + '/' + pg.total + '…';
          });
          p.count = cnt;
        }
      } catch (e) { toast('Không đọc được PDF: ' + e.message, 'bad'); btn.disabled = false; return; }
      const parts = parseParts(st.partsTxt || STD_PARTS);
      autoFirst(st.pages, (n, sec) => { const pt = partOf(parts, n); return pt > 0 && (sec === 'LR' || skillOfPart(pt) === sec); });
      st.rendered = true;
      render();
      const pr = $('#bkProg'); if (pr) pr.textContent = 'Đã đọc ' + st.pages.length + ' trang.';
    }
    function pagesUI() {
      const box = $('#bkPages'); if (!box) return;
      const km = parseKey(st.keyText), parts = parseParts(st.partsTxt || STD_PARTS);
      const nums = Object.keys(km).map(Number).filter(n => partOf(parts, n));
      const mapped = st.pages.filter(p => p.first).length;
      const secs = ['L', 'R'].filter(s => nums.some(n => skillOfPart(partOf(parts, n)) === s));
      const noMap = secs.filter(s => !st.pages.some(p => p.first && (p.sec === s || p.sec === 'LR')));
      const audParts = st.auds.filter(a => a.part).map(a => a.part);
      const needAud = nums.some(n => skillOfPart(partOf(parts, n)) === 'L');
      const missAud = needAud && !audParts.includes('all') ? [1, 2, 3, 4].filter(p => nums.some(n => partOf(parts, n) === p) && !audParts.includes(String(p))) : [];
      box.innerHTML = '<h3 style="margin:16px 0 4px">Trang đề và số câu trên từng trang</h3>' +
        '<p class="hint">Ô dưới mỗi trang là <b>số câu đầu tiên in trên trang đó</b> — để học sinh thấy đúng phiếu trả lời của trang. Phần mềm tự đọc được với PDF có chữ; PDF scan (ảnh) thì thầy/cô gõ vào (để trống = trang không có câu hỏi). Nếu bỏ trống cả phần, học sinh vẫn làm được với phiếu trả lời đầy đủ của Part.</p>' +
        (noMap.length ? '<div class="msg warn">Chưa có số câu cho trang ' + noMap.map(s => s === 'L' ? 'phần Nghe' : 'phần Đọc').join(', ') + ' (PDF dạng ảnh scan). Nên gõ số câu đầu mỗi trang — mất khoảng 1 phút.</div>' : '<div class="msg ok">Đã gán ' + mapped + '/' + st.pages.length + ' trang.</div>') +
        quickLists(st.pages) +
        '<div class="pgrid">' + st.pages.map((p, i) => '<div class="pcell"><img src="' + p.thumb + '" alt="" data-zoom="' + i + '"><div class="hint">' + (p.sec === 'L' ? 'LC' : p.sec === 'R' ? 'RC' : 'PDF') + ' · trang ' + p.n + '</div><input type="number" min="1" max="300" data-first="' + i + '" value="' + (p.first || '') + '" placeholder="câu đầu"></div>').join('') + '</div>' +
        '<div class="msg ' + (nums.length ? 'info' : 'bad') + '" style="margin-top:12px">Sẽ tạo <b>' + nums.length + ' câu</b>' + (nums.length ? ' (' + [1, 2, 3, 4, 5, 6, 7].map(pt => { const c = nums.filter(n => partOf(parts, n) === pt).length; return c ? 'Part ' + pt + ': ' + c : ''; }).filter(Boolean).join(' · ') + ')' : ' — hãy nhập đáp án') + '.' +
        (missAud.length ? ' <b style="color:var(--bad)">Thiếu file nghe Part ' + missAud.join(', ') + '.</b>' : '') + '</div>' +
        '<div class="row" style="margin-top:10px"><button class="btn primary" id="bkSave"' + (nums.length ? '' : ' disabled') + '>Lưu ngân hàng &amp; tải trang đề, file nghe lên Google Drive</button><span class="hint" id="bkUp"></span></div>';
      $$('[data-first]', box).forEach(inp => inp.onchange = () => { const v = inp.value.trim(); st.pages[+inp.dataset.first].first = v ? +v : null; pagesUI(); });
      bindQuick(box, st.pages, pagesUI);
      $$('[data-zoom]', box).forEach(img => img.onclick = () => { const p = st.pages[+img.dataset.zoom]; window.open(URL.createObjectURL(p.blob), '_blank'); });
      $('#bkSave').onclick = save;
    }
    async function save() {
      if (!ctx.needConn()) return;
      const km = parseKey(st.keyText), parts = parseParts(st.partsTxt || STD_PARTS);
      const nums = Object.keys(km).map(Number).filter(n => partOf(parts, n)).sort((a, b) => a - b);
      const btn = $('#bkSave'); btn.disabled = true;
      const up = (t) => { const e = $('#bkUp'); if (e) e.textContent = t; };
      const bank = { id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: (st.name || 'Đề TOEIC').trim(), file: st.pdfs.map(p => p.file.name).join(', '), addedAt: Date.now(), groups: [], audio: {}, questions: [],
        book: { parts: {}, partsTxt: st.partsTxt || STD_PARTS, pages: st.pages.map(p => ({ id: null, sec: p.sec, file: p.file, n: p.n, w: p.w, h: p.h, first: p.first, thumb: p.thumb })) } };
      try {
        // 1) ảnh trang đề (3 trang song song)
        let done = 0, k = 0;
        const worker = async () => {
          while (k < st.pages.length) {
            const i = k++, p = st.pages[i];
            const nm = bank.name.replace(/[^\w\- ]+/g, '').slice(0, 40) + '_' + (p.sec === 'L' ? 'LC' : p.sec === 'R' ? 'RC' : 'PDF') + '_trang' + String(p.n).padStart(2, '0') + '.jpg';
            let err = null;
            for (let t = 0; t < 3; t++) {
              try { const r = await ctx.api({ action: 'uploadAudio', kind: 'page', name: nm, mime: 'image/jpeg', b64: await blobB64(p.blob) }); bank.book.pages[i].id = r.id; err = null; break; }
              catch (e) { err = e; await new Promise(r => setTimeout(r, 1200 * (t + 1))); }
            }
            if (err) throw err;
            up('Đang tải trang đề lên Drive: ' + (++done) + '/' + st.pages.length + '…');
          }
        };
        await Promise.all([worker(), worker(), worker()]);
        // 2) file nghe theo Part
        let ai = 0;
        for (const a of st.auds) {
          if (!a.part) continue;
          ai++; up('Đang tải file nghe ' + a.file.name + ' (' + (a.file.size / 1048576).toFixed(1) + ' MB)…');
          if (a.file.size > 30 * 1048576) throw new Error(a.file.name + ' quá 30 MB — hãy nén lại (mp3 64–96 kbps)');
          const r = await ctx.api({ action: 'uploadAudio', name: a.file.name, mime: a.file.type || MIME[extOf(a.file.name)] || 'audio/mpeg', b64: await blobB64(a.file) });
          bank.audio[a.file.name] = { id: r.id, name: a.file.name, size: a.file.size };
          bank.book.parts[a.part] = a.file.name;
        }
      } catch (e) { up(''); toast('Tải lên chưa xong: ' + e.message + ' — bấm lưu lại để thử tiếp', 'bad'); btn.disabled = false; return; }
      bank.questions = nums.map(n => {
        const pt = partOf(parts, n), nOpt = pt === 2 ? 3 : 4, c = km[n];
        const q = { n, num: n, type: 'mc', stem: '', text: '', options: Array(nOpt).fill(''), correct: c >= 0 && c < nOpt ? [c] : [], skill: skillOfPart(pt), part: pt, pts: null };
        if (!q.correct.length) q.warn = 'Đáp án không hợp lệ';
        return q;
      });
      assignPages(bank);
      up('');
      ctx.created(bank);
      ctx.closeModal();
      toast('Đã nạp đề "' + bank.name + '": ' + bank.questions.length + ' câu, ' + bank.book.pages.length + ' trang đề', 'ok');
    }
    render();
  }

  /* ------------------------------ xem / sửa ------------------------------ */
  function view(b, ctx) {
    const parts = parseParts(b.book.partsTxt || STD_PARTS);
    const render = () => {
      const byPart = {};
      b.questions.forEach((q, qi) => { (byPart[q.part] = byPart[q.part] || []).push(qi); });
      ctx.modal('<div class="row"><h2 style="margin:0">' + esc(b.name) + '</h2><span class="pill">Đề nguyên bộ · ' + b.book.pages.length + ' trang · ' + b.questions.length + ' câu</span><span class="spacer"></span><button class="btn sm" id="mClose">Đóng</button></div>' +
        '<p class="hint">Bấm vào chữ cái để sửa đáp án đúng. Số dưới ảnh trang = câu đầu tiên in trên trang (dùng để hiện phiếu trả lời đúng trang cho học sinh).</p>' +
        ctx.audioPanel(b) +
        '<h3>Đáp án</h3>' + Object.keys(byPart).sort((x, y) => x - y).map(pt => '<div class="keypart"><b>Part ' + pt + '</b> <span class="hint">' + (pt <= 4 ? 'Nghe' : 'Đọc') + ' · câu ' + b.questions[byPart[pt][0]].num + '–' + b.questions[byPart[pt][byPart[pt].length - 1]].num + '</span><div class="keygrid">' +
          byPart[pt].map(qi => { const q = b.questions[qi]; return '<div class="krow' + (q.correct.length ? '' : ' bad') + '"><span class="kn">' + q.num + '</span>' + q.options.map((_, oi) => '<button class="kb' + (q.correct.includes(oi) ? ' on' : '') + '" data-kq="' + qi + '" data-ko="' + oi + '">' + L[oi] + '</button>').join('') + '<span class="kp" title="Trang">' + (q.page != null ? 'tr.' + (q.page + 1) : '—') + '</span></div>'; }).join('') + '</div></div>').join('') +
        '<h3>Trang đề</h3>' + quickLists(b.book.pages) + '<div class="pgrid">' + b.book.pages.map((p, i) => '<div class="pcell">' + (p.thumb ? '<img src="' + p.thumb + '" alt="">' : '<div class="pthumb">' + (i + 1) + '</div>') + '<div class="hint">' + (p.sec === 'L' ? 'LC' : p.sec === 'R' ? 'RC' : 'PDF') + ' · trang ' + p.n + (p.id ? '' : ' · <b style="color:var(--bad)">chưa tải</b>') + '</div><input type="number" min="1" data-first="' + i + '" value="' + (p.first || '') + '" placeholder="câu đầu"></div>').join('') + '</div>');
      $('#mClose').onclick = () => { ctx.closeModal(); ctx.saveBanks(); };
      ctx.bindAudioPanel(b, render);
      $$('[data-kq]').forEach(el => el.onclick = () => { const q = b.questions[+el.dataset.kq]; q.correct = [+el.dataset.ko]; q.warn = ''; render(); });
      $$('[data-first]').forEach(inp => inp.onchange = () => { const v = inp.value.trim(); b.book.pages[+inp.dataset.first].first = v ? +v : null; assignPages(b); render(); });
      bindQuick(document, b.book.pages, () => { assignPages(b); render(); });
    };
    void parts;
    render();
  }
  /** Tên file nghe đề cần (Part 1..4 / toàn bộ) — để bảng "File nghe" hiện đúng */
  function audioNeeds(b, add) { Object.keys((b.book && b.book.parts) || {}).forEach(k => add(b.book.parts[k], k === 'all' ? 'Toàn bộ phần Nghe' : 'Part ' + k)); }

  root.QuizBook = { openImport, view, audioNeeds, parseKey, parseParts, STD_PARTS };
})(window);
