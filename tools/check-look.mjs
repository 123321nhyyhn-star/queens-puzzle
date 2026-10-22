/* ============================================================================
 * 外观（顶栏调色盘按钮 → 展柜面板）
 *
 *   python serve.py --no-open
 *   node tools/check-look.mjs
 *
 * 规矩：外观是**即时生效**的偏好（跟音效 / 冲突高亮一类），选完立刻写 settings、
 * 存盘、落到 <html data-mark / data-piece>，棋盘跟着变，不碰局面。
 *
 * 覆盖：
 *   1. 顶栏没有「自动打叉」按钮了，换成外观；自动打叉仍在设置面板里
 *   2. 展柜面板：两排、每排选项由 MARK_STYLES / PIECE_STYLES 生成、有当前标记
 *   3. 选「点」：html[data-mark] 变、CSS 真的把两根斜杠收成一个圆点
 *   4. 选「小猫」：html[data-piece] 变、格子里的画换成粉底小猫，皇后仍是皇后
 *   5. 换样式不动局面（marks 不变）、不进 undo 栈
 *   6. 存档：写进 queens.settings.v1，刷新后还在
 *   7. 面板开着时棋盘锁住；Esc / 知道了 / 点背景都能关；焦点回到顶栏
 *   8. 提示行文案跟着样式走、顶栏小黄点标记「换过样式」
 *   9. 认不出来的存档值退回默认
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

const boot = async () => {
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__QUEENS_DEBUG__ && __QUEENS_DEBUG__.state.regions.length > 0', { timeout: 15000 });
  await sleep(600);
};
await boot();
await page.evaluate(() => localStorage.removeItem('queens.settings.v1'));
await boot();

async function openLook() {
  await page.click('#btnLook');
  await page.waitForFunction(() => !document.getElementById('lookWrap').hidden, { timeout: 5000 });
  await sleep(320);
}
async function pick(kind, id) {
  await page.evaluate((k, i) => {
    const row = k === 'mark' ? document.getElementById('markRow') : document.getElementById('pieceRow');
    row.querySelector(`[data-${k}="${i}"]`).click();
  }, kind, id);
  await sleep(260);
}

// ---------- 1. 顶栏 ----------
console.log('\n--- 顶栏 ---');
const bar = await page.evaluate(() => ({
  auto: !!document.getElementById('btnAuto'),
  look: !!document.getElementById('btnLook'),
  label: document.getElementById('btnLook').getAttribute('aria-label'),
  expanded: document.getElementById('btnLook').getAttribute('aria-expanded'),
  set: document.getElementById('btnLook').classList.contains('is-set'),
  swAuto: !!document.getElementById('swAuto'),
  // 顶栏四颗按钮：外观 / 新局 / 战绩 / 设置
  icons: document.querySelectorAll('.actions .icon-btn').length,
  fits: document.querySelector('.topbar').scrollWidth <= window.innerWidth + 1
}));
ok('顶栏不再有自动打叉按钮', bar.auto === false);
ok('换成了外观按钮', bar.look && bar.label === '外观' && bar.expanded === 'false', bar.label);
ok('顶栏仍是四颗图标按钮', bar.icons === 4, bar.icons);
ok('顶栏不溢出', bar.fits);
ok('默认样式下按钮没有小黄点', bar.set === false);
ok('设置里还有自动打叉开关', bar.swAuto);

// ---------- 2. 展柜面板 ----------
console.log('\n--- 展柜面板 ---');
await openLook();
const ui = await page.evaluate(() => {
  const rows = {
    mark: [...document.querySelectorAll('#markRow .showcase')],
    piece: [...document.querySelectorAll('#pieceRow .showcase')]
  };
  const first = rows.mark[0];
  return {
    open: !document.getElementById('lookWrap').hidden,
    focus: document.activeElement && document.activeElement.id,
    markIds: rows.mark.map(b => b.dataset.mark),
    pieceIds: rows.piece.map(b => b.dataset.piece),
    checked: rows.mark.filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.dataset.mark),
    pieceChecked: rows.piece.filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.dataset.piece),
    on: rows.mark.filter(b => b.classList.contains('is-on')).length,
    // 展位构件齐不齐：玻璃罩 / 顶灯 / 台面 / 反光 / 名牌 / 勾
    parts: ['sc-case', 'sc-lamp', 'sc-plinth', 'sc-glass', 'sc-plate', 'sc-tick']
      .map(c => !!first.querySelector('.' + c)),
    plates: [...document.querySelectorAll('.sc-plate b')].map(b => b.textContent),
    plateExtras: document.querySelectorAll('.sc-plate small, .sc-plate em, .sc-plate i').length,
    marksNow: document.getElementById('markNow').textContent,
    pieceNow: document.getElementById('pieceNow').textContent,
    svgs: rows.piece.map(b => b.querySelectorAll('.sc-item svg').length),
    // 两排并排：第二列在第一列右边、同一行
    cols: (() => {
      const b = rows.mark;
      const r0 = b[0].getBoundingClientRect(), r1 = b[1].getBoundingClientRect();
      return r1.left > r0.left + 20 && Math.abs(r1.top - r0.top) < 2;
    })(),
    overflow: document.getElementById('lookSheet').scrollHeight >
      document.getElementById('lookSheet').clientHeight + 4
  };
});
ok('面板打开', ui.open);
ok('打开后焦点在面板里', ui.focus === 'lookSheet', ui.focus);
ok('叉的展位有两个：叉 / 点', ui.markIds.join() === 'x,dot', ui.markIds);
ok('皇后的展位有两个：皇后 / 小猫', ui.pieceIds.join() === 'queen,cat', ui.pieceIds);
ok('默认选中叉与皇后', ui.checked.join() === 'x' && ui.pieceChecked.join() === 'queen');
ok('同一时刻只有一个选中', ui.on === 1, ui.on);
ok('展位有玻璃罩 / 顶灯 / 台面 / 反光 / 名牌 / 勾', ui.parts.every(Boolean), ui.parts);
ok('名牌只写名字，没有描述', ui.plates.join() === '叉,点,皇后,小猫' && ui.plateExtras === 0,
  `${ui.plates} extras=${ui.plateExtras}`);
ok('标题写着当前用的样式', /叉/.test(ui.marksNow) && /皇后/.test(ui.pieceNow),
  `${ui.marksNow} / ${ui.pieceNow}`);
ok('两个皇后展位都有画', ui.svgs.every(n => n === 1), ui.svgs);
ok('两个展位并排', ui.cols);
ok('面板内容不溢出', !ui.overflow);
await page.screenshot({ path: SHOTS + '20-look-sheet.png' });

// 面板开着时棋盘锁住
const locked = await page.evaluate(() => {
  const d = __QUEENS_DEBUG__;
  const before = d.state.marks[0];
  document.querySelectorAll('.cell')[0].click();
  return { before, after: d.state.marks[0] };
});
ok('面板打开时棋盘锁定', locked.before === locked.after, `${locked.before}→${locked.after}`);

// ---------- 3. 换叉的样式 ----------
console.log('\n--- 叉换成点 ---');
const beforeMarks = await page.evaluate(() => {
  const d = __QUEENS_DEBUG__;
  // 摆一颗皇后 + 一个手标，好量尺寸
  d.state.marks[0] = 2; d.state.marks[1] = 1;
  d.render(false);
  const bar = document.querySelector('.cell.is-x .mark i');
  const cs = bar ? getComputedStyle(bar) : null;
  return {
    marks: Array.from(d.state.marks).join(''),
    undo: document.querySelectorAll('.cell').length,
    bar: cs ? [cs.width, cs.height, cs.borderRadius].join('|') : '',
    auto: document.querySelectorAll('.cell.is-auto').length
  };
});
await pick('mark', 'dot');
const dot = await page.evaluate(() => {
  const el = document.querySelector('.cell.is-x .mark i');
  const second = document.querySelector('.cell.is-x .mark i + i');
  const cs = getComputedStyle(el);
  const auto = document.querySelector('.cell.is-auto .mark i');
  const acs = auto ? getComputedStyle(auto) : null;
  const d = __QUEENS_DEBUG__;
  return {
    attr: document.documentElement.getAttribute('data-mark'),
    setting: d.settings.markStyle,
    w: parseFloat(cs.width), h: parseFloat(cs.height), r: cs.borderRadius,
    second: second ? getComputedStyle(second).display : 'none',
    autoRound: acs ? parseFloat(acs.height) === parseFloat(acs.width) : null,
    marks: Array.from(d.state.marks).join(''),
    saved: JSON.parse(localStorage.getItem('queens.settings.v1') || '{}').markStyle,
    hint: document.getElementById('hint').textContent.trim(),
    set: document.getElementById('btnLook').classList.contains('is-set'),
    label: document.getElementById('btnLook').getAttribute('aria-label')
  };
});
ok('html[data-mark] 变成 dot', dot.attr === 'dot' && dot.setting === 'dot', dot.attr);
ok('手标变成圆点（宽高相同、无斜杠）',
  dot.w > 0 && dot.w === dot.h && /50%/.test(dot.r) && dot.second === 'none',
  `${dot.w}x${dot.h} r=${dot.r} 2nd=${dot.second}`);
ok('自动标记也跟着变圆点', dot.autoRound === true, dot.autoRound);
ok('换样式不动局面', dot.marks === beforeMarks.marks);
ok('样式写进存档', dot.saved === 'dot', dot.saved);
ok('顶栏按钮挂上小黄点', dot.set && /换过/.test(dot.label), dot.label);

// ---------- 4. 换皇后 ----------
console.log('\n--- 皇后换成小猫 ---');
await pick('piece', 'cat');
const cat = await page.evaluate(() => {
  const item = document.querySelector('#pieceRow .showcase[data-piece="cat"] .sc-item svg');
  const piece = document.querySelector('.cell.is-q .piece');
  const svg = piece ? piece.querySelector('svg') : null;
  const queen = document.querySelector('#pieceRow .showcase[data-piece="queen"] .sc-item svg');
  const d = __QUEENS_DEBUG__;
  const box = piece ? piece.getBoundingClientRect() : null;
  const cellBox = piece ? piece.parentElement.getBoundingClientRect() : null;
  return {
    attr: document.documentElement.getAttribute('data-piece'),
    setting: d.settings.pieceStyle,
    // 没有底色：整张画里不该有铺满 viewBox 的 rect，也不该有粉色
    fullRect: svg ? svg.querySelectorAll('rect[width="200"]').length : -1,
    pink: svg ? svg.innerHTML.indexOf('f7d6d6') : -2,
    // 剪影走 currentColor（挂在包住整个身体的 <g> 上）
    groupFill: svg && svg.querySelector('g') ? svg.querySelector('g').getAttribute('fill') : '',
    white: svg ? svg.querySelectorAll('[fill="#ffffff"]').length : 0,
    catPaths: svg ? svg.querySelectorAll('path').length : 0,
    queenPaths: queen ? queen.querySelectorAll('path').length : 0,
    // 占位跟皇后同一套：.piece 仍是格子内缩 5%（不再给小猫单独放宽）
    ratio: box && cellBox ? +(box.width / cellBox.width).toFixed(3) : 0,
    itemPink: item ? item.innerHTML.indexOf('f7d6d6') : -2,
    cells: document.querySelectorAll('.cell.is-q .piece svg path').length,
    saved: JSON.parse(localStorage.getItem('queens.settings.v1') || '{}').pieceStyle,
    pieceNow: document.getElementById('pieceNow').textContent
  };
});
ok('html[data-piece] 变成 cat', cat.attr === 'cat' && cat.setting === 'cat', cat.attr);
ok('棋盘上的皇后换成小猫', cat.cells > 0, cat.cells);
ok('小猫没有底色（不再是一块方底）', cat.fullRect === 0 && cat.pink === -1,
  `rect=${cat.fullRect} pink=${cat.pink}`);
ok('小猫剪影跟皇后一样吃 currentColor', cat.groupFill === 'currentColor', cat.groupFill);
ok('墨色脸上留了白眼与白嘴', cat.white >= 4, cat.white);
ok('占位与皇后一致（内缩 5%，90% 格宽）', cat.ratio > 0.88 && cat.ratio < 0.92, cat.ratio);
ok('展柜里的预览也没有底色', cat.itemPink === -1);
ok('两套画不一样', cat.catPaths !== cat.queenPaths, `cat=${cat.catPaths} queen=${cat.queenPaths}`);
ok('样式写进存档', cat.saved === 'cat', cat.saved);
ok('标题跟着变', /小猫/.test(cat.pieceNow), cat.pieceNow);
await page.screenshot({ path: SHOTS + '21-look-cat.png' });

// ---------- 5. 关面板 + 刷新保留 ----------
console.log('\n--- 关闭与持久化 ---');
await page.keyboard.press('Escape');
await sleep(320);
const closed = await page.evaluate(() => ({
  hidden: document.getElementById('lookWrap').hidden,
  focus: document.activeElement && document.activeElement.id,
  expanded: document.getElementById('btnLook').getAttribute('aria-expanded'),
  inert: document.getElementById('app').inert === true
}));
ok('Esc 关闭面板', closed.hidden);
ok('关闭后焦点回到顶栏', closed.focus === 'btnLook', closed.focus);
ok('aria-expanded 复位、app 解除 inert', closed.expanded === 'false' && !closed.inert);

// 关掉之后还能正常落子（挑一格既没皇后、也没被自动标记的）
const playable = await page.evaluate(() => {
  const d = __QUEENS_DEBUG__;
  const i = d.state.marks.findIndex((v, k) => v === 0 && !d.state.auto[k]);
  document.querySelectorAll('.cell')[i].click();
  return d.state.marks[i];
});
ok('关闭后恢复操作', playable === 1, playable);

await boot();
const afterReload = await page.evaluate(() => ({
  look: __QUEENS_DEBUG__.look(),
  attrMark: document.documentElement.getAttribute('data-mark'),
  attrPiece: document.documentElement.getAttribute('data-piece'),
  dot: (() => {
    const el = document.querySelector('.cell.is-auto .mark i');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return parseFloat(cs.width) === parseFloat(cs.height);
  })(),
  cat: document.querySelectorAll('.cell .piece svg ellipse').length,
  set: document.getElementById('btnLook').classList.contains('is-set')
}));
ok('刷新后仍是点 + 小猫',
  afterReload.look.mark === 'dot' && afterReload.look.piece === 'cat' &&
  afterReload.attrMark === 'dot' && afterReload.attrPiece === 'cat',
  JSON.stringify(afterReload.look));
ok('刷新后棋盘照着样式画', afterReload.cat > 0, `cat=${afterReload.cat} dot=${afterReload.dot}`);
ok('刷新后小黄点还在', afterReload.set);

// 点背景 / 知道了 都能关
await openLook();
await page.mouse.click(195, 40);
await sleep(320);
ok('点背景关闭', await page.evaluate(() => document.getElementById('lookWrap').hidden));
await openLook();
await page.click('#btnLookDone');
await sleep(320);
ok('「知道了」关闭', await page.evaluate(() => document.getElementById('lookWrap').hidden));

// ---------- 6. 切回默认 + 存档兜底 ----------
console.log('\n--- 切回默认与兜底 ---');
await openLook();
await pick('mark', 'x');
await pick('piece', 'queen');
const back = await page.evaluate(() => ({
  look: __QUEENS_DEBUG__.look(),
  set: document.getElementById('btnLook').classList.contains('is-set'),
  hint: document.getElementById('hint').textContent.trim(),
  x: (() => {
    const el = document.querySelector('.cell.is-x .mark i');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return parseFloat(cs.width) > parseFloat(cs.height) * 2;
  })(),
  cat: document.querySelectorAll('.piece svg ellipse').length
}));
ok('切回叉 + 皇后', back.look.mark === 'x' && back.look.piece === 'queen', JSON.stringify(back.look));
ok('小黄点消失', back.set === false);
ok('叉恢复成两根斜杠', back.x === true, back.x);
ok('小猫从棋盘上撤掉', back.cat === 0, back.cat);
await page.keyboard.press('Escape');
await sleep(260);

// 存档里塞脏值：读盘时退回默认，不把棋盘画空
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('queens.settings.v1') || '{}');
  s.markStyle = 'triangle';
  s.pieceStyle = '';
  localStorage.setItem('queens.settings.v1', JSON.stringify(s));
});
await boot();
const dirty = await page.evaluate(() => ({
  look: __QUEENS_DEBUG__.look(),
  attrMark: document.documentElement.getAttribute('data-mark'),
  attrPiece: document.documentElement.getAttribute('data-piece')
}));
ok('存档里的怪值退回默认',
  dirty.look.mark === 'x' && dirty.look.piece === 'queen' &&
  dirty.attrMark === 'x' && dirty.attrPiece === 'queen',
  JSON.stringify(dirty.look));

// ---------- 汇总 ----------
console.log('\n--- console errors ---');
console.log(errs.length ? errs.join('\n') : '(none)');
ok('无 JS 报错', errs.length === 0, errs.length);

await browser.close();
console.log(`\n${fail === 0 ? 'ALL PASS' : fail + ' FAILED'}  (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
