/* student.js — Trang làm bài của học sinh. Phần mềm: Lê Duy Nam — GV Trường CĐ Dầu khí */
(function () {
  'use strict';
  const { $, $$, esc, LS, IDB, api, toast, fmtSec, fmtDur } = QA;
  const params = new URLSearchParams(location.search);
  const PREVIEW = params.get('preview') === '1';
  const EXAM_ID = params.get('e');
  const API = QA.apiFromParams(params);
  const LET = 'ABCDEFGH';
  const app = $('#app');
  let info = null, previewExam = null, S = null, timerH = null, running = false;

  function header(sub) {
    return '<header class="topbar"><div class="wrap"><span class="brand"><span class="logo">Q</span><span>' + esc(sub || 'Làm bài trực tuyến') + '<small>Trường Cao đẳng Dầu khí</small></span></span></div></header>';
  }
  function fail(msg) {
    app.innerHTML = header() + '<div class="wrap start"><div class="card"><h2>Không mở được bài</h2><div class="msg bad">' + esc(msg) + '</div><p class="muted">Kiểm tra lại link giáo viên gửi, hoặc liên hệ giáo viên.</p></div><div class="card">' + QA.AUTHOR_HTML + '</div></div>';
  }

  /* --------------------------------- tải đề --------------------------------- */
  async function init() {
    try {
      if (PREVIEW) {
        previewExam = await IDB.get('previewExam');
        if (!previewExam) return fail('Không có đề xem thử. Hãy bấm “Xem thử như học sinh” từ trang giáo viên.');
        info = QuizCore.publicInfo(previewExam);
      } else {
        if (!EXAM_ID) { location.replace('index.html'); return; }
        if (!API) return fail('Link thiếu thông tin máy chủ.');
        const t0 = Date.now();
        const r = await api(API, { action: 'info', examId: EXAM_ID });
        info = r.info; info.offset = r.serverNow ? r.serverNow - Math.round((t0 + Date.now()) / 2) : 0;
      }
      renderStart();
    } catch (e) { fail(e.message); }
  }

  function renderStart() {
    const i = info.info || {};
    const saved = LS.get('student', {});
    const rows = [
      ['Loại bài', i.loai], [(i.hinhThuc || 'Môn học/Mô đun'), i.mon], ['Nội dung', i.noiDung], ['Lớp', i.lop], ['Khóa', i.khoa], ['Lần thi', i.lan], ['Ngày', i.ngay], ['Giáo viên', i.gv],
      ['Số câu', info.count + ' câu'], ['Thời gian', info.navMode === 'free' ? (info.totalSec ? fmtDur(info.totalSec) + ' cho cả bài' : 'Không giới hạn (ôn tập)') : (info.totalSec ? 'tối đa ' + fmtDur(info.totalSec) + ' (mỗi câu có đồng hồ riêng)' : 'không giới hạn')]
    ].filter(r => r[1]);
    const w = info.window || {};
    if (!PREVIEW) {
      if (w.from) rows.push(['Bắt đầu vào làm', QA.fmtTime(w.from)]);
      if (w.to) rows.push(['Hết giờ vào làm', QA.fmtTime(w.to)]);
      if (w.end) rows.push(['Kết thúc bài', QA.fmtTime(w.end) + ' (tự động nộp)']);
      rows.push(['Số lần làm', info.maxAttempts ? info.maxAttempts + ' lần' : 'Không giới hạn (luyện tập)']);
    }
    app.innerHTML = header(PREVIEW ? 'XEM THỬ ĐỀ (giáo viên)' : 'Làm bài trực tuyến') + '<div class="wrap start">' +
      (PREVIEW ? '<div class="msg warn">Chế độ xem thử: bài làm không được gửi lên máy chủ. Cuối bài sẽ hiện đáp án để thầy/cô kiểm tra đề.</div>' : '') +
      '<div class="card"><h1>' + esc(info.title || 'Bài kiểm tra') + '</h1><dl class="exinfo">' + rows.map(r => '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>').join('') + '</dl></div>' +
      '<div class="card"><h2>Thông tin học sinh</h2>' +
      '<div class="grid g2"><div><label for="hoTen">Họ và tên *</label><input type="text" id="hoTen" autocomplete="name" placeholder="VD: Nguyễn Văn An" value="' + esc(saved.hoTen || '') + '"></div>' +
      '<div><label for="lop">Lớp *</label><input type="text" id="lop" placeholder="VD: CK1-24-N2" value="' + esc(saved.lop || i.lop || '') + '"></div></div>' +
      '<div style="margin-top:12px"><label for="mssv">Mã số HSSV ' + (info.requireMssv ? '*' : '(nếu có)') + '</label><input type="text" id="mssv" value="' + esc(saved.mssv || '') + '"></div>' +
      '<ul class="rules">' + (info.navMode === 'free'
        ? '<li>Mỗi lần hiện <b>1 câu</b>. Em <b>được quay lại</b> xem và sửa các câu trước, bấm số câu để chuyển nhanh, dùng “Đánh dấu xem lại” cho câu chưa chắc.' + (info.totalSec ? ' Hết <b>' + fmtDur(info.totalSec) + '</b> bài tự nộp.' : '') + '</li>'
        : '<li>Mỗi lần chỉ hiện <b>1 câu</b>, có đồng hồ đếm ngược. Hết giờ sẽ tự chuyển câu. <b>Không quay lại</b> được câu trước.</li>') +
      '<li>Không rời khỏi cửa sổ làm bài, không chụp màn hình. Mọi lần vi phạm đều được ghi nhận và gửi giáo viên' + (info.maxViolations ? '; vi phạm <b>' + info.maxViolations + ' lần</b> bài sẽ tự nộp' : '') + '.</li>' +
      (info.note ? '<li>' + esc(info.note) + '</li>' : '') + (info.music && info.music.url ? '<li>Bài làm có <b>nhạc nền</b>' + (info.music.allowMute ? ' (em có thể tắt/bật bằng nút 🔊 Nhạc)' : '') + ' — nên đeo tai nghe nếu làm bài cùng phòng.</li>' : '') + '</ul>' +
      '<label class="check" style="margin:12px 0"><input type="checkbox" id="agree"> Tôi đã đọc quy định và cam kết tự làm bài.</label>' +
      '<div id="winMsg"></div><div id="startMsg"></div><button class="btn primary" id="btnStart" style="width:100%;padding:13px;font-size:1.05rem">Bắt đầu làm bài</button></div>' +
      '<div class="card">' + QA.AUTHOR_HTML + '</div></div>';
    $('#btnStart').onclick = start;
    if (!PREVIEW && info.requireApp && !QA.isApp) {
      $('#winMsg').innerHTML = '<div class="msg bad"><b>Bài thi này chỉ làm được bằng phần mềm “Trộn đề thi Online” trên máy tính của phòng máy</b> (không làm bằng điện thoại hoặc trình duyệt).<br>Trên máy tính đã cài phần mềm: mở phần mềm → dán link này vào ô <b>Học sinh</b> ở trang chủ → <b>Vào làm bài</b>.</div><button class="btn sm" id="copyMyLink" type="button">Sao chép link bài thi</button>';
      $('#btnStart').disabled = true; $('#btnStart').textContent = 'Chỉ làm trong phần mềm'; $('#btnStart').style.whiteSpace = 'normal';
      $('#copyMyLink').onclick = () => { const t = location.href; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Đã sao chép link', 'ok')).catch(() => prompt('Sao chép link:', t)); };
      return;
    }
    if (!PREVIEW) watchWindow();
  }
  const srvNow = () => Date.now() + ((info && info.offset) || 0);
  let winH = null;
  function watchWindow() {
    const w = info.window || {};
    const box = $('#winMsg'), btn = $('#btnStart');
    const tick = () => {
      const now = srvNow();
      if (w.end && now >= w.end) { box.innerHTML = '<div class="msg bad">Bài kiểm tra đã kết thúc lúc ' + QA.fmtTime(w.end) + '.</div>'; btn.disabled = true; clearInterval(winH); return; }
      if (w.from && now < w.from) {
        const left = Math.ceil((w.from - now) / 1000);
        const h = Math.floor(left / 3600), m = Math.floor(left % 3600 / 60), x = left % 60;
        box.innerHTML = '<div class="msg warn">Chưa đến giờ làm bài. Đề mở lúc <b>' + QA.fmtTime(w.from) + '</b> — còn <b>' + (h ? h + ' giờ ' : '') + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0') + '</b>. Trang tự mở khi đến giờ.</div>';
        btn.disabled = true; return;
      }
      if (w.to && now > w.to) { box.innerHTML = '<div class="msg warn">Đã hết giờ vào làm (' + QA.fmtTime(w.to) + '). Chỉ em đang làm dở mới vào làm tiếp được.</div>'; btn.disabled = false; btn.textContent = 'Vào làm tiếp bài đang dở'; return; }
      box.innerHTML = ''; if (btn.disabled && btn.textContent.indexOf('Đang') < 0) btn.disabled = false;
    };
    tick(); clearInterval(winH); winH = setInterval(tick, 1000);
  }

  /* -------------------------------- bắt đầu -------------------------------- */
  async function start() {
    const hoTen = $('#hoTen').value.replace(/\s+/g, ' ').trim(), lop = $('#lop').value.trim(), mssv = $('#mssv').value.trim();
    const msg = (t) => { $('#startMsg').innerHTML = '<div class="msg bad">' + esc(t) + '</div>'; };
    if (hoTen.split(' ').length < 2) return msg('Vui lòng nhập đầy đủ Họ và tên (có dấu).');
    if (!lop) return msg('Vui lòng nhập Lớp.');
    if (info.requireMssv && !mssv) return msg('Vui lòng nhập Mã số HSSV.');
    if (!$('#agree').checked) return msg('Hãy đánh dấu cam kết trước khi làm bài.');
    LS.set('student', { hoTen, lop, mssv });
    if (info.fullscreen) enterFull();
    if (info.music && info.music.url) { QA.Music.setMuted(!!(info.music.allowMute && LS.get('musicMuted', false))); QA.Music.start(info.music.url, info.music.vol); }
    $('#btnStart').disabled = true; $('#btnStart').textContent = 'Đang nhận đề…';
    try {
      if (PREVIEW) {
        const seed = 'preview|' + Date.now() + Math.random();
        const paper = QuizCore.buildPaper(previewExam, seed);
        S = { attemptId: 'preview', paper, items: QuizCore.publicPaper(previewExam, paper), idx: 0, answers: [], violations: 0, log: [], hoTen, lop, mssv, startedAt: Date.now(), offset: 0 };
        S.qDeadline = null;
      } else {
        const r = await api(API, { action: 'start', examId: EXAM_ID, hoTen, lop, mssv, client: QA.isApp ? 'app' : 'web' });
        const local = LS.get('att.' + r.attemptId, null);
        clearInterval(winH);
        S = { attemptNo: r.attemptNo, maxAttempts: r.maxAttempts, attemptId: r.attemptId, items: r.items, idx: r.idx || 0, answers: (r.saved && r.saved.length ? r.saved : (local && local.answers) || []), violations: Math.max(r.violations || 0, local ? local.violations || 0 : 0), log: (local && local.log) || [], hoTen, lop, mssv, startedAt: r.startedAt, offset: r.serverNow - Date.now() };
        info = Object.assign(info, r.info, { offset: r.serverNow - Date.now() });
        if (r.resume && r.qStart) {
          const sec = S.items[S.idx] ? S.items[S.idx].sec : 0;
          const remain = sec > 0 ? sec - (r.serverNow - r.qStart) / 1000 : null;
          S.resumeRemain = remain;
          toast('Tiếp tục bài làm đang dở (câu ' + (S.idx + 1) + ')', 'ok');
        }
      }
      while (S.answers.length < S.items.length) S.answers.push(null);
      const lf = PREVIEW ? null : LS.get('att.' + S.attemptId, null);
      S.flags = (lf && lf.flags) || [];
      S.plays = (lf && lf.plays) || {};
      S.pending = [];
      if (info.hasSpeak) {
        $('#btnStart').textContent = 'Đang mở micro…';
        const ok = await getMic();
        if (!ok) toast('Chưa có quyền dùng micro — phần NÓI sẽ không ghi âm được. Hãy cho phép micro rồi tải lại trang.', 'bad');
      }
      beginExam();
    } catch (e) {
      $('#btnStart').disabled = false; $('#btnStart').textContent = 'Bắt đầu làm bài';
      msg(e.message); exitFull(); QA.Music.stop();
    }
  }

  /* -------------------------------- chống gian lận -------------------------------- */
  function enterFull() { const d = document.documentElement; const f = d.requestFullscreen || d.webkitRequestFullscreen; if (f) { try { const p = f.call(d); if (p && p.catch) p.catch(() => {}); } catch (e) { /* không hỗ trợ */ } } }
  function exitFull() { const f = document.exitFullscreen || document.webkitExitFullscreen; if (f && (document.fullscreenElement || document.webkitFullscreenElement)) { try { f.call(document); } catch (e) { /* bỏ qua */ } } }
  function watermark() {
    const t = (S.hoTen + ' · ' + S.lop + (S.mssv ? ' · ' + S.mssv : '')).replace(/[<&>"]/g, '');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="200"><text x="20" y="120" transform="rotate(-24 180 100)" font-family="Arial" font-size="17" fill="#000">' + t + '</text></svg>';
    const svgD = '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="200"><text x="20" y="120" transform="rotate(-24 180 100)" font-family="Arial" font-size="17" fill="#fff">' + t + '</text></svg>';
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    $('#wm').style.backgroundImage = 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(dark ? svgD : svg) + '")';
  }
  let lastV = 0;
  let suppressV = 0; // tạm bỏ qua vi phạm khi trình duyệt hỏi quyền micro
  function violate(kind) {
    if (!running || Date.now() < suppressV) return;
    const now = Date.now();
    showShield(kind);
    if (now - lastV < 1500) return;
    lastV = now;
    S.violations++;
    S.log.push({ v: kind, i: S.idx, t: now });
    saveLocal(); sendProgress();
    if (info.maxViolations && S.violations >= info.maxViolations) {
      $('#shieldMsg').textContent = 'Bạn đã vi phạm ' + S.violations + ' lần — bài làm được tự động nộp.';
      $('#shieldBack').classList.add('hide');
      submit('Tự nộp do vi phạm ' + S.violations + ' lần');
    } else {
      $('#shieldMsg').textContent = 'Vi phạm (' + kind + ') đã được ghi nhận — lần ' + S.violations + (info.maxViolations ? '/' + info.maxViolations : '') + '. Hãy quay lại làm bài.';
    }
  }
  function showShield() { $('#shield').classList.add('on'); }
  $('#shieldBack').onclick = () => { $('#shield').classList.remove('on'); if (info.fullscreen) enterFull(); };
  window.addEventListener('blur', () => violate('Rời cửa sổ'));
  document.addEventListener('visibilitychange', () => { if (document.hidden) violate('Chuyển ứng dụng / tab'); });
  document.addEventListener('fullscreenchange', () => { if (running && info.fullscreen && !document.fullscreenElement) violate('Thoát toàn màn hình'); });
  function clearClip() { try { if (navigator.clipboard) navigator.clipboard.writeText('Không được chụp màn hình bài thi'); } catch (e) { /* bỏ qua */ } }
  document.addEventListener('keydown', (e) => {
    if (!running) return;
    const k = (e.key || '').toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (k === 'printscreen' || e.keyCode === 44) { e.preventDefault(); clearClip(); violate('Chụp màn hình'); return; }
    if (e.metaKey && e.shiftKey && ['3', '4', '5', '6', 's'].includes(k)) { e.preventDefault(); clearClip(); violate('Chụp màn hình'); return; }
    if ((e.key === 'Meta' || e.key === 'OS') && e.shiftKey) { showShield(); }
    if (k === 'f12' || (mod && e.shiftKey && ['i', 'j', 'c'].includes(k)) || (mod && ['c', 'x', 'a', 'p', 's', 'u'].includes(k) && !(e.target && e.target.tagName === 'TEXTAREA' && ['a'].includes(k)))) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  document.addEventListener('keyup', (e) => { if (running && (e.key === 'PrintScreen' || e.keyCode === 44)) { clearClip(); violate('Chụp màn hình'); } }, true);
  ['contextmenu', 'copy', 'cut', 'dragstart'].forEach(ev => document.addEventListener(ev, (e) => { if (running) e.preventDefault(); }, true));
  document.addEventListener('selectstart', (e) => { if (running && !(e.target.closest && e.target.closest('textarea, input'))) e.preventDefault(); }, true);
  window.addEventListener('beforeprint', () => { if (running) violate('In trang'); });
  window.addEventListener('beforeunload', (e) => { if (running) { saveLocal(); e.preventDefault(); e.returnValue = ''; } });

  /* -------------------------------- làm bài -------------------------------- */
  function saveLocal() { if (S && !PREVIEW) LS.set('att.' + S.attemptId, { answers: S.answers, violations: S.violations, log: S.log.slice(-200), idx: S.idx, flags: S.flags, plays: S.plays }); }
  function sendProgress() { if (PREVIEW || !S) return; api(API, { action: 'progress', attemptId: S.attemptId, idx: S.idx, answers: S.answers, violations: S.violations }, 1).catch(() => {}); }
  function beginExam() {
    running = true;
    document.body.classList.add('exam');
    watermark();
    app.innerHTML = '<div class="qbar"><div class="wrap"><div class="timer" id="timer"><svg width="52" height="52"><circle cx="26" cy="26" r="22" fill="none" stroke="var(--line)" stroke-width="5"/><circle id="ring" cx="26" cy="26" r="22" fill="none" stroke="var(--brand-2)" stroke-width="5" stroke-linecap="round" stroke-dasharray="138.2" stroke-dashoffset="0"/></svg><b id="tleft"></b></div>' +
      '<div><div style="font-weight:700" id="qpos"></div><div class="muted" style="font-size:.84rem">' + esc(S.hoTen) + ' · ' + esc(S.lop) + '</div></div><span class="spacer"></span><span class="pill warn hide" id="endChip"></span><span class="pill" id="vbadge"></span>' + (info.music && info.music.url && info.music.allowMute ? '<button class="btn sm" id="musicBtn" title="Tắt / bật nhạc nền"></button>' : '') + (FREE() ? '<button class="btn sm primary" id="barSubmit">Nộp bài</button>' : '') + '</div><div class="prog"><i id="progbar"></i></div></div>' +
      '<div class="wrap"><div class="card qcard" id="qcard"></div>' + (FREE() ? '<div class="card qcard pal-card"><div class="row" style="margin-bottom:8px"><b>Danh sách câu</b><span class="spacer"></span><span class="hint" style="margin:0"><span class="lg ans"></span> đã làm <span class="lg flag"></span> xem lại <span class="lg"></span> chưa làm</span></div><div class="pal" id="pal"></div></div>' : '') +
      '<div style="max-width:860px;margin:0 auto 30px">' + QA.AUTHOR_HTML + '</div></div>';
    if (FREE()) { $('#barSubmit').onclick = confirmSubmit; startTotalTimer(); }
    const mb = $('#musicBtn');
    if (mb) {
      const paintM = () => { mb.textContent = QA.Music.muted() ? '🔇 Nhạc' : '🔊 Nhạc'; };
      mb.onclick = () => { QA.Music.setMuted(!QA.Music.muted()); LS.set('musicMuted', QA.Music.muted()); if (!QA.Music.playing()) QA.Music.start(info.music.url, info.music.vol); paintM(); };
      paintM();
    }
    showQ(S.idx, S.resumeRemain);
    const end = !PREVIEW && info.window && info.window.end;
    if (end) {
      const chip = $('#endChip'); chip.classList.remove('hide');
      const t = () => {
        if (!running) { clearInterval(S.endH); return; }
        const l = (end - srvNow()) / 1000;
        chip.textContent = 'Kết thúc sau ' + fmtSec(Math.max(0, Math.ceil(l)));
        if (l <= 0) { clearInterval(S.endH); clearInterval(timerH); submit('Hết giờ làm bài'); }
      };
      t(); S.endH = setInterval(t, 1000);
    }
  }
  function showQ(i, remain) {
    stopAudio(); stopRec();
    S.idx = i; saveLocal(); sendProgress();
    const it = S.items[i], n = S.items.length;
    $('#qpos').textContent = 'Câu ' + (i + 1) + ' / ' + n;
    $('#progbar').style.width = ((FREE() ? answeredCount() : i) / n * 100) + '%';
    $('#vbadge').textContent = S.violations ? 'Vi phạm: ' + S.violations : 'Đang làm bài';
    $('#vbadge').className = 'pill ' + (S.violations ? 'bad' : 'ok');
    let body;
    if (it.type === 'mc') {
      body = (it.multi ? '<div class="pill warn" style="margin-bottom:10px">Câu này có thể có NHIỀU đáp án đúng — chọn tất cả đáp án đúng</div>' : '') +
        '<div class="opts">' + it.options.map((o, d) => '<button class="optb" data-d="' + d + '"><span class="lt">' + LET[d] + '</span><span>' + o + '</span></button>').join('') + '</div>';
    } else if (it.type === 'fill') {
      body = '<div class="pill" style="margin-bottom:10px">Điền vào ' + (it.nb > 1 ? it.nb + ' chỗ trống' : 'chỗ trống') + '</div>';
    } else if (it.type === 'speak') {
      body = '<div class="recbox"><div class="hint">Bấm nút đỏ để ghi âm câu trả lời — tối đa <b>' + (it.rec || 60) + ' giây</b>. Ghi lại được trước khi chuyển câu.</div>' +
        '<button class="rbtn" id="recBtn" title="Ghi âm">🎙</button><div class="rtime" id="recTime">0:00 / ' + fmtSec(it.rec || 60) + '</div><div class="hint" id="recSt"></div><div id="recOut"></div></div>';
    } else {
      body = '<div class="essay"><textarea id="essay" placeholder="Nhập bài làm của em…">' + esc(S.answers[i] || '') + '</textarea><div class="hint" id="cc"></div></div>';
    }
    const stemHtml = it.type === 'fill' ? it.stem.replace(/<span class="blank" data-b="(\d+)">[^<]*<\/span>/g, (m, k) => '<input type="text" class="blankin" data-b="' + k + '" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="(' + (+k + 1) + ')" value="' + esc(((S.answers[i] || [])[+k]) || '') + '">') : it.stem;
    const SKN = { L: 'Nghe', R: 'Đọc', W: 'Viết', S: 'Nói' };
    let pre = '';
    if (it.group) {
      const g = it.group;
      pre = '<div class="passage"><div class="ptitle">' + esc(g.title || 'Đoạn dùng chung') + (g.size > 1 ? ' · câu ' + (g.pos) + '/' + g.size + ' của đoạn' : '') + '</div>' +
        (g.audio ? audioBoxHtml('g:' + g.key, g.audio) : '') + (g.stem ? '<div class="ptext">' + g.stem + '</div>' : '') + '</div>';
    }
    if (it.audio) pre += audioBoxHtml('q:' + i, it.audio);
    $('#qcard').innerHTML = pre + '<div class="qnum">Câu ' + (i + 1) + (it.skill ? ' · ' + SKN[it.skill] : '') + (it.pts !== 1 ? ' · ' + it.pts + ' điểm' : '') + (it.type === 'essay' ? (it.skill === 'W' ? '' : ' · Tự luận') : it.type === 'fill' ? ' · Điền khuyết' : it.type === 'speak' ? ' · Ghi âm' : '') + '</div><div class="stem">' + stemHtml + '</div>' + body +
      (FREE()
        ? '<div class="nav"><button class="btn" id="btnPrev"' + (i === 0 ? ' disabled' : '') + '>← Câu trước</button><button class="btn' + (S.flags[i] ? ' accent' : '') + '" id="btnFlag">' + (S.flags[i] ? '★ Đã đánh dấu' : '☆ Đánh dấu xem lại') + '</button><span class="spacer"></span><button class="btn primary" id="btnNext">' + (i === n - 1 ? 'Nộp bài' : 'Câu sau →') + '</button></div>'
        : '<div class="nav"><span class="muted" id="navHint" style="font-size:.88rem"></span><span class="spacer"></span><button class="btn primary" id="btnNext">' + (i === n - 1 ? 'Nộp bài' : 'Câu tiếp theo →') + '</button></div>');
    const paint = () => $$('.optb').forEach(b => b.classList.toggle('sel', (S.answers[i] || []).includes(+b.dataset.d)));
    $$('.optb').forEach(b => b.onclick = () => {
      const d = +b.dataset.d;
      let a = S.answers[i] || [];
      if (it.multi) { a = a.includes(d) ? a.filter(x => x !== d) : a.concat(d).sort(); } else a = [d];
      S.answers[i] = a; paint(); saveLocal(); if ($('#navHint')) $('#navHint').textContent = ''; if (FREE()) { palette(); $('#progbar').style.width = (answeredCount() / n * 100) + '%'; }
    });
    paint();
    $$('.audbox[data-ak]').forEach(box => setupAudioBox(box));
    if (it.type === 'speak') setupRecorder(i, it);
    const fins = $$('.blankin');
    if (fins.length) {
      fins.forEach(inp => inp.oninput = () => {
        const a = (S.answers[i] && Array.isArray(S.answers[i])) ? S.answers[i].slice() : Array(it.nb).fill('');
        a[+inp.dataset.b] = inp.value; S.answers[i] = a; saveLocal(); if (FREE()) { palette(); $('#progbar').style.width = (answeredCount() / n * 100) + '%'; }
      });
      fins.forEach((inp, k) => inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); if (fins[k + 1]) fins[k + 1].focus(); } });
      setTimeout(() => fins[0].focus(), 50);
    }
    const ta = $('#essay');
    if (ta) { const cc = () => { $('#cc').textContent = info.kind === 'en' ? ta.value.trim().split(/\s+/).filter(Boolean).length + ' từ' : ta.value.length + ' ký tự'; }; ta.oninput = () => { S.answers[i] = ta.value; cc(); saveLocal(); if (FREE()) palette(); }; cc(); setTimeout(() => ta.focus(), 50); }
    if (FREE()) {
      $('#btnNext').onclick = () => { if (i === n - 1) confirmSubmit(); else showQ(i + 1); };
      $('#btnPrev').onclick = () => { if (i > 0) showQ(i - 1); };
      $('#btnFlag').onclick = () => { S.flags[i] = !S.flags[i]; saveLocal(); showQ(i); };
      palette();
      window.scrollTo(0, 0);
      return;
    }
    let warned = false;
    $('#btnNext').onclick = () => {
      const empty = !isAnswered(i);
      if (i === n - 1) { confirmSubmit(); return; }
      if (empty && !warned) { warned = true; $('#navHint').textContent = 'Em chưa trả lời câu này. Bấm lần nữa để bỏ qua (không quay lại được).'; return; }
      next(false);
    };
    // đồng hồ
    clearInterval(timerH);
    const sec = it.sec || 0;
    if (sec > 0) {
      let left = remain != null ? Math.max(0, remain) : sec;
      const end = !PREVIEW && info.window && info.window.end;
      if (end) left = Math.min(left, Math.max(0, (end - srvNow()) / 1000));
      S.qDeadline = Date.now() + left * 1000;
      let myH = null;
      const tick = () => {
        if (!running || S.idx !== i || !$('#tleft')) { clearInterval(myH); return; }
        const l = (S.qDeadline - Date.now()) / 1000;
        $('#tleft').textContent = fmtSec(Math.ceil(Math.max(0, l)));
        $('#ring').style.strokeDashoffset = String(138.2 * (1 - Math.max(0, l) / sec));
        $('#timer').classList.toggle('low', l <= Math.min(10, sec * 0.2));
        $('#ring').style.stroke = l <= Math.min(10, sec * 0.2) ? 'var(--bad)' : 'var(--brand-2)';
        if (l <= 0) {
          clearInterval(myH); S.log.push({ i, timeout: 1 });
          if (end && srvNow() >= end - 500) submit('Hết giờ làm bài');
          else if (i === n - 1) submit('Hết giờ');
          else setTimeout(() => next(true), 0);
        }
      };
      myH = setInterval(tick, 250); timerH = myH; tick();
    } else { $('#tleft').textContent = '∞'; $('#ring').style.strokeDashoffset = '0'; }
    window.scrollTo(0, 0);
  }
  function next() { if (!running) return; if (S.idx < S.items.length - 1) showQ(S.idx + 1); }

  /* ---------------------------- file nghe (đề Tiếng Anh) ---------------------------- */
  const AUD = { el: null, key: null, cache: {} };
  const AREF = {};
  function audioBoxHtml(key, ref) {
    if (!ref || ref.missing) return '<div class="msg warn">Thiếu file nghe' + (ref && ref.missing ? ' (' + esc(ref.missing) + ')' : '') + ' — báo giáo viên.</div>';
    AREF[key] = ref;
    return '<div class="audbox" data-ak="' + esc(key) + '"><button class="abtn" type="button" title="Nghe">▶</button><div class="abar"><i></i></div><div class="ainfo"></div></div>';
  }
  function stopAudio() { if (AUD.el) { try { AUD.el.pause(); } catch (e) { /* bỏ qua */ } AUD.el = null; AUD.key = null; } }
  async function audioViaServer(ref) {
    if (AUD.cache[ref.id]) return AUD.cache[ref.id];
    let parts = 1; const chunks = []; let mime = 'audio/mpeg';
    for (let k = 0; k < parts; k++) {
      const r = await api(API, { action: 'audio', examId: EXAM_ID, id: ref.id, part: k });
      parts = r.parts; mime = r.mime || mime;
      chunks.push(Uint8Array.from(atob(r.b64), c => c.charCodeAt(0)));
    }
    return (AUD.cache[ref.id] = URL.createObjectURL(new Blob(chunks, { type: mime })));
  }
  function setupAudioBox(box) {
    const key = box.dataset.ak, ref = AREF[key];
    const btn = box.querySelector('.abtn'), bar = box.querySelector('.abar > i'), inf = box.querySelector('.ainfo');
    const P = +info.audioPlays || 0;
    const paint = (playing) => {
      const used = S.plays[key] || 0, left = P ? Math.max(0, P - used) : Infinity;
      btn.disabled = playing || left <= 0;
      btn.textContent = playing ? '♪' : '▶';
      inf.textContent = playing ? 'Đang phát…' : (P ? (left > 0 ? 'Còn ' + left + ' lần nghe' : 'Đã hết lượt nghe') : 'Nghe không giới hạn');
    };
    const play = async () => {
      const used = S.plays[key] || 0;
      if (P && used >= P) return;
      stopAudio();
      S.plays[key] = used + 1; saveLocal(); paint(true);
      const el = new Audio(); AUD.el = el; AUD.key = key; el.preload = 'auto';
      el.ontimeupdate = () => { if (el.duration) bar.style.width = (el.currentTime / el.duration * 100) + '%'; };
      el.onended = () => { bar.style.width = '100%'; if (AUD.el === el) AUD.el = null; paint(false); };
      let triedServer = false;
      const fail = () => { S.plays[key] = used; saveLocal(); paint(false); inf.textContent = 'Không phát được — bấm ▶ thử lại'; };
      el.onerror = async () => {
        if (AUD.el !== el) return;
        if (!triedServer && ref.id && !PREVIEW) {
          triedServer = true; inf.textContent = 'Đang tải file nghe…';
          try { el.src = await audioViaServer(ref); await el.play(); paint(true); return; } catch (e) { /* tiếp tục báo lỗi */ }
        }
        fail();
      };
      el.src = AUD.cache[ref.id] || ref.src;
      try { await el.play(); } catch (e) { if (e && e.name === 'NotAllowedError') { S.plays[key] = used; saveLocal(); paint(false); inf.textContent = 'Bấm ▶ để nghe'; } }
    };
    btn.onclick = play;
    paint(false);
    if (!(S.plays[key] > 0)) setTimeout(() => { if (box.isConnected && running) play(); }, 350);
  }

  /* ---------------------------- ghi âm câu NÓI ---------------------------- */
  const REC = { mr: null, timer: null };
  async function getMic() {
    if (S.stream) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) return false;
    suppressV = Date.now() + 8000;
    try { S.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); suppressV = Date.now() + 1500; return true; }
    catch (e) { suppressV = Date.now() + 1500; return false; }
  }
  function stopRec() { if (REC.mr && REC.mr.state === 'recording') REC.mr.stop(); clearInterval(REC.timer); }
  function blobB64(b) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(b); }); }
  function setupRecorder(i, it) {
    const btn = $('#recBtn'), tEl = $('#recTime'), st = $('#recSt'), out = $('#recOut');
    const max = it.rec || 60;
    const showDone = (a, url) => {
      st.innerHTML = a && a.rec ? '<span class="pill ok">✓ Đã lưu bài nói' + (a.dur ? ' (' + Math.round(a.dur) + ' giây)' : '') + '</span> — bấm 🎙 để ghi lại' : '';
      out.innerHTML = url ? '<audio controls src="' + url + '"></audio>' : '';
    };
    showDone(S.answers[i], S.recUrl && S.recUrl[i]);
    btn.onclick = async () => {
      if (REC.mr && REC.mr.state === 'recording') { stopRec(); return; }
      if (!(await getMic())) { st.innerHTML = '<span class="pill bad">Không dùng được micro — kiểm tra quyền micro của trình duyệt rồi tải lại trang.</span>'; return; }
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(m => window.MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
      const mr = new MediaRecorder(S.stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
      const chunks = []; const t0 = Date.now();
      REC.mr = mr;
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = () => {
        clearInterval(REC.timer); btn.classList.remove('on'); btn.textContent = '🎙';
        const dur = (Date.now() - t0) / 1000;
        const blob = new Blob(chunks, { type: mr.mimeType || mime || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        S.recUrl = S.recUrl || {}; S.recUrl[i] = url;
        if (PREVIEW) { S.answers[i] = { rec: 'preview', dur }; saveLocal(); if (S.idx === i) showDone(S.answers[i], url); if (FREE()) palette(); return; }
        if (S.idx === i) { out.innerHTML = '<audio controls src="' + url + '"></audio>'; st.innerHTML = '<span class="pill">Đang lưu bài nói…</span>'; }
        const job = (async () => {
          for (let k = 0; k < 3; k++) {
            try {
              const r = await api(API, { action: 'uploadSpeech', attemptId: S.attemptId, idx: i, mime: blob.type, b64: await blobB64(blob) }, 1);
              S.answers[i] = { rec: r.id, dur }; saveLocal(); sendProgress();
              if (S.idx === i && $('#recSt')) showDone(S.answers[i], url);
              if (FREE()) palette();
              return;
            } catch (e) { await new Promise(r => setTimeout(r, 1500 * (k + 1))); }
          }
          if (S.idx === i && $('#recSt')) $('#recSt').innerHTML = '<span class="pill bad">Chưa lưu được bài nói (mạng?) — bấm 🎙 ghi lại</span>';
        })();
        S.pending.push(job);
      };
      mr.start(1000);
      btn.classList.add('on'); btn.textContent = '■'; st.textContent = 'Đang ghi âm… bấm ■ để dừng';
      REC.timer = setInterval(() => {
        const sec = (Date.now() - t0) / 1000;
        if (tEl.isConnected) tEl.textContent = fmtSec(sec) + ' / ' + fmtSec(max);
        if (sec >= max) stopRec();
      }, 250);
    };
  }
  function FREE() { return info && info.navMode === 'free'; }
  const isAnswered = (k) => { const a = S.answers[k], t = S.items[k].type; return t === 'speak' ? !!(a && a.rec) : t === 'mc' ? !!(a && a.length) : t === 'fill' ? !!(Array.isArray(a) && a.some(x => String(x || '').trim())) : !!(a && String(a).trim()); };
  function answeredCount() { let c = 0; for (let k = 0; k < S.items.length; k++) if (isAnswered(k)) c++; return c; }
  function palette() {
    const el = $('#pal'); if (!el) return;
    el.innerHTML = S.items.map((_, k) => '<button class="pb' + (isAnswered(k) ? ' ans' : '') + (S.flags[k] ? ' flag' : '') + (k === S.idx ? ' cur' : '') + '" data-k="' + k + '">' + (k + 1) + '</button>').join('');
    $$('.pb', el).forEach(b => b.onclick = () => showQ(+b.dataset.k));
  }
  /** Đồng hồ tổng cho chế độ Tự do (0 = không giới hạn) */
  function startTotalTimer() {
    const total = info.totalSec || 0;
    const end = !PREVIEW && info.window && info.window.end;
    let deadline = total ? (S.startedAt || Date.now()) + total * 1000 : 0;
    if (end && (!deadline || end < deadline)) deadline = end;
    if (!deadline) { $('#tleft').textContent = '∞'; $('#ring').style.strokeDashoffset = '0'; return; }
    const span = total ? total : Math.max(1, (deadline - srvNow()) / 1000);
    let h = null;
    const tick = () => {
      if (!running || !$('#tleft')) { clearInterval(h); return; }
      const l = (deadline - srvNow()) / 1000;
      $('#tleft').textContent = fmtSec(Math.ceil(Math.max(0, l)));
      $('#ring').style.strokeDashoffset = String(138.2 * (1 - Math.max(0, Math.min(1, l / span))));
      const low = l <= Math.min(120, span * 0.1);
      $('#timer').classList.toggle('low', low); $('#ring').style.stroke = low ? 'var(--bad)' : 'var(--brand-2)';
      if (l <= 0) { clearInterval(h); submit('Hết giờ làm bài'); }
    };
    h = setInterval(tick, 500); timerH = h; tick();
  }
  function confirmSubmit() {
    const un = [], fl = [];
    S.items.forEach((_, k) => { if (!isAnswered(k)) un.push(k + 1); if (S.flags && S.flags[k]) fl.push(k + 1); });
    const unanswered = un.length;
    $('#modalBody').innerHTML = '<h2>Nộp bài?</h2><p>' + (unanswered ? 'Em còn <b>' + unanswered + '</b> câu chưa trả lời' + (FREE() ? ' (câu ' + un.slice(0, 30).join(', ') + (un.length > 30 ? '…' : '') + ')' : '') + '. ' : 'Em đã trả lời tất cả các câu. ') + (FREE() && fl.length ? 'Câu đánh dấu xem lại: <b>' + fl.join(', ') + '</b>. ' : '') + 'Sau khi nộp sẽ không sửa được nữa.</p><div class="row" style="justify-content:flex-end"><button class="btn" id="mNo">Chưa nộp</button><button class="btn primary" id="mYes">Nộp bài</button></div>';
    $('#modal').classList.add('on');
    $('#mNo').onclick = () => $('#modal').classList.remove('on');
    $('#mYes').onclick = () => { $('#modal').classList.remove('on'); submit(''); };
  }

  /* -------------------------------- nộp bài -------------------------------- */
  let submitting = false;
  async function submit(reason) {
    if (submitting) return; submitting = true;
    clearInterval(timerH); running = false;
    stopAudio(); stopRec();
    $('#qcard') && ($('#qcard').innerHTML = '<h2>Đang nộp bài…</h2><p class="muted">Vui lòng không đóng trang.</p>');
    if (S.pending && S.pending.length) { await new Promise(r => setTimeout(r, 400)); await Promise.allSettled(S.pending); }
    saveLocal();
    if (PREVIEW) { done(gradePreview(), reason); return; }
    const payload = { action: 'submit', attemptId: S.attemptId, answers: S.answers, violations: S.violations, log: S.log.slice(-200), reason };
    for (let k = 0; k < 6; k++) {
      try { const r = await api(API, payload, 2); LS.del('att.' + S.attemptId); done(r, reason); return; }
      catch (e) {
        if (e.server) { done({ error: e.message }, reason); return; }
        $('#qcard') && ($('#qcard').innerHTML = '<h2>Đang nộp bài…</h2><div class="msg warn">Mạng chập chờn, đang thử gửi lại (' + (k + 1) + ')…</div>');
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    $('#shield').classList.remove('on');
    app.innerHTML = header() + '<div class="wrap done"><div class="card"><h2>Chưa gửi được bài</h2><p>Bài làm đã được lưu tạm trên máy này. Hãy kiểm tra Internet rồi bấm gửi lại. <b>Không đóng trang.</b></p><button class="btn primary" id="retry">Gửi lại bài làm</button></div></div>';
    $('#retry').onclick = () => { submitting = false; app.innerHTML = '<div id="qcard"></div>'; submit(reason); };
  }
  /** Hiện câu điền khuyết với câu trả lời của học sinh (xanh = đúng, đỏ = sai + đáp án đúng) */
  function fillHtml(stem, given, oks, blanks) {
    return stem.replace(/<span class="blank" data-b="(\d+)">[^<]*<\/span>/g, (m, k) => {
      k = +k; const g = (given || [])[k] || '', ok = oks && oks[k];
      return '<span class="fillans ' + (ok ? 'ok' : 'bad') + '">' + (esc(g) || '(bỏ trống)') + '</span>' + (ok ? '' : ' <span class="fillans ok">→ ' + esc((blanks[k] || []).join((blanks[k] || []).some(x => x.indexOf('/') >= 0) ? ' | ' : ' / ')) + '</span>');
    });
  }
  function gradePreview() {
    const g = QuizCore.grade(previewExam, S.paper, S.answers, {});
    return { score: g.score, right: g.mcRight, mcCount: g.mcCount, essayPending: g.essayPending, scale: info.scale, review: g, skills: g.skills, toeic: g.toeic };
  }
  function done(r, reason) {
    exitFull(); QA.Music.stop(); stopAudio();
    if (S && S.stream) { try { S.stream.getTracks().forEach(t => t.stop()); } catch (e) { /* bỏ qua */ } }
    document.body.classList.remove('exam');
    $('#shield').classList.remove('on'); $('#wm').style.backgroundImage = 'none';
    let h = header() + '<div class="wrap done"><div class="card">';
    if (r.error) h += '<h2>Không nộp được</h2><div class="msg bad">' + esc(r.error) + '</div>';
    else {
      h += '<h2>' + (reason ? esc(reason) + ' — ' : '') + 'Đã nộp bài thành công</h2><p class="muted">' + esc(S.hoTen) + ' · ' + esc(S.lop) + '</p>';
      if (r.score != null) h += '<div class="bigscore">' + String(r.score).replace('.', ',') + '<span style="font-size:1.2rem;color:var(--muted)"> / ' + (r.scale || 10) + '</span></div><p>Đúng <b>' + r.right + '/' + r.mcCount + '</b> câu' + (r.essayPending ? ' · ' + r.essayPending + ' câu tự luận chờ giáo viên chấm' : '') + '</p>';
      else h += '<p>Kết quả đã được gửi đến giáo viên.</p>';
      if (r.already) h += '<p class="hint">(Bài này đã được nộp trước đó.)</p>';
      if (r.skills) {
        const N = { L: 'Nghe', R: 'Đọc', W: 'Viết', S: 'Nói' };
        h += '<div class="skillsum">' + ['L', 'R', 'W', 'S'].filter(k => r.skills[k]).map(k => { const o = r.skills[k]; return '<div><span class="muted">' + N[k] + '</span><b>' + (o.pending ? '…' : String(o.score).replace('.', ',')) + '</b><span class="hint">' + (o.pending ? 'chờ giáo viên chấm' : (o.count - o.pending > 0 && (k === 'L' || k === 'R') ? 'đúng ' + o.right + '/' + o.count : 'thang 10')) + '</span></div>'; }).join('') + '</div>';
        if (r.toeic && r.toeic.LR != null) h += '<p>Quy đổi TOEIC (tham khảo): <b>' + r.toeic.LR + '</b> / 990' + (r.toeic.L != null ? ' · Nghe ' + r.toeic.L : '') + (r.toeic.R != null ? ' · Đọc ' + r.toeic.R : '') + '</p>';
      }
      if (r.attemptNo) h += '<p class="muted">Lần làm thứ ' + r.attemptNo + (r.maxAttempts ? ' / ' + r.maxAttempts + ' lần cho phép' : ' (luyện tập — không giới hạn số lần)') + '</p>';
      const w = info.window || {};
      const canAgain = !PREVIEW && r.attemptNo && (!r.maxAttempts || r.attemptNo < r.maxAttempts) && !(w.end && srvNow() >= w.end) && !(w.to && srvNow() > w.to);
      if (canAgain) h += '<button class="btn accent" id="again" style="margin-top:6px">Làm lại lần ' + (r.attemptNo + 1) + ' (đề trộn mới)</button>';
    }
    h += '</div>';
    if (!PREVIEW && r.review) {
      h += '<div class="card review" style="text-align:left"><h2>Xem lại bài làm &amp; đáp án</h2>' + r.review.map((d, i) => '<div class="qprev"><b>Câu ' + (i + 1) + '</b> ' +
        (d.type === 'fill' ? '<span class="pill ' + (d.ok ? 'ok' : 'bad') + '">' + (d.ok ? 'Đúng' : 'Chưa đúng hết') + '</span><div>' + fillHtml(d.stem, d.given, d.oks, d.blanks) + '</div>' :
        d.type === 'mc' ? '<span class="pill ' + (d.ok ? 'ok' : 'bad') + '">' + (d.ok ? 'Đúng' : 'Sai') + '</span><div>' + d.stem + '</div>' +
          d.options.map((o, oi) => '<div class="opt' + (d.correct.includes(oi) ? ' ok' : d.chosen.includes(oi) ? ' badc' : '') + '">' + LET[oi] + ') ' + o + (d.correct.includes(oi) ? ' ✓' : '') + (d.chosen.includes(oi) ? ' ← em chọn' : '') + '</div>').join('')
          : '<span class="pill">Tự luận</span><div>' + d.stem + '</div><div class="msg info" style="white-space:pre-wrap">' + (esc(d.text) || '<i>(bỏ trống)</i>') + '</div>' + (d.answer ? '<div class="hint"><b>Đáp án gợi ý:</b> ' + d.answer + '</div>' : '')) + '</div>').join('') + '</div>';
    }
    if (PREVIEW && r.review) {
      h += '<div class="card review" style="text-align:left"><h2>Đáp án (chỉ hiện ở chế độ xem thử)</h2>' + r.review.details.map((d, i) => {
        const q = previewExam.banks[d.b].questions[d.q];
        if (d.type === 'fill') return '<div class="qprev"><b>Câu ' + (i + 1) + '</b> <span class="pill ' + (d.ok ? 'ok' : 'bad') + '">' + (d.ok ? 'Đúng' : 'Chưa đúng hết') + '</span><div>' + fillHtml(q.stem, d.given, d.oks, q.blanks) + '</div></div>';
        return '<div class="qprev"><b>Câu ' + (i + 1) + '</b> ' + (d.type === 'mc' ? '<span class="pill ' + (d.ok ? 'ok' : 'bad') + '">' + (d.ok ? 'Đúng' : 'Sai') + '</span>' : '<span class="pill">Tự luận</span>') + '<div>' + q.stem + '</div>' +
          (d.type === 'mc' ? q.options.map((o, oi) => '<div class="opt' + (q.correct.includes(oi) ? ' ok' : d.chosen.includes(oi) ? ' badc' : '') + '">' + LET[oi] + ') ' + o + (q.correct.includes(oi) ? ' ✓' : '') + (d.chosen.includes(oi) ? ' ← đã chọn' : '') + '</div>').join('') : '<div class="hint">' + (q.answer || '') + '</div>') + '</div>';
      }).join('') + '</div>';
    }
    h += '<div class="card">' + QA.AUTHOR_HTML + '</div></div>';
    app.innerHTML = h;
    const ag = $('#again'); if (ag) ag.onclick = () => location.reload();
  }

  init();
})();
