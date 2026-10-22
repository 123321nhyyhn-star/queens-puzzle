/* 放大看色块描边的拐角：随机若干盘，裁其中一块区域放大 4 倍 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire('C:/Users/CJL/.workbuddy/binaries/node/workspace/');
const puppeteer = require('puppeteer-core');

const OUT = 'E:/Projects/Games/queens-puzzle/tools/shots';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();

for (const [n, dpr] of [[6, 4], [8, 4], [12, 5]]) {
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  await page.goto('http://127.0.0.1:8089/', { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__QUEENS_DEBUG__ && __QUEENS_DEBUG__.state.vibe', { timeout: 20000 });
  await page.evaluate((nn) => __QUEENS_DEBUG__.newGame(nn), n);
  await page.waitForFunction((nn) => __QUEENS_DEBUG__.state.size === nn && __QUEENS_DEBUG__.state.vibe, { timeout: 30000 }, n);
  await sleep(700);   // 等开局翻入动画结束
  const box = await page.evaluate((nn) => {
    const b = document.getElementById('board').getBoundingClientRect();
    const cell = b.width / nn;
    // 取棋盘中间 2.5 格见方一块，一定能截到 T 形交汇
    const w = cell * 2.6 * nn / 6;
    return { x: Math.round(b.left + b.width / 2 - w / 2), y: Math.round(b.top + b.height / 2 - w / 2), width: Math.round(w), height: Math.round(w) };
  }, n);
  await page.screenshot({ path: `${OUT}/corner-${n}.png`, clip: box, captureBeyondViewport: false });
  console.log(`n=${n} dpr=${dpr} 已截 ${JSON.stringify(box)}`);
}
await browser.close();
