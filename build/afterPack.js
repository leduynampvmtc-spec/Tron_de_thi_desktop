// Ký "ad-hoc" bản Mac để chạy được trên máy Apple Silicon (M1/M2/M3…) khi không có chứng chỉ Apple Developer.
const { execSync } = require('child_process');
const path = require('path');
exports.default = async function (ctx) {
  if (ctx.electronPlatformName !== 'darwin') return;
  const appPath = path.join(ctx.appOutDir, ctx.packager.appInfo.productFilename + '.app');
  console.log('  • ad-hoc codesign', appPath);
  execSync('codesign --force --deep --sign - "' + appPath + '"', { stdio: 'inherit' });
};
