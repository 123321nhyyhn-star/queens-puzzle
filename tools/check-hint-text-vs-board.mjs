/* ============================================================================
 * 提示文案 × 棋盘 一致性回归（玩家视角）
 * ----------------------------------------------------------------------------
 * 不变量：引导里每一句「还剩 / 只剩 / 全在」都必须和玩家眼睛看到的棋盘一致。
 * 玩家看到的棋盘 = marks（皇后、手标 ×）+ auto（自动打叉画出来的 ×）。
 *
 * 做法：随机造局面（放对/放错的皇后、对/错的 ×、自动打叉开关），
 * 然后像玩家一样一路「点提示 → 照做」，每次核对：
 *   · R1      「这个色块只剩这一格没被划掉」 → 该色块里真的只剩这一格
 *   · R2/R3   「这一行/列只剩这一格」        → 该行/列里真的只剩这一格
 *   · A/B     「没被划掉的格子全在…里 / 只属于…」 → 盘面上真的如此
 *   · 划叉     「N 个格子都可以划掉」         → N 等于真正还没划的格数，且不是真解
 *   · 该猜了   「只剩 N 个位置」              → 盘面上真的只剩这 N 格
 * 用法：node tools/check-hint-text-vs-board.mjs [--samples=2000]
 * ========================================================================== */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const engine = require(path.join(root, 'src/js/engine/engine.js'));
const Hint = require(path.join(root, 'src/js/engine/hint.js'));

const arg = process.argv.find((a) => a.startsWith('--samples='));
const SAMPLES = arg ? parseInt(arg.split('=')[1], 10) : 500;

function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 与 index.html computeAuto() 一致：自动打叉只从已放的皇后推 */
function computeAuto(n, regions, marks) {
  const total = n * n;
  const auto = new Uint8Array(total);
  const filled = new Uint8Array(n);
  for (let i = 0; i < total; i++) if (marks[i] === 2) filled[regions[i]] = 1;
  for (let i = 0; i < total; i++) if (marks[i] !== 2 && filled[regions[i]]) auto[i] = 1;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (marks[r * n + c] !== 2) continue;
      for (let k = 0; k < n; k++) {
        if (k !== c) auto[r * n + k] = 1;
        if (k !== r) auto[k * n + c] = 1;
      }
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < n && cc >= 0 && cc < n) auto[rr * n + cc] = 1;
        }
      }
    }
  }
  for (let i = 0; i < total; i++) if (marks[i] === 2) auto[i] = 0;
  return auto;
}

const problems = [];
const byKind = {};
let plans = 0, catches = 0, catchesAuto = 0, catchesManual = 0;

function bad(o) {
  const key = o.kind;
  byKind[key] = (byKind[key] || 0) + 1;
  if (problems.length < 12) problems.push(o);
}

/* 逐句核对一份 plan */
function audit(p, ctx, board) {
  const { n, regions, marks, auto } = board;
  const isDone = (i) => marks[i] !== 0 || !!auto[i];
  const liveOf = (list) => list.filter((i) => !isDone(i));
  const cellsInRegion = (g) => {
    const out = [];
    for (let i = 0; i < n * n; i++) if (regions[i] === g) out.push(i);
    return out;
  };
  const cellsInRow = (r) => {
    const out = [];
    for (let c = 0; c < n; c++) out.push(r * n + c);
    return out;
  };
  const cellsInCol = (c) => {
    const out = [];
    for (let r = 0; r < n; r++) out.push(r * n + c);
    return out;
  };

  plans++;

  if (p.rule === 'R1' || p.rule === 'R2' || p.rule === 'R3') {
    const hl = p.steps[1].hl || {};
    const live = hl.regions && hl.regions.length ? liveOf(cellsInRegion(hl.regions[0]))
      : hl.rows && hl.rows.length ? liveOf(cellsInRow(hl.rows[0]))
        : liveOf(cellsInCol(hl.cols[0]));
    if (live.length !== 1) {
      bad({ kind: p.rule + '/count', say: 1, real: live.length, live, text: p.steps[1].text });
    } else if (p.steps[1].hl.cells[0] !== live[0]) {
      bad({ kind: p.rule + '/cell', say: p.steps[1].hl.cells[0], real: live[0], text: p.steps[1].text });
    }
  }

  if (p.rule && p.rule.charAt(0) === 'A') {
    // 「这 k 个色块没被划掉的格子，全在…里」
    const hl = p.steps[1].hl || {};
    const lines = (hl.rows || []).concat(hl.cols || []);
    for (const g of hl.regions || []) {
      for (const cell of liveOf(cellsInRegion(g))) {
        const L = hl.rows && hl.rows.length ? (cell / n) | 0 : cell % n;
        if (lines.indexOf(L) < 0) {
          bad({ kind: 'A/scope', g, cell, text: p.steps[1].text });
        }
      }
    }
  }

  if (p.rule && p.rule.charAt(0) === 'B') {
    // 「这 k 条线没被划掉的格子，只属于这 k 个色块」
    const hl = p.steps[1].hl || {};
    const regs = hl.regions || [];
    for (const L of (hl.rows || [])) {
      for (const cell of liveOf(cellsInRow(L))) {
        if (regs.indexOf(regions[cell]) < 0) bad({ kind: 'B/scope', L, cell, text: p.steps[1].text });
      }
    }
    for (const L of (hl.cols || [])) {
      for (const cell of liveOf(cellsInCol(L))) {
        if (regs.indexOf(regions[cell]) < 0) bad({ kind: 'B/scope', L, cell, text: p.steps[1].text });
      }
    }
  }

  if (p.kind === 'guess') {
    const hl = p.steps[1].hl || {};
    const live = hl.rows && hl.rows.length ? liveOf(cellsInRow(hl.rows[0]))
      : hl.cols && hl.cols.length ? liveOf(cellsInCol(hl.cols[0]))
        : liveOf(cellsInRegion(hl.regions[0]));
    if (p.rule === 'G1') {
      // 「只剩这一格没被划掉」：盘面上真的只剩这一格
      if (live.length !== 1) bad({ kind: 'G1/count', real: live.length, text: p.steps[1].text });
      else if (p.choices[0] !== live[0]) bad({ kind: 'G1/cell', say: p.choices[0], real: live[0], text: p.steps[1].text });
    } else {
      const m = /只剩\s*(\d+)\s*个位置/.exec(p.steps[1].text);
      if (m) {
        if (parseInt(m[1], 10) !== live.length) {
          bad({ kind: 'guess/count', say: +m[1], real: live.length, text: p.steps[1].text });
        }
        if (live.length < 2 || p.choices.some((c) => isDone(c))) {
          bad({ kind: 'guess/choices', live, choices: p.choices });
        }
        if (p.choices.slice().sort().join() !== live.slice().sort().join()) {
          bad({ kind: 'guess/set', live, choices: p.choices });
        }
      }
    }
  }

  if (p.action && p.action.type === 'cross') {
    if (p.rule === 'C1') { catches++; if (board.autoOn) catchesAuto++; else catchesManual++; }
    const last = p.steps[p.steps.length - 1].text;
    const m = /(\d+)\s*个格子/.exec(last);
    const real = p.action.cells.filter((i) => marks[i] === 0).length;
    if (m && parseInt(m[1], 10) !== real) bad({ kind: 'kill/count', say: +m[1], real, text: last });
    if (real === 0) bad({ kind: 'kill/empty', text: last });
  }

  if (p.action && p.action.type === 'place' && marks[p.action.cell] === 1) {
    bad({ kind: 'place/onX', cell: p.action.cell });
  }
}

let ok = 0;
for (let s = 0; s < SAMPLES; s++) {
  const rnd = mulberry(s * 2654435761 + 13);
  const n = [6, 8, 10, 12][Math.floor(rnd() * 4)];
  const seed = (s * 7919 + n * 104729) >>> 0;
  const b = engine.generate(n, seed);
  if (!b) continue;
  const { regions, solution } = b;
  const total = n * n;
  const isSol = new Uint8Array(total);
  for (let r = 0; r < n; r++) isSol[r * n + solution[r]] = 1;

  const marks = new Uint8Array(total);
  const qCount = Math.floor(rnd() * n);
  const order = [];
  for (let r = 0; r < n; r++) order.push(r * n + solution[r]);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  for (let k = 0; k < qCount; k++) marks[order[k]] = 2;
  const xCount = Math.floor(rnd() * total * 0.5);
  for (let k = 0; k < xCount; k++) {
    const i = Math.floor(rnd() * total);
    if (marks[i]) continue;
    if (isSol[i] && rnd() > 0.3) continue;   // 30% 的概率故意画错
    marks[i] = 1;
  }
  const autoOn = rnd() < 0.5;
  const board = { n, regions, marks, auto: new Uint8Array(total), autoOn };
  const refresh = () => { board.auto = autoOn ? computeAuto(n, regions, marks) : new Uint8Array(total); };
  refresh();

  const ctx = Hint.ctxOf(n, regions);
  let solved = false;
  for (let step = 0; step < 40; step++) {
    const p = Hint.plan({ n, regions, solution, marks, auto: autoOn ? board.auto : null, maxK: 3, allowProbe: true });
    if (p.kind === 'done') { solved = true; break; }
    if (!p.steps || !p.steps.length) break;
    audit(p, ctx, board);

    if (p.kind === 'guess') break;               // 该猜了：不替玩家选，本局到此为止
    if (!p.action) break;
    const a = p.action;
    if (a.type === 'place') {
      if (!isSol[a.cell]) bad({ kind: 'place/notSolution', cell: a.cell });
      marks[a.cell] = 2;
    } else if (a.type === 'cross') {
      for (const c of a.cells) {
        if (isSol[c]) bad({ kind: 'cross/solution', cell: c, rule: p.rule });
        if (marks[c] === 0) marks[c] = 1;
      }
    } else if (a.type === 'unmark') {
      if (!isSol[a.cell]) bad({ kind: 'unmark/notSolution', cell: a.cell });
      marks[a.cell] = 0;
    } else if (a.type === 'remove') {
      if (isSol[a.cell]) bad({ kind: 'remove/solution', cell: a.cell });
      marks[a.cell] = 0;
    }
    refresh();
  }
  if (solved) ok++;
}

console.log(`样本 ${SAMPLES}，走到底 ${ok} 盘，审了 ${plans} 份提示，其中补划 ${catches} 次`);
console.log(`补划：自动打叉 ${catchesAuto} 次 / 手动划叉 ${catchesManual} 次`);
console.log('问题数：', Object.values(byKind).reduce((a, b) => a + b, 0), JSON.stringify(byKind));
for (const p of problems) console.log('  !!', JSON.stringify(p).slice(0, 260));
process.exit(Object.keys(byKind).length ? 1 : 0);
