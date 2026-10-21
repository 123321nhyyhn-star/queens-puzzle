/* 横屏 / 矮屏专项：引导面板开着时棋盘会不会被挤出屏幕 */
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
    await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle0' });
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
        coachBottom: Math.round(c.bottom),
        overlap: Math.round(c.bottom - b.top),
        toolbarBottom: Math.round(t.bottom), vh: window.innerHeight,
        offscreen: Math.round(t.bottom - window.innerHeight)
      };
    });
    const bad = after.overlap > 1 || after.offscreen > 0;
    console.log(`${w}×${h} n=${n}: 面板 ${after.coachH} 棋盘 ${after.boardH} (前 ${before.board}) ` +
      `重叠 ${after.overlap} 工具栏底 ${after.toolbarBottom}/${after.vh}${bad ? '  ⚠' : ''}`);
  }
}
console.log('错误:', errs.length ? errs : '无');
await browser.close();
