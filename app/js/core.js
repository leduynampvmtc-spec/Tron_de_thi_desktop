/* =====================================================================
 * core.js — Lõi trộn đề / chấm điểm (dùng chung cho trình duyệt và
 * máy chủ Google Apps Script). Phần mềm: Lê Duy Nam — GV Trường CĐ Dầu khí
 * ===================================================================== */
var QC_VERSION = '1.0';

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
  return q.type === 'essay';
}
/** Chuẩn hoá câu trả lời điền khuyết: không phân biệt hoa/thường, dấu nháy cong/thẳng, khoảng trắng thừa, dấu câu cuối */
function QC_normAns(s) {
  return String(s == null ? '' : s).normalize('NFC').replace(/[\u2018\u2019\u02BC`´]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ').trim().replace(/^["'(]+|["'.!?,;:)]+$/g, '').trim().toLowerCase();
}

/**
 * Tạo đề cho 1 lượt thi.
 * exam.groups: [{bank, pick:'random'|'fixed', range, count, list, sec, pts, shuffleOpts}]
 * exam.settings: {order:'mix'|'group'|'keep', shuffleOpts, sec, sameForAll}
 */
function QC_buildPaper(exam, seedStr) {
  var st = exam.settings || {};
  var rnd = QC_rng(st.sameForAll ? ('same|' + exam.id) : seedStr);
  var used = {};
  var blocks = [];
  (exam.groups || []).forEach(function (g, gi) {
    var bank = exam.banks[g.bank];
    if (!bank) return;
    var qs = bank.questions || [];
    used[g.bank] = used[g.bank] || {};
    var chosen;
    if (g.pick === 'fixed') {
      chosen = QC_parseList(g.list, qs.length).filter(function (i) { return QC_usable(qs[i]) && !used[g.bank][i]; });
    } else {
      var pool = (g.range && String(g.range).trim()) ? QC_parseList(g.range, qs.length) : qs.map(function (_, i) { return i; });
      pool = pool.filter(function (i) { return QC_usable(qs[i]) && !used[g.bank][i]; });
      var n = QC_parseCount(g.count, rnd);
      if (!(n > 0) || n > pool.length) n = pool.length;
      chosen = QC_shuffle(pool.slice(), rnd).slice(0, n);
      if (st.order === 'keep') chosen.sort(function (a, b) { return a - b; });
    }
    var items = chosen.map(function (qi) {
      used[g.bank][qi] = 1;
      var q = qs[qi];
      var perm = null;
      if (q.type === 'mc') {
        perm = q.options.map(function (_, i) { return i; });
        var doShuffle = st.shuffleOpts !== false && g.shuffleOpts !== false;
        if (doShuffle) {
          var pin = q.pin || [];
          var free = perm.filter(function (i) { return !pin[i]; });
          var sh = QC_shuffle(free.slice(), rnd);
          var k = 0;
          perm = perm.map(function (i) { return pin[i] ? i : sh[k++]; });
        }
      }
      var sec = (q.sec != null && q.sec !== '') ? +q.sec : (g.sec != null && g.sec !== '' ? +g.sec : (st.sec != null && st.sec !== '' ? +st.sec : 60));
      var pts = (q.pts != null && q.pts !== '') ? +q.pts : (g.pts != null && g.pts !== '' ? +g.pts : 1);
      return { b: g.bank, q: qi, g: gi, perm: perm, sec: sec, pts: pts };
    });
    if (st.order === 'group') QC_shuffle(items, rnd);
    blocks.push(items);
  });
  var all = [].concat.apply([], blocks);
  if (st.order === 'mix' || !st.order) QC_shuffle(all, rnd);
  return { items: all };
}

/** Đề gửi cho học sinh — KHÔNG có đáp án */
function QC_publicPaper(exam, paper) {
  return paper.items.map(function (it) {
    var q = exam.banks[it.b].questions[it.q];
    var o = { type: q.type, stem: q.stem, sec: it.sec, pts: it.pts };
    if (q.type === 'mc') {
      o.options = it.perm.map(function (i) { return q.options[i]; });
      o.multi = q.correct.length > 1;
    } else if (q.type === 'fill') {
      o.nb = q.blanks.length;
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
      res.details.push({ type: 'essay', b: it.b, q: it.q, text: String(a == null ? '' : a).slice(0, 20000), pts: it.pts, earned: e, graded: graded });
    }
  });
  res.earned = res.mcEarned + res.essayEarned;
  res.score = res.max > 0 ? QC_round(res.earned / res.max * scale, st.round || 0.1) : 0;
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
      return { type: 'mc', stem: q.stem, options: it.perm.map(function (o) { return q.options[o]; }), chosen: d.chosen.map(disp), correct: q.correct.map(disp), ok: d.ok };
    }
    if (q.type === 'fill') return { type: 'fill', stem: q.stem, given: d.given, oks: d.oks, blanks: q.blanks, ok: d.ok };
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
    note: st.note || '',
    music: st.music && st.music.url ? { url: String(st.music.url), vol: +st.music.vol || 35, allowMute: st.music.allowMute !== false } : null
  };
}

var QuizCore = {
  version: QC_VERSION, hash: QC_hash, rng: QC_rng, shuffle: QC_shuffle, parseList: QC_parseList, parseCount: QC_parseCount,
  round: QC_round, normName: QC_normName, usable: QC_usable, buildPaper: QC_buildPaper, publicPaper: QC_publicPaper,
  grade: QC_grade, publicInfo: QC_publicInfo, window: QC_window, maxAttempts: QC_maxAttempts, review: QC_review, totalLimit: QC_totalLimit, normAns: QC_normAns
};
if (typeof module !== 'undefined' && module.exports) module.exports = QuizCore;
