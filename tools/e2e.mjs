// 皇后 Queens · 端到端回归测试
// 用法: NODE_PATH=... node tools/e2e.mjs [url]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire('C:/Users/CJL/.workbuddy/binaries/node/workspace/');
const puppeteer = require('puppeteer-core');

const URL = process.argv[2] || 'http://127.0.0.1:8080/';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'E:/Projects/Games/queens-puzzle/tools/shots';
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const errors = [];
let failures = 0;
function check(name, ok, extra = '') {
  if (!ok) failures++;
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=2']
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('requestfailed', r => errors.push('reqfail: ' + r.url() + ' ' + r.failure()?.errorText));

await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__QUEENS_DEBUG__ && __QUEENS_DEBUG__.state.regions.length > 0', { timeout: 15000 });
await sleep(600);

// ---------- 1. 首屏 ----------
const boot = await page.evaluate(() => {
  const d = __QUEENS_DEBUG__;
  return {
    size: d.state.size,
    cells: document.querySelectorAll('.cell').length,
    queens: d.state.solution,
    unique: (() => {
      const areas = {}; d.state.regions.forEach(g => areas[g] = (areas[g] || 0) + 1);
      return Object.keys(areas).length;
    })(),
    engineLoaded: typeof window.QueensEngine === 'object',
    sizePill: document.getElementById('btnSize').textContent.trim(),
    queenPill: document.getElementById('queenPill').textContent.trim(),
    chips: document.querySelectorAll('#regions .chip').length,
    borders: document.querySelectorAll('.cell.b-t, .cell.b-l').length,
    overflow: document.documentElement.scrollHeight - window.innerHeight
  };
});
check('默认 8×8', boot.size === 8 && boot.cells === 64, `cells=${boot.cells}`);
check('色块数 = 边长', boot.unique === 8, `regions=${boot.unique}`);
check('engine.js 已加载', boot.engineLoaded);
check('顶栏尺寸胶囊', boot.sizePill === '8×8', boot.sizePill);
check('皇后计数胶囊', boot.queenPill === '♛ 0/8', boot.queenPill);
check('色块条与描边', boot.chips === 8 && boot.borders > 0, `chips=${boot.chips} borders=${boot.borders}`);
check('无页面溢出', boot.overflow <= 0, `overflow=${boot.overflow}`);
await page.screenshot({ path: `${OUT}/01-boot.png` });

// ---------- 2. 单击 → × ----------
const cellBox = async (i) => {
  const el = await page.$(`.cell[data-i="${i}"]`);
  const b = await el.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const tap = async (i, { dbl = false, gap = 90 } = {}) => {
  const p = await cellBox(i);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down(); await page.mouse.up();
  if (dbl) { await sleep(gap); await page.mouse.down(); await page.mouse.up(); }
  await sleep(220);
};

await tap(0);
let s = await page.evaluate(() => ({ mark: __QUEENS_DEBUG__.state.marks[0], cls: document.querySelector('.cell[data-i="0"]').className }));
check('单击标记 ×', s.mark === 1, `mark=${s.mark} cls=${s.cls}`);
await sleep(420);
await tap(0);
s = await page.evaluate(() => __QUEENS_DEBUG__.state.marks[0]);
check('再次单击清空', s === 0, `mark=${s}`);
await sleep(420);

// ---------- 3. 双击 → 皇后 + 自动 × ----------
const sol = await page.evaluate(() => {
  const d = __QUEENS_DEBUG__, n = d.state.size;
  return Array.from(d.state.solution, (c, r) => r * n + c);
});
const q0 = sol[0];
await tap(q0, { dbl: true });
const afterQueen = await page.evaluate((q0) => {
  const d = __QUEENS_DEBUG__, n = d.state.size;
  const r = (q0 / n) | 0, c = q0 % n;
  const exp = new Set();
  for (let k = 0; k < n; k++) { if (k !== c) exp.add(r * n + k); if (k !== r) exp.add(k * n + c); }
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < n && cc >= 0 && cc < n) exp.add(rr * n + cc);
  }
  const g0 = d.state.regions[q0];
  for (let i = 0; i < n * n; i++) if (d.state.regions[i] === g0) exp.add(i);  // 同色块整块打叉
  exp.delete(q0);
  d.state.marks.forEach((m, i) => { if (m === 2) exp.delete(i); });
  const act = [...document.querySelectorAll('.cell')].map((el, i) => el.classList.contains('is-auto') ? i : -1).filter(i => i >= 0);
  return {
    mark: d.state.marks[q0],
    autoCount: act.length,
    autoExact: act.length === exp.size && [...exp].every(i => act.includes(i)),
    piece: !!document.querySelector(`.cell[data-i="${q0}"] .piece`),
    queenPill: document.getElementById('queenPill').textContent.trim(),
    hint: document.getElementById('hint').textContent.trim()
  };
}, q0);
check('双击落皇后', afterQueen.mark === 2 && afterQueen.piece, `mark=${afterQueen.mark}`);
check('自动 × 与理论集合一致', afterQueen.autoExact, `auto=${afterQueen.autoCount}`);
check('皇后计数更新', afterQueen.queenPill === '♛ 1/8', afterQueen.queenPill);
await page.screenshot({ path: `${OUT}/02-queen-auto.png` });

// ---------- 4. 自动 × 不可手改 ----------
const autoIdx = await page.evaluate(() => [...document.querySelectorAll('.cell')].findIndex(el => el.classList.contains('is-auto')));
await tap(autoIdx);
await sleep(120);
const autoLock = await page.evaluate((i) => ({
  mark: __QUEENS_DEBUG__.state.marks[i],
  stillAuto: document.querySelector(`.cell[data-i="${i}"]`).classList.contains('is-auto'),
  hint: document.getElementById('hint').textContent.trim()
}), autoIdx);
check('自动 × 点不出手标', autoLock.mark === 0 && autoLock.stillAuto, `mark=${autoLock.mark} auto=${autoLock.stillAuto}`);
check('提示解释了不能改', /自动/.test(autoLock.hint), autoLock.hint);
await sleep(420);

// ---------- 4b. 顶栏「自动打叉」开关 + 自动/手动 × 同款 ----------
const freeIdx = await page.evaluate(() => [...document.querySelectorAll('.cell')]
  .findIndex(el => !el.classList.contains('is-auto') && !el.classList.contains('is-q')));
await tap(freeIdx);
await sleep(280);
const parity = await page.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel + ' .mark i');
    if (!el) return null;
    const cs = getComputedStyle(el);
    // 只比影响视觉的几项：带色块边框的格子内框窄 2px，left 会有 1px 偏移，不算样式差异
    return [cs.backgroundColor, cs.width, cs.height, cs.borderRadius].join('|');
  };
  const wrap = (sel) => {
    const el = document.querySelector(sel + ' .mark');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return [cs.opacity, cs.transform].join('|');
  };
  const a = pick('.cell.is-auto'), m = pick('.cell.is-x');
  const wa = wrap('.cell.is-auto'), wm = wrap('.cell.is-x');
  return { a, m, wa, wm, same: !!a && a === m && wa === wm };
});
check('自动 × 与手动 × 样式一致', parity.same, `auto=${parity.a} manual=${parity.m}`);

await page.click('#btnAuto');
await sleep(340);
const autoOff = await page.evaluate(() => ({
  on: __QUEENS_DEBUG__.settings.autoMark,
  cells: document.querySelectorAll('.cell.is-auto').length,
  pressed: document.getElementById('btnAuto').getAttribute('aria-pressed')
}));
check('顶栏可关闭自动打叉', autoOff.on === false && autoOff.cells === 0 && autoOff.pressed === 'false',
  `on=${autoOff.on} cells=${autoOff.cells}`);

await page.click('#btnAuto');
await sleep(340);
const autoOn = await page.evaluate(() => ({
  on: __QUEENS_DEBUG__.settings.autoMark,
  cells: document.querySelectorAll('.cell.is-auto').length,
  pressed: document.getElementById('btnAuto').getAttribute('aria-pressed'),
  saved: JSON.parse(localStorage.getItem('queens.settings.v1') || '{}').autoMark
}));
check('再点一次恢复自动打叉', autoOn.on === true && autoOn.cells > 0 && autoOn.pressed === 'true',
  `cells=${autoOn.cells} saved=${autoOn.saved}`);

// 细线：每格都带 inset 阴影，最右列/最下行不重复补线
const grid = await page.evaluate(() => {
  const all = [...document.querySelectorAll('.cell')];
  const shadow = (el) => getComputedStyle(el).boxShadow;
  const mid = all[0];
  const corner = all[all.length - 1];
  const rightEdge = all[all.length - 2];
  return {
    mid: shadow(mid), corner: shadow(corner), rightEdge: shadow(rightEdge),
    hasHair: shadow(mid).includes('inset'),
    cornerNone: shadow(corner) === 'none'
  };
});
check('每格有细分隔线', grid.hasHair, grid.mid);
check('棋盘右下角不叠双线', grid.cornerNone, `corner=${grid.corner}`);

// ---------- 5. 冲突高亮 ----------
// 在同一行的另一列落第二只皇后 → 必然同行冲突
const nC = await page.evaluate(() => __QUEENS_DEBUG__.state.size);
const conflictCell = Math.floor(q0 / nC) * nC + ((q0 % nC) + 1) % nC;  // 同行另一列，必定冲突
await tap(conflictCell, { dbl: true });
const conf = await page.evaluate(() => {
  const d = __QUEENS_DEBUG__;
  return {
    count: d.state.conflicts.count,
    cells: d.state.conflicts.cells.size,
    rings: document.querySelectorAll('.cell.is-conflict').length,
    lines: document.querySelectorAll('#links line, #links path').length,
    hint: document.getElementById('hint').textContent.trim(),
    pill: document.getElementById('queenPill').className
  };
});
check('检测到冲突', conf.count >= 1, `pairs=${conf.count}`);
check('冲突格高亮', conf.rings >= 2, `rings=${conf.rings}`);
check('虚线连线出现', conf.lines >= 1, `lines=${conf.lines}`);
check('提示文案说明冲突', /同一行|同一列|同一个色块|冲突/.test(conf.hint), conf.hint);
await page.screenshot({ path: `${OUT}/03-conflict.png` });

// ---------- 6. 撤销 ----------
await page.click('#btnUndo');
await sleep(250);
s = await page.evaluate(() => ({ q: __QUEENS_DEBUG__.state.marks.filter(m => m === 2).length, conf: __QUEENS_DEBUG__.state.conflicts.count }));
check('撤销回到 1 只皇后', s.q === 1 && s.conf === 0, `q=${s.q} conf=${s.conf}`);

// ---------- 7. 提示 ----------
await page.click('#btnHint');
await sleep(400);
const hintState = await page.evaluate(() => ({
  hints: __QUEENS_DEBUG__.state.hints.length,
  ring: document.querySelectorAll('.cell.is-hint, .cell.r-hint, .cell.hint-pulse').length,
  text: document.getElementById('hint').textContent.trim()
}));
check('提示高亮一格', hintState.ring >= 1, `ring=${hintState.ring} text=${hintState.text}`);
await page.screenshot({ path: `${OUT}/04-hint.png` });

// ---------- 8. 清空 ----------
await page.click('#btnClear');
await sleep(300);
s = await page.evaluate(() => __QUEENS_DEBUG__.state.marks.filter(m => m !== 0).length);
check('清空棋盘', s === 0, `left=${s}`);

// ---------- 8b. 拖动连涂 / 连擦（锁方向） ----------
const gb = await page.evaluate(() => {
  const r = document.getElementById('grid').getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width };
});
const cs = gb.w / (await page.evaluate(() => __QUEENS_DEBUG__.state.size));
const pt = (r, c) => ({ x: gb.x + (c + 0.5) * cs, y: gb.y + (r + 0.5) * cs });
async function drag(from, to, steps = 6, holdCheck = false) {
  const a = pt(from[0], from[1]), b = pt(to[0], to[1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  let mid = null;
  if (holdCheck) mid = await page.evaluate(() => document.getElementById('grid').classList.contains('is-painting'));
  await page.mouse.up();
  await sleep(240);
  return mid;
}
const marksAt = () => page.evaluate(() => {
  const n = __QUEENS_DEBUG__.state.size;
  return [...__QUEENS_DEBUG__.state.marks]
    .map((m, i) => m === 1 ? { i, r: (i / n) | 0, c: i % n } : null)
    .filter(Boolean);
});
const show = (list) => list.map(o => o.r + ',' + o.c).join(' ');

const midPainting = await drag([3, 1], [3, 6], 6, true);
check('拖动时进入涂抹态', midPainting === true, `is-painting=${midPainting}`);
let mk = await marksAt();
check('横向拖涂连成 6 格', mk.length === 6, `marks=${mk.length}`);
check('横向只落在本行', mk.every(o => o.r === 3), show(mk));

await page.click('#btnUndo');
await sleep(280);
check('一次撤销回退整笔', (await marksAt()).length === 0, `marks=${(await marksAt()).length}`);

await drag([2, 2], [5, 6], 1);   // 斜着拖（横向分量更大）→ 应锁成第 2 行
mk = await marksAt();
check('斜拖被锁成同一行', mk.length === 5 && mk.every(o => o.r === 2 && o.c >= 2 && o.c <= 6), show(mk));

await page.click('#btnUndo');
await sleep(280);

await drag([0, 7], [7, 7], 8);   // 竖拖
mk = await marksAt();
check('竖向拖涂连成整列', mk.length === 8 && mk.every(o => o.c === 7), show(mk));

await drag([7, 7], [0, 7], 8);   // 从本列的 × 起手 → 沿同列擦除
check('同列反向拖擦干净', (await marksAt()).length === 0, `marks=${(await marksAt()).length}`);

// ---------- 8c. 唯一位置提示 ----------
const nF = await page.evaluate(() => __QUEENS_DEBUG__.state.size);
const solF = await page.evaluate(() => {
  const d = __QUEENS_DEBUG__, n = d.state.size;
  return Array.from(d.state.solution, (c, r) => r * n + c);
});
for (let r = 0; r < nF - 1; r++) await tap(solF[r], { dbl: true });
const forced = await page.evaluate(() => {
  const d = __QUEENS_DEBUG__, n = d.state.size;
  const qs = [];
  for (let i = 0; i < n * n; i++) if (d.state.marks[i] === 2) qs.push(i);
  const rowQ = new Set(qs.map(i => (i / n) | 0));
  const colQ = new Set(qs.map(i => i % n));
  const regQ = new Set(qs.map(i => d.state.regions[i]));
  const legal = (i) => {
    if (d.state.marks[i] !== 0) return false;
    const r = (i / n) | 0, c = i % n;
    if (rowQ.has(r) || colQ.has(c)) return false;
    for (const q of qs) {
      const qr = (q / n) | 0, qc = q % n;
      if (Math.max(Math.abs(qr - r), Math.abs(qc - c)) <= 1) return false;
    }
    return true;
  };
  const want = [];
  for (let g = 0; g < n; g++) {
    if (regQ.has(g)) continue;
    let only = -1, cnt = 0;
    for (let i = 0; i < n * n; i++) {
      if (d.state.regions[i] !== g || !legal(i)) continue;
      cnt++; only = i;
    }
    if (cnt === 1) want.push(only);
  }
  const got = [...document.querySelectorAll('.cell.is-forced')].map(el => +el.dataset.i);
  return { want: want.sort((a, b) => a - b), got: got.sort((a, b) => a - b) };
});
check('唯一位置判定与独立计算一致',
  JSON.stringify(forced.want) === JSON.stringify(forced.got),
  `want=${forced.want.join(',')} got=${forced.got.join(',')}`);
check('最后一格只剩唯一位置', forced.got.length === 1, `got=${forced.got.length}`);
check('唯一位置正好是正解', forced.got[0] === solF[nF - 1], `cell=${forced.got[0]} want=${solF[nF - 1]}`);

await page.click('#btnSettings');
await sleep(420);
await page.click('#swForced');
await sleep(260);
const forcedOff = await page.evaluate(() => ({
  on: __QUEENS_DEBUG__.settings.forced,
  cells: document.querySelectorAll('.cell.is-forced').length,
  aria: document.getElementById('swForced').getAttribute('aria-checked')
}));
check('可关闭唯一位置提示', forcedOff.on === false && forcedOff.cells === 0 && forcedOff.aria === 'false',
  `cells=${forcedOff.cells}`);

await page.click('#swForced');
await sleep(260);
const forcedOn = await page.evaluate(() => ({
  on: __QUEENS_DEBUG__.settings.forced,
  cells: document.querySelectorAll('.cell.is-forced').length,
  saved: JSON.parse(localStorage.getItem('queens.settings.v1') || '{}').forced
}));
check('再打开恢复提示', forcedOn.on === true && forcedOn.cells === 1 && forcedOn.saved === true,
  `cells=${forcedOn.cells} saved=${forcedOn.saved}`);
await page.click('#btnDone');
await sleep(420);

// ---------- 9. 完整解盘 → 胜利 ----------
const placed = await page.evaluate(() => {
  const d = __QUEENS_DEBUG__, n = d.state.size;
  return Array.from(d.state.solution, (c, r) => (d.state.marks[r * n + c] === 2 ? r : -1)).filter(r => r >= 0);
});
for (let r = 0; r < sol.length; r++) {
  if (placed.includes(r)) continue;
  await tap(sol[r], { dbl: true });
  await sleep(200);
}
await sleep(900);
const win = await page.evaluate(() => {
  const r = document.getElementById('result');
  return {
    hidden: r.hasAttribute('hidden'),
    title: document.getElementById('resultTitle').textContent.trim(),
    sub: document.getElementById('resultSub').textContent.trim(),
    stats: [...r.querySelectorAll('.result-stat b')].map(e => e.textContent.trim()),
    status: __QUEENS_DEBUG__.state.status,
    queens: __QUEENS_DEBUG__.state.marks.filter(m => m === 2).length
  };
});
check('解盘触发胜利', !win.hidden && win.status === 'won', `status=${win.status}`);
check('结果卡文案', win.title.length > 0 && win.sub.includes('8×8'), `${win.title} / ${win.sub}`);
check('结果卡统计三项', win.stats.length === 3, win.stats.join('|'));
await page.screenshot({ path: `${OUT}/05-win.png` });

// ---------- 10. 设置面板 ----------
await page.evaluate(() => document.getElementById('result').setAttribute('hidden', ''));
await page.click('#btnSettings');
await sleep(500);
const sheet = await page.evaluate(() => {
  const sh = document.getElementById('sheet');
  const r = sh.getBoundingClientRect();
  return {
    open: !document.getElementById('sheetWrap').hasAttribute('hidden'),
    inView: r.top >= 0 && r.bottom <= window.innerHeight + 1,
    sw: document.querySelectorAll('.switch').length,
    quick: document.querySelectorAll('#quickRow .chip, #quickRow button').length,
    sizeVal: document.getElementById('sizeVal').textContent.trim()
  };
});
check('设置面板打开', sheet.open, `inView=${sheet.inView}`);
check('设置面板完整可见', sheet.inView);
check('开关数量', sheet.sw === 5, `sw=${sheet.sw}`);
check('快捷尺寸', sheet.quick >= 5, `quick=${sheet.quick}`);
await page.screenshot({ path: `${OUT}/06-settings.png` });

// ---------- 11. 改尺寸到 12 ----------
for (let k = 0; k < 4; k++) { await page.click('#sizePlus'); await sleep(60); }
s = await page.evaluate(() => ({ want: __QUEENS_DEBUG__.settings.size, val: document.getElementById('sizeVal').textContent.trim() }));
check('步进器 +4', s.want === 12 && s.val === '12', `settings=${s.want} val=${s.val}`);
await page.click('#btnDone');
await sleep(1600);
const n12 = await page.evaluate(() => ({
  size: __QUEENS_DEBUG__.state.size,
  cells: document.querySelectorAll('.cell').length,
  cell: getComputedStyle(document.getElementById('board')).getPropertyValue('--cell').trim(),
  overflow: document.documentElement.scrollHeight - window.innerHeight,
  saved: JSON.parse(localStorage.getItem('queens.settings.v1') || '{}').size
}));
check('12×12 生成完成', n12.size === 12 && n12.cells === 144, `cells=${n12.cells} cell=${n12.cell}`);
check('12×12 无溢出', n12.overflow <= 0, `overflow=${n12.overflow}`);
check('尺寸已持久化', n12.saved === 12, `saved=${n12.saved}`);
await page.screenshot({ path: `${OUT}/07-12x12.png` });

// ---------- 12. 刷新续玩 ----------
await page.evaluate(() => {
  const d = __QUEENS_DEBUG__;
  d.state.marks[d.state.solution[0]] = 2;
  d.render(false);
});
await sleep(400);
const before = await page.evaluate(() => ({ q: __QUEENS_DEBUG__.state.marks.filter(m => m === 2).length }));
await sleep(1200);
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction('window.__QUEENS_DEBUG__ && __QUEENS_DEBUG__.state.regions.length > 0', { timeout: 15000 });
await sleep(800);
const after = await page.evaluate(() => ({
  q: __QUEENS_DEBUG__.state.marks.filter(m => m === 2).length,
  size: __QUEENS_DEBUG__.state.size,
  cells: document.querySelectorAll('.cell').length,
  time: document.getElementById('timeText').textContent.trim()
}));
check('刷新后续玩', after.q === before.q && after.size === 12 && after.cells === 144, `before=${before.q} after=${after.q} size=${after.size}`);
check('计时继续走', after.time !== '00:00', after.time);
await page.screenshot({ path: `${OUT}/08-resume.png` });

// ---------- 13. 小屏 16×16 ----------
await page.setViewport({ width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluate(() => __QUEENS_DEBUG__.newGame(16));
await sleep(2000);
const big = await page.evaluate(() => ({
  size: __QUEENS_DEBUG__.state.size,
  cells: document.querySelectorAll('.cell').length,
  cell: getComputedStyle(document.getElementById('board')).getPropertyValue('--cell').trim(),
  overflow: document.documentElement.scrollHeight - window.innerHeight,
  scrollW: document.documentElement.scrollWidth - window.innerWidth
}));
check('16×16 正常渲染', big.size === 16 && big.cells === 256, `cells=${big.cells} cell=${big.cell}`);
check('16×16 无溢出', big.overflow <= 0 && big.scrollW <= 0, `v=${big.overflow} h=${big.scrollW}`);
await page.screenshot({ path: `${OUT}/09-16x16.png` });

// ---------- 14. 分享棋盘 ----------
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluate(() => __QUEENS_DEBUG__.newGame(8));
await sleep(900);
await page.click('#btnSettings');
await sleep(420);

const share = await page.evaluate(() => {
  const d = __QUEENS_DEBUG__, n = d.state.size;
  const code = document.getElementById('shareCode').value;
  const re = new RegExp('^QNS1-' + String(n).padStart(2, '0') + '-[0-9A-F]{' + n * n +
    '}-[0-9A-F]{' + n + '}-[0-9A-Z]{6}$');
  const back = d.decode(code);
  return {
    code, len: code.length, want: 4 + 1 + 2 + 1 + n * n + 1 + n + 1 + 6,
    format: re.test(code),
    tag: document.getElementById('shareTag').textContent.trim(),
    ok: back.ok,
    roundTrip: back.ok && back.size === n &&
      Array.from(back.regions).join() === Array.from(d.state.regions).join() &&
      Array.from(back.solution).join() === Array.from(d.state.solution).join()
  };
});
check('分享代码格式 QNS1-08-…', share.format && share.len === share.want, `len=${share.len} want=${share.want}`);
check('代码标签跟随棋盘', share.tag === '8×8', share.tag);
check('代码解码后与原盘完全一致', share.ok && share.roundTrip);

// 复制到剪贴板
await page.browserContext().overridePermissions(URL, ['clipboard-read', 'clipboard-write']);
await page.click('#btnCopyCode');
await sleep(320);
const copied = await page.evaluate(async () => {
  let clip = '';
  try { clip = await navigator.clipboard.readText(); } catch (e) { clip = 'ERR'; }
  const st = document.getElementById('shareStatus');
  return { clip, text: st.textContent.trim(), good: st.classList.contains('is-good') };
});
check('复制按钮写入剪贴板', copied.clip === share.code, `clip=${copied.clip.slice(0, 14)}…`);
check('复制后有提示', copied.good && /已复制/.test(copied.text), copied.text);
await page.screenshot({ path: `${OUT}/10-share-copy.png` });

// 换一局，再用粘贴还原
await page.click('#btnDone');
await sleep(260);
await page.evaluate(() => __QUEENS_DEBUG__.newGame(10));
await sleep(1100);
await page.click('#btnSettings');
await sleep(420);
const pasted = await page.evaluate(async (code) => {
  const ta = document.getElementById('shareCode');
  const dt = new DataTransfer();
  dt.setData('text/plain', code);
  ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 260));
  const d = __QUEENS_DEBUG__;
  return {
    size: d.state.size,
    cells: document.querySelectorAll('.cell').length,
    back: Array.from(d.decode(code).regions).join() === Array.from(d.state.regions).join(),
    closed: document.getElementById('sheetWrap').hidden,
    hint: document.getElementById('hint').textContent.trim()
  };
}, share.code);
check('粘贴代码自动开局', pasted.size === 8 && pasted.cells === 64, `size=${pasted.size} cells=${pasted.cells}`);
check('还原成同一副棋盘', pasted.back);
check('载入后面板收起并提示', pasted.closed && /已载入/.test(pasted.hint), pasted.hint);

// 坏代码被拒
await page.click('#btnSettings');
await sleep(400);
const badIn = await page.evaluate(() => {
  const ta = document.getElementById('shareCode');
  ta.value = 'QNS1-08-00112233445566778899AABBCCDDEEFF00112233445566778899AABBCCDDEEFF-01234567-ABCDEF';
  document.getElementById('btnLoadCode').click();
  const st = document.getElementById('shareStatus');
  const d = __QUEENS_DEBUG__;
  return { text: st.textContent.trim(), bad: st.classList.contains('is-bad'), size: d.state.size, cells: document.querySelectorAll('.cell').length };
});
check('坏代码被拒并给出原因', badIn.bad && badIn.text.length > 4, badIn.text);
check('坏代码不影响当前棋盘', badIn.size === 8 && badIn.cells === 64, `size=${badIn.size} cells=${badIn.cells}`);

// 抄错一位 / 抄漏一位
const tamper = await page.evaluate((code) => {
  const d = __QUEENS_DEBUG__;
  const i = 20;
  const ch = code.charAt(i) === '0' ? '1' : '0';
  const typo = code.slice(0, i) + ch + code.slice(i + 1);
  const short = code.slice(0, code.length - 2);
  return {
    typo: d.decode(typo).msg,
    short: d.decode(short).msg,
    clear: d.decode('').msg,
    lower: d.decode(code.toLowerCase().replace(/-/g, ' ')).ok
  };
}, share.code);
check('抄错一位被校验拦住', /校验/.test(tamper.typo), tamper.typo);
check('抄漏几位被长度拦住', /不完整/.test(tamper.short), tamper.short);
check('空内容有提示', /太短/.test(tamper.clear), tamper.clear);
check('小写 / 空格 / 换行照样认', tamper.lower);
await page.screenshot({ path: `${OUT}/11-share-bad.png` });

// 链接 #code 直接开局
const p2 = await browser.newPage();
await p2.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
p2.on('pageerror', e => errors.push('hash: ' + e.message));
await p2.goto(URL + '#' + share.code, { waitUntil: 'networkidle0' });
await p2.waitForFunction('window.__QUEENS_DEBUG__ && __QUEENS_DEBUG__.state.regions.length > 0', { timeout: 15000 });
await sleep(600);
const hashLoad = await p2.evaluate((code) => {
  const d = __QUEENS_DEBUG__;
  return {
    size: d.state.size,
    cells: document.querySelectorAll('.cell').length,
    same: Array.from(d.decode(code).regions).join() === Array.from(d.state.regions).join(),
    hash: location.hash
  };
}, share.code);
check('#code 链接直接开局', hashLoad.size === 8 && hashLoad.cells === 64 && hashLoad.same, `size=${hashLoad.size}`);
check('载入后清掉 # 参数', hashLoad.hash === '', `hash=${hashLoad.hash}`);
await p2.screenshot({ path: `${OUT}/12-share-hash.png` });
await p2.close();

// ---------- 难度标签 ----------
log('\n--- 难度 ---');
// 前面的分享用例把设置面板留在了打开状态（app 被 inert），先收起来
await page.evaluate(() => {
  if (!document.getElementById('sheetWrap').hidden) document.getElementById('btnDone').click();
});
await sleep(300);
await page.evaluate(() => __QUEENS_DEBUG__.newGame(8));
await page.waitForFunction('__QUEENS_DEBUG__.state.size === 8 && __QUEENS_DEBUG__.state.vibe', { timeout: 20000 });
await sleep(400);

const chip = await page.evaluate(() => {
  const b = document.getElementById('btnDiff');
  const v = __QUEENS_DEBUG__.state.vibe;
  return {
    hidden: b.hidden,
    level: document.getElementById('diffLevel').textContent,
    score: document.getElementById('diffScore').textContent,
    aria: b.getAttribute('aria-label'),
    vibe: { level: v.level, score: v.score, tone: v.tone, tier: v.tier },
    steps: v.steps,
    inRow: !!b.closest('.hint-row'),
    chipBottom: b.getBoundingClientRect().bottom,
    boardTop: document.getElementById('board').getBoundingClientRect().top
  };
});
check('难度标签可见', !chip.hidden && chip.inRow);
check('标签文案是常见分级', /^(容易|中等|困难|极难)$/.test(chip.level), chip.level);
check('标签分数一位小数', /^\d(\.\d)?$/.test(chip.score), chip.score);
check('标签与模型一致', chip.level === chip.vibe.level && chip.score === chip.vibe.score.toFixed(1));
check('标签不压到棋盘', chip.chipBottom <= chip.boardTop + 1,
  `chip=${Math.round(chip.chipBottom)} board=${Math.round(chip.boardTop)}`);
check('无障碍标签带分数', /难度/.test(chip.aria) && /分/.test(chip.aria), chip.aria);
await page.screenshot({ path: `${OUT}/13-diff-chip.png` });

// 点开弹层
await page.click('#btnDiff');
await sleep(350);
const sheet1 = await page.evaluate(() => {
  const v = __QUEENS_DEBUG__.state.vibe;
  const rows = Array.from(document.querySelectorAll('.diff-step'));
  return {
    open: !document.getElementById('diffWrap').hidden,
    big: document.getElementById('diffBig').textContent,
    badge: document.getElementById('diffBadge').textContent,
    lead: document.getElementById('diffLead').textContent,
    names: rows.map(r => r.querySelector('.ds-name').textContent),
    counts: rows.map(r => r.querySelector('.ds-n').textContent),
    bars: rows.map(r => r.querySelector('.ds-bar i').style.width),
    steps: v.steps,
    focus: document.activeElement && document.activeElement.id,
    scrollable: document.getElementById('diffSheet').scrollHeight >
      document.getElementById('diffSheet').clientHeight + 4
  };
});
check('难度弹层打开', sheet1.open);
check('弹层分数与标签一致', sheet1.big === chip.score && sheet1.badge === chip.level,
  `${sheet1.big}/${sheet1.badge}`);
check('弹层列出 5 类构成', sheet1.names.length === 5, sheet1.names.join('|'));
check('每类都有次数', sheet1.counts.every(c => /^×\d+$/.test(c)), sheet1.counts.join(' '));
check('次数与模型一致', sheet1.counts[0] === '×' + sheet1.steps.openSingles &&
  sheet1.counts[3] === '×' + sheet1.steps.probe, sheet1.counts.join(' '));
check('条形有长度且不超 100%', sheet1.bars.every(b => {
  const w = parseFloat(b || '0');
  return w >= 0 && w <= 100;
}), sheet1.bars.join(' '));
check('有一句难度来源说明', /8×8/.test(sheet1.lead) && /试推|推完/.test(sheet1.lead), sheet1.lead);
check('弹层内容不溢出', !sheet1.scrollable);
check('打开后焦点在弹层里', sheet1.focus === 'diffSheet', `focus=${sheet1.focus}`);
await page.screenshot({ path: `${OUT}/14-diff-sheet.png` });

// 弹层开着时棋盘点不动
const locked = await page.evaluate(() => {
  const d = __QUEENS_DEBUG__;
  const cell = document.querySelectorAll('.cell')[0];
  const before = d.state.marks[0];
  cell.click();
  return { before, after: d.state.marks[0] };
});
check('弹层打开时棋盘锁定', locked.before === locked.after, `${locked.before}→${locked.after}`);

// Esc 关闭 + 焦点回到标签
await page.keyboard.press('Escape');
await sleep(300);
const afterEsc = await page.evaluate(() => ({
  hidden: document.getElementById('diffWrap').hidden,
  focus: document.activeElement && document.activeElement.id,
  expanded: document.getElementById('btnDiff').getAttribute('aria-expanded')
}));
check('Esc 关闭难度弹层', afterEsc.hidden);
check('关闭后焦点回到标签', afterEsc.focus === 'btnDiff', `focus=${afterEsc.focus}`);
check('aria-expanded 复位', afterEsc.expanded === 'false');

// 点背景关闭（弹层面板盖住了背景中心，点上方空白处）
await page.click('#btnDiff');
await sleep(300);
await page.mouse.click(195, 80);
await sleep(300);
check('点背景关闭', await page.evaluate(() => document.getElementById('diffWrap').hidden));

// 关闭后可以继续落子
const playable = await page.evaluate(() => {
  const d = __QUEENS_DEBUG__;
  document.querySelectorAll('.cell')[0].click();
  return d.state.marks[0];
});
check('关闭后恢复操作', playable === 1, `marks[0]=${playable}`);
await page.evaluate(() => __QUEENS_DEBUG__.clear());

// 尺寸越大分数越高
const ladders = [];
for (const n of [4, 8, 16]) {
  await page.evaluate((size) => __QUEENS_DEBUG__.newGame(size), n);
  await page.waitForFunction(`__QUEENS_DEBUG__.state.size === ${n} && __QUEENS_DEBUG__.state.vibe`, { timeout: 30000 });
  ladders.push(await page.evaluate(() => __QUEENS_DEBUG__.state.vibe.score));
}
check('分数随尺寸递增', ladders[0] < ladders[1] && ladders[1] < ladders[2], ladders.join(' < '));
check('16×16 判为极难/困难', await page.evaluate(() =>
  ['困难', '极难'].indexOf(__QUEENS_DEBUG__.state.vibe.level) >= 0), await page.evaluate(() => __QUEENS_DEBUG__.state.vibe.level));

// 续玩（从存档恢复）也要有难度：新开一页会走 loadGame 分支
await sleep(500);   // 等 save() 的 160ms 防抖落地
const p4 = await browser.newPage();
await p4.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
p4.on('pageerror', e => errors.push('restore: ' + e.message));
await p4.goto(URL, { waitUntil: 'networkidle0' });
await p4.waitForFunction('window.__QUEENS_DEBUG__ && __QUEENS_DEBUG__.state.vibe', { timeout: 20000 });
await sleep(400);
const resumed = await p4.evaluate(() => ({
  size: __QUEENS_DEBUG__.state.size,
  vibe: __QUEENS_DEBUG__.state.vibe && __QUEENS_DEBUG__.state.vibe.level,
  chip: !document.getElementById('btnDiff').hidden,
  text: document.getElementById('diffLevel').textContent
}));
check('续玩恢复后仍有难度', resumed.chip && resumed.size === 16 && resumed.vibe === resumed.text,
  `size=${resumed.size} ${resumed.vibe}/${resumed.text}`);
await p4.close();

// ---------- 汇总 ----------
log('\n--- console errors ---');
log(errors.length ? errors.join('\n') : '(none)');
check('无 JS 报错 / 资源失败', errors.length === 0, `count=${errors.length}`);

await browser.close();
log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
