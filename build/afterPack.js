// Ký "ad-hoc" bản Mac để chạy được trên máy Apple Silicon (M1/M2/M3…) khi không có chứng chỉ Apple Developer.
// Lỗi ký không làm hỏng cả quá trình đóng gói (chỉ ghi cảnh báo).
const { execSync } = require('child_process');
const path = require('path');
exports.default = async function (ctx) {
  if (ctx.electronPlatformName !== 'darwin') return;
  const appPath = path.join(ctx.appOutDir, ctx.packager.appInfo.productFilename + '.app');
  const run = (cmd) => { console.log('  • ' + cmd); execSync(cmd, { stdio: 'inherit' }); };
  try { run('xattr -cr "' + appPath + '"'); } catch (e) { console.warn('  ! xattr: ' + e.message); }
  try { run('codesign --force --deep --sign - "' + appPath + '"'); } catch (e) { console.warn('  ! ad-hoc codesign that bai (van tiep tuc): ' + e.message); }
};
