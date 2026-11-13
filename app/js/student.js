/* student.js — Trang làm bài của học sinh. Phần mềm: Lê Duy Nam — GV Trường CĐ Dầu khí */
(function () {
  'use strict';
  /* Ảnh đề lưu trên Google Drive (đoạn văn, tranh): lỗi tải thì thử link ảnh nhỏ của Drive */
  document.addEventListener('error', (e) => {
    const im = e.target; if (!im || im.tagName !== 'IMG' || !im.dataset || !im.dataset.drv) return;
    const st = +(im.dataset.st || 0); im.dataset.st = st + 1;
    if (st === 0) im.src = 'https://drive.google.com/thumbnail?id=' + im.dataset.drv + '&sz=w1600';
    else if (st === 1) im.src = 'https://drive.google.com/uc?export=view&id=' + im.dataset.drv;
  }, true);

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
        S = { attemptId: 'preview', paper, items: QuizCore.publicPaper(previewExam, paper), book: QuizCore.bookInfo(previewExam, paper), idx: 0, answers: [], violations: 0, log: [], hoTen, lop, mssv, startedAt: Date.now(), offset: 0 };
        S.qDeadline = null;
      } else {
        const r = await api(API, { action: 'start', examId: EXAM_ID, hoTen, lop, mssv, client: QA.isApp ? 'app' : 'web' });
        const local = LS.get('att.' + r.attemptId, null);
        clearInterval(winH);
        S = { attemptNo: r.attemptNo, maxAttempts: r.maxAttempts, attemptId: r.attemptId, items: r.items, book: r.book || null, idx: r.idx || 0, answers: (r.saved && r.saved.length ? r.saved : (local && local.answers) || []), violations: Math.max(r.violations || 0, local ? local.violations || 0 : 0), log: (local && local.log) || [], hoTen, lop, mssv, startedAt: r.startedAt, offset: r.serverNow - Date.now() };
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
      S.bk = (lf && lf.bk) || {};
      S.pending = [];
      if (info.hasSpeak) {
        $('#btnStart').textContent = 'Đang mở micro…';
        const ok = await getMic();
        if (!ok) toast('Chưa có quyền dùng micro — phần NÓI sẽ không ghi âm được. Hãy cho phép micro rồi tải lại trang.', 'bad');
      }
      if (S.book && Object.keys(S.book).length) beginBooklet(); else beginExam();
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
  function saveLocal() { if (S && !PREVIEW) LS.set('att.' + S.attemptId, { answers: S.answers, violations: S.violations, log: S.log.slice(-200), idx: S.idx, flags: S.flags, plays: S.plays, bk: S.bk }); }
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
  /* ======================= ĐỀ TOEIC NGUYÊN BỘ (sách đề + phiếu trả lời) ======================= */
  const BA = { el: null, k: null, lastSave: 0 };
  const IMGC = {};
  /* v1.9 — tùy chọn của giáo viên: tự lật trang theo file nghe, khóa quay lại trang / phần Nghe */
  const LOCKL = () => !!(info && info.bkLockL), LOCKSEC = () => !!(info && info.bkLockSec), AUTOPG = () => !(info && info.bkAuto === false);
  const lIdx = (pi) => (S.secPages && S.secPages.L ? S.secPages.L.indexOf(pi) : -1);
  function pageAllowed(sec, pi) {
    if (sec !== 'L') return true;
    if (LOCKSEC() && S.bk.inR) return false;
    if (LOCKL() && S.bk.lMax != null && lIdx(pi) < S.bk.lMax) return false;
    return true;
  }
  function lockNote(t) { const m = $('#aMsg') || $('#shTitle'); QA.toast ? QA.toast(t, 'warn') : (m && (m.textContent = t)); }
  /** Lật trang theo mốc thời gian trong file nghe (mỗi mốc = câu đầu của 1 đoạn nghe) */
  function autoTurn(k, t) {
    if (!AUTOPG() || S.bk.sec !== 'L') return;
    const mk = S.B.marks && S.B.marks[k]; if (!mk || !mk.length) return;
    let m = null; for (const x of mk) { if (x.t <= t + 0.25) m = x; else break; }
    if (!m || BA.mark === k + ':' + m.n) return; BA.mark = k + ':' + m.n;
    const it = S.items.find(x => x.skill === 'L' && +x.num === +m.n && x.page != null); if (!it || it.page === S.bk.page) return;
    const onPg = S.items.filter(x => x.skill === 'L' && x.page === S.bk.page).map(x => +x.num);
    if (!onPg.length || Math.max.apply(null, onPg) < +m.n) showPage(it.page);
  }
  function stopBookAudio() { if (BA.el) { try { BA.el.pause(); } catch (e) { /* bỏ qua */ } BA.el = null; BA.k = null; } }
  function beginBooklet() {
    running = true;
    document.body.classList.add('exam', 'bookmode');
    watermark();
    const bi = Object.keys(S.book)[0], B = S.book[bi];
    S.B = B;
    S.secs = ['L', 'R'].filter(k => S.items.some(it => it.skill === k));
    // các trang thuộc từng phần (bỏ trang của phần không có trong bài)
    S.secPages = {};
    S.secs.forEach(k => {
      const its = S.items.filter(it => it.skill === k && it.page != null).map(it => it.page);
      let list = B.pages.map((p, i) => i).filter(i => B.pages[i].sec === k || B.pages[i].sec === 'LR' || !B.pages[i].sec);
      if (its.length && B.pages.some(p => p.sec === 'LR')) { const lo = Math.min.apply(null, its), hi = Math.max.apply(null, its); list = list.filter(i => B.pages[i].sec !== 'LR' || (i >= lo - 1 && i <= hi)); }
      S.secPages[k] = list;
    });
    S.mapped = {}; S.secs.forEach(k => { S.mapped[k] = S.items.some(it => it.skill === k && it.page != null); });
    if (!S.bk.sec || !S.secs.includes(S.bk.sec)) S.bk.sec = S.secs[0];
    if (S.bk.page == null || !S.secPages[S.bk.sec].includes(S.bk.page)) S.bk.page = S.secPages[S.bk.sec][0];
    S.bk.zoom = S.bk.zoom || 1;
    const nL = S.items.filter(it => it.skill === 'L').map(it => it.num), nR = S.items.filter(it => it.skill === 'R').map(it => it.num);
    const rng = (a) => a.length ? Math.min.apply(null, a) + '–' + Math.max.apply(null, a) : '';
    app.innerHTML = '<div class="qbar"><div class="wrap"><div class="timer" id="timer"><svg width="52" height="52"><circle cx="26" cy="26" r="22" fill="none" stroke="var(--line)" stroke-width="5"/><circle id="ring" cx="26" cy="26" r="22" fill="none" stroke="var(--brand-2)" stroke-width="5" stroke-linecap="round" stroke-dasharray="138.2" stroke-dashoffset="0"/></svg><b id="tleft"></b></div>' +
      '<div><div style="font-weight:700" id="qpos"></div><div class="muted" style="font-size:.84rem">' + esc(S.hoTen) + ' · ' + esc(S.lop) + '</div></div><span class="spacer"></span><span class="pill warn hide" id="endChip"></span><span class="pill" id="vbadge"></span>' +
      (info.music && info.music.url && info.music.allowMute ? '<button class="btn sm" id="musicBtn" title="Tắt / bật nhạc nền"></button>' : '') + '<button class="btn sm primary" id="barSubmit">Nộp bài</button></div><div class="prog"><i id="progbar"></i></div></div>' +
      '<div class="wrap bkwrap">' +
      (S.secs.length > 1 ? '<div class="bktabs">' + S.secs.map(k => '<button class="bktab" data-sec="' + k + '">' + (k === 'L' ? '🎧 Listening · câu ' + rng(nL) : '📖 Reading · câu ' + rng(nR)) + '</button>').join('') + '</div>' : '') +
      '<div class="card bkaud hide" id="bkAud"></div>' +
      '<div class="bkmain"><div class="card bkview"><div class="bkbar"><button class="btn sm" id="pgPrev">◀</button><select id="pgSel"></select><button class="btn sm" id="pgNext">▶</button><span class="spacer"></span><button class="btn sm" id="zOut" title="Thu nhỏ">−</button><button class="btn sm" id="zIn" title="Phóng to">+</button></div><div class="bkimg" id="bkImg"></div></div>' +
      '<div class="card bksheet"><div class="row" style="margin-bottom:6px"><b id="shTitle">Phiếu trả lời</b><span class="spacer"></span><button class="btn sm" id="shAll">Phiếu đầy đủ</button></div><div id="bkSheet"></div><div class="bknav"><button class="btn" id="pgPrev2">← Trang trước</button><button class="btn primary" id="pgNext2">Trang sau →</button></div></div></div>' +
      '<div class="card hide" id="palCard"><div class="row" style="margin-bottom:8px"><b>Phiếu trả lời đầy đủ</b><span class="spacer"></span><span class="hint" style="margin:0"><span class="lg ans"></span> đã chọn <span class="lg"></span> chưa chọn</span></div><div class="pal bkpal" id="pal"></div></div>' +
      '<div style="max-width:860px;margin:0 auto 30px">' + QA.AUTHOR_HTML + '</div></div>';
    $('#barSubmit').onclick = confirmSubmit;
    $$('.bktab').forEach(b => b.onclick = () => switchSec(b.dataset.sec));
    $('#pgPrev').onclick = $('#pgPrev2').onclick = () => stepPage(-1);
    $('#pgNext').onclick = $('#pgNext2').onclick = () => stepPage(1);
    $('#pgSel').onchange = (e) => showPage(+e.target.value);
    $('#zIn').onclick = () => { S.bk.zoom = Math.min(3, (S.bk.zoom || 1) + 0.5); applyZoom(); saveLocal(); };
    $('#zOut').onclick = () => { S.bk.zoom = Math.max(1, (S.bk.zoom || 1) - 0.5); applyZoom(); saveLocal(); };
    $('#shAll').onclick = () => { const c = $('#palCard'); c.classList.toggle('hide'); bkPalette(); if (!c.classList.contains('hide')) c.scrollIntoView({ behavior: 'smooth' }); };
    const mb = $('#musicBtn');
    if (mb) { const paintM = () => { mb.textContent = QA.Music.muted() ? '🔇 Nhạc' : '🔊 Nhạc'; }; mb.onclick = () => { QA.Music.setMuted(!QA.Music.muted()); LS.set('musicMuted', QA.Music.muted()); if (!QA.Music.playing()) QA.Music.start(info.music.url, info.music.vol); paintM(); }; paintM(); }
    startTotalTimer();
    const end = !PREVIEW && info.window && info.window.end;
    if (end) {
      const chip = $('#endChip'); chip.classList.remove('hide');
      const t = () => { if (!running) { clearInterval(S.endH); return; } const l = (end - srvNow()) / 1000; chip.textContent = 'Kết thúc sau ' + fmtSec(Math.max(0, Math.ceil(l))); if (l <= 0) { clearInterval(S.endH); clearInterval(timerH); submit('Hết giờ làm bài'); } };
      t(); S.endH = setInterval(t, 1000);
    }
    switchSec(S.bk.sec, true);
    paintStatus();
    window.scrollTo(0, 0);
  }
  function switchSec(k, keepPage, ok) {
    if (k === 'L' && LOCKSEC() && S.bk.inR) { lockNote('Đã sang phần Đọc — không quay lại phần Nghe được.'); return; }
    if (k === 'R' && !keepPage && !ok && LOCKSEC() && !S.bk.inR && S.secs.includes('L')) {
      $('#modalBody').innerHTML = '<h2>Sang phần Đọc?</h2><p>Sau khi sang phần <b>Reading</b>, em <b>không quay lại</b> phần Listening được nữa (file nghe dừng).</p><div class="row" style="justify-content:flex-end"><button class="btn" id="mNo">Ở lại phần Nghe</button><button class="btn primary" id="mYes">Sang phần Đọc</button></div>';
      $('#modal').classList.add('on');
      $('#mNo').onclick = () => $('#modal').classList.remove('on');
      $('#mYes').onclick = () => { $('#modal').classList.remove('on'); stopBookAudio(); S.bk.apos = null; switchSec('R', false, true); window.scrollTo({ top: 0 }); };
      return;
    }
    if (k === 'R') S.bk.inR = true;
    S.bk.sec = k;
    $$('.bktab').forEach(b => { b.classList.toggle('on', b.dataset.sec === k); b.disabled = b.dataset.sec === 'L' && LOCKSEC() && !!S.bk.inR; });
    const pages = S.secPages[k];
    $('#pgSel').innerHTML = pages.map((pi, j) => '<option value="' + pi + '">Trang ' + (j + 1) + ' / ' + pages.length + pageLabel(pi) + '</option>').join('');
    paintAudio();
    showPage(keepPage && pages.includes(S.bk.page) ? S.bk.page : (S.bk['p' + k] != null && pages.includes(S.bk['p' + k]) ? S.bk['p' + k] : pages[0]));
  }
  function pageLabel(pi) {
    const ns = S.items.filter(it => it.page === pi && it.skill === S.bk.sec).map(it => it.num);
    return ns.length ? ' · câu ' + Math.min.apply(null, ns) + (ns.length > 1 ? '–' + Math.max.apply(null, ns) : '') : '';
  }
  function stepPage(d) {
    const pages = S.secPages[S.bk.sec], j = pages.indexOf(S.bk.page) + d;
    if (j >= 0 && j < pages.length) { showPage(pages[j]); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    else if (d > 0 && S.secs.indexOf(S.bk.sec) < S.secs.length - 1) { switchSec(S.secs[S.secs.indexOf(S.bk.sec) + 1]); window.scrollTo({ top: 0 }); }
    else if (d > 0) confirmSubmit();
  }
  function applyZoom() { const img = $('#bkImg img'); if (img) img.style.width = ((S.bk.zoom || 1) * 100) + '%'; }
  async function imgSrc(pg) {
    if (pg.id && IMGC[pg.id]) return IMGC[pg.id];
    return pg.src;
  }
  function loadPageImg(img, pg) {
    let step = 0;
    img.onerror = async () => {
      step++;
      if (step === 1 && pg.id) { img.src = 'https://drive.google.com/thumbnail?id=' + pg.id + '&sz=w1600'; return; }
      if (step === 2 && pg.id && !PREVIEW) {
        try { const u = await audioViaServer({ id: pg.id }); IMGC[pg.id] = u; img.src = u; return; } catch (e) { /* báo lỗi bên dưới */ }
      }
      img.onerror = null; img.alt = 'Không tải được trang đề'; img.classList.add('err');
      const box = img.parentNode; if (box && !box.querySelector('.imgerr')) { const d = document.createElement('div'); d.className = 'msg bad imgerr'; d.innerHTML = 'Không tải được trang đề (mạng yếu?). <button class="btn sm">Thử lại</button>'; d.querySelector('button').onclick = () => showPage(S.bk.page); box.appendChild(d); }
    };
    imgSrc(pg).then(u => { img.src = u; });
  }
  function showPage(pi) {
    if (!pageAllowed(S.bk.sec, pi)) { const back = S.secPages.L[S.bk.lMax]; lockNote('Không quay lại trang đã qua của phần Nghe.'); if (back == null || back === pi) return; pi = back; }
    if (S.bk.sec === 'L') { const j = lIdx(pi); if (j >= 0 && (S.bk.lMax == null || j > S.bk.lMax)) S.bk.lMax = j; }
    S.bk.page = pi; S.bk['p' + S.bk.sec] = pi;
    const B = S.B, pg = B.pages[pi];
    $('#pgSel').value = String(pi);
    const box = $('#bkImg');
    box.innerHTML = '<img alt="Trang đề" draggable="false">';
    const img = box.querySelector('img');
    loadPageImg(img, pg); applyZoom();
    // tải trước trang sau
    const pages = S.secPages[S.bk.sec], nx = pages[pages.indexOf(pi) + 1];
    if (nx != null && B.pages[nx] && B.pages[nx].src && !IMGC[B.pages[nx].id]) { const pre = new Image(); pre.src = B.pages[nx].src; }
    $('#pgPrev').disabled = $('#pgPrev2').disabled = (pages.indexOf(pi) <= 0 && (S.secs.indexOf(S.bk.sec) === 0 || (S.bk.sec === 'R' && LOCKSEC()))) || (S.bk.sec === 'L' && LOCKL() && pages.indexOf(pi) <= (S.bk.lMax || 0));
    $$('#pgSel option').forEach(o => { o.disabled = !pageAllowed(S.bk.sec, +o.value); });
    renderSheet();
    const first = S.items.findIndex(it => it.page === pi && it.skill === S.bk.sec);
    if (first >= 0) S.idx = first;
    saveLocal(); sendProgress();
  }
  function sheetRows(list) {
    return list.map(i => { const it = S.items[i], a = S.answers[i] || []; return '<div class="arow' + (a.length ? ' done' : '') + '" data-ai="' + i + '"><b>' + it.num + '</b>' + it.options.map((_, d) => '<button class="ab' + (a.includes(d) ? ' sel' : '') + '" data-i="' + i + '" data-d="' + d + '">' + LET[d] + '</button>').join('') + '</div>'; }).join('');
  }
  function renderSheet(focusI) {
    const sec = S.bk.sec, pi = S.bk.page;
    let list = S.items.map((it, i) => i).filter(i => S.items[i].skill === sec && S.items[i].page === pi);
    let html, title;
    if (list.length) { title = 'Phiếu trả lời trang này'; html = sheetRows(list); }
    else if (!S.mapped[sec]) {
      title = 'Phiếu trả lời · ' + (sec === 'L' ? 'Listening' : 'Reading');
      const all = S.items.map((it, i) => i).filter(i => S.items[i].skill === sec);
      const parts = Array.from(new Set(all.map(i => S.items[i].part)));
      html = parts.map(p => '<div class="shpart">Part ' + p + '</div>' + sheetRows(all.filter(i => S.items[i].part === p))).join('');
    } else {
      // trang chỉ có đoạn văn / hình: hiện luôn các câu hỏi in ở trang sau
      const pages = S.secPages[sec], nx = pages.slice(pages.indexOf(pi) + 1).find(p2 => S.items.some(it => it.skill === sec && it.page === p2));
      const nl = nx == null ? [] : S.items.map((it, i) => i).filter(i => S.items[i].skill === sec && S.items[i].page === nx);
      title = nl.length ? 'Câu hỏi ở trang sau' : 'Phiếu trả lời';
      html = nl.length ? '<div class="hint" style="margin:0 0 6px">Trang này là đoạn văn / hình — câu hỏi in ở trang sau, em có thể chọn đáp án ngay tại đây.</div>' + sheetRows(nl) : '<div class="msg info">Trang này không có câu hỏi — bấm <b>Trang sau →</b>.</div>';
    }
    $('#shTitle').textContent = title;
    const sh = $('#bkSheet'); sh.innerHTML = html;
    $$('.ab', sh).forEach(b => b.onclick = () => {
      const i = +b.dataset.i, d = +b.dataset.d, a = S.answers[i] || [];
      S.answers[i] = a.includes(d) ? [] : [d];
      const row = b.closest('.arow');
      $$('.ab', row).forEach(x => x.classList.toggle('sel', (S.answers[i] || []).includes(+x.dataset.d)));
      row.classList.toggle('done', !!(S.answers[i] || []).length);
      S.idx = i; saveLocal(); paintStatus();
      if (!$('#palCard').classList.contains('hide')) bkPalette();
      clearTimeout(S.progH); S.progH = setTimeout(sendProgress, 1500);
    });
    if (focusI != null) { const r = sh.querySelector('[data-ai="' + focusI + '"]'); if (r) { r.classList.add('focus'); r.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => r.classList.remove('focus'), 1800); } }
  }
  function paintStatus() {
    const n = S.items.length, c = answeredCount();
    $('#qpos').textContent = 'Đã chọn ' + c + '/' + n;
    $('#progbar').style.width = (c / n * 100) + '%';
    $('#vbadge').textContent = S.violations ? 'Vi phạm: ' + S.violations : 'Đang làm bài';
    $('#vbadge').className = 'pill ' + (S.violations ? 'bad' : 'ok');
  }
  function bkPalette() {
    const el = $('#pal'); if (!el) return;
    el.innerHTML = S.secs.map(sec => '<div class="shpart" style="grid-column:1/-1">' + (sec === 'L' ? 'Listening' : 'Reading') + '</div>' + S.items.map((it, k) => it.skill !== sec ? '' : '<button class="pb' + (isAnswered(k) ? ' ans' : '') + '" data-k="' + k + '">' + it.num + ((S.answers[k] || []).length ? '<small>' + LET[S.answers[k][0]] + '</small>' : '') + '</button>').join('')).join('');
    $$('.pb', el).forEach(b => b.onclick = () => {
      const k = +b.dataset.k, it = S.items[k];
      if (it.skill === 'L' && !pageAllowed('L', it.page)) { lockNote(LOCKSEC() && S.bk.inR ? 'Đã sang phần Đọc — không quay lại phần Nghe được.' : 'Không quay lại trang đã qua của phần Nghe.'); return; }
      if (it.skill !== S.bk.sec) switchSec(it.skill);
      if (it.page != null) showPage(it.page);
      renderSheet(k);
      $('.bkmain').scrollIntoView({ behavior: 'smooth' });
    });
  }
  /* ---- file nghe theo Part ---- */
  function audSeq() {
    const B = S.B, ks = Object.keys(B.parts || {});
    if (ks.includes('all')) return ['all'];
    const have = new Set(S.items.filter(it => it.skill === 'L').map(it => String(it.part)));
    return ['1', '2', '3', '4'].filter(k => have.has(k) && B.parts[k]).concat(['1', '2', '3', '4'].filter(k => have.has(k) && !B.parts[k]).map(k => '!' + k));
  }
  function paintAudio() {
    const box = $('#bkAud');
    if (S.bk.sec !== 'L' || !S.secs.includes('L')) { box.classList.add('hide'); return; }
    box.classList.remove('hide');
    const P = +info.audioPlays || 0, seq = audSeq();
    const used = (k) => S.plays['P' + k] || 0;
    const ap = S.bk.apos;
    const playing = BA.el && !BA.el.paused;
    const anyPlayed = seq.some(k => used(k) > 0);
    let main = '';
    if (playing) main = '<button class="btn" id="aMain" ' + (P === 0 ? '' : 'disabled') + '>' + (P === 0 ? '⏸ Tạm dừng' : '♪ Đang phát…') + '</button>';
    else if (ap && ap.k && seq.includes(ap.k) && ap.t > 2) main = '<button class="btn primary" id="aMain" data-resume="1">▶ Nghe tiếp ' + (ap.k === 'all' ? '' : 'Part ' + ap.k + ' ') + 'từ ' + fmtSec(ap.t) + '</button>';
    else { const nk = seq.find(k => k[0] !== '!' && (P === 0 || used(k) < P) && !(P === 1 && used(k) > 0)); main = nk ? '<button class="btn primary" id="aMain" data-k="' + nk + '">▶ ' + (anyPlayed ? 'Nghe ' + (nk === 'all' ? 'lại' : 'Part ' + nk) : 'Bắt đầu phần nghe' + (seq.length > 1 ? ' (Part 1 → ' + seq[seq.length - 1].replace('!', '') + ')' : '')) + '</button>' : '<span class="pill ok">Đã nghe xong</span>'; }
    box.innerHTML = '<div class="row"><b>🎧 Phần nghe</b><span class="hint" style="margin:0">' + (P === 1 ? 'Mỗi Part chỉ phát 1 lần, tự chuyển Part — như thi thật.' : P ? 'Mỗi Part nghe tối đa ' + P + ' lần.' : 'Luyện nghe: nghe lại không giới hạn.') + '</span><span class="spacer"></span>' + main + '</div>' +
      '<div class="aparts">' + seq.map(k => {
        if (k[0] === '!') return '<div class="apart miss">Part ' + k.slice(1) + ' <span class="pill bad">thiếu file nghe</span></div>';
        const cur = BA.k === k, u = used(k), left = P ? Math.max(0, P - u) : Infinity;
        const can = !cur && !(P === 1) && (left > 0) && !playing;
        return '<div class="apart' + (cur ? ' cur' : '') + (u && !cur ? ' done' : '') + '"><span>' + (k === 'all' ? 'Toàn bộ' : 'Part ' + k) + '</span><div class="abar"><i id="abar_' + k + '"' + (u && !cur ? ' style="width:100%"' : '') + '></i></div><span class="hint" id="at_' + k + '">' + (cur ? '' : u ? '✓ đã nghe' + (P > 1 ? ' (' + u + '/' + P + ')' : '') : 'chưa nghe') + '</span>' + (can && u ? '<button class="btn sm" data-replay="' + k + '">↻</button>' : '') + '</div>';
      }).join('') + '</div><div class="hint" id="aMsg"></div>';
    const m = $('#aMain');
    if (m) m.onclick = () => {
      if (BA.el && !BA.el.paused) { if (P === 0) { BA.el.pause(); paintAudio(); } return; }
      if (BA.el && BA.el.paused && P === 0 && BA.k) { BA.el.play(); paintAudio(); return; }
      if (m.dataset.resume) playPart(ap.k, ap.t); else if (m.dataset.k) playPart(m.dataset.k, 0);
    };
    $$('[data-replay]', box).forEach(b => b.onclick = () => playPart(b.dataset.replay, 0));
  }
  async function playPart(k, from) {
    const ref = S.B.parts[k];
    const msgEl = () => $('#aMsg');
    if (!ref || ref.missing) { if (msgEl()) msgEl().textContent = 'Thiếu file nghe ' + (k === 'all' ? '' : 'Part ' + k) + ' — báo giáo viên.'; return; }
    stopBookAudio();
    const P = +info.audioPlays || 0;
    const resume = from > 0;
    if (!resume) S.plays['P' + k] = (S.plays['P' + k] || 0) + 1;
    S.bk.apos = { k, t: from || 0 };
    saveLocal();
    const el = new Audio(); BA.el = el; BA.k = k; el.preload = 'auto';
    let triedServer = false, seeked = !resume;
    const seek = () => { if (!seeked && el.duration && from < el.duration - 1) { el.currentTime = from; seeked = true; } };
    el.onloadedmetadata = seek;
    el.ontimeupdate = () => {
      if (BA.el !== el) return;
      seek();
      const bar = document.getElementById('abar_' + k), t = document.getElementById('at_' + k);
      if (el.duration && bar) bar.style.width = (el.currentTime / el.duration * 100) + '%';
      if (t) t.textContent = fmtSec(el.currentTime) + ' / ' + (el.duration ? fmtSec(el.duration) : '…');
      S.bk.apos = { k, t: el.currentTime };
      autoTurn(k, el.currentTime);
      if (Date.now() - BA.lastSave > 3000) { BA.lastSave = Date.now(); saveLocal(); }
    };
    el.onended = () => {
      if (BA.el !== el) return;
      BA.el = null; BA.k = null; S.bk.apos = null; saveLocal();
      const seq = audSeq(), nk = seq[seq.indexOf(k) + 1];
      if (nk && nk[0] !== '!' && !(S.plays['P' + nk] > 0) && running) playPart(nk, 0); else paintAudio();
    };
    el.onerror = async () => {
      if (BA.el !== el) return;
      if (!triedServer && ref.id && !PREVIEW) {
        triedServer = true; if (msgEl()) msgEl().textContent = 'Đang tải file nghe ' + (k === 'all' ? '' : 'Part ' + k) + '… (lần đầu có thể mất vài chục giây)';
        try { el.src = await audioViaServer(ref); seeked = !resume; await el.play(); if (msgEl()) msgEl().textContent = ''; paintAudio(); return; } catch (e) { /* báo lỗi */ }
      }
      if (!resume) S.plays['P' + k] = Math.max(0, (S.plays['P' + k] || 1) - 1);
      BA.el = null; BA.k = null; saveLocal(); paintAudio();
      if (msgEl()) msgEl().textContent = 'Không phát được file nghe — kiểm tra mạng rồi bấm ▶ lại.';
    };
    el.src = AUD.cache[ref.id] || ref.src;
    // chuyển tới trang đầu của Part đang nghe
    // học sinh đang ở trang của Part trước => tự lật tới trang đầu của Part đang nghe (đang xem trước câu hỏi thì giữ nguyên)
    if (S.bk.sec === 'L' && k !== 'all' && AUTOPG()) {
      const it = S.items.find(x => x.skill === 'L' && String(x.part) === k && x.page != null);
      const onPg = S.items.filter(x => x.skill === 'L' && x.page === S.bk.page).map(x => +x.part);
      if (it && it.page !== S.bk.page && (!onPg.length || Math.max.apply(null, onPg) < +k)) showPage(it.page);
    }
    paintAudio();
    try { await el.play(); paintAudio(); }
    catch (e) {
      if (e && e.name === 'NotAllowedError') { if (!resume) S.plays['P' + k] = Math.max(0, (S.plays['P' + k] || 1) - 1); S.bk.apos = resume ? { k, t: from } : null; BA.el = null; BA.k = null; saveLocal(); paintAudio(); if (msgEl()) msgEl().textContent = 'Bấm ▶ để nghe.'; }
    }
    void P;
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
      $('#tleft').classList.toggle('long', $('#tleft').textContent.length > 5);
      $('#ring').style.strokeDashoffset = String(138.2 * (1 - Math.max(0, Math.min(1, l / span))));
      const low = l <= Math.min(120, span * 0.1);
      $('#timer').classList.toggle('low', low); $('#ring').style.stroke = low ? 'var(--bad)' : 'var(--brand-2)';
      if (l <= 0) { clearInterval(h); submit('Hết giờ làm bài'); }
    };
    h = setInterval(tick, 500); timerH = h; tick();
  }
  function confirmSubmit() {
    const un = [], fl = [];
    S.items.forEach((it, k) => { if (!isAnswered(k)) un.push(it.num || k + 1); if (S.flags && S.flags[k]) fl.push(it.num || k + 1); });
    const unanswered = un.length;
    $('#modalBody').innerHTML = '<h2>Nộp bài?</h2><p>' + (unanswered ? 'Em còn <b>' + unanswered + '</b> câu chưa trả lời' + (FREE() || S.book ? ' (câu ' + un.slice(0, 30).join(', ') + (un.length > 30 ? '…' : '') + ')' : '') + '. ' : 'Em đã trả lời tất cả các câu. ') + (FREE() && fl.length ? 'Câu đánh dấu xem lại: <b>' + fl.join(', ') + '</b>. ' : '') + 'Sau khi nộp sẽ không sửa được nữa.</p><div class="row" style="justify-content:flex-end"><button class="btn" id="mNo">Chưa nộp</button><button class="btn primary" id="mYes">Nộp bài</button></div>';
    $('#modal').classList.add('on');
    $('#mNo').onclick = () => $('#modal').classList.remove('on');
    $('#mYes').onclick = () => { $('#modal').classList.remove('on'); submit(''); };
  }

  /* -------------------------------- nộp bài -------------------------------- */
  let submitting = false;
  async function submit(reason) {
    if (submitting) return; submitting = true;
    clearInterval(timerH); running = false;
    stopAudio(); stopRec(); stopBookAudio();
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
    exitFull(); QA.Music.stop(); stopAudio(); stopBookAudio();
    document.body.classList.remove('bookmode');
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
      else if (!PREVIEW && r.score != null && info.reLow && +r.score < info.reLow && r.maxAttempts) h += '<div class="msg warn" style="margin-top:8px;text-align:left">Điểm của em dưới ' + String(info.reLow).replace('.', ',') + '. Nếu giáo viên cho <b>làm thêm 1 lần</b>, em mở lại đúng link đề này để làm bài mới.</div>';
    }
    h += '</div>';
    if (r.review && S.book) {
      const rv = PREVIEW ? r.review.details.map(d => { const q = previewExam.banks[d.b].questions[d.q]; return { num: q.num, chosen: d.chosen, correct: d.correct, ok: d.ok, n: q.options.length }; })
        : r.review.map((d, i) => ({ num: d.num || (S.items[i] && S.items[i].num) || i + 1, chosen: d.chosen || [], correct: d.correct || [], ok: d.ok, n: (d.options || []).length || 4 }));
      h += '<div class="card review" style="text-align:left"><h2>' + (PREVIEW ? 'Đáp án (chỉ hiện ở chế độ xem thử)' : 'Xem lại bài làm &amp; đáp án') + '</h2><p class="hint">Xanh = đáp án đúng; đỏ = em chọn sai.</p><div class="revgrid">' +
        rv.map(d => '<div class="rv ' + (d.ok ? 'ok' : d.chosen.length ? 'bad' : 'skip') + '"><b>' + d.num + '</b>' + Array.from({ length: d.n }, (_, oi) => '<span class="' + (d.correct.includes(oi) ? 'c' : d.chosen.includes(oi) ? 'x' : '') + '">' + LET[oi] + '</span>').join('') + '</div>').join('') + '</div></div>';
      r = Object.assign({}, r, { review: null });
    }
    if (!PREVIEW && r.review) {
      h += '<div class="card review" style="text-align:left"><h2>Xem lại bài làm &amp; đáp án</h2>' + r.review.map((d, i) => '<div class="qprev"><b>Câu ' + (i + 1) + '</b> ' +
        (d.type === 'fill' ? '<span class="pill ' + (d.ok ? 'ok' : 'bad') + '">' + (d.ok ? 'Đúng' : 'Chưa đúng hết') + '</span><div>' + fillHtml(d.stem, d.given, d.oks, d.blanks) + '</div>' :
        d.type === 'mc' ? '<span class="pill ' + (d.ok ? 'ok' : 'bad') + '">' + (d.ok ? 'Đúng' : 'Sai') + '</span><div>' + d.stem + '</div>' +
          d.options.map((o, oi) => '<div class="opt' + (d.correct.includes(oi) ? ' ok' : d.chosen.includes(oi) ? ' badc' : '') + '">' + LET[oi] + ') ' + o + (d.correct.includes(oi) ? ' ✓' : '') + (d.chosen.includes(oi) ? ' ← em chọn' : '') + '</div>').join('')
          : '<span class="pill">Tự luận</span><div>' + d.stem + '</div><div class="msg info" style="white-space:pre-wrap">' + (esc(d.text) || '<i>(bỏ trống)</i>') + '</div>' + (d.answer ? '<div class="hint"><b>Đáp án gợi ý:</b> ' + d.answer + '</div>' : '')) + '</div>').join('') + '</div>';
    }
    if (PREVIEW && r.review && !S.book) {
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
