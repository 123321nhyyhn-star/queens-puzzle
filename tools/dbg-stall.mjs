/* 诊断「提示走不下去（kind=none）」的局面：到底是 guess 候选被过滤掉了，还是试推预算用尽
   用法：node tools/dbg-stall.mjs 8 988492153
*/
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const engine = require(path.join(root, 'src/js/engine/engine.js'));
const Hint = require(path.join(root, 'src/js/engine/hint.js'));

const n = +process.argv[2], seed = +process.argv[3];
const b = engine.generate(n, seed);
const { regions, solution } = b;
const total = n * n;
const isSol = new Uint8Array(total);
for (let r = 0; r < n; r++) isSol[r * n + solution[r]] = 1;
const marks = new Uint8Array(total);

for (let step = 0; step < 200; step++) {
  const p = Hint.plan({ n, regions, solution, marks, maxK: 3, allowProbe: true });
  if (p.kind === 'done') { console.log('solved at step', step); break; }
  if (p.kind === 'guess') {
    const right = p.choices.filter((x) => isSol[x]);
    if (right.length !== 1) { console.log('bad guess', p.choices); break; }
    marks[right[0]] = 2;
    continue;
  }
  if (!p.action) {
    console.log('STALL at step', step, p.kind, p.rule, JSON.stringify(p.steps.map((s) => s.text)));
    // 统计候选单位（把玩家已划掉的也当候选 vs 过滤掉）
    const ctx = Hint.ctxOf(n, regions);
    const st = Hint.newState(ctx);
    for (let i = 0; i < total; i++) if (marks[i] === 2 && isSol[i]) Hint.place(st, ctx, i);
    const isDone = (i) => marks[i] !== 0;
    const rows = [];
    for (let r = 0; r < n; r++) {
      let live = 0, liveBoard = 0;
      for (let c = 0; c < n; c++) { if (st.alive[r * n + c]) { live++; if (!isDone(r * n + c)) liveBoard++; } }
      rows.push(live + '/' + liveBoard);
    }
    console.log('每行 引擎活格/盘面活格:', rows.join(' '));
    const regs = [];
    for (let g = 0; g < n; g++) {
      let live = 0, liveBoard = 0;
      for (let i = 0; i < total; i++) if (regions[i] === g && st.alive[i]) { live++; if (!isDone(i)) liveBoard++; }
      regs.push(live + '/' + liveBoard);
    }
    console.log('每块 引擎活格/盘面活格:', regs.join(' '));
    break;
  }
  const a = p.action;
  if (a.type === 'place') marks[a.cell] = 2;
  else if (a.type === 'cross') for (const c of a.cells) if (marks[c] === 0) marks[c] = 1;
  else if (a.type === 'unmark' || a.type === 'remove') marks[a.cell] = 0;
}
