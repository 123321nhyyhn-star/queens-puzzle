/* ============================================================================
 * 理论验证 3：调难度的「旋钮」到底有没有用（全部在临时副本里试，不改 engine.js）
 *
 *   node tools/verify-knobs.mjs
 *
 *   变体：
 *     基线       —— 现引擎参数（面积上限 2.4n，再均衡预算 40 次）
 *     A 收紧面积 —— maxAllowed 2.4n → 1.6n（更早拒绝巨块棋盘）
 *     B A + 强再均衡 —— 再均衡目标 2.1n → 1.5n，预算 40 → 300
 *     C 只挑不造 —— 同一尺寸生成 10 盘，按分数取最难 / 最易（不改引擎）
 * ========================================================================== */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const diff = require('../src/js/engine/difficulty.js');

function loadVariant(id, patches) {
  let src = fs.readFileSync(path.join(root, 'src/js/engine/engine.js'), 'utf8');
  src = src.replace('Math.min(16,', 'Math.min(16,');
  for (const [a, b] of patches) {
    if (!src.includes(a)) throw new Error(`[${id}] 补丁未命中: ${a}`);
    src = src.replace(a, b);
  }
  const tmp = path.join(here, '.tmp-knob-' + id + '.cjs');
  fs.writeFileSync(tmp, src);
  return require(tmp);
}

const VARIANTS = {
  '基线': [],
  'A 面积≤1.6n': [['var maxAllowed = Math.max(6, Math.round(n * 2.4));',
    'var maxAllowed = Math.max(6, Math.round(n * 1.6));']],
  'B A+强再均衡': [
    ['var maxAllowed = Math.max(6, Math.round(n * 2.4));',
      'var maxAllowed = Math.max(6, Math.round(n * 1.6));'],
    ['var targetMax = Math.max(4, Math.ceil(n * 2.1));',
      'var targetMax = Math.max(4, Math.ceil(n * 1.5));'],
    ['rebalance(n, region, queens, solve, rnd, 40);',
      'rebalance(n, region, queens, solve, rnd, 300);']
  ]
};

const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const SIZES = [10, 14];
const PER = 8;

function measure(engine, n, seeds) {
  const out = { scores: [], maxArea: [], cv: [], probes: [], l3: [], tiers: [0, 0, 0, 0, 0, 0], ms: [], fail: 0 };
  for (const seed of seeds) {
    const t0 = performance.now();
    const b = engine.generate(n, seed);
    out.ms.push(performance.now() - t0);
    if (!b) { out.fail++; continue; }
    const m = diff.analyze(n, b.regions, b.solution);
    const rt = diff.score(m);
    out.scores.push(rt.score);
    out.maxArea.push(b.maxArea / n);
    out.cv.push(m.areaCV);
    out.probes.push(m.probes);
    out.l3.push(m.l3Elim);
    out.tiers[rt.tier]++;
  }
  return out;
}

console.log('\n=== 难度旋钮对比（同尺寸、同种子） ===');
for (const n of SIZES) {
  const seeds = Array.from({ length: PER }, (_, k) => (k * 7919 + n * 104729 + 4242) >>> 0);
  console.log(`\n  ── n = ${n} ──`);
  console.log('  变体            均分   分差区间   最大色块/均面积  面积CV  试推步数  计数排除  平均耗时   档位1-5');
  for (const [name, patches] of Object.entries(VARIANTS)) {
    const eng = loadVariant(Object.keys(VARIANTS).indexOf(name), patches);
    const r = measure(eng, n, seeds);
    const s = [...r.scores].sort((a, b) => a - b);
    console.log(`  ${name.padEnd(14)} ${String(Math.round(avg(r.scores))).padStart(4)}` +
      `   ${String(s[0] ?? 0).padStart(3)}–${String(s[s.length - 1] ?? 0).padEnd(3)}` +
      `   ${avg(r.maxArea).toFixed(2).padStart(13)}   ${avg(r.cv).toFixed(2).padStart(6)}` +
      `  ${String(Math.round(avg(r.probes))).padStart(7)}  ${String(Math.round(avg(r.l3))).padStart(7)}` +
      `  ${String(Math.round(avg(r.ms))).padStart(6)}ms  ${r.tiers.slice(1).join('/')}`);
  }

  // C：只挑不造
  const eng = loadVariant(99, []);
  const pool = [];
  for (const seed of seeds) {
    const b = eng.generate(n, seed);
    if (!b) continue;
    const m = diff.analyze(n, b.regions, b.solution);
    pool.push({ seed, score: diff.score(m).score, maxArea: b.maxArea, m });
  }
  pool.sort((a, b) => a.score - b.score);
  const lo = pool[0], hi = pool[pool.length - 1];
  console.log(`  ${'C 挑最难'.padEnd(14)} ${String(hi.score).padStart(4)}   (从 ${pool.length} 盘里挑最高分，最大色块/均面积 ${(hi.maxArea / n).toFixed(2)}，试推 ${hi.m.probes} 步)`);
  console.log(`  ${'C 挑最易'.padEnd(14)} ${String(lo.score).padStart(4)}   (同一批里最低分，最大色块/均面积 ${(lo.maxArea / n).toFixed(2)}，试推 ${lo.m.probes} 步)`);
  const mean = avg(pool.map(p => p.score));
  const sd = Math.sqrt(avg(pool.map(p => (p.score - mean) ** 2)));
  console.log(`  ${'（同批分布）'.padEnd(14)} ${mean.toFixed(1).padStart(4)}  ±${sd.toFixed(1)}   可挑选区间 ${hi.score - lo.score} 分`);
}

console.log('');
