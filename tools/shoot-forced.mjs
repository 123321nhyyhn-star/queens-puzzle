// 拍「唯一位置提示」的样子：放满除最后一格以外的皇后，截棋盘 / 单格特写
// 用法: node tools/shoot-forced.mjs [url]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire('C:/Users/CJL/.workbuddy/binaries/node/workspace/');
const puppeteer = require('puppeteer-core');

const URL = process.argv[2] || 'http://127.0.0.1:8080/';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'E:/Projects/Games/queens-puzzle/tools/shots';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--force-device-scale-factor=3']
});
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 900, deviceScaleFactor: 3 });
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__QUEENS_DEBUG__ && __QUEENS_DEBUG__.state.regions.length > 0', { timeout: 15000 });
await sleep(600);

// 把呼吸动画钉在指定相位，避免随机撞到中间态
async function pin(phase) {
  await page.evaluate((p) => {
    for (const st of document.querySelectorAll('style[data-pin]')) st.remove();
    const s = document.createElement('style');
    s.dataset.pin = '1';
    s.textContent = `.cell.is-forced::before{animation-play-state:paused !important;animation-delay:${p}s !important;}`;
    document.head.appendChild(s);
  }, phase);
  await sleep(120);
}

for (const size of [8, 16]) {
  await page.evaluate((n) => { __QUEENS_DEBUG__.newGame(n, 'shot'); }, size);
  await page.waitForFunction((want) => {
    const d = __QUEENS_DEBUG__;
    return d.state.regions.length > 0 && d.state.size === want;
  }, { timeout: 25000 }, size);
  await sleep(700);

  const meta = await page.evaluate(() => {
    const d = __QUEENS_DEBUG__, n = d.state.size;
    const sol = Array.from(d.state.solution, (c, r) => r * n + c);
    d.state.marks.fill(0);
    for (let r = 0; r < n - 1; r++) d.state.marks[sol[r]] = 2;
    d.render(false);
    const f = document.querySelector('.cell.is-forced');
    const g = document.getElementById('grid').getBoundingClientRect();
    const fr = f.getBoundingClientRect();
    return {
      n, cell: Math.round(fr.width),
      forced: [...document.querySelectorAll('.cell.is-forced')].map(el => +el.dataset.i),
      aria: f.getAttribute('aria-label'),
      grid: { x: g.x, y: g.y, w: g.width, h: g.height },
      cellBox: { x: fr.x, y: fr.y, w: fr.width }
    };
  });
  console.log(`size ${meta.n}  cell=${meta.cell}px  forced=${meta.forced.join(',')}  ${meta.aria}`);

  // captureBeyondViewport:false —— 否则 clip 截图会走离屏重绘，带 opacity 关键帧的描边会停在首帧
  for (const [tag, phase] of [['peak', -1.4], ['trough', 0]]) {
    await pin(phase);
    await page.screenshot({
      path: `${OUT}/forced-${meta.n}-${tag}.png`,
      captureBeyondViewport: false,
      clip: { x: meta.grid.x - 6, y: meta.grid.y - 6, width: meta.grid.w + 12, height: meta.grid.h + 12 }
    });
    await page.screenshot({
      path: `${OUT}/forced-${meta.n}-${tag}-zoom.png`,
      captureBeyondViewport: false,
      clip: {
        x: meta.cellBox.x - meta.cellBox.w * 1.2, y: meta.cellBox.y - meta.cellBox.w * 1.2,
        width: meta.cellBox.w * 3.4, height: meta.cellBox.w * 3.4
      }
    });
  }
  console.log(`  shots forced-${meta.n}-*`);
}
await browser.close();
