/* ============================================================================
 * 规则差实验：difficulty.propagate 卡住（要试推）的那个局面，
 * 换成 hint.findHit 的规则集（多了 L3 数线 / 双向计数）还能不能纯逻辑继续？
 * ========================================================================== */
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
const [sLo, sHi] = (args.get('sizes') || '10-13').split('-').map(Number);
const per = Number(args.get('per') || 4);

let boards = 0, stalls = 0, rescue = 0;
const rescuedRules = {};
for (let n = sLo; n <= sHi; n++) {
  for (let k = 0; k < per; k++) {
    const seed = (k * 2654435761 + n * 40503 + 1234567) >>> 0;
    let board;
    try { board = engine.generate(n, seed); } catch (e) { continue; }
    if (!board) continue;
    boards++;

    const ctx = diff.makeCtx(n, board.regions);
    const hctx = hint.ctxOf(n, board.regions);
    const st = diff.initState(ctx);

    // 复刻 explain 的「纯逻辑 + 试推」循环，但在每次 propagate 卡住时问一下 hint
    const cap = 1200;
    let probes = 0;
    for (let guard = 0; guard < 400; guard++) {
      const p = diff.propagate(st, ctx, 3);
      if (!p.ok || p.solved) break;
      stalls++;
      // 同一局面上，hint 的规则集还有没有招
      const hit = hint.findHit(st, hctx, 3);
      if (hit && !hit.dead) {
        rescue++;
        const key = hit.rule;
        rescuedRules[key] = (rescuedRules[key] || 0) + 1;
      }
      // 继续按 difficulty 的方式试推（只为推进局面）
      let elim = false;
      for (let g = 0; g < n && !elim; g++) {
        if (st.regDone[g]) continue;
        const live = [];
        for (const c of ctx.regCells[g]) if (st.alive[c]) live.push(c);
        if (live.length < 2) continue;
        for (const cell of live) {
          if (probes >= cap) break;
          const st2 = diff.initState(ctx);
          st2.alive = st.alive.slice(); st2.cnt = st.cnt;
          st2.rowDone = st.rowDone.slice(); st2.colDone = st.colDone.slice();
          st2.regDone = st.regDone.slice(); st2.queens = st.queens.slice();
          diff.propagate === diff.propagate && null;
          // 借 hint.place 放子（两者语义一致）
          hint.place(st2, hctx, cell);
          probes++;
          const p2 = diff.propagate(st2, ctx, 3);
          if (!p2.ok) { st.alive[cell] = 0; elim = true; }
        }
      }
      if (!elim) break;
    }
  }
}
console.log(`样本 ${boards} 盘；propagate 卡住 ${stalls} 次；其中 hint 规则集仍能纯逻辑推进 ${rescue} 次（${((rescue / stalls) * 100).toFixed(1)}%）`);
console.log('救回来的规则分布', rescuedRules);
