/* 顶栏 / 信息条余量测量：判断 320px 上会不会挤爆 */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/CJL/.workbuddy/binaries/node/workspace/');
const puppeteer = require('puppeteer-core');

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
for (const w of [320, 360, 390, 430, 560, 768]) {
  await page.setViewport({ width: w, height: 780, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 300));
  const info = await page.evaluate(() => {
    const r = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { w: Math.round(b.width), l: Math.round(b.left), r: Math.round(b.right) };
    };
    const bar = document.querySelector('.topbar').getBoundingClientRect();
    const hud = document.getElementById('btnHud').getBoundingClientRect();
    return {
      bar: Math.round(bar.width),
      brand: r('.brand'), actions: r('.actions'), hud: r('.hud'),
      size: r('#hudSize'), time: r('#timePill'), queen: r('#queenPill'), diff: r('#diffSeg'),
      gap: Math.round(parseFloat(getComputedStyle(document.querySelector('.topbar')).gap) || 0),
      hudOffset: Math.round((hud.left + hud.right) / 2 - window.innerWidth / 2),
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      toolbarW: Math.round(document.querySelector('#toolbar').getBoundingClientRect().width)
    };
  });
  const free = info.bar - (info.brand.r - info.brand.l) - (info.actions.r - info.actions.l) - info.gap * 2;
  console.log(`${String(w).padStart(4)}px  品牌 ${String(info.brand.w).padStart(3)}  图标 ${String(info.actions.w).padStart(3)}` +
    `  → 顶栏余量 ${String(free).padStart(3)}px | 信息条 ${String(info.hud.w).padStart(3)}px` +
    ` (${info.size.w}/${info.time.w}/${info.queen.w}/${info.diff ? info.diff.w : 0}) 居中差 ${info.hudOffset}` +
    `${info.overflowX ? '  ⚠ 横向溢出' : ''}  toolbar ${info.toolbarW}px`);
}
await browser.close();
