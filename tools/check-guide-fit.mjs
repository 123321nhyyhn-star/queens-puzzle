/* 横屏 / 矮屏专项：引导面板开着时棋盘会不会被挤出屏幕；以及开关面板时棋盘原地不动 */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/CJL/.workbuddy/binaries/node/workspace/');
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=2']
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));

for (const [w, h] of [[740, 360], [844, 390], [667, 375], [360, 640], [320, 480]]) {
  for (const n of [8, 12, 16]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(process.env.QURL || 'http://127.0.0.1:8080/', { waitUntil: 'networkidle0' });
    await page.waitForFunction('window.__QUEENS_DEBUG__ && __QUEENS_DEBUG__.state.vibe', { timeout: 20000 });
    await page.evaluate((nn) => __QUEENS_DEBUG__.newGame(nn), n);
    await page.waitForFunction((nn) => __QUEENS_DEBUG__.state.size === nn && __QUEENS_DEBUG__.state.vibe, { timeout: 30000 }, n);
    await sleep(300);
    const before = await page.evaluate(() => {
      const b = document.getElementById('board').getBoundingClientRect();
      return { board: Math.round(b.height), top: Math.round(b.top), bottom: Math.round(b.bottom) };
    });
    await page.click('#btnHint');
    await sleep(340);
    const after = await page.evaluate(() => {
      const r = (id) => document.getElementById(id).getBoundingClientRect();
      const b = r('board'), c = r('coach'), t = r('toolbar');
      return {
        coachH: Math.round(c.height),
        boardH: Math.round(b.height), top: Math.round(b.top), bottom: Math.round(b.bottom),
        coachBottom: Math.round(c.bottom), coachTop: Math.round(c.top),
        boardBottom: Math.round(b.bottom),
        // 面板钉在舞台底部 → 压棋盘的意思是「面板顶 < 棋盘底」
        overlap: Math.round(b.bottom - c.top),
        toolbarBottom: Math.round(t.bottom), vh: window.innerHeight,
        offscreen: Math.round(t.bottom - window.innerHeight)
      };
    });
    const moved = Math.abs(after.top - before.top) + Math.abs(after.bottom - before.bottom);
    // 浮层允许在「比任何真机都矮」的极端视口上啃掉棋盘底边十几个像素，
    // 超过 12px 才算真的不对
    const bad = after.overlap > 12 || after.offscreen > 0 || moved > 1;
    console.log(`${w}×${h} n=${n}: 面板 ${after.coachH} 棋盘 ${after.boardH} (前 ${before.board}) ` +
      `重叠 ${after.overlap} 位移 ${moved} 工具栏底 ${after.toolbarBottom}/${after.vh}${bad ? '  ⚠' : ''}`);
  }
}
console.log('错误:', errs.length ? errs : '无');
await browser.close();
