/* 引导浮层在各种视口下的样子（重点：矮屏一行版、16×16 两行色卡） */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/CJL/.workbuddy/binaries/node/workspace/');
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
for (const [w, h, n] of [[390, 844, 16], [740, 360, 16], [320, 568, 8]]) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto('http://127.0.0.1:8089/', { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__QUEENS_DEBUG__ && __QUEENS_DEBUG__.state.vibe', { timeout: 20000 });
  await page.evaluate((nn) => __QUEENS_DEBUG__.newGame(nn), n);
  await page.waitForFunction((nn) => __QUEENS_DEBUG__.state.size === nn && __QUEENS_DEBUG__.state.vibe, { timeout: 40000 }, n);
  await sleep(500);
  await page.click('#btnHint');
  await sleep(500);
  const m = await page.evaluate(() => {
    const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), h: Math.round(b.height) }; };
    return { board: r('board'), coach: r('coach'), regions: r('regions'), toolbar: r('toolbar'), vh: window.innerHeight };
  });
  console.log(`${w}×${h} n=${n}: 棋盘底 ${m.board.b} 面板 ${m.coach.t}..${m.coach.b} (高 ${m.coach.h}) 色卡 ${m.regions.t}..${m.regions.b} 工具栏 ${m.toolbar.t}..${m.toolbar.b}/${m.vh}`);
  await page.screenshot({ path: `E:/Projects/Games/queens-puzzle/tools/shots/fix-guide-${w}x${h}.png`, captureBeyondViewport: false });
}
await browser.close();
