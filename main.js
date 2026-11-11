/* =====================================================================
 * Trộn đề thi Online — bản ứng dụng Windows / macOS (Electron)
 * Phần mềm được tạo bởi Lê Duy Nam — Giảng viên Trường Cao đẳng Dầu khí
 *
 * - Mở trang web phần mềm (siteUrl trong app-config.json) => luôn là bản mới nhất.
 *   Mất mạng / chưa điền siteUrl => dùng bản trang web đóng gói sẵn trong thư mục app/.
 * - Trang làm bài (thi.html): bật chống chụp/quay màn hình của hệ điều hành
 *   (Windows 10 2004+ / 11: cửa sổ bị loại khỏi ảnh chụp, Snipping Tool, quay màn hình, chia sẻ Teams/Zoom).
 * ===================================================================== */
'use strict';
const { app, BrowserWindow, Menu, shell, protocol, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_TITLE = 'Trộn đề thi Online';
const AUTHOR = 'Lê Duy Nam — Giảng viên Trường Cao đẳng Dầu khí';
const ICON = path.join(__dirname, 'build', 'icon.png');
const APP_DIR = path.join(__dirname, 'app');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'app-config.json'), 'utf8')); } catch (e) { return {}; }
}
const cfg = readConfig();
let SITE = String(cfg.siteUrl || '').trim();
if (SITE && !/^https:\/\//i.test(SITE)) SITE = '';
if (SITE) SITE = SITE.replace(/[^/]*\.html.*$/i, '').replace(/\/?$/, '/');
const LOCAL = 'app://local/';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

if (!app.requestSingleInstanceLock()) { app.quit(); }

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.mp3': 'audio/mpeg'
};

function serveLocal(request) {
  const u = new URL(request.url);
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(APP_DIR, p));
  if (!file.startsWith(APP_DIR)) return new Response('Forbidden', { status: 403 });
  let data;
  try { data = fs.readFileSync(file); } catch (e) { return new Response('Không tìm thấy: ' + p, { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } }); }
  if (p === '/js/config.js') {
    // gắn địa chỉ trang web công khai để link gửi học sinh trỏ đúng trang online
    data = Buffer.concat([data, Buffer.from('\nwindow.QUIZ_PUBLIC_URL = ' + JSON.stringify(SITE) + ';\n', 'utf8')]);
  }
  return new Response(data, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' } });
}

function isOurs(url) {
  if (!url) return false;
  if (url.startsWith(LOCAL)) return true;
  if (SITE && url.startsWith(SITE)) return true;
  // link làm bài của giáo viên khác (trang web khác) vẫn mở trong ứng dụng để được chống chụp màn hình
  return /^https:\/\/[^?#]+\/thi\.html\?/i.test(url);
}
function isExam(url) { return /\/thi\.html(\?|#|$)/i.test(url || ''); }
function protect(win, url) {
  try { win.setContentProtection(isExam(url) || !!cfg.protectAll); } catch (e) { /* hệ điều hành không hỗ trợ */ }
}

const webPrefs = () => ({ contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: !!cfg.devTools, spellcheck: false });

function wire(win) {
  const wc = win.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (isOurs(url)) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 1200, height: 840, icon: ICON, title: APP_TITLE, backgroundColor: '#0b3d5c', webPreferences: webPrefs() } };
    }
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('did-create-window', (child) => { wire(child); });
  wc.on('will-navigate', (e, url) => {
    if (!isOurs(url) && /^(https?|mailto):/i.test(url)) { e.preventDefault(); shell.openExternal(url); }
  });
  wc.on('did-start-navigation', (e) => { if (e && e.isMainFrame && e.url) protect(win, e.url); });
  wc.on('did-navigate', (e, url) => protect(win, url));
  wc.on('did-navigate-in-page', (e, url) => protect(win, url));
  wc.on('did-fail-load', (e, code, desc, url, isMain) => {
    // mất mạng => chuyển sang bản đóng gói sẵn
    if (isMain && SITE && url && url.startsWith(SITE) && code !== -3) {
      const rest = url.slice(SITE.length) || 'index.html';
      win.loadURL(LOCAL + rest);
    }
  });
  // Chặn các phím mở công cụ nhà phát triển / tải lại khi đang làm bài
  wc.on('before-input-event', (e, input) => {
    if (!isExam(wc.getURL())) return;
    const k = (input.key || '').toLowerCase();
    if (k === 'f12' || ((input.control || input.meta) && input.shift && ['i', 'j', 'c'].includes(k))) e.preventDefault();
  });
}

function createWindow(startUrl) {
  const win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 880, minHeight: 600, title: APP_TITLE, icon: ICON,
    backgroundColor: '#0b3d5c', show: false, webPreferences: webPrefs()
  });
  win.once('ready-to-show', () => win.show());
  wire(win);
  protect(win, startUrl);
  win.loadURL(startUrl);
  return win;
}

function home() { return (SITE || LOCAL) + 'index.html'; }
function go(page) {
  const w = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const base = (w && w.webContents.getURL().startsWith(LOCAL)) ? LOCAL : (SITE || LOCAL);
  if (w) w.loadURL(base + page); else createWindow(base + page);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ label: APP_TITLE, submenu: [{ label: 'Giới thiệu', click: about }, { type: 'separator' }, { role: 'hide', label: 'Ẩn' }, { role: 'quit', label: 'Thoát' }] }] : []),
    { label: 'Tệp', submenu: [
      { label: 'Trang chủ', accelerator: 'CmdOrCtrl+H', click: () => go('index.html') },
      { label: 'Trang giáo viên', accelerator: 'CmdOrCtrl+G', click: () => go('giaovien.html') },
      { label: 'Hướng dẫn', click: () => go('huong-dan.html') },
      { type: 'separator' },
      isMac ? { role: 'close', label: 'Đóng cửa sổ' } : { role: 'quit', label: 'Thoát' }
    ] },
    { label: 'Chỉnh sửa', submenu: [
      { role: 'undo', label: 'Hoàn tác' }, { role: 'redo', label: 'Làm lại' }, { type: 'separator' },
      { role: 'cut', label: 'Cắt' }, { role: 'copy', label: 'Sao chép' }, { role: 'paste', label: 'Dán' }, { role: 'selectAll', label: 'Chọn tất cả' }
    ] },
    { label: 'Xem', submenu: [
      { role: 'reload', label: 'Tải lại' },
      { type: 'separator' },
      { role: 'zoomIn', label: 'Phóng to' }, { role: 'zoomOut', label: 'Thu nhỏ' }, { role: 'resetZoom', label: 'Cỡ chữ mặc định' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: 'Toàn màn hình' }
    ] },
    { label: 'Trợ giúp', submenu: [{ label: 'Giới thiệu phần mềm', click: about }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function about() {
  dialog.showMessageBox({
    type: 'info', title: 'Giới thiệu', icon: ICON, buttons: ['Đóng'],
    message: APP_TITLE + ' — phiên bản ' + app.getVersion(),
    detail: 'Phần mềm trộn đề trắc nghiệm, điền khuyết và tự luận.\n\nPhần mềm được tạo bởi ' + AUTHOR + '.\n\n' +
      (SITE ? 'Đang dùng trang web: ' + SITE : 'Đang dùng bản đóng gói sẵn (chưa cấu hình địa chỉ trang web).')
  });
}

app.on('second-instance', () => {
  const w = BrowserWindow.getAllWindows()[0];
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});

// Dấu hiệu để trang web biết đang chạy trong phần mềm (dùng cho đề "Bắt buộc làm bằng phần mềm")
app.userAgentFallback = (app.userAgentFallback || '') + ' TronDeThiApp/' + app.getVersion();

app.whenReady().then(() => {
  protocol.handle('app', serveLocal);
  // YouTube (nhạc nền) cần Referer hợp lệ khi chạy trong bản đóng gói sẵn
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://www.youtube.com/*', 'https://*.youtube.com/*', 'https://*.youtube-nocookie.com/*', 'https://*.googlevideo.com/*', 'https://*.ytimg.com/*'] },
    (d, cb) => {
      const h = d.requestHeaders;
      if (!h.Referer || /^app:/i.test(h.Referer)) h.Referer = SITE || 'https://www.youtube.com/';
      cb({ requestHeaders: h });
    });
  buildMenu();
  createWindow(home());
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(home()); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
