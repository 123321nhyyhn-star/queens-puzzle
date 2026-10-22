/* 信息条 + 本局信息页的界面检查 + 截图 */
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
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=2']
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__QUEENS_DEBUG__ && __QUEENS_DEBUG__.state.vibe', { timeout: 20000 });
await sleep(500);

const hud = await page.evaluate(() => {
  const b = document.getElementById('btnHud');
  const r = b.getBoundingClientRect();
  const seg = document.getElementById('diffSeg').getBoundingClientRect();
  return {
    hidden: document.getElementById('diffSeg').hidden,
    text: b.textContent.replace(/\s+/g, ' ').trim(),
    aria: b.getAttribute('aria-label'),
    w: Math.round(r.width), h: Math.round(r.height),
    segW: Math.round(seg.width),
    centered: Math.round((r.left + r.right) / 2 - window.innerWidth / 2),
    overflowX: document.documentElement.scrollWidth > window.innerWidth
  };
});
console.log('信息条:', JSON.stringify(hud, null, 0));

await page.screenshot({ path: OUT + '/diff-chip-390.png' });
await page.click('#btnHud');
await sleep(400);
const dlg = await page.evaluate(() => {
  const w = document.getElementById('diffWrap');
  const sh = document.getElementById('diffSheet');
  return {
    open: !w.hidden,
    title: document.getElementById('diffTitle').textContent,
    cards: ['infoSize', 'infoTime', 'infoQueens'].map(id => document.getElementById(id).textContent),
    big: document.getElementById('diffBig').textContent,
    badge: document.getElementById('diffBadge').textContent,
    lead: document.getElementById('diffLead').textContent,
    rows: Array.from(document.querySelectorAll('.diff-step')).map(el =>
      el.querySelector('.ds-name').textContent + el.querySelector('.ds-n').textContent),
    scroll: sh.scrollHeight > sh.clientHeight + 2,
    h: Math.round(sh.getBoundingClientRect().height),
    vh: window.innerHeight
  };
});
console.log('信息页:', JSON.stringify(dlg, null, 0));
await page.screenshot({ path: OUT + '/diff-sheet-390.png' });

// Esc 关闭
await page.keyboard.press('Escape');
await sleep(300);
console.log('Esc 关闭:', await page.evaluate(() => document.getElementById('diffWrap').hidden));

// 16×16
await page.evaluate(() => __QUEENS_DEBUG__.newGame(16));
await page.waitForFunction('__QUEENS_DEBUG__.state.size === 16 && __QUEENS_DEBUG__.state.vibe', { timeout: 30000 });
await sleep(700);
const big = await page.evaluate(() => {
  const v = __QUEENS_DEBUG__.state.vibe;
  return { level: v.level, score: v.score, steps: v.steps, raw: v.raw };
});
console.log('16×16:', JSON.stringify(big));
await page.screenshot({ path: OUT + '/diff-chip-16.png' });
await page.click('#btnHud');
await sleep(400);
await page.screenshot({ path: OUT + '/diff-sheet-16.png' });

// 320 窄屏
await page.setViewport({ width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await sleep(500);
const narrow = await page.evaluate(() => {
  const b = document.getElementById('btnHud').getBoundingClientRect();
  const h = document.getElementById('hint').getBoundingClientRect();
  return {
    hudLeft: Math.round(b.left), hudRight: Math.round(b.right),
    hintRight: Math.round(h.right),
    overflow: document.documentElement.scrollWidth > window.innerWidth
  };
});
console.log('320px:', JSON.stringify(narrow));
await page.screenshot({ path: OUT + '/diff-320.png' });

// 其他设备尺寸（先收起信息页，看信息条本身）
await page.keyboard.press('Escape');
await sleep(250);
for (const [w, h, tag] of [[430, 932, '430'], [360, 740, '360'], [740, 360, '横屏']]) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(500);
  const fit = await page.evaluate(() => {
    const b = document.getElementById('btnHud').getBoundingClientRect();
    const hEl = document.getElementById('hint').getBoundingClientRect();
    return {
      hudW: Math.round(b.width), hudBottom: Math.round(b.bottom),
      boardTop: Math.round(document.getElementById('board').getBoundingClientRect().top),
      hintRight: Math.round(hEl.right),
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      overflowY: document.documentElement.scrollHeight > window.innerHeight
    };
  });
  console.log(`${tag}:`, JSON.stringify(fit));
  await page.screenshot({ path: OUT + '/diff-' + tag + '.png' });
}

console.log('页面错误:', errs.length ? errs : '无');
await browser.close();
