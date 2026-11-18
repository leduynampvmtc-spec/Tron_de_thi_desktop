/* =====================================================================
 * docx.js — Đọc file đề thi Word (.docx) ngay trong trình duyệt
 * Hỗ trợ 2 kiểu đề:
 *   (1) "Câu 1: ..." + các dòng "A) ... B) ..." — đáp án đúng là nhãn được
 *       GẠCH CHÂN (hoặc tô màu đỏ / highlight / có dấu * phía trước).
 *   (2) Bảng 2 cột: "1." | câu hỏi ; "A)" | phương án ; "Đáp án" | A
 * Câu không có phương án A/B/C… được hiểu là câu TỰ LUẬN
 * (dòng "Đáp án:" / "Hướng dẫn chấm:" phía sau là đáp án gợi ý).
 * Công thức MathType/Equation (ảnh WMF) và ảnh EMF được vẽ lại thành SVG.
 * Phần mềm: Lê Duy Nam — Giảng viên Trường Cao đẳng Dầu khí
 * ===================================================================== */
(function (root) {
  'use strict';

  /* ---------------------------- ZIP reader ---------------------------- */
  async function inflateRaw(u8) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([u8]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function readZip(buf) {
    const u8 = new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('File không phải định dạng .docx hợp lệ');
    const n = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {};
    const td = new TextDecoder('utf-8');
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      const name = td.decode(u8.subarray(p + 46, p + 46 + nlen));
      files[name] = { method, csize, lho };
      p += 46 + nlen + xlen + clen;
    }
    return {
      names: Object.keys(files),
      async get(name) {
        const f = files[name]; if (!f) return null;
        const l = f.lho;
        const nl = dv.getUint16(l + 26, true), xl = dv.getUint16(l + 28, true);
        const data = u8.subarray(l + 30 + nl + xl, l + 30 + nl + xl + f.csize);
        if (f.method === 0) return data.slice();
        if (f.method === 8) return inflateRaw(data);
        throw new Error('Kiểu nén không hỗ trợ: ' + f.method);
      },
      async text(name) { const b = await this.get(name); return b ? td.decode(b) : null; }
    };
  }

  /* ------------------------- Bảng mã font Symbol ------------------------ */
  const SYMBOL = {};
  (function () {
    const m = {
      0x22: '∀', 0x24: '∃', 0x27: '∋', 0x2A: '∗', 0x2D: '−', 0x40: '≅',
      0x41: 'Α', 0x42: 'Β', 0x43: 'Χ', 0x44: 'Δ', 0x45: 'Ε', 0x46: 'Φ', 0x47: 'Γ', 0x48: 'Η', 0x49: 'Ι', 0x4A: 'ϑ',
      0x4B: 'Κ', 0x4C: 'Λ', 0x4D: 'Μ', 0x4E: 'Ν', 0x4F: 'Ο', 0x50: 'Π', 0x51: 'Θ', 0x52: 'Ρ', 0x53: 'Σ', 0x54: 'Τ',
      0x55: 'Υ', 0x56: 'ς', 0x57: 'Ω', 0x58: 'Ξ', 0x59: 'Ψ', 0x5A: 'Ζ', 0x5C: '∴', 0x5E: '⊥', 0x60: '‾',
      0x61: 'α', 0x62: 'β', 0x63: 'χ', 0x64: 'δ', 0x65: 'ε', 0x66: 'φ', 0x67: 'γ', 0x68: 'η', 0x69: 'ι', 0x6A: 'ϕ',
      0x6B: 'κ', 0x6C: 'λ', 0x6D: 'μ', 0x6E: 'ν', 0x6F: 'ο', 0x70: 'π', 0x71: 'θ', 0x72: 'ρ', 0x73: 'σ', 0x74: 'τ',
      0x75: 'υ', 0x76: 'ϖ', 0x77: 'ω', 0x78: 'ξ', 0x79: 'ψ', 0x7A: 'ζ', 0x7E: '∼',
      0xA1: 'ϒ', 0xA2: '′', 0xA3: '≤', 0xA4: '⁄', 0xA5: '∞', 0xA6: 'ƒ', 0xA7: '♣', 0xA8: '♦', 0xA9: '♥', 0xAA: '♠',
      0xAB: '↔', 0xAC: '←', 0xAD: '↑', 0xAE: '→', 0xAF: '↓', 0xB0: '°', 0xB1: '±', 0xB2: '″', 0xB3: '≥', 0xB4: '×',
      0xB5: '∝', 0xB6: '∂', 0xB7: '•', 0xB8: '÷', 0xB9: '≠', 0xBA: '≡', 0xBB: '≈', 0xBC: '…', 0xBD: '|', 0xBE: '—',
      0xBF: '↵', 0xC0: 'ℵ', 0xC1: 'ℑ', 0xC2: 'ℜ', 0xC3: '℘', 0xC4: '⊗', 0xC5: '⊕', 0xC6: '∅', 0xC7: '∩', 0xC8: '∪',
      0xC9: '⊃', 0xCA: '⊇', 0xCB: '⊄', 0xCC: '⊂', 0xCD: '⊆', 0xCE: '∈', 0xCF: '∉', 0xD0: '∠', 0xD1: '∇', 0xD2: '®',
      0xD3: '©', 0xD4: '™', 0xD5: '∏', 0xD6: '√', 0xD7: '⋅', 0xD8: '¬', 0xD9: '∧', 0xDA: '∨', 0xDB: '⇔', 0xDC: '⇐',
      0xDD: '⇑', 0xDE: '⇒', 0xDF: '⇓', 0xE0: '◊', 0xE1: '〈', 0xE2: '®', 0xE3: '©', 0xE4: '™', 0xE5: '∑',
      0xE6: '⎛', 0xE7: '⎜', 0xE8: '⎝', 0xE9: '⎡', 0xEA: '⎢', 0xEB: '⎣', 0xEC: '⎧', 0xED: '⎨', 0xEE: '⎩', 0xEF: '⎪',
      0xF1: '〉', 0xF2: '∫', 0xF3: '⌠', 0xF4: '⎮', 0xF5: '⌡', 0xF6: '⎞', 0xF7: '⎟', 0xF8: '⎠', 0xF9: '⎤', 0xFA: '⎥',
      0xFB: '⎦', 0xFC: '⎫', 0xFD: '⎬', 0xFE: '⎭'
    };
    for (const k in m) SYMBOL[k] = m[k];
  })();
  const CP1252 = { 0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8A: 'Š', 0x8B: '‹', 0x8C: 'Œ', 0x8E: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9A: 'š', 0x9B: '›', 0x9C: 'œ', 0x9E: 'ž', 0x9F: 'Ÿ' };
  const MTEXTRA = { 0x26: '…', 0x3C: '◃', 0x3E: '▹', 0x41: '∘', 0x6C: 'ℓ', 0x76: '⃗', 0x2F: '∕', 0x60: '‵', 0x31: '↼', 0x32: '⇀', 0x3D: '⇌', 0x51: '∷', 0x52: '∶', 0xBC: '…' };
  function mapChar(code, face) {
    const f = (face || '').toLowerCase();
    if (code >= 0xF000 && code <= 0xF0FF) code -= 0xF000;
    if (f.indexOf('symbol') >= 0) return SYMBOL[code] || String.fromCharCode(code);
    if (f.indexOf('mt extra') >= 0) return MTEXTRA[code] || String.fromCharCode(code);
    if (f.indexOf('wingdings') >= 0) return code === 0xFC ? '✓' : code === 0xFB ? '✗' : '•';
    return CP1252[code] || String.fromCharCode(code);
  }

  /* ----------------------------- WMF → SVG ----------------------------- */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function colorRef(dv, o) { const r = dv.getUint8(o), g = dv.getUint8(o + 1), b = dv.getUint8(o + 2); return 'rgb(' + r + ',' + g + ',' + b + ')'; }

  function wmfToSvg(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let pos = 0, bbox = null, inch = 1440;
    if (dv.getUint32(0, true) === 0x9AC6CDD7) {
      bbox = { l: dv.getInt16(6, true), t: dv.getInt16(8, true), r: dv.getInt16(10, true), b: dv.getInt16(12, true) };
      inch = dv.getUint16(14, true) || 1440; pos = 22;
    }
    const hdrSize = dv.getUint16(pos + 2, true) * 2; pos += hdrSize;
    const objs = [];
    const add = (o) => { let i = objs.indexOf(null); if (i < 0) { objs.push(o); } else objs[i] = o; };
    let st = { pen: { style: 0, w: 0, color: 'rgb(0,0,0)' }, brush: { style: 0, color: 'rgb(0,0,0)' }, font: { h: 12, face: 'Times New Roman', weight: 400, italic: false, esc: 0 }, textColor: 'rgb(0,0,0)', align: 0, cx: 0, cy: 0 };
    const stack = [];
    let org = null, ext = null;
    const out = [];
    let guard = 0;
    while (pos + 6 <= u8.length && guard++ < 20000) {
      const size = dv.getUint32(pos, true) * 2, fn = dv.getUint16(pos + 4, true), b = pos + 6;
      if (size < 6) break;
      const I = (k) => dv.getInt16(b + 2 * k, true);
      switch (fn) {
        case 0x0000: pos = u8.length; break;
        case 0x020B: org = { y: I(0), x: I(1) }; break;
        case 0x020C: ext = { y: I(0), x: I(1) }; break;
        case 0x012E: st.align = dv.getUint16(b, true); break;
        case 0x0209: st.textColor = colorRef(dv, b); break;
        case 0x001E: stack.push(JSON.parse(JSON.stringify(st))); break;
        case 0x0127: if (stack.length) st = stack.pop(); break;
        case 0x02FB: {
          const h = I(0), weight = I(4), italic = dv.getUint8(b + 10) !== 0;
          let face = ''; for (let k = 18; k < 50 && b + k < pos + size; k++) { const c = dv.getUint8(b + k); if (!c) break; face += String.fromCharCode(c); }
          add({ kind: 'font', h: Math.abs(h) || 12, face, weight: weight || 400, italic, esc: I(2) });
          break;
        }
        case 0x02FA: add({ kind: 'pen', style: dv.getUint16(b, true) & 0xF, w: I(1), color: colorRef(dv, b + 6) }); break;
        case 0x02FC: add({ kind: 'brush', style: dv.getUint16(b, true), color: colorRef(dv, b + 2) }); break;
        case 0x00F7: case 0x06FF: case 0x0142: case 0x01F9: add({ kind: 'other' }); break;
        case 0x012D: {
          const o = objs[dv.getUint16(b, true)];
          if (o) { if (o.kind === 'font') st.font = o; else if (o.kind === 'pen') st.pen = o; else if (o.kind === 'brush') st.brush = o; }
          break;
        }
        case 0x01F0: { const i = dv.getUint16(b, true); if (i < objs.length) objs[i] = null; break; }
        case 0x0214: st.cy = I(0); st.cx = I(1); break;
        case 0x0213: {
          const y = I(0), x = I(1);
          if (st.pen.style !== 5) out.push({ t: 'line', x1: st.cx, y1: st.cy, x2: x, y2: y, pen: st.pen });
          st.cx = x; st.cy = y; break;
        }
        case 0x0324: case 0x0325: {
          const n = I(0); const pts = [];
          for (let k = 0; k < n; k++) pts.push(I(1 + 2 * k) + ',' + I(2 + 2 * k));
          out.push({ t: fn === 0x0324 ? 'polygon' : 'polyline', pts: pts.join(' '), pen: st.pen, brush: st.brush });
          break;
        }
        case 0x041B: {
          const bt = I(0), r = I(1), tp = I(2), l = I(3);
          out.push({ t: 'polygon', pts: [l + ',' + tp, r + ',' + tp, r + ',' + bt, l + ',' + bt].join(' '), pen: st.pen, brush: st.brush });
          break;
        }
        case 0x0521: case 0x0A32: {
          let y, x, n, strOff, opts = 0;
          if (fn === 0x0521) { n = I(0); strOff = b + 2; y = dv.getInt16(strOff + n + (n & 1), true); x = dv.getInt16(strOff + n + (n & 1) + 2, true); }
          else { y = I(0); x = I(1); n = I(2); opts = dv.getUint16(b + 6, true); strOff = b + 8 + ((opts & 0x6) ? 8 : 0); }
          const chars = [];
          for (let k = 0; k < n; k++) chars.push(mapChar(dv.getUint8(strOff + k), st.font.face));
          let dx = null;
          if (fn === 0x0A32) {
            const dxOff = strOff + n + (n & 1);
            if (dxOff + 2 * n <= pos + size) { dx = []; for (let k = 0; k < n; k++) dx.push(dv.getInt16(dxOff + 2 * k, true)); }
          }
          if (st.align & 1) { x = st.cx; y = st.cy; }
          const total = dx ? dx.reduce((a, c) => a + c, 0) : n * st.font.h * 0.5;
          out.push({ t: 'text', x, y, chars, dx, font: st.font, color: st.textColor, align: st.align, total });
          if (st.align & 1) st.cx = x + total;
          break;
        }
        default: break;
      }
      pos += size;
    }
    let vx, vy, vw, vh;
    if (org && ext) { vx = org.x; vy = org.y; vw = ext.x; vh = ext.y; }
    else if (bbox) { vx = bbox.l; vy = bbox.t; vw = bbox.r - bbox.l; vh = bbox.b - bbox.t; }
    else { vx = 0; vy = 0; vw = 1000; vh = 300; }
    if (vw < 0) { vx += vw; vw = -vw; } if (vh < 0) { vy += vh; vh = -vh; }
    let wpx, hpx;
    if (bbox) { wpx = Math.abs(bbox.r - bbox.l) / inch * 96; hpx = Math.abs(bbox.b - bbox.t) / inch * 96; }
    else { wpx = vw / 15; hpx = vh / 15; }
    const unit = vw / Math.max(wpx, 1);
    const parts = [];
    for (const o of out) {
      if (o.t === 'line') {
        parts.push('<line x1="' + o.x1 + '" y1="' + o.y1 + '" x2="' + o.x2 + '" y2="' + o.y2 + '" stroke="' + o.pen.color + '" stroke-width="' + Math.max(o.pen.w, unit) + '" stroke-linecap="square"/>');
      } else if (o.t === 'polygon' || o.t === 'polyline') {
        const fill = (o.t === 'polygon' && o.brush.style !== 1) ? o.brush.color : 'none';
        const stroke = o.pen.style === 5 ? 'none' : o.pen.color;
        parts.push('<' + o.t + ' points="' + o.pts + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + Math.max(o.pen.w, unit * 0.6) + '"/>');
      } else if (o.t === 'text') {
        const f = o.font;
        let x0 = o.x;
        const ha = o.align & 6;
        if (ha === 6) x0 = o.x - o.total / 2; else if (ha === 2) x0 = o.x - o.total;
        const va = o.align & 24;
        const base = va === 24 ? 'alphabetic' : va === 8 ? 'text-after-edge' : 'text-before-edge';
        const xs = [];
        let acc = x0;
        for (let k = 0; k < o.chars.length; k++) { xs.push(Math.round(acc)); acc += o.dx ? o.dx[k] : f.h * 0.5; }
        const fam = /symbol/i.test(f.face) ? "'Times New Roman',Times,'Cambria Math',serif" : "'" + esc(f.face || 'Times New Roman') + "','Times New Roman',Times,serif";
        const txt = o.chars.join('');
        if (!txt.trim()) continue;
        parts.push('<text x="' + xs.join(' ') + '" y="' + o.y + '" font-family="' + fam + '" font-size="' + f.h + '"' +
          (f.italic ? ' font-style="italic"' : '') + (f.weight >= 600 ? ' font-weight="bold"' : '') +
          ' fill="' + o.color + '" dominant-baseline="' + base + '" xml:space="preserve">' + esc(txt) + '</text>');
      }
    }
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + wpx.toFixed(1) + '" height="' + hpx.toFixed(1) + '" viewBox="' + vx + ' ' + vy + ' ' + vw + ' ' + vh + '">' + parts.join('') + '</svg>';
    return { svg, w: wpx, h: hpx };
  }

  function u8ToBase64(u8) {
    let s = ''; const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  }
  function svgDataUri(svg) { return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))); }

  /* ----------------------------- EMF → SVG -----------------------------
   * v2.4 — ảnh .emf (công thức, hình vẽ dán từ Visio / Excel / AutoCAD…) vẽ lại thành SVG.
   * Đọc các bản ghi GDI thường gặp: đường, đa giác, Bézier, path, hình chữ nhật, elip, chữ,
   * bút / chổi / phông, hệ tọa độ (map mode, window / viewport, world transform) và ảnh điểm (DIB). */
  function emfToSvg(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (u8.length < 88 || dv.getUint32(0, true) !== 1 || dv.getUint32(40, true) !== 0x464D4520) throw new Error('Không phải file EMF');
    const i32 = (o) => dv.getInt32(o, true), u32 = (o) => dv.getUint32(o, true), i16 = (o) => dv.getInt16(o, true), f32 = (o) => dv.getFloat32(o, true);
    const col = (o) => 'rgb(' + dv.getUint8(o) + ',' + dv.getUint8(o + 1) + ',' + dv.getUint8(o + 2) + ')';
    const bounds = { l: i32(8), t: i32(12), r: i32(16), b: i32(20) }, frame = { l: i32(24), t: i32(28), r: i32(32), b: i32(36) };
    const devPx = { x: i32(72), y: i32(76) }, devMm = { x: i32(80), y: i32(84) };
    const pxPerMm = { x: devMm.x > 0 && devPx.x > 0 ? devPx.x / devMm.x : 96 / 25.4, y: devMm.y > 0 && devPx.y > 0 ? devPx.y / devMm.y : 96 / 25.4 };
    const STOCK = { 0: { k: 'brush', style: 0, color: 'rgb(255,255,255)' }, 1: { k: 'brush', style: 0, color: 'rgb(192,192,192)' }, 2: { k: 'brush', style: 0, color: 'rgb(128,128,128)' }, 3: { k: 'brush', style: 0, color: 'rgb(64,64,64)' },
      4: { k: 'brush', style: 0, color: 'rgb(0,0,0)' }, 5: { k: 'brush', style: 1 }, 6: { k: 'pen', style: 0, w: 0, color: 'rgb(255,255,255)' }, 7: { k: 'pen', style: 0, w: 0, color: 'rgb(0,0,0)' }, 8: { k: 'pen', style: 5, w: 0 } };
    const DEF_FONT = { k: 'font', h: -16, esc: 0, weight: 400, italic: false, under: false, face: 'Arial' };
    const objs = {};
    let st = { pen: STOCK[7], brush: STOCK[0], font: DEF_FONT, text: 'rgb(0,0,0)', align: 0, fill: 'evenodd', mode: 1,
      wo: [0, 0], we: [1, 1], vo: [0, 0], ve: [1, 1], xf: [1, 0, 0, 1, 0, 0], cx: 0, cy: 0 };
    const stack = [];
    const out = [], bmps = [];
    let path = null, lastPath = '';
    // ma trận tổng: tọa độ logic → tọa độ thiết bị
    let M = null;
    const mat = () => {
      if (M) return M;
      const [a, b, c, d, e, f] = st.xf;
      let sx = 1, sy = 1, ox = -st.wo[0], oy = -st.wo[1], tx = st.vo[0], ty = st.vo[1];
      const fixed = { 2: 0.1, 3: 0.01, 4: 0.254, 5: 0.0254, 6: 25.4 / 1440 }[st.mode];
      if (fixed) { sx = fixed * pxPerMm.x; sy = -fixed * pxPerMm.y; }
      else if (st.mode === 7 || st.mode === 8) {
        sx = st.we[0] ? st.ve[0] / st.we[0] : 1; sy = st.we[1] ? st.ve[1] / st.we[1] : 1;
        if (st.mode === 7) { const m = Math.min(Math.abs(sx), Math.abs(sy)); sx = Math.sign(sx || 1) * m; sy = Math.sign(sy || 1) * m; }
      }
      // device = ((world(p) - wo) * s + vo)
      M = [a * sx, b * sy, c * sx, d * sy, (e + ox) * sx + tx, (f + oy) * sy + ty];
      return M;
    };
    const P = (x, y) => { const m = mat(); return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; };
    const fmt = (v) => Math.round(v * 100) / 100;
    const pt = (x, y) => { const p = P(x, y); return fmt(p[0]) + ' ' + fmt(p[1]); };
    const scaleX = () => { const m = mat(); return Math.hypot(m[0], m[1]) || 1; };
    const scaleY = () => { const m = mat(); return Math.hypot(m[2], m[3]) || 1; };
    const penW = () => (st.pen.w > 0 ? st.pen.w * (scaleX() + scaleY()) / 2 : 0);
    const styleOf = (fill, stroke) => {
      let s = '';
      const br = st.brush, pe = st.pen;
      if (fill && br && br.style !== 1) s += ' fill="' + br.color + '"' + (br.style === 2 ? ' fill-opacity="0.35"' : '') + ' fill-rule="' + st.fill + '"';
      else s += ' fill="none"';
      if (stroke && pe && pe.style !== 5) {
        const w = penW();
        s += ' stroke="' + pe.color + '" stroke-width="' + (w > 0 ? fmt(w) : '__HAIR__') + '"';
        const cap = pe.cap === 0x100 ? 'square' : pe.cap === 0x200 ? 'butt' : 'round', join = pe.join === 0x1000 ? 'bevel' : pe.join === 0x2000 ? 'miter' : 'round';
        s += ' stroke-linecap="' + cap + '" stroke-linejoin="' + join + '"';
        const u = Math.max(w, 1);
        const dash = { 1: [6, 2], 2: [1, 2], 3: [6, 2, 1, 2], 4: [6, 2, 1, 2, 1, 2] }[pe.style];
        if (dash) s += ' stroke-dasharray="' + dash.map(x => fmt(x * u)).join(' ') + '"';
      }
      return s;
    };
    const draw = (d, fill, stroke) => { if (d) out.push('<path d="' + d + '"' + styleOf(fill, stroke) + '/>'); };
    // đọc danh sách điểm
    const pts = (off, n, small) => { const a = []; for (let k = 0; k < n; k++) a.push(small ? [i16(off + 4 * k), i16(off + 4 * k + 2)] : [i32(off + 8 * k), i32(off + 8 * k + 4)]); return a; };
    const polyD = (a, close) => a.length ? 'M' + a.map(p => pt(p[0], p[1])).join('L') + (close ? 'Z' : '') : '';
    const bezD = (a, startWithMove) => {
      let d = '', k = 0;
      if (startWithMove) { d = 'M' + pt(a[0][0], a[0][1]); k = 1; }
      for (; k + 2 < a.length; k += 3) d += 'C' + pt(a[k][0], a[k][1]) + ' ' + pt(a[k + 1][0], a[k + 1][1]) + ' ' + pt(a[k + 2][0], a[k + 2][1]);
      return d;
    };
    const rectD = (l, t, r, b) => 'M' + pt(l, t) + 'L' + pt(r, t) + 'L' + pt(r, b) + 'L' + pt(l, b) + 'Z';
    const rrectD = (l, t, r, b, ew, eh) => {
      if (r < l) [l, r] = [r, l]; if (b < t) [t, b] = [b, t];
      const rx = Math.min(Math.abs(ew) / 2, (r - l) / 2), ry = Math.min(Math.abs(eh) / 2, (b - t) / 2), k = 0.4477;
      if (!rx || !ry) return rectD(l, t, r, b);
      return 'M' + pt(l + rx, t) + 'L' + pt(r - rx, t) + 'C' + pt(r - rx * k, t) + ' ' + pt(r, t + ry * k) + ' ' + pt(r, t + ry) +
        'L' + pt(r, b - ry) + 'C' + pt(r, b - ry * k) + ' ' + pt(r - rx * k, b) + ' ' + pt(r - rx, b) +
        'L' + pt(l + rx, b) + 'C' + pt(l + rx * k, b) + ' ' + pt(l, b - ry * k) + ' ' + pt(l, b - ry) +
        'L' + pt(l, t + ry) + 'C' + pt(l, t + ry * k) + ' ' + pt(l + rx * k, t) + ' ' + pt(l + rx, t) + 'Z';
    };
    const ellD = (l, t, r, b) => {
      const cx = (l + r) / 2, cy = (t + b) / 2, rx = (r - l) / 2, ry = (b - t) / 2, k = 0.5523;
      return 'M' + pt(cx + rx, cy) + 'C' + pt(cx + rx, cy + k * ry) + ' ' + pt(cx + k * rx, cy + ry) + ' ' + pt(cx, cy + ry) +
        'C' + pt(cx - k * rx, cy + ry) + ' ' + pt(cx - rx, cy + k * ry) + ' ' + pt(cx - rx, cy) +
        'C' + pt(cx - rx, cy - k * ry) + ' ' + pt(cx - k * rx, cy - ry) + ' ' + pt(cx, cy - ry) +
        'C' + pt(cx + k * rx, cy - ry) + ' ' + pt(cx + rx, cy - k * ry) + ' ' + pt(cx + rx, cy) + 'Z';
    };
    const emit = (d, fill, stroke) => { if (path !== null) path += d; else draw(d, fill, stroke); };
    const bmp = (rec, offBmi, cbBmi, offBits, cbBits, usage, x, y, w, h, sx, sy, sw, sh, rop) => {
      if (!cbBmi || offBmi + cbBmi > rec.size || offBits + cbBits > rec.size) return false;
      const p1 = P(x, y), p2 = P(x + w, y + h);
      const id = bmps.length;
      bmps.push({ bmi: u8.subarray(rec.pos + offBmi, rec.pos + offBmi + cbBmi), bits: u8.subarray(rec.pos + offBits, rec.pos + offBits + cbBits), usage, src: [sx, sy, sw, sh], rop: rop >>> 0, dest: [x, y, w, h].join(',') });
      const X = Math.min(p1[0], p2[0]), Y = Math.min(p1[1], p2[1]), W = Math.abs(p2[0] - p1[0]), H = Math.abs(p2[1] - p1[1]);
      const flip = (p2[0] < p1[0] ? -1 : 1), flipY = (p2[1] < p1[1] ? -1 : 1);
      const tr = flip < 0 || flipY < 0 ? ' transform="translate(' + fmt(flip < 0 ? 2 * X + W : 0) + ' ' + fmt(flipY < 0 ? 2 * Y + H : 0) + ') scale(' + flip + ' ' + flipY + ')"' : '';
      out.push('<image x="' + fmt(X) + '" y="' + fmt(Y) + '" width="' + fmt(W) + '" height="' + fmt(H) + '" preserveAspectRatio="none" href="__BMP' + id + '__"' + tr + '/>');
      return true;
    };
    let pos = 0, guard = 0, drew = 0, plusOnly = false;
    while (pos + 8 <= u8.length && guard++ < 200000) {
      const type = u32(pos), size = u32(pos + 4);
      if (size < 8 || pos + size > u8.length) break;
      const b = pos, rec = { pos, size };
      switch (type) {
        case 14: pos = u8.length; continue; // EOF
        case 9: st.we = [i32(b + 8), i32(b + 12)]; M = null; break;
        case 10: st.wo = [i32(b + 8), i32(b + 12)]; M = null; break;
        case 11: st.ve = [i32(b + 8), i32(b + 12)]; M = null; break;
        case 12: st.vo = [i32(b + 8), i32(b + 12)]; M = null; break;
        case 17: st.mode = u32(b + 8); M = null; break;
        case 19: st.fill = u32(b + 8) === 2 ? 'nonzero' : 'evenodd'; break;
        case 22: st.align = u32(b + 8); break;
        case 24: st.text = col(b + 8); break;
        case 33: stack.push(Object.assign({}, st, { xf: st.xf.slice(), wo: st.wo.slice(), we: st.we.slice(), vo: st.vo.slice(), ve: st.ve.slice() })); break;
        case 34: { let n = i32(b + 8); n = n < 0 ? -n : stack.length - n; let s2 = null; while (n-- > 0 && stack.length) s2 = stack.pop(); if (s2) { const cx = st.cx, cy = st.cy; st = s2; st.cx = cx; st.cy = cy; } M = null; break; }
        case 35: st.xf = [f32(b + 8), f32(b + 12), f32(b + 16), f32(b + 20), f32(b + 24), f32(b + 28)]; M = null; break;
        case 36: {
          const x = [f32(b + 8), f32(b + 12), f32(b + 16), f32(b + 20), f32(b + 24), f32(b + 28)], mode = u32(b + 32), o = st.xf;
          const mul = (p, q) => [p[0] * q[0] + p[1] * q[2], p[0] * q[1] + p[1] * q[3], p[2] * q[0] + p[3] * q[2], p[2] * q[1] + p[3] * q[3], p[4] * q[0] + p[5] * q[2] + q[4], p[4] * q[1] + p[5] * q[3] + q[5]];
          st.xf = mode === 1 ? [1, 0, 0, 1, 0, 0] : mode === 2 ? mul(x, o) : mode === 3 ? mul(o, x) : mode === 4 ? x : o;
          M = null; break;
        }
        case 37: { const ih = u32(b + 8); const o = ih & 0x80000000 ? STOCK[ih & 0x7FFFFFFF] || (ih & 0x7FFFFFFF) >= 10 && DEF_FONT : objs[ih]; if (o) { if (o.k === 'pen') st.pen = o; else if (o.k === 'brush') st.brush = o; else if (o.k === 'font') st.font = o; } break; }
        case 38: { const sty = u32(b + 12); objs[u32(b + 8)] = { k: 'pen', style: sty & 0xF, cap: sty & 0xF00, join: sty & 0xF000, w: i32(b + 16), color: col(b + 24) }; break; }
        case 95: { const sty = u32(b + 28); objs[u32(b + 8)] = { k: 'pen', style: sty & 0xF, cap: sty & 0xF00, join: sty & 0xF000, w: (sty & 0xF0000) ? u32(b + 32) : 0, color: col(b + 40), bs: u32(b + 36) }; if (objs[u32(b + 8)].bs === 1) objs[u32(b + 8)].style = 5; break; }
        case 39: objs[u32(b + 8)] = { k: 'brush', style: u32(b + 12), color: col(b + 16) }; break;
        case 93: case 94: objs[u32(b + 8)] = { k: 'brush', style: 0, color: 'rgb(160,160,160)' }; break; // chổi mẫu (pattern) → xám
        case 82: {
          let face = ''; for (let k = 0; k < 32; k++) { const c = dv.getUint16(b + 40 + 2 * k, true); if (!c) break; face += String.fromCharCode(c); }
          objs[u32(b + 8)] = { k: 'font', h: i32(b + 12), esc: i32(b + 20), weight: i32(b + 28), italic: !!dv.getUint8(b + 32), under: !!dv.getUint8(b + 33), face: face || 'Arial' };
          break;
        }
        case 40: delete objs[u32(b + 8)]; break;
        case 27: st.cx = i32(b + 8); st.cy = i32(b + 12); if (path !== null) path += 'M' + pt(st.cx, st.cy); break;
        case 54: { const x = i32(b + 8), y = i32(b + 12); if (path !== null) path += 'L' + pt(x, y); else { draw('M' + pt(st.cx, st.cy) + 'L' + pt(x, y), false, true); drew++; } st.cx = x; st.cy = y; break; }
        case 3: case 4: case 86: case 87: { // POLYGON, POLYLINE (32 / 16 bit)
          const small = type > 80, a = pts(b + 28, u32(b + 24), small), close = type === 3 || type === 86;
          if (path !== null) path += polyD(a, close); else { draw(polyD(a, close), close, true); drew++; }
          break;
        }
        case 6: case 89: { // POLYLINETO
          const a = pts(b + 28, u32(b + 24), type === 89);
          const d = a.map(p => 'L' + pt(p[0], p[1])).join('');
          if (path !== null) path += d; else { draw('M' + pt(st.cx, st.cy) + d, false, true); drew++; }
          if (a.length) { st.cx = a[a.length - 1][0]; st.cy = a[a.length - 1][1]; }
          break;
        }
        case 2: case 85: { const a = pts(b + 28, u32(b + 24), type === 85); if (path !== null) path += bezD(a, true); else { draw(bezD(a, true), false, true); drew++; } break; }
        case 5: case 88: { // POLYBEZIERTO
          const a = pts(b + 28, u32(b + 24), type === 88), d = bezD(a, false);
          if (path !== null) path += d; else { draw('M' + pt(st.cx, st.cy) + d, false, true); drew++; }
          if (a.length) { st.cx = a[a.length - 1][0]; st.cy = a[a.length - 1][1]; }
          break;
        }
        case 7: case 8: case 90: case 91: { // POLYPOLYLINE / POLYPOLYGON
          const small = type > 80, n = u32(b + 24), close = type === 8 || type === 91;
          let off = b + 32 + 4 * n, d = '';
          for (let k = 0; k < n; k++) { const c = u32(b + 32 + 4 * k); const a = pts(off, c, small); d += polyD(a, close); off += c * (small ? 4 : 8); }
          if (path !== null) path += d; else { draw(d, close, true); drew++; }
          break;
        }
        case 43: emit(rectD(i32(b + 8), i32(b + 12), i32(b + 16), i32(b + 20)), true, true); drew++; break;
        case 44: emit(rrectD(i32(b + 8), i32(b + 12), i32(b + 16), i32(b + 20), i32(b + 24), i32(b + 28)), true, true); drew++; break;
        case 42: emit(ellD(i32(b + 8), i32(b + 12), i32(b + 16), i32(b + 20)), true, true); drew++; break;
        case 59: path = ''; break;
        case 60: lastPath = path || ''; path = null; break;
        case 61: if (path !== null) path += 'Z'; break;
        case 62: draw(lastPath, true, false); drew++; break;
        case 63: draw(lastPath, true, true); drew++; break;
        case 64: draw(lastPath, false, true); drew++; break;
        case 67: lastPath = ''; break; // SELECTCLIPPATH
        case 76: case 77: { // BITBLT / STRETCHBLT
          const x = i32(b + 24), y = i32(b + 28), w = i32(b + 32), h = i32(b + 36);
          const ok = size >= 100 && bmp(rec, u32(b + 84), u32(b + 88), u32(b + 92), u32(b + 96), u32(b + 80), x, y, w, h, i32(b + 44), i32(b + 48), type === 77 ? i32(b + 100) : w, type === 77 ? i32(b + 104) : h, u32(b + 40));
          if (!ok && u32(b + 40) === 0x00F00021 && st.brush.style !== 1) { draw(rectD(x, y, x + w, y + h), true, false); }
          drew++; break;
        }
        case 81: bmp(rec, u32(b + 48), u32(b + 52), u32(b + 56), u32(b + 60), u32(b + 64), i32(b + 24), i32(b + 28), i32(b + 72), i32(b + 76), i32(b + 32), i32(b + 36), i32(b + 40), i32(b + 44), u32(b + 68)); drew++; break;
        case 80: bmp(rec, u32(b + 48), u32(b + 52), u32(b + 56), u32(b + 60), u32(b + 64), i32(b + 24), i32(b + 28), i32(b + 40), i32(b + 44), i32(b + 32), i32(b + 36), i32(b + 40), i32(b + 44), 0xCC0020); drew++; break;
        case 83: case 84: { // EXTTEXTOUTA / EXTTEXTOUTW
          const e = b + 36, n = u32(e + 8), offS = u32(e + 12), opts = u32(e + 16), offDx = u32(e + 36);
          let x = i32(e), y = i32(e + 4);
          if (!n || offS >= size) break;
          const chars = [], symF = /symbol|mt extra|wingdings/i.test(st.font.face);
          for (let k = 0; k < n; k++) {
            if (type === 84) { if (offS + 2 * k + 2 > size) break; const c = dv.getUint16(b + offS + 2 * k, true); chars.push((c >= 0xF000 && c <= 0xF0FF) || (symF && c < 0x100) ? mapChar(c, st.font.face) : String.fromCharCode(c)); }
            else { if (offS + k >= size) break; chars.push(mapChar(dv.getUint8(b + offS + k), st.font.face)); }
          }
          let dx = null;
          const step = opts & 0x2000 ? 2 : 1;
          if (offDx && offDx + 4 * n * step <= size) { dx = []; for (let k = 0; k < n; k++) dx.push(i32(b + offDx + 4 * k * step)); }
          if (st.align & 1) { x = st.cx; y = st.cy; }
          const f = st.font, fsLog = Math.abs(f.h) * (f.h > 0 ? 0.87 : 1) || 12;
          const sX = scaleX(), sY = scaleY(), fs = fsLog * sY;
          const total = dx ? dx.reduce((a, c) => a + c, 0) : n * fsLog * 0.5;
          if (st.align & 1) st.cx = x + total;
          const txt = chars.join('');
          if (!txt.trim()) break;
          const p = P(x, y), m = mat();
          let ang = Math.atan2(m[1], m[0]) * 180 / Math.PI - (f.esc || 0) / 10;
          const ha = st.align & 6;
          let x0 = p[0];
          if (ha === 6) x0 -= total * sX / 2; else if (ha === 2) x0 -= total * sX;
          const va = st.align & 24;
          const base = va === 24 ? 'alphabetic' : va === 8 ? 'text-after-edge' : 'text-before-edge';
          const xs = []; let acc = x0;
          for (let k = 0; k < chars.length; k++) { xs.push(fmt(acc)); acc += (dx ? dx[k] : fsLog * 0.5) * sX; }
          const fam = /symbol|mt extra/i.test(f.face) ? "'Times New Roman',Times,'Cambria Math',serif" : "'" + esc(f.face) + "'," + (/math/i.test(f.face) ? "'Cambria Math','STIX Two Math'," : '') + "'Times New Roman',Times,serif";
          ang = Math.round(ang * 100) / 100;
          out.push('<text x="' + (dx ? xs.join(' ') : fmt(x0)) + '" y="' + fmt(p[1]) + '" font-family="' + fam + '" font-size="' + fmt(fs) + '"' +
            (f.italic ? ' font-style="italic"' : '') + (f.weight >= 600 ? ' font-weight="bold"' : '') + (f.under ? ' text-decoration="underline"' : '') +
            (ang ? ' transform="rotate(' + ang + ' ' + fmt(p[0]) + ' ' + fmt(p[1]) + ')"' : '') +
            ' fill="' + st.text + '" dominant-baseline="' + base + '" xml:space="preserve">' + esc(txt) + '</text>');
          drew++;
          break;
        }
        case 70: { // GDICOMMENT: EMF+ only (không có bản ghi GDI dự phòng)
          if (size >= 24 && u32(b + 12) === 0x2B464D45 && dv.getUint16(b + 16, true) === 0x4001) plusOnly = (dv.getUint16(b + 18, true) & 1) === 0;
          break;
        }
        default: break;
      }
      pos += size;
    }
    if (!drew) throw new Error(plusOnly ? 'EMF+ chỉ có bản ghi GDI+' : 'EMF không có nét vẽ nào đọc được');
    // khung hình: Frame (0,01 mm) → tọa độ thiết bị; dự phòng Bounds
    let vx, vy, vw, vh;
    if (frame.r > frame.l && frame.b > frame.t) { vx = frame.l / 100 * pxPerMm.x; vy = frame.t / 100 * pxPerMm.y; vw = (frame.r - frame.l) / 100 * pxPerMm.x; vh = (frame.b - frame.t) / 100 * pxPerMm.y; }
    else if (bounds.r >= bounds.l && bounds.b >= bounds.t) { vx = bounds.l; vy = bounds.t; vw = bounds.r - bounds.l + 1; vh = bounds.b - bounds.t + 1; }
    else { vx = 0; vy = 0; vw = 400; vh = 200; }
    const mm2px = 96 / 25.4;
    let wpx = vw / pxPerMm.x * mm2px, hpx = vh / pxPerMm.y * mm2px;
    if (!(wpx > 0)) wpx = 200; if (!(hpx > 0)) hpx = 100;
    const hair = fmt(Math.max(vw / wpx, 0.5));
    const body = out.join('').replace(/__HAIR__/g, hair);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + wpx.toFixed(1) + '" height="' + hpx.toFixed(1) + '" viewBox="' + fmt(vx) + ' ' + fmt(vy) + ' ' + fmt(vw) + ' ' + fmt(vh) + '">' + body + '</svg>';
    return { svg, w: wpx, h: hpx, bitmaps: bmps };
  }

  /** Ảnh điểm (DIB) trong EMF → data URI (PNG qua canvas; không có canvas thì BMP) */
  /** Giải nén ảnh RLE8 / RLE4 → các hàng không nén (độn 4 byte, từ dưới lên) */
  function unRle(src, w, h, bpp) {
    const stride = ((w * bpp + 31) >> 5) << 2, out = new Uint8Array(stride * h);
    let x = 0, y = 0, i = 0;
    const put = (v) => { if (x < w && y < h) { if (bpp === 8) out[y * stride + x] = v; else { const o = y * stride + (x >> 1); out[o] |= (x & 1) ? v & 15 : (v & 15) << 4; } } x++; };
    while (i + 1 < src.length && y < h) {
      const n = src[i], c = src[i + 1]; i += 2;
      if (n) { for (let k = 0; k < n; k++) put(bpp === 8 ? c : (k & 1 ? c & 15 : c >> 4)); continue; }
      if (c === 0) { x = 0; y++; } else if (c === 1) break;
      else if (c === 2) { x += src[i]; y += src[i + 1]; i += 2; }
      else { for (let k = 0; k < c; k++) put(bpp === 8 ? src[i + k] : (k & 1 ? src[i + (k >> 1)] & 15 : src[i + (k >> 1)] >> 4)); const used = bpp === 8 ? c : (c + 1) >> 1; i += used + (used & 1); }
    }
    return out;
  }
  function dibToRgba(bmi, bits) {
    const dv = new DataView(bmi.buffer, bmi.byteOffset, bmi.byteLength);
    const hs = dv.getUint32(0, true);
    let w, h, bpp, comp = 0, nCol = 0;
    if (hs === 12) { w = dv.getUint16(4, true); h = dv.getInt16(6, true); bpp = dv.getUint16(10, true); }
    else { w = dv.getInt32(4, true); h = dv.getInt32(8, true); bpp = dv.getUint16(14, true); comp = dv.getUint32(16, true); nCol = hs >= 36 ? dv.getUint32(32, true) : 0; }
    if (comp === 4) return { mime: 'image/jpeg', raw: bits };
    if (comp === 5) return { mime: 'image/png', raw: bits };
    if (comp !== 0 && comp !== 3 && comp !== 1 && comp !== 2) return null;
    const top = h < 0; h = Math.abs(h);
    if (comp === 1 || comp === 2) { bits = unRle(bits, w, h, comp === 1 ? 8 : 4); if (!bits) return null; comp = 0; }
    if (!w || !h || w * h > 25e6) return null;
    let masks = null, palOff = hs;
    if (comp === 3) { if (hs === 40) { masks = [dv.getUint32(40, true), dv.getUint32(44, true), dv.getUint32(48, true)]; palOff = 52; } else masks = [dv.getUint32(40, true), dv.getUint32(44, true), dv.getUint32(48, true)]; }
    const pal = [];
    if (bpp <= 8) { const n = nCol || (1 << bpp), es = hs === 12 ? 3 : 4; for (let k = 0; k < n && palOff + k * es + 2 < bmi.length; k++) pal.push([bmi[palOff + k * es + 2], bmi[palOff + k * es + 1], bmi[palOff + k * es]]); }
    const stride = ((w * bpp + 31) >> 5) << 2, px = new Uint8ClampedArray(w * h * 4);
    const sh = (m) => { let s = 0; if (!m) return [0, 0]; while (!((m >> s) & 1)) s++; let n = 0; while ((m >> (s + n)) & 1) n++; return [s, n]; };
    const ms = masks ? masks.map(sh) : null;
    const bv = new DataView(bits.buffer, bits.byteOffset, bits.byteLength);
    let alphaUsed = false;
    for (let yy = 0; yy < h; yy++) {
      const row = (top ? yy : h - 1 - yy) * stride; if (row + stride > bits.length + 3) break;
      for (let xx = 0; xx < w; xx++) {
        const o = (yy * w + xx) * 4; let r = 0, g = 0, bb = 0, a = 255;
        if (bpp === 24) { const q = row + xx * 3; bb = bits[q]; g = bits[q + 1]; r = bits[q + 2]; }
        else if (bpp === 32) { const q = row + xx * 4; if (ms) { const v = bv.getUint32(q, true); const c = (m, k) => { const [s, n] = ms[k]; return n ? Math.round(((v & m) >>> s) * 255 / ((1 << n) - 1)) : 0; }; r = c(masks[0], 0); g = c(masks[1], 1); bb = c(masks[2], 2); } else { bb = bits[q]; g = bits[q + 1]; r = bits[q + 2]; a = bits[q + 3]; if (a) alphaUsed = true; } }
        else if (bpp === 16) { const v = bits[row + xx * 2] | (bits[row + xx * 2 + 1] << 8); if (ms) { const c = (k) => { const [s, n] = ms[k]; return n ? Math.round(((v & masks[k]) >>> s) * 255 / ((1 << n) - 1)) : 0; }; r = c(0); g = c(1); bb = c(2); } else { r = ((v >> 10) & 31) * 255 / 31; g = ((v >> 5) & 31) * 255 / 31; bb = (v & 31) * 255 / 31; } }
        else { const per = 8 / bpp, byte = bits[row + Math.floor(xx / per)], idx = (byte >> (8 - bpp * (xx % per + 1))) & ((1 << bpp) - 1); const c = pal[idx] || [idx * 255 / ((1 << bpp) - 1), idx * 255 / ((1 << bpp) - 1), idx * 255 / ((1 << bpp) - 1)]; r = c[0]; g = c[1]; bb = c[2]; }
        px[o] = r; px[o + 1] = g; px[o + 2] = bb; px[o + 3] = a;
      }
    }
    if (bpp === 32 && !ms && !alphaUsed) for (let k = 3; k < px.length; k += 4) px[k] = 255;
    return { w, h, px };
  }
  const ROP_AND = 0x8800C6, ROP_OR = 0xEE0086;
  function dibToDataUri(bm, mask) {
    const d = dibToRgba(bm.bmi, bm.bits);
    if (!d) return null;
    if (d.raw) return 'data:' + d.mime + ';base64,' + u8ToBase64(d.raw);
    const lum = (a, k) => (a[k] + a[k + 1] + a[k + 2]) / 3;
    if (mask && mask.w === d.w && mask.h === d.h) { for (let k = 0; k < d.px.length; k += 4) if ((lum(mask.px, k) > 127) !== !!mask.whiteOpaque) d.px[k + 3] = 0; }
    else if (bm.rop === ROP_AND) { for (let k = 0; k < d.px.length; k += 4) if (lum(d.px, k) > 250) d.px[k + 3] = 0; }   // AND với nền: trắng = trong suốt
    else if (bm.rop === ROP_OR) { for (let k = 0; k < d.px.length; k += 4) if (lum(d.px, k) < 5) d.px[k + 3] = 0; }      // OR với nền: đen = trong suốt
    if (typeof document !== 'undefined') {
      try {
        const cv = document.createElement('canvas'); cv.width = d.w; cv.height = d.h;
        cv.getContext('2d').putImageData(new ImageData(d.px, d.w, d.h), 0, 0);
        let u = cv.toDataURL('image/png');
        if (u.length > 700000) { const j = cv.toDataURL('image/jpeg', 0.85); if (j.length < u.length) u = j; }
        return u;
      } catch (e) { /* dùng BMP */ }
    }
    // BMP 32 bit (môi trường không có canvas)
    const fileSize = 14 + 40 + d.w * d.h * 4, buf = new Uint8Array(fileSize), v = new DataView(buf.buffer);
    buf[0] = 66; buf[1] = 77; v.setUint32(2, fileSize, true); v.setUint32(10, 54, true);
    v.setUint32(14, 40, true); v.setInt32(18, d.w, true); v.setInt32(22, -d.h, true); v.setUint16(26, 1, true); v.setUint16(28, 32, true);
    for (let k = 0; k < d.w * d.h; k++) { buf[54 + 4 * k] = d.px[4 * k + 2]; buf[55 + 4 * k] = d.px[4 * k + 1]; buf[56 + 4 * k] = d.px[4 * k]; buf[57 + 4 * k] = d.px[4 * k + 3]; }
    return 'data:image/bmp;base64,' + u8ToBase64(buf);
  }
  function emfToDataUri(u8) {
    const r = emfToSvg(u8);
    let svg = r.svg;
    const bm = r.bitmaps, drop = (i) => { svg = svg.replace(new RegExp('<image[^>]*__BMP' + i + '__[^>]*/>'), ''); };
    for (let i = 0; i < bm.length; i++) {
      // cặp mặt nạ + ảnh vẽ chồng cùng chỗ (OR mặt nạ rồi AND ảnh, hoặc AND mặt nạ rồi OR ảnh) → 1 ảnh nền trong suốt
      const nx = bm[i + 1];
      if (nx && nx.dest === bm[i].dest && ((bm[i].rop === ROP_OR && nx.rop === ROP_AND) || (bm[i].rop === ROP_AND && nx.rop === ROP_OR))) {
        const mask = dibToRgba(bm[i].bmi, bm[i].bits); if (mask) mask.whiteOpaque = bm[i].rop === ROP_OR; // mặt nạ OR: trắng = phần ảnh; mặt nạ AND: trắng = trong suốt
        drop(i); const u = dibToDataUri(nx, mask && !mask.raw ? mask : null);
        if (u) svg = svg.replace('__BMP' + (i + 1) + '__', u); else drop(i + 1);
        i++; continue;
      }
      const u = dibToDataUri(bm[i]);
      if (u) svg = svg.replace('__BMP' + i + '__', u); else drop(i);
    }
    return { src: svgDataUri(svg), w: r.w, h: r.h, svg };
  }
  async function gunzip(u8) {
    const ds = new DecompressionStream('gzip');
    return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer());
  }

  /* ----------------------------- DOCX parse ----------------------------- */
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const ln = (el) => el.localName;
  function kids(el, name) { const r = []; for (const c of el.children) if (!name || ln(c) === name) r.push(c); return r; }
  function kid(el, name) { for (const c of el.children) if (ln(c) === name) return c; return null; }
  function wattr(el, name) { return el ? (el.getAttributeNS(W, name) || el.getAttribute('w:' + name)) : null; }
  function descendants(el, name) { return Array.from(el.getElementsByTagName('*')).filter(e => ln(e) === name); }

  /** Seg: {t:'x', s, b,i,u,sup,sub,mark} | {t:'img', src, w, h} | {t:'br'} | {t:'html', html, s} */
  function plainOf(segs) { return segs.map(s => s.t === 'x' ? s.s : s.t === 'br' ? '\n' : s.t === 'html' ? (s.s || '￼') : '￼').join(''); }

  function sliceSegs(segs, start, end) {
    const out = []; let p = 0;
    for (const s of segs) {
      const len = s.t === 'x' ? s.s.length : (s.t === 'html' ? (s.s || '￼').length : 1);
      const a = Math.max(start, p), bnd = Math.min(end, p + len);
      if (bnd > a) {
        if (s.t === 'x') out.push(Object.assign({}, s, { s: s.s.slice(a - p, bnd - p) }));
        else if (a === p && bnd === p + len) out.push(s);
      }
      p += len;
    }
    return out;
  }
  function trimSegs(segs) {
    const plain = plainOf(segs);
    const m1 = plain.match(/^[\s ]*/)[0].length;
    const m2 = plain.length - plain.match(/[\s ]*$/)[0].length;
    return m2 > m1 ? sliceSegs(segs, m1, m2) : [];
  }
  function segsToHtml(segs) {
    let h = '';
    for (const s of segs) {
      if (s.t === 'br') { h += '<br>'; continue; }
      if (s.t === 'img') {
        const st = [];
        if (s.w) st.push('width:' + Math.round(s.w) + 'px');
        if (s.h) st.push('height:' + Math.round(s.h) + 'px');
        h += '<img class="qimg" alt="" src="' + s.src + '"' + (st.length ? ' style="' + st.join(';') + '"' : '') + '>';
        continue;
      }
      if (s.t === 'html') { h += s.html; continue; }
      let t = esc(s.s);
      if (s.sup) t = '<sup>' + t + '</sup>';
      if (s.sub) t = '<sub>' + t + '</sub>';
      if (s.i) t = '<i>' + t + '</i>';
      if (s.b) t = '<b>' + t + '</b>';
      h += t;
    }
    return h.replace(/(<\/b><b>|<\/i><i>)/g, '').replace(/\t/g, ' ').replace(/ {2,}/g, ' &nbsp;');
  }

  // OMML (công thức Word mới) → HTML đơn giản
  function ommlToHtml(el) {
    const n = ln(el);
    const all = (e) => kids(e).map(ommlToHtml).join('');
    switch (n) {
      case 't': return esc(el.textContent);
      case 'f': { const num = kid(el, 'num'), den = kid(el, 'den'); return '<span class="mfrac"><span>' + (num ? all(num) : '') + '</span><span>' + (den ? all(den) : '') + '</span></span>'; }
      case 'sSup': { const e = kid(el, 'e'), s = kid(el, 'sup'); return (e ? all(e) : '') + '<sup>' + (s ? all(s) : '') + '</sup>'; }
      case 'sSub': { const e = kid(el, 'e'), s = kid(el, 'sub'); return (e ? all(e) : '') + '<sub>' + (s ? all(s) : '') + '</sub>'; }
      case 'sSubSup': { const e = kid(el, 'e'), a = kid(el, 'sub'), b = kid(el, 'sup'); return (e ? all(e) : '') + '<sub>' + (a ? all(a) : '') + '</sub><sup>' + (b ? all(b) : '') + '</sup>'; }
      case 'rad': { const e = kid(el, 'e'), d = kid(el, 'deg'); const dg = d ? all(d) : ''; return (dg ? '<sup>' + dg + '</sup>' : '') + '√<span style="border-top:1px solid">' + (e ? all(e) : '') + '</span>'; }
      case 'd': { const pr = kid(el, 'dPr'); let beg = '(', end = ')'; if (pr) { const bc = kid(pr, 'begChr'), ec = kid(pr, 'endChr'); if (bc) beg = bc.getAttribute('m:val') || ''; if (ec) end = ec.getAttribute('m:val') || ''; } return beg + kids(el, 'e').map(all).join(',') + end; }
      case 'nary': { const pr = kid(el, 'naryPr'); let ch = '∫'; if (pr) { const c = kid(pr, 'chr'); if (c) ch = c.getAttribute('m:val') || ch; } const a = kid(el, 'sub'), b = kid(el, 'sup'), e = kid(el, 'e'); return ch + (a ? '<sub>' + all(a) + '</sub>' : '') + (b ? '<sup>' + all(b) + '</sup>' : '') + (e ? all(e) : ''); }
      case 'rPr': case 'ctrlPr': case 'fPr': case 'sSupPr': case 'sSubPr': case 'dPr': case 'naryPr': case 'radPr': case 'oMathParaPr': return '';
      default: return all(el);
    }
  }

  async function parseDocx(arrayBuffer, fileName, opts) {
    const EN = !!(opts && opts.english);
    const zip = await readZip(arrayBuffer);
    const docXml = await zip.text('word/document.xml');
    if (!docXml) throw new Error('Không tìm thấy nội dung Word trong file');
    const dp = new DOMParser();
    const doc = dp.parseFromString(docXml, 'application/xml');
    const relsXml = await zip.text('word/_rels/document.xml.rels');
    const rels = {};
    if (relsXml) {
      const rd = dp.parseFromString(relsXml, 'application/xml');
      for (const r of rd.getElementsByTagName('Relationship')) rels[r.getAttribute('Id')] = r.getAttribute('Target');
    }
    // numbering (danh sách tự động)
    const numFmt = {};
    const numXml = await zip.text('word/numbering.xml');
    if (numXml) {
      const nd = dp.parseFromString(numXml, 'application/xml');
      const abs = {};
      for (const a of descendants(nd.documentElement, 'abstractNum')) {
        const id = wattr(a, 'abstractNumId'); abs[id] = {};
        for (const l of kids(a, 'lvl')) {
          const fmt = kid(l, 'numFmt'), txt = kid(l, 'lvlText'), start = kid(l, 'start');
          abs[id][wattr(l, 'ilvl')] = { fmt: wattr(fmt, 'val') || 'decimal', text: wattr(txt, 'val') || '', start: parseInt(wattr(start, 'val') || '1', 10) };
        }
      }
      for (const n of descendants(nd.documentElement, 'num')) {
        const an = kid(n, 'abstractNumId');
        if (an) numFmt[wattr(n, 'numId')] = abs[wattr(an, 'val')] || {};
      }
    }
    const numCounters = {};
    const warnings = [];
    const imgCache = {};
    async function image(rid, wPt, hPt) {
      const target = rels[rid]; if (!target) return null;
      const path = target.startsWith('/') ? target.slice(1) : 'word/' + target.replace(/^\.\//, '');
      if (!imgCache[path]) {
        const data = await zip.get(path);
        if (!data) return null;
        const ext = (path.split('.').pop() || '').toLowerCase();
        let src = null, w = 0, h = 0;
        let ext2 = ext, data2 = data;
        if (ext === 'emz' || ext === 'wmz') { try { data2 = await gunzip(data); ext2 = ext === 'emz' ? 'emf' : 'wmf'; } catch (e) { ext2 = ext; } }
        if (ext2 === 'wmf') { try { const r = wmfToSvg(data2); src = svgDataUri(r.svg); w = r.w; h = r.h; } catch (e) { warnings.push('Không vẽ được công thức ' + path); } }
        else if (ext2 === 'emf') { try { const r = emfToDataUri(data2); src = r.src; w = r.w; h = r.h; } catch (e) { warnings.push('Ảnh .emf (' + path.split('/').pop() + ') không vẽ lại được (' + e.message + ') — nên chèn lại dạng PNG/JPG.'); } }
        else if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'bmp' || ext === 'svg' || ext === 'webp') {
          const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : 'image/' + ext;
          src = 'data:' + mime + ';base64,' + u8ToBase64(data);
        } else {
          warnings.push('Ảnh dạng .' + ext + ' (' + path.split('/').pop() + ') trình duyệt không hiển thị được — nên chèn lại dạng PNG/JPG.');
        }
        imgCache[path] = { src, w, h };
      }
      const c = imgCache[path];
      if (!c.src) return { t: 'x', s: '[hình]' };
      let w = wPt ? wPt * 1.333 : c.w, h = hPt ? hPt * 1.333 : c.h;
      if (w > 640) { h = h * 640 / w; w = 640; }
      return { t: 'img', src: c.src, w, h };
    }
    function styleDims(style) {
      const m = {}; (style || '').split(';').forEach(p => { const [k, v] = p.split(':'); if (k && v) m[k.trim()] = v.trim(); });
      const pt = (v) => { if (!v) return 0; const n = parseFloat(v); if (/in$/.test(v)) return n * 72; if (/cm$/.test(v)) return n * 28.35; if (/mm$/.test(v)) return n * 2.835; if (/px$/.test(v)) return n * 0.75; return n; };
      return { w: pt(m.width), h: pt(m.height) };
    }
    async function runSegs(r, out) {
      const pr = kid(r, 'rPr');
      const fmt = { b: false, i: false, u: false, sup: false, sub: false, mark: false };
      if (pr) {
        for (const c of pr.children) {
          const v = wattr(c, 'val');
          const on = v === null || (v !== '0' && v !== 'false' && v !== 'none');
          switch (ln(c)) {
            case 'b': fmt.b = on; break;
            case 'i': fmt.i = on; break;
            case 'u': fmt.u = on; break;
            case 'vertAlign': fmt.sup = v === 'superscript'; fmt.sub = v === 'subscript'; break;
            case 'highlight': if (v && v !== 'none') fmt.mark = true; break;
            case 'shd': { const f = wattr(c, 'fill'); if (f && /^(FFFF00|00FF00|00FFFF)$/i.test(f)) fmt.mark = true; break; }
            case 'color': { const cv = (v || '').toUpperCase(); if (/^(FF0000|C00000|E00000|FF3300|EE0000)$/.test(cv)) fmt.red = true; break; }
          }
        }
      }
      for (const c of r.children) {
        switch (ln(c)) {
          case 't': out.push(Object.assign({ t: 'x', s: c.textContent }, fmt)); break;
          case 'tab': out.push(Object.assign({ t: 'x', s: '\t' }, fmt)); break;
          case 'br': case 'cr': out.push({ t: 'br' }); break;
          case 'noBreakHyphen': out.push(Object.assign({ t: 'x', s: '-' }, fmt)); break;
          case 'sym': { const ch = parseInt(wattr(c, 'char') || '0', 16); out.push(Object.assign({ t: 'x', s: mapChar(ch, wattr(c, 'font')) }, fmt)); break; }
          case 'drawing': {
            const blip = descendants(c, 'blip')[0];
            const extent = descendants(c, 'extent')[0];
            const rid = blip && (blip.getAttribute('r:embed') || blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed'));
            if (rid) {
              const wPt = extent ? parseInt(extent.getAttribute('cx'), 10) / 12700 : 0, hPt = extent ? parseInt(extent.getAttribute('cy'), 10) / 12700 : 0;
              const im = await image(rid, wPt, hPt); if (im) out.push(im);
            }
            break;
          }
          case 'object': case 'pict': {
            const idata = descendants(c, 'imagedata')[0];
            const shape = descendants(c, 'shape')[0];
            const rid = idata && (idata.getAttribute('r:id') || idata.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
            if (rid) { const d = styleDims(shape && shape.getAttribute('style')); const im = await image(rid, d.w, d.h); if (im) out.push(im); }
            break;
          }
          case 'AlternateContent': {
            const ch = kid(c, 'Choice'), fb = kid(c, 'Fallback');
            const tmp = { children: [] };
            const src = ch && descendants(ch, 'blip').length ? ch : fb || ch;
            if (src) { const fake = r.ownerDocument.createElementNS(W, 'w:r'); for (const k of Array.from(src.children)) fake.appendChild(k.cloneNode(true)); await runSegs(fake, out); }
            void tmp; break;
          }
        }
      }
    }
    async function paraSegs(p) {
      const out = [];
      async function walk(el) {
        for (const c of el.children) {
          const n = ln(c);
          if (n === 'r') await runSegs(c, out);
          else if (n === 'hyperlink' || n === 'ins' || n === 'smartTag' || n === 'fldSimple' || n === 'sdt' || n === 'sdtContent' || n === 'customXml') await walk(c);
          else if (n === 'oMath' || n === 'oMathPara') { const html = ommlToHtml(c); out.push({ t: 'html', html: '<span class="omath">' + html + '</span>', s: c.textContent || '￼' }); }
        }
      }
      await walk(p);
      // tiền tố danh sách tự động
      const ppr = kid(p, 'pPr');
      const numPr = ppr && kid(ppr, 'numPr');
      let prefix = null;
      if (numPr) {
        const numId = wattr(kid(numPr, 'numId'), 'val'), ilvl = wattr(kid(numPr, 'ilvl'), 'val') || '0';
        const def = numFmt[numId] && numFmt[numId][ilvl];
        if (def && numId !== '0') {
          const key = numId + ':' + ilvl;
          numCounters[key] = (numCounters[key] || def.start - 1) + 1;
          // reset cấp con
          Object.keys(numCounters).forEach(k => { const [a, b] = k.split(':'); if (a === numId && +b > +ilvl) delete numCounters[k]; });
          const v = numCounters[key];
          let label = v;
          if (def.fmt === 'upperLetter') label = String.fromCharCode(64 + ((v - 1) % 26) + 1);
          else if (def.fmt === 'lowerLetter') label = String.fromCharCode(96 + ((v - 1) % 26) + 1);
          else if (def.fmt === 'bullet') label = null;
          if (label !== null) prefix = def.text.replace(/%\d/g, String(label));
        }
      }
      if (prefix) out.unshift({ t: 'x', s: prefix + ' ', auto: true });
      return out;
    }

    // Duyệt thân văn bản theo thứ tự → danh sách "dòng"
    const items = [];
    async function walkBody(el) {
      for (const c of el.children) {
        const n = ln(c);
        if (n === 'p') { const s = await paraSegs(c); items.push({ kind: 'p', segs: s }); }
        else if (n === 'tbl') {
          for (const tr of kids(c, 'tr')) {
            const cells = [];
            for (const tc of kids(tr, 'tc')) {
              const paras = [];
              for (const cc of tc.children) {
                if (ln(cc) === 'p') paras.push(await paraSegs(cc));
                else if (ln(cc) === 'tbl' || ln(cc) === 'sdt') { const sub = []; const save = items.length; await walkBody({ children: [cc] }); sub.push(...items.splice(save)); sub.forEach(it => paras.push(it.segs || [])); }
              }
              cells.push(paras);
            }
            items.push({ kind: 'row', cells });
          }
        } else if (n === 'sdt') { const sc = kid(c, 'sdtContent'); if (sc) await walkBody(sc); }
      }
    }
    const body = descendants(doc.documentElement, 'body')[0];
    await walkBody(body);

    // ---- Máy trạng thái nhận dạng câu hỏi ----
    const RE_Q = /^[\s ]*(?:câu|cau|question|bài|bai)[\s ]*(\d+)[\s ]*(?:\(([^)]*)\))?[\s ]*[:.\-–)]?[\s ]*/i;
    const RE_QNUM = /^[\s ]*(\d{1,3})[\s ]*[.)][\s ]+(?=\S)/;
    const RE_OPT = /^[\s ]*(\*?)[\s ]*([A-Ha-h])[\s ]*[).][\s ]*/;
    const RE_ANS = /^[\s ]*(?:đáp[\s ]*án|dap[\s ]*an|đ\/a|ĐA|hướng[\s ]*dẫn[\s ]*chấm|gợi[\s ]*ý|answer)[\s ]*(?:đúng)?[\s ]*[:.\-]?[\s ]*/i;
    const questions = [];
    let cur = null, mode = 'stem';
    // Đề Tiếng Anh: kỹ năng đang đọc (L nghe, R đọc, W viết, S nói), nhóm câu dùng chung đoạn văn / đoạn nghe
    const groups = [];
    let curSkill = null, curGrp = null, grpCollect = false, pendingAudio = null;
    const RE_AUDIO = /\[[\s\u00A0]*(?:audio|âm[\s\u00A0]*thanh|am[\s\u00A0]*thanh|file[\s\u00A0]*nghe|nghe)[\s\u00A0]*:[\s\u00A0]*([^\]]+?)[\s\u00A0]*\]/i;
    const RE_GRP = /^[\s\u00A0]*(?:(?:đoạn(?:[\s\u00A0]*(?:văn|hội[\s\u00A0]*thoại|nghe|đọc))?|bài[\s\u00A0]*đọc|hội[\s\u00A0]*thoại|bài[\s\u00A0]*nghe|passage|conversation|talk|text|announcement|article|e-?mail|letter|notice|advertisement)[\s\u00A0]*\d{0,3}[\s\u00A0]*[:.]|questions?[\s\u00A0]+\d+[\s\u00A0]*[-–][\s\u00A0]*\d+[\s\u00A0]+(?:refer|are[\s\u00A0]+based))/i;
    const RE_GRP_END = /^[\s\u00A0]*\[[\s\u00A0]*(?:\/[\s\u00A0]*đoạn|hết[\s\u00A0]*đoạn|\/[\s\u00A0]*passage|end)[\s\u00A0]*\][\s\u00A0]*$/i;
    function skillOf(t) {
      const s = t.toLowerCase();
      if (/listening|nghe/.test(s)) return 'L';
      if (/reading|đọc|doc hieu/.test(s)) return 'R';
      if (/writing|viết/.test(s)) return 'W';
      if (/speaking|(^|[^a-zà-ỹ])nói/.test(s)) return 'S';
      const m = s.match(/(^|\s)part[\s\u00A0]+(\d)\b/);
      if (m) return +m[2] <= 4 ? 'L' : 'R';
      return null;
    }
    function secs(txt) { if (!txt) return null; const m = txt.match(/(\d+)[\s\u00A0]*(?:giây|giay|s|sec|seconds?)\b/i); return m ? +m[1] : null; }
    function points(txt) { if (!txt) return null; const m = txt.match(/(\d+(?:[.,]\d+)?)[\s ]*(?:đ|điểm|diem)/i); return m ? parseFloat(m[1].replace(',', '.')) : null; }
    function newQ(num, segs, pts, head) {
      cur = { num, stem: [], opts: [], ans: [], ansText: [], pts, skill: curSkill, g: curGrp, audio: pendingAudio, rec: secs(head) };
      pendingAudio = null; grpCollect = false;
      questions.push(cur); mode = 'stem'; if (segs.length) cur.stem.push(segs);
    }
    function labelMarked(segs, labelEnd) {
      const lab = sliceSegs(segs, 0, labelEnd).filter(s => s.t === 'x' && s.s.trim());
      return lab.some(s => s.u || s.mark || s.red);
    }
    function handlePara(segs) {
      let plain = plainOf(segs);
      if (!plain.trim() && !segs.some(s => s.t === 'img' || s.t === 'html')) return;
      // [AUDIO: tên file] — gắn file nghe cho đoạn / câu đang đọc
      let am, guard = 0;
      while ((am = plain.match(RE_AUDIO)) && guard++ < 5) {
        const name = am[1].trim();
        segs = trimSegs(sliceSegs(segs, 0, am.index).concat(sliceSegs(segs, am.index + am[0].length, plain.length)));
        plain = plainOf(segs);
        // dòng mở đầu câu hỏi / đoạn mới => file nghe thuộc câu / đoạn mới đó
        if (RE_Q.test(plain) || (EN && RE_GRP.test(plain))) pendingAudio = name;
        else if (grpCollect && curGrp != null) groups[curGrp].audio = name;
        else if (cur) cur.audio = name;
        else if (curGrp != null) groups[curGrp].audio = name;
        else pendingAudio = name;
      }
      if (!plain.trim() && !segs.some(s => s.t === 'img' || s.t === 'html')) return;
      if (RE_GRP_END.test(plain)) { curGrp = null; grpCollect = false; cur = null; mode = 'stem'; return; }
      // Tiêu đề phần ("PHẦN I. TRẮC NGHIỆM", "Part 2", "LISTENING", "--- HẾT ---") kết thúc câu đang đọc
      const isHead = /^[\s\u00A0]*(phần|phan|part)[\s\u00A0]+([ivx]+|\d+|[a-dA-D])\b|^[\s\u00A0]*[-–—*.]*[\s\u00A0]*(hết|het|the end)[\s\u00A0]*[-–—*.]*[\s\u00A0]*$/i.test(plain) ||
        /^[\s\u00A0]*(listening|reading|writing|speaking)([\s\u00A0]+(comprehension|section|test|part))?[\s\u00A0:.\-–]*$/i.test(plain);
      if (isHead) { const sk = EN ? skillOf(plain) : null; if (sk) curSkill = sk; cur = null; mode = 'stem'; curGrp = null; grpCollect = false; return; }
      let m = plain.match(RE_Q);
      if (m) {
        newQ(+m[1], trimSegs(sliceSegs(segs, m[0].length, plain.length)), points(m[2]), m[2]);
        return;
      }
      if (EN && (m = plain.match(RE_GRP)) && (!cur || mode !== 'answer')) {
        groups.push({ title: plain.slice(0, m[0].length).replace(/[:.]\s*$/, '').trim(), stem: [], audio: pendingAudio, skill: curSkill });
        pendingAudio = null; curGrp = groups.length - 1; grpCollect = true; cur = null; mode = 'stem';
        const rest = trimSegs(sliceSegs(segs, m[0].length, plain.length));
        if (rest.length) groups[curGrp].stem.push(rest);
        return;
      }
      if (grpCollect && curGrp != null && !cur) { groups[curGrp].stem.push(trimSegs(segs)); return; }
      if ((!cur || cur.opts.length >= 2 || mode === 'answer') && (m = plain.match(RE_QNUM)) && !RE_OPT.test(plain)) {
        newQ(+m[1], trimSegs(sliceSegs(segs, m[0].length, plain.length)), null); return;
      }
      if (!cur) return;
      m = plain.match(RE_ANS);
      if (m) {
        const rest = plain.slice(m[0].length).trim();
        if (/^[A-Ha-h]([\s ]*[,;&và]+[\s ]*[A-Ha-h])*\.?$/.test(rest) && cur.opts.length) {
          cur.ans = rest.toUpperCase().match(/[A-H]/g).map(L => L.charCodeAt(0) - 65);
          mode = 'stem-done';
        } else { mode = 'answer'; const s = trimSegs(sliceSegs(segs, m[0].length, plain.length)); if (s.length) cur.ansText.push(s); }
        return;
      }
      if (mode === 'answer') { cur.ansText.push(trimSegs(segs)); return; }
      m = plain.match(RE_OPT);
      if (m) {
        const expected = cur.opts.length;
        const letter = m[2].toUpperCase().charCodeAt(0) - 65;
        if (letter === expected || (letter === 0 && expected > 0 && false)) {
          // có thể nhiều phương án trên 1 dòng: "A) ...  B) ...  C) ..."
          const cuts = [{ at: 0, len: m[0].length, star: !!m[1] }];
          let nextL = letter + 1;
          const re = /(^|[\s\u00A0\t])(\*?)([A-H])[\s\u00A0]*[).](?=[\s\u00A0]|$)/g;
          re.lastIndex = m[0].replace(/[\s\u00A0]+$/, '').length;
          let mm;
          while ((mm = re.exec(plain))) {
            if (mm[3].charCodeAt(0) - 65 !== nextL) continue;
            const at = mm.index + mm[1].length;
            cuts.push({ at, len: mm[0].length - mm[1].length, star: !!mm[2] });
            nextL++;
          }
          for (let k = 0; k < cuts.length; k++) {
            const c = cuts[k], end = k + 1 < cuts.length ? cuts[k + 1].at : plain.length;
            const optSegs = trimSegs(sliceSegs(segs, c.at + c.len, end));
            const marked = c.star || labelMarked(sliceSegs(segs, c.at, end), c.len);
            cur.opts.push({ segs: [optSegs], marked });
          }
          mode = 'opts';
          return;
        }
      }
      if (cur.opts.length && mode === 'opts') cur.opts[cur.opts.length - 1].segs.push(trimSegs(segs));
      else if (mode === 'stem-done') return;
      else cur.stem.push(trimSegs(segs));
    }
    for (const it of items) {
      if (it.kind === 'p') { handlePara(it.segs); continue; }
      const cells = it.cells;
      const c0segs = cells[0] ? [].concat(...cells[0].map((p, i) => i ? [{ t: 'br' }].concat(p) : p)) : [];
      const c0 = plainOf(c0segs).trim();
      const restCells = cells.slice(1);
      const restParas = [].concat(...restCells);
      const joinParas = (ps) => { const o = []; ps.forEach((p, i) => { const t = trimSegs(p); if (!t.length) return; if (o.length) o.push({ t: 'br' }); o.push(...t); }); return o; };
      let m;
      if (cells.length >= 2 && (m = c0.match(/^(?:câu|cau)?[\s ]*(\d{1,3})[\s ]*[.:)]?[\s ]*(?:\(([^)]*)\))?$/i))) {
        newQ(+m[1], joinParas(restParas), points(m[2]), m[2]); if (!cur.stem.length) cur.stem = []; continue;
      }
      if (cells.length >= 2 && cur && (m = c0.match(/^(\*?)[\s ]*([A-Ha-h])[\s ]*[).]?$/))) {
        const letter = m[2].toUpperCase().charCodeAt(0) - 65;
        if (letter === cur.opts.length) {
          cur.opts.push({ segs: [joinParas(restParas)], marked: !!m[1] || labelMarked(c0segs, c0segs.length ? plainOf(c0segs).length : 0) });
          mode = 'opts'; continue;
        }
      }
      if (cells.length >= 2 && cur && RE_ANS.test(c0)) {
        const rest = plainOf(joinParas(restParas)).trim();
        if (/^[A-Ha-h]([\s ]*[,;&và]+[\s ]*[A-Ha-h])*\.?$/.test(rest) && cur.opts.length) { cur.ans = rest.toUpperCase().match(/[A-H]/g).map(L => L.charCodeAt(0) - 65); mode = 'stem-done'; }
        else { cur.ansText.push(joinParas(restParas)); mode = 'answer'; }
        continue;
      }
      if (cells.length >= 2 && cur && !c0 && restParas.length) {
        const s = joinParas(restParas);
        if (mode === 'opts' && cur.opts.length) cur.opts[cur.opts.length - 1].segs.push(s); else if (mode === 'answer') cur.ansText.push(s); else cur.stem.push(s);
        continue;
      }
      for (const cell of cells) for (const p of cell) handlePara(p);
    }

    // ---- Chuẩn hoá ----
    const PIN = /(các|những)?[\s ]*(đáp[\s ]*án|phương[\s ]*án|câu)[\s ]*(còn[\s ]*lại|trên|đều)|tất[\s ]*cả[\s ]*(các|đều)|^[\s ]*cả[\s ]+[A-H][\s ]*(,|và)|ý[\s ]*kiến[\s ]*khác|không[\s ]*có[\s ]*(đáp|phương)[\s ]*án|^[\s ]*[A-H][\s ]*(,|và)[\s ]*[A-H][\s ]*(đều)?[\s ]*(đúng|sai)/i;
    const joinBlocks = (blocks) => { const o = []; blocks.forEach(b => { if (!b || !b.length) return; if (o.length) o.push({ t: 'br' }); o.push(...b); }); return o; };
    const result = [];
    questions.forEach((q, idx) => {
      const stemSegs = joinBlocks(q.stem);
      const item = { n: idx + 1, num: q.num, stem: segsToHtml(stemSegs), text: plainOf(stemSegs).replace(/\uFFFC/g, '[CT]').trim() };
      if (q.pts) item.pts = q.pts;
      if (q.skill) item.skill = q.skill;
      if (q.g != null) item.g = q.g;
      if (q.audio) item.audio = q.audio;
      if (q.skill === 'S' && q.opts.length < 2) {
        // Câu NÓI: học sinh ghi âm câu trả lời, giáo viên nghe và chấm
        item.type = 'speak';
        item.rec = q.rec || 60;
        item.answer = segsToHtml(joinBlocks(q.ansText));
      } else if (q.opts.length >= 2) {
        item.type = 'mc';
        item.options = q.opts.map(o => segsToHtml(joinBlocks(o.segs)));
        item.optText = q.opts.map(o => plainOf(joinBlocks(o.segs)).replace(/￼/g, '[CT]').trim());
        let correct = q.ans.length ? q.ans : q.opts.map((o, i) => o.marked ? i : -1).filter(i => i >= 0);
        correct = correct.filter(i => i < q.opts.length);
        item.correct = correct;
        item.pin = item.optText.map(t => PIN.test(t));
        if (!correct.length) item.warn = 'Chưa xác định được đáp án đúng';
      } else {
        // ---- Điền khuyết: [đáp án] trong câu, hoặc ___ / ..... + dòng "Đáp án: a; b" ----
        const plain = plainOf(stemSegs);
        const splitAlts = (t) => (t.indexOf('|') >= 0 ? t.split('|') : t.split('/')).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
        const br = Array.from(plain.matchAll(/\[([^\[\]\n]{1,160})\]/g));
        let ranges = null, blanks = null;
        if (br.length) { ranges = br.map(m => [m.index, m.index + m[0].length]); blanks = br.map(m => splitAlts(m[1])); }
        else if (q.opts.length === 0 && q.ansText.length) {
          const gaps = Array.from(plain.matchAll(/_{3,}|\.{4,}|(?:…\.*){2,}|…{1}\.{2,}/g));
          if (gaps.length) {
            const at = plainOf(joinBlocks(q.ansText)).replace(/\uFFFC/g, '').trim();
            let parts;
            if (/[;\n]/.test(at)) parts = at.split(/\s*[;\n]\s*/);
            else if ((at.match(/(^|\s)\(?\d{1,2}\s*[).:]/g) || []).length >= 2) parts = at.split(/(?:^|\s)\(?\d{1,2}\s*[).:]\s*/);
            else parts = gaps.length === 1 ? [at] : at.split(/\s*,\s*/);
            parts = parts.map(x => x.replace(/^\(?\d{1,2}\s*[).:]\s*/, '').trim()).filter(Boolean);
            if (parts.length === gaps.length) { ranges = gaps.map(m => [m.index, m.index + m[0].length]); blanks = parts.map(splitAlts); }
            else item.warn = 'Có ' + gaps.length + ' chỗ trống nhưng dòng Đáp án có ' + parts.length + ' đáp án (ngăn cách bằng dấu ;) — đang coi là tự luận';
          }
        }
        if (blanks && blanks.length && blanks.every(b => b.length)) {
          const out = []; let pos = 0;
          ranges.forEach((r, k) => { out.push(...sliceSegs(stemSegs, pos, r[0])); out.push({ t: 'html', html: '<span class="blank" data-b="' + k + '">(' + (k + 1) + ')</span>', s: '\uFFFC' }); pos = r[1]; });
          out.push(...sliceSegs(stemSegs, pos, plain.length));
          item.type = 'fill';
          item.stem = segsToHtml(out);
          item.text = plainOf(out).replace(/\uFFFC/g, '___').trim();
          item.blanks = blanks;
        } else {
          item.type = 'essay';
          item.answer = segsToHtml(joinBlocks(q.ansText));
          if (q.opts.length === 1) item.warn = 'Chỉ có 1 phương án — đang coi là câu tự luận';
        }
      }
      const hasAudio = !!(item.audio || (q.g != null && groups[q.g] && groups[q.g].audio));
      if (!item.text && !/img|omath/.test(item.stem) && !hasAudio && q.g == null) item.warn = (item.warn ? item.warn + '; ' : '') + 'Nội dung câu hỏi trống';
      if (q.skill === 'L' && !hasAudio) item.warn = (item.warn ? item.warn + '; ' : '') + 'Câu nghe chưa gắn file nghe [AUDIO: …]';
      result.push(item);
    });
    const outGroups = groups.map(g => ({ title: g.title, stem: segsToHtml(joinBlocks(g.stem)), audio: g.audio || null, skill: g.skill || null }));
    return { name: (fileName || 'De').replace(/\.docx$/i, ''), questions: result, groups: outGroups, warnings };
  }

  const api = { readZip, parseDocx, wmfToSvg, emfToSvg, emfToDataUri, mapChar };
  root.QuizDocx = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
