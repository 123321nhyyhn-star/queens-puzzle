/* ============================================================================
 * 试推（L4）那套话的检查：
 *   1. 步数落在 5–8 之间（面板最多 8 颗点，再多就塞不进 320px 那一行）
 *   2. 「假设…」和「所以…不能放」之间必须有内容 —— 不许退回「往下推 → 就矛盾了」
 *   3. 文案说「格子全在这几处」时，这一步高亮的东西必须真的盖住那一整块
 *   4. 界面上每一步都有圈画；ghost（假设里推出来的）确实用了虚线框；
 *      面板高度不超过 110（320 屏两行文案）
 * 用法：先 python serve.py --no-open，再 node tools/check-probe-guide.mjs
 * ========================================================================== */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('C:/Users/CJL/.workbuddy/binaries/node/workspace/');
const puppeteer = require('puppeteer-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const nodeRequire = createRequire(import.meta.url);
const engine = nodeRequire(path.join(root, 'src/js/engine/engine.js'));
const Hint = nodeRequire(path.join(root, 'src/js/engine/hint.js'));

const QURL = process.env.QURL || 'http://127.0.0.1:8080/';
const OUT = path.join(root, 'tools/shots');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fails = [];
function expect(cond, msg) { if (!cond) fails.push(msg); }

/* ------------------------------------------------ 一、引擎：文案与步数 */
const stepsHist = {};
let pPlans = 0, zeroTrace = 0, longTrace = 0, markedAssume = 0;

for (const n of [8, 10, 12, 16]) {
  for (let k = 0; k < 6; k++) {
    const seed = (k * 7919 + n * 104729 + 987654321) >>> 0;
    const b = engine.generate(n, seed);
    if (!b) continue;
    const { regions, solution } = b;
    const ctx = Hint.ctxOf(n, regions);
    const marks = new Uint8Array(n * n);

    for (let guard = 0; guard < 600; guard++) {
      const p = Hint.plan({ n, regions, solution, marks, maxK: 3, allowProbe: true });
      if (p.kind === 'done' || p.kind === 'guess' || !p.action) break;
      if (p.rule === 'P') {
        pPlans++;
        const tag = `n=${n} seed=${seed} 第${guard}步`;
        const texts = p.steps.map(s => s.text);
        const len = p.steps.length;
        stepsHist[len] = (stepsHist[len] || 0) + 1;

        expect(len >= 5 && len <= 8, `${tag}: 试推步数 ${len}，应为 5–8`);
        expect(texts.every(t => t && t.length >= 4), `${tag}: 有空文案 ${JSON.stringify(texts)}`);
        expect(texts[0].indexOf('试一个假设') > 0, `${tag}: 第 1 步不是在讲「只能试假设」：${texts[0]}`);
        expect(/^假设第\d+行第\d+列放皇后$/.test(texts[1] || ''), `${tag}: 第 2 步不是「假设…放皇后」：${texts[1]}`);
        expect(texts[2] === '这一行、这一列、这个色块就都满了，周围一圈也不能放',
          `${tag}: 第 3 步没讲清假设立刻排掉了什么：${texts[2]}`);
        expect(/^所以第\d+行第\d+列不能放皇后$/.test(texts[len - 1] || ''),
          `${tag}: 末步不是结论：${texts[len - 1]}`);

        // ★ 这次改的正题：假设与结论之间必须有话，而且不许是光说「往下推」
        expect(len >= 5, `${tag}: 假设与结论之间一句话都没有`);
        expect(!texts.some(t => /往下推$/.test(t)), `${tag}: 又出现了光说「往下推」的废步`);

        if (len === 5) {
          // 假设一放就撞墙：第 4 句要讲「被哪几处挤空」
          zeroTrace++;
          expect(/^偏偏/.test(texts[3]) && /一格不剩$/.test(texts[3]),
            `${tag}: 没中间步时应讲成「偏偏…一格不剩」，实际 ${texts[3]}`);
          // 那一步得把「被挤空的这个单位」标出来（行/列/色块），格子可能早就被划掉了
          expect((p.steps[3].hl.regions || []).length + (p.steps[3].hl.rows || []).length +
            (p.steps[3].hl.cols || []).length >= 1, `${tag}: 「偏偏」那一步没标出被挤空的单位`);
        } else {
          longTrace++;
          expect(/^于是/.test(texts[3]), `${tag}: 第 4 步应以「于是」开头：${texts[3]}`);
          if (len >= 7) {
            // 8 步：中间那句占一位，撞墙前那一步落在 len-3
            expect(/^接着/.test(texts[len - 3]), `${tag}: 撞墙前那一步应以「接着」开头：${texts[len - 3]}`);
          }
          expect(/^推到这一步：.+已经没有位置可放$/.test(texts[len - 2]),
            `${tag}: 撞墙那句不对：${texts[len - 2]}`);
        }
        if (len === 8) {
          expect(/^中间又这样推了(一步|\s\d+ 步)/.test(texts[4]), `${tag}: 中间那段没归成一句：${texts[4]}`);
        }

        // 每一步都得有圈画，否则玩家这一步在棋盘上看不到任何东西
        expect(p.steps.every(s => s.hl && ((s.hl.cells || []).length || (s.hl.rows || []).length ||
          (s.hl.cols || []).length || (s.hl.regions || []).length || (s.hl.assume || []).length)),
          `${tag}: 有一步什么高亮都没有`);
        // 假设里的结论要跟真结论分开画：assume（紫圈=假设里的皇后）/ ghost（灰虚线圈=被排除）
        expect(p.steps.filter(s => s.hl && s.hl.assume).length >= 1, `${tag}: 没有一步标出「假设里的皇后」`);
        expect(p.steps.filter(s => s.hl && (s.hl.ghost || s.hl.assume)).length >= 2, `${tag}: ghost 高亮太少`);
        // 别在玩家已经画好的 × / 皇后上再套一个灰虚线圈（紫圈是例外：那是假设里的皇后，
        // 玩家可能早就把那一格画成 × 了，但它正是这段推理的锚点）
        const circled = p.steps.reduce((a, s) => a.concat(s.hl.cells || []), []);
        const dirty = circled.filter(c => marks[c] !== 0);
        expect(!dirty.length, `${tag}: 圈到了玩家已经标过的格子 ${dirty.slice(0, 6)}`);
        // 「只剩一格」必须指出是哪一格，否则文案在棋盘上落不了地
        const only = p.steps.filter(s => /只剩一格/.test(s.text));
        expect(only.every(s => (s.hl.assume || []).length === 1),
          `${tag}: 有「只剩一格」却没圈出那一格`);
        // 而且那一格必须是玩家盘面上还空着的：试推的盘面已经把玩家的 × 当成不能放，
        // 所以推到这一步一定是空格。指着玩家画过的 × 念「只剩一格」是自相矛盾。
        for (const s of only) {
          const fc = (s.hl.assume || [])[0];
          if (marks[fc] !== 0) markedAssume++;
          expect(marks[fc] === 0, `${tag}: 「只剩一格」指向的格子玩家已经标过了（${fc}）`);
          expect(/皇后只能放这里$/.test(s.text), `${tag}: 「只剩一格」的句式不对：${s.text}`);
        }
        expect(!texts.some(t => /早就被划掉了/.test(t)), `${tag}: 又出现了「只剩一格，可这一格早就被划掉了」这种自相矛盾的话`);
      }
      if (p.action.type === 'place') marks[p.action.cell] = 2;
      else if (p.action.type === 'cross') for (const c of p.action.cells) if (marks[c] === 0) marks[c] = 1;
      else marks[p.action.cell] = 0;
    }
  }
}

console.log(`引擎：${pPlans} 个试推提示（无中间步 ${zeroTrace} / 有中间步 ${longTrace}），「只剩一格」落在已画 × 格上 ${markedAssume} 步`);
console.log('步数分布:', JSON.stringify(stepsHist));

/* --------------------------------- 一·b、盘面上有个错的 × 时，先纠错再试推 */
/* 试推会把玩家的 × 当成「不能放」，所以盘面上留着错的 × 时推出来的结论会跟着错。
   plan 必须先把「把解位画成 ×」的情况拦成 fixCross，不许落到 rule P。 */
let wrongXTried = 0, wrongXFixed = 0;
for (const n of [8, 10]) {
  for (let k = 0; k < 4; k++) {
    const seed = (k * 3571 + n * 9199 + 13572468) >>> 0;
    const b = engine.generate(n, seed);
    if (!b) continue;
    const { regions, solution } = b;
    const marks = new Uint8Array(n * n);
    for (let guard = 0; guard < 200; guard++) {
      const p = Hint.plan({ n, regions, solution, marks, maxK: 3, allowProbe: true });
      if (!p || p.kind === 'done' || p.kind === 'guess' || !p.action) break;
      if (p.rule === 'P' && guard > 4) {
        // 把一格「真解位、还没被标过」的画成 ×，再看 plan 怎么答
        for (let r = 0; r < n; r++) {
          const c0 = r * n + solution[r];
          if (marks[c0] !== 0) continue;
          const probe = new Uint8Array(marks);
          probe[c0] = 1;
          const q = Hint.plan({ n, regions, solution, marks: probe, maxK: 3, allowProbe: true });
          wrongXTried++;
          expect(q.rule !== 'P', `n=${n} seed=${seed}: 盘上有错的 ×（第${r + 1}行第${solution[r] + 1}列）却还在试推`);
          if (q.kind === 'fixCross') wrongXFixed++;
          break;
        }
      }
      if (p.action.type === 'place') marks[p.action.cell] = 2;
      else if (p.action.type === 'cross') for (const c of p.action.cells) if (marks[c] === 0) marks[c] = 1;
      else marks[p.action.cell] = 0;
    }
  }
}
console.log(`错的 ×：${wrongXTried} 个盘面逐个查过，没有一次落回试推（${wrongXFixed} 个直接报「检查」）`);

/* ------------------------------------------------ 二、界面：逐屏看 */
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=2']
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

for (const [w, h] of [[320, 568], [390, 844]]) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(QURL, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__QUEENS_DEBUG__ && __QUEENS_DEBUG__.state.vibe', { timeout: 20000 });
  await sleep(250);

  let done = false;
  for (let trial = 0; trial < 8 && !done; trial++) {
    await page.evaluate(() => __QUEENS_DEBUG__.newGame(10));
    await page.waitForFunction(() => __QUEENS_DEBUG__.state.size === 10 && __QUEENS_DEBUG__.state.vibe, { timeout: 30000 });
    await sleep(220);
    // 把棋盘推到「只能试推」那一步（用页面里那份 QueensHint，和真实引导一致）
    const got = await page.evaluate(() => {
      const st = __QUEENS_DEBUG__.state, H = window.QueensHint, mk = new Uint8Array(st.marks);
      for (let guard = 0; guard < 200; guard++) {
        const p = H.plan({ n: st.size, regions: st.regions, solution: st.solution, marks: mk, auto: null, maxK: 3, allowProbe: true });
        if (!p || !p.steps || p.kind === 'done' || p.kind === 'none') return false;
        if (p.rule === 'P') { st.marks = mk; __QUEENS_DEBUG__.render(); return true; }
        if (!p.action) return false;
        if (p.action.type === 'place') mk[p.action.cell] = 2;
        else if (p.action.type === 'cross') for (const c of p.action.cells) mk[c] = 1;
        else mk[p.action.cell] = 0;
      }
      return false;
    });
    if (!got) continue;
    await sleep(300);

    const board0 = await page.evaluate(() => {
      const r = document.getElementById('board').getBoundingClientRect();
      return { top: Math.round(r.top), w: Math.round(r.width) };
    });
    await page.click('#btnHint');
    await sleep(360);

    const snap = () => page.evaluate(() => {
      const c = document.getElementById('coach').getBoundingClientRect();
      const b = document.getElementById('board').getBoundingClientRect();
      const g = __QUEENS_DEBUG__.guide();
      const cur = g.plan && g.plan.steps[g.at];
      return {
        n: document.querySelectorAll('#coachDots i').length,
        at: __QUEENS_DEBUG__.guide().at,
        text: document.getElementById('coachText').textContent,
        coachH: Math.round(c.height), coachTop: Math.round(c.top),
        boardBottom: Math.round(b.bottom), boardTop: Math.round(b.top),
        gl: document.getElementById('gl').childElementCount,
        ghost: document.querySelectorAll('#gl .gl-cell.is-ghost').length,
        dots: document.querySelectorAll('#gl .gl-dot').length,
        assume: cur && cur.hl.assume ? cur.hl.assume.length : 0,
        next: document.getElementById('coachNext').textContent,
        overflow: document.documentElement.scrollWidth > window.innerWidth
      };
    });

    let s = await snap();
    const dots = s.n;
    expect(dots >= 5 && dots <= 8, `${w}px: 点点数 ${dots}，应为 5–8`);
    expect(s.coachH <= 110, `${w}px: 面板高 ${s.coachH}，超过 110`);
    expect(s.coachTop >= s.boardBottom - 1, `${w}px: 面板压到了棋盘`);
    expect(!s.overflow, `${w}px: 横向溢出`);

    let ghosts = 0;
    for (let i = 0; i < dots; i++) {
      s = await snap();
      expect(s.at === i, `${w}px: 第 ${i} 步没对上 at=${s.at}`);
      expect(s.gl > 0, `${w}px#${i}: 这一步圈画层是空的`);
      expect(s.coachH <= 110, `${w}px#${i}: 面板高 ${s.coachH}，超过 110`);
      expect(s.coachTop >= s.boardBottom - 2, `${w}px#${i}: 面板压到了棋盘`);
      expect(s.text.length >= 4, `${w}px#${i}: 空文案`);
      // 紫点只点「假设里的皇后」，有一个圈就有一个点
      expect(s.dots === s.assume, `${w}px#${i}: 紫点 ${s.dots} 个，assume ${s.assume} 个`);
      ghosts += s.ghost;
      if (i < dots - 1) { await page.click('#coachNext'); await sleep(140); }
    }
    expect(ghosts >= 3, `${w}px: 全程只有 ${ghosts} 个 ghost 圈，假设里的结论没画出来`);
    expect(s.next === '照做', `${w}px: 末步按钮是「${s.next}」，应为「照做」`);
    await page.screenshot({ path: `${OUT}/probe-${w}.png` });

    // 照做：只划掉假设那一格
    await page.click('#coachNext');
    await sleep(320);
    const closed = await page.evaluate(() => ({ open: __QUEENS_DEBUG__.guide().open, gl: document.getElementById('gl').childElementCount }));
    expect(!closed.open && closed.gl === 0, `${w}px: 照做后面板/圈画没清干净`);
    expect(board0.w > 0, `${w}px: 棋盘宽度没读到`);
    done = true;
  }
  expect(done, `${w}px: 8 盘都没走到试推那一步`);
}
await browser.close();

console.log('页面错误:', errs.length ? errs : '无');
console.log(fails.length ? '\n❌ 失败 ' + fails.length + ' 项:\n' + fails.join('\n') : '\n✅ 全部通过');
process.exit(fails.length || errs.length ? 1 : 0);
