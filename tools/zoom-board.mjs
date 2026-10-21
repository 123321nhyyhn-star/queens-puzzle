/* 只截棋盘（放大 3 倍），用来检查小格子上的圈画是否还看得清 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire('C:/Users/CJL/.workbuddy/binaries/node/workspace/');
const puppeteer = require('puppeteer-core');

const OUT = 'E:/Projects/Games/queens-puzzle/tools/shots';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const n = parseInt(process.argv[2] || '16', 10);
const want = process.argv[3] || 'rows';

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__QUEENS_DEBUG__ && __QUEENS_DEBUG__.state.vibe', { timeout: 20000 });
await sleep(300);

for (let trial = 0; trial < 40; trial++) {
  await page.evaluate((nn) => __QUEENS_DEBUG__.newGame(nn), n);
  await page.waitForFunction((nn) => __QUEENS_DEBUG__.state.size === nn && __QUEENS_DEBUG__.state.vibe, { timeout: 30000 }, n);
  await sleep(240);
  await page.click('#btnHint');
  await sleep(200);
  const info = await page.evaluate(() => {
    const g = __QUEENS_DEBUG__.guide();
    if (!g.open) return null;
    return { steps: g.plan.steps.length, hl: g.plan.steps.map(s => s.hl) };
  });
  if (!info) continue;
  if (!info.hl.some(h => (h[want] || []).length > 0)) {
    await page.evaluate(() => __QUEENS_DEBUG__.guideClose());
    continue;
  }
  for (let i = 0; i < info.steps; i++) {
    await sleep(500);
    const box = await page.evaluate(() => {
      const b = document.getElementById('board').getBoundingClientRect();
      return { x: b.left, y: b.top, width: b.width, height: b.height };
    });
    // captureBeyondViewport:false 必须加！否则裁剪截图会走「离屏重绘」，
    // 带 opacity 关键帧的元素（行/列色带、序号牌）会停在动画首帧，看起来像没画出来。
    await page.screenshot({ path: `${OUT}/zoom-${n}-${i + 1}.png`, clip: box, captureBeyondViewport: false });
    if (i < info.steps - 1) { await page.click('#coachNext'); await sleep(140); }
  }
  console.log(`trial ${trial} 已截图`);
  break;
}
await browser.close();
