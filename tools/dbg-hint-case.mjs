/* 单个不一致局面的追踪：把 plan ② 里「被静默跳过」的推理一条条打出来
   用法：node tools/dbg-hint-case.mjs 6 786754 0
*/
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const engine = require(path.join(root, 'src/js/engine/engine.js'));
const Hint = require(path.join(root, 'src/js/engine/hint.js'));

const n = +process.argv[2], seed = +process.argv[3], s = +process.argv[4] || 0;

function mulberry(a0) {
  let a = a0 >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function computeAuto(n, regions, marks) {
  const total = n * n;
  const auto = new Uint8Array(total);
  const filled = new Uint8Array(n);
  for (let i = 0; i < total; i++) if (marks[i] === 2) filled[regions[i]] = 1;
  for (let i = 0; i < total; i++) if (marks[i] !== 2 && filled[regions[i]]) auto[i] = 1;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (marks[r * n + c] !== 2) continue;
    for (let k = 0; k < n; k++) { if (k !== c) auto[r * n + k] = 1; if (k !== r) auto[k * n + c] = 1; }
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < n && cc >= 0 && cc < n) auto[rr * n + cc] = 1;
    }
  }
  for (let i = 0; i < total; i++) if (marks[i] === 2) auto[i] = 0;
  return auto;
}

const b = engine.generate(n, seed);
const { regions, solution } = b;
const total = n * n;
const isSol = new Uint8Array(total);
for (let r = 0; r < n; r++) isSol[r * n + solution[r]] = 1;

const rnd = mulberry(s * 2654435761 + 13);
rnd();  // 与 fuzz 脚本一致：先抽 n
const marks = new Uint8Array(total);
const qCount = Math.floor(rnd() * n);
const order = [];
for (let r = 0; r < n; r++) order.push(r * n + solution[r]);
for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
for (let k = 0; k < qCount; k++) marks[order[k]] = 2;
const xCount = Math.floor(rnd() * total * 0.5);
for (let k = 0; k < xCount; k++) {
  const i = Math.floor(rnd() * total);
  if (marks[i]) continue;
  if (isSol[i] && rnd() > 0.3) continue;
  marks[i] = 1;
}
const autoOn = rnd() < 0.5;
const auto = autoOn ? computeAuto(n, regions, marks) : new Uint8Array(total);

const sym = (i) => {
  if (marks[i] === 2) return 'Q';
  if (marks[i] === 1) return 'x';
  if (autoOn && auto[i]) return '·';
  return '.';
};
console.log(`n=${n} seed=${seed} auto=${autoOn}`);
for (let r = 0; r < n; r++) {
  let line = '';
  for (let c = 0; c < n; c++) line += sym(r * n + c).padEnd(2);
  console.log(String(r + 1).padStart(2), line);
}
console.log('solution cols:', Array.from(solution).map((c) => c + 1).join(','));

// 复刻 plan 的 ② 循环，把每一步都打出来
const ctx = Hint.ctxOf(n, regions);
const st = Hint.newState(ctx);
for (let i = 0; i < total; i++) if (marks[i] === 2 && isSol[i]) Hint.place(st, ctx, i);
const isDone = (i) => marks[i] !== 0 || (autoOn && !!auto[i]);
const work = Hint.newState(ctx);
work.alive.set(st.alive); work.cnt = st.cnt;
work.rowDone.set(st.rowDone); work.colDone.set(st.colDone);
work.regDone.set(st.regDone); work.queens.set(st.queens);

for (let guard = 0; guard < 200; guard++) {
  const hit = Hint.findHit(work, ctx, 3);
  if (!hit || hit.dead) { console.log('no more hit, dead=', hit && hit.dead); break; }
  const actionable = hit.kind === 'place' ? !isDone(hit.cell) : hit.kills.some((x) => !isDone(x));
  console.log(`hit ${hit.rule} kind=${hit.kind}`, hit.cell != null ? `cell=${hit.cell}(${sym(hit.cell)})` : '',
    hit.kills ? `kills=[${hit.kills.map((x) => x + sym(x)).join(' ')}]` : '', actionable ? '→ 采用' : '→ 跳过(静默)');
  if (actionable) break;
  // 复刻 applyHit（hint.js 未导出）
  if (hit.kind === 'place') Hint.place(work, ctx, hit.cell);
  else for (const c of hit.kills) work.alive[c] = 0;
  if (work.cnt === n) break;
}
