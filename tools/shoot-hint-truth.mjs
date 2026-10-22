/* 截一张「修好之后」的图：盘面落后时的补划提示 + 补划之后的落子提示
   用法：node tools/shoot-hint-truth.mjs [url]
*/
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/CJL/.workbuddy/binaries/node/workspace/');
const puppeteer = require('puppeteer-core');

const URL = process.argv[2] || 'http://127.0.0.1:8080/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=2']
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__QUEENS_DEBUG__ && __QUEENS_DEBUG__.state.regions.length > 0', { timeout: 15000 });
await sleep(600);

const info = await page.evaluate(() => {
  const d = __QUEENS_DEBUG__;
  const H = window.QueensHint;
  d.settings.autoMark = false;
  const rand = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  for (const n of [6, 8]) {
    for (let s = 0; s < 60; s++) {
      d.newGame(n, (s * 7919 + n * 104729) >>> 0);
      const st = d.state;
      if (st.size !== n) continue;
      const total = n * n;
      const isSol = new Uint8Array(total);
      for (let r = 0; r < n; r++) isSol[r * n + st.solution[r]] = 1;
      const rnd = rand(s * 2654435761 + 13);
      const marks = new Uint8Array(total);
      const qCount = Math.floor(rnd() * n);
      const order = [];
      for (let r = 0; r < n; r++) order.push(r * n + st.solution[r]);
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      for (let k = 0; k < qCount; k++) marks[order[k]] = 2;
      const xCount = Math.floor(rnd() * total * 0.5);
      for (let k = 0; k < xCount; k++) {
        const i = Math.floor(rnd() * total);
        if (marks[i]) continue;
        if (isSol[i]) continue;
        marks[i] = 1;
      }
      st.marks = Array.from(marks);
      d.render();
      const p = H.plan({ n, regions: st.regions, solution: st.solution, marks: st.marks, auto: null, maxK: 3, allowProbe: true });
      if (p.rule !== 'C1') continue;
      d.useHint();
      return { n, seed: (s * 7919 + n * 104729) >>> 0, stale: p.action.cells };
    }
  }
  return null;
});

if (!info) { console.log('没找到合适的局面'); await browser.close(); process.exit(1); }
await sleep(500);
await page.screenshot({ path: 'E:/Projects/Games/queens-puzzle/tools/shots/hint-truth-1.png' });
console.log('补划局面:', JSON.stringify(info));

// 走到最后一步（照做前）
await page.evaluate(() => { for (let i = 0; i < 2; i++) __QUEENS_DEBUG__.guideNext(); });
await sleep(400);
await page.screenshot({ path: 'E:/Projects/Games/queens-puzzle/tools/shots/hint-truth-2.png' });

// 照做 → 再看提示
await page.evaluate(async () => {
  const d = __QUEENS_DEBUG__;
  d.guideNext();
  await new Promise((r) => setTimeout(r, 300));
  d.useHint();
});
await sleep(600);
await page.screenshot({ path: 'E:/Projects/Games/queens-puzzle/tools/shots/hint-truth-3.png' });
const txt = await page.evaluate(() => __QUEENS_DEBUG__.guide().plan.steps.map((s) => s.text));
console.log('补划后的提示:', txt.join(' | '));

await browser.close();
