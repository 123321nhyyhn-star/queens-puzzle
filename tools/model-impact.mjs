/* ============================================================================
 * 影响量化（去重样本）：每尺寸抽 distinct 棋盘，比较四种口径的分数与档位
 *   现     : difficulty.vibe()
 *   A      : 只换口径（probe/guess 用人类解题器的真实次数）
 *   A+C    : tier 也用人类解题器重判（相当于补上「数线」规则后的效果）
 *   D      : 再加硬门槛 —— 等级 = min(尺寸能给的档, 技巧能给的档)
 * ========================================================================== */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const engine = require('../src/js/engine/engine.js');
const diff = require('../src/js/engine/difficulty.js');
const hint = require('../src/js/engine/hint.js');

const args = new Map();
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) args.set(m[1], m[2] === undefined ? '1' : m[2]);
}
const [sLo, sHi] = (args.get('sizes') || '13-16').split('-').map(Number);
const want = Number(args.get('per') || 6);

const clone = (s) => ({
  alive: s.alive.slice(), cnt: s.cnt,
  rowDone: s.rowDone.slice(), colDone: s.colDone.slice(),
  regDone: s.regDone.slice(), queens: s.queens.slice()
});
const liveOf = (st, cells) => cells.filter((c) => st.alive[c]);

function humanSolve(n, regions, solution) {
  const ctx = hint.ctxOf(n, regions);
  const st = hint.newState(ctx);
  const c = { l1: 0, l2: 0, l3: 0, probes: 0, guesses: 0, stalls: 0, steps: 0 };
  const solCell = new Array(n);
  for (let r = 0; r < n; r++) solCell[regions[r * n + solution[r]]] = r * n + solution[r];

  const logic = () => {
    for (let guard = 0; guard < 6000; guard++) {
      const hit = hint.findHit(st, ctx, 3);
      if (!hit) return 'stall';
      if (hit.dead) return 'dead';
      if (hit.level === 1) c.l1++; else if (hit.level === 2) c.l2++; else c.l3++;
      c.steps++;
      if (hit.kind === 'place') hint.place(st, ctx, hit.cell);
      else for (const x of hit.kills) st.alive[x] = 0;
      if (st.cnt === n) return 'solved';
    }
    return 'stall';
  };

  for (let round = 0; round < 400; round++) {
    const r1 = logic();
    if (r1 !== 'stall') break;
    c.stalls++;
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
        let dead = false;
        for (let guard = 0; guard < 6000; guard++) {
          const h2 = hint.findHit(t, ctx, 3);
          if (!h2) break;
          if (h2.dead) { dead = true; break; }
          if (h2.kind === 'place') hint.place(t, ctx, h2.cell);
          else for (const x of h2.kills) t.alive[x] = 0;
          if (t.cnt === n) break;
        }
        if (dead) { st.alive[cell] = 0; killed = true; }
      }
    }
    if (!killed) {
      let best = null, bestG = -1;
      for (let g = 0; g < n; g++) {
        if (st.regDone[g]) continue;
        const lv = liveOf(st, ctx.regCells[g]);
        if (!lv.length) return { ...c, tier: 0, solved: false };
        if (!best || lv.length < best.length) { best = lv; bestG = g; }
      }
      if (!best) break;
      const target = solCell[bestG];
      if (best.indexOf(target) < 0) return { ...c, tier: 0, solved: false };
      c.guesses++;
      hint.place(st, ctx, target);
    }
  }
  const tier = c.guesses > 0 ? 5 : c.probes > 0 ? 4 : c.l3 > 0 ? 3 : c.l2 > 0 ? 2 : 1;
  return { ...c, tier, solved: st.cnt === n };
}

const LEVELS = ['容易', '中等', '困难', '极难'];
const BAND_TOP = [3.19, 5.59, 7.59, 9.9];
const sizeCap = (n) => (n <= 5 ? 0 : n <= 8 ? 1 : n <= 12 ? 2 : 3);
const tierCap = (t) => (t <= 1 ? 0 : t === 2 ? 1 : t === 3 ? 2 : 3);

const rows = [];
for (let n = sLo; n <= sHi; n++) {
  const seen = new Set();
  let made = 0;
  for (let k = 0; k < want * 8 && made < want; k++) {
    const seed = (k * 2246822519 + n * 3266489917 + 668265263) >>> 0;
    let b;
    try { b = engine.generate(n, seed); } catch (e) { continue; }
    if (!b) continue;
    const key = b.regions.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    made++;

    const v = diff.vibe(n, b.regions, b.solution);
    const hs = humanSolve(n, b.regions, b.solution);
    if (!hs.solved) continue;

    const a = diff.display(n, v.metrics, v.tier, { guess: hs.guesses, probe: hs.probes, areaMax: v.steps.areaMax });
    const ac = diff.display(n, v.metrics, hs.tier, { guess: hs.guesses, probe: hs.probes, areaMax: v.steps.areaMax });
    const cap = Math.min(sizeCap(n), tierCap(hs.tier));
    const dScore = Math.round(Math.min(ac.score, BAND_TOP[cap]) * 10) / 10;

    rows.push({ n, tier: hs.tier, stalls: hs.stalls, probes: hs.probes, guesses: hs.guesses,
      score: v.score, level: v.level, a: a.score, ac: ac.score, acLevel: ac.level,
      d: dScore, dLevel: LEVELS[cap], panelProbe: v.steps.probe });
  }
}

const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
console.log('  n |盘数| tier 分布 | 现档位分布 | D 后档位 | 平均分 现/A/A+C/D | 降级');
for (let n = sLo; n <= sHi; n++) {
  const g = rows.filter((r) => r.n === n);
  if (!g.length) continue;
  const t = [0, 0, 0, 0, 0];
  for (const r of g) t[r.tier - 1]++;
  const lv = (key) => [0, 0, 0, 0].map((_, i) => g.filter((r) => r[key] === LEVELS[i]).length).join('/');
  const drop = g.filter((r) => LEVELS.indexOf(r.dLevel) < LEVELS.indexOf(r.level)).length;
  console.log(
    `${String(n).padStart(3)} |${String(g.length).padStart(4)}| ${t.join('/')} | ${lv('level')} | ${lv('dLevel')} | ` +
    `${avg(g.map((r) => r.score)).toFixed(1)}/${avg(g.map((r) => r.a)).toFixed(1)}/` +
    `${avg(g.map((r) => r.ac)).toFixed(1)}/${avg(g.map((r) => r.d)).toFixed(1)} | ${drop}`
  );
}
const pure = rows.filter((r) => r.tier <= 3);
const ext = rows.filter((r) => r.level === '极难');
console.log(`\n样本 ${rows.length} 盘（去重后）`);
console.log(`纯逻辑可解（0 次假设）：${pure.length} 盘（${Math.round((pure.length / rows.length) * 100)}%）`);
console.log(`极难盘 ${ext.length} 盘，其中纯逻辑可解 ${pure.filter((r) => r.level === '极难').length} 盘` +
  `（${Math.round((pure.filter((r) => r.level === '极难').length / (ext.length || 1)) * 100)}%）`);
console.log('纯逻辑盘明细：');
for (const r of pure) {
  console.log(`  ${r.n}×${r.n} tier${r.tier} 现在 ${r.score}/${r.level} → 改D ${r.d}/${r.dLevel}（卡点 ${r.stalls}，试推 ${r.probes}，面板试推 ${r.panelProbe}）`);
}
console.log(`\n档位变化：${rows.filter((r) => r.level !== r.dLevel).length}/${rows.length}，平均分变化 ${avg(rows.map((r) => r.d - r.score)).toFixed(2)}`);
console.log(`改A（只换口径）平均分变化 ${avg(rows.map((r) => r.a - r.score)).toFixed(2)}，最大 ${Math.max(...rows.map((r) => Math.abs(r.a - r.score))).toFixed(2)}`);
console.log(`改A+C 平均分变化 ${avg(rows.map((r) => r.ac - r.score)).toFixed(2)}，档位变化 ${rows.filter((r) => r.level !== r.acLevel).length} 盘`);
