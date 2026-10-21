/* 提示引导的界面检查：
 *   1. 面板不压棋盘（面板底 ≤ 棋盘顶）、不横向溢出
 *   2. 分步文案都非空，点点数 = 步数，上一步/下一步/结束 行为正确
 *   3. 「照做」落子的位置与 plan.action 一致
 *   4. 放错皇后时报「检查」而不是继续讲逻辑
 *   5. 320/360/390/430 四种宽度 + 16×16 都截一张图
 */
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

const fails = [];
function expect(cond, msg) { if (!cond) fails.push(msg); }

async function boot(w, h) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (!page.url().startsWith('http')) {
    await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle0' });
    await page.waitForFunction('window.__QUEENS_DEBUG__ && __QUEENS_DEBUG__.state.vibe', { timeout: 20000 });
  }
  await sleep(250);
}

async function newBoard(n) {
  await page.evaluate((nn) => __QUEENS_DEBUG__.newGame(nn), n);
  await page.waitForFunction((nn) => __QUEENS_DEBUG__.state.size === nn &&
    __QUEENS_DEBUG__.state.vibe && !__QUEENS_DEBUG__.state.guideOpenX, { timeout: 30000 }, n);
  await sleep(500);
}

/* 读一次界面状态 */
const snapshot = () => page.evaluate(() => {
  const r = (id) => {
    const b = document.getElementById(id).getBoundingClientRect();
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) };
  };
  const g = __QUEENS_DEBUG__.guide();
  return {
    coachHidden: document.getElementById('coach').hidden,
    coachText: document.getElementById('coachText').textContent,
    tier: document.getElementById('coachTier').textContent,
    lv: document.getElementById('coach').dataset.lv,
    nextLabel: document.getElementById('coachNext').textContent,
    prevDisabled: document.getElementById('coachPrev').disabled,
    dots: Array.from(document.querySelectorAll('#coachDots i')).map(e => e.className),
    coach: r('coach'), board: r('board'), stage: r('stage'),
    glShapes: document.getElementById('gl').childElementCount,
    glTags: document.getElementById('glTags').childElementCount,
    tagTexts: Array.from(document.querySelectorAll('#glTags .gl-tag')).map(e => e.textContent),
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    open: g.open, at: g.at,
    kind: g.plan && g.plan.kind, rule: g.plan && g.plan.rule,
    steps: g.plan ? g.plan.steps.map(s => s.text) : [],
    action: g.plan && g.plan.action,
    marks: Array.from(window.__QUEENS_DEBUG__.state.marks)
  };
});

const kinds = {};
const levels = {};

await boot(390, 844);

for (const n of [6, 8, 10, 12, 16]) {
  for (let trial = 0; trial < 3; trial++) {
    await newBoard(n);
    await page.click('#btnHint');
    await sleep(320);
    let s = await snapshot();

    expect(s.open, `${n}×${n}#${trial}: 点了提示但面板没开`);
    expect(!s.coachHidden, `${n}×${n}#${trial}: 面板 hidden 没去掉`);
    expect(s.coach.bottom <= s.board.top + 1, `${n}×${n}#${trial}: 面板压到了棋盘 (${s.coach.bottom} > ${s.board.top})`);
    expect(s.steps.length === s.dots.length, `${n}×${n}#${trial}: 点点数 ${s.dots.length} ≠ 步数 ${s.steps.length}`);
    expect(s.steps.every(t => t && t.length >= 4), `${n}×${n}#${trial}: 有空文案`);
    expect(s.glShapes > 0, `${n}×${n}#${trial}: 圈画层是空的`);

    kinds[s.kind] = (kinds[s.kind] || 0) + 1;
    levels[s.rule] = (levels[s.rule] || 0) + 1;

    const seen = [s.steps[0]];
    // 逐步点到最后一步
    for (let i = 1; i < s.steps.length; i++) {
      await page.click('#coachNext');
      await sleep(120);
      const t = await snapshot();
      seen.push(t.steps[t.at]);
      expect(t.at === i, `${n}×${n}#${trial}: 第 ${i} 步没对上 at=${t.at}`);
      expect(t.dots[i] === 'on', `${n}×${n}#${trial}: 第 ${i} 个点没点亮`);
      expect(t.coach.bottom <= t.board.top + 1, `${n}×${n}#${trial}#${i}: 第 ${i} 步面板压棋盘`);
    }
    // 回退一步
    if (s.steps.length > 1) {
      await page.click('#coachPrev');
      await sleep(100);
      const back = await snapshot();
      expect(back.at === s.steps.length - 2, `${n}×${n}#${trial}: 上一步没退回去`);
      await page.click('#coachNext');
      await sleep(100);
    }

    // 最后一步的按钮文案
    const last = await snapshot();
    const wantLabel = last.action ? '照做' : '知道了';
    expect(last.nextLabel === wantLabel, `${n}×${n}#${trial}: 末步按钮写的是「${last.nextLabel}」，应为「${wantLabel}」`);

    // 照做
    if (last.action) {
      await page.click('#coachNext');
      await sleep(400);
      const done = await snapshot();
      const a = last.action;
      expect(!done.open, `${n}×${n}#${trial}: 照做后面板没关`);
      if (a.type === 'place') {
        expect(done.marks[a.cell] === 2, `${n}×${n}#${trial}: 照做没在 #${a.cell} 放皇后`);
      } else if (a.type === 'cross') {
        expect(a.cells.every(c => done.marks[c] === 1), `${n}×${n}#${trial}: 照做没划完叉`);
      }
    } else {
      await page.click('#coachNext');
      await sleep(250);
      const done = await snapshot();
      expect(!done.open, `${n}×${n}#${trial}: 「知道了」后面板没关`);
    }
    expect((await page.evaluate(() => document.getElementById('gl').childElementCount)) === 0,
      `${n}×${n}#${trial}: 收面板后圈画层没清干净`);

    if (trial === 0 && (n === 8 || n === 16)) {
      await page.screenshot({ path: `${OUT}/guide-${n}.png` });
    }
  }
  console.log(`${n}×${n} 完成`);
}

/* ---- 结束按钮 + Esc ---- */
await newBoard(8);
await page.click('#btnHint');
await sleep(300);
await page.click('#coachClose');
await sleep(250);
let s = await snapshot();
expect(!s.open && s.coachHidden, '「结束」没关掉面板');
expect(!(await page.evaluate(() => document.getElementById('stage').classList.contains('is-guiding'))),
  '「结束」后 is-guiding 还挂着');

await page.click('#btnHint');
await sleep(300);
await page.keyboard.press('Escape');
await sleep(250);
s = await snapshot();
expect(!s.open, 'Esc 没关掉面板');

/* ---- 放错皇后：应报「检查」 ---- */
await newBoard(8);
const solCols = await page.evaluate(() => Array.from(__QUEENS_DEBUG__.state.solution));
// 找一格不是答案的位置，用键盘焦点 + Q 放皇后
const wrong = await page.evaluate(() => {
  const n = __QUEENS_DEBUG__.state.size;
  const sol = __QUEENS_DEBUG__.state.solution;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (c !== sol[r]) return r * n + c;
    }
  }
  return -1;
});
await page.evaluate((i) => {
  const cells = document.querySelectorAll('.cell');
  for (const c of cells) c.tabIndex = -1;
  cells[i].tabIndex = 0;
  cells[i].focus();
}, wrong);
await page.keyboard.press('q');
await sleep(350);
const queenPlaced = await page.evaluate((i) => __QUEENS_DEBUG__.state.marks[i] === 2, wrong);
expect(queenPlaced, '放错皇后这一步没生效（测试前提没满足）');
await page.click('#btnHint');
await sleep(320);
s = await snapshot();
console.log('放错皇后 →', s.kind, s.rule, '|', s.tier, '|', s.steps[0]);
expect(s.kind === 'fixQueen', `放错皇后时应报 fixQueen，实际 ${s.kind}`);
expect(s.tier === '检查', `放错皇后时角标应为「检查」，实际「${s.tier}」`);
await page.screenshot({ path: `${OUT}/guide-fixqueen.png` });

/* ---- 各宽度 ---- */
for (const [w, h, tag] of [[320, 568, '320'], [360, 740, '360'], [390, 844, '390'], [430, 932, '430']]) {
  await boot(w, h);
  await newBoard(w < 380 ? 8 : 12);
  await page.click('#btnHint');
  await sleep(400);
  const m = await snapshot();
  const tall = m.coach.h;
  console.log(`${tag}: 面板高 ${tall} 棋盘 ${m.board.w}×${m.board.h} 顶 ${m.board.top} 面板底 ${m.coach.bottom} ` +
    `溢出 ${m.overflowX} 圈画 ${m.glShapes} 标签 ${JSON.stringify(m.tagTexts)}`);
  expect(!m.overflowX, `${tag}px: 横向溢出 (${m.scrollW} > ${m.innerW})`);
  expect(m.coach.bottom <= m.board.top + 1, `${tag}px: 面板压棋盘`);
  expect(tall <= 110, `${tag}px: 面板高 ${tall}px，超过 110（320 屏 2 行文案）`);
  expect(m.board.h >= 220, `${tag}px: 棋盘被挤到 ${m.board.h}px`);
  // 把每一步都过一遍，确认标签位置不跑到棋盘外
  for (let i = 1; i < m.steps.length; i++) {
    await page.click('#coachNext');
    await sleep(120);
  }
  const tags = await page.evaluate(() => {
    const b = document.getElementById('board').getBoundingClientRect();
    return Array.from(document.querySelectorAll('#glTags .gl-tag')).map(e => {
      const r = e.getBoundingClientRect();
      return { t: e.textContent, l: Math.round(r.left - b.left), r: Math.round(r.right - b.left), ok: r.left >= b.left - 2 && r.right <= b.right + 2 };
    });
  });
  const bad = tags.filter(t => !t.ok);
  expect(!bad.length, `${tag}px: 有标签跑到棋盘外 ${JSON.stringify(bad)}`);
  await page.screenshot({ path: `${OUT}/guide-${tag}.png` });
}

console.log('\n命中的规则:', JSON.stringify(levels));
console.log('结论类型:', JSON.stringify(kinds));
console.log('页面错误:', errs.length ? errs : '无');
console.log(fails.length ? '\n❌ 失败 ' + fails.length + ' 项:\n' + fails.join('\n') : '\n✅ 全部通过');
await browser.close();
process.exit(fails.length || errs.length ? 1 : 0);
