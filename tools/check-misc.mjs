/* ============================================================================
 * 杂项：设置面板折叠 / 无滚动条 / 淡化 × 默认关 / 拖动对齐与逐格震动 /
 *       唯一位置提示的强度 / 结果层的「重来这局」
 *
 *   python serve.py --no-open
 *   node tools/check-misc.mjs
 * ========================================================================== */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire('C:/Users/CJL/.workbuddy/binaries/node/workspace/');
const puppeteer = require('puppeteer-core');

const URL = process.argv[2] || 'http://127.0.0.1:8080/';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'E:/Projects/Games/queens-puzzle/tools/shots';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let fails = 0;
const check = (name, ok, extra = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=2']
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', e => { fails++; console.log('FAIL  pageerror: ' + e.message); });
page.on('console', m => { if (m.type() === 'error') { fails++; console.log('FAIL  console: ' + m.text()); } });

await page.evaluateOnNewDocument(() => {
  window.__vib = [];
  try {
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (p) => { window.__vib.push(p); return true; }
    });
  } catch (e) { /* 忽略 */ }
});

async function boot(fresh) {
  await page.goto(URL, { waitUntil: 'networkidle0' });
  if (fresh) {
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle0' });
  }
  await page.waitForFunction('window.__QUEENS_DEBUG__ && __QUEENS_DEBUG__.state.regions.length > 0', { timeout: 20000 });
  await sleep(500);
}

// ---------- 1. 设置面板：默认收起 / 无滚动条 / 淡化×默认关 ----------
await boot(true);

const sheet = await page.evaluate(() => {
  document.getElementById('btnSettings').click();
  const s = document.getElementById('sheet');
  const sm = document.getElementById('sheetMore');
  const more = document.getElementById('btnMoreOpts');
  const rows = [...s.querySelectorAll('.sheet-more .switch-row')];
  const cs = getComputedStyle(s);
  return {
    moreHidden: sm.hidden,
    moreText: document.getElementById('moreOptsLabel').textContent.trim(),
    moreAria: more.getAttribute('aria-expanded'),
    visibleRows: rows.filter(r => r.getClientRects().length).length,
    totalRows: rows.length,
    fadeMark: document.getElementById('swFadeMark').getAttribute('aria-checked'),
    alignDrag: document.getElementById('swAlignDrag').getAttribute('aria-checked'),
    alignDragVisible: !!document.getElementById('swAlignDrag').getClientRects().length,
    scrollbarWidth: s.offsetWidth - s.clientWidth -
      parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth),
    sbCss: cs.scrollbarWidth,
    overflow: s.scrollHeight - s.clientHeight,
    settingsFade: __QUEENS_DEBUG__.settings.fadeMark
  };
});
check('设置面板默认收起更多选项', sheet.moreHidden === true && sheet.moreAria === 'false', sheet.moreText);
check('收起时偏好开关一个都不露（只留挑战那两行）', sheet.visibleRows === 0, `${sheet.visibleRows} 行`);
check('淡化 × 默认关闭', sheet.fadeMark === 'false' && sheet.settingsFade === false);
check('拖动对齐开关存在（收起时不露）', sheet.alignDrag === 'true' && !sheet.alignDragVisible);
check('面板没有垂直滚动条', sheet.scrollbarWidth === 0 && sheet.sbCss === 'none', `sbw=${sheet.scrollbarWidth} css=${sheet.sbCss} overflow=${sheet.overflow}`);
await sleep(450);
await page.screenshot({ path: `${OUT}/misc-sheet-collapsed.png` });

// ---------- 2. 展开 / 会话记忆 ----------
const expanded = await page.evaluate(() => {
  document.getElementById('btnMoreOpts').click();
  const sm = document.getElementById('sheetMore');
  const s = document.getElementById('sheet');
  return {
    hidden: sm.hidden,
    text: document.getElementById('moreOptsLabel').textContent.trim(),
    aria: document.getElementById('btnMoreOpts').getAttribute('aria-expanded'),
    scrollbarWidth: s.offsetWidth - s.clientWidth -
      parseFloat(getComputedStyle(s).borderLeftWidth) * 2,
    rows: [...s.querySelectorAll('.switch-row')].filter(r => r.getClientRects().length).length,
    shareVisible: !!document.getElementById('shareCode').getClientRects().length,
    shareH: document.getElementById('shareCode').style.height
  };
});
check('点开后露出更多选项', expanded.hidden === false && expanded.rows >= 8 && expanded.shareVisible, `${expanded.rows} 行 · ${expanded.text}`);
check('开开后仍然没有滚动条', expanded.scrollbarWidth === 0);
await sleep(450);
await page.screenshot({ path: `${OUT}/misc-sheet-expanded.png` });

const stillOpen = await page.evaluate(() => {
  document.getElementById('btnCloseSheet').click();
  document.getElementById('btnSettings').click();
  return !document.getElementById('sheetMore').hidden;
});
check('会话内重开面板保持展开', stillOpen === true);

await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction('window.__QUEENS_DEBUG__ && __QUEENS_DEBUG__.state.regions.length > 0', { timeout: 20000 });
await sleep(400);
const collapsedAgain = await page.evaluate(() => {
  document.getElementById('btnSettings').click();
  return document.getElementById('sheetMore').hidden;
});
check('刷新后回到收起（不持久化）', collapsedAgain === true);
await page.evaluate(() => document.getElementById('btnCloseSheet').click());
await sleep(200);

// ---------- 3. 拖动：对齐 / 随意 + 每格震动 ----------
async function dragInBoard(dxCells, dyCells, alignDrag) {
  await page.evaluate((align) => {
    __QUEENS_DEBUG__.settings.alignDrag = align;
    __QUEENS_DEBUG__.clear();
    window.__vib.length = 0;
  }, alignDrag);
  await sleep(120);
  const geo = await page.evaluate(() => {
    const g = document.getElementById('grid').getBoundingClientRect();
    return { x: g.x, y: g.y, w: g.width, n: __QUEENS_DEBUG__.state.size };
  });
  const step = geo.w / geo.n;
  const sx = geo.x + step * 0.5;
  const sy = geo.y + step * 1.5;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + step * dxCells, sy + step * dyCells, { steps: 26 });
  await page.mouse.up();
  await sleep(180);
  return page.evaluate(() => {
    const n = __QUEENS_DEBUG__.state.size;
    const out = [];
    for (let i = 0; i < n * n; i++) if (__QUEENS_DEBUG__.state.marks[i] === 1) out.push(i);
    return { n, cols: out.map(i => i % n), rows: out.map(i => (i / n) | 0), vib: window.__vib.slice() };
  });
}

const aligned = await dragInBoard(4, 2, true);
check('对齐拖动只涂起始那一行',
  aligned.rows.length > 1 && aligned.rows.every(r => r === 1),
  `rows=${[...new Set(aligned.rows)].join(',')} cols=${aligned.cols.join(',')}`);
check('对齐拖动每格都有震动', aligned.vib.length >= aligned.cols.length,
  `vib=${aligned.vib.length} cells=${aligned.cols.length} sample=${JSON.stringify(aligned.vib.slice(0, 3))}`);

const free = await dragInBoard(4, 2, false);
check('关掉对齐后可以斜着涂',
  free.rows.length > 1 && new Set(free.rows).size > 1,
  `rows=${[...new Set(free.rows)].join(',')}`);

// ---------- 4. 唯一位置提示的视觉强度 ----------
const forced = await page.evaluate(() => {
  __QUEENS_DEBUG__.settings.alignDrag = true;
  __QUEENS_DEBUG__.settings.autoMark = true;
  const d = __QUEENS_DEBUG__, n = d.state.size;
  const sol = Array.from(d.state.solution, (c, r) => r * n + c);
  d.state.marks.fill(0);
  for (let r = 0; r < n - 1; r++) d.state.marks[sol[r]] = 2;
  d.render(false);
  const el = document.querySelector('.cell.is-forced');
  if (!el) return null;
  const cs = getComputedStyle(el, '::before');
  const af = getComputedStyle(el, '::after');
  return { name: cs.animationName, dur: cs.animationDuration, after: af.content, box: af.boxShadow };
});
check('唯一位置提示还在呼吸', !!forced && forced.name === 'forcedGlow', JSON.stringify(forced));
check('提示只加光、不加描边', !!forced && forced.after === 'none' && forced.box === 'none',
  forced ? `${forced.after} / ${forced.box}` : '');
await page.evaluate(() => {
  const s = document.createElement('style');
  s.textContent = '.cell.is-forced::before{animation-play-state:paused!important;animation-delay:-1.4s!important}';
  document.head.appendChild(s);
});
await sleep(150);
const box = await page.evaluate(() => {
  const el = document.querySelector('.cell.is-forced');
  const r = el.getBoundingClientRect();
  return { x: r.x - r.width * 1.2, y: r.y - r.width * 1.2, width: r.width * 3.4, height: r.width * 3.4 };
});
await page.screenshot({ path: `${OUT}/misc-forced-peak.png`, captureBeyondViewport: false, clip: box });

// ---------- 5. 通关后的「重来这局」 ----------
const beforeWin = await page.evaluate(() => ({ seed: __QUEENS_DEBUG__.state.seed, n: __QUEENS_DEBUG__.state.size }));
await page.evaluate(() => {
  const d = __QUEENS_DEBUG__, n = d.state.size;
  const sol = Array.from(d.state.solution, (c, r) => r * n + c);
  d.state.marks.fill(0);
  for (let r = 0; r < n - 1; r++) d.state.marks[sol[r]] = 2;
  d.render(false);
  d.state.status = 'playing';
});
const last = await page.evaluate(() => {
  const d = __QUEENS_DEBUG__, n = d.state.size;
  const sol = Array.from(d.state.solution, (c, r) => r * n + c);
  const el = document.querySelector('.cell[data-i="' + sol[n - 1] + '"]');
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.click(last.x, last.y);
await sleep(80);
await page.mouse.click(last.x, last.y);
await sleep(1300);

const wonUI = await page.evaluate(() => {
  const r = document.getElementById('result');
  const rep = document.getElementById('btnReplay');
  return {
    status: __QUEENS_DEBUG__.state.status,
    open: !r.hidden,
    kind: r.dataset.kind,
    replayHidden: rep.hidden,
    replayText: rep.textContent.trim(),
    btnAgain: document.getElementById('btnAgain').textContent.trim()
  };
});
check('解开后弹出结果层', wonUI.status === 'won' && wonUI.open && wonUI.kind === 'won', JSON.stringify(wonUI));
check('结果层有「重来这局」', wonUI.replayHidden === false && wonUI.replayText === '重来这局');
await page.screenshot({ path: `${OUT}/misc-result-won.png` });

await page.evaluate(() => document.getElementById('btnReplay').click());
await sleep(700);
const replayed = await page.evaluate(() => {
  const d = __QUEENS_DEBUG__;
  let any = 0;
  for (let i = 0; i < d.state.marks.length; i++) if (d.state.marks[i]) any++;
  return {
    status: d.state.status, seed: d.state.seed, n: d.state.size,
    marks: any, elapsed: d.state.elapsed, resultHidden: document.getElementById('result').hidden
  };
});
check('重来这局：同一盘棋重新开始',
  replayed.status === 'playing' && replayed.resultHidden && replayed.marks === 0 &&
  replayed.seed === beforeWin.seed && replayed.n === beforeWin.n,
  JSON.stringify(replayed));

// ---------- 6. 输了那一屏不重复给「重来这局」 ----------
const lostUI = await page.evaluate(() => {
  __QUEENS_DEBUG__.state.limit = 1000;
  __QUEENS_DEBUG__.state.limitFrom = 0;
  __QUEENS_DEBUG__.state.elapsed = 5000;
  __QUEENS_DEBUG__.checkTimeout();
  return {
    open: !document.getElementById('result').hidden,
    replayHidden: document.getElementById('btnReplay').hidden,
    peek: document.getElementById('btnPeek').textContent.trim(),
    again: document.getElementById('btnAgain').textContent.trim()
  };
});
check('超时那屏仍只有两个按钮', lostUI.open && lostUI.replayHidden === true,
  `${lostUI.again} / ${lostUI.peek}`);

console.log(`\n${fails ? 'FAILURES: ' + fails : 'ALL PASS'}`);
await browser.close();
process.exit(fails ? 1 : 0);
