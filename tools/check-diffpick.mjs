/* 目标难度出题：选档位只是「意向」，点「换一局」才生效；尺寸同理；切回不限恢复手动；设置持久化。
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
  if (open) { await jsClick('#btnCloseSheet'); await sleep(380); }
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
const ui0 = await page.evaluate(() => {
  const sheet = document.getElementById('sheet');
  const kids = Array.from(sheet.children);
  return {
    opts: Array.from(document.querySelectorAll('.dbtn')).map(b => b.textContent.trim()),
    on: Array.from(document.querySelectorAll('.dbtn.is-on')).map(b => b.textContent.trim()),
    note: document.getElementById('sheetNote').textContent.trim(),
    hint: document.getElementById('diffHint').textContent.trim(),
    locked: document.getElementById('sizeStepper').classList.contains('diff-locked'),
    hasDone: !!document.getElementById('btnDone'),
    hasRestart: !!document.getElementById('btnRestart'),
    shuffleAfterDiff: kids.indexOf(document.querySelector('.diff-row')) + 1 === kids.indexOf(document.querySelector('.shuffle-row')),
    shuffleHint: document.getElementById('shuffleHint').textContent.trim()
  };
});
ok('五个档位齐全', ui0.opts.length === 5 && ui0.opts.join('') === '不限容易中等困难极难', ui0.opts);
ok('默认选中「不限」', ui0.on.length === 1 && ui0.on[0] === '不限', ui0.on);
ok('默认尺寸不锁定', ui0.locked === false);
ok('没有「好了」与「重开本局」', ui0.hasDone === false && ui0.hasRestart === false);
ok('「换一局」紧跟在目标难度之后', ui0.shuffleAfterDiff === true);
ok('说明文案指向换一局', /换一局/.test(ui0.hint) && /生效/.test(ui0.shuffleHint), [ui0.hint, ui0.shuffleHint]);
ok('面板顶部标出当前这局', /当前这局/.test(ui0.note), ui0.note);
await page.screenshot({ path: SHOTS + 'diff-setting.png' });

/* ---------- 2. 选「困难」：只记意向，不换局 ---------- */
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
await sleep(600);
const picked = await page.evaluate(() => ({
  seed: __QUEENS_DEBUG__.state.seed,
  setting: __QUEENS_DEBUG__.settings.difficulty,
  ls: JSON.parse(localStorage.getItem('queens.settings.v1') || '{}').difficulty,
  sheetClosed: document.getElementById('sheetWrap').hidden,
  pending: document.getElementById('btnShuffle').classList.contains('is-pending'),
  hint: document.getElementById('shuffleHint').textContent.trim(),
  on: Array.from(document.querySelectorAll('.dbtn.is-on')).map(b => b.textContent.trim())
}));
ok('当前局没被换掉', picked.seed === before.seed, { seed: picked.seed, was: before.seed });
ok('面板不自动收起', picked.sheetClosed === false);
ok('意向先挂在面板上，还没写进设置', picked.setting === 'any' && picked.ls === 'any', [picked.setting, picked.ls]);
ok('档位已高亮困难', picked.on.length === 1 && picked.on[0] === '困难', picked.on);
ok('「换一局」进入待生效态', picked.pending === true);
ok('待生效提示写明困难', /生效/.test(picked.hint) && /困难/.test(picked.hint), picked.hint);
await page.screenshot({ path: SHOTS + 'diff-setting-pending.png' });

/* ---------- 3. 点「换一局」才真的落到困难档 ---------- */
console.log('\n[3] 换一局');
await jsClick('#btnShuffle');
await waitNew(before.seed);
await sleep(300);
const veil = await veilLog();
const veilShown = veil.filter(e => e.shown);
const hard1 = await snap();
const afterShuffle = await page.evaluate(() => ({
  setting: __QUEENS_DEBUG__.settings.difficulty,
  ls: JSON.parse(localStorage.getItem('queens.settings.v1') || '{}').difficulty,
  chip: document.getElementById('btnDiff').textContent.replace(/\s+/g, ' ').trim(),
  sheetClosed: document.getElementById('sheetWrap').hidden
}));
ok('新局落在困难档', hard1.lvl === '困难', hard1);
ok('困难档尺寸在 9–12', hard1.n >= 9 && hard1.n <= 12, hard1.n);
ok('快盘不闪遮罩（困难档 3ms 级出题）', veilShown.length === 0, veil);
ok('设置已写回 settings', afterShuffle.setting === 'hard', afterShuffle.setting);
ok('设置已落 localStorage', afterShuffle.ls === 'hard', afterShuffle.ls);
ok('面板收起', afterShuffle.sheetClosed === true);
ok('顶栏难度标签已更新', /困难/.test(afterShuffle.chip), afterShuffle.chip);
await page.screenshot({ path: SHOTS + 'diff-hard-board.png' });

/* ---------- 4. 尺寸锁定 ---------- */
console.log('\n[4] 尺寸锁定');
await openSheet();
const lockUi = await page.evaluate(() => ({
  locked: document.getElementById('sizeStepper').classList.contains('diff-locked'),
  val: document.getElementById('sizeVal').textContent.trim()
}));
ok('尺寸控件标记为锁定', lockUi.locked === true, lockUi);
const seedBefore = (await snap()).seed;
await jsClick('.qbtn[data-size="6"]');
await sleep(500);
const lockTry = await page.evaluate(() => ({
  seed: __QUEENS_DEBUG__.state.seed,
  val: document.getElementById('sizeVal').textContent.trim(),
  pending: document.getElementById('btnShuffle').classList.contains('is-pending')
}));
ok('锁定后点尺寸不出新局', lockTry.seed === seedBefore, { seed: lockTry.seed, was: seedBefore });
ok('锁定后点尺寸不改待生效值', lockTry.val === lockUi.val && lockTry.pending === false, lockTry);
await closeSheetIfOpen();

/* ---------- 5. 连开多局：档位稳定 + 尺寸有变化 ---------- */
console.log('\n[5] 连开 8 局');
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

/* ---------- 6. 刷新后设置仍在 ---------- */
console.log('\n[6] 刷新持久化');
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
  locked: document.getElementById('sizeStepper').classList.contains('diff-locked'),
  pending: document.getElementById('btnShuffle').classList.contains('is-pending')
}));
ok('刷新后档位仍高亮困难', uiR.on.length === 1 && uiR.on[0] === '困难', uiR.on);
ok('刷新后尺寸仍锁定', uiR.locked === true);
ok('刷新后没有待生效改动', uiR.pending === false);

/* ---------- 7. 切回「不限」+ 手动尺寸 ---------- */
console.log('\n[7] 切回不限');
const seedAny0 = (await snap()).seed;
await jsClick('.dbtn[data-level="any"]');
await sleep(500);
const backAnyPending = await page.evaluate(() => ({
  setting: __QUEENS_DEBUG__.settings.difficulty,
  locked: document.getElementById('sizeStepper').classList.contains('diff-locked'),
  seed: __QUEENS_DEBUG__.state.seed,
  pending: document.getElementById('btnShuffle').classList.contains('is-pending')
}));
ok('切不限也不会立刻换局', backAnyPending.seed === seedAny0 && backAnyPending.setting === 'hard', backAnyPending);
ok('尺寸控件当场解锁（只是意向）', backAnyPending.locked === false);
ok('「换一局」提示待生效', backAnyPending.pending === true);

await jsClick('#btnShuffle');
await page.waitForFunction(s => __QUEENS_DEBUG__.state.seed !== s, { timeout: 40000 }, seedAny0);
await sleep(200);
const backAny = await page.evaluate(() => ({
  setting: __QUEENS_DEBUG__.settings.difficulty,
  ls: JSON.parse(localStorage.getItem('queens.settings.v1') || '{}').difficulty
}));
ok('换一局后设置回到 any', backAny.setting === 'any' && backAny.ls === 'any', backAny);

await openSheet();
const seedManual = (await snap()).seed;
const boardNow = (await snap()).n;
const pick = boardNow === 6 ? 12 : 6;   // 挑一个跟当前不同的尺寸，才看得出「没立刻生效」
await jsClick('.qbtn[data-size="' + pick + '"]');
await sleep(400);
const manualPending = await page.evaluate(() => ({
  val: document.getElementById('sizeVal').textContent.trim(),
  board: __QUEENS_DEBUG__.state.size,
  seed: __QUEENS_DEBUG__.state.seed,
  pending: document.getElementById('btnShuffle').classList.contains('is-pending'),
  hint: document.getElementById('shuffleHint').textContent.trim()
}));
ok('点 ' + pick + '×' + pick + ' 只改待生效值',
  manualPending.val === String(pick) && manualPending.board === boardNow &&
  manualPending.seed === seedManual && manualPending.pending === true, manualPending);
ok('待生效提示写明 ' + pick + '×' + pick, new RegExp(pick + '×' + pick).test(manualPending.hint), manualPending.hint);
await jsClick('#btnShuffle');
await page.waitForFunction(s => __QUEENS_DEBUG__.state.seed !== s, { timeout: 40000 }, seedManual);
await sleep(300);
const manual = await snap();
ok('换一局后得到 ' + pick + '×' + pick, manual.n === pick, manual);
ok('不限档下尺寸可自由选（难度随之变化）', !!manual.lvl, manual);

/* ---------- 7b. 盘上有子时改档：同样只记意向 ---------- */
console.log('\n[7b] 有进度时改档');
const seedKeep = (await snap()).seed;
await page.evaluate(() => { __QUEENS_DEBUG__.state.marks[0] = 1; __QUEENS_DEBUG__.render(); });
await openSheet();
await jsClick('.dbtn[data-level="extreme"]');
await sleep(600);
const keep = await page.evaluate(() => ({
  seed: __QUEENS_DEBUG__.state.seed,
  lvl: __QUEENS_DEBUG__.state.vibe.level,
  setting: __QUEENS_DEBUG__.settings.difficulty,
  sheetClosed: document.getElementById('sheetWrap').hidden,
  pending: document.getElementById('btnShuffle').classList.contains('is-pending')
}));
ok('当前局没被换掉', keep.seed === seedKeep && keep.lvl !== '极难', { seed: keep.seed, was: seedKeep, lvl: keep.lvl });
ok('进度还在（面板没关、盘没重排）', keep.sheetClosed === false);
ok('意向已挂上极难', keep.pending === true && keep.setting === 'any', keep);
await jsClick('#btnShuffle');
await waitNew(seedKeep);
await sleep(200);
const freshHard = await snap();
ok('换一局后落到极难', freshHard.lvl === '极难' && freshHard.n >= 13, freshHard);

/* ---------- 8. 慢设备模拟：遮罩该出来 ---------- */
console.log('\n[8] 慢设备模拟（出题卡 220ms）');
await closeSheetIfOpen();
await openSheet();
await jsClick('.dbtn[data-level="any"]');
await sleep(300);
// 换回不限档：顺手把档位清干净，也让下面挑的尺寸是「没测过的」
const seedAny2 = (await snap()).seed;
const restoredSize = (await snap()).n;
await jsClick('#btnShuffle');
await page.waitForFunction(s => __QUEENS_DEBUG__.state.seed !== s, { timeout: 60000 }, seedAny2);
await sleep(300);
// 挑一个这一轮还没生成过的尺寸，首局才是真正的「无实测」
const bigN = restoredSize === 13 ? 14 : 13;
const geo = await page.evaluate(() => {
  const cs = getComputedStyle(document.getElementById('veil'));
  return { pos: cs.position, z: cs.zIndex };
});
ok('遮罩是全屏 fixed 层', geo.pos === 'fixed', geo);
ok('遮罩在弹层之上的层级', parseInt(geo.z, 10) >= 60, geo.z);

// 视觉快照：这张图看的是遮罩长相，所以先把真实 hidden 属性摘掉再拍
await sleep(250);
await page.evaluate(n => {
  const v = document.getElementById('veil');
  document.getElementById('veilTitle').textContent = '正在生成 ' + n + '×' + n;
  delete v.hidden;                 // 撤掉探针，恢复原生反射
  v.removeAttribute('hidden');
}, bigN);
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
await page.evaluate(n => __QUEENS_DEBUG__.newGame(n), bigN);
await page.waitForFunction(s => __QUEENS_DEBUG__.state.seed !== s, { timeout: 60000 }, s1);
await sleep(250);
const slowFirst = await veilLog();

// 第二次：记录到真实耗时 → 立刻露遮罩
s1 = (await snap()).seed;
await armVeil();
await page.evaluate(n => __QUEENS_DEBUG__.newGame(n), bigN);
await page.waitForFunction(s => __QUEENS_DEBUG__.state.seed !== s, { timeout: 60000 }, s1);
await sleep(250);
const slowSecond = await veilLog();
const slow2Shown = slowSecond.filter(e => e.shown);

ok('首局（无实测）不闪遮罩', slowFirst.filter(e => e.shown).length === 0, slowFirst);
ok('第二局立刻露遮罩', slow2Shown.length > 0, slowSecond);
ok('遮罩文案带尺寸', new RegExp('正在生成.*' + bigN + '×' + bigN).test(slow2Shown[0] && slow2Shown[0].title || ''), slow2Shown[0]);
ok('遮罩用「不淡入」模式', await page.evaluate(() => document.getElementById('veil').classList.contains('is-instant')));
await page.evaluate(() => { if (window.__origGen) { window.QueensEngine.generate = window.__origGen; window.__origGen = null; } });

/* ---------- 9. 各档位抽查（选档 → 换一局） ---------- */
console.log('\n[9] 各档位抽查');
const BANDS = { easy: ['容易', 4, 5], mid: ['中等', 6, 8], hard: ['困难', 9, 12], extreme: ['极难', 13, 16] };
for (const [key, [name, lo, hi]] of Object.entries(BANDS)) {
  await closeSheetIfOpen();
  await openSheet();
  const curSeed = (await snap()).seed;
  await jsClick('.dbtn[data-level="' + key + '"]');
  await sleep(200);
  await jsClick('#btnShuffle');
  await waitNew(curSeed);
  const s = await snap();
  ok(name + '档 → ' + name + ' ' + s.n + '×' + s.n + ' ' + s.score, s.lvl === name && s.n >= lo && s.n <= hi, { n: s.n, lvl: s.lvl, score: s.score });
}
await closeSheetIfOpen();

/* ---------- 10. 无报错 ---------- */
console.log('\n[10] 运行期报错');
const realErrs = errs.filter(e => !/favicon|ERR_FAILED.*favicon/i.test(e));
ok('无 JS 报错', realErrs.length === 0, realErrs);

console.log('\n==== ' + pass + ' PASS / ' + fail + ' FAIL ====');
await browser.close();
process.exit(fail ? 1 : 0);
