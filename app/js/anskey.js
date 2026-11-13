/* anskey.js — Đọc BẢNG ĐÁP ÁN dạng ảnh scan (trang "ANSWERS" cuối sách đề TOEIC: mỗi Test 1 khung 5 cột × 20 dòng "101 (B)").
 * Không cần OCR: tìm các cụm "( chữ )" trên trang, xếp thành lưới theo khung, nhận chữ A/B/C/D theo hình dạng
 * (số lỗ kín: A=1, B=2, C=0, D=1; D có nét đứng bên trái, A nhọn ở đỉnh).
 * Phần mềm: Lê Duy Nam — GV Trường CĐ Dầu khí */
(function (root) {
  'use strict';

  /** Ảnh xám (Uint8) → ảnh nhị phân (1 = mực) */
  function binarize(rgba, W, H) {
    const g = new Uint8Array(W * H);
    let hist = new Uint32Array(256);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) { const v = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000 | 0; g[i] = v; hist[v]++; }
    // ngưỡng Otsu
    let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sB = 0, wB = 0, best = 0, th = 128;
    for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = g.length - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF); if (v > best) { best = v; th = t; } }
    th = Math.min(th, 170);
    const b = new Uint8Array(W * H);
    for (let i = 0; i < g.length; i++) b[i] = g[i] < th ? 1 : 0;
    return b;
  }
  /** Gán nhãn vùng mực liền nhau (8 hướng) → danh sách khung bao */
  function components(b, W, H) {
    const lab = new Int32Array(W * H), comps = [], stack = new Int32Array(W * H);
    let id = 0;
    for (let s = 0; s < b.length; s++) {
      if (!b[s] || lab[s]) continue;
      id++; let sp = 0; stack[sp++] = s; lab[s] = id;
      let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
      while (sp) {
        const p = stack[--sp], x = p % W, y = (p / W) | 0; n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= W) continue; const q = yy * W + xx; if (b[q] && !lab[q]) { lab[q] = id; stack[sp++] = q; } } }
      }
      comps.push({ id, x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, n });
    }
    return { lab, comps };
  }
  /** Nhận chữ A/B/C/D của 1 vùng mực */
  function classify(c, lab, W) {
    const w = c.w, h = c.h, m = new Uint8Array((w + 2) * (h + 2)), W2 = w + 2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (lab[(c.y0 + y) * W + c.x0 + x] === c.id) m[(y + 1) * W2 + x + 1] = 1;
    return classifyMask(m, w, h);
  }
  /** Cắt vùng [x0,x1]×[y0,y1] của ảnh nhị phân, thu về khung mực → nhận chữ (dùng khi chữ dính dấu ngoặc) */
  function classifyRegion(b, W, H, x0, y0, x1, y1) {
    x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0)); x1 = Math.min(W - 1, Math.round(x1)); y1 = Math.min(H - 1, Math.round(y1));
    let a0 = x1, a1 = x0, b0 = y1, b1 = y0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (b[y * W + x]) { if (x < a0) a0 = x; if (x > a1) a1 = x; if (y < b0) b0 = y; if (y > b1) b1 = y; }
    if (a1 - a0 < 4 || b1 - b0 < 6) return '?';
    const w = a1 - a0 + 1, h = b1 - b0 + 1, W2 = w + 2, m = new Uint8Array(W2 * (h + 2));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[(y + 1) * W2 + x + 1] = b[(b0 + y) * W + a0 + x];
    return classifyMask(m, w, h);
  }
  function classifyMask(m, w, h) {
    const W2 = w + 2;
    // lỗ kín: vùng nền không nối ra mép
    const seen = new Uint8Array(m.length), st = [];
    const fill = (s) => { let n = 0; st.push(s); seen[s] = 1; while (st.length) { const p = st.pop(); n++; const x = p % W2, y = (p / W2) | 0; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W2 || yy >= h + 2) return; const q = yy * W2 + xx; if (!m[q] && !seen[q]) { seen[q] = 1; st.push(q); } }); } return n; };
    fill(0);
    let holes = 0; const minHole = Math.max(2, (w * h) / 80);
    for (let i = 0; i < m.length; i++) if (!m[i] && !seen[i]) { if (fill(i) >= minHole) holes++; }
    // nét đứng bên trái: cột trái (25% bề rộng) có mực ở ≥ 85% số dòng
    let stemRows = 0; const lw = Math.max(1, Math.round(w * 0.25));
    for (let y = 1; y <= h; y++) { let ink = 0; for (let x = 1; x <= lw; x++) ink |= m[y * W2 + x]; stemRows += ink; }
    const stem = stemRows / h >= 0.85;
    // độ rộng mực ở 15% dòng trên cùng
    let tx0 = w, tx1 = 0; const topN = Math.max(1, Math.round(h * 0.15));
    for (let y = 1; y <= topN; y++) for (let x = 1; x <= w; x++) if (m[y * W2 + x]) { if (x < tx0) tx0 = x; if (x > tx1) tx1 = x; }
    const topW = tx1 >= tx0 ? (tx1 - tx0 + 1) / w : 0;
    // mép phải ở giữa chữ có mở (C)
    let rightMid = 0; for (let y = Math.round(h * 0.4); y <= Math.round(h * 0.6); y++) for (let x = Math.round(w * 0.7); x <= w; x++) rightMid |= m[(y + 1) * W2 + x];
    // mép trái thẳng đứng (B, D) hay cong / xiên (A, C): độ dao động vị trí mực trái nhất ở 80% dòng giữa
    let lmin = w, lmax = 0;
    for (let y = Math.round(h * 0.1) + 1; y <= Math.round(h * 0.9); y++) { let x = 1; while (x <= w && !m[y * W2 + x]) x++; if (x <= w) { if (x < lmin) lmin = x; if (x > lmax) lmax = x; } }
    const straight = (lmax - lmin) / w < 0.15;
    if (holes >= 2) return straight ? 'B' : topW < 0.5 ? 'A' : 'C';
    if (holes === 1) return straight ? 'D' : topW < 0.55 ? 'A' : 'C';
    return straight && rightMid ? 'D' : topW < 0.5 ? 'A' : 'C';
  }
  /** Tìm các cụm "( X )" trên trang → [{x, y, h, ch}] */
  function findCells(rgba, W, H) {
    const b = binarize(rgba, W, H);
    const { lab, comps } = components(b, W, H);
    const small = comps.filter(c => c.h >= 8 && c.h < H / 20 && c.w < W / 20 && c.n > 6);
    // dấu ngoặc: cao, mảnh
    const paren = small.filter(c => c.w <= c.h * 0.45 && c.h >= 12);
    const byX = small.slice().sort((a, b) => a.x0 - b.x0);
    const out = [];
    paren.forEach(p => {
      const cy = (p.y0 + p.y1) / 2;
      // chữ ngay bên phải dấu "("
      const L = byX.find(c => c !== p && c.x0 > p.x1 && c.x0 - p.x1 < p.h * 0.7 && c.y0 >= p.y0 - p.h * 0.15 && c.y1 <= p.y1 + p.h * 0.15 && c.h >= p.h * 0.45 && c.h <= p.h * 0.9 && c.w >= c.h * 0.45 && Math.abs((c.y0 + c.y1) / 2 - cy) < p.h * 0.25);
      if (!L) return;
      const R = paren.find(c => c !== p && c.x0 > L.x1 && c.x0 - L.x1 < p.h * 0.7 && Math.abs((c.y0 + c.y1) / 2 - cy) < p.h * 0.25 && Math.abs(c.h - p.h) < p.h * 0.15);
      if (!R) return;
      // đếm chữ số của số câu ngay bên trái "(": 1 chữ số → phần Nghe (1–100), 3 chữ số → phần Đọc (101–200)
      let nd = 0, cur = p.x0;
      for (;;) {
        let best = null;
        small.forEach(c => { if (c !== p && c.x1 < cur && cur - c.x1 < p.h * 0.6 && Math.abs((c.y0 + c.y1) / 2 - cy) < p.h * 0.3 && c.h >= p.h * 0.45 && c.h <= p.h * 0.95 && (!best || c.x1 > best.x1)) best = c; });
        if (!best || nd >= 4) break; nd++; cur = best.x0;
      }
      out.push({ x: p.x0, y: cy, h: p.h, ch: classify(L, lab, W), nd, dx: L.x0 - p.x0, lw: L.w, lh: L.h, ldy: (L.y0 + L.y1) / 2 - cy });
    });
    // bỏ trùng (một chữ chỉ thuộc 1 cụm)
    out.sort((a, b) => a.y - b.y || a.x - b.x);
    const res = out.filter((c, i) => !out.slice(0, i).some(d => Math.abs(d.x - c.x) < c.h && Math.abs(d.y - c.y) < c.h * 0.5));
    res.img = { b, W, H };
    return res;
  }
  /** Nhóm 1D: chia các giá trị đã sắp xếp khi khoảng cách > gap */
  function split1d(vals, gap) {
    const s = vals.slice().sort((a, b) => a - b), g = []; let cur = [];
    s.forEach(v => { if (cur.length && v - cur[cur.length - 1] > gap) { g.push(cur); cur = []; } cur.push(v); });
    if (cur.length) g.push(cur); return g;
  }
  /** Xếp các cụm thành khung đáp án (mỗi khung = 1 Test, đọc theo dòng, trái → phải) */
  function blocksOf(cells) {
    if (cells.length < 20) return [];
    const h = cells.map(c => c.h).sort((a, b) => a - b)[cells.length >> 1];
    // cột khung: các cụm x cách nhau xa (> 6 lần chiều cao chữ)
    const xs = split1d(cells.map(c => c.x), h * 6);
    const blocks = [];
    xs.forEach(xg => {
      const lo = xg[0], hi = xg[xg.length - 1];
      const inCol = cells.filter(c => c.x >= lo && c.x <= hi);
      split1d(inCol.map(c => c.y), h * 4).forEach(yg => {
        const ylo = yg[0], yhi = yg[yg.length - 1];
        const cs = inCol.filter(c => c.y >= ylo && c.y <= yhi);
        if (cs.length < 20) return;
        // xếp theo cột (chịu được ảnh chụp nghiêng): mỗi cột sắp theo y, thứ tự dòng = khoảng cách / bước dòng
        const colG = split1d(cs.map(c => c.x), h * 2).map(g => cs.filter(c => c.x >= g[0] && c.x <= g[g.length - 1]).sort((a, b) => a.y - b.y));
        const gaps = []; colG.forEach(g => { for (let i = 1; i < g.length; i++) gaps.push(g[i].y - g[i - 1].y); });
        gaps.sort((a, b) => a - b);
        const d = gaps.length ? gaps[Math.floor(gaps.length * 0.3)] : h * 2;
        const top = Math.min(...colG.map(g => g[0].y));
        const nRows = Math.max(...colG.map(g => { let r = Math.round((g[0].y - top) / d), py = g[0].y; g[0].r = r; for (let i = 1; i < g.length; i++) { r += Math.max(1, Math.round((g[i].y - py) / d)); py = g[i].y; g[i].r = r; } return r + 1; }));
        const nCols = colG.length;
        const grid = Array.from({ length: nRows }, () => Array(nCols).fill('?'));
        colG.forEach((g, ci) => g.forEach(c => { if (c.r < nRows) grid[c.r][ci] = c.ch; }));
        // ô chưa nhận được (chữ dính dấu ngoặc…): ước lượng vị trí từ ô trên / dưới cùng cột rồi cắt vùng chữ để nhận
        const img = cells.img;
        if (img) colG.forEach((g, ci) => {
          if (g.length < 2) return;
          const md = (k) => g.map(c => c[k]).sort((a, b) => a - b)[g.length >> 1];
          const dx = md('dx'), lw = md('lw'), lh = md('lh'), ldy = md('ldy');
          for (let r = 0; r < nRows; r++) {
            if (grid[r][ci] !== '?') continue;
            const up = g.filter(c => c.r < r).pop(), dn = g.find(c => c.r > r); if (!up && !dn) continue;
            const ref1 = up || dn, ref2 = dn || up, f = ref1 === ref2 ? 0 : (r - ref1.r) / (ref2.r - ref1.r);
            const x = ref1.x + (ref2.x - ref1.x) * f, y = (ref1 === ref2 ? ref1.y + (r - ref1.r) * d : ref1.y + (ref2.y - ref1.y) * f) + ldy;
            grid[r][ci] = classifyRegion(img.b, img.W, img.H, x + dx + lw * 0.06, y - lh * 0.5, x + dx + lw * 0.94, y + lh * 0.5);
          }
        });
        const first = colG.map(g => g[0]).filter(c => c.r === 0).map(c => c.nd).sort((a, b) => a - b);
        const nd = first.length ? first[first.length >> 1] : 0;
        blocks.push({ x: lo, y: ylo, rows: nRows, cols: nCols, letters: grid.map(r => r.join('')).join(''), base: nd >= 3 ? 101 : nd >= 1 ? 1 : 0 });
      });
    });
    // thứ tự đọc: theo dòng khung (trên → dưới), trong dòng trái → phải
    blocks.sort((a, b) => (Math.abs(a.y - b.y) < h * 10 ? 0 : a.y - b.y) || a.x - b.x);
    return blocks;
  }
  /** Đọc 1 trang (ImageData) → các khung đáp án */
  function readPage(img) { return blocksOf(findCells(img.data, img.width, img.height)); }

  root.QuizAnsKey = { readPage, findCells, blocksOf, classify };
  if (typeof module !== 'undefined') module.exports = root.QuizAnsKey;
})(typeof window !== 'undefined' ? window : globalThis);
