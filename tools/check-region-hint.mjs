// 色块视觉提示回归：长按色卡高亮 + 填错色块描红打叉
// 用法: node tools/check-region-hint.mjs [url]
// 需要先起本地服务（python serve.py 8099 --no-open）
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire('C:/Users/CJL/.workbuddy/binaries/node/workspace/');
const puppeteer = require('puppeteer-core');

const URL = process.argv[2] || 'http://127.0.0.1:8099/';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'E:/Projects/Games/queens-puzzle/tools/shots/';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let fails = 0;
const check = (name, ok, extra = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__QUEENS_DEBUG__ && __QUEENS_DEBUG__.state.regions.length > 0', { timeout: 15000 });
await sleep(800);

// ---------- 1. 长按色卡 ----------
const box = await page.evaluate(() => {
  const c = document.querySelectorAll('.chip')[1].getBoundingClientRect();
  return { x: c.x + c.width / 2, y: c.y + c.height / 2 };
});

// 轻点不该闪
await page.mouse.move(box.x, box.y);
await page.mouse.down();
await sleep(30);
await page.mouse.up();
await sleep(130);
check('轻点色卡不出高亮', (await page.evaluate(() => document.querySelectorAll('#rlPeek path').length)) === 0);

// 按住才出
await page.mouse.down();
await sleep(200);
const held = await page.evaluate(() => ({
  paths: document.querySelectorAll('#rlPeek path').length,
  hold: document.querySelectorAll('.chip.is-hold').length,
  veil: !!document.querySelector('.rl-peek-veil'),
  line: !!document.querySelector('.rl-peek-line'),
  white: [...document.querySelectorAll('#rlPeek path')].some(p => {
    const s = getComputedStyle(p).stroke;
    return /rgb\(255, 255, 255\)/.test(s);
  }),
  viewBox: document.getElementById('rl').getAttribute('viewBox')
}));
check('按住出现高亮（压暗 + 本色光晕 + 墨线）',
  held.paths === 3 && held.hold === 1 && held.veil && held.line, JSON.stringify(held));
check('高亮里没有白描边', !held.white, held.white ? 'still white' : '');
await page.screenshot({ path: OUT + 'hint-hold.png' });

// 手指划走也还在，松手才灭
await page.mouse.move(box.x - 60, box.y - 40);
await sleep(80);
check('按住时划走仍保持', (await page.evaluate(() => document.querySelectorAll('#rlPeek path').length)) === 3);
await page.mouse.up();
await sleep(140);
const released = await page.evaluate(() => ({
  paths: document.querySelectorAll('#rlPeek path').length,
  hold: document.querySelectorAll('.chip.is-hold').length
}));
check('松手立刻消失', released.paths === 0 && released.hold === 0, JSON.stringify(released));

// ---------- 2. 整块打叉却无皇后（1s 防抖 + 淡入淡出） ----------
const badOpacity = () => page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('rlBad')).opacity));

// 装个震动探针（buzz 里读的是 navigator.vibrate）
await page.evaluate(() => {
  window.__vibes = [];
  navigator.vibrate = (p) => { window.__vibes.push(p); return true; };
});

const bad = await page.evaluate(() => {
  const d = __QUEENS_DEBUG__, n = d.state.size;
  d.state.marks = new Array(n * n).fill(0);
  for (let i = 0; i < n * n; i++) if (d.state.regions[i] === 0) d.state.marks[i] = 1;
  d.render();
  return {
    bad: d.state.badRegions,
    on: document.getElementById('rlBad').classList.contains('is-on'),
    chips: document.querySelectorAll('.chip.is-bad').length
  };
});
check('判定是即时的（state.badRegions）', bad.bad.join() === '0', JSON.stringify(bad.bad));
check('刚打满不满 1s 不亮红框', !bad.on && bad.chips === 0, JSON.stringify(bad));

await sleep(400);
check('0.4s 时仍不亮', (await badOpacity()) < 0.02);
check('防抖窗口内不震', (await page.evaluate(() => window.__vibes.length)) === 0);

await sleep(900);
const shown = await page.evaluate(() => ({
  on: document.getElementById('rlBad').classList.contains('is-on'),
  line: document.querySelectorAll('#rlBad .rl-bad-line').length,
  halo: document.querySelectorAll('#rlBad .rl-bad-halo').length,
  fill: document.querySelectorAll('#rlBad .rl-bad-fill').length,
  chips: [...document.querySelectorAll('.chip')].map(c => c.classList.contains('is-bad')),
  vibes: window.__vibes.slice()
}));
check('满 1s 才描边 + 光晕 + 淡红洗', shown.on && shown.line === 1 && shown.halo === 1 && shown.fill === 1,
  JSON.stringify(shown).slice(0, 120));
check('只有对应的那颗色卡被打叉',
  shown.chips.filter(Boolean).length === 1 && shown.chips[0], shown.chips.join(','));
check('亮起时震一下', shown.vibes.length === 1, JSON.stringify(shown.vibes));

await sleep(240);
const chipOp = await page.evaluate(() => getComputedStyle(document.querySelector('.chip.is-bad .chip-x')).opacity);
check('色卡上的叉跟着淡入', chipOp === '1', 'opacity=' + chipOp);
await page.screenshot({ path: OUT + 'hint-bad.png' });

// 淡入是渐变的：刚亮起那一刻不该是 1
const fadeIn = await page.evaluate(async () => {
  const d = __QUEENS_DEBUG__, n = d.state.size;
  d.clear();
  d.state.marks = new Array(n * n).fill(1);
  d.render();
  await new Promise(r => setTimeout(r, 1100));
  const g = document.getElementById('rlBad');
  const a = parseFloat(getComputedStyle(g).opacity);
  await new Promise(r => setTimeout(r, 260));
  const b = parseFloat(getComputedStyle(g).opacity);
  return { a, b };
});
check('出现是淡入而不是硬切', fadeIn.a < 0.9 && fadeIn.b > 0.9, JSON.stringify(fadeIn));

// 淡出：变成正确之后，opacity 应该先降后归零，而不是瞬间消失
const fadeOut = await page.evaluate(async () => {
  const d = __QUEENS_DEBUG__;
  d.state.marks = new Array(d.state.size * d.state.size).fill(0);
  d.render();
  const g = document.getElementById('rlBad');
  const samples = [];
  for (let i = 0; i < 6; i++) {
    samples.push(parseFloat(getComputedStyle(g).opacity));
    await new Promise(r => setTimeout(r, 40));
  }
  return { samples, on: g.classList.contains('is-on') };
});
check('消失是淡出且立刻开始', !fadeOut.on && fadeOut.samples[0] > 0.2 && fadeOut.samples[fadeOut.samples.length - 1] === 0,
  JSON.stringify(fadeOut.samples.map(v => +v.toFixed(2))));

await sleep(120);
const cleared = await page.evaluate(() => ({
  bad: __QUEENS_DEBUG__.state.badRegions,
  op: parseFloat(getComputedStyle(document.getElementById('rlBad')).opacity),
  x: document.querySelectorAll('.chip.is-bad').length
}));
check('不再错时立刻收回（不等防抖）', cleared.bad.length === 0 && cleared.op === 0 && cleared.x === 0,
  JSON.stringify(cleared));

// ---------- 2b. 双击放皇后：中间那一瞬不该闪红框 ----------
// 第一下把这块最后一格打成 ×（瞬间「整块划满」），340ms 内第二下改成皇后
const dbl = await page.evaluate(async () => {
  const d = __QUEENS_DEBUG__, n = d.state.size;
  const g = 1;
  const cells = [];
  for (let i = 0; i < n * n; i++) if (d.state.regions[i] === g) cells.push(i);
  window.__vibes = [];
  d.state.marks = new Array(n * n).fill(0);
  cells.slice(1).forEach(i => { d.state.marks[i] = 1; });
  d.render();
  await new Promise(r => setTimeout(r, 250));       // 第一下落地后 250ms
  const at250 = parseFloat(getComputedStyle(document.getElementById('rlBad')).opacity);
  d.state.marks[cells[0]] = 2;                      // 第二下：落子
  d.render();
  await new Promise(r => setTimeout(r, 1400));      // 等过原来的 1s 窗口
  return {
    at250,
    after: parseFloat(getComputedStyle(document.getElementById('rlBad')).opacity),
    vibes: window.__vibes.length,
    bad: d.state.badRegions
  };
});
check('双击中途（250ms）没亮红框', dbl.at250 === 0, 'opacity=' + dbl.at250);
check('落子后也不会补亮、不震', dbl.after === 0 && dbl.vibes === 0 && dbl.bad.length === 0, JSON.stringify(dbl));

// 块里有皇后就不算错
const withQ = await page.evaluate(() => {
  const d = __QUEENS_DEBUG__, n = d.state.size;
  const g0 = [];
  for (let i = 0; i < n * n; i++) if (d.state.regions[i] === 0) g0.push(i);
  g0.slice(1).forEach(i => { d.state.marks[i] = 1; });
  d.state.marks[g0[0]] = 2;
  d.render();
  return d.state.badRegions;
});
check('块里有皇后就不判错', withQ.indexOf(0) < 0, JSON.stringify(withQ));

// ---------- 3. 引导打开时让位 ----------
const guide = await page.evaluate(async () => {
  __QUEENS_DEBUG__.useHint();
  await new Promise(r => setTimeout(r, 400));
  const on = document.getElementById('rl').classList.contains('is-guide');
  __QUEENS_DEBUG__.guideClose();
  await new Promise(r => setTimeout(r, 300));
  return {
    on,
    off: !document.getElementById('rl').classList.contains('is-guide'),
    op: parseFloat(getComputedStyle(document.getElementById('rl')).opacity)
  };
});
check('引导打开时高亮层让位，关掉后回来', guide.on && guide.off && guide.op > 0.9, JSON.stringify(guide));

// ---------- 4. 小格子 ----------
await page.evaluate(() => { __QUEENS_DEBUG__.settings.difficulty = 'any'; __QUEENS_DEBUG__.newGame(16, 777); });
await sleep(1600);
await page.evaluate(() => {
  const d = __QUEENS_DEBUG__, n = d.state.size;
  d.state.marks = new Array(n * n).fill(0);
  for (let i = 0; i < n * n; i++) if (d.state.regions[i] === 0) d.state.marks[i] = 1;
  d.render();
});
await sleep(1200);                 // 等过防抖窗口
const small = await page.evaluate(() => {
  const p = document.querySelector('#rlBad .rl-bad-line');
  return { n: __QUEENS_DEBUG__.state.size, w: p && p.getAttribute('stroke-width') };
});
check('16×16 描边跟着格子变细', small.n === 16 && small.w === '2.8', JSON.stringify(small));
await page.screenshot({ path: OUT + 'hint-bad-16.png' });

check('无 JS 报错', errs.length === 0, errs.join(' | '));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
