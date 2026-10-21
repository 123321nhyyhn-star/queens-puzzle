/* 把一盘棋的引导逐步截图，并打印每步高亮的内容（行/列/色块/格） */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire('C:/Users/CJL/.workbuddy/binaries/node/workspace/');
const puppeteer = require('puppeteer-core');

const OUT = 'E:/Projects/Games/queens-puzzle/tools/shots';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const n = parseInt(process.argv[2] || '8', 10);
const want = process.argv[3] || 'rows';   // 想要出现的高亮类型

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=2']
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__QUEENS_DEBUG__ && __QUEENS_DEBUG__.state.vibe', { timeout: 20000 });
await sleep(300);

let found = false;
for (let trial = 0; trial < 40 && !found; trial++) {
  await page.evaluate((nn) => __QUEENS_DEBUG__.newGame(nn), n);
  await page.waitForFunction((nn) => __QUEENS_DEBUG__.state.size === nn && __QUEENS_DEBUG__.state.vibe, { timeout: 30000 }, n);
  await sleep(260);
  await page.click('#btnHint');
  await sleep(220);
  const info = await page.evaluate(() => {
    const g = __QUEENS_DEBUG__.guide();
    if (!g.open) return null;
    return {
      kind: g.plan.kind, rule: g.plan.rule, steps: g.plan.steps.length,
      hl: g.plan.steps.map(s => ({
        rows: (s.hl.rows || []).length, cols: (s.hl.cols || []).length,
        regions: (s.hl.regions || []).length, cells: (s.hl.cells || []).length,
        kill: !!s.hl.kill, text: s.text
      }))
    };
  });
  if (!info) { await page.evaluate(() => __QUEENS_DEBUG__.guideClose()); continue; }
  const has = info.hl.some(h => h[want] > 0);
  if (!has) { await page.evaluate(() => __QUEENS_DEBUG__.guideClose()); continue; }

  found = true;
  console.log(`trial ${trial}: ${info.kind}/${info.rule}, ${info.steps} 步`);
  info.hl.forEach((h, i) => console.log(
    `  ${i}: 行${h.rows} 列${h.cols} 色块${h.regions} 格${h.cells}${h.kill ? ' 叉' : ''} — ${h.text}`));
  for (let i = 0; i < info.steps; i++) {
    await sleep(420);
    await page.screenshot({ path: `${OUT}/step-${n}-${i + 1}.png` });
    if (i < info.steps - 1) { await page.click('#coachNext'); await sleep(140); }
  }
}
if (!found) console.log(`40 盘里没有出现 ${want} 高亮`);
await browser.close();
