/* 极难盘对照表：面板记账 vs 跟提示走一遍的真实过程（卡点 / 试推 / 试错） */
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
const [sLo, sHi] = (args.get('sizes') || '13-16').split('-').map(Number);
const per = Number(args.get('per') || 4);

function guide(n, regions, solution) {
  const marks = new Uint8Array(n * n);
  const seq = [];
  for (let guard = 0; guard < 4000; guard++) {
    const res = hint.plan({ n, regions, solution, marks, auto: null });
    if (!res || !res.steps.length || res.kind === 'done') break;
    if (res.kind === 'guess') { seq.push('G'); break; }
    seq.push(res.rule);
    const a = res.action;
    if (!a) break;
    if (a.type === 'place') marks[a.cell] = 2;
    else if (a.type === 'cross') for (const x of a.cells) if (marks[x] !== 2) marks[x] = 1;
    else if (a.type === 'remove' || a.type === 'unmark') marks[a.cell] = 0;
  }
  const tally = {};
  for (const s of seq) tally[s] = (tally[s] || 0) + 1;
  // 卡点 = 连续 P 的段数
  let stalls = 0, inRun = false;
  for (const s of seq) {
    if (s === 'P') { if (!inRun) stalls++; inRun = true; } else inRun = false;
  }
  return { seq, tally, stalls, guess: seq.includes('G') };
}

console.log('  n  难度分 | 面板：可定/块/计/试推/试错 | 提示：直读/数色块/数线 卡点 试推 是否要猜');
console.log('-'.repeat(92));
for (let n = sLo; n <= sHi; n++) {
  for (let k = 0; k < per; k++) {
    const seed = (k * 2654435761 + n * 40503 + 1234567) >>> 0;
    let b;
    try { b = engine.generate(n, seed); } catch (e) { continue; }
    if (!b) continue;
    const v = diff.vibe(n, b.regions, b.solution);
    if (v.level !== '极难') continue;
    const g = guide(n, b.regions, b.solution);
    const L1 = (g.tally.R1 || 0) + (g.tally.R2 || 0) + (g.tally.R3 || 0);
    const L2 = (g.tally.A1 || 0) + (g.tally.A2 || 0) + (g.tally.A3 || 0);
    const L3 = (g.tally.B1 || 0) + (g.tally.B2 || 0) + (g.tally.B3 || 0);
    console.log(
      ` ${String(n).padStart(2)} ${String(v.score.toFixed(1)).padStart(5)} | ` +
      `${String(v.steps.openSingles).padStart(3)}/${String(v.steps.block).padStart(2)}/${String(v.steps.count).padStart(2)}/` +
      `${String(v.steps.probe).padStart(3)}/${String(v.steps.guess).padStart(2)}   | ` +
      `${String(L1).padStart(3)}/${String(L2).padStart(4)}/${String(L3).padStart(4)}  ` +
      `${String(g.stalls).padStart(3)} ${String(g.tally.P || 0).padStart(4)} ${g.guess ? '要猜' : '不用猜'}`
    );
  }
}
