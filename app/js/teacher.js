/* teacher.js — Trang giáo viên. Phần mềm: Lê Duy Nam — GV Trường CĐ Dầu khí */
(function () {
  'use strict';
  const { $, $$, esc, LS, IDB, api, toast, fmtTime, fmtDur, buildXlsx, download, linkParamForApi } = QA;
  const L = 'ABCDEFGH';
  // Trang "Đề Tiếng Anh" dùng chung mã này với QUIZ_MODE = 'en' (ngân hàng & cấu hình lưu riêng)
  const EN = window.QUIZ_MODE === 'en';
  const K = { draft: EN ? 'draftEN' : 'draft', banks: EN ? 'banksEN' : 'banks', tab: EN ? 'tabEN' : 'tab' };
  const SKN = { L: 'Nghe', R: 'Đọc', W: 'Viết', S: 'Nói' };
  const TYPEN = { mc: 'Trắc nghiệm', fill: 'Điền khuyết', essay: 'Tự luận', speak: 'Nói (ghi âm)' };
  $('#authorBox').innerHTML = QA.AUTHOR_HTML;

  /* ------------------------------- tabs ------------------------------- */
  function showTab(name) {
    $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === name));
    $$('.section').forEach(s => s.classList.toggle('on', s.id === 'sec-' + name));
    if (name === 'build') renderGroups();
    if (name === 'results') loadExams();
    LS.set(K.tab, name);
  }
  $$('.tab').forEach(t => t.onclick = () => showTab(t.dataset.tab));

  /* ------------------------------ settings ------------------------------ */
  const conf = () => ({ api: LS.get('apiUrl', '') || window.QUIZ_API || '', key: LS.get('teacherKey', '') });
  $('#c_api').value = conf().api; $('#c_key').value = conf().key;
  $('#btnConn').onclick = async () => {
    LS.set('apiUrl', $('#c_api').value.trim()); LS.set('teacherKey', $('#c_key').value);
    $('#connMsg').innerHTML = '<span class="muted">Đang kiểm tra…</span>';
    try {
      const r = await api(conf().api, { action: 'ping', key: conf().key });
      const sv = String(r.version || ''), wv = String(QuizCore.version || '');
      const old = sv && wv && sv.split('.').map(Number).reduce((a, x, i) => a || ((x || 0) !== (+wv.split('.')[i] || 0) ? ((x || 0) < (+wv.split('.')[i] || 0) ? -1 : 1) : 0), 0) < 0;
      $('#connMsg').innerHTML = (r.teacher ? '<span class="pill ok">Kết nối tốt — mật khẩu đúng</span>' : '<span class="pill bad">Kết nối được nhưng SAI mật khẩu</span>') + ' <span class="pill">Máy chủ bản ' + esc(sv || '?') + '</span>' +
        (old ? '<div class="msg warn" style="margin-top:8px">Máy chủ (Code.gs) đang là bản <b>' + esc(sv) + '</b>, phần mềm là bản <b>' + esc(wv) + '</b>. Hãy dán mã Code.gs mới (xem <a href="huong-dan.html">Hướng dẫn</a>) → Triển khai → Quản lý → ✎ → <b>Phiên bản mới</b>, nếu không một số tính năng mới sẽ không chạy.</div>' : '');
    } catch (e) { $('#connMsg').innerHTML = '<span class="pill bad">' + esc(e.message) + '</span>'; }
  };
  function needConn() {
    if (!conf().api || !conf().key) { toast('Hãy vào “Cài đặt máy chủ” nhập địa chỉ Web App và mật khẩu trước', 'bad'); showTab('setup'); return false; }
    return true;
  }

  /* ------------------------------- banks ------------------------------- */
  let banks = [];
  async function loadBanks() { banks = (await IDB.get(K.banks)) || LS.get(K.banks, []) || []; renderBanks(); }
  async function saveBanks() { const ok = await IDB.set(K.banks, banks); if (!ok) LS.set(K.banks, banks); renderBanks(); }
  /** Các file nghe đề cần (tên file ghi trong [AUDIO: …]) */
  function audioNeeds(b) {
    const m = new Map();
    const add = (ref, where) => { if (!ref || /^https?:/i.test(ref)) return; if (!m.has(ref)) m.set(ref, []); m.get(ref).push(where); };
    (b.groups || []).forEach((g, gi) => add(g && g.audio, (g && g.title) || ('Đoạn ' + (gi + 1))));
    b.questions.forEach((q, i) => add(q.audio, 'Câu ' + (i + 1)));
    if (b.book && window.QuizBook) QuizBook.audioNeeds(b, add);
    return m;
  }
  const hasAud = (b, name) => !!(b.audio && b.audio[name] && (b.audio[name].id || b.audio[name].link));
  function bankStats(b) {
    const mc = b.questions.filter(q => q.type === 'mc').length, fi = b.questions.filter(q => q.type === 'fill').length, es = b.questions.length - mc - fi;
    const usable = b.questions.filter(q => QuizCore.usable(q)).length;
    const sk = { L: 0, R: 0, W: 0, S: 0, none: 0 };
    b.questions.forEach(q => { if (!q.disabled && QuizCore.usable(q)) sk[q.skill || 'none']++; });
    const needs = audioNeeds(b); let have = 0; needs.forEach((_, k) => { if (hasAud(b, k)) have++; });
    const warn = b.questions.filter(q => q.warn && !q.disabled && !(/file nghe/.test(q.warn) && (hasAud(b, q.audio) || (q.g != null && b.groups && b.groups[q.g] && hasAud(b, b.groups[q.g].audio))))).length;
    return { mc, fi, es, usable, warn, sk, audNeed: needs.size, audHave: have };
  }
  function renderBanks() {
    const el = $('#bankList');
    if (!banks.length) { el.innerHTML = '<div class="msg info">Chưa có ngân hàng nào. Nạp file .docx ở trên.</div>'; $('#bankTotal').textContent = ''; return; }
    let total = 0;
    el.innerHTML = banks.map((b, i) => {
      const s = bankStats(b); total += s.usable;
      const bookPill = b.book ? '<span class="pill accent">Đề nguyên bộ · ' + b.book.pages.length + ' trang</span>' : '';
      return '<div class="bank"><div class="nm"><input type="text" data-rename="' + i + '" value="' + esc(b.name) + '"><div class="hint">' + esc(b.file || '') + ' · ' + fmtTime(b.addedAt) + '</div></div>' +
        bookPill + (EN ? ['L', 'R', 'W', 'S'].filter(k => s.sk[k]).map(k => '<span class="pill">' + SKN[k] + ' ' + s.sk[k] + '</span>').join('') + (s.sk.none ? '<span class="pill">Chưa rõ kỹ năng ' + s.sk.none + '</span>' : '') +
          (s.audNeed ? '<span class="pill ' + (s.audHave < s.audNeed ? 'bad' : 'ok') + '">File nghe ' + s.audHave + '/' + s.audNeed + '</span>' : '')
        : '<span class="pill">' + s.mc + ' trắc nghiệm</span>' + (s.fi ? '<span class="pill">' + s.fi + ' điền khuyết</span>' : '') + (s.es ? '<span class="pill">' + s.es + ' tự luận</span>' : '')) +
        (s.warn ? '<span class="pill warn">' + s.warn + ' câu cần kiểm tra</span>' : '<span class="pill ok">Hợp lệ</span>') +
        '<button class="btn sm" data-view="' + i + '">Xem / sửa</button><button class="btn sm danger" data-del="' + i + '">Xóa</button></div>';
    }).join('');
    $('#bankTotal').textContent = banks.length + ' ngân hàng · ' + total + ' câu dùng được';
    $$('[data-rename]', el).forEach(inp => inp.onchange = () => { banks[+inp.dataset.rename].name = inp.value.trim() || 'Ngân hàng'; saveBanks(); });
    $$('[data-view]', el).forEach(b => b.onclick = () => viewBank(+b.dataset.view));
    $$('[data-del]', el).forEach(b => b.onclick = () => {
      const i = +b.dataset.del;
      if (!confirm('Xóa ngân hàng "' + banks[i].name + '"?')) return;
      banks.splice(i, 1);
      saveBanks();
    });
  }
  async function handleFiles(files) {
    const msg = $('#parseMsg'); msg.innerHTML = '';
    for (const f of files) {
      if (!/\.docx$/i.test(f.name)) { msg.innerHTML += '<div class="msg bad">' + esc(f.name) + ': chỉ nhận file .docx (nếu là .doc, hãy mở bằng Word rồi Lưu thành .docx).</div>'; continue; }
      try {
        const r = await QuizDocx.parseDocx(await f.arrayBuffer(), f.name, { english: EN });
        if (!r.questions.length) { msg.innerHTML += '<div class="msg bad">' + esc(f.name) + ': không nhận ra câu hỏi nào. Kiểm tra định dạng “Câu 1:” hoặc bảng “1. | câu hỏi”.</div>'; continue; }
        const b = { id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: r.name, file: f.name, addedAt: Date.now(), questions: r.questions, groups: r.groups || [], audio: {} };
        banks.push(b);
        const s = bankStats(b);
        msg.innerHTML += '<div class="msg ' + (s.warn ? 'warn' : 'ok') + '">' + esc(f.name) + ': nhận ' + r.questions.length + ' câu (' + (EN ? ['L', 'R', 'W', 'S'].map(k => SKN[k] + ' ' + s.sk[k]).join(', ') + (s.sk.none ? ', chưa rõ kỹ năng ' + s.sk.none : '') + (r.groups && r.groups.length ? '; ' + r.groups.length + ' đoạn dùng chung' : '') : s.mc + ' trắc nghiệm, ' + s.fi + ' điền khuyết, ' + s.es + ' tự luận') + ')' + (EN && s.audNeed ? ' — cần tải ' + s.audNeed + ' file nghe (bấm “Xem / sửa” → File nghe)' : '') + (s.warn ? ' — ' + s.warn + ' câu cần kiểm tra (bấm “Xem / sửa”)' : '') + '.' + r.warnings.map(w => '<br>⚠ ' + esc(w)).join('') + '</div>';
      } catch (e) { msg.innerHTML += '<div class="msg bad">' + esc(f.name) + ': ' + esc(e.message) + '</div>'; }
    }
    await saveBanks();
  }
  $('#fileIn').onchange = (e) => { handleFiles(Array.from(e.target.files)); e.target.value = ''; };
  const drop = $('#drop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); handleFiles(Array.from(e.dataTransfer.files)); });

  function modal(html) { $('#modalBody').innerHTML = html; $('#modal').classList.add('on'); }
  function closeModal() { $('#modal').classList.remove('on'); }
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

  function viewBank(bi) {
    const b = banks[bi];
    if (b.book && window.QuizBook) return QuizBook.view(b, bookCtx);
    const render = () => {
      modal('<div class="row"><h2 style="margin:0">' + esc(b.name) + '</h2><span class="spacer"></span><button class="btn sm" id="mClose">Đóng</button></div>' +
        '<p class="hint">Bấm vào một phương án để đặt/bỏ đáp án đúng. Ô “giây” và “điểm” để trống = dùng theo nhóm. Bỏ chọn “Dùng” để loại câu khỏi đề.</p>' +
        audioPanel(b) +
        b.questions.map((q, qi) => {
          const bad = q.type === 'mc' && !(q.correct && q.correct.length);
          const gr = q.g != null && b.groups ? b.groups[q.g] : null;
          const gHead = gr && (qi === 0 || b.questions[qi - 1].g !== q.g) ? '<div class="gprev"><b>' + esc(gr.title || 'Đoạn dùng chung') + '</b>' + (gr.skill ? ' <span class="pill">' + SKN[gr.skill] + '</span>' : '') + (gr.audio ? ' ' + audChip(b, gr.audio) : '') + (gr.stem ? '<div class="gstem">' + gr.stem + '</div>' : '') + '</div>' : '';
          return gHead + '<div class="qprev' + (gr ? ' ing' : '') + (q.disabled ? ' off' : '') + (bad ? ' bad' : '') + '"><div class="head"><b>Câu ' + (qi + 1) + '</b>' +
            (q.skill ? '<span class="pill">' + SKN[q.skill] + '</span>' : '') +
            '<span class="pill">' + (TYPEN[q.type] || q.type) + (q.type === 'speak' ? ' ≤' + (q.rec || 60) + 's' : '') + '</span>' + (q.audio ? audChip(b, q.audio) : '') + (q.warn ? '<span class="pill warn">' + esc(q.warn) + '</span>' : '') +
            '<span class="spacer"></span><label class="check"><input type="checkbox" data-use="' + qi + '"' + (q.disabled ? '' : ' checked') + '> Dùng</label>' +
            '<input type="number" class="mini" min="0" placeholder="giây" title="Thời gian riêng cho câu này (giây)" data-sec="' + qi + '" value="' + (q.sec != null ? q.sec : '') + '">' +
            '<input type="number" class="mini" min="0" step="0.25" placeholder="điểm" title="Điểm riêng cho câu này" data-pts="' + qi + '" value="' + (q.pts != null ? q.pts : '') + '"></div>' +
            '<div>' + (q.type === 'fill' ? q.stem.replace(/<span class="blank" data-b="(\d+)">[^<]*<\/span>/g, (m, k) => '<span class="blank">(' + (+k + 1) + ')</span>') : q.stem) + '</div>' +
            (q.type === 'fill' ? '<div class="hint" style="margin-top:6px">Đáp án chấp nhận (nhiều đáp án ngăn cách bằng dấu /):</div>' + q.blanks.map((alts, k) => '<div class="row" style="margin:3px 0"><b>(' + (k + 1) + ')</b><input type="text" data-fq="' + qi + '" data-fk="' + k + '" value="' + esc(alts.join(alts.some(x => x.indexOf('/') >= 0) ? ' | ' : ' / ')) + '" style="max-width:420px"></div>').join('') :
            q.type === 'mc' ? q.options.map((o, oi) => '<div class="opt' + (q.correct.includes(oi) ? ' ok' : '') + '" data-q="' + qi + '" data-o="' + oi + '">' + L[oi] + ') ' + o + (q.correct.includes(oi) ? ' ✓' : '') + (q.pin && q.pin[oi] ? ' <span class="pill" title="Phương án này giữ nguyên vị trí khi trộn">giữ vị trí</span>' : '') + '</div>').join('')
              : (q.answer ? '<div class="hint"><b>Đáp án gợi ý:</b> ' + q.answer + '</div>' : '')) + '</div>';
        }).join(''));
      $('#mClose').onclick = () => { closeModal(); saveBanks(); };
      bindAudioPanel(b, render);
      $$('.opt[data-q]').forEach(el => el.onclick = () => {
        const q = b.questions[+el.dataset.q], o = +el.dataset.o;
        const i = q.correct.indexOf(o); if (i >= 0) q.correct.splice(i, 1); else q.correct.push(o);
        q.correct.sort();
        q.warn = q.correct.length ? '' : 'Chưa xác định được đáp án đúng';
        render();
      });
      $$('[data-fq]').forEach(el => el.onchange = () => {
        const q = b.questions[+el.dataset.fq];
        const v = el.value; q.blanks[+el.dataset.fk] = (v.indexOf('|') >= 0 ? v.split('|') : v.split('/')).map(x => x.trim()).filter(Boolean);
        q.warn = QuizCore.usable(q) ? '' : 'Chỗ trống chưa có đáp án';
      });
      $$('[data-use]').forEach(el => el.onchange = () => { b.questions[+el.dataset.use].disabled = !el.checked; render(); });
      $$('[data-sec]').forEach(el => el.onchange = () => { const v = el.value.trim(); b.questions[+el.dataset.sec].sec = v === '' ? null : +v; });
      $$('[data-pts]').forEach(el => el.onchange = () => { const v = el.value.trim(); b.questions[+el.dataset.pts].pts = v === '' ? null : +v; });
    };
    render();
  }

  /* ---------------------------- file nghe (đề Tiếng Anh) ---------------------------- */
  function audChip(b, ref) {
    if (/^https?:/i.test(ref)) return '<span class="pill ok" title="' + esc(ref) + '">🎧 link</span>';
    return '<span class="pill ' + (hasAud(b, ref) ? 'ok' : 'bad') + '">🎧 ' + esc(ref) + (hasAud(b, ref) ? ' ✓' : ' — chưa tải') + '</span>';
  }
  function audioPanel(b) {
    const needs = audioNeeds(b);
    const extra = Object.keys(b.audio || {}).filter(k => !needs.has(k));
    if (!needs.size && !extra.length) return '';
    const rows = Array.from(needs.keys()).concat(extra).map(k => {
      const a = (b.audio || {})[k];
      return '<tr><td><b>' + esc(k) + '</b><div class="hint">' + esc((needs.get(k) || ['(không dùng trong đề)']).join(', ')) + '</div></td>' +
        '<td>' + (a && a.id ? '<span class="pill ok">✓ Đã tải' + (a.size ? ' · ' + (a.size / 1048576).toFixed(1) + ' MB' : '') + '</span>' : a && a.link ? '<span class="pill ok">✓ Link</span>' : '<span class="pill bad">Chưa có</span>') + '</td>' +
        '<td><input type="url" data-alink="' + esc(k) + '" placeholder="hoặc dán link Google Drive / mp3" value="' + esc(a && a.link || '') + '"></td></tr>';
    }).join('');
    return '<div class="audpanel"><div class="row"><h3 style="margin:0">🎧 File nghe</h3><span class="spacer"></span><label class="btn sm primary" for="audIn">Tải file nghe lên (chọn nhiều file)</label><input type="file" id="audIn" class="hide" multiple accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac"></div>' +
      '<div class="hint">File được lưu vào Google Drive của thầy/cô (thư mục <b>TronDeThi_FileNghe</b>), tự ghép theo tên file ghi trong <code>[AUDIO: …]</code>. Mỗi file tối đa 30 MB. Tải xong nhớ <b>Lưu đề lên máy chủ</b> lại nếu đề đã tạo trước đó.</div>' +
      '<div id="audMsg"></div><table class="tbl" style="margin-top:6px"><tr><th>Tên file trong đề</th><th>Trạng thái</th><th>Link thay thế</th></tr>' + rows + '</table></div>';
  }
  function fileB64(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(f); }); }
  function bindAudioPanel(b, rerender) {
    b.audio = b.audio || {};
    $$('[data-alink]').forEach(inp => inp.onchange = () => {
      const k = inp.dataset.alink, v = inp.value.trim();
      if (v) b.audio[k] = { link: v }; else if (b.audio[k] && b.audio[k].link) delete b.audio[k];
      saveBanks(); rerender();
    });
    const inp = $('#audIn'); if (!inp) return;
    inp.onchange = async () => {
      const files = Array.from(inp.files); inp.value = '';
      if (!files.length) return;
      if (!needConn()) return;
      const needs = Array.from(audioNeeds(b).keys());
      const base = (n) => n.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[\s_-]+/g, '');
      for (const f of files) {
        const box = $('#audMsg');
        if (f.size > 30 * 1048576) { box.innerHTML += '<div class="msg bad">' + esc(f.name) + ': quá 30 MB — hãy nén lại (mp3 64–96 kbps) rồi tải.</div>'; continue; }
        const key = needs.find(k => k.toLowerCase() === f.name.toLowerCase()) || needs.find(k => base(k) === base(f.name)) || f.name;
        box.innerHTML += '<div class="msg info" id="up_' + base(f.name) + '">Đang tải ' + esc(f.name) + '…</div>';
        try {
          const r = await api(conf().api, { action: 'uploadAudio', key: conf().key, name: f.name, mime: f.type || 'audio/mpeg', b64: await fileB64(f) }, 1);
          b.audio[key] = { id: r.id, name: f.name, size: f.size };
          await saveBanks();
          const el = document.getElementById('up_' + base(f.name)); if (el) { el.className = 'msg ok'; el.textContent = '✓ ' + f.name + (key !== f.name ? ' → ' + key : '') + (r.shared === false ? ' (chưa chia sẻ được — kiểm tra quyền Drive)' : ''); }
        } catch (e) {
          const el = document.getElementById('up_' + base(f.name)); if (el) { el.className = 'msg bad'; el.textContent = f.name + ': ' + e.message; }
        }
      }
      setTimeout(rerender, 900);
    };
  }

  /* ------------------------------- exam draft ------------------------------- */
  const INFO_FIELDS = ['loai', 'loaiKhac', 'hinhThuc', 'mon', 'noiDung', 'lop', 'khoa', 'lan', 'ngay', 'gv', 'title'];
  const newDraft = (gv) => EN
    ? { id: null, info: { gv: gv || 'Lê Duy Nam', loai: 'Kiểm tra Tiếng Anh', hinhThuc: 'Môn học', mon: 'Tiếng Anh' }, groups: [], settings: { navMode: 'free', freeTime: 'total', order: 'group', audioPlays: 1, sec: 60 } }
    : { id: null, info: { gv: gv || 'Lê Duy Nam', loai: 'Kiểm tra thường xuyên', hinhThuc: 'Mô đun' }, groups: [], settings: {} };
  let draft = LS.get(K.draft, null) || newDraft();
  function fillForm() {
    INFO_FIELDS.forEach(k => { const el = $('#i_' + k); if (el) el.value = draft.info[k] || ''; });
    if (!$('#i_loai').value) $('#i_loai').value = EN ? 'Kiểm tra Tiếng Anh' : 'Kiểm tra thường xuyên';
    if (!$('#i_hinhThuc').value) $('#i_hinhThuc').value = 'Mô đun';
    $('#i_loaiKhac').classList.toggle('hide', $('#i_loai').value !== '__other');
    const s = draft.settings || {};
    $('#s_sec').value = s.sec != null ? s.sec : 60; $('#s_order').value = s.order || 'mix'; $('#s_scale').value = s.scale || 10;
    $('#s_round').value = String(s.round || 0.1); $('#s_maxV').value = s.maxViolations != null ? s.maxViolations : 3;
    $('#s_from').value = s.openFrom || ''; $('#s_to').value = s.openTo || ''; $('#s_end').value = s.endAt || '';
    const ma = QuizCore.maxAttempts(s);
    $('#s_unlim').checked = ma === 0; $('#s_maxA').value = ma || (s.maxAttempts > 0 ? s.maxAttempts : 1); $('#s_maxA').disabled = ma === 0;
    $('#s_policy').value = s.scorePolicy || 'max'; $('#s_review').checked = !!s.showReview; $('#s_requireApp').checked = !!s.requireApp;
    if ($('#s_plays')) $('#s_plays').value = String(s.audioPlays != null && s.audioPlays !== '' ? s.audioPlays : 1);
    if ($('#s_toeic')) $('#s_toeic').checked = !!s.toeic;
    if ($('#s_bkAuto')) { $('#s_bkAuto').checked = s.bkAuto !== false; $('#s_bkLockL').checked = !!s.bkLockL; $('#s_bkLockSec').checked = !!s.bkLockSec; }
    $('#s_nav').value = s.navMode === 'free' ? 'free' : 'strict'; $('#s_ftime').value = s.freeTime === 'total' ? 'total' : 'none'; $('#s_tmin').value = s.totalMin || '';
    navUI();
    $('#s_shuffleOpts').checked = s.shuffleOpts !== false; $('#s_same').checked = !!s.sameForAll; $('#s_showScore').checked = s.showScore !== false;
    $('#s_full').checked = s.fullscreen !== false; $('#s_mssv').checked = !!s.requireMssv;
    $('#s_roster').value = (s.roster || []).join('\n'); $('#s_note').value = s.note || '';
    const mu = s.music || {};
    $('#s_music').value = mu.url || ''; $('#s_musicVol').value = mu.vol || 35; $('#musicVolTxt').textContent = ($('#s_musicVol').value) + '%'; $('#s_musicMute').checked = mu.allowMute !== false;
    $('#editingPill').textContent = draft.id ? 'Đang sửa đề ' + draft.id : 'Đề mới';
    winSummary();
  }
  /* ---- nhạc nền: nghe thử ---- */
  $('#s_music').addEventListener('input', () => { $('#musicMsg').innerHTML = ''; if (QA.Music.playing()) { QA.Music.stop(); $('#musicTest').textContent = '▶ Nghe thử'; } });
  $('#s_musicVol').addEventListener('input', () => { $('#musicVolTxt').textContent = $('#s_musicVol').value + '%'; QA.Music.setVol(+$('#s_musicVol').value); });
  $('#musicTest').onclick = async () => {
    if (QA.Music.playing()) { QA.Music.stop(); $('#musicTest').textContent = '▶ Nghe thử'; return; }
    const u = $('#s_music').value.trim(); if (!u) return toast('Hãy dán link nhạc trước', 'bad');
    $('#musicMsg').innerHTML = '<div class="msg info">Đang mở nhạc…</div>';
    const ok = await QA.Music.start(u, +$('#s_musicVol').value, (err) => { $('#musicMsg').innerHTML = '<div class="msg bad">' + esc(err) + '</div>'; $('#musicTest').textContent = '▶ Nghe thử'; });
    if (ok) { $('#musicTest').textContent = '■ Dừng'; $('#musicMsg').innerHTML = '<div class="msg ok">' + (QA.Music.kind(u) === 'yt' ? 'Đang phát nhạc YouTube — nếu không nghe thấy sau vài giây, video có thể bị chặn nhúng.' : 'Đang phát — link nhạc dùng được.') + '</div>'; }
  };
  function navUI() {
    const free = $('#s_nav').value === 'free', total = $('#s_ftime').value === 'total';
    $$('.freeOnly').forEach(e => e.classList.toggle('hide', !free));
    $$('.totalOnly').forEach(e => e.classList.toggle('hide', !free || !total));
    $('#navHintT').textContent = free ? 'Học sinh chuyển câu tự do, có bảng số câu và đánh dấu xem lại; thời gian tính cho cả bài.' : 'Mỗi câu có đồng hồ riêng, hết giờ tự chuyển câu.';
  }
  ['s_nav', 's_ftime'].forEach(id => $('#' + id).addEventListener('change', () => { navUI(); readForm(); summarize(); }));
  $('#s_tmin').addEventListener('input', () => { readForm(); summarize(); });
  const tsOf = (v) => { if (!v) return 0; const t = new Date(v).getTime(); return isNaN(t) ? 0 : t; };
  function winSummary() {
    const f = $('#s_from').value, t = $('#s_to').value, e = $('#s_end').value;
    const unl = $('#s_unlim').checked, n = +$('#s_maxA').value || 1;
    const parts = [];
    parts.push(f ? 'Vào làm từ <b>' + fmtTime(tsOf(f)) + '</b>' : 'Vào làm <b>ngay khi lưu đề</b>');
    if (t) parts.push('hết giờ vào lúc <b>' + fmtTime(tsOf(t)) + '</b>');
    if (e) parts.push('tự nộp lúc <b>' + fmtTime(tsOf(e)) + '</b>');
    parts.push(unl ? '<b>không giới hạn</b> số lần (luyện tập)' : 'mỗi em làm <b>' + n + ' lần</b>');
    let warn = '';
    if (f && t && tsOf(t) <= tsOf(f)) warn = 'Giờ hết hạn vào làm phải sau giờ bắt đầu.';
    if (e && f && tsOf(e) <= tsOf(f)) warn = 'Giờ kết thúc phải sau giờ bắt đầu.';
    if (e && t && tsOf(e) < tsOf(t)) warn = 'Giờ kết thúc nên sau (hoặc bằng) giờ hết hạn vào làm.';
    $('#winSummary').className = 'msg ' + (warn ? 'bad' : 'info');
    $('#winSummary').innerHTML = warn || (parts.join(', ') + '.');
    return warn;
  }
  ['s_from', 's_to', 's_end', 's_maxA'].forEach(id => $('#' + id).addEventListener('input', winSummary));
  $('#s_unlim').addEventListener('change', () => { $('#s_maxA').disabled = $('#s_unlim').checked; if ($('#s_unlim').checked && !$('#s_review').checked) $('#s_review').checked = true; readForm(); winSummary(); });
  $('#presetEasy').onclick = () => { $('#s_nav').value = 'free'; $('#s_ftime').value = 'total'; $('#s_unlim').checked = false; $('#s_maxA').disabled = false; $('#s_maxA').value = 1; $('#s_review').checked = false; navUI(); readForm(); winSummary(); summarize(); toast('Bài dễ / gỡ điểm: được quay lại sửa câu, giới hạn tổng thời gian, làm 1 lần', 'ok'); };
  $('#presetTest').onclick = () => { $('#s_nav').value = 'strict'; navUI(); $('#s_unlim').checked = false; $('#s_maxA').disabled = false; $('#s_maxA').value = 1; $('#s_review').checked = false; $('#s_policy').value = 'max'; readForm(); winSummary(); summarize(); toast('Kiểm tra / thi: từng câu có đồng hồ, không quay lại, mỗi em 1 lần', 'ok'); };
  $('#presetPractice').onclick = () => { $('#s_nav').value = 'free'; $('#s_ftime').value = 'none'; navUI(); $('#s_unlim').checked = true; $('#s_maxA').disabled = true; $('#s_review').checked = true; $('#s_policy').value = 'max'; $('#s_maxV').value = 0; readForm(); winSummary(); summarize(); toast('Ôn tập: được quay lại sửa câu, không giới hạn thời gian và số lần, xem đáp án sau khi nộp', 'ok'); };
  function readForm() {
    INFO_FIELDS.forEach(k => { const el = $('#i_' + k); if (el) draft.info[k] = el.value.trim(); });
    draft.settings = {
      sec: +$('#s_sec').value || 0, order: $('#s_order').value, scale: +$('#s_scale').value || 10, round: +$('#s_round').value || 0.1,
      maxViolations: +$('#s_maxV').value || 0, openFrom: $('#s_from').value, openTo: $('#s_to').value, endAt: $('#s_end').value,
      openFromTs: tsOf($('#s_from').value), openToTs: tsOf($('#s_to').value), endAtTs: tsOf($('#s_end').value),
      maxAttempts: $('#s_unlim').checked ? 0 : Math.max(1, +$('#s_maxA').value || 1), unlimited: $('#s_unlim').checked,
      scorePolicy: $('#s_policy').value, showReview: $('#s_review').checked, requireApp: $('#s_requireApp').checked,
      navMode: $('#s_nav').value, freeTime: $('#s_ftime').value, totalMin: +$('#s_tmin').value || 0,
      audioPlays: $('#s_plays') ? +$('#s_plays').value : 1, toeic: $('#s_toeic') ? $('#s_toeic').checked : false,
      bkAuto: $('#s_bkAuto') ? $('#s_bkAuto').checked : true, bkLockL: $('#s_bkLockL') ? $('#s_bkLockL').checked : false, bkLockSec: $('#s_bkLockSec') ? $('#s_bkLockSec').checked : false,
      shuffleOpts: $('#s_shuffleOpts').checked, sameForAll: $('#s_same').checked, showScore: $('#s_showScore').checked,
      fullscreen: $('#s_full').checked, requireMssv: $('#s_mssv').checked,
      roster: $('#s_roster').value.split(/\r?\n/).map(x => x.replace(/\t/g, ' ').trim()).filter(Boolean), note: $('#s_note').value.trim(),
      music: $('#s_music').value.trim() ? { url: $('#s_music').value.trim(), vol: +$('#s_musicVol').value || 35, allowMute: $('#s_musicMute').checked } : null
    };
    LS.set(K.draft, draft);
  }
  $('#i_loai').addEventListener('change', () => $('#i_loaiKhac').classList.toggle('hide', $('#i_loai').value !== '__other'));
  $('#sec-build').addEventListener('change', (e) => { if (!e.target.closest('#groups')) readForm(); });
  function loaiText(info) { return info.loai === '__other' ? (info.loaiKhac || 'Bài kiểm tra') : (info.loai || ''); }
  function autoTitle(info) {
    return [loaiText(info), info.mon ? (info.hinhThuc || 'Mô đun') + ': ' + info.mon : '', info.noiDung].filter(Boolean).join(' – ');
  }

  function renderGroups() {
    const el = $('#groups');
    if (!banks.length) { el.innerHTML = '<div class="msg info">Hãy nạp ngân hàng câu hỏi ở bước 1 trước.</div>'; $('#groupSum').innerHTML = ''; return; }
    draft.groups = draft.groups.filter(g => banks.some(b => b.id === g.bankId));
    if (!draft.groups.length) {
      const sk = bankStats(banks[0]).sk;
      const ks = EN ? ['L', 'R', 'W', 'S'].filter(k => sk[k]) : [];
      if (ks.length) ks.forEach(k => draft.groups.push({ bankId: banks[0].id, skill: k, pick: 'random', count: '', range: '', list: '', sec: '', pts: '', shuffleOpts: true }));
      else draft.groups.push({ bankId: banks[0].id, pick: 'random', count: '', range: '', list: '', sec: '', pts: '', shuffleOpts: true });
    }
    el.innerHTML = draft.groups.map((g, i) => {
      const b = banks.find(x => x.id === g.bankId);
      const bs = b ? bankStats(b) : null;
      const n = bs ? (EN && g.skill && g.skill !== 'all' ? bs.sk[g.skill] : bs.usable) : 0;
      return '<div class="grp' + (EN ? ' en' : '') + '" data-g="' + i + '">' +
        '<div><label>Ngân hàng (' + n + ' câu)</label><select data-k="bankId">' + banks.map(x => '<option value="' + x.id + '"' + (x.id === g.bankId ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></div>' +
        (EN ? '<div><label>Kỹ năng</label><select data-k="skill">' + [['all', 'Tất cả'], ['L', 'Nghe'], ['R', 'Đọc'], ['W', 'Viết'], ['S', 'Nói']].map(o => '<option value="' + o[0] + '"' + ((g.skill || 'all') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></div>' : '') +
        '<div><label>Cách lấy</label><select data-k="pick"><option value="random"' + (g.pick !== 'fixed' ? ' selected' : '') + '>Ngẫu nhiên</option><option value="fixed"' + (g.pick === 'fixed' ? ' selected' : '') + '>Chỉ định câu</option></select></div>' +
        (g.pick === 'fixed'
          ? '<div style="grid-column:span 2"><label>Danh sách câu</label><input type="text" data-k="list" value="' + esc(g.list) + '" placeholder="vd 1-10, 15, 20"></div>'
          : '<div><label>Số câu</label><input type="text" data-k="count" value="' + esc(g.count) + '" placeholder="tất cả (' + n + ')"></div><div><label>Chỉ lấy trong câu</label><input type="text" data-k="range" value="' + esc(g.range) + '" placeholder="tất cả"></div>') +
        '<div><label>Giây / câu</label><input type="number" min="0" data-k="sec" value="' + esc(g.sec) + '" placeholder="mặc định"></div>' +
        '<div><label>Điểm / câu</label><input type="number" min="0" step="0.25" data-k="pts" value="' + esc(g.pts) + '" placeholder="1"></div>' +
        '<label class="check" style="margin-bottom:9px"><input type="checkbox" data-k="shuffleOpts"' + (g.shuffleOpts !== false ? ' checked' : '') + '> Trộn PA</label>' +
        '<button class="btn sm danger" data-rm="' + i + '" title="Xóa nhóm">✕</button></div>';
    }).join('');
    $$('.grp', el).forEach(row => {
      const g = draft.groups[+row.dataset.g];
      $$('[data-k]', row).forEach(inp => {
        inp.onchange = inp.oninput = () => {
          const k = inp.dataset.k;
          g[k] = inp.type === 'checkbox' ? inp.checked : inp.value;
          LS.set(K.draft, draft);
          if (k === 'pick' || k === 'bankId' || k === 'skill') { if (inp.type !== 'text') renderGroups(); }
          summarize();
        };
      });
    });
    $$('[data-rm]', el).forEach(b => b.onclick = () => { draft.groups.splice(+b.dataset.rm, 1); LS.set(K.draft, draft); renderGroups(); });
    summarize();
  }
  $('#addGroup').onclick = () => { if (!banks.length) return; const used = draft.groups.map(g => g.bankId); const nb = banks.find(b => !used.includes(b.id)) || banks[0]; draft.groups.push({ bankId: nb.id, pick: 'random', count: '', range: '', list: '', sec: '', pts: '', shuffleOpts: true }); LS.set(K.draft, draft); renderGroups(); };

  /** Đóng gói đề để gửi máy chủ / xem thử */
  function buildExam() {
    readForm();
    const used = [];
    const groups = draft.groups.map(g => {
      let bi = used.indexOf(g.bankId); if (bi < 0) { used.push(g.bankId); bi = used.length - 1; }
      return { bank: bi, pick: g.pick, count: g.count, range: g.range, list: g.list, sec: g.sec === '' ? null : +g.sec, pts: g.pts === '' ? null : +g.pts, shuffleOpts: g.shuffleOpts !== false, skill: EN && g.skill && g.skill !== 'all' ? g.skill : undefined };
    });
    const ebanks = used.map(id => {
      const b = banks.find(x => x.id === id);
      const eb = { name: b.name, groups: b.groups || [], audio: b.audio || {}, questions: b.questions.map(q => ({ type: q.type, stem: q.stem, options: q.options, correct: q.correct, pin: q.pin, answer: q.answer, blanks: q.blanks, sec: q.sec, pts: q.pts, skill: q.skill, g: q.g, audio: q.audio, rec: q.rec, num: q.num, part: q.part, page: q.page, disabled: !!q.disabled || !QuizCore.usable(q) })) };
      if (b.book) eb.book = { parts: b.book.parts || {}, marks: b.book.marks || null, partsTxt: b.book.partsTxt, pages: b.book.pages.map(p => ({ id: p.id, sec: p.sec, n: p.n, w: p.w, h: p.h, first: p.first })) };
      return eb;
    });
    const info = Object.assign({}, draft.info, { loai: loaiText(draft.info) });
    delete info.loaiKhac;
    return { id: draft.id || null, kind: EN ? 'en' : undefined, title: draft.info.title || autoTitle(draft.info), info, banks: ebanks, groups, settings: draft.settings, author: 'Lê Duy Nam — GV Trường Cao đẳng Dầu khí' };
  }
  function summarize() {
    if (!banks.length || !draft.groups.length) return;
    let exam; try { exam = buildExam(); } catch (e) { return; }
    const p = QuizCore.buildPaper(exam, 'sum');
    const lim = QuizCore.totalLimit(exam.settings, p), free = exam.settings.navMode === 'free';
    let sec = 0, unl = false, pts = 0, ranged = draft.groups.some(g => /-/.test(String(g.count || '')));
    p.items.forEach(it => { if (it.sec > 0) sec += it.sec; else unl = true; pts += it.pts; });
    const es = p.items.filter(it => exam.banks[it.b].questions[it.q].type === 'essay').length;
    $('#groupSum').innerHTML = '<span>Tổng: <b>' + (ranged ? '~' : '') + p.items.length + ' câu</b></span>' + (es ? '<span>(' + es + ' tự luận)</span>' : '') +
      '<span>' + (free ? 'Chế độ <b>Tự do</b> · thời gian cả bài: <b>' + (lim ? fmtDur(lim) : 'không giới hạn (ôn tập)') + '</b>' : 'Thời gian tối đa: <b>' + (unl ? 'không giới hạn' : fmtDur(sec)) + '</b>') + '</span><span>Tổng điểm thô: <b>' + pts + '</b> → quy về thang ' + (draft.settings.scale || 10) + '</span>';
  }
  $('#btnNew').onclick = () => { if (!confirm('Bắt đầu đề mới? (Cấu hình hiện tại sẽ được làm mới, ngân hàng vẫn giữ)')) return; draft = newDraft(draft.info.gv); LS.set(K.draft, draft); fillForm(); renderGroups(); $('#linkOut').innerHTML = ''; };
  $('#btnPreview').onclick = async () => {
    if (!banks.length) return toast('Chưa có ngân hàng câu hỏi', 'bad');
    const exam = buildExam(); exam.id = exam.id || 'XEMTHU';
    exam.settings = Object.assign({}, exam.settings, { requireApp: false, openFromTs: 0, openToTs: 0, endAtTs: 0, openFrom: '', openTo: '', endAt: '' });
    if (!QuizCore.buildPaper(exam, 'x').items.length) return toast('Đề chưa có câu nào', 'bad');
    await IDB.set('previewExam', exam);
    window.open('thi.html?preview=1', '_blank');
  };
  function studentLink(id) {
    // Bản ứng dụng Windows/Mac chạy offline (app://) => link phải trỏ về trang web online
    const base = /^https?:$/.test(location.protocol) && !/appassets\.androidplatform\.net$/.test(location.hostname) ? location.href.replace(/[^/]*([?#].*)?$/, '') : String(window.QUIZ_PUBLIC_URL || '');
    return base + 'thi.html?e=' + encodeURIComponent(id) + linkParamForApi(conf().api);
  }
  function linkHtml(id) {
    const link = studentLink(id);
    if (!/^https?:/.test(link)) return '<div class="msg warn" style="margin-top:14px">Đề đã lưu (mã đề <b class="mono">' + esc(id) + '</b>) nhưng chưa tạo được link: ứng dụng đang chạy bản đóng gói sẵn mà chưa cài địa chỉ trang web online. Hãy mở trang giáo viên trên trình duyệt để lấy link, hoặc liên hệ thầy Lê Duy Nam.</div>';
    return '<div class="msg ok" style="margin-top:14px"><b>Link gửi cho học sinh</b> (mã đề <span class="mono">' + esc(id) + '</span>) — mỗi em mở link sẽ nhận một đề riêng:</div>' +
      '<div class="linkbox"><input type="text" readonly value="' + esc(link) + '" id="linkVal"><button class="btn primary" id="btnCopy">Sao chép</button><a class="btn" href="' + esc(link) + '" target="_blank">Mở thử</a></div>';
  }
  function bindCopy() { const b = $('#btnCopy'); if (b) b.onclick = () => { const v = $('#linkVal'); v.select(); (navigator.clipboard ? navigator.clipboard.writeText(v.value) : Promise.reject()).then(() => toast('Đã sao chép link', 'ok')).catch(() => { document.execCommand('copy'); toast('Đã sao chép link', 'ok'); }); }; }
  $('#btnSave').onclick = async () => {
    if (!needConn()) return;
    if (!banks.length) return toast('Chưa có ngân hàng câu hỏi', 'bad');
    const exam = buildExam();
    if (!QuizCore.buildPaper(exam, 'x').items.length) return toast('Đề chưa có câu nào', 'bad');
    const wErr = winSummary(); if (wErr) return toast(wErr, 'bad');
    if (EN) {
      const miss = []; draft.groups.forEach(g => { const b = banks.find(x => x.id === g.bankId); if (b) audioNeeds(b).forEach((_, k) => { if (!hasAud(b, k) && !miss.includes(k)) miss.push(k); }); });
      if (miss.length && !confirm('Còn ' + miss.length + ' file nghe chưa tải lên (' + miss.slice(0, 5).join(', ') + (miss.length > 5 ? '…' : '') + '). Học sinh sẽ không nghe được các câu đó. Vẫn lưu đề?')) return;
    }
    if (exam.settings.endAtTs && exam.settings.endAtTs < Date.now() && !confirm('Giờ kết thúc đã qua — học sinh sẽ không vào làm được. Vẫn lưu?')) return;
    $('#saveState').textContent = 'Đang lưu…'; $('#btnSave').disabled = true;
    try {
      const r = await api(conf().api, { action: 'saveExam', key: conf().key, exam });
      draft.id = r.examId; LS.set(K.draft, draft); fillForm();
      $('#saveState').textContent = 'Đã lưu lúc ' + fmtTime(Date.now());
      $('#linkOut').innerHTML = linkHtml(r.examId); bindCopy();
      toast('Đã lưu đề ' + r.examId, 'ok');
    } catch (e) { $('#saveState').textContent = ''; toast(e.message, 'bad'); }
    $('#btnSave').disabled = false;
  };

  /* ------------------------------- results ------------------------------- */
  let exams = [], cur = null, curExam = null, curData = null, refTimer = null;
  async function loadExams() {
    if (!conf().api || !conf().key) { $('#examTbl').innerHTML = '<tr><td>Chưa kết nối máy chủ — vào “Cài đặt máy chủ”.</td></tr>'; return; }
    $('#examTbl').innerHTML = '<tr><td class="muted">Đang tải…</td></tr>';
    try { exams = (await api(conf().api, { action: 'listExams', key: conf().key })).exams; }
    catch (e) { $('#examTbl').innerHTML = '<tr><td class="msg bad">' + esc(e.message) + '</td></tr>'; return; }
    if (!exams.length) { $('#examTbl').innerHTML = '<tr><td class="muted">Chưa có đề nào được lưu lên máy chủ.</td></tr>'; return; }
    $('#examTbl').innerHTML = '<tr><th>Mã đề</th><th>Tiêu đề</th><th>Lớp</th><th>Trạng thái</th><th class="num">Đã nộp</th><th>Cập nhật</th><th></th></tr>' +
      exams.map(x => '<tr><td class="mono">' + esc(x.id) + '</td><td>' + esc(x.title) + '</td><td>' + esc(x.lop) + '</td><td><span class="pill ' + (x.status === 'Mở' ? 'ok' : 'bad') + '">' + esc(x.status) + '</span></td><td class="num">' + x.submitted + '</td><td>' + fmtTime(x.updated) + '</td>' +
        '<td class="row" style="flex-wrap:nowrap"><button class="btn sm primary" data-res="' + esc(x.id) + '">Kết quả</button><button class="btn sm" data-link="' + esc(x.id) + '">Link</button><button class="btn sm" data-edit="' + esc(x.id) + '">Sửa</button><button class="btn sm danger" data-delx="' + esc(x.id) + '">Xóa</button></td></tr>').join('');
    $$('[data-res]').forEach(b => b.onclick = () => openResults(b.dataset.res));
    $$('[data-link]').forEach(b => b.onclick = () => { modal('<h2>Link làm bài</h2>' + linkHtml(b.dataset.link) + '<div class="right" style="margin-top:12px"><button class="btn" id="mClose">Đóng</button></div>'); bindCopy(); $('#mClose').onclick = closeModal; });
    $$('[data-edit]').forEach(b => b.onclick = () => editExam(b.dataset.edit));
    $$('[data-delx]').forEach(b => b.onclick = async () => {
      if (!confirm('Xóa đề ' + b.dataset.delx + '? (Kết quả đã nộp vẫn còn trong Google Sheet)')) return;
      try { await api(conf().api, { action: 'deleteExam', key: conf().key, examId: b.dataset.delx }); loadExams(); } catch (e) { toast(e.message, 'bad'); }
    });
  }
  $('#btnReloadExams').onclick = loadExams;
  async function editExam(id) {
    try {
      const ex = (await api(conf().api, { action: 'getExam', key: conf().key, examId: id })).exam;
      if ((ex.kind === 'en') !== EN) {
        toast(ex.kind === 'en' ? 'Đây là đề Tiếng Anh — mở ở trang “Đề Tiếng Anh” để sửa' : 'Đây là đề môn học / mô đun — mở ở trang giáo viên chính để sửa', 'bad');
        setTimeout(() => { if (confirm('Mở trang ' + (ex.kind === 'en' ? 'Đề Tiếng Anh' : 'Môn học / Mô đun') + ' ngay?')) location.href = ex.kind === 'en' ? 'tienganh.html' : 'giaovien.html'; }, 300);
        return;
      }
      // nạp lại ngân hàng của đề vào máy nếu chưa có
      const ids = ex.banks.map(eb => {
        let b = banks.find(x => x.name === eb.name && x.questions.length === eb.questions.length);
        if (!b) {
          b = { id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: eb.name, file: '(tải từ đề ' + id + ')', addedAt: Date.now(),
            questions: eb.questions.map((q, i) => Object.assign({ n: i + 1, text: '' }, q, { disabled: false })), groups: eb.groups || [], audio: eb.audio || {} };
          if (eb.book) b.book = eb.book;
          banks.push(b);
        }
        return b.id;
      });
      await saveBanks();
      const info = Object.assign({}, ex.info);
      const opts = $$('#i_loai option').map(o => o.value);
      if (info.loai && !opts.includes(info.loai)) { info.loaiKhac = info.loai; info.loai = '__other'; }
      draft = { id: ex.id, info, groups: ex.groups.map(g => ({ bankId: ids[g.bank], pick: g.pick, count: g.count || '', range: g.range || '', list: g.list || '', sec: g.sec == null ? '' : g.sec, pts: g.pts == null ? '' : g.pts, shuffleOpts: g.shuffleOpts !== false, skill: g.skill || 'all' })), settings: ex.settings || {} };
      draft.info.title = ex.title;
      LS.set(K.draft, draft); fillForm(); showTab('build');
      $('#linkOut').innerHTML = linkHtml(ex.id); bindCopy();
      toast('Đang sửa đề ' + ex.id + ' — sửa xong bấm “Lưu đề lên máy chủ”', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }
  async function openResults(id) {
    cur = id; curExam = null;
    $('#resCard').classList.remove('hide');
    const x = exams.find(e => e.id === id) || {};
    $('#resTitle').textContent = x.title || id;
    $('#resSub').textContent = 'Mã đề ' + id + (x.lop ? ' · Lớp ' + x.lop : '');
    try { curExam = (await api(conf().api, { action: 'getExam', key: conf().key, examId: id })).exam; } catch (e) { toast(e.message, 'bad'); }
    await refreshResults();
    $('#resCard').scrollIntoView({ behavior: 'smooth' });
  }
  async function refreshResults() {
    if (!cur) return;
    try { curData = await api(conf().api, { action: 'results', key: conf().key, examId: cur }); }
    catch (e) { toast(e.message, 'bad'); return; }
    renderResults();
  }
  function sortVN(a, b) {
    const ta = String(a['Họ và tên'] || '').trim().split(/\s+/), tb = String(b['Họ và tên'] || '').trim().split(/\s+/);
    return (ta[ta.length - 1] || '').localeCompare(tb[tb.length - 1] || '', 'vi') || String(a['Họ và tên']).localeCompare(String(b['Họ và tên']), 'vi');
  }
  const stKey = (r) => QuizCore.normName(r['Họ và tên']) + '|' + QuizCore.normName(r['Lớp']);
  /** Gộp các lần làm của từng học sinh theo cách tính điểm giáo viên chọn */
  function aggregate(res) {
    const st = (curExam && curExam.settings) || {}, policy = st.scorePolicy || 'max';
    const map = new Map();
    res.forEach(r => { const k = stKey(r); if (!map.has(k)) map.set(k, []); map.get(k).push(r); });
    const out = [];
    map.forEach(list => {
      list.sort((a, b) => (+a['Nộp bài'] || 0) - (+b['Nộp bài'] || 0));
      let pick;
      if (policy === 'last' || policy === 'avg') pick = list[list.length - 1];
      else if (policy === 'first') pick = list[0];
      else pick = list.reduce((a, b) => (+b['Điểm'] > +a['Điểm'] ? b : a), list[0]);
      const score = policy === 'avg' ? QuizCore.round(list.reduce((a, b) => a + (+b['Điểm'] || 0), 0) / list.length, st.round || 0.1) : +pick['Điểm'];
      out.push({ row: pick, score, count: list.length, list });
    });
    return out.sort((a, b) => sortVN(a.row, b.row));
  }
  const POLICY_TXT = { max: 'lần cao nhất', last: 'lần cuối', first: 'lần đầu', avg: 'trung bình các lần' };
  function renderResults() {
    const res = (curData.results || []).slice().sort((a, b) => sortVN(a, b) || (+a['Nộp bài'] || 0) - (+b['Nộp bài'] || 0));
    const agg = aggregate(res);
    const exSt = (curExam && curExam.settings) || {};
    const multi = res.length > agg.length || QuizCore.maxAttempts(exSt) !== 1;
    const chosenIds = new Set(agg.map(a => a.row['Mã lượt']));
    const st = curExam ? curExam.status : (exams.find(e => e.id === cur) || {}).status;
    $('#btnToggle').textContent = st === 'Mở' ? 'Đóng đề (ngừng nhận bài)' : 'Mở lại đề';
    $('#btnToggle').className = 'btn sm ' + (st === 'Mở' ? 'danger' : '');
    const sc = agg.map(a => a.score).filter(v => !isNaN(v));
    const scale = (curExam && curExam.settings && curExam.settings.scale) || 10;
    const avg = sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : 0;
    $('#stats').innerHTML = [
      [multi ? 'Học sinh đã nộp (' + res.length + ' lượt)' : 'Đã nộp', agg.length], ['Đang làm', (curData.inProgress || []).length], ['Điểm trung bình' + (multi ? ' (' + POLICY_TXT[exSt.scorePolicy || 'max'] + ')' : ''), sc.length ? avg.toFixed(2) : '—'],
      ['Đạt ≥ ' + (scale / 2), sc.filter(v => v >= scale / 2).length + ' / ' + sc.length]
    ].map(s => '<div class="stat"><b>' + s[1] + '</b><span>' + s[0] + '</span></div>').join('');
    const ip = curData.inProgress || [];
    $('#progressBox').innerHTML = ip.length ? '<div class="msg info" style="margin-top:12px"><b>Đang làm bài:</b> ' + ip.map(a => esc(a.hoTen) + ' (' + esc(a.lop) + ')' + (multi && a.lan ? ' lần ' + a.lan : '') + ' – câu ' + ((+a.idx || 0) + 1) + (a.violations ? ' <span class="pill bad">vi phạm ' + a.violations + '</span>' : '')).join(' · ') + '</div>' : '';
    const hasEssay = res.some(r => r['Tự luận']);
    const skOf = (r) => { try { return JSON.parse(r['Kỹ năng'] || 'null') || null; } catch (e) { return null; } };
    const skCols = ['L', 'R', 'W', 'S'].filter(k => res.some(r => { const x = skOf(r); return x && x.s && x.s[k]; }));
    const hasToeic = res.some(r => { const x = skOf(r); return x && x.t && x.t.LR != null; });
    const skCell = (r) => { const x = skOf(r) || {}; return skCols.map(k => { const o = x.s && x.s[k]; return '<td class="num">' + (o ? (o.pending ? '<span class="pill warn" title="Chưa chấm ' + o.pending + ' câu">' + o.score + '*</span>' : o.score) : '—') + '</td>'; }).join('') + (hasToeic ? '<td class="num">' + (x.t && x.t.LR != null ? x.t.LR : '—') + '</td>' : ''); };
    $('#resTbl').innerHTML = '<tr><th class="num">STT</th><th>Họ và tên</th><th>Lớp</th><th>MSSV</th><th class="num">Điểm</th>' + (multi ? '<th class="num">Lần</th>' : '') + skCols.map(k => '<th class="num">' + SKN[k] + '</th>').join('') + (hasToeic ? '<th class="num" title="Quy đổi TOEIC tham khảo (Nghe + Đọc)">TOEIC</th>' : '') + '<th class="num">Đúng</th>' + (hasEssay ? '<th>Tự luận / Nói</th>' : '') + '<th>Thời gian làm</th><th class="num">Vi phạm</th><th>Nộp lúc</th><th>Ghi chú</th><th></th></tr>' +
      (res.length ? res.map((r, i) => '<tr' + (multi && !chosenIds.has(r['Mã lượt']) ? ' class="muted"' : '') + '><td class="num">' + (i + 1) + '</td><td><b>' + esc(r['Họ và tên']) + '</b></td><td>' + esc(r['Lớp']) + '</td><td>' + esc(r['MSSV']) + '</td>' +
        '<td class="num"><b>' + esc(r['Điểm']) + '</b>' + (multi && chosenIds.has(r['Mã lượt']) ? ' <span class="pill ok" title="Điểm được ghi nhận">' + (exSt.scorePolicy === 'avg' ? 'TB ' + agg.find(a => a.row === r).score : '✓') + '</span>' : '') + '</td>' + (multi ? '<td class="num">' + esc(r['Lần'] || '') + '</td>' : '') + skCell(r) + '<td class="num">' + esc(r['Số câu đúng']) + '/' + esc(r['Số câu TN']) + '</td>' +
        (hasEssay ? '<td>' + (r['Tự luận'] ? '<span class="pill ' + (/Chưa/.test(r['Tự luận']) ? 'warn' : 'ok') + '">' + esc(r['Tự luận']) + '</span>' : '') + '</td>' : '') +
        '<td>' + fmtDur(r['Thời gian làm (giây)']) + '</td><td class="num">' + (+r['Vi phạm'] ? '<span class="pill bad">' + r['Vi phạm'] + '</span>' : '0') + '</td><td>' + fmtTime(r['Nộp bài']) + '</td><td>' + esc(r['Ghi chú']) + '</td>' +
        '<td class="row" style="flex-wrap:nowrap"><button class="btn sm" data-see="' + esc(r['Mã lượt']) + '">' + (r['Tự luận'] ? 'Chấm / xem' : 'Xem bài') + '</button><button class="btn sm danger" data-redo="' + esc(r['Mã lượt']) + '" title="Xóa bài này để học sinh làm lại">Cho làm lại</button></td></tr>').join('')
        : '<tr><td colspan="12" class="muted">Chưa có bài nộp.</td></tr>');
    $$('[data-see]').forEach(b => b.onclick = () => seeAttempt(b.dataset.see));
    $$('[data-redo]').forEach(b => b.onclick = async () => {
      const r = res.find(x => x['Mã lượt'] === b.dataset.redo);
      if (!confirm('Xóa bài làm của ' + r['Họ và tên'] + ' để em làm lại?')) return;
      try { await api(conf().api, { action: 'deleteAttempt', key: conf().key, attemptId: b.dataset.redo }); refreshResults(); } catch (e) { toast(e.message, 'bad'); }
    });
  }
  function seeAttempt(aid) {
    const r = curData.results.find(x => x['Mã lượt'] === aid);
    if (!r || !curExam) return;
    let det; try { det = JSON.parse(r['Chi tiết']); } catch (e) { return toast('Không đọc được chi tiết bài làm', 'bad'); }
    let scores = {}; try { scores = JSON.parse(r['Điểm TL'] || '{}'); } catch (e) { scores = {}; }
    const paper = QuizCore.buildPaper(curExam, det.seed);
    let lastGrp = null;
    const html = paper.items.map((it, i) => {
      const bk = curExam.banks[it.b], q = bk.questions[it.q], d = det.d[i] || [];
      let gHead = '';
      if (it.grp && it.grp !== lastGrp) { const gr = (bk.groups || [])[q.g] || {}; gHead = '<div class="gprev"><b>' + esc(gr.title || 'Đoạn dùng chung') + '</b>' + (gr.audio ? ' <span class="pill">🎧 ' + esc(gr.audio) + '</span>' : '') + (gr.stem ? '<div class="gstem">' + gr.stem + '</div>' : '') + '</div>'; }
      lastGrp = it.grp || null;
      let body;
      if (bk.book && q.type === 'mc') {
        const chosen = d[2] || [];
        return '<div class="krow2"><b>' + q.num + '</b><span class="hint">P' + q.part + '</span>' + q.options.map((_, oi) => '<span class="kb' + (q.correct.includes(oi) ? ' on' : '') + (chosen.includes(oi) && !q.correct.includes(oi) ? ' badc' : '') + '">' + L[oi] + '</span>').join('') + (chosen.length ? (d[3] ? ' <span class="pill ok">Đúng</span>' : ' <span class="pill bad">Sai</span>') : ' <span class="pill warn">Bỏ trống</span>') + '</div>';
      }
      if (q.type === 'mc') {
        const chosen = d[2] || [];
        body = q.options.map((o, oi) => '<div class="opt' + (q.correct.includes(oi) ? ' ok' : '') + '">' + L[oi] + ') ' + o + (q.correct.includes(oi) ? ' ✓' : '') + (chosen.includes(oi) ? ' <span class="pill ' + (q.correct.includes(oi) ? 'ok' : 'bad') + '">HS chọn</span>' : '') + '</div>').join('') + (chosen.length ? '' : '<div class="pill warn">Không trả lời</div>');
      } else if (q.type === 'fill') {
        const given = d[2] || [], oks = d[3] || [];
        body = '<div>' + q.stem.replace(/<span class="blank" data-b="(\d+)">[^<]*<\/span>/g, (m, k) => { k = +k; return '<span class="fillans ' + (oks[k] ? 'ok' : 'bad') + '">' + (esc(given[k] || '') || '(trống)') + '</span>' + (oks[k] ? '' : ' <span class="fillans ok">→ ' + esc(q.blanks[k].join(q.blanks[k].some(x => x.indexOf('/') >= 0) ? ' | ' : ' / ')) + '</span>'); }) + '</div>';
      } else if (q.type === 'speak') {
        const rec = d[2] && d[2].rec;
        body = (q.answer ? '<div class="hint"><b>Tiêu chí chấm:</b> ' + q.answer + '</div>' : '') +
          (rec ? '<div class="row" style="margin:6px 0"><button class="btn sm primary" data-play="' + esc(rec) + '">▶ Nghe bài nói' + (d[2].dur ? ' (' + Math.round(d[2].dur) + ' giây)' : '') + '</button><span class="hint" data-pst="' + esc(rec) + '"></span><a class="hint" target="_blank" rel="noopener" href="https://drive.google.com/file/d/' + esc(rec) + '/view">Mở trong Google Drive</a></div>' : '<div class="pill warn">Không có bản ghi âm</div>') +
          '<div class="row"><label style="margin:0">Điểm câu này (tối đa ' + it.pts + '):</label><input type="number" class="mini" min="0" max="' + it.pts + '" step="0.25" data-es="' + i + '" value="' + (scores[i] != null ? scores[i] : '') + '"></div>';
      } else {
        body = (q.answer ? '<div class="hint"><b>Đáp án gợi ý:</b> ' + q.answer + '</div>' : '') +
          '<div class="msg info" style="white-space:pre-wrap">' + (esc(d[2] || '') || '<i>(bỏ trống)</i>') + '</div>' + (EN && d[2] ? '<div class="hint">' + String(d[2]).trim().split(/\s+/).filter(Boolean).length + ' từ</div>' : '') +
          '<div class="row"><label style="margin:0">Điểm câu này (tối đa ' + it.pts + '):</label><input type="number" class="mini" min="0" max="' + it.pts + '" step="0.25" data-es="' + i + '" value="' + (scores[i] != null ? scores[i] : '') + '"></div>';
      }
      return gHead + '<div class="qprev' + (it.grp ? ' ing' : '') + '"><div class="head"><b>Câu ' + (i + 1) + '</b>' + (q.skill ? '<span class="pill">' + SKN[q.skill] + '</span>' : '') + '<span class="pill">' + it.pts + ' điểm</span>' + (q.type === 'speak' ? '<span class="pill">Nói (ghi âm)</span>' : q.type === 'mc' ? '<span class="pill ' + (d[3] ? 'ok' : 'bad') + '">' + (d[3] ? 'Đúng' : 'Sai') + '</span>' : q.type === 'fill' ? '<span class="pill ' + ((d[3] || []).every(Boolean) ? 'ok' : 'bad') + '">Điền khuyết: đúng ' + (d[3] || []).filter(Boolean).length + '/' + q.blanks.length + '</span>' : '<span class="pill">Tự luận</span>') + '</div>' + (q.type === 'fill' ? '' : '<div>' + q.stem + '</div>') + body + '</div>';
    }).join('');
    const hasEs = paper.items.some(it => ['essay', 'speak'].includes(curExam.banks[it.b].questions[it.q].type));
    modal('<div class="row"><div><h2 style="margin:0">' + esc(r['Họ và tên']) + ' — ' + esc(r['Lớp']) + '</h2><div class="muted">Điểm: <b>' + esc(r['Điểm']) + '</b> · Đúng ' + r['Số câu đúng'] + '/' + r['Số câu TN'] + ' câu tự chấm (trắc nghiệm, điền khuyết)</div></div><span class="spacer"></span>' +
      (hasEs ? '<button class="btn primary" id="mSaveEs">Lưu điểm ' + (EN ? 'Viết / Nói' : 'tự luận') + '</button>' : '') + '<button class="btn" id="mClose">Đóng</button></div>' + html);
    $('#mClose').onclick = () => { $$('#modalBody audio').forEach(a => a.pause()); closeModal(); };
    $$('[data-play]').forEach(btn => btn.onclick = async () => {
      const id = btn.dataset.play, st = document.querySelector('[data-pst="' + id + '"]');
      btn.disabled = true; st.textContent = 'Đang tải bản ghi âm…';
      try {
        let parts = 1, chunks = [], mime = 'audio/webm';
        for (let k = 0; k < parts; k++) { const r = await api(conf().api, { action: 'speech', key: conf().key, id, part: k }); parts = r.parts; mime = r.mime || mime; chunks.push(Uint8Array.from(atob(r.b64), c => c.charCodeAt(0))); }
        const url = URL.createObjectURL(new Blob(chunks, { type: mime }));
        const au = document.createElement('audio'); au.controls = true; au.src = url; au.style.cssText = 'width:100%;margin-top:4px';
        btn.parentNode.after(au); btn.remove(); st.textContent = ''; au.play().catch(() => {});
      } catch (e) { btn.disabled = false; st.textContent = e.message; }
    });
    if (hasEs) $('#mSaveEs').onclick = async () => {
      const sc = {}; $$('[data-es]').forEach(inp => { if (inp.value.trim() !== '') sc[inp.dataset.es] = +inp.value; });
      try { const x = await api(conf().api, { action: 'gradeEssay', key: conf().key, attemptId: aid, scores: sc }); toast('Đã lưu — điểm mới: ' + x.score, 'ok'); closeModal(); refreshResults(); } catch (e) { toast(e.message, 'bad'); }
    };
  }
  $('#btnRefresh').onclick = refreshResults;
  $('#btnToggle').onclick = async () => {
    const st = curExam ? curExam.status : 'Mở';
    try { const r = await api(conf().api, { action: 'setStatus', key: conf().key, examId: cur, status: st === 'Mở' ? 'Đóng' : 'Mở' }); if (curExam) curExam.status = r.status; toast('Đề ' + cur + ': ' + r.status, 'ok'); renderResults(); loadExams(); } catch (e) { toast(e.message, 'bad'); }
  };
  refTimer = setInterval(() => { if ($('#autoRef').checked && cur && $('#sec-results').classList.contains('on') && !$('#modal').classList.contains('on')) refreshResults(); }, 20000);

  /* ------------------------------- Xuất Excel ------------------------------- */
  $('#btnExport').onclick = () => {
    if (!curData) return;
    const res = (curData.results || []).slice().sort(sortVN);
    const ex = curExam || {}; const info = ex.info || {}; const st = ex.settings || {};
    const H = (v) => ({ v, s: 1 }), C = (v) => ({ v, s: 2 }), N1 = (v) => ({ v: v === '' || v == null ? '' : +v, s: 3 }), N = (v) => ({ v: v === '' || v == null ? '' : +v, s: 4 });
    const agg = aggregate(res);
    const rows1 = [[H('STT'), H('Họ và tên'), H('Lớp'), H('MSSV'), H('Điểm'), H('Số câu đúng'), H('Số câu TN'), H('Điểm TL đạt'), H('Tự luận'), H('Thời gian làm'), H('Vi phạm'), H('Nộp bài'), H('Ghi chú'), H('Mã đề'), H('Số lần làm')]];
    const skOfX = (r) => { try { return JSON.parse(r['Kỹ năng'] || 'null') || {}; } catch (e) { return {}; } };
    const xCols = ['L', 'R', 'W', 'S'].filter(k => res.some(r => { const x = skOfX(r); return x.s && x.s[k]; }));
    const xToeic = res.some(r => { const x = skOfX(r); return x.t && x.t.LR != null; });
    xCols.forEach(k => rows1[0].push(H(SKN[k] + ' (thang 10)')));
    if (xToeic) ['TOEIC Nghe', 'TOEIC Đọc', 'TOEIC Nghe+Đọc'].forEach(h => rows1[0].push(H(h)));
    agg.forEach((a, i) => { const r = a.row, x = skOfX(r); rows1.push([N(i + 1), C(r['Họ và tên']), C(r['Lớp']), C(r['MSSV']), N1(a.score), N(r['Số câu đúng']), N(r['Số câu TN']), N1(r['Điểm TL đạt']), C(r['Tự luận']), C(fmtDur(r['Thời gian làm (giây)'])), N(r['Vi phạm']), C(fmtTime(r['Nộp bài'])), C(r['Ghi chú']), C(r['Mã đề']), N(a.count)].concat(xCols.map(k => N1(x.s && x.s[k] ? x.s[k].score : ''))).concat(xToeic ? [N(x.t ? x.t.L : ''), N(x.t ? x.t.R : ''), N(x.t ? x.t.LR : '')] : [])); });
    const rowsAll = [[H('STT'), H('Họ và tên'), H('Lớp'), H('MSSV'), H('Lần'), H('Điểm'), H('Số câu đúng'), H('Số câu TN'), H('Thời gian làm'), H('Vi phạm'), H('Nộp bài'), H('Ghi chú')]];
    res.slice().sort((a, b) => sortVN(a, b) || (+a['Nộp bài'] || 0) - (+b['Nộp bài'] || 0)).forEach((r, i) => rowsAll.push([N(i + 1), C(r['Họ và tên']), C(r['Lớp']), C(r['MSSV']), N(r['Lần'] || 1), N1(r['Điểm']), N(r['Số câu đúng']), N(r['Số câu TN']), C(fmtDur(r['Thời gian làm (giây)'])), N(r['Vi phạm']), C(fmtTime(r['Nộp bài'])), C(r['Ghi chú'])]));
    const rows2 = [[{ v: 'THÔNG TIN BÀI KIỂM TRA / BÀI THI', s: 5 }], [],
      ['Tiêu đề', ex.title || ''], ['Loại bài', info.loai || ''], [(info.hinhThuc || 'Môn học/Mô đun'), info.mon || ''], ['Nội dung', info.noiDung || ''],
      ['Lớp', info.lop || ''], ['Khóa', info.khoa || ''], ['Lần thi', info.lan || ''], ['Ngày', info.ngay || ''], ['Giáo viên', info.gv || ''], ['Mã đề', cur],
      ['Thang điểm', st.scale || 10], ['Số học sinh đã nộp', agg.length], ['Tổng số lượt nộp', res.length],
      ['Số lần được làm', QuizCore.maxAttempts(st) ? QuizCore.maxAttempts(st) : 'Không giới hạn (luyện tập)'], ['Điểm ghi nhận', POLICY_TXT[st.scorePolicy || 'max']],
      ['Bắt đầu vào làm', st.openFromTs ? fmtTime(st.openFromTs) : ''], ['Hết giờ vào làm', st.openToTs ? fmtTime(st.openToTs) : ''], ['Kết thúc bài', st.endAtTs ? fmtTime(st.endAtTs) : ''], ['Xuất lúc', fmtTime(Date.now())], [],
      [{ v: 'Phần mềm được tạo bởi Lê Duy Nam — Giảng viên Trường Cao đẳng Dầu khí', s: 6 }]];
    const rows3 = [[H('Họ và tên'), H('Lớp'), H('Lần'), H('Câu'), H('Loại'), H('Nội dung câu hỏi'), H('HS chọn / trả lời'), H('Đáp án'), H('Kết quả')]];
    const strip = (h) => String(h || '').replace(/<img[^>]*>/g, '[CT]').replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
    if (curExam) res.forEach(r => {
      let det; try { det = JSON.parse(r['Chi tiết']); } catch (e) { return; }
      const paper = QuizCore.buildPaper(curExam, det.seed);
      paper.items.forEach((it, i) => {
        const q = curExam.banks[it.b].questions[it.q], d = det.d[i] || [];
        if (q.type === 'speak') rows3.push([C(r['Họ và tên']), C(r['Lớp']), N(r['Lần'] || 1), N(i + 1), C('Nói'), C(strip(q.stem).slice(0, 300)), C(d[2] && d[2].rec ? 'https://drive.google.com/file/d/' + d[2].rec + '/view' : '(không ghi âm)'), C(strip(q.answer).slice(0, 300)), C('')]);
        else if (q.type === 'fill') rows3.push([C(r['Họ và tên']), C(r['Lớp']), N(r['Lần'] || 1), N(i + 1), C('ĐK'), C(strip(q.stem).slice(0, 300)), C((d[2] || []).map((x, k) => '(' + (k + 1) + ') ' + (x || '—')).join('; ')), C(q.blanks.map((a, k) => '(' + (k + 1) + ') ' + a.join(a.some(x => x.indexOf('/') >= 0) ? ' | ' : '/')).join('; ')), C((d[3] || []).filter(Boolean).length + '/' + q.blanks.length + ' đúng')]);
        else if (q.type === 'mc') rows3.push([C(r['Họ và tên']), C(r['Lớp']), N(r['Lần'] || 1), N(q.num || i + 1), C(q.part ? 'Part ' + q.part : 'TN'), C(strip(q.stem).slice(0, 300)), C((d[2] || []).map(x => L[x]).join(', ') || '(bỏ trống)'), C(q.correct.map(x => L[x]).join(', ')), C(d[3] ? 'Đúng' : 'Sai')]);
        else rows3.push([C(r['Họ và tên']), C(r['Lớp']), N(r['Lần'] || 1), N(i + 1), C('TL'), C(strip(q.stem).slice(0, 300)), C(String(d[2] || '').slice(0, 3000)), C(strip(q.answer).slice(0, 500)), C('')]);
      });
    });
    const blob = buildXlsx([
      { name: 'KetQua', rows: rows1, cols: [6, 28, 14, 14, 8, 11, 10, 10, 16, 16, 9, 17, 26, 10, 10], freeze: 1 },
      { name: 'TatCaLanLam', rows: rowsAll, cols: [6, 28, 14, 14, 6, 8, 11, 10, 16, 9, 17, 26], freeze: 1 },
      { name: 'ThongTin', rows: rows2, cols: [22, 70] },
      { name: 'ChiTiet', rows: rows3, cols: [26, 12, 6, 6, 6, 60, 20, 12, 9], freeze: 1 }
    ]);
    const safe = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
    download(blob, 'KetQua_' + [safe(info.mon), safe(info.lop), cur].filter(Boolean).join('_') + '.xlsx');
  };

  /* ------------------------------- sao lưu ------------------------------- */
  $('#btnBackup').onclick = () => download(new Blob([JSON.stringify({ app: 'quizapp', banks, draft })], { type: 'application/json' }), 'SaoLuu_NganHang_' + new Date().toISOString().slice(0, 10) + '.json');
  $('#restoreIn').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (!j.banks) throw new Error('File không đúng định dạng sao lưu');
      j.banks.forEach(b => { if (!banks.some(x => x.id === b.id)) banks.push(b); });
      if (j.draft && confirm('Nạp cả cấu hình đề trong file sao lưu?')) { draft = j.draft; LS.set(K.draft, draft); fillForm(); }
      await saveBanks(); toast('Đã nhập ' + j.banks.length + ' ngân hàng', 'ok');
    } catch (err) { toast(err.message, 'bad'); }
    e.target.value = '';
  };

  /* ------------------------- đề TOEIC nguyên bộ (PDF) ------------------------- */
  const bookCtx = {
    modal, closeModal, needConn, saveBanks, audioPanel, bindAudioPanel,
    api: (body) => api(conf().api, Object.assign({ key: conf().key }, body), 1),
    created: async (bank, opt) => {
      banks.push(bank); await saveBanks();
      if (opt && opt.quiet) return; // nạp nhiều đề một lần: không hỏi thay bài thi đang soạn
      const ks = ['L', 'R', 'S'].filter(k => bank.questions.some(q => q.skill === k));
      const spk = ks.length === 1 && ks[0] === 'S';
      const mins = spk ? Math.max(10, Math.ceil(bank.questions.reduce((s, q) => s + (q.rec || 60) + (q.prep || 0) + 20, 0) / 60)) : ks.length > 1 ? 120 : ks[0] === 'L' ? 45 : 75;
      const book = !!bank.book;
      const fresh = !draft.groups.length || confirm('Dùng đề "' + bank.name + '" cho bài thi đang soạn ở bước 2? (thay các nhóm câu hiện có, đặt sẵn cài đặt: ' + (spk ? 'đề Nói, ' : 'thi TOEIC: tự do, ') + mins + ' phút' + (spk ? '' : ', nghe 1 lần') + ')');
      if (fresh) {
        draft.groups = ks.map(k => ({ bankId: bank.id, skill: k, pick: 'random', count: '', range: '', list: '', sec: '', pts: '', shuffleOpts: !book && k === 'R' }));
        draft.settings = Object.assign({}, draft.settings, { navMode: 'free', freeTime: 'total', totalMin: mins, order: book || spk ? 'keep' : (draft.settings.order || 'keep'), audioPlays: 1, toeic: !spk, maxViolations: draft.settings.maxViolations != null ? draft.settings.maxViolations : 3 });
        draft.info = Object.assign({}, draft.info, { loai: 'Thi thử TOEIC', noiDung: bank.name });
        LS.set(K.draft, draft); fillForm();
      }
    }
  };
  if ($('#bookOpen')) $('#bookOpen').onclick = () => { if (!window.QuizBook) return toast('Thiếu js/booklet.js', 'bad'); QuizBook.openImport(bookCtx); };
  if ($('#keyOpen')) $('#keyOpen').onclick = () => { if (!window.QuizBook || !window.QuizEts) return toast('Thiếu js/etskey.js', 'bad'); QuizBook.openText(bookCtx); };
  if ($('#speakOpen')) $('#speakOpen').onclick = () => { if (!window.QuizBook || !window.QuizEts) return toast('Thiếu js/etskey.js', 'bad'); QuizBook.openSpeak(bookCtx); };

  /* ------------------------------- khởi động ------------------------------- */
  fillForm();
  loadBanks().then(() => { const t = LS.get(K.tab, 'banks'); showTab(conf().api ? t : (t === 'results' ? 'setup' : t)); });
})();
