/* ============================================================================
 * 难度度量探针：批量生成棋盘 → 算指标 → 输出 JSON / CSV / 控制台表格
 *
 *   node tools/difficulty-probe.mjs                          # 4..16，每尺寸 10 盘
 *   node tools/difficulty-probe.mjs --sizes=4-16 --per=20
 *   node tools/difficulty-probe.mjs --big --sizes=17-30 --per=1
 * ========================================================================== */
import { createRequire } from 'node:module';
import fs from 'node:fs';
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

const [sLo, sHi] = (args.get('sizes') || '4-16').split('-').map(Number);
const per = Math.max(1, Number(args.get('per')) || 10);
const big = args.has('big');
const outFile = args.get('out') || (big ? 'tools/big-board.json' : 'tools/difficulty-data.json');

/* --- 载入引擎：--big 时把 16 的上限放宽，用来试探超界行为 --------------- */
function loadEngine(maxSize) {
  const src = fs.readFileSync(path.join(root, 'engine.js'), 'utf8');
  if (!maxSize) return require('../engine.js');
  const patched = src.replace('Math.min(16,', 'Math.min(' + maxSize + ',');
  if (patched === src) throw new Error('未能改写尺寸上限');
  const tmp = path.join(here, '.tmp-engine-big.cjs');
  fs.writeFileSync(tmp, patched);
  return require(tmp);
}

const engine = loadEngine(big ? 64 : 0);
const diff = require('../difficulty.js');

const rows = [];
const boards = [];
const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const med = (a) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

for (let n = sLo; n <= sHi; n++) {
  const stat = {
    n, tried: 0, ok: 0, fail: 0,
    ms: [], areaMax: [], areaMin: [], areaCV: [], single: [],
    tiers: [0, 0, 0, 0, 0, 0],
    guess: [], probes: [], l3Elim: [], nodes: [], score: []
  };

  for (let k = 0; k < per; k++) {
    const seed = (k * 7919 + n * 104729 + 987654321) >>> 0;
    stat.tried++;
    const t0 = performance.now();
    let board = null, err = null;
    try { board = engine.generate(n, seed); } catch (e) { err = e.message; }
    const wall = performance.now() - t0;
    if (!board) { stat.fail++; boards.push({ n, seed, ok: false, wall, err }); continue; }

    // 用带逻辑传播的搜索独立数解（不依赖引擎自己的节点预算）
    const ctx = diff.makeCtx(n, board.regions);
    const sr = diff.searchSolve(ctx, 3, { limit: 2, nodeCap: 300000 });
    const uniq = sr.stat.solutions === 1;
    const met = diff.analyze(n, board.regions, board.solution, { nodeCap: 300000 });
    const rt = diff.score(met);

    if (!uniq) {
      stat.fail++;
      boards.push({ n, seed, ok: false, wall, reason: 'not-unique', sols: sr.stat.solutions });
      continue;
    }

    stat.ok++;
    stat.ms.push(Math.round(wall));
    stat.areaMax.push(board.maxArea);
    stat.areaMin.push(board.minArea);
    stat.areaCV.push(met.areaCV);
    stat.single.push(met.singleRegions);
    stat.tiers[rt.tier]++;
    if (met.guessDepth !== null) stat.guess.push(met.guessDepth);
    stat.probes.push(met.probes);
    stat.l3Elim.push(met.l3Elim);
    stat.nodes.push(met.searchNodes);
    stat.score.push(rt.score);

    boards.push({
      n, seed, ok: true, wall: Math.round(wall), msEngine: board.ms,
      maxArea: board.maxArea, minArea: board.minArea, areas: board.areas,
      metrics: met, rating: rt
    });
  }

  const r = {
    n,
    ok: stat.ok, fail: stat.fail,
    msAvg: Math.round(avg(stat.ms)), msMax: stat.ms.length ? Math.max(...stat.ms) : 0,
    areaMax: med(stat.areaMax), areaMin: med(stat.areaMin),
    cv: Number(avg(stat.areaCV).toFixed(3)),
    single: Number(avg(stat.single).toFixed(2)),
    tiers: stat.tiers,
    guessAvg: Number((stat.guess.length ? avg(stat.guess) : 0).toFixed(2)),
    guessMax: stat.guess.length ? Math.max(...stat.guess) : 0,
    probes: Math.round(avg(stat.probes)),
    l3Elim: Math.round(avg(stat.l3Elim)),
    nodes: med(stat.nodes),
    score: Math.round(avg(stat.score)),
    scoreMax: stat.score.length ? Math.max(...stat.score) : 0
  };
  rows.push(r);

  console.log(
    `${String(r.n).padStart(3)} | 成功 ${String(r.ok).padStart(2)}/${String(per).padEnd(2)}` +
    ` | 出题 ${String(r.msAvg).padStart(5)}ms(峰值${String(r.msMax).padStart(5)})` +
    ` | 面积 ${String(r.areaMin).padStart(2)}..${String(r.areaMax).padStart(2)}` +
    ` | 档位1-5 ${r.tiers.slice(1).join('/')}` +
    ` | 试推 ${String(r.probes).padStart(4)}步` +
    ` | 猜 ${String(r.guessAvg).padStart(4)}` +
    ` | 均分 ${String(r.score).padStart(3)}`
  );
}

const payload = { generatedAt: new Date().toISOString(), big, per, sizes: [sLo, sHi], rows, boards };
fs.writeFileSync(path.join(root, outFile), JSON.stringify(payload, null, 1));

const csv = ['n,ok,fail,msAvg,msMax,areaMin,areaMax,areaCV,singleRegions,t1,t2,t3,t4,t5,guessAvg,guessMax,probes,l3Elim,nodes,score,scoreMax'];
for (const r of rows) {
  csv.push([r.n, r.ok, r.fail, r.msAvg, r.msMax, r.areaMin, r.areaMax, r.cv, r.single,
    ...r.tiers.slice(1), r.guessAvg, r.guessMax, r.probes, r.l3Elim, r.nodes, r.score, r.scoreMax].join(','));
}
fs.writeFileSync(path.join(root, outFile.replace(/\.json$/, '.csv')), csv.join('\n') + '\n');
console.log('\n写出 ' + outFile);
