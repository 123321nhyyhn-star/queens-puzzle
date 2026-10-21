/* 难度标签的界面检查 + 截图 */
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

const chip = await page.evaluate(() => {
  const b = document.getElementById('btnDiff');
  const r = b.getBoundingClientRect();
  const row = document.querySelector('.hint-row').getBoundingClientRect();
  const hint = document.getElementById('hint').getBoundingClientRect();
  return {
    hidden: b.hidden, text: b.textContent.trim().replace(/\s+/g, ' '),
    aria: b.getAttribute('aria-label'),
    w: Math.round(r.width), h: Math.round(r.height),
    rowW: Math.round(row.width), hintW: Math.round(hint.width),
    overlap: Math.round(hint.right - r.left)
  };
});
console.log('标签:', JSON.stringify(chip, null, 0));

await page.screenshot({ path: OUT + '/diff-chip-390.png' });
await page.click('#btnDiff');
await sleep(400);
const dlg = await page.evaluate(() => {
  const w = document.getElementById('diffWrap');
  const sh = document.getElementById('diffSheet');
  return {
    open: !w.hidden,
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
console.log('弹层:', JSON.stringify(dlg, null, 0));
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
await page.click('#btnDiff');
await sleep(400);
await page.screenshot({ path: OUT + '/diff-sheet-16.png' });

// 320 窄屏
await page.setViewport({ width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await sleep(500);
const narrow = await page.evaluate(() => {
  const b = document.getElementById('btnDiff').getBoundingClientRect();
  const h = document.getElementById('hint').getBoundingClientRect();
  const stage = document.getElementById('stage').getBoundingClientRect();
  return {
    chipRight: Math.round(b.right), stageRight: Math.round(stage.right),
    hintRight: Math.round(h.right), overlap: Math.round(h.right - b.left),
    overflow: document.documentElement.scrollWidth > window.innerWidth
  };
});
console.log('320px:', JSON.stringify(narrow));
await page.screenshot({ path: OUT + '/diff-320.png' });

// 其他设备尺寸（先收起弹层，看标签本身）
await page.keyboard.press('Escape');
await sleep(250);
for (const [w, h, tag] of [[430, 932, '430'], [360, 740, '360'], [740, 360, '横屏']]) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(500);
  const fit = await page.evaluate(() => {
    const b = document.getElementById('btnDiff').getBoundingClientRect();
    const hEl = document.getElementById('hint').getBoundingClientRect();
    return {
      chipRight: Math.round(b.right), chipBottom: Math.round(b.bottom),
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
