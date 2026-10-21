/* ============================================================================
 * 提示引擎自测：让「引导」把它自己指出的动作一路执行下去，看能不能真的解完。
 * ----------------------------------------------------------------------------
 * 校验点：
 *   1. 每一步的 action 都和解一致（落子必在解上，划叉必不在解上）
 *   2. 默认（不加试推）能推多远；加上 L4 之后能不能 100% 解完
 *   3. 每次 plan 的耗时（点一下提示按钮的代价）
 * 用法：node tools/test-hint.mjs [--no-probe]
 * ========================================================================== */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const engine = require(path.join(root, 'engine.js'));
const Hint = require(path.join(root, 'hint.js'));

const noProbe = process.argv.indexOf('--no-probe') >= 0;
const sizes = [6, 8, 10, 12, 16];
const perSize = 10;

let bad = 0, totalSteps = 0, maxMs = 0, sumMs = 0, calls = 0, guesses = 0;
const byRule = {};
const stalls = [];

for (const n of sizes) {
  let solved = 0, stepsAll = 0, maxSteps = 0, gAll = 0;
  for (let k = 0; k < perSize; k++) {
    const seed = (k * 7919 + n * 104729 + 987654321) >>> 0;
    const b = engine.generate(n, seed);
    if (!b) continue;
    const regions = b.regions, solution = b.solution;
    const marks = new Uint8Array(n * n);
    const isSol = new Uint8Array(n * n);
    for (let r = 0; r < n; r++) isSol[r * n + solution[r]] = 1;

    let steps = 0, stuck = null, g0 = guesses;
    for (let guard = 0; guard < 600; guard++) {
      const t0 = process.hrtime.bigint();
      const p = Hint.plan({ n, regions, solution, marks, maxK: 3, allowProbe: !noProbe });
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      calls++; sumMs += ms; if (ms > maxMs) maxMs = ms;

      if (p.kind === 'done') { solved++; break; }
      if (p.kind === 'guess') {
        // 模拟玩家「这次猜对了」：在给出的候选里挑真皇后
        const right = p.choices.filter((x) => isSol[x]);
        if (right.length !== 1) { bad++; console.log(`!! 猜测候选里真解不是唯一 n=${n} seed=${seed}`); break; }
        guesses++;
        marks[right[0]] = 2;
        continue;
      }
      if (!p.action) { stuck = p.kind; break; }
      steps++;
      byRule[p.rule] = (byRule[p.rule] || 0) + 1;

      // --- 校验 + 执行
      if (p.action.type === 'place') {
        if (!isSol[p.action.cell]) { bad++; console.log(`!! 落子不在解上 n=${n} seed=${seed} cell=${p.action.cell}`); break; }
        if (marks[p.action.cell] === 2) { bad++; console.log(`!! 重复落子 n=${n} seed=${seed}`); break; }
        marks[p.action.cell] = 2;
      } else if (p.action.type === 'cross') {
        for (const c of p.action.cells) {
          if (isSol[c]) { bad++; console.log(`!! 划掉了真皇后 n=${n} seed=${seed} cell=${c}`); }
          if (marks[c] === 0) marks[c] = 1;
        }
      } else if (p.action.type === 'remove') {
        if (marks[p.action.cell] !== 2) { bad++; console.log(`!! remove 目标不是皇后 n=${n} seed=${seed}`); }
        marks[p.action.cell] = 0;
      } else if (p.action.type === 'unmark') {
        if (!isSol[p.action.cell]) { bad++; console.log(`!! unmark 目标不是解 n=${n} seed=${seed}`); }
        marks[p.action.cell] = 0;
      }
      if (bad) break;
    }
    if (bad) break;
    stepsAll += steps; gAll += guesses - g0;
    totalSteps += steps;
    if (steps > maxSteps) maxSteps = steps;
    if (!solved && stepsAll !== undefined && stuck) stalls.push({ n, seed, stuck, steps });
  }
  console.log(`n=${String(n).padStart(2)}  解完 ${solved}/${perSize}  平均引导步数 ${(stepsAll / perSize).toFixed(1)}  平均猜测 ${(gAll / perSize).toFixed(1)}  单盘最多 ${maxSteps} 步`);
  if (bad) break;
}

console.log('\n动作错误：', bad);
console.log('plan 调用：', calls, ' 平均耗时', (sumMs / calls).toFixed(2), 'ms  最慢', maxMs.toFixed(1), 'ms');
console.log('规则命中分布：', Object.entries(byRule).sort().map(([k, v]) => k + ':' + v).join('  '));
if (stalls.length) console.log('卡住：', JSON.stringify(stalls.slice(0, 5)));
