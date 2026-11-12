/* =====================================================================
 * core.js — Lõi trộn đề / chấm điểm (dùng chung cho trình duyệt và
 * máy chủ Google Apps Script). Phần mềm: Lê Duy Nam — GV Trường CĐ Dầu khí
 * ===================================================================== */
var QC_VERSION = '1.7';

function QC_hash(str) {
  var h1 = 0xdeadbeef ^ 0, h2 = 0x41c6ce57 ^ 0;
  str = String(str);
  for (var i = 0; i < str.length; i++) {
    var ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return h1 >>> 0;
}
function QC_rng(seedStr) {
  var a = QC_hash(seedStr);
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function QC_shuffle(arr, rnd) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(rnd() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}
/** "1-10, 15, 20-22" -> [0..9,14,19,20,21] (chỉ số 0-based, trong phạm vi max) */
function QC_parseList(s, max) {
  var out = [], seen = {};
  String(s || '').split(/[,;\s]+/).forEach(function (part) {
    if (!part) return;
    var m = part.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    var a, b;
    if (m) { a = +m[1]; b = +m[2]; } else if (/^\d+$/.test(part)) { a = b = +part; } else return;
    if (a > b) { var t = a; a = b; b = t; }
    for (var k = a; k <= b; k++) if (k >= 1 && k <= max && !seen[k]) { seen[k] = 1; out.push(k - 1); }
  });
  return out;
}
/** "30" -> 30 ; "25-30" -> số ngẫu nhiên trong khoảng */
function QC_parseCount(s, rnd) {
  var m = String(s == null ? '' : s).match(/^\s*(\d+)\s*(?:[-–]\s*(\d+))?\s*$/);
  if (!m) return 0;
  var a = +m[1], b = m[2] ? +m[2] : a;
  if (a > b) { var t = a; a = b; b = t; }
  return a + Math.floor(rnd() * (b - a + 1));
}
function QC_round(x, step) {
  step = +step || 0.1;
  var r = Math.round(x / step) * step;
  return Math.round(r * 100) / 100;
}
function QC_normName(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/\s+/g, ' ').trim().toUpperCase();
}
function QC_usable(q) {
  if (!q || q.disabled) return false;
  if (q.type === 'mc') return q.options && q.options.length >= 2 && q.correct && q.correct.length > 0;
  if (q.type === 'fill') return !!(q.blanks && q.blanks.length && q.blanks.every(function (b) { return b && b.length; }));
  return q.type === 'essay' || q.type === 'speak';
}
/** Chuẩn hoá câu trả lời điền khuyết: không phân biệt hoa/thường, dấu nháy cong/thẳng, khoảng trắng thừa, dấu câu cuối */
function QC_normAns(s) {
  return String(s == null ? '' : s).normalize('NFC').replace(/[\u2018\u2019\u02BC`´]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ').trim().replace(/^["'(]+|["'.!?,;:)]+$/g, '').trim().toLowerCase();
}

/**
 * Tạo đề cho 1 lượt thi.
 * exam.groups: [{bank, pick:'random'|'fixed', range, count, list, sec, pts, shuffleOpts, skill}]
 * exam.settings: {order:'mix'|'group'|'keep', shuffleOpts, sec, sameForAll}
 * Câu thuộc cùng một đoạn văn / đoạn nghe (q.g) luôn đi cùng nhau, đúng thứ tự (một "khối").
 * Đề không có đoạn dùng chung => kết quả trộn y hệt các phiên bản trước.
 */
function QC_buildPaper(exam, seedStr) {
  var st = exam.settings || {};
  var rnd = QC_rng(st.sameForAll ? ('same|' + exam.id) : seedStr);
  var used = {};
  var blocks = [], anyBook = false;
  (exam.groups || []).forEach(function (g, gi) {
    var bank = exam.banks[g.bank];
    if (!bank) return;
    // Đề TOEIC nguyên bộ (sách đề PDF + phiếu trả lời): giữ nguyên số câu, thứ tự và vị trí A/B/C/D
    var isBook = !!bank.book;
    if (isBook) anyBook = true;
    var qs = bank.questions || [];
    used[g.bank] = used[g.bank] || {};
    var okSkill = function (i) { return !g.skill || g.skill === 'all' || qs[i].skill === g.skill; };
    var toUnits = function (list) {
      var units = [], byKey = {};
      list.forEach(function (i) {
        var gk = qs[i].g;
        if (gk == null) { units.push([i]); return; }
        if (!byKey[gk]) { byKey[gk] = []; units.push(byKey[gk]); }
        byKey[gk].push(i);
      });
      units.forEach(function (u) { if (u.length > 1) u.sort(function (a, b) { return a - b; }); });
      return units;
    };
    var units;
    if (g.pick === 'fixed') {
      units = toUnits(QC_parseList(g.list, qs.length).filter(function (i) { return QC_usable(qs[i]) && !used[g.bank][i] && okSkill(i); }));
    } else if (isBook) {
      var bpool = (g.range && String(g.range).trim()) ? QC_parseList(g.range, qs.length) : qs.map(function (_, i) { return i; });
      units = bpool.filter(function (i) { return QC_usable(qs[i]) && !used[g.bank][i] && okSkill(i); }).sort(function (a, b) { return a - b; }).map(function (i) { return [i]; });
    } else {
      var pool = (g.range && String(g.range).trim()) ? QC_parseList(g.range, qs.length) : qs.map(function (_, i) { return i; });
      pool = pool.filter(function (i) { return QC_usable(qs[i]) && !used[g.bank][i] && okSkill(i); });
      var all = toUnits(pool);
      var n = QC_parseCount(g.count, rnd);
      if (!(n > 0) || n > pool.length) n = pool.length;
      var sh = QC_shuffle(all.slice(), rnd);
      units = []; var total = 0;
      for (var k = 0; k < sh.length && total < n; k++) { if (total + sh[k].length <= n) { units.push(sh[k]); total += sh[k].length; } }
      if (st.order === 'keep') units.sort(function (a, b) { return a[0] - b[0]; });
    }
    var unitItems = units.map(function (u) {
      return u.map(function (qi) {
        used[g.bank][qi] = 1;
        var q = qs[qi];
        var perm = null;
        if (q.type === 'mc') {
          perm = q.options.map(function (_, i) { return i; });
          // câu NGHE không trộn phương án (băng đọc A, B, C, D theo thứ tự)
          var doShuffle = !isBook && st.shuffleOpts !== false && g.shuffleOpts !== false && q.skill !== 'L';
          if (doShuffle) {
            var pin = q.pin || [];
            var free = perm.filter(function (i) { return !pin[i]; });
            var shp = QC_shuffle(free.slice(), rnd);
            var kk = 0;
            perm = perm.map(function (i) { return pin[i] ? i : shp[kk++]; });
          }
        }
        var sec = (q.sec != null && q.sec !== '') ? +q.sec : (g.sec != null && g.sec !== '' ? +g.sec : (st.sec != null && st.sec !== '' ? +st.sec : 60));
        var pts = (q.pts != null && q.pts !== '') ? +q.pts : (g.pts != null && g.pts !== '' ? +g.pts : 1);
        var it = { b: g.bank, q: qi, g: gi, perm: perm, sec: sec, pts: pts };
        if (q.g != null) it.grp = g.bank + ':' + q.g;
        return it;
      });
    });
    if (st.order === 'group' && !isBook) QC_shuffle(unitItems, rnd);
    blocks.push(unitItems);
  });
  var allUnits = [].concat.apply([], blocks);
  if ((st.order === 'mix' || !st.order) && !anyBook) QC_shuffle(allUnits, rnd);
  return { items: [].concat.apply([], allUnits) };
}

/** Link nghe: tên file đã tải lên (bank.audio) hoặc link Google Drive / mp3 */
function QC_audioRef(bank, ref) {
  if (!ref) return null;
  ref = String(ref).trim();
  if (/^https?:\/\//i.test(ref)) {
    var m = ref.match(/drive\.google\.com\/(?:file\/d\/|open\?(?:.*&)?id=|uc\?(?:.*&)?id=)([\w-]{20,})/);
    return m ? { id: m[1], src: 'https://drive.google.com/uc?export=download&id=' + m[1] } : { id: null, src: ref };
  }
  var a = bank && bank.audio && (bank.audio[ref] || bank.audio[ref.toLowerCase()]);
  if (a && a.id) return { id: a.id, src: 'https://drive.google.com/uc?export=download&id=' + a.id };
  if (a && a.link) return QC_audioRef(bank, a.link);
  return null;
}
/** Danh sách mã file Drive được phép phát cho đề này (chống đọc file Drive tùy ý) */
function QC_audioIds(exam) {
  var ids = {};
  (exam.banks || []).forEach(function (b) {
    Object.keys(b.audio || {}).forEach(function (k) { if (b.audio[k] && b.audio[k].id) ids[b.audio[k].id] = 1; });
    var chk = function (ref) { var r = QC_audioRef(b, ref); if (r && r.id) ids[r.id] = 1; };
    (b.questions || []).forEach(function (q) { chk(q.audio); });
    (b.groups || []).forEach(function (g) { chk(g && g.audio); });
    if (b.book) {
      (b.book.pages || []).forEach(function (pg) { if (pg && pg.id) ids[pg.id] = 1; });
      Object.keys(b.book.parts || {}).forEach(function (k) { chk(b.book.parts[k]); });
    }
  });
  return ids;
}
/** Ảnh trang sách đề trên Google Drive (chia sẻ "ai có link") */
function QC_pageSrc(id) { return 'https://lh3.googleusercontent.com/d/' + id + '=w1600'; }
/** Sách đề + file nghe theo Part của các ngân hàng "đề nguyên bộ" có trong đề này (gửi cho học sinh khi bắt đầu làm) */
function QC_bookInfo(exam, paper) {
  var out = null;
  paper.items.forEach(function (it) {
    var b = exam.banks[it.b];
    if (!b || !b.book || (out && out[it.b])) return;
    out = out || {};
    var parts = {};
    Object.keys(b.book.parts || {}).forEach(function (k) { var r = QC_audioRef(b, b.book.parts[k]); parts[k] = r || { missing: b.book.parts[k] }; });
    out[it.b] = {
      name: b.name || '',
      pages: (b.book.pages || []).map(function (pg) { return { id: pg.id || null, src: pg.id ? QC_pageSrc(pg.id) : (pg.src || ''), sec: pg.sec || '', w: pg.w || 0, h: pg.h || 0 }; }),
      parts: parts
    };
  });
  return out;
}

/** Đề gửi cho học sinh — KHÔNG có đáp án */
function QC_publicPaper(exam, paper) {
  var pos = {}, size = {};
  paper.items.forEach(function (it) { if (it.grp) size[it.grp] = (size[it.grp] || 0) + 1; });
  return paper.items.map(function (it) {
    var bank = exam.banks[it.b];
    var q = bank.questions[it.q];
    var o = { type: q.type, stem: q.stem, sec: it.sec, pts: it.pts };
    if (q.skill) o.skill = q.skill;
    if (bank.book) { o.bk = it.b; o.num = q.num; o.part = q.part; o.page = q.page == null ? null : q.page; }
    if (q.type === 'mc') {
      o.options = it.perm.map(function (i) { return q.options[i]; });
      o.multi = q.correct.length > 1;
    } else if (q.type === 'fill') {
      o.nb = q.blanks.length;
    } else if (q.type === 'speak') {
      o.rec = +q.rec || 60;
    }
    var au = QC_audioRef(bank, q.audio);
    if (q.audio) o.audio = au || { missing: q.audio };
    if (it.grp) {
      var gr = (bank.groups || [])[q.g] || {};
      pos[it.grp] = (pos[it.grp] || 0) + 1;
      o.group = { key: it.grp, title: gr.title || '', stem: gr.stem || '', pos: pos[it.grp], size: size[it.grp] };
      if (gr.audio) o.group.audio = QC_audioRef(bank, gr.audio) || { missing: gr.audio };
    }
    return o;
  });
}

/** answers[i]: mảng chỉ số phương án ĐANG HIỂN THỊ (trắc nghiệm) hoặc chuỗi (tự luận) */
function QC_grade(exam, paper, answers, essayScores) {
  var st = exam.settings || {};
  var scale = +st.scale || 10;
  var res = { mcRight: 0, mcCount: 0, essayCount: 0, earned: 0, max: 0, mcEarned: 0, essayEarned: 0, essayMax: 0, essayPending: 0, details: [] };
  essayScores = essayScores || {};
  paper.items.forEach(function (it, i) {
    var q = exam.banks[it.b].questions[it.q];
    var a = answers ? answers[i] : null;
    res.max += it.pts;
    if (q.type === 'mc') {
      res.mcCount++;
      var chosen = (Array.isArray(a) ? a : (a == null || a === '' ? [] : [a])).map(function (d) { return it.perm[+d]; }).filter(function (x) { return x != null; });
      chosen.sort(); var corr = q.correct.slice().sort();
      var ok = chosen.length === corr.length && chosen.every(function (x, k) { return x === corr[k]; });
      if (ok) { res.mcRight++; res.mcEarned += it.pts; }
      res.details.push({ type: 'mc', b: it.b, q: it.q, chosen: chosen, correct: corr, ok: ok, pts: it.pts, earned: ok ? it.pts : 0 });
    } else if (q.type === 'fill') {
      res.mcCount++;
      var given = Array.isArray(a) ? a : (a == null ? [] : [a]);
      var oks = q.blanks.map(function (alts, k) {
        var g = QC_normAns(given[k]);
        return !!g && alts.some(function (x) { return QC_normAns(x) === g; });
      });
      var nOk = oks.filter(Boolean).length;
      var earnedF = Math.round(it.pts * nOk / q.blanks.length * 100) / 100;
      if (nOk === q.blanks.length) res.mcRight++;
      res.mcEarned += earnedF;
      res.details.push({ type: 'fill', b: it.b, q: it.q, given: q.blanks.map(function (_, k) { return String(given[k] == null ? '' : given[k]).slice(0, 300); }), oks: oks, ok: nOk === q.blanks.length, pts: it.pts, earned: earnedF });
    } else {
      res.essayCount++;
      res.essayMax += it.pts;
      var sc = essayScores[i];
      var graded = sc != null && sc !== '';
      var e = graded ? Math.max(0, Math.min(it.pts, +sc)) : 0;
      if (!graded) res.essayPending++;
      res.essayEarned += e;
      if (q.type === 'speak') {
        var rec = (a && typeof a === 'object' && a.rec) ? String(a.rec) : '';
        res.details.push({ type: 'speak', b: it.b, q: it.q, rec: rec, dur: a && a.dur ? +a.dur : 0, pts: it.pts, earned: e, graded: graded });
      } else {
        res.details.push({ type: 'essay', b: it.b, q: it.q, text: String(a == null ? '' : a).slice(0, 20000), pts: it.pts, earned: e, graded: graded });
      }
    }
    if (q.skill) {
      var sk = res.skills || (res.skills = {});
      var o = sk[q.skill] || (sk[q.skill] = { earned: 0, max: 0, right: 0, count: 0, pending: 0 });
      var d = res.details[res.details.length - 1];
      o.max += it.pts; o.earned += d.earned; o.count++;
      if (d.ok) o.right++;
      if ((d.type === 'essay' || d.type === 'speak') && !d.graded) o.pending++;
    }
  });
  res.earned = res.mcEarned + res.essayEarned;
  res.score = res.max > 0 ? QC_round(res.earned / res.max * scale, st.round || 0.1) : 0;
  if (res.skills) {
    Object.keys(res.skills).forEach(function (k) { var o = res.skills[k]; o.earned = Math.round(o.earned * 100) / 100; o.score = o.max > 0 ? QC_round(o.earned / o.max * 10, 0.1) : 0; });
    if (st.toeic) {
      // Quy đổi TOEIC THAM KHẢO (tuyến tính): Nghe 5–495, Đọc 5–495, Viết / Nói 0–200
      var t = {}, lin = function (o, lo, hi, step) { return o && o.max ? Math.round((lo + (hi - lo) * o.earned / o.max) / step) * step : null; };
      t.L = lin(res.skills.L, 5, 495, 5); t.R = lin(res.skills.R, 5, 495, 5);
      t.W = lin(res.skills.W, 0, 200, 10); t.S = lin(res.skills.S, 0, 200, 10);
      if (t.L != null || t.R != null) t.LR = (t.L || 0) + (t.R || 0);
      res.toeic = t;
    }
  }
  return res;
}

/** Khung giờ (mốc thời gian ms): from = bắt đầu cho vào, to = hết giờ vào làm, end = kết thúc bài (tự nộp) */
function QC_window(st) {
  st = st || {};
  var ts = function (n) { var v = st[n + 'Ts']; if (v) return +v; if (st[n]) { var d = new Date(st[n]).getTime(); return isNaN(d) ? 0 : d; } return 0; };
  return { from: ts('openFrom'), to: ts('openTo'), end: ts('endAt') };
}
/** Số lần được làm: 0 = không giới hạn (luyện tập) */
function QC_maxAttempts(st) {
  st = st || {};
  if (st.unlimited) return 0;
  if (st.maxAttempts != null && st.maxAttempts !== '') return Math.max(0, Math.floor(+st.maxAttempts) || 0);
  return st.allowRetake ? 0 : 1;
}
/** Đáp án chi tiết trả về học sinh sau khi nộp (chỉ khi giáo viên bật "Cho xem đáp án") */
function QC_review(exam, paper, g) {
  return paper.items.map(function (it, i) {
    var q = exam.banks[it.b].questions[it.q], d = g.details[i];
    if (q.type === 'mc') {
      var disp = function (o) { return it.perm.indexOf(o); };
      return { type: 'mc', num: q.num, stem: q.stem, options: it.perm.map(function (o) { return q.options[o]; }), chosen: d.chosen.map(disp), correct: q.correct.map(disp), ok: d.ok };
    }
    if (q.type === 'fill') return { type: 'fill', stem: q.stem, given: d.given, oks: d.oks, blanks: q.blanks, ok: d.ok };
    if (q.type === 'speak') return { type: 'speak', stem: q.stem, rec: d.rec, answer: q.answer || '' };
    return { type: 'essay', stem: q.stem, text: d.text, answer: q.answer || '' };
  });
}

/** Thời gian tối đa cả bài (giây), 0 = không giới hạn.
 *  navMode 'strict': cộng thời gian từng câu; 'free': không giới hạn (ôn tập) hoặc tổng thời gian giáo viên đặt */
function QC_totalLimit(st, paper) {
  st = st || {};
  var sum = 0, unl = false;
  paper.items.forEach(function (it) { if (it.sec > 0) sum += it.sec; else unl = true; });
  if (st.navMode === 'free') {
    if (st.freeTime !== 'total') return 0;
    if (+st.totalMin > 0) return Math.round(+st.totalMin * 60);
  }
  return unl ? 0 : sum;
}

/** Thông tin đề công khai cho học sinh */
function QC_publicInfo(exam) {
  var st = exam.settings || {};
  var paper = QC_buildPaper(exam, 'preview');
  var totalSec = QC_totalLimit(st, paper);
  return {
    id: exam.id, title: exam.title || '', info: exam.info || {},
    count: paper.items.length, totalSec: totalSec, navMode: st.navMode === 'free' ? 'free' : 'strict',
    requireMssv: !!st.requireMssv, hasRoster: !!(st.roster && st.roster.length),
    maxViolations: +st.maxViolations || 0, fullscreen: st.fullscreen !== false,
    showScore: st.showScore !== false, scale: +st.scale || 10,
    window: QC_window(st), maxAttempts: QC_maxAttempts(st), showReview: !!st.showReview, requireApp: !!st.requireApp,
    kind: exam.kind === 'en' ? 'en' : 'subject', audioPlays: st.audioPlays != null && st.audioPlays !== '' ? +st.audioPlays : 1,
    hasSpeak: paper.items.some(function (it) { return exam.banks[it.b].questions[it.q].type === 'speak'; }),
    hasAudio: paper.items.some(function (it) { var b = exam.banks[it.b], q = b.questions[it.q]; return !!(q.audio || (b.book && q.skill === 'L') || (q.g != null && b.groups && b.groups[q.g] && b.groups[q.g].audio)); }),
    booklet: paper.items.some(function (it) { return !!exam.banks[it.b].book; }),
    note: st.note || '',
    music: st.music && st.music.url ? { url: String(st.music.url), vol: +st.music.vol || 35, allowMute: st.music.allowMute !== false } : null
  };
}

var QuizCore = {
  version: QC_VERSION, hash: QC_hash, rng: QC_rng, shuffle: QC_shuffle, parseList: QC_parseList, parseCount: QC_parseCount,
  round: QC_round, normName: QC_normName, usable: QC_usable, buildPaper: QC_buildPaper, publicPaper: QC_publicPaper,
  grade: QC_grade, publicInfo: QC_publicInfo, window: QC_window, maxAttempts: QC_maxAttempts, review: QC_review, totalLimit: QC_totalLimit, normAns: QC_normAns, audioRef: QC_audioRef, audioIds: QC_audioIds, bookInfo: QC_bookInfo, pageSrc: QC_pageSrc
};
if (typeof module !== 'undefined' && module.exports) module.exports = QuizCore;
