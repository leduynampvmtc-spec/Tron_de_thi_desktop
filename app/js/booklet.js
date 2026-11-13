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
  async function renderPdf(file, onPage, range) {
    const lib = await pdfLib();
    const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const doc = await task.promise;
    const from = Math.max(1, Math.min(doc.numPages, (range && +range.from) || 1));
    const to = Math.max(from, Math.min(doc.numPages, (range && +range.to) || doc.numPages));
    for (let i = from; i <= to; i++) {
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
      onPage({ blob, thumb, w: cv.width, h: cv.height, nums: Array.from(new Set(nums)).sort((a, b) => a - b), n: i, idx: i - from + 1, total: to - from + 1, all: doc.numPages });
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
  const isTranscript = (name) => /transcript|lời[\s_]*thoại|loi[\s_]*thoai/i.test(name);
  /** Part của file nghe theo số câu trong tên (E26-T01-07.mp3 → Part 2) */
  function audPart(name) {
    const m = String(name).match(/part\s*[_\-.]?\s*([1-4])/i);
    if (m) return { part: m[1], num: 0 };
    const an = audioNums(name);
    if (an && an.a) { const a = an.a; return { part: a <= 6 ? '1' : a <= 31 ? '2' : a <= 70 ? '3' : a <= 100 ? '4' : '', num: a }; }
    return { part: '', num: 0 };
  }
  /** Gộp nhiều file mp3 (bỏ thẻ ID3) thành 1 file — dùng khi bộ đề có file nghe từng câu */
  async function joinMp3(files) {
    const bufs = [];
    for (const f of files) {
      let u = new Uint8Array(await f.arrayBuffer()), s = 0, e = u.length;
      if (u[0] === 0x49 && u[1] === 0x44 && u[2] === 0x33) s = 10 + ((u[6] & 127) << 21 | (u[7] & 127) << 14 | (u[8] & 127) << 7 | (u[9] & 127)) + ((u[5] & 16) ? 10 : 0);
      if (e - s > 128 && u[e - 128] === 0x54 && u[e - 127] === 0x41 && u[e - 126] === 0x47) e -= 128;
      bufs.push(u.subarray(s, e));
    }
    return new Blob(bufs, { type: 'audio/mpeg' });
  }
  /** File "câu đầu mỗi trang": dòng "LC …: ,1,3,5" và "RC …: 101,109" */
  function parseFirstLists(txt) {
    const out = {};
    String(txt || '').split(/\r?\n/).forEach(l => {
      const m = l.match(/^\s*(LC|RC|Nghe|Đọc|Listening|Reading)[^:]*:\s*([\d,;\s]*)$/i);
      if (m && /,/.test(m[2])) out[/^(LC|Nghe|Listening)/i.test(m[1]) ? 'L' : 'R'] = m[2].split(/[,;]/).map(x => x.trim()).map(x => /^\d+$/.test(x) ? +x : null);
    });
    return out;
  }
  function openImport(ctx) {
    const st = { pdfs: [], auds: [], keyImgs: [], keyText: '', name: '', pages: [], rendered: false, firstLists: null, msgs: [] };
    const partSel = (v) => '<select data-apart>' + [['1', 'Part 1'], ['2', 'Part 2'], ['3', 'Part 3'], ['4', 'Part 4'], ['all', 'Toàn bộ phần Nghe (1 file)'], ['', '— không dùng —']].map(o => '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>';
    const secSel = (v) => '<select data-psec>' + [['L', 'Phần Nghe (Listening)'], ['R', 'Phần Đọc (Reading)'], ['LR', 'Cả Nghe và Đọc']].map(o => '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>';
    const render = () => {
      const km = parseKey(st.keyText), kn = Object.keys(km).length;
      ctx.modal('<div class="row"><h2 style="margin:0">Nạp đề TOEIC nguyên bộ</h2><span class="spacer"></span><button class="btn sm" id="bkClose">Đóng</button></div>' +
        '<p class="hint">Dùng cho bộ đề TOEIC / ETS có sẵn: <b>file PDF đề</b> (LC, RC), <b>đáp án</b> và <b>file nghe theo Part</b>. Học sinh xem đúng trang đề gốc trên điện thoại/máy tính, chọn đáp án ở phiếu trả lời ngay dưới trang đề, file nghe tự phát lần lượt Part 1 → 4. Có thể chọn thẳng file <b>.zip</b> của bộ đề. <b>Mới:</b> chọn thêm file <b>KEY / SCRIPT AND KEY (.pdf)</b> — phần mềm tự đọc đáp án, không phải gõ; file <b>TRANSCRIPT</b> tự bỏ qua; file nghe từng câu tự gộp theo Part; sách nhiều Test thì điền <b>Trang … – …</b> để lấy riêng từng Test.</p>' +
        '<label class="drop" id="bkDrop" for="bkIn"><b>Kéo thả hoặc bấm để chọn file</b> — .zip bộ đề, hoặc các file .pdf, .mp3, file đáp án (.docx / .txt / ảnh)<div class="hint">Chọn được nhiều file cùng lúc.</div></label><input type="file" id="bkIn" class="hide" multiple accept=".zip,.pdf,.docx,.txt,.csv,audio/*,image/*,.mp3,.m4a,.wav">' +
        '<div id="bkMsg">' + st.msgs.map(m => '<div class="msg ' + m[0] + '">' + m[1] + '</div>').join('') + '</div>' +
        (st.pdfs.length || st.auds.length ? '<div class="grid g2" style="margin-top:10px">' +
          '<div><h3 style="margin:4px 0">📄 File đề PDF</h3>' + (st.pdfs.length ? '<table class="tbl">' + st.pdfs.map((p, i) => '<tr data-pi="' + i + '"><td>' + esc(p.file.name) + '<div class="hint">' + (p.all ? 'File có ' + p.all + ' trang' + (p.count && p.count !== p.all ? ' — lấy ' + p.count + ' trang' : '') : '') + '</div></td><td>' + secSel(p.sec) + '<div class="pgrange">Trang <input type="number" min="1" data-pfrom value="' + esc(p.from || '') + '" placeholder="đầu"> – <input type="number" min="1" data-pto value="' + esc(p.to || '') + '" placeholder="cuối"></div></td></tr>').join('') + '</table><div class="hint">Sách có nhiều Test: điền <b>từ trang … đến trang …</b> để lấy riêng Test 1, Test 2… (bỏ trống = lấy cả file).</div>' : '<div class="msg warn">Chưa có file PDF đề.</div>') + '</div>' +
          '<div><h3 style="margin:4px 0">🎧 File nghe</h3>' + (st.auds.length ? '<table class="tbl">' + ['1', '2', '3', '4'].filter(pt => st.auds.filter(a => a.part === pt).length > 1).map(pt => { const g = st.auds.filter(a => a.part === pt), mb = g.reduce((s, a) => s + a.file.size, 0) / 1048576; return '<tr><td><b>Part ' + pt + '</b> — ' + g.length + ' file nghe từng câu<div class="hint">' + esc(g[0].file.name) + ' … ' + esc(g[g.length - 1].file.name) + ' · ' + mb.toFixed(1) + ' MB — tự gộp thành 1 file khi lưu' + (mb > 30 ? ' — <b style="color:var(--bad)">quá 30 MB</b>' : '') + '</div></td><td><span class="pill ok">Part ' + pt + '</span></td></tr>'; }).join('') + st.auds.map((a, i) => (a.part && st.auds.filter(x => x.part === a.part).length > 1) ? '' : '<tr data-ai="' + i + '"><td>' + esc(a.file.name) + '<div class="hint">' + (a.file.size / 1048576).toFixed(1) + ' MB' + (a.file.size > 30 * 1048576 ? ' — <b style="color:var(--bad)">quá 30 MB, hãy nén lại</b>' : '') + '</div></td><td>' + partSel(a.part) + '</td></tr>').join('') + '</table>' : '<div class="msg warn">Chưa có file nghe (đề chỉ có phần Đọc thì bỏ qua).</div>') + '</div></div>' : '') +
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
      $$('[data-pi]').forEach(tr => {
        const p = st.pdfs[+tr.dataset.pi];
        tr.querySelector('select').onchange = (e) => { p.sec = e.target.value; };
        tr.querySelector('[data-pfrom]').onchange = (e) => { p.from = e.target.value; st.rendered = false; };
        tr.querySelector('[data-pto]').onchange = (e) => { p.to = e.target.value; st.rendered = false; };
      });
      $$('[data-ai]').forEach(tr => { tr.querySelector('select').onchange = (e) => { st.auds[+tr.dataset.ai].part = e.target.value; }; });
      $('#bkName').oninput = (e) => { st.name = e.target.value; };
      $('#bkParts').oninput = (e) => { st.partsTxt = e.target.value; };
      $('#bkKey').oninput = (e) => { st.keyText = e.target.value; const n = Object.keys(parseKey(st.keyText)).length; const p = $('#bkKeyN'); p.textContent = n + ' câu'; p.className = 'pill ' + (n ? 'ok' : 'warn'); if (st.rendered) pagesUI(); };
      $('#bkRender').onclick = renderAll;
      if (st.rendered) pagesUI();
    };
    const msg = (cls, t) => { st.msgs.push([cls, t]); const b = $('#bkMsg'); if (b) b.innerHTML += '<div class="msg ' + cls + '">' + t + '</div>'; };
    async function addFiles(files) {
      let list = [];
      for (const f of files) {
        if (extOf(f.name) === 'zip') { try { list = list.concat(await unzipAll(f)); } catch (e) { msg('bad', esc(f.name) + ': không giải nén được (' + esc(e.message) + ')'); } }
        else list.push(f);
      }
      for (const f of list) {
        const ext = extOf(f.name);
        if (ext === 'pdf' && isTranscript(f.name)) { msg('info', 'Bỏ qua ' + esc(f.name) + ' (file lời thoại / transcript, không phải trang đề).'); continue; }
        if (ext === 'pdf' && isKeyPdf(f.name) && (!window.QuizEts || f.size > 80 * 1048576)) { msg('info', 'Bỏ qua ' + esc(f.name) + ' (file KEY / SCRIPT, không phải trang đề).'); continue; }
        if (ext === 'pdf' && window.QuizEts && isKeyPdf(f.name)) {
          try {
            msg('info', 'Đang đọc đáp án trong ' + esc(f.name) + '…');
            const k = await readKeyPdf(f, null, { noImg: true });
            const n = Object.keys(k.answers).length;
            if (n) {
              const km = parseKey(st.keyText); let add = 0;
              Object.keys(k.answers).forEach(q => { if (km[q] == null) { km[q] = k.answers[q]; add++; } });
              st.keyText = keyText(km);
              const miss = Object.keys(k.qs).map(Number).filter(x => k.qs[x].ans < 0);
              msg(miss.length ? 'warn' : 'ok', esc(f.name) + ': đọc được <b>' + n + '</b> đáp án' + (add < n ? ' (điền thêm ' + add + ' câu còn trống, giữ đáp án đã có)' : '') + (miss.length ? ' — file không ghi đáp án câu ' + miss.join(', ') + ' (gõ thêm vào ô đáp án)' : '') + '.');
            } else msg('warn', esc(f.name) + ': không có lớp chữ để đọc đáp án — đã bỏ qua file này. Nếu đây là file đề, đổi tên file bỏ chữ KEY / SCRIPT.');
            try { k.task.destroy(); } catch (e) { /* bỏ qua */ }
          } catch (e) { msg('bad', esc(f.name) + ': ' + esc(e.message)); }
          continue;
        }
        if (ext === 'pdf') {
          const sec = /(^|[^a-z])(lc|listening|nghe)([^a-z]|$)/i.test(f.name) ? 'L' : /(^|[^a-z])(rc|reading|doc|đọc)([^a-z]|$)/i.test(f.name) ? 'R' : 'LR';
          const rg = f.name.match(/trang[\s_]*(\d+)[\s_]*[-–][\s_]*(\d+)/i);
          st.pdfs.push({ file: f, sec, from: rg ? rg[1] : '', to: rg ? rg[2] : '' }); st.rendered = false;
        } else if (AUD_EXT.includes(ext)) {
          const ap = audPart(f.name);
          st.auds.push({ file: f, part: ap.part, num: ap.num });
        } else if (ext === 'docx') {
          try { const r = await readKeyDocx(f); st.keyImgs = st.keyImgs.concat(r.imgs); const km = parseKey(r.text); if (Object.keys(km).length >= 5 && !st.keyText.trim()) st.keyText = keyText(km); else if (!r.imgs.length && !Object.keys(km).length) msg('warn', esc(f.name) + ': không thấy đáp án trong file.'); } catch (e) { msg('bad', esc(f.name) + ': ' + esc(e.message)); }
        } else if ((ext === 'txt' || ext === 'csv') && /readme|hướng[\s_]*dẫn|huong[\s_]*dan|đọc[\s_]*trước|doc[\s_]*truoc|chưa[\s_]*có|chua[\s_]*co/i.test(f.name)) {
          continue;
        } else if (ext === 'txt' || ext === 'csv') {
          const t = await f.text();
          if (/câu\s*đầu|cau\s*dau/i.test(t + ' ' + f.name)) {
            const fl = parseFirstLists(t);
            if (fl.L || fl.R) { st.firstLists = Object.assign(st.firstLists || {}, fl); msg('ok', esc(f.name) + ': đã lấy dòng số câu đầu mỗi trang' + (fl.L ? ' LC (' + fl.L.length + ' trang)' : '') + (fl.R ? ' RC (' + fl.R.length + ' trang)' : '') + '.'); }
            const km0 = parseKey(t.split(/\r?\n/).filter(l => !/câu\s*đầu|cau\s*dau/i.test(l) && !/^\s*(LC|RC)[^:]*:\s*[\d,;\s]*$/i.test(l)).join('\n'));
            if (Object.keys(km0).length >= 5) st.keyText = (st.keyText.trim() ? st.keyText + '\n' : '') + keyText(km0);
            continue;
          }
          const km = parseKey(t);
          if (Object.keys(km).length) st.keyText = (st.keyText.trim() ? st.keyText + '\n' : '') + keyText(km); else msg('warn', esc(f.name) + ': không đọc được đáp án.');
        } else if (IMG_EXT.includes(ext)) {
          st.keyImgs.push(URL.createObjectURL(f));
        }
      }
      // một file nghe duy nhất, không ghi Part => toàn bộ phần Nghe
      if (st.auds.length === 1 && !st.auds[0].part) st.auds[0].part = 'all';
      st.auds.sort((a, b) => (a.part || '9').localeCompare(b.part || '9') || a.num - b.num || a.file.name.localeCompare(b.file.name));
      st.pdfs.sort((a, b) => (a.sec === 'L' ? 0 : a.sec === 'LR' ? 1 : 2) - (b.sec === 'L' ? 0 : b.sec === 'LR' ? 1 : 2));
      if (!st.name && st.pdfs.length) st.name = st.pdfs[0].file.name.replace(/\.pdf$/i, '').replace(/[\s_-]*(LC|RC)\b.*$/i, '').replace(/[_]+/g, ' ').trim();
      st.msgs = st.msgs.filter(m => !/^Đang đọc/.test(m[1]));
      render();
    }
    async function renderAll() {
      const btn = $('#bkRender'); btn.disabled = true;
      st.pages = [];
      try {
        for (const p of st.pdfs) {
          let cnt = 0;
          await renderPdf(p.file, (pg) => {
            cnt = pg.total; p.all = pg.all;
            st.pages.push({ sec: p.sec, file: p.file.name, n: pg.n, blob: pg.blob, thumb: pg.thumb, w: pg.w, h: pg.h, nums: pg.nums, first: null });
            const pr = $('#bkProg'); if (pr) pr.textContent = 'Đang đọc ' + p.file.name + ': trang ' + pg.n + ' (' + pg.idx + '/' + pg.total + ')…';
          }, { from: p.from, to: p.to });
          p.count = cnt;
        }
      } catch (e) { toast('Không đọc được PDF: ' + e.message, 'bad'); btn.disabled = false; return; }
      const parts = parseParts(st.partsTxt || STD_PARTS);
      autoFirst(st.pages, (n, sec) => { const pt = partOf(parts, n); return pt > 0 && (sec === 'LR' || skillOfPart(pt) === sec); });
      if (st.firstLists) ['L', 'R'].forEach(sec => {
        const fl = st.firstLists[sec], ps = st.pages.filter(p => p.sec === sec);
        if (!fl || !ps.length) return;
        ps.forEach((p, i) => { if (i < fl.length) p.first = fl[i]; });
        if (fl.length !== ps.length) toast('Dòng câu đầu ' + (sec === 'L' ? 'LC' : 'RC') + ' có ' + fl.length + ' số nhưng đề có ' + ps.length + ' trang — kiểm tra lại số trang', 'warn');
      });
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
        // 2) file nghe theo Part (nhiều file từng câu của cùng 1 Part → gộp thành 1 file)
        let ai = 0;
        const list = [];
        for (const pt of ['1', '2', '3', '4', 'all']) {
          const g = st.auds.filter(a => a.part === pt);
          if (g.length === 1) list.push(g[0]);
          else if (g.length > 1) { up('Đang gộp ' + g.length + ' file nghe Part ' + pt + '…'); const b = await joinMp3(g.sort((x, y) => x.num - y.num || x.file.name.localeCompare(y.file.name))); list.push({ part: pt, file: new File([b], (bank.name.replace(/[^\w\- ]+/g, '').slice(0, 40) || 'TOEIC') + ' - Part ' + pt + '.mp3', { type: 'audio/mpeg' }) }); }
        }
        for (const a of list) {
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


  /* =====================================================================
   *  v1.8 — Đọc file KEY PDF (đáp án + câu hỏi + lời thoại) và đề Nói PDF
   * ===================================================================== */
  const isKeyPdf = (name) => /key|script|đáp[\s_]*án|dap[\s_]*an|giải[\s_]*thích|giai[\s_]*thich|explanation|answer/i.test(name);
  /** Đọc 1 file PDF KEY → kết quả QuizEts.parseKey (kèm vị trí ảnh đoạn văn) ; giữ lại doc để cắt ảnh */
  async function readKeyPdf(file, onProg, opt) {
    const lib = await pdfLib();
    const r = await QuizEts.readPdf(lib, new Uint8Array(await file.arrayBuffer()), onProg);
    let imgs = {};
    const isR = /READING|\bRC\b/i.test(r.pages.slice(0, 2).map(p => p.items.map(i => i.s).join(' ')).join(' ')) || /reading|\brc\b/i.test(file.name);
    if (isR && !(opt && opt.noImg)) { for (const pg of r.pages) { try { imgs[pg.n] = await QuizEts.imageBoxes(lib, r.doc, pg.n); } catch (e) { imgs[pg.n] = []; } } imgs = QuizEts.dropDecor(imgs); }
    const k = QuizEts.parseKey(r.pages, imgs);
    k.doc = r.doc; k.task = r.task; k.file = file.name;
    return k;
  }
  /** Cắt các ô ảnh (đoạn văn) trên trang PDF, ghép dọc thành 1 ảnh JPEG */
  async function cropBoxes(doc, boxes) {
    const parts = [];
    for (const b of boxes) {
      const page = await doc.getPage(b.p);
      const scale = 2.2;
      const vp = page.getViewport({ scale });
      const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const x = Math.max(0, Math.floor(b.x * scale)), y = Math.max(0, Math.floor(b.y * scale));
      const w = Math.min(cv.width - x, Math.ceil((b.x2 - b.x) * scale)), h = Math.min(cv.height - y, Math.ceil((b.y2 - b.y) * scale));
      if (w > 10 && h > 10) { const c2 = document.createElement('canvas'); c2.width = w; c2.height = h; c2.getContext('2d').drawImage(cv, x, y, w, h, 0, 0, w, h); parts.push(c2); }
      page.cleanup();
    }
    if (!parts.length) return null;
    const W = Math.min(1400, Math.max(...parts.map(c => c.width)));
    const H = parts.reduce((s, c) => s + Math.round(c.height * W / c.width) + 12, 0);
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const o = out.getContext('2d'); o.fillStyle = '#fff'; o.fillRect(0, 0, W, H);
    let yy = 0; parts.forEach(c => { const h = Math.round(c.height * W / c.width); o.drawImage(c, 0, yy, W, h); yy += h + 12; });
    return { blob: await new Promise(res => out.toBlob(res, 'image/jpeg', 0.82)), url: out.toDataURL('image/jpeg', 0.5), w: W, h: H };
  }
  /** Số câu ghi trong tên file nghe: "E26-T01-07.mp3" → [7,7] ; "E26-T01-32-34.mp3" → [32,34] ; "Part 3.mp3" → part */
  function audioNums(name) {
    const base = String(name).replace(/\.[a-z0-9]+$/i, '');
    const pm = base.match(/part\s*[_\-.]?\s*([1-7])\b/i);
    const toks = (base.match(/\d{1,3}/g) || []).map(Number);
    if (toks.length >= 2) { const a = toks[toks.length - 2], b = toks[toks.length - 1]; if (a >= 32 && b > a && b - a <= 4) return { a, b }; }
    if (pm && toks.length <= 2) return { part: +pm[1] };
    if (toks.length) { const n = toks[toks.length - 1]; if (n >= 1 && n <= 100) return { a: n, b: n }; }
    return pm ? { part: +pm[1] } : null;
  }
  const htmlEsc = (s) => esc(String(s || '')).replace(/\n/g, '<br>');
  const imgTag = (id, alt) => '<img class="drvimg" data-drv="' + id + '" src="https://lh3.googleusercontent.com/d/' + id + '=w1600" alt="' + esc(alt || '') + '" loading="lazy">';
  async function uploadImg(ctx, blob, name) {
    let err = null;
    for (let t = 0; t < 3; t++) {
      try { const r = await ctx.api({ action: 'uploadAudio', kind: 'page', name, mime: 'image/jpeg', b64: await blobB64(blob) }); return r.id; }
      catch (e) { err = e; await new Promise(r => setTimeout(r, 1200 * (t + 1))); }
    }
    throw err;
  }

  /* -------------------- Đề trắc nghiệm có chữ từ file KEY -------------------- */
  function openText(ctx) {
    const st = { keys: [], auds: [], pics: [], parsed: null, name: '', parts: { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true }, crops: {}, busy: false };
    const PN = { 1: 'Part 1 · Mô tả tranh', 2: 'Part 2 · Hỏi – đáp', 3: 'Part 3 · Hội thoại', 4: 'Part 4 · Bài nói', 5: 'Part 5 · Hoàn thành câu', 6: 'Part 6 · Hoàn thành đoạn văn', 7: 'Part 7 · Đọc hiểu' };
    const render = () => {
      const P = st.parsed;
      ctx.modal('<div class="row"><h2 style="margin:0">Tạo đề trắc nghiệm có chữ từ file KEY (PDF)</h2><span class="spacer"></span><button class="btn sm" id="txClose">Đóng</button></div>' +
        '<p class="hint">Dùng file <b>KEY / SCRIPT AND KEY</b> dạng PDF có chữ (ví dụ <i>ETS 2026 LISTENING TEST 1 (SCRIPT AND KEY).pdf</i>, <i>ETS 2026 READING TEST 1- KEY.pdf</i>). Phần mềm tự tách <b>câu hỏi, phương án, đáp án</b>, ảnh đoạn văn Part 6–7, lời thoại Part 3–4 và ghép <b>file nghe theo từng câu</b> (E26-T01-07.mp3, E26-T01-32-34.mp3…). Đề tạo ra là đề trắc nghiệm thường: <b>trộn được câu</b>, các câu cùng đoạn luôn đi cùng nhau, câu Nghe không trộn phương án.</p>' +
        '<label class="drop" id="txDrop" for="txIn"><b>Kéo thả hoặc bấm để chọn file</b> — file KEY .pdf, file nghe .mp3 (hoặc cả thư mục .zip), ảnh tranh Part 1 (tuỳ chọn)<div class="hint">Chọn được nhiều file cùng lúc.</div></label><input type="file" id="txIn" class="hide" multiple accept=".zip,.pdf,audio/*,image/*,.mp3,.m4a,.wav">' +
        '<div id="txMsg"></div>' +
        '<div class="grid g3" style="margin-top:10px">' +
          '<div><h3 style="margin:4px 0">📄 File KEY</h3>' + (st.keys.length ? st.keys.map(f => '<div class="hint">• ' + esc(f.name) + ' (' + (f.size / 1048576).toFixed(1) + ' MB)</div>').join('') : '<div class="msg warn">Chưa có file KEY PDF.</div>') + '</div>' +
          '<div><h3 style="margin:4px 0">🎧 File nghe</h3><div class="hint">' + (st.auds.length ? st.auds.length + ' file' : 'Chưa có (đề chỉ có phần Đọc thì bỏ qua).') + '</div></div>' +
          '<div><h3 style="margin:4px 0">🖼 Ảnh tranh Part 1</h3><div class="hint">' + (st.pics.length ? st.pics.length + ' ảnh (theo thứ tự câu 1–6)' : 'Không bắt buộc. Không có ảnh thì Part 1 nên bỏ chọn.') + '</div></div></div>' +
        '<div class="row" style="margin-top:12px"><button class="btn primary" id="txParse"' + (st.keys.length && !st.busy ? '' : ' disabled') + '>' + (P ? 'Đọc lại file KEY' : 'Bước tiếp: đọc file KEY') + '</button><span class="hint" id="txProg"></span></div>' +
        (P ? summary() : ''));
      $('#txClose').onclick = ctx.closeModal;
      const inp = $('#txIn'); inp.onchange = () => { add(Array.from(inp.files)); inp.value = ''; };
      const dz = $('#txDrop');
      dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('over'));
      dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); add(Array.from(e.dataTransfer.files)); });
      $('#txParse').onclick = parse;
      if (P) bindSummary();
    };
    const msg = (cls, t) => { const b = $('#txMsg'); if (b) b.innerHTML += '<div class="msg ' + cls + '">' + t + '</div>'; };
    async function add(files) {
      let list = [];
      for (const f of files) { if (extOf(f.name) === 'zip') { try { list = list.concat(await unzipAll(f)); } catch (e) { msg('bad', esc(f.name) + ': không giải nén được'); } } else list.push(f); }
      list.forEach(f => {
        const ext = extOf(f.name);
        if (ext === 'pdf') { if (!st.keys.some(k => k.name === f.name)) st.keys.push(f); }
        else if (AUD_EXT.includes(ext)) { if (!st.auds.some(a => a.name === f.name)) st.auds.push(f); }
        else if (IMG_EXT.includes(ext)) st.pics.push(f);
      });
      st.pics.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      render();
    }
    async function parse() {
      st.busy = true; render();
      const prog = (t) => { const e = $('#txProg'); if (e) e.textContent = t; };
      const res = { L: null, R: null };
      try {
        for (const f of st.keys) {
          const k = await readKeyPdf(f, (i, n) => prog('Đang đọc ' + f.name + ': trang ' + i + '/' + n + '…'));
          if (!k.sec) k.sec = Object.keys(k.qs).some(n => +n > 100) ? 'R' : 'L';
          if (!Object.keys(k.qs).length) { msg('warn', esc(f.name) + ': không tìm thấy câu hỏi (PDF dạng ảnh scan hoặc không phải file KEY).'); continue; }
          res[k.sec] = k;
        }
      } catch (e) { msg('bad', 'Không đọc được PDF: ' + esc(e.message)); }
      st.parsed = res; st.busy = false; st.crops = {};
      if (!st.name) { const f = st.keys[0]; st.name = f ? f.name.replace(/\.pdf$/i, '').replace(/\s*\(?(SCRIPT AND KEY|KEY|SCRIPT)\)?\s*/ig, ' ').replace(/LISTENING|READING|[-–]+\s*$/ig, '').replace(/\s+/g, ' ').trim() : 'Đề TOEIC'; }
      render(); prog('');
      // ảnh đoạn văn Part 6–7 (cắt sẵn để xem trước)
      if (res.R) {
        const gs = res.R.groups.filter(g => g.imgs && g.imgs.length);
        for (let i = 0; i < gs.length; i++) {
          prog('Đang cắt ảnh đoạn văn ' + (i + 1) + '/' + gs.length + '…');
          try { st.crops[gs[i].a] = await cropBoxes(res.R.doc, gs[i].imgs); } catch (e) { /* bỏ qua */ }
        }
        prog(''); render();
      }
    }
    const allQs = () => { const P = st.parsed || {}; const out = []; ['L', 'R'].forEach(s => { if (P[s]) Object.keys(P[s].qs).map(Number).sort((a, b) => a - b).forEach(n => out.push(Object.assign({ sec: s }, P[s].qs[n]))); }); return out; };
    function audFor(q) {
      const list = st.auds.map(f => ({ f, m: audioNums(f.name) })).filter(x => x.m);
      if (q.part <= 2) { const x = list.find(x => x.m.a === q.num && x.m.b === q.num); if (x) return { q: x.f.name }; const p = list.find(x => x.m.part === q.part); return p ? { part: p.f.name } : null; }
      if (q.part <= 4) { const x = list.find(x => x.m.a != null && q.num >= x.m.a && q.num <= x.m.b && x.m.b > x.m.a); if (x) return { g: x.f.name }; const p = list.find(x => x.m.part === q.part); return p ? { part: p.f.name } : null; }
      return null;
    }
    function summary() {
      const qs = allQs();
      const rows = [1, 2, 3, 4, 5, 6, 7].map(pt => {
        const xs = qs.filter(q => q.part === pt); if (!xs.length) return '';
        const noAns = xs.filter(q => q.ans < 0).map(q => q.num), badOpt = xs.filter(q => q.opts.length < (pt === 2 ? 3 : 4)).map(q => q.num);
        const aud = pt <= 4 ? xs.filter(q => audFor(q)).length : null;
        const pics = pt === 1 ? Math.min(st.pics.length, xs.length) : null;
        return '<tr><td><label class="row" style="gap:6px"><input type="checkbox" data-part="' + pt + '"' + (st.parts[pt] ? ' checked' : '') + '> ' + PN[pt] + '</label></td><td class="num">' + xs.length + '</td><td>' + (noAns.length ? '<span class="pill bad">thiếu ' + noAns.length + '</span> <span class="hint">câu ' + noAns.join(', ') + '</span>' : '<span class="pill ok">đủ</span>') + (badOpt.length ? ' <span class="pill warn">phương án lỗi: ' + badOpt.join(', ') + '</span>' : '') + '</td><td>' + (aud == null ? '—' : '<span class="pill ' + (aud === xs.length ? 'ok' : aud ? 'warn' : 'bad') + '">' + aud + '/' + xs.length + '</span>') + (pics == null ? '' : ' <span class="pill ' + (pics ? 'ok' : 'warn') + '">ảnh ' + pics + '/' + xs.length + '</span>') + '</td></tr>';
      }).join('');
      const R = st.parsed.R; const nImg = R ? R.groups.filter(g => g.imgs && g.imgs.length).length : 0;
      return '<h3 style="margin:16px 0 6px">Kết quả đọc file</h3>' +
        '<table class="tbl"><tr><th>Phần (chọn để đưa vào đề)</th><th class="num">Số câu</th><th>Đáp án</th><th>File nghe / ảnh</th></tr>' + rows + '</table>' +
        (R ? '<div class="hint" style="margin-top:6px">Đoạn văn Part 6–7: ' + nImg + ' đoạn có ảnh' + (Object.keys(st.crops).length < nImg ? ' — đang cắt ảnh…' : '') + '.</div>' : '') +
        (Object.keys(st.crops).length ? '<div class="pgrid" style="margin-top:6px">' + Object.keys(st.crops).slice(0, 8).map(a => '<div class="pcell"><img src="' + st.crops[a].url + '" alt=""><div class="hint">Đoạn câu ' + a + '</div></div>').join('') + '</div>' : '') +
        '<details style="margin-top:8px"><summary><b>Sửa đáp án</b> (bấm chữ cái)</summary><div class="keygrid" style="margin-top:6px">' + qs.map((q, i) => '<div class="krow' + (q.ans < 0 ? ' bad' : '') + '"><span class="kn">' + q.num + '</span>' + LET4(q.part).map((L2, oi) => '<button class="kb' + (q.ans === oi ? ' on' : '') + '" data-tq="' + i + '" data-to="' + oi + '">' + L2 + '</button>').join('') + '</div>').join('') + '</div></details>' +
        '<div class="grid g2" style="margin-top:10px"><div><label>Tên đề (ngân hàng)</label><input type="text" id="txName" value="' + esc(st.name) + '"></div>' +
        '<div><label><input type="checkbox" id="txScript"' + (st.script !== false ? ' checked' : '') + '> Lưu lời thoại Part 3–4 vào ngân hàng (xem khi chữa bài)</label></div></div>' +
        '<div class="row" style="margin-top:10px"><button class="btn primary" id="txSave">Lưu ngân hàng &amp; tải file nghe, ảnh lên Google Drive</button><span class="hint" id="txUp"></span></div>';
    }
    const LET4 = (pt) => (pt === 2 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D']);
    function bindSummary() {
      $$('[data-part]').forEach(cb => cb.onchange = () => { st.parts[+cb.dataset.part] = cb.checked; });
      const qs = allQs();
      $$('[data-tq]').forEach(b => b.onclick = () => { const q = qs[+b.dataset.tq]; st.parsed[q.sec].qs[q.num].ans = +b.dataset.to; render(); const d = $('details'); if (d) d.open = true; });
      $('#txName').oninput = (e) => { st.name = e.target.value; };
      $('#txScript').onchange = (e) => { st.script = e.target.checked; };
      $('#txSave').onclick = save;
    }
    async function save() {
      if (!ctx.needConn()) return;
      const qs = allQs().filter(q => st.parts[q.part]);
      if (!qs.length) return toast('Chưa chọn phần nào', 'bad');
      const btn = $('#txSave'); btn.disabled = true;
      const up = (t) => { const e = $('#txUp'); if (e) e.textContent = t; };
      const bank = { id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: (st.name || 'Đề TOEIC').trim(), file: st.keys.map(f => f.name).join(', '), addedAt: Date.now(), groups: [], audio: {}, questions: [], source: 'etskey' };
      const tag = bank.name.replace(/[^\w\- ]+/g, '').slice(0, 40);
      try {
        // 1) file nghe cần dùng
        const need = {};
        qs.forEach(q => { const a = audFor(q); if (a) need[a.q || a.g || a.part] = 1; });
        const names = Object.keys(need); let k = 0;
        for (const nm of names) {
          const f = st.auds.find(x => x.name === nm); if (!f) continue;
          up('Đang tải file nghe ' + (++k) + '/' + names.length + ': ' + nm + '…');
          if (f.size > 30 * 1048576) throw new Error(nm + ' quá 30 MB — hãy nén lại');
          let r = null, err = null;
          for (let t = 0; t < 3 && !r; t++) { try { r = await ctx.api({ action: 'uploadAudio', name: nm, mime: f.type || MIME[extOf(nm)] || 'audio/mpeg', b64: await blobB64(f) }); } catch (e) { err = e; await new Promise(z => setTimeout(z, 1200 * (t + 1))); } }
          if (!r) throw err;
          bank.audio[nm] = { id: r.id, name: nm, size: f.size };
        }
        // 2) ảnh đoạn văn Part 6–7
        const R = st.parsed.R; const gImg = {};
        if (R) {
          const gs = R.groups.filter(g => g.imgs && g.imgs.length && qs.some(q => q.sec === 'R' && q.g === g.a));
          for (let i = 0; i < gs.length; i++) {
            up('Đang tải ảnh đoạn văn ' + (i + 1) + '/' + gs.length + '…');
            const c = st.crops[gs[i].a] || await cropBoxes(R.doc, gs[i].imgs);
            if (c) gImg[gs[i].a] = await uploadImg(ctx, c.blob, tag + '_doan_' + gs[i].a + '.jpg');
          }
        }
        // 3) ảnh tranh Part 1
        const pImg = {};
        const p1 = qs.filter(q => q.part === 1);
        for (let i = 0; i < p1.length && i < st.pics.length; i++) { up('Đang tải ảnh tranh Part 1: ' + (i + 1) + '…'); pImg[p1[i].num] = await uploadImg(ctx, st.pics[i], tag + '_part1_cau' + p1[i].num + '.jpg'); }
        // 4) dựng câu hỏi
        const gIdx = {};
        const groupFor = (key, mk) => { if (gIdx[key] == null) { gIdx[key] = bank.groups.length; bank.groups.push(mk()); } return gIdx[key]; };
        qs.forEach((q, i) => {
          const nOpt = q.part === 2 ? 3 : 4;
          const item = { n: i + 1, num: q.num, type: 'mc', skill: q.sec, part: q.part, pts: null };
          let stem = '', opts = q.opts.slice(0, nOpt);
          if (q.part === 1) { stem = (pImg[q.num] ? imgTag(pImg[q.num], 'Tranh câu ' + q.num) : '') + '<p><i>Look at the picture. Listen and choose the statement that best describes it.</i></p>'; opts = Array(4).fill(''); }
          else if (q.part === 2) { stem = '<p><i>Listen to the question or statement and choose the best response.</i></p>'; opts = Array(3).fill(''); }
          else if (q.part === 6) stem = '<p>Chọn từ / câu thích hợp cho chỗ trống <b>(' + q.num + ')</b> trong đoạn văn.</p>';
          else stem = '<p>' + htmlEsc(q.stem) + '</p>';
          while (opts.length < nOpt) opts.push('');
          item.stem = stem; item.text = q.part <= 2 ? '' : q.stem;
          item.options = opts.map(o => htmlEsc(o)); item.optText = opts.slice();
          item.correct = q.ans >= 0 && q.ans < nOpt ? [q.ans] : [];
          item.pin = opts.map(() => false);
          if (!item.correct.length) item.warn = 'Chưa có đáp án (file KEY không ghi) — bấm vào chữ cái để chọn';
          const a = audFor(q);
          if (a && a.q) item.audio = a.q;
          if (a && a.part) item.g = groupFor('part' + q.part, () => ({ title: PN[q.part], stem: '', audio: a.part, skill: 'L' }));
          if (q.part >= 3 && q.part <= 4) {
            const src = st.parsed.L, g = src && src.groups.find(x => x.a === q.g);
            const gb = g ? g.a : q.num;
            item.g = groupFor('L' + gb, () => ({ title: (q.part === 3 ? 'Conversation ' : 'Talk ') + (g ? g.a + '–' + g.b : q.num), stem: '', audio: a && a.g ? a.g : (a && a.part) || null, skill: 'L', script: st.script !== false && g ? g.script : '' }));
            if (a && a.g) delete item.audio;
          }
          if (q.part >= 6) {
            const g = R && R.groups.find(x => x.a === q.g);
            if (g) item.g = groupFor('R' + g.a, () => ({ title: 'Questions ' + g.a + '–' + g.b, stem: gImg[g.a] ? imgTag(gImg[g.a], 'Đoạn văn câu ' + g.a + '–' + g.b) : '<p class="hint">(Không cắt được ảnh đoạn văn — xem đề gốc)</p>', audio: null, skill: 'R' }));
          }
          bank.questions.push(item);
        });
      } catch (e) { up(''); toast('Tải lên chưa xong: ' + e.message + ' — bấm lưu lại để thử tiếp', 'bad'); btn.disabled = false; return; }
      ['L', 'R'].forEach(s => { const P = st.parsed[s]; if (P && P.task) try { P.task.destroy(); } catch (e) { /* bỏ qua */ } });
      up('');
      ctx.created(bank);
      ctx.closeModal();
      toast('Đã tạo đề "' + bank.name + '": ' + bank.questions.length + ' câu trắc nghiệm có chữ', 'ok');
    }
    render();
  }

  /* ------------------------------ Đề NÓI từ PDF ------------------------------ */
  function openSpeak(ctx) {
    const st = { file: null, items: [], pages: [], name: '', busy: false, doc: null, task: null, pts: 1 };
    const render = () => {
      ctx.modal('<div class="row"><h2 style="margin:0">Đề Nói (Speaking) từ file PDF</h2><span class="spacer"></span><button class="btn sm" id="spClose">Đóng</button></div>' +
        '<p class="hint">Chọn file PDF đề Nói (ví dụ đề TOEIC Speaking 11 câu). Phần mềm tách từng <b>“Question 1, Question 2…”</b> thành câu ghi âm: học sinh xem đề, chuẩn bị, bấm ghi âm; thầy/cô nghe lại và chấm. PDF dạng ảnh scan thì <b>mỗi trang là một câu</b> (học sinh xem ảnh trang đề). Thời gian chuẩn bị / trả lời tự lấy theo đề (dòng “Preparation time / Response time”) hoặc theo chuẩn TOEIC Speaking — sửa được ở bảng dưới.</p>' +
        '<label class="drop" id="spDrop" for="spIn"><b>Kéo thả hoặc bấm để chọn file PDF đề Nói</b>' + (st.file ? '<div class="hint">Đã chọn: ' + esc(st.file.name) + '</div>' : '') + '</label><input type="file" id="spIn" class="hide" accept=".pdf">' +
        '<div class="row" style="margin-top:8px"><span class="hint" id="spProg"></span></div>' +
        (st.items.length ? '<h3 style="margin:14px 0 6px">' + st.items.length + ' câu Nói</h3><table class="tbl"><tr><th>Câu</th><th>Nội dung đề (học sinh thấy)</th><th class="num">Chuẩn bị (giây)</th><th class="num">Ghi âm tối đa (giây)</th><th>Ảnh trang</th></tr>' +
          st.items.map((q, i) => '<tr><td><input type="checkbox" data-on="' + i + '"' + (q.on !== false ? ' checked' : '') + '> ' + q.num + '</td><td><textarea data-tx="' + i + '" rows="3" style="width:100%;min-width:220px">' + esc(q.text) + '</textarea></td><td class="num"><input type="number" min="0" max="300" data-pr="' + i + '" value="' + q.prep + '" style="width:70px"></td><td class="num"><input type="number" min="10" max="600" data-rc="' + i + '" value="' + q.rec + '" style="width:70px"></td><td>' + (q.thumb ? '<label><input type="checkbox" data-im="' + i + '"' + (q.img ? ' checked' : '') + '> <img src="' + q.thumb + '" style="width:60px;vertical-align:middle;border:1px solid var(--line)" alt=""></label>' : '—') + '</td></tr>').join('') + '</table>' +
          '<div class="grid g2" style="margin-top:10px"><div><label>Tên đề (ngân hàng)</label><input type="text" id="spName" value="' + esc(st.name) + '"></div><div><label>Điểm mỗi câu</label><input type="number" id="spPts" min="0.25" step="0.25" value="' + st.pts + '"></div></div>' +
          '<div class="row" style="margin-top:10px"><button class="btn primary" id="spSave">Lưu ngân hàng đề Nói</button><span class="hint" id="spUp"></span></div>' : ''));
      $('#spClose').onclick = ctx.closeModal;
      const inp = $('#spIn'); inp.onchange = () => { if (inp.files[0]) load(inp.files[0]); inp.value = ''; };
      const dz = $('#spDrop');
      dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('over'));
      dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); const f = Array.from(e.dataTransfer.files).find(x => /\.pdf$/i.test(x.name)); if (f) load(f); });
      $$('[data-on]').forEach(e => e.onchange = () => { st.items[+e.dataset.on].on = e.checked; });
      $$('[data-tx]').forEach(e => e.oninput = () => { st.items[+e.dataset.tx].text = e.value; });
      $$('[data-pr]').forEach(e => e.onchange = () => { st.items[+e.dataset.pr].prep = +e.value || 0; });
      $$('[data-rc]').forEach(e => e.onchange = () => { st.items[+e.dataset.rc].rec = Math.max(10, +e.value || 60); });
      $$('[data-im]').forEach(e => e.onchange = () => { st.items[+e.dataset.im].img = e.checked; });
      if ($('#spName')) { $('#spName').oninput = (e) => { st.name = e.target.value; }; $('#spPts').onchange = (e) => { st.pts = +e.target.value || 1; }; $('#spSave').onclick = save; }
    };
    async function pageImage(n, scale) {
      const page = await st.doc.getPage(n); const vp = page.getViewport({ scale: scale || 1.6 });
      const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: c, viewport: vp }).promise; page.cleanup();
      return cv;
    }
    async function load(file) {
      st.file = file; st.items = []; render();
      const prog = (t) => { const e = $('#spProg'); if (e) e.textContent = t; };
      try {
        const lib = await pdfLib();
        if (st.task) try { st.task.destroy(); } catch (e) { /* bỏ qua */ }
        const r = await QuizEts.readPdf(lib, new Uint8Array(await file.arrayBuffer()), (i, n) => prog('Đang đọc trang ' + i + '/' + n + '…'));
        st.doc = r.doc; st.task = r.task; st.pages = r.pages;
        let items = QuizEts.parseSpeaking(r.pages);
        const hasText = r.pages.some(p => p.items.length > 5);
        if (!items.length) items = r.pages.map(p => ({ num: p.n, title: 'Question ' + p.n, text: hasText ? p.items.map(i => i.s).join(' ').slice(0, 800) : '', prep: 30, rec: 60, p: p.n, scan: !hasText }));
        // trang có ảnh (tranh mô tả) hoặc PDF scan → kèm ảnh trang
        const imgPages = {};
        for (const p of r.pages) { try { imgPages[p.n] = (await QuizEts.imageBoxes(lib, r.doc, p.n)).length; } catch (e) { imgPages[p.n] = 0; } }
        for (const q of items) {
          if (!q.p) continue;
          const cv = await pageImage(q.p, 0.25); q.thumb = cv.toDataURL('image/jpeg', 0.6);
          q.img = !!(q.scan || imgPages[q.p] || /picture|photograph|image|tranh|ảnh/i.test(q.text + ' ' + (q.shared || '')));
          if (q.shared && !q.text.includes(q.shared.slice(0, 30))) q.text = (q.shared + '\n\n' + q.text).trim();
        }
        st.items = items;
        st.name = st.name || file.name.replace(/\.pdf$/i, '');
        prog('');
      } catch (e) { prog(''); toast('Không đọc được PDF: ' + e.message, 'bad'); }
      render();
    }
    async function save() {
      if (!ctx.needConn()) return;
      const its = st.items.filter(q => q.on !== false);
      if (!its.length) return toast('Chưa chọn câu nào', 'bad');
      const btn = $('#spSave'); btn.disabled = true;
      const up = (t) => { const e = $('#spUp'); if (e) e.textContent = t; };
      const bank = { id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: (st.name || 'Đề Nói').trim(), file: st.file.name, addedAt: Date.now(), groups: [], audio: {}, questions: [], source: 'speakpdf' };
      const tag = bank.name.replace(/[^\w\- ]+/g, '').slice(0, 40);
      const pageId = {};
      try {
        let k = 0;
        for (const q of its) {
          if (!q.img || !q.p || pageId[q.p]) continue;
          up('Đang tải ảnh trang đề ' + (++k) + '…');
          const cv = await pageImage(q.p, 1.8);
          const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.8));
          pageId[q.p] = await uploadImg(ctx, blob, tag + '_trang' + String(q.p).padStart(2, '0') + '.jpg');
        }
      } catch (e) { up(''); toast('Tải ảnh chưa xong: ' + e.message, 'bad'); btn.disabled = false; return; }
      its.forEach((q, i) => {
        const parts = [];
        parts.push('<p><b>' + esc(q.title || ('Question ' + q.num)) + '</b>' + (q.prep ? ' <span class="pill">Chuẩn bị ' + q.prep + ' giây</span>' : '') + ' <span class="pill">Trả lời ' + q.rec + ' giây</span></p>');
        if (q.text) parts.push('<div class="spktext">' + htmlEsc(q.text) + '</div>');
        if (q.img && pageId[q.p]) parts.push(imgTag(pageId[q.p], 'Trang đề ' + q.p));
        bank.questions.push({ n: i + 1, num: q.num, type: 'speak', skill: 'S', stem: parts.join(''), text: q.text || ('Question ' + q.num), rec: q.rec, prep: q.prep, answer: '', pts: st.pts || null });
      });
      if (st.task) try { st.task.destroy(); } catch (e) { /* bỏ qua */ }
      up('');
      ctx.created(bank);
      ctx.closeModal();
      toast('Đã tạo đề Nói "' + bank.name + '": ' + bank.questions.length + ' câu', 'ok');
    }
    render();
  }

  root.QuizBook = { openImport, view, audioNeeds, parseKey, parseParts, STD_PARTS, openText, openSpeak, readKeyPdf, audioNums, isKeyPdf };
})(window);
