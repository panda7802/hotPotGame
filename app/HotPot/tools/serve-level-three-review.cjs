'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../build/web-level3-review');
const port = Number(process.env.PORT || 8913);
const entry = `
(async function () {
  const timer = setInterval(async () => {
    if (!window.System) return;
    let cc;
    try { cc = await System.import('cc'); } catch { return; }
    const find = node => {
      const game = node?.getComponent('HotPotGame');
      if (game) return game;
      for (const child of node?.children || []) {
        const found = find(child); if (found) return found;
      }
    };
    const game = find(cc.director.getScene());
    if (!game?.achievementNotificationsReady || !game?.levelData) return;
    clearInterval(timer);
    game.checkpointGame = () => {};
    game.setSoundEnabled?.(false);
    const query = new URLSearchParams(location.search);
    const level = Math.max(0, Math.min(2, Number(query.get('level') || 3) - 1));
    game.loadLevel(level, false);
    game.selectPageStyle(1);
    game.positionReferenceShell();
    const toast = game.node.getChildByName('DesignToast');
    if (toast) toast.active = false;
    window.__levelReview = {game, cc};
  }, 120);
})();`;
const mime = {'.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.wasm': 'application/wasm', '.mp3': 'audio/mpeg'};
http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  // Review stays local, including SDK loading and account requests.
  res.setHeader('Content-Security-Policy',
    "connect-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/__review-entry.js') {
    res.setHeader('Content-Type', mime['.js']); return res.end(entry);
  }
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)
    || !fs.statSync(file).isFile()) return res.writeHead(404).end();
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  if (file === path.join(root, 'index.html')) {
    return res.end(fs.readFileSync(file, 'utf8').replace('</body>',
      '<script src="/__review-entry.js"></script></body>'));
  }
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => {
  console.log('Third-level review: http://127.0.0.1:' + port);
});
