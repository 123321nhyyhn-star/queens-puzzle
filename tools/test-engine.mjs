/* 出题引擎批量校验：node tools/test-engine.mjs [每尺寸盘数] */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const engine = require('../src/js/engine/engine.js');

const perSize = Math.max(1, Number(process.argv[2]) || 30);
const sizes = [];
for (let n = 4; n <= 16; n++) sizes.push(n);

let failed = 0;
const rows = [];

for (const n of sizes) {
  let ok = 0;
  let maxMs = 0;
  let sumMs = 0;
  let minArea = Infinity;
  let maxArea = 0;
  const failures = [];

  for (let k = 0; k < perSize; k++) {
    const seed = (k * 7919 + n * 104729 + 12345) >>> 0;
    const board = engine.generate(n, seed);
    if (!board) {
      failures.push('generate returned null (seed ' + seed + ')');
      continue;
    }
    const verdict = engine.validate(board);
    if (!verdict.ok) {
      failures.push('seed ' + seed + ': ' + verdict.reason);
      continue;
    }
    ok++;
    maxMs = Math.max(maxMs, board.ms);
    sumMs += board.ms;
    minArea = Math.min(minArea, board.minArea);
    maxArea = Math.max(maxArea, board.maxArea);
  }

  // 同种子可复现
  const a = engine.generate(n, 424242);
  const b = engine.generate(n, 424242);
  const same = a && b && a.regions.join(',') === b.regions.join(',') && a.solution.join(',') === b.solution.join(',');
  if (!same) failures.push('seed 424242 not reproducible');

  if (failures.length) failed += failures.length;
  rows.push({
    n,
    ok,
    total: perSize,
    avg: (sumMs / Math.max(1, ok)).toFixed(1),
    max: maxMs,
    area: minArea + '..' + maxArea,
    same,
    failures
  });
}

console.log('');
console.log('  尺寸   成功     平均耗时   最慢     色块面积范围   可复现');
console.log('  ' + '-'.repeat(62));
for (const r of rows) {
  const line = [
    String(r.n).padStart(4),
    (r.ok + '/' + r.total).padStart(7),
    (r.avg + 'ms').padStart(10),
    (r.max + 'ms').padStart(8),
    String(r.area).padStart(14),
    (r.same ? '是' : '否').padStart(6)
  ].join('  ');
  console.log('  ' + line);
  if (r.failures.length) {
    for (const f of r.failures.slice(0, 3)) console.log('      ! ' + f);
  }
}
console.log('');

const boards = rows.reduce((s, r) => s + r.ok, 0);
if (failed) {
  console.log('  FAILED: ' + failed + ' 项未通过');
  process.exit(1);
}
console.log('  ALL PASS · 共校验 ' + boards + ' 张唯一解棋盘');
console.log('');
