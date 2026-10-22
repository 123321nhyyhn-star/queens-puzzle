/* ============================================================================
 * 对比「难度面板记账」与「按提示一路走完」的差异
 *
 *   难度面板的“假设试推 ×N” = difficulty.js explain() 沿一条路径统计的试推次数
 *   玩家的实际体验       = hint.js plan() 一步步给提示，走完到底要不要试推
 *
 * 对同一批棋盘分别跑两条路径，统计不一致的比例。
 *
 *   node tools/check-hint-vs-diff.mjs --sizes=13-16 --per=6
 * ========================================================================== */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const args = new Map();
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) args.set(m[1], m[2] === undefined ? '1' : m[2]);
}
const [sLo, sHi] = (args.get('sizes') || '13-16').split('-').map(Number);
const per = Math.max(1, Number(args.get('per')) || 5);

const engine = require('../engine.js');
const diff = require('../difficulty.js');
const hint = require('../hint.js');

/* ---- 按提示走完全局：只信提示给的 action，统计各技巧用了几次 ---------- */
function playByHint(n, regions, solution) {
  const N = n * n;
  const marks = new Uint8Array(N);
  const c = { l1: 0, l2: 0, l3: 0, probe: 0, guess: 0, other: 0, steps: 0 };
  for (let guard = 0; guard < 2000; guard++) {
    const res = hint.plan({ n, regions, solution, marks, auto: null });
    if (!res || !res.steps || !res.steps.length) break;
    if (res.kind === 'done') break;
    const lv = res.level || 0;
    if (res.kind === 'guess') { c.guess++; break; }
    if (lv === 1) c.l1++;
    else if (lv === 2) c.l2++;
    else if (lv === 3) c.l3++;
    else if (lv === 4) c.probe++;
    else c.other++;
    c.steps++;

    const a = res.action;
    if (!a) break;
    if (a.type === 'place') marks[a.cell] = 2;
    else if (a.type === 'cross') for (const x of a.cells) if (marks[x] !== 2) marks[x] = 1;
    else if (a.type === 'remove') marks[a.cell] = 0;
    else if (a.type === 'unmark') marks[a.cell] = 0;
  }
  let queens = 0;
  for (let r = 0; r < n; r++) if (marks[r * n + solution[r]] === 2) queens++;
  return { ...c, solved: queens === n };
}

/* ---- 纯逻辑（不给试推）能推完吗：hint 的规则集 ---------------------- */
function pureLogicHint(n, regions) {
  const ctx = hint.ctxOf(n, regions);
  const st = hint.newState(ctx);
  const c = { l1: 0, l2: 0, l3: 0 };
  for (let guard = 0; guard < 4000; guard++) {
    const hit = hint.findHit(st, ctx, 3);
    if (!hit || hit.dead) break;
    if (hit.level === 1) c.l1++;
    else if (hit.level === 2) c.l2++;
    else c.l3++;
    if (hit.kind === 'place') hint.place(st, ctx, hit.cell);
    else for (const x of hit.kills) st.alive[x] = 0;
    if (st.cnt === n) break;
  }
  return { ...c, solved: st.cnt === n };
}

const rows = [];
for (let n = sLo; n <= sHi; n++) {
  for (let k = 0; k < per; k++) {
    const seed = (k * 7919 + n * 104729 + 987654321) >>> 0;
    const board = engine.generate(n, seed);
    if (!board) { console.log(`${n}: seed ${seed} 生成失败`); continue; }
    const v = diff.vibe(n, board.regions, board.solution);
    const s = v.steps;
    const hp = playByHint(n, board.regions, board.solution);
    const pl = pureLogicHint(n, board.regions);
    rows.push({
      n, seed, level: v.level, score: v.score,
      diffProbe: s.probe, diffGuess: s.guess, diffSingles: s.openSingles,
      diffBlock: s.block, diffCount: s.count,
      hintProbe: hp.probe, hintGuess: hp.guess, hintL1: hp.l1, hintL2: hp.l2, hintL3: hp.l3,
      hintSolved: hp.solved,
      pureSolved: pl.solved
    });
  }
}

const pad = (v, w) => String(v).padStart(w);
console.log('\n n 种子       难度  面板:可定/块/计/试推/猜   走完提示:L1/L2/L3/试推/猜  纯逻辑');
console.log('-'.repeat(96));
for (const r of rows) {
  console.log(
    `${pad(r.n, 2)} ${String(r.seed).padEnd(11)} ${r.level} ${pad(r.score.toFixed(1), 4)}  ` +
    `${pad(r.diffSingles, 3)}/${pad(r.diffBlock, 2)}/${pad(r.diffCount, 2)}/${pad(r.diffProbe, 3)}/${pad(r.diffGuess, 2)}   ` +
    `${pad(r.hintL1, 3)}/${pad(r.hintL2, 3)}/${pad(r.hintL3, 3)}/${pad(r.hintProbe, 3)}/${pad(r.hintGuess, 2)}      ` +
    `${r.pureSolved ? '够' : '不够'}`
  );
}

/* ---- 汇总：面板说“要试推”，实际提示一路不用试推的比例 ---------------- */
const ext = rows.filter((r) => r.level === '极难');
const said = rows.filter((r) => r.diffProbe > 0 || r.diffGuess > 0);
const notNeeded = said.filter((r) => r.hintProbe === 0 && r.hintGuess === 0 && r.hintSolved);
const extSaid = ext.filter((r) => r.diffProbe > 0 || r.diffGuess > 0);
const extNotNeeded = extSaid.filter((r) => r.hintProbe === 0 && r.hintGuess === 0 && r.hintSolved);

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0) + '%';
console.log('\n=== 汇总 ===');
console.log(`样本 ${rows.length} 盘，其中极难 ${ext.length} 盘`);
console.log(`面板记了试推/试错：${said.length} 盘；其中提示全程不需要试推就解完：${notNeeded.length} 盘（${pct(notNeeded.length, said.length)}）`);
console.log(`极难盘里面板记了试推/试错：${extSaid.length} 盘；其中提示全程不需要：${extNotNeeded.length} 盘（${pct(extNotNeeded.length, extSaid.length)}）`);
const pureOk = rows.filter((r) => r.pureSolved).length;
console.log(`用 hint 的规则集（含 L3 数线）纯逻辑可解：${pureOk}/${rows.length} 盘（${pct(pureOk, rows.length)}）`);
const diffPureOk = rows.filter((r) => r.diffProbe === 0 && r.diffGuess === 0).length;
console.log(`用 difficulty 的规则集（无 L3）纯逻辑可解：${diffPureOk}/${rows.length} 盘（${pct(diffPureOk, rows.length)}）`);
const avgHintProbe = rows.reduce((a, r) => a + r.hintProbe, 0) / rows.length;
const avgDiffProbe = rows.reduce((a, r) => a + r.diffProbe, 0) / rows.length;
console.log(`平均试推次数：面板 ${avgDiffProbe.toFixed(2)} vs 提示路径 ${avgHintProbe.toFixed(2)}`);
