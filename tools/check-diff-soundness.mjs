/* ============================================================================
 * 难度模型可靠性验证（不是口径，是"会不会推错"）
 *   S1  propagate(maxK=0/1/3) 绝不能把正解格排除掉
 *   S2  propagate 一旦 solved，落子必须与正解一致
 *   S3  explain 必须能把每一盘解完（解不完 = 它误杀了正解）
 *   S4  阶梯单调：l1Solved → l2Solved → l3Solved → probeSolved
 *   S5  explain 的 guess 与 tier 不能互相打脸（guess=0 却判成试错型）
 *   S6  面板计数自洽：openSingles ≤ n，probe/guess ≥ 0
 *   S7  hint 的 findHit 同样不能误杀正解
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
const [sLo, sHi] = (args.get('sizes') || '4-16').split('-').map(Number);
const per = Number(args.get('per') || 4);


/* 人类解题器（不限预算）：L1-L3 推到底，卡住就逐格反证，反证不动才猜 */
function humanSolve(n, regions, solution) {
  const clone = (s) => ({ alive: s.alive.slice(), cnt: s.cnt,
    rowDone: s.rowDone.slice(), colDone: s.colDone.slice(),
    regDone: s.regDone.slice(), queens: s.queens.slice() });
  const liveOf = (st, cells) => cells.filter((c) => st.alive[c]);
  const ctx = hint.ctxOf(n, regions);
  const st = hint.newState(ctx);
  const c = { probes: 0, guesses: 0 };
  const solCell = new Array(n);
  for (let r = 0; r < n; r++) solCell[regions[r * n + solution[r]]] = r * n + solution[r];
  const logic = () => {
    for (let guard = 0; guard < 6000; guard++) {
      const hit = hint.findHit(st, ctx, 3);
      if (!hit) return false;
      if (hit.dead) return false;
      if (hit.kind === 'place') hint.place(st, ctx, hit.cell);
      else for (const x of hit.kills) st.alive[x] = 0;
      if (st.cnt === n) return true;
    }
    return false;
  };
  for (let round = 0; round < 400; round++) {
    if (logic()) break;
    let killed = false;
    const units = [];
    for (let g = 0; g < n; g++) if (!st.regDone[g]) units.push(liveOf(st, ctx.regCells[g]));
    for (let r = 0; r < n; r++) if (!st.rowDone[r]) units.push(liveOf(st, ctx.rowCells[r]));
    for (let cc = 0; cc < n; cc++) if (!st.colDone[cc]) units.push(liveOf(st, ctx.colCells[cc]));
    const seen = new Set();
    for (const list of units) {
      for (const cell of list) {
        if (seen.has(cell)) continue;
        seen.add(cell);
        const t = clone(st);
        hint.place(t, ctx, cell);
        c.probes++;
        for (let guard = 0; guard < 6000; guard++) {
          const h2 = hint.findHit(t, ctx, 3);
          if (!h2) break;
          if (h2.dead) { st.alive[cell] = 0; killed = true; break; }
          if (h2.kind === 'place') hint.place(t, ctx, h2.cell);
          else for (const x of h2.kills) t.alive[x] = 0;
          if (t.cnt === n) break;
        }
      }
    }
    if (!killed) {
      let best = null, bestG = -1;
      for (let g = 0; g < n; g++) {
        if (st.regDone[g]) continue;
        const lv = liveOf(st, ctx.regCells[g]);
        if (!best || lv.length < best.length) { best = lv; bestG = g; }
      }
      if (!best) break;
      c.guesses++;
      hint.place(st, ctx, solCell[bestG]);
    }
  }
  return c;
}

const fails = [];
const note = (kind, detail) => fails.push({ kind, detail });

let boards = 0;
for (let n = sLo; n <= sHi; n++) {
  const seen = new Set();
  let made = 0;
  for (let k = 0; k < per * 10 && made < per; k++) {
    const seed = (k * 2246822519 + n * 3266489917 + 668265263) >>> 0;
    let b;
    try { b = engine.generate(n, seed); } catch (e) { continue; }
    if (!b) continue;
    const key = b.regions.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    made++;
    boards++;

    const isSol = new Uint8Array(n * n);
    for (let r = 0; r < n; r++) isSol[r * n + b.solution[r]] = 1;

    /* S1/S2：三档 propagate 都不能误杀正解 */
    for (const mk of [0, 1, 3]) {
      const ctx = diff.makeCtx(n, b.regions);
      const st = diff.initState(ctx);
      const p = diff.propagate(st, ctx, mk);
      for (let i = 0; i < n * n; i++) {
        if (!isSol[i]) continue;
        // 正解格要么还活着，要么已经作为皇后被放下（放下后 alive=0 是正常的）
        const placedHere = st.queens[b.regions[i]] === i;
        if (!st.alive[i] && !placedHere) {
          note('S1 误杀正解', `n=${n} maxK=${mk} cell=${i}`);
          break;
        }
      }
      if (p.solved) {
        for (let g = 0; g < n; g++) {
          const cell = st.queens[g];
          if (cell < 0 || !isSol[cell]) note('S2 解错', `n=${n} maxK=${mk} region=${g} cell=${cell}`);
        }
      }
    }

    /* S3：explain 必须解完 */
    const m = diff.analyze(n, b.regions, b.solution, { nodeCap: 200000 });
    const ex = diff.explain(n, b.regions, b.solution);
    if (!ex.solved) note('S3 explain 没解完', `n=${n} seed=${seed}`);

    /* S4：阶梯单调 */
    if (m.l1Solved && !m.l2Solved) note('S4 l1→l2 不单调', `n=${n} seed=${seed}`);
    if (m.l2Solved && !m.l3Solved) note('S4 l2→l3 不单调', `n=${n} seed=${seed}`);
    if (m.l3Solved && !m.probeSolved) note('S4 l3→probe 不单调', `n=${n} seed=${seed}`);
    if (m.l3Solved && (ex.probe > 0 || ex.guess > 0)) note('S4 纯逻辑却被记账试推', `n=${n} probe=${ex.probe} guess=${ex.guess}`);

    /* S5：tier 与 explain 互相打脸 */
    const rt = diff.score(m);
    if (ex.guess === 0 && rt.tier === 5) note('S5 guess=0 却判试错型', `n=${n} seed=${seed} probe=${ex.probe}`);
    if (ex.probe === 0 && ex.guess === 0 && rt.tier >= 4) note('S5 纯逻辑却判试推/试错型', `n=${n} tier=${rt.tier}`);
    if (ex.solved && ex.guess > 0 && rt.tier < 4) note('S5 靠猜却判成纯逻辑型', `n=${n} tier=${rt.tier} guess=${ex.guess}`);

    /* S6：计数自洽 */
    if (ex.openSingles > n) note('S6 openSingles > n', `n=${n} open=${ex.openSingles}`);
    if (ex.singles > n) note('S6 singles > n', `n=${n} singles=${ex.singles}`);
    if (ex.probe < 0 || ex.guess < 0) note('S6 负数', `n=${n}`);

    /* S7：hint 的规则不能误杀正解 */
    const hctx = hint.ctxOf(n, b.regions);
    const hst = hint.newState(hctx);
    let killedSol = -1;
    for (let guard = 0; guard < 4000; guard++) {
      const hit = hint.findHit(hst, hctx, 3);
      if (!hit || hit.dead) break;
      if (hit.kind === 'place') {
        if (!isSol[hit.cell]) { note('S7 hint 放错皇后', `n=${n} cell=${hit.cell}`); break; }
        hint.place(hst, hctx, hit.cell);
      } else {
        for (const c of hit.kills) {
          if (isSol[c]) { killedSol = c; break; }
          hst.alive[c] = 0;
        }
        if (killedSol >= 0) { note('S7 hint 误杀正解', `n=${n} cell=${killedSol} rule=${hit.rule}`); break; }
      }
      if (hst.cnt === n) break;
    }

    /* S8/S9：面板说"不用假设"，提示路径也必须不用；面板说不用猜，提示也不该要猜 */
    const hs = humanSolve(n, b.regions, b.solution);
    const panelPure = ex.probe === 0 && ex.guess === 0;
    const hintPure = hs.probes === 0 && hs.guesses === 0;
    if (panelPure !== hintPure) note('S8 面板与提示对"要不要假设"判断相反', `n=${n} 面板 probe=${ex.probe}/guess=${ex.guess}，提示 probe=${hs.probes}/guess=${hs.guesses}`);
    if (ex.guess > 0 && hs.guesses === 0) note('S9 面板说要猜，提示不用猜', `n=${n} 面板 guess=${ex.guess}`);
  }
}

console.log(`验证 ${boards} 盘`);
if (!fails.length) {
  console.log('全部通过：没有发现推出错误结论的地方');
} else {
  const byKind = {};
  for (const f of fails) byKind[f.kind] = (byKind[f.kind] || 0) + 1;
  console.log('失败项：', byKind);
  for (const f of fails.slice(0, 25)) console.log(' ', f.kind, '|', f.detail);
}
