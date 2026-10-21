/* 目标难度出题：选档位 → 每局都落在该档；尺寸锁定；切回不限恢复手动；设置持久化。
 * 用法：先起本地服务（python serve.py），再 node tools/check-diffpick.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/CJL/.workbuddy/binaries/node/workspace/');
const puppeteer = require('puppeteer-core');

const URL = process.env.QURL || 'http://127.0.0.1:8080/';
const SHOTS = 'E:/Projects/Games/queens-puzzle/tools/shots/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) { pass++; console.log('  PASS  ' + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); }
  else { fail++; console.log('  FAIL  ' + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); }
}

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--no-sandbox']
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

// 面板里的按钮在 slide-up 动画期间拿不到稳定 bbox，统一用 JS click
async function jsClick(sel) {
  const done = await page.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return 'missing:' + s;
    el.click();
    return 'ok';
  }, sel);
  if (done !== 'ok') throw new Error(done);
}
async function openSheet() {
  await jsClick('#btnSettings');
  await page.waitForFunction(() => !document.getElementById('sheetWrap').hidden, { timeout: 5000 });
  await sleep(420);
}
async function closeSheetIfOpen() {
  const open = await page.evaluate(() => !document.getElementById('sheetWrap').hidden);
  if (open) { await jsClick('#btnDone'); await sleep(380); }
}
const snap = () => page.evaluate(() => ({
  n: __QUEENS_DEBUG__.state.size,
  seed: __QUEENS_DEBUG__.state.seed,
  lvl: __QUEENS_DEBUG__.state.vibe && __QUEENS_DEBUG__.state.vibe.level,
  score: __QUEENS_DEBUG__.state.vibe && Math.round(__QUEENS_DEBUG__.state.vibe.score * 10) / 10
}));
// 新局判别：seed 变了且 vibe 已就绪
async function waitNew(prevSeed) {
  await page.waitForFunction(s => {
    const st = __QUEENS_DEBUG__.state;
    return st.seed !== s && st.vibe && st.vibe.level;
  }, { timeout: 40000 }, prevSeed);
  await sleep(60);
}

async function boot() {
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__QUEENS_DEBUG__ && __QUEENS_DEBUG__.state.vibe', { timeout: 20000 });
  await sleep(450);
}

/* ---------- 1. 设置面板外观 ---------- */
console.log('\n[1] 设置面板');
await boot();
await closeSheetIfOpen();
await openSheet();
const ui0 = await page.evaluate(() => ({
  opts: Array.from(document.querySelectorAll('.dbtn')).map(b => b.textContent.trim()),
  on: Array.from(document.querySelectorAll('.dbtn.is-on')).map(b => b.textContent.trim()),
  note: document.getElementById('sheetNote').textContent.trim(),
  hint: document.getElementById('diffHint').textContent.trim(),
  locked: document.getElementById('sizeStepper').classList.contains('diff-locked')
}));
ok('五个档位齐全', ui0.opts.length === 5 && ui0.opts.join('') === '不限容易中等困难极难', ui0.opts);
ok('默认选中「不限」', ui0.on.length === 1 && ui0.on[0] === '不限', ui0.on);
ok('默认尺寸不锁定', ui0.locked === false);
ok('默认文案是改尺寸即开新局', /尺寸/.test(ui0.note), ui0.note);
await page.screenshot({ path: SHOTS + 'diff-setting.png' });

/* ---------- 2. 选「困难」 ---------- */
console.log('\n[2] 选「困难」');
const before = await snap();
// 直接在元素实例上拦 hidden 的 setter：这是 showVeil/hideVeil 唯一的可见副作用，
// 比 MutationObserver 可靠（hidden 是反射属性，add/remove 的 oldValue 语义容易误判）
async function armVeil() {
  await page.evaluate(() => {
    const v = document.getElementById('veil');
    if (!Object.prototype.hasOwnProperty.call(v, 'hidden')) {
      v.__probe = { cur: v.hidden, log: [] };
      Object.defineProperty(v, 'hidden', {
        configurable: true,
        get() { return this.__probe.cur; },
        set(x) {
          this.__probe.cur = !!x;
          this.__probe.log.push({
            shown: !x,
            t: Math.round(performance.now()),
            title: document.getElementById('veilTitle').textContent.trim()
          });
        }
      });
    }
    v.__probe.log.length = 0;
  });
}
const veilLog = () => page.evaluate(() => document.getElementById('veil').__probe.log.slice());

await armVeil();
await jsClick('.dbtn[data-level="hard"]');
await waitNew(before.seed);
await sleep(300);
const veil = await veilLog();
const veilShown = veil.filter(e => e.shown);
const hard1 = await snap();
const after = await page.evaluate(() => ({
  setting: __QUEENS_DEBUG__.settings.difficulty,
  chip: document.getElementById('btnDiff').textContent.replace(/\s+/g, ' ').trim(),
  sheetClosed: document.getElementById('sheetWrap').hidden,
  ls: JSON.parse(localStorage.getItem('queens.settings.v1')).difficulty,
  note: document.getElementById('sheetNote').textContent.trim()
}));
ok('新局落在困难档', hard1.lvl === '困难', hard1);
ok('困难档尺寸在 9–12', hard1.n >= 9 && hard1.n <= 12, hard1.n);
ok('快盘不闪遮罩（困难档 3ms 级出题）', veilShown.length === 0, veil);
ok('设置已写回 settings', after.setting === 'hard', after.setting);
ok('设置已落 localStorage', after.ls === 'hard', after.ls);
ok('面板自动收起', after.sheetClosed === true);
ok('顶栏难度标签已更新', /困难/.test(after.chip), after.chip);
ok('文案切换为按难度出题', /难度/.test(after.note) && !/改尺寸/.test(after.note), after.note);
await page.screenshot({ path: SHOTS + 'diff-hard-board.png' });

/* ---------- 3. 尺寸锁定 ---------- */
console.log('\n[3] 尺寸锁定');
await openSheet();
const lockUi = await page.evaluate(() => ({
  locked: document.getElementById('sizeStepper').classList.contains('diff-locked'),
  disabled: Array.from(document.querySelectorAll('.qbtn[data-size]')).every(b => b.getAttribute('aria-disabled') === 'true' || b.disabled === true)
}));
ok('尺寸控件标记为锁定', lockUi.locked === true, lockUi);
const seedBefore = (await snap()).seed;
await jsClick('.qbtn[data-size="6"]');
await sleep(700);
const lockTry = await snap();
ok('锁定后点尺寸不出新局', lockTry.seed === seedBefore, { seed: lockTry.seed, was: seedBefore });
await closeSheetIfOpen();

/* ---------- 4. 连开多局：档位稳定 + 尺寸有变化 ---------- */
console.log('\n[4] 连开 8 局');
const seq = [];
for (let i = 0; i < 8; i++) {
  const prev = await snap();
  await page.evaluate(sz => __QUEENS_DEBUG__.newGame(sz), prev.n);
  await waitNew(prev.seed);
  const s = await snap();
  seq.push(s);
  console.log('    #' + (i + 1) + '  ' + s.n + '×' + s.n + '  ' + s.lvl + '  ' + s.score);
}
ok('8 局全部落在困难档', seq.every(s => s.lvl === '困难'), seq.map(s => s.lvl));
ok('8 局尺寸全部在 9–12', seq.every(s => s.n >= 9 && s.n <= 12), seq.map(s => s.n));
const uniq = new Set(seq.map(s => s.n));
ok('尺寸有变化（非恒定）', uniq.size >= 2, Array.from(uniq).sort());
ok('相邻两局尺寸不重复', seq.every((s, i) => i === 0 || s.n !== seq[i - 1].n), seq.map(s => s.n));
const scores = seq.map(s => s.score);
ok('分数仍在困难区间内', scores.every(v => v >= 5.6 && v < 7.6), scores);

/* ---------- 5. 刷新后设置仍在 ---------- */
console.log('\n[5] 刷新持久化');
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction('window.__QUEENS_DEBUG__ && __QUEENS_DEBUG__.state.vibe', { timeout: 20000 });
await sleep(450);
const restored = await page.evaluate(() => ({
  setting: __QUEENS_DEBUG__.settings.difficulty,
  chip: document.getElementById('btnDiff').textContent.replace(/\s+/g, ' ').trim(),
  hasVibe: !!__QUEENS_DEBUG__.state.vibe
}));
ok('刷新后设置仍是困难', restored.setting === 'hard', restored.setting);
ok('刷新后顶栏仍有难度标签', /困难/.test(restored.chip), restored.chip);
ok('刷新后续玩盘仍带难度', restored.hasVibe === true);
await openSheet();
const uiR = await page.evaluate(() => ({
  on: Array.from(document.querySelectorAll('.dbtn.is-on')).map(b => b.textContent.trim()),
  locked: document.getElementById('sizeStepper').classList.contains('diff-locked')
}));
ok('刷新后档位仍高亮困难', uiR.on.length === 1 && uiR.on[0] === '困难', uiR.on);
ok('刷新后尺寸仍锁定', uiR.locked === true);

/* ---------- 6. 切回「不限」 ---------- */
console.log('\n[6] 切回不限');
await jsClick('.dbtn[data-level="any"]');
await sleep(700);
const backAny = await page.evaluate(() => ({
  setting: __QUEENS_DEBUG__.settings.difficulty,
  locked: document.getElementById('sizeStepper').classList.contains('diff-locked'),
  note: document.getElementById('sheetNote').textContent.trim()
}));
ok('设置回到 any', backAny.setting === 'any', backAny.setting);
ok('尺寸控件解锁', backAny.locked === false);
ok('文案恢复「改尺寸即开新局」', /尺寸/.test(backAny.note), backAny.note);

const seedAny = (await snap()).seed;
await jsClick('.qbtn[data-size="12"]');
await page.waitForFunction(s => __QUEENS_DEBUG__.state.seed !== s, { timeout: 40000 }, seedAny);
await sleep(200);
const manual = await snap();
ok('手动选 12 得到 12×12', manual.n === 12, manual);
ok('不限档下尺寸可自由选（难度随之变化）', !!manual.lvl, manual);

/* ---------- 6b. 盘上有子时，换档不作废当前局 ---------- */
console.log('\n[6b] 有进度时换档');
const seedKeep = (await snap()).seed;
await page.evaluate(() => { __QUEENS_DEBUG__.state.marks[0] = 1; __QUEENS_DEBUG__.render(); });
await openSheet();
await jsClick('.dbtn[data-level="extreme"]');
await sleep(600);
const keep = await page.evaluate(() => ({
  seed: __QUEENS_DEBUG__.state.seed,
  lvl: __QUEENS_DEBUG__.state.vibe.level,
  hint: document.getElementById('hint').textContent.trim(),
  setting: __QUEENS_DEBUG__.settings.difficulty,
  sheetClosed: document.getElementById('sheetWrap').hidden
}));
ok('当前局没被换掉', keep.seed === seedKeep && keep.lvl !== '极难', { seed: keep.seed, was: seedKeep, lvl: keep.lvl });
ok('提示说明换一局才生效', /换一局时生效/.test(keep.hint), keep.hint);
ok('设置已记下极难', keep.setting === 'extreme', keep.setting);
ok('面板已收起', keep.sheetClosed === true);
const seedFresh = (await snap()).seed;
await page.evaluate(() => __QUEENS_DEBUG__.newGame(__QUEENS_DEBUG__.state.size));
await waitNew(seedFresh);
const freshHard = await snap();
ok('换一局后落到极难', freshHard.lvl === '极难' && freshHard.n >= 13, freshHard);

/* ---------- 7. 慢设备模拟：遮罩该出来 ---------- */
console.log('\n[7] 慢设备模拟（出题卡 220ms）');
await closeSheetIfOpen();
await openSheet();
await jsClick('.dbtn[data-level="any"]');
await sleep(700);
const seed15 = (await snap()).seed;
await jsClick('.qbtn[data-size="15"]');
await page.waitForFunction(s => __QUEENS_DEBUG__.state.seed !== s, { timeout: 60000 }, seed15);
await sleep(300);
const geo = await page.evaluate(() => {
  const cs = getComputedStyle(document.getElementById('veil'));
  return { pos: cs.position, z: cs.zIndex, an: cs.animationName };
});
ok('遮罩是全屏 fixed 层', geo.pos === 'fixed', geo);
ok('遮罩在弹层之上的层级', parseInt(geo.z, 10) >= 60, geo.z);

// 视觉快照：这张图看的是遮罩长相，所以先把真实 hidden 属性摘掉再拍
await closeSheetIfOpen();
await sleep(250);
await page.evaluate(() => {
  const v = document.getElementById('veil');
  document.getElementById('veilTitle').textContent = '正在生成「极难」15×15';
  delete v.hidden;                 // 撤掉探针，恢复原生反射
  v.removeAttribute('hidden');
});
await sleep(220);
await page.screenshot({ path: SHOTS + 'diff-loading.png' });
await page.evaluate(() => { document.getElementById('veil').setAttribute('hidden', ''); });
await sleep(150);

await page.evaluate(() => {
  if (!window.__origGen) {
    const orig = window.QueensEngine.generate;
    window.__origGen = orig;
    window.QueensEngine.generate = function (n, seed) {
      const t = performance.now();
      while (performance.now() - t < 220) { /* 空转，模拟低端机 */ }
      return orig(n, seed);
    };
  }
});

// 第一次：还没记录到这个尺寸的真实耗时 → 按估值走，先不露（只卡一下）
let s1 = (await snap()).seed;
await armVeil();
await page.evaluate(() => __QUEENS_DEBUG__.newGame(15));
await page.waitForFunction(s => __QUEENS_DEBUG__.state.seed !== s, { timeout: 60000 }, s1);
await sleep(250);
const slowFirst = await veilLog();

// 第二次：记录到真实耗时 → 立刻露遮罩
s1 = (await snap()).seed;
await armVeil();
await page.evaluate(() => __QUEENS_DEBUG__.newGame(15));
await page.waitForFunction(s => __QUEENS_DEBUG__.state.seed !== s, { timeout: 60000 }, s1);
await sleep(250);
const slowSecond = await veilLog();
const slow2Shown = slowSecond.filter(e => e.shown);

ok('首局（无实测）不闪遮罩', slowFirst.filter(e => e.shown).length === 0, slowFirst);
ok('第二局立刻露遮罩', slow2Shown.length > 0, slowSecond);
ok('遮罩文案带档位与尺寸', /正在生成.*15×15/.test(slow2Shown[0] && slow2Shown[0].title || ''), slow2Shown[0]);
ok('遮罩用「不淡入」模式', await page.evaluate(() => document.getElementById('veil').classList.contains('is-instant')));
await page.evaluate(() => { if (window.__origGen) { window.QueensEngine.generate = window.__origGen; window.__origGen = null; } });

/* ---------- 8. 各档位抽查 ---------- */
console.log('\n[8] 各档位抽查');
const BANDS = { easy: ['容易', 4, 5], mid: ['中等', 6, 8], hard: ['困难', 9, 12], extreme: ['极难', 13, 16] };
for (const [key, [name, lo, hi]] of Object.entries(BANDS)) {
  await closeSheetIfOpen();
  await openSheet();
  const curSeed = (await snap()).seed;
  await jsClick('.dbtn[data-level="' + key + '"]');
  await waitNew(curSeed);
  const s = await snap();
  ok(name + '档 → ' + name + ' ' + s.n + '×' + s.n + ' ' + s.score, s.lvl === name && s.n >= lo && s.n <= hi, { n: s.n, lvl: s.lvl, score: s.score });
}
await closeSheetIfOpen();

/* ---------- 9. 无报错 ---------- */
console.log('\n[9] 运行期报错');
const realErrs = errs.filter(e => !/favicon|ERR_FAILED.*favicon/i.test(e));
ok('无 JS 报错', realErrs.length === 0, realErrs);

console.log('\n==== ' + pass + ' PASS / ' + fail + ' FAIL ====');
await browser.close();
process.exit(fail ? 1 : 0);
