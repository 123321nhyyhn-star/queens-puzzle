/* 顶栏余量测量：判断再加一个 pill 会不会挤爆 320px */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/CJL/.workbuddy/binaries/node/workspace/');
const puppeteer = require('puppeteer-core');

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
for (const w of [320, 360, 390, 430, 768]) {
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
    return {
      bar: Math.round(bar.width),
      brand: r('.brand'), stats: r('.stats'), actions: r('.actions'),
      size: r('#btnSize'), time: r('#timePill'), queen: r('#queenPill'),
      gap: Math.round(parseFloat(getComputedStyle(document.querySelector('.topbar')).gap) || 0),
      statsGap: Math.round(parseFloat(getComputedStyle(document.querySelector('.stats')).gap) || 0),
      toolbarW: Math.round(document.querySelector('#toolbar').getBoundingClientRect().width)
    };
  });
  const free = info.bar - (info.brand.r - info.brand.l) - (info.stats.r - info.stats.l) - (info.actions.r - info.actions.l) - info.gap * 2;
  console.log(`${String(w).padStart(4)}px  brand ${String(info.brand.w).padStart(3)}  stats ${String(info.stats.w).padStart(3)}` +
    ` (${info.size.w}/${info.time.w}/${info.queen.w})  actions ${String(info.actions.w).padStart(3)}` +
    `  → 剩余 ${String(free).padStart(4)}px  toolbar ${info.toolbarW}px`);
}
await browser.close();
