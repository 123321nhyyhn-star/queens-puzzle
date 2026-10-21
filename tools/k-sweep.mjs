/* 推理上限实验：把集合计数的 k 上限一路抬到 n，看纯逻辑最多能推到哪
 * node tools/k-sweep.mjs [每尺寸盘数]
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = require('../engine.js');
const diff = require('../difficulty.js');

const per = Math.max(1, Number(process.argv[2]) || 8);
const sizes = [6, 8, 10, 12, 14, 16];

console.log('\n  k 上限对「纯逻辑能否解完」的影响（每格 = 该尺寸可解盘数/总盘数）\n');
const head = ['n', 'k=1', 'k=2', 'k=3', 'k=4', 'k=6', 'k=n'];
console.log('  ' + head.map(h => h.padStart(8)).join(''));

for (const n of sizes) {
  const boards = [];
  for (let k = 0; k < per; k++) {
    const b = engine.generate(n, (k * 7919 + n * 104729 + 987654321) >>> 0);
    if (b) boards.push(b);
  }
  const ks = [1, 2, 3, 4, 6, n];
  const cells = ks.map(kk => {
    let solved = 0;
    for (const b of boards) {
      const ctx = diff.makeCtx(n, b.regions);
      const p = diff.propagate(diff.initState(ctx), ctx, kk);
      if (p.ok && p.solved) solved++;
    }
    return solved + '/' + boards.length;
  });
  console.log('  ' + String(n).padStart(8) + cells.map(c => c.padStart(8)).join(''));
}
console.log('');
