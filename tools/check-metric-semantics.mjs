/* ============================================================================
 * 口径体检：同一个盘面，几种「难」的定义各说多少
 *   · 面板记账 probe / guess （difficulty.explain，一条固定路径上的 trial 数）
 *   · 最短假设链            （最少要假设几次才能推完，IDDFS）
 *   · 纯逻辑能推完所需的规则强度（hint 规则集，maxK = 1..5）
 *   · 跟着提示走完的步数     （hint.plan 全程）
 * 同时打印各步耗时，评估能不能在开局时现算。
 * ========================================================================== */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const engine = require('../engine.js');
const diff = require('../difficulty.js');
const hint = require('../hint.js');

const args = new Map();
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) args.set(m[1], m[2] === undefined ? '1' : m[2]);
}
const [sLo, sHi] = (args.get('sizes') || '12-16').split('-').map(Number);
const per = Number(args.get('per') || 2);

/* 纯逻辑（hint 规则集）在给定 maxK 下能否推完 */
function pureSolved(n, regions, maxK) {
  const ctx = hint.ctxOf(n, regions);
  const st = hint.newState(ctx);
  for (let guard = 0; guard < 4000; guard++) {
    const hit = hint.findHit(st, ctx, maxK);
    if (!hit || hit.dead) return false;
    if (hit.kind === 'place') hint.place(st, ctx, hit.cell);
    else for (const x of hit.kills) st.alive[x] = 0;
    if (st.cnt === n) return true;
  }
  return false;
}

/* 最少假设几次：IDDFS，假设一次 = 放一只皇后，之间用纯逻辑（maxK=3）推进 */
function minAssumptions(n, regions, capDepth = 4, nodeCap = 200000) {
  const ctx = hint.ctxOf(n, regions);
  let nodes = 0;
  function dfs(st, depth, limit) {
    if (nodes++ > nodeCap) return false;
    // 纯逻辑推到不动
    for (let g = 0; g < 4000; g++) {
      const hit = hint.findHit(st, ctx, 3);
      if (!hit) break;
      if (hit.dead) return false;
      if (hit.kind === 'place') hint.place(st, ctx, hit.cell);
      else for (const x of hit.kills) st.alive[x] = 0;
      if (st.cnt === n) return true;
    }
    if (st.cnt === n) return true;
    if (depth >= limit) return false;
    // 选活格最少的色块开叉
    let best = null;
    for (let g = 0; g < n; g++) {
      if (st.regDone[g]) continue;
      const live = hint.liveOf ? hint.liveOf(st, ctx.regCells[g]) : ctx.regCells[g].filter((c) => st.alive[c]);
      if (!live.length) return false;
      if (!best || live.length < best.length) best = live;
      if (best.length === 1) break;
    }
    if (!best) return false;
    for (const cell of best) {
      const t = { alive: st.alive.slice(), cnt: st.cnt, rowDone: st.rowDone.slice(), colDone: st.colDone.slice(), regDone: st.regDone.slice(), queens: st.queens.slice() };
      hint.place(t, ctx, cell);
      if (dfs(t, depth + 1, limit)) return true;
    }
    return false;
  }
  for (let d = 0; d <= capDepth; d++) {
    nodes = 0;
    if (dfs(hint.newState(ctx), 0, d)) return { depth: d, nodes };
  }
  return { depth: null, nodes };
}

function guidePath(n, regions, solution) {
  const marks = new Uint8Array(n * n);
  const c = { l1: 0, l2: 0, l3: 0, p: 0, g: 0, total: 0 };
  for (let guard = 0; guard < 4000; guard++) {
    const res = hint.plan({ n, regions, solution, marks, auto: null });
    if (!res || !res.steps.length || res.kind === 'done') break;
    if (res.kind === 'guess') { c.g++; break; }
    if (res.level === 1) c.l1++;
    else if (res.level === 2) c.l2++;
    else if (res.level === 3) c.l3++;
    else if (res.level === 4) c.p++;
    c.total++;
    const a = res.action;
    if (!a) break;
    if (a.type === 'place') marks[a.cell] = 2;
    else if (a.type === 'cross') for (const x of a.cells) if (marks[x] !== 2) marks[x] = 1;
    else if (a.type === 'remove' || a.type === 'unmark') marks[a.cell] = 0;
  }
  let q = 0;
  for (let r = 0; r < n; r++) if (marks[r * n + solution[r]] === 2) q++;
  return { ...c, solved: q === n };
}

const tAll = [];
for (let n = sLo; n <= sHi; n++) {
  for (let k = 0; k < per; k++) {
    const seed = (k * 2654435761 + n * 40503 + 1234567) >>> 0;
    let board;
    try { board = engine.generate(n, seed); } catch (e) { continue; }
    if (!board) continue;

    const t0 = performance.now();
    const v = diff.vibe(n, board.regions, board.solution);
    const tVibe = performance.now() - t0;

    const t1 = performance.now();
    const gp = guidePath(n, board.regions, board.solution);
    const tGuide = performance.now() - t1;

    const t2 = performance.now();
    const ma = minAssumptions(n, board.regions, 3);
    const tMin = performance.now() - t2;

    const pk = [];
    for (let mk = 1; mk <= 5; mk++) pk.push(pureSolved(n, board.regions, mk) ? mk : '-');

    tAll.push({ n, tVibe, tGuide, tMin });
    console.log(
      `${n} ${seed} ${v.level} ${String(v.score).padStart(4)} | 面板 试推×${String(v.steps.probe).padStart(3)} 试错×${v.steps.guess} | ` +
      `最短假设链 ${ma.depth === null ? '>3' : ma.depth} | 提示路径 L1/L2/L3/P/G ${gp.l1}/${gp.l2}/${gp.l3}/${gp.p}/${gp.g}` +
      `${gp.solved ? '' : '(未解完)'} | 纯逻辑 maxK ${pk.join(',')} | ${tVibe.toFixed(0)}/${tGuide.toFixed(0)}/${tMin.toFixed(0)}ms`
    );
  }
}
const avg = (f) => (tAll.reduce((a, r) => a + f(r), 0) / tAll.length).toFixed(0);
console.log(`\n耗时均值：vibe ${avg((r) => r.tVibe)}ms  提示全程 ${avg((r) => r.tGuide)}ms  最短假设链 ${avg((r) => r.tMin)}ms`);
