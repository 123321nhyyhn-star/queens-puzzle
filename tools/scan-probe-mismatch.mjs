/* 随机种子大范围扫描：找出「面板说有试推、但跟着提示走完全程没用过试推」的盘 */
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
const per = Number(args.get('per') || 10);

function playByHint(n, regions, solution) {
  const marks = new Uint8Array(n * n);
  const c = { l1: 0, l2: 0, l3: 0, p: 0, g: 0 };
  for (let guard = 0; guard < 4000; guard++) {
    const res = hint.plan({ n, regions, solution, marks, auto: null });
    if (!res || !res.steps.length || res.kind === 'done') break;
    if (res.kind === 'guess') { c.g++; break; }
    if (res.level === 1) c.l1++;
    else if (res.level === 2) c.l2++;
    else if (res.level === 3) c.l3++;
    else if (res.level === 4) c.p++;
    const a = res.action;
    if (!a) break;
    if (a.type === 'place') marks[a.cell] = 2;
    else if (a.type === 'cross') for (const x of a.cells) if (marks[x] !== 2) marks[x] = 1;
    else if (a.type === 'remove' || a.type === 'unmark') marks[a.cell] = 0;
  }
  let q = 0;
  for (let r = 0; r < n; r++) if (marks[r * n + solution[r]] === 2) q++;
  return { ...c, solved: q === n };
}

const bad = [];
let total = 0, extTotal = 0, extBad = 0;
const ratios = [];
for (let n = sLo; n <= sHi; n++) {
  for (let k = 0; k < per; k++) {
    const seed = (k * 2654435761 + n * 40503 + 1234567) >>> 0;
    let board;
    try { board = engine.generate(n, seed); } catch (e) { continue; }
    if (!board) continue;
    total++;
    const v = diff.vibe(n, board.regions, board.solution);
    const hp = playByHint(n, board.regions, board.solution);
    const panelProbe = v.steps.probe;
    if (v.level === '极难') extTotal++;
    if (panelProbe > 0 && hp.p === 0 && hp.solved && hp.g === 0) {
      bad.push({ n, seed, level: v.level, score: v.score, panelProbe, panelGuess: v.steps.guess, hp });
      if (v.level === '极难') extBad++;
    }
    if (panelProbe > 0) ratios.push(hp.p / panelProbe);
  }
}
console.log(`样本 ${total} 盘（极难 ${extTotal}）`);
console.log(`面板有试推、提示全程 0 试推 0 猜测：${bad.length} 盘（${((bad.length / total) * 100).toFixed(1)}%）`);
for (const b of bad.slice(0, 30)) console.log('  ', JSON.stringify(b));
const sorted = [...ratios].sort((a, b) => a - b);
const q = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))].toFixed(2) : '-';
console.log(`提示试推/面板试推 比值分位：p10 ${q(0.1)}  p50 ${q(0.5)}  p90 ${q(0.9)}`);
