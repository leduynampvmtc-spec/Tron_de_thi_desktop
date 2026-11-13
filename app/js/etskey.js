/* etskey.js — Đọc file PDF "KEY / SCRIPT AND KEY" của bộ đề TOEIC (ETS) và file PDF đề Nói.
 *  - Tự lấy đáp án 200 câu (dùng cho Đề TOEIC nguyên bộ).
 *  - Tách câu hỏi + phương án + đáp án + lời thoại + ảnh đoạn văn → đề trắc nghiệm có chữ (trộn được).
 *  - Đề Nói (Speaking) từ PDF: mỗi "Question n" thành một câu ghi âm.
 * Chạy được trong trình duyệt (pdf.js) và Node (để kiểm thử).
 * Phần mềm: Lê Duy Nam — GV Trường CĐ Dầu khí */
(function (root) {
  'use strict';
  const LET = 'ABCD';
  const VI = /[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/i;
  const clean = (s) => String(s || '').replace(/[​‌‍﻿­]/g, '').replace(/ /g, ' ');

  /* ------------------------------ đọc PDF ------------------------------ */
  /** Trả về { doc, task, pages:[{n,w,h,items:[{s,x,y,w,h}]}] } — y tính từ mép trên trang */
  async function readPdf(lib, data, onProg) {
    const task = lib.getDocument({ data });
    const doc = await task.promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      const items = [];
      tc.items.forEach(it => {
        const s = clean(it.str); if (!s.trim()) return;
        const fh = Math.hypot(it.transform[2], it.transform[3]) || 10;
        items.push({ s, x: it.transform[4], y: vp.height - it.transform[5], w: it.width || s.length * fh * 0.5, h: fh });
      });
      pages.push({ n: i, w: vp.width, h: vp.height, items });
      if (onProg) onProg(i, doc.numPages);
      page.cleanup && page.cleanup();
    }
    return { doc, task, pages };
  }

  /* ------------------------------ dòng & cột ------------------------------ */
  /** Gộp chữ cùng hàng thành các "ô" (cell): chữ sát nhau nối liền (sửa lỗi tách "fi"), cách xa thì tách ô */
  function cellsOf(page) {
    const its = page.items.slice().sort((a, b) => (Math.abs(a.y - b.y) < 2.5 ? a.x - b.x : a.y - b.y));
    const rows = [];
    its.forEach(it => {
      let r = rows.length ? rows[rows.length - 1] : null;
      if (!r || Math.abs(r.y - it.y) > 2.5) { r = { y: it.y, items: [] }; rows.push(r); }
      r.items.push(it);
    });
    const cells = [];
    rows.forEach(r => {
      r.items.sort((a, b) => a.x - b.x);
      let c = null;
      r.items.forEach(it => {
        const gap = c ? it.x - (c.x + c.w) : 99;
        if (c && gap < 5) {
          c.s += (gap > 1.6 && !/\s$/.test(c.s) && !/^\s/.test(it.s) ? ' ' : '') + it.s;
          c.w = it.x + it.w - c.x;
        } else { c = { s: it.s, x: it.x, y: r.y, w: it.w, p: page.n }; cells.push(c); }
      });
    });
    cells.forEach(c => { c.s = c.s.replace(/\s+/g, ' ').trim(); });
    return cells.filter(c => c.s);
  }
  /** Vị trí cột bên phải (đáp án / dịch / giải thích) của trang: giá trị x hay gặp nhất trong khoảng 40–65% bề ngang */
  function splitX(cells, w) {
    const ansLike = cells.filter(c => c.x > w * 0.4 && c.x < w * 0.66 && /^(\(?[A-D]\)?|\d{1,3}[.:]?(\s*\(?[A-D]\)?)?|Chọn\b.*)$/i.test(c.s));
    if (ansLike.length) return Math.min(...ansLike.map(c => c.x)) - 6;
    const hist = {};
    cells.forEach(c => { if (c.x > w * 0.4 && c.x < w * 0.66) { const k = Math.round(c.x / 4) * 4; hist[k] = (hist[k] || 0) + 1; } });
    let best = null, bn = 0;
    Object.keys(hist).forEach(k => { if (hist[k] > bn) { bn = hist[k]; best = +k; } });
    return bn >= 3 ? best - 6 : w * 0.5;
  }

  /* ------------------------------ phương án ------------------------------ */
  /** Tách "(A) xxx (B) yyy …" → {stem, opts[]} */
  function splitOpts(text, nMax) {
    const t = ' ' + clean(text).replace(/\s+/g, ' ') + ' ';
    const marks = [];
    const re = /[\s(]\(?([A-D])\)\s*/g; let m;
    while ((m = re.exec(t))) marks.push({ L: m[1], at: m.index, end: m.index + m[0].length });
    // chọn dãy A,B,C,(D) liên tiếp đầu tiên
    let seq = [];
    for (let i = 0; i < marks.length; i++) {
      if (marks[i].L !== 'A') continue;
      const s = [marks[i]];
      for (let j = i + 1; j < marks.length && s.length < (nMax || 4); j++) if (marks[j].L === LET[s.length]) s.push(marks[j]);
      if (s.length >= 2) { seq = s; break; }
    }
    if (!seq.length) return { stem: t.trim(), opts: [] };
    const opts = seq.map((mk, k) => t.slice(mk.end, k + 1 < seq.length ? seq[k + 1].at : t.length).trim());
    return { stem: t.slice(0, seq[0].at).trim(), opts };
  }
  /** Đáp án trong phần giải thích tiếng Việt / cột đáp án */
  function ansOf(text) {
    const t = clean(text);
    let m = t.match(/(?:chọn|đáp\s*án(?:\s*đúng)?(?:\s*là)?)\s*[:\-–]?\s*\(?\s*([A-D])\s*\)?(?![a-zà-ỹ])/i);
    if (m) return LET.indexOf(m[1].toUpperCase());
    m = t.match(/^\s*\(?([A-D])\)?(?:\s|$)/);
    if (m) return LET.indexOf(m[1]);
    return -1;
  }

  /* ------------------------------ ảnh trên trang ------------------------------ */
  /** Vị trí các ảnh trên trang (đơn vị điểm PDF, gốc trên-trái) — đọc từ danh sách lệnh vẽ của pdf.js */
  async function imageBoxes(lib, doc, n) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const ops = await page.getOperatorList();
    const O = lib.OPS; const out = [];
    let ctm = [1, 0, 0, 1, 0, 0]; const stack = [];
    const mul = (m, t) => [m[0] * t[0] + m[2] * t[1], m[1] * t[0] + m[3] * t[1], m[0] * t[2] + m[2] * t[3], m[1] * t[2] + m[3] * t[3], m[0] * t[4] + m[2] * t[5] + m[4], m[1] * t[4] + m[3] * t[5] + m[5]];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const f = ops.fnArray[i], a = ops.argsArray[i];
      if (f === O.save) stack.push(ctm.slice());
      else if (f === O.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (f === O.transform) ctm = mul(ctm, a);
      else if (f === O.paintImageXObject || f === O.paintInlineImageXObject || f === O.paintImageXObjectRepeat || f === O.paintJpegXObject) {
        const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => [ctm[0] * u + ctm[2] * v + ctm[4], ctm[1] * u + ctm[3] * v + ctm[5]]);
        const xs = pts.map(p => p[0]), ys = pts.map(p => vp.height - p[1]);
        const b = { x: Math.min(...xs), y: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
        if (b.x2 - b.x > 20 && b.y2 - b.y > 20) out.push(b);
      }
    }
    page.cleanup && page.cleanup();
    return out;
  }
  /** Bỏ ảnh trang trí lặp lại ở mọi trang (logo đầu trang, hình mờ) */
  function dropDecor(all) {
    const key = (b) => [b.x, b.y, b.x2, b.y2].map(v => Math.round(v / 6)).join(',');
    const cnt = {}; let pagesWithImg = 0;
    Object.keys(all).forEach(p => { if (all[p].length) pagesWithImg++; const seen = {}; all[p].forEach(b => { const k = key(b); if (!seen[k]) { seen[k] = 1; cnt[k] = (cnt[k] || 0) + 1; } }); });
    const lim = Math.max(3, pagesWithImg * 0.3);
    const out = {};
    Object.keys(all).forEach(p => { out[p] = all[p].filter(b => cnt[key(b)] < lim); });
    return out;
  }

  /* ------------------------------ đọc file KEY ------------------------------ */
  /**
   * pages: kết quả readPdf().pages ; imgs (tuỳ chọn): { số trang: [ô ảnh] } đã bỏ ảnh trang trí
   * Trả về { sec:'L'|'R'|'', qs:{ num: {num, part, stem, opts[], ans, script, g} }, groups:[{a,b,part,title,script,imgs:[{p,x,y,x2,y2}]}], answers:{num:idx} }
   */
  function parseKey(pages, imgs) {
    imgs = imgs || {};
    const cellsL = [], cellsR = [], cellsA = [];
    const head = pages.slice(0, 2).map(p => p.items.map(i => i.s).join(' ')).join(' ');
    const RE_ANS = /^(\d{1,3}[.:]?\s*)?\(?[A-D]\)?$|^\d{1,3}[.:]?$/;
    pages.forEach(pg => {
      const cs = cellsOf(pg).filter(c => c.y > 88 && c.y < pg.h - 45 && !/^ETS\s+20\d\d\s+(LISTENING|READING)\s+TEST/i.test(c.s));
      // cột tiếng Việt (dịch / giải thích): x hay gặp của các ô có dấu tiếng Việt nằm ở nửa phải
      const hist = {};
      cs.forEach(c => { if (VI.test(c.s) && c.x > pg.w * 0.3) { const k = Math.round(c.x / 6) * 6; hist[k] = (hist[k] || 0) + 1; } });
      const bins = Object.keys(hist).map(Number).filter(k => hist[k] >= 2).sort((x, y) => x - y);
      const vx = bins.length ? bins[0] - 8 : pg.w * 0.56;
      cs.forEach(c => {
        c.pw = pg.w;
        if (RE_ANS.test(c.s) && (c.x > pg.w * 0.3 || /^\(?[A-D]\)?$/.test(c.s))) { cellsA.push(c); return; }
        if (c.x >= vx) { cellsR.push(c); return; }
        cellsL.push(c);
      });
    });
    const ord = (a, b) => a.p - b.p || a.y - b.y || a.x - b.x;
    cellsL.sort(ord); cellsR.sort(ord); cellsA.sort(ord);
    let sec = /LISTENING|\bLC\b|SCRIPT/i.test(head) ? 'L' : /READING|\bRC\b/i.test(head) ? 'R' : '';
    const qs = {}, groups = [], answers = {};
    let part = 0, cur = null, grp = null;
    const newGrp = (a, b, c, title) => { let g = groups.find(x => x.a === a && x.b === b); if (!g) { g = { a, b, part, title, script: [], p: c.p, y: c.y, imgs: [] }; groups.push(g); } return g; };
    const finish = () => { if (cur) { qs[cur.num] = cur; cur = null; } };
    const isNumCell = (c) => c.x < c.pw * 0.2 && /^(\d{1,3})\s*[.:\-–]?$/.test(c.s);
    for (let i = 0; i < cellsL.length; i++) {
      const c = cellsL[i];
      let m = c.s.match(/^PART\s*([1-7])\b/i);
      if (m) { finish(); part = +m[1]; grp = null; if (!sec) sec = part <= 4 ? 'L' : 'R'; continue; }
      if (/^(STT|Số|câu|Transcript.*|Nội dung đề|Đáp|án|Key)$/i.test(c.s)) continue;
      m = c.s.match(/^Questions?\s*(\d{1,3})\s*[-–]\s*(\d{1,3})/i);
      if (m) { finish(); grp = newGrp(+m[1], +m[2], c, 'Questions ' + m[1] + '-' + m[2]); continue; }
      if (VI.test(c.s)) continue; // dịch tiếng Việt nằm bên trái (đoạn dịch Part 6/7)
      if (/^\(Dịch\)|^Dịch\s*:/i.test(c.s)) continue;
      if (sec === 'L' && part >= 3) {
        if (c.x < c.pw * 0.2) {
          const r1 = c.s.match(/^(\d{2,3})\s*[-–]\s*(\d{2,3})\b\s*(.*)$/);
          if (r1 && +r1[2] > +r1[1] && +r1[2] - +r1[1] <= 4) { finish(); grp = newGrp(+r1[1], +r1[2], c, (part === 3 ? 'Conversation ' : 'Talk ') + r1[1] + '-' + r1[2]); if (r1[3] && !/^[WM]-\w+/.test(r1[3])) grp.script.push(r1[3]); continue; }
          const r = c.s.match(/^(\d{2,3})\s*[-–]$/);
          if (r) {
            let j = -1; for (let t = i + 1; t < Math.min(i + 8, cellsL.length); t++) { const nx = cellsL[t]; if (nx.p === c.p && Math.abs(nx.x - c.x) < 8 && nx.y - c.y < 24 && /^\d{2,3}$/.test(nx.s)) { j = t; break; } }
            if (j >= 0) { const b = +cellsL[j].s; cellsL.splice(j, 1); finish(); grp = newGrp(+r[1], b, c, (part === 3 ? 'Conversation ' : 'Talk ') + r[1] + '-' + b); continue; }
          }
          if (/^\d{2,3}$/.test(c.s)) continue;
        }
        const q = c.s.match(/^(\d{2,3})\.\s*(.*)$/);
        if (q && +q[1] >= 32 && +q[1] <= 100 && !qs[+q[1]] && (!cur || +q[1] > cur.num)) {
          finish(); if (grp && (+q[1] < grp.a || +q[1] > grp.b)) grp = null;
          cur = { num: +q[1], part: +q[1] <= 70 ? 3 : 4, raw: [q[2]], g: grp ? grp.a : null, p: c.p, y: c.y }; continue;
        }
        if (cur) cur.raw.push(c.s); else if (grp && !/^[WM]-\w+(\s*\/\s*[WM]-\w+)*$/.test(c.s)) grp.script.push(c.s);
        continue;
      }
      if (isNumCell(c)) {
        const n = +c.s.match(/^\d+/)[0];
        const okN = sec === 'L' ? (n >= 1 && n <= 31) : (n >= 101 && n <= 200);
        if (okN && !qs[n] && (!cur || n > cur.num)) {
          finish();
          if (grp && (n < grp.a || n > grp.b)) grp = null;
          cur = { num: n, part: part || 0, raw: [], g: grp ? grp.a : null, p: c.p, y: c.y, x: c.x };
          continue;
        }
      }
      if (cur && sec === 'R' && part >= 6 && cur.raw.length && cur.last && (c.p > cur.last.p + 1 || (c.p === cur.last.p && c.y - cur.last.y > 45)) && !/^\(?[A-D]\)/.test(c.s)) { finish(); continue; }
      if (cur) { cur.raw.push(c.s); cur.last = c; }
    }
    finish();
    const nums = Object.keys(qs).map(Number).sort((a, b) => a - b);
    nums.forEach(n => {
      const q = qs[n];
      if (!q.part) q.part = n <= 6 ? 1 : n <= 31 ? 2 : n <= 70 ? 3 : n <= 100 ? 4 : n <= 130 ? 5 : n <= 146 ? 6 : 7;
      const so = splitOpts(q.raw.join(' '), q.part === 2 ? 3 : 4);
      q.stem = so.stem.replace(/^\d{1,3}[.\s]+/, '').trim(); q.opts = so.opts;
      delete q.raw; delete q.last;
    });
    // ---- đáp án ----
    const before = (c, p, y) => c.p < p || (c.p === p && c.y < y - 1);
    nums.forEach((n, idx) => {
      const q = qs[n]; const nx = qs[nums[idx + 1]];
      const inBlock = (c) => !before(c, q.p, q.y - 3) && (!nx || before(c, nx.p, nx.y - 3));
      let ans = -1;
      if (sec === 'L' && q.part >= 3) {
        const cand = cellsA.filter(c => c.p >= q.p - 2 && c.p <= q.p + 2);
        for (let t = 0; t < cand.length && ans < 0; t++) {
          const mm = cand[t].s.match(/^(\d{1,3})[.:]?\s*(?:\(?([A-D])\)?)?$/);
          if (mm && +mm[1] === n) {
            let L2 = mm[2] || '';
            for (let u = t + 1; !L2 && u < Math.min(t + 3, cand.length); u++) { const lm = cand[u].s.match(/^\(?([A-D])\)?$/); if (lm && cand[u].p === cand[t].p && cand[u].y - cand[t].y < 40) L2 = lm[1]; }
            if (L2) ans = LET.indexOf(L2);
          }
        }
      } else {
        const a = cellsA.filter(inBlock).find(c => /^\(?[A-D]\)?$/.test(c.s) || /^\d{1,3}[.:]?\s*\(?[A-D]\)?$/.test(c.s));
        if (a) ans = LET.indexOf(a.s.replace(/[^A-D]/g, '').slice(-1));
        if (ans < 0) ans = ansOf(cellsR.filter(inBlock).map(c => c.s).join(' '));
      }
      q.ans = ans;
      if (ans >= 0) answers[n] = ans;
    });
    // nhóm nghe Part 3–4 chưa nhận ra tiêu đề: theo chuẩn 3 câu/nhóm
    if (sec === 'L') nums.filter(n => n >= 32 && qs[n].g == null).forEach(n => {
      const a = 32 + Math.floor((n - 32) / 3) * 3, b = a + 2;
      let g = groups.find(x => x.a === a); if (!g) { g = { a, b, part: n <= 70 ? 3 : 4, title: (n <= 70 ? 'Conversation ' : 'Talk ') + a + '-' + b, script: [], imgs: [] }; groups.push(g); }
      qs[n].g = a;
    });
    groups.forEach(g => { g.script = (Array.isArray(g.script) ? g.script.join('\n') : g.script || '').replace(/\s*\n\s*(?=[a-z,;])/g, ' ').trim(); });
    if (sec === 'R') attachPassages(qs, groups, imgs, pages);
    groups.sort((a, b) => a.a - b.a);
    return { sec, qs, groups, answers };
  }

  /** Gắn ảnh đoạn văn (Part 6–7) cho nhóm câu: ảnh nằm trước câu đầu tiên của nhóm */
  function attachPassages(qs, groups, imgs, pages) {
    const nums = Object.keys(qs).map(Number).filter(n => n >= 131).sort((a, b) => a - b);
    const all = [];
    Object.keys(imgs).forEach(p => imgs[p].forEach(b => all.push(Object.assign({ p: +p }, b))));
    all.sort((a, b) => a.p - b.p || a.y - b.y);
    // gán mỗi ảnh vào câu hỏi gần nhất phía sau
    const after = (im) => nums.find(n => qs[n].p > im.p || (qs[n].p === im.p && qs[n].y > im.y));
    const byFirst = {};
    all.forEach(im => { const n = after(im); if (n != null) (byFirst[n] = byFirst[n] || []).push(im); });
    // nhóm có tiêu đề "Questions a-b"
    groups.forEach(g => { if (g.a >= 131) { g.imgs = []; } });
    const firsts = Object.keys(byFirst).map(Number).sort((a, b) => a - b);
    firsts.forEach((n, k) => {
      let g = groups.find(x => x.a >= 131 && n >= x.a && n <= x.b);
      if (!g) {
        const end = (firsts[k + 1] || 201) - 1;
        g = { a: n, b: Math.min(end, Math.max(...nums.filter(x => x >= n && x <= end))), part: n <= 146 ? 6 : 7, title: '', script: '', imgs: [] };
        g.title = 'Questions ' + g.a + '-' + g.b;
        groups.push(g);
      }
      g.imgs = g.imgs.concat(byFirst[n]);
    });
    groups.sort((a, b) => a.a - b.a);
    nums.forEach(n => { const g = groups.find(x => x.a >= 131 && n >= x.a && n <= x.b); qs[n].g = g ? g.a : null; });
    void pages;
  }

  /* ------------------------------ đề NÓI ------------------------------ */
  const SPK_DEF = { 1: [45, 45], 2: [45, 45], 3: [45, 30], 4: [45, 30], 5: [3, 15], 6: [3, 15], 7: [3, 30], 8: [45, 15], 9: [3, 15], 10: [3, 30], 11: [45, 60] };
  /** Đề Nói: các khối "Question n" (hoặc "Questions 5-7") → [{num, title, text, prep, rec, p}] ; PDF scan → mỗi trang 1 câu */
  function parseSpeaking(pages) {
    const lines = [];
    pages.forEach(pg => cellsOf(pg).forEach(c => lines.push(c)));
    const out = []; let cur = null, shared = '';
    const flush = () => { if (cur) { cur.text = cur.lines.join('\n').trim(); delete cur.lines; out.push(cur); cur = null; } };
    lines.forEach(c => {
      const m = c.s.match(/^Questions?\s*(\d{1,2})(?:\s*(?:[-–]|to|and)\s*(\d{1,2}))?\s*[:.\-–]?\s*(.*)$/i);
      if (m) {
        flush();
        const a = +m[1], b = m[2] ? +m[2] : a;
        if (b > a) { shared = m[3] || ''; cur = null; out.push({ num: a, to: b, title: c.s, shared: true, lines: [] }); return; }
        cur = { num: a, title: 'Question ' + a, lines: m[3] ? [m[3]] : [], p: c.p };
        return;
      }
      if (cur) cur.lines.push(c.s); else if (out.length && out[out.length - 1].shared) out[out.length - 1].lines.push(c.s);
    });
    flush();
    // gộp phần giới thiệu dùng chung (Questions 5-7: đọc tình huống…) vào đúng các câu trong khoảng đó
    const res = []; let sh = null;
    out.forEach(q => {
      if (q.shared) { q.text = q.lines.join('\n').trim(); sh = { a: q.num, b: q.to, text: (q.title.replace(/^Questions?\s*\d+\s*(?:[-–]|to|and)\s*\d+\s*[:.]?\s*/i, '') + '\n' + q.text).trim() }; return; }
      const txt = q.text || '';
      const rt = txt.match(/response\s*time\s*[:\-]?\s*(\d{1,3})\s*(sec|giây|s\b)/i) || txt.match(/(\d{1,3})\s*(?:seconds|giây)\s*(?:to\s*(?:respond|read|answer)|để\s*trả\s*lời)/i);
      const pt = txt.match(/preparation\s*time\s*[:\-]?\s*(\d{1,3})/i) || txt.match(/(\d{1,3})\s*seconds\s*to\s*prepare/i);
      const def = SPK_DEF[q.num] || [30, 60];
      const inSh = sh && q.num >= sh.a && q.num <= sh.b;
      res.push({ num: q.num, title: q.title, text: txt, prep: pt ? +pt[1] : def[0], rec: rt ? +rt[1] : def[1], p: q.p, shared: inSh ? sh.text : '' });
    });
    return res.sort((a, b) => a.num - b.num);
  }

  const api = { readPdf, cellsOf, parseKey, parseSpeaking, splitOpts, ansOf, imageBoxes, dropDecor, LET };
  root.QuizEts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
