/* 单盘排查：打印棋盘、检查传播与搜索是否一致
 * node tools/inspect-board.mjs 8 12345
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = require('../engine.js');
const diff = require('../difficulty.js');

const n = Number(process.argv[2] || 8);
const seed = Number(process.argv[3] || 12345);
const board = engine.generate(n, seed);
if (!board) { console.log('生成失败'); process.exit(1); }

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
console.log(`\n${n}x${n} seed=${seed} 面积 ${board.minArea}..${board.maxArea}  出题 ${board.ms}ms\n`);
for (let r = 0; r < n; r++) {
  let line = '';
  for (let c = 0; c < n; c++) {
    const g = board.regions[r * n + c];
    const isQ = board.solution[r] === c;
    line += (isQ ? '[' + LETTERS[g] + ']' : ' ' + LETTERS[g] + ' ');
  }
  console.log('  ' + line);
}
console.log('\n  行内 [X] 标记解的位置；面积分布: ' + board.areas.join(','));

const ctx = diff.makeCtx(n, board.regions);
const sr = diff.searchSolve(ctx, 2, { limit: 2, collect: true });
console.log('\n  CP 搜索解数 =', sr.stat.solutions, ' 猜测深度 =', sr.stat.successDepth,
  ' 分支 =', sr.stat.branches, ' 回溯失败 =', sr.stat.fails, ' 节点 =', sr.stat.nodes);
if (sr.solutions.length) {
  const s = sr.solutions[0];
  const same = s.every((v, i) => v === board.solution[i]);
  console.log('  与引擎解一致 =', same, s.join(','), ' vs ', Array.from(board.solution).join(','));
}

const m = diff.analyze(n, board.regions, board.solution);
console.log('\n  指标:');
for (const [k, v] of Object.entries(m)) console.log('    ' + k.padEnd(16), v);
const rt = diff.score(m);
console.log('\n  评分:', rt.score, rt.label, JSON.stringify(rt.parts));

// 逐步传播：看 L1 / L2 各能推到第几只
for (const lvl of [1, 2]) {
  const ctx2 = diff.makeCtx(n, board.regions);
  const st = diff.initState(ctx2);
  const p = diff.propagate(st, ctx2, lvl);
  console.log(`\n  L${lvl}: ok=${p.ok} 放子=${st.cnt}/${n} 步骤=${p.steps} 轮=${p.rounds} solved=${p.solved}`);
}
