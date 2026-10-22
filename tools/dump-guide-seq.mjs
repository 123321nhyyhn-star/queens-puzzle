/* 逐局明细：面板记账 vs 提示路径的规则序列 */
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
const n = Number(args.get('n') || 14);
const k = Number(args.get('k') || 1);
const seed = (k * 7919 + n * 104729 + 987654321) >>> 0;
const board = engine.generate(n, seed);
const v = diff.vibe(n, board.regions, board.solution);
console.log('board', n, seed, 'level', v.level, v.score, 'steps', v.steps);

const marks = new Uint8Array(n * n);
const seq = [];
for (let guard = 0; guard < 3000; guard++) {
  const res = hint.plan({ n, regions: board.regions, solution: board.solution, marks, auto: null });
  if (!res || !res.steps.length || res.kind === 'done') break;
  if (res.kind === 'guess') { seq.push('G'); break; }
  seq.push(res.rule);
  const a = res.action;
  if (!a) break;
  if (a.type === 'place') marks[a.cell] = 2;
  else if (a.type === 'cross') for (const x of a.cells) if (marks[x] !== 2) marks[x] = 1;
  else if (a.type === 'remove' || a.type === 'unmark') marks[a.cell] = 0;
}
console.log('提示路径规则序列（' + seq.length + ' 步）:');
console.log(seq.join(' '));
const tally = {};
for (const s of seq) tally[s] = (tally[s] || 0) + 1;
console.log('分布', tally);
