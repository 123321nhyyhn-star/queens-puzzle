/* ============================================================================
 * 挑战（设置面板里的限时 / 禁用提示 / 禁用撤销）
 *
 *   python serve.py --no-open
 *   node tools/check-challenge.mjs
 *
 * 规矩：挑战跟尺寸 / 难度一样只写 pending，**点「换一局」才生效**。
 *
 * 覆盖：
 *   1. 面板结构：挑战在「换一局」之上，限时挡位由 LIMIT_OPTIONS 生成
 *   2. 只写 pending：选了不改这一局、不存盘，关面板就作废
 *   3. 换一局才落地：限时开始倒计时、提示 / 撤销被锁
 *   4. 超时判负：封盘 + 「时间到」结果层 + 「重试这一局」仍是同一盘
 *   5. 刷新后限时接着走，锁还在
 *   6. 中途改挑战不生效（这正是这次改动的重点）
 *   7. 限时里解开仍判胜
 * ========================================================================== */
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
// 点「换一局」并等新盘装好
async function shuffle(prevSeed) {
  await jsClick('#btnShuffle');
  await page.waitForFunction(s => {
    const st = __QUEENS_DEBUG__.state;
    return st.seed !== s && st.vibe && document.getElementById('sheetWrap').hidden;
  }, { timeout: 40000 }, prevSeed);
  await sleep(200);
}
const snap = () => page.evaluate(() => ({
  n: __QUEENS_DEBUG__.state.size,
  seed: __QUEENS_DEBUG__.state.seed
}));
const st = () => page.evaluate(() => ({
  status: __QUEENS_DEBUG__.state.status,
  limit: __QUEENS_DEBUG__.state.limit,
  elapsed: Math.round(__QUEENS_DEBUG__.state.elapsed),
  left: Math.round(__QUEENS_DEBUG__.remaining()),
  timeText: document.getElementById('timeText').textContent.trim(),
  low: document.getElementById('timePill').classList.contains('is-low'),
  countdown: document.getElementById('timePill').classList.contains('is-countdown'),
  hintDisabled: document.getElementById('btnHint').disabled,
  undoLocked: document.getElementById('btnUndo').classList.contains('is-locked'),
  saved: JSON.parse(localStorage.getItem('queens.settings.v1') || '{}')
}));
const sheetUi = () => page.evaluate(() => {
  const g = document.querySelector('.challenge');
  const sw = document.querySelector('.shuffle-row');
  const gr = g.getBoundingClientRect();
  const sr = sw.getBoundingClientRect();
  return {
    title: document.getElementById('challengeTitle').textContent.trim(),
    titlePending: document.getElementById('challengeTitle').classList.contains('is-pending'),
    labels: Array.from(document.querySelectorAll('#limitOpts .lbtn')).map(b => b.textContent.trim()),
    on: Array.from(document.querySelectorAll('#limitOpts .lbtn.is-on')).map(b => b.textContent.trim()),
    limitHint: document.getElementById('limitHint').textContent.trim(),
    noHint: document.getElementById('swNoHint').getAttribute('aria-checked'),
    noUndo: document.getElementById('swNoUndo').getAttribute('aria-checked'),
    aboveShuffle: gr.bottom <= sr.top + 1,
    shufflePending: document.getElementById('btnShuffle').classList.contains('is-pending'),
    shuffleHint: document.getElementById('shuffleHint').textContent.trim(),
    switches: document.querySelectorAll('.switch').length,
    overflowX: document.getElementById('sheet').scrollWidth - document.getElementById('sheet').clientWidth
  };
});

await page.goto(URL, { waitUntil: 'networkidle0' });
// 每次从干净设置开始（上一次跑可能留了挑战开着）
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction('window.__QUEENS_DEBUG__ && __QUEENS_DEBUG__.state.regions.length > 0', { timeout: 20000 });
await sleep(700);

console.log('\n--- 1. 面板结构：挑战在「换一局」上面 ---');
await openSheet();
let ui = await sheetUi();
ok('挑战组在「换一局」之上', ui.aboveShuffle);
ok('限时挡位 5 个且首个是「不限」', ui.labels.length === 5 && ui.labels[0] === '不限', ui.labels);
ok('默认选中「不限」', ui.on.length === 1 && ui.on[0] === '不限', ui.on);
ok('开关共 7 个', ui.switches === 7, ui.switches);
ok('没有未落地改动时标题是「挑战」', ui.title === '挑战' && !ui.titlePending, ui.title);
ok('面板不横向溢出', ui.overflowX <= 0, ui.overflowX);
await page.screenshot({ path: `${SHOTS}/d1-sheet.png` });

console.log('\n--- 2. 只写 pending：这一局不动、不存盘 ---');
const seed0 = await snap();
await jsClick('#limitOpts .lbtn[data-limit="180000"]');
await sleep(250);
await jsClick('#swNoHint');
await sleep(150);
await jsClick('#swNoUndo');
await sleep(250);
ui = await sheetUi();
let a = await st();
ok('挡位选中了 3 分', ui.on[0] === '3 分', ui.on);
ok('两个挑战开关都打开', ui.noHint === 'true' && ui.noUndo === 'true', `${ui.noHint}/${ui.noUndo}`);
ok('标题提示「待换一局生效」', ui.titlePending && /待换一局生效/.test(ui.title), ui.title);
ok('「换一局」按钮被点亮', ui.shufflePending);
ok('按钮下方列出待生效的三项', /限时 3 分钟/.test(ui.shuffleHint) &&
  /禁用提示/.test(ui.shuffleHint) && /禁用撤销/.test(ui.shuffleHint), ui.shuffleHint);
ok('限时说明写明换一局后生效', /换一局后生效/.test(ui.limitHint), ui.limitHint);

a = await st();
ok('这一局仍然不限时', a.limit === 0, a.limit);
ok('提示 / 撤销此刻还能用', !a.hintDisabled && !a.undoLocked, `${a.hintDisabled}/${a.undoLocked}`);
ok('设置没被写盘', a.saved.timeLimit === 0 && a.saved.noHint === false && a.saved.noUndo === false,
  [a.saved.timeLimit, a.saved.noHint, a.saved.noUndo]);
await page.screenshot({ path: `${SHOTS}/d2-pending.png` });

console.log('\n--- 3. 关面板不作数（意向作废） ---');
await closeSheetIfOpen();
await sleep(200);
const still = await st();
ok('关掉后卡片仍是已用时', !still.countdown && still.limit === 0, still.timeText);
await openSheet();
ui = await sheetUi();
ok('重开面板回到「不限」', ui.on.length === 1 && ui.on[0] === '不限', ui.on);
ok('两个开关回到关闭', ui.noHint === 'false' && ui.noUndo === 'false', `${ui.noHint}/${ui.noUndo}`);
ok('标题回到「挑战」', !ui.titlePending, ui.title);

console.log('\n--- 4. 换一局才落地 ---');
const seed1 = await snap();
await jsClick('#limitOpts .lbtn[data-limit="180000"]');
await sleep(150);
await jsClick('#swNoHint');
await sleep(120);
await jsClick('#swNoUndo');
await sleep(150);
await shuffle(seed1.seed);
const after = await st();
const seed2 = await snap();
ok('换了一盘新棋', seed2.seed !== seed1.seed, `${seed1.seed}→${seed2.seed}`);
ok('限时落地：180000', after.limit === 180000, after.limit);
ok('倒计时给满', after.left > 175000, after.left);
ok('胶囊变成倒计时 03:00', after.countdown && /^0[23]:\d\d$/.test(after.timeText), after.timeText);
ok('提示被锁', after.hintDisabled);
ok('撤销被锁', after.undoLocked);
ok('设置已写盘', after.saved.timeLimit === 180000 && after.saved.noHint === true && after.saved.noUndo === true,
  [after.saved.timeLimit, after.saved.noHint, after.saved.noUndo]);

// 落了子也撤不动、提示也不出
await page.evaluate(() => {
  const d = __QUEENS_DEBUG__;
  document.querySelectorAll('.cell')[0].click();
  d.render(false);
});
await sleep(250);
const beforeUndo = await page.evaluate(() => __QUEENS_DEBUG__.state.marks.filter(m => m !== 0).length);
await page.keyboard.press('KeyZ');
await page.keyboard.press('KeyH');
await sleep(400);
const locked = await page.evaluate(() => ({
  n: __QUEENS_DEBUG__.state.marks.filter(m => m !== 0).length,
  guide: __QUEENS_DEBUG__.guide().open,
  hints: __QUEENS_DEBUG__.state.hints,
  text: document.getElementById('hint').textContent.trim()
}));
ok('键盘 Z 撤不动', beforeUndo === locked.n, `${beforeUndo}→${locked.n}`);
ok('键盘 H 不出引导', !locked.guide && locked.hints === 0, locked.text);
await page.screenshot({ path: `${SHOTS}/d3-locked.png` });

console.log('\n--- 5. 超时判负 + 重试同一盘 ---');
await page.evaluate(() => {
  const d = __QUEENS_DEBUG__;
  d.state.elapsed = 181000;
  d.state.runningSince = 0;
});
await sleep(900);
const lose = await page.evaluate(() => {
  const r = document.getElementById('result');
  return {
    status: __QUEENS_DEBUG__.state.status,
    open: !r.hidden,
    kind: r.dataset.kind,
    title: document.getElementById('resultTitle').textContent.trim(),
    sub: document.getElementById('resultSub').textContent.trim(),
    timeLbl: document.getElementById('resTimeLbl').textContent.trim(),
    time: document.getElementById('resTime').textContent.trim(),
    btn: document.getElementById('btnAgain').textContent.trim(),
    alt: document.getElementById('btnPeek').textContent.trim(),
    boardLost: document.getElementById('board').classList.contains('is-lost')
  };
});
ok('超时判负 status=lost', lose.status === 'lost', lose.status);
ok('结果层是 lost 版', lose.open && lose.kind === 'lost');
ok('文案是「时间到」', lose.title === '时间到', lose.title);
ok('副标题带限时与还差几只', /限时 3 分钟/.test(lose.sub) && /还差/.test(lose.sub), lose.sub);
ok('统计中间是「限时」', lose.timeLbl === '限时' && /3 分/.test(lose.time), `${lose.timeLbl}=${lose.time}`);
ok('主按钮「重试这一局」/ 次按钮「换一局新的」',
  lose.btn === '重试这一局' && lose.alt === '换一局新的', `${lose.btn}/${lose.alt}`);
ok('棋盘压暗封盘', lose.boardLost);
await page.screenshot({ path: `${SHOTS}/d4-lost.png` });

await page.keyboard.press('Escape');
await sleep(250);
ok('Esc 关不掉失败层', await page.evaluate(() => !document.getElementById('result').hidden));

const beforeRetry = await page.evaluate(() => ({
  regions: Array.from(__QUEENS_DEBUG__.state.regions).join(),
  solution: Array.from(__QUEENS_DEBUG__.state.solution).join()
}));
await jsClick('#btnAgain');
await sleep(700);
const retry = await page.evaluate(() => ({
  status: __QUEENS_DEBUG__.state.status,
  regions: Array.from(__QUEENS_DEBUG__.state.regions).join(),
  solution: Array.from(__QUEENS_DEBUG__.state.solution).join(),
  elapsed: __QUEENS_DEBUG__.state.elapsed,
  limit: __QUEENS_DEBUG__.state.limit,
  left: Math.round(__QUEENS_DEBUG__.remaining()),
  marks: __QUEENS_DEBUG__.state.marks.filter(m => m !== 0).length,
  resultHidden: document.getElementById('result').hidden,
  boardLost: document.getElementById('board').classList.contains('is-lost')
}));
ok('重试后回到 playing', retry.status === 'playing' && retry.resultHidden, retry.status);
ok('还是同一盘棋', retry.regions === beforeRetry.regions && retry.solution === beforeRetry.solution);
ok('标记与用时归零', retry.marks === 0 && retry.elapsed < 50, `marks=${retry.marks} elapsed=${retry.elapsed}`);
ok('限时还在、重新给满', retry.limit === 180000 && retry.left > 175000, retry.left);
ok('封盘暗色撤掉', !retry.boardLost);
await page.screenshot({ path: `${SHOTS}/d5-retry.png` });

console.log('\n--- 6. 刷新后接着走 ---');
await page.evaluate(() => {
  const d = __QUEENS_DEBUG__;
  d.state.marks[d.state.solution[0]] = 1;
  d.render(false);
  d.state.elapsed = 42000;
});
await sleep(500);
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction('window.__QUEENS_DEBUG__ && __QUEENS_DEBUG__.state.regions.length > 0', { timeout: 20000 });
await sleep(700);
const back = await st();
ok('刷新后限时还在', back.limit === 180000, back.limit);
ok('倒计时接着走（没白给满）', back.left < 175000 && back.left > 100000, back.left);
ok('刷新后提示 / 撤销仍锁着', back.hintDisabled && back.undoLocked, `${back.hintDisabled}/${back.undoLocked}`);

console.log('\n--- 7. 中途改挑战不生效 ---');
await openSheet();
await jsClick('#limitOpts .lbtn[data-limit="0"]');
await sleep(150);
await jsClick('#swNoHint');
await sleep(120);
await jsClick('#swNoUndo');
await sleep(200);
ui = await sheetUi();
ok('面板上已经改成「不限 / 都不禁用」',
  ui.on[0] === '不限' && ui.noHint === 'false' && ui.noUndo === 'false', `${ui.on}/${ui.noHint}/${ui.noUndo}`);
ok('标题提醒待生效', ui.titlePending, ui.title);
const mid = await st();
ok('这一局的限时没变', mid.limit === 180000 && mid.countdown, mid.limit);
ok('按钮没解锁', mid.hintDisabled && mid.undoLocked, `${mid.hintDisabled}/${mid.undoLocked}`);
const midSaved = await page.evaluate(() => JSON.parse(localStorage.getItem('queens.settings.v1') || '{}'));
ok('设置也没被改', midSaved.timeLimit === 180000 && midSaved.noHint === true, [midSaved.timeLimit, midSaved.noHint]);
await page.screenshot({ path: `${SHOTS}/d6-mid-pending.png` });

console.log('\n--- 8. 再换一局才把挑战关掉 ---');
const seed3 = await snap();
await shuffle(seed3.seed);
const off = await st();
ok('新局不限时', off.limit === 0 && !off.countdown, off.limit);
ok('胶囊回到已用时', !off.low);
ok('提示解锁', !off.hintDisabled);
ok('撤销解锁', !off.undoLocked);
ok('设置写回关闭', off.saved.timeLimit === 0 && off.saved.noHint === false && off.saved.noUndo === false,
  [off.saved.timeLimit, off.saved.noHint, off.saved.noUndo]);

console.log('\n--- 9. 限时里解开：胜利面板照旧 ---');
await openSheet();
await jsClick('#limitOpts .lbtn[data-limit="600000"]');
await sleep(150);
const seed4 = await snap();
await shuffle(seed4.seed);
await page.evaluate(() => {
  const d = __QUEENS_DEBUG__, n = d.state.size;
  d.state.elapsed = 90000;
  d.state.runningSince = 0;
  d.state.marks.fill(0);
  for (let r = 0; r < n - 1; r++) d.state.marks[r * n + d.state.solution[r]] = 2;
  d.render(false);
  const last = (n - 1) * n + d.state.solution[n - 1];
  d.state.focus = last;
  const cells = document.querySelectorAll('.cell');
  for (let i = 0; i < cells.length; i++) cells[i].tabIndex = i === last ? 0 : -1;
  cells[last].focus();
});
await page.keyboard.press('KeyQ');
await sleep(1400);
const won = await page.evaluate(() => {
  const r = document.getElementById('result');
  return {
    status: __QUEENS_DEBUG__.state.status,
    open: !r.hidden,
    kind: r.dataset.kind,
    title: document.getElementById('resultTitle').textContent.trim(),
    timeLbl: document.getElementById('resTimeLbl').textContent.trim(),
    time: document.getElementById('resTime').textContent.trim(),
    btn: document.getElementById('btnAgain').textContent.trim(),
    alt: document.getElementById('btnPeek').textContent.trim(),
    countdown: document.getElementById('timePill').classList.contains('is-countdown'),
    pill: document.getElementById('timeText').textContent.trim()
  };
});
ok('限时中解开仍是胜利', won.status === 'won' && won.open && won.kind === 'won', `${won.status}/${won.kind}`);
ok('文案回到「解开了」', won.title === '解开了', won.title);
ok('统计中间是「用时」', won.timeLbl === '用时' && won.time === '01:30', `${won.timeLbl}=${won.time}`);
ok('按钮回到「再来一局 / 看看棋盘」', won.btn === '再来一局' && won.alt === '看看棋盘', `${won.btn}/${won.alt}`);
ok('胶囊回到已用时', !won.countdown && won.pill === '01:30', won.pill);
await page.screenshot({ path: `${SHOTS}/d7-won-with-limit.png` });

console.log('\n--- console ---');
console.log(errs.length ? errs.join('\n') : '(none)');
ok('无 JS 报错', errs.length === 0, errs.length);

await browser.close();
console.log(`\n${fail === 0 ? 'ALL PASS' : fail + ' FAILED'}  (${pass} pass / ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
