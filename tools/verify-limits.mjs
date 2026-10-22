/* ============================================================================
 * 理论验证 2：超过 16×16 之后会发生什么（只读 + 临时副本，不改游戏文件）
 *
 *   node tools/verify-limits.mjs
 * ========================================================================== */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countSolutions } from './refsolve.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const diff = require('../src/js/engine/difficulty.js');

function loadPatched(maxSize, extra = []) {
  let src = fs.readFileSync(path.join(root, 'src/js/engine/engine.js'), 'utf8');
  src = src.replace('Math.min(16,', 'Math.min(' + maxSize + ',');
  for (const [a, b] of extra) {
    if (!src.includes(a)) throw new Error('补丁未命中: ' + a);
    src = src.replace(a, b);
  }
  const tmp = path.join(here, '.tmp-limits.cjs');
  fs.writeFileSync(tmp, src);
  return require(tmp);
}

const engine = loadPatched(64);
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

/* ---------------------------------------------------- ① 生成耗时与面积畸变 */
console.log('\n=== ① 尺寸放大后的生成表现（每尺寸 2 个种子） ===');
console.log('   n | 出题耗时(ms) | 最大色块/均面积 | 最小色块 | 参考求解节点 | 唯一解');
const scale = [];
for (let n = 16; n <= 24; n++) {
  const times = [], ratio = [], mins = [], nodes = [];
  let ok = 0;
  for (let k = 0; k < 2; k++) {
    const t0 = performance.now();
    const b = engine.generate(n, (k * 7919 + n * 104729) >>> 0);
    const wall = performance.now() - t0;
    if (!b) continue;
    const r = countSolutions(n, b.regions, 2, 300000);
    ok += (r.count === 1 ? 1 : 0);
    times.push(Math.round(wall));
    ratio.push(b.maxArea / n);
    mins.push(b.minArea);
    nodes.push(r.nodes);
  }
  scale.push({ n, ms: med(times), ratio: +med(ratio).toFixed(2), min: med(mins), nodes: med(nodes) });
  console.log(`  ${String(n).padStart(2)} | ${String(med(times)).padStart(12)} | ${String(med(ratio).toFixed(2)).padStart(15)}` +
    ` | ${String(med(mins)).padStart(8)} | ${String(med(nodes)).padStart(12)} | ${ok}/2`);
}

// 拟合 t ≈ a·n^b（对数线性回归）
const pts = scale.filter(s => s.ms > 0 && s.n >= 17);
if (pts.length > 3) {
  const xs = pts.map(p => Math.log(p.n)), ys = pts.map(p => Math.log(p.ms));
  const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const b = num / den;
  const a = Math.exp(my - b * mx);
  console.log(`\n  经验拟合：耗时 ≈ ${a.toFixed(4)} × n^${b.toFixed(2)}（n≥17 段）`);
  console.log(`  外推：n=20 ≈ ${Math.round(a * 20 ** b)}ms，n=24 ≈ ${Math.round(a * 24 ** b)}ms，n=28 ≈ ${Math.round(a * 28 ** b)}ms，n=32 ≈ ${Math.round(a * 32 ** b)}ms`);
}

/* --------------------------------------------------- ② 同色相邻（16 色上限）*/
console.log('\n=== ② 配色上限：REGION_COLORS 只有 16 种（palette.js 用 g % 18） ===');
for (const n of [16, 17, 18, 20]) {
  let collided = 0, boards = 0, cells = 0;
  for (let k = 0; k < 4; k++) {
    const b = engine.generate(n, (k * 31 + n * 977) >>> 0);
    if (!b) continue;
    boards++;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const g = b.regions[r * n + c];
        const right = c + 1 < n ? b.regions[r * n + c + 1] : -1;
        const down = r + 1 < n ? b.regions[(r + 1) * n + c] : -1;
        if (right >= 0 && right !== g && right % 16 === g % 16) { collided++; cells++; }
        if (down >= 0 && down !== g && down % 16 === g % 16) { collided++; cells++; }
      }
    }
  }
  const perBoard = (collided / Math.max(1, boards)).toFixed(1);
  console.log(`  n=${String(n).padStart(2)}  ${boards} 盘 · 平均每盘 ${perBoard} 处「相邻两色块同色」`);
}

/* ---------------------------------------------------------- ③ 屏幕与触控 */
console.log('\n=== ③ 布局/触控上限（cell = clamp(floor((availW-6)/n), 13, 78)） ===');
const viewports = [
  ['iPhone SE', 320], ['iPhone 13', 375], ['iPhone Pro Max', 430], ['iPad 竖屏', 768], ['桌面', 1200]
];
console.log('  设备          可用宽   n=16    n=20    n=24    n=28    溢出临界 n');
for (const [name, vw] of viewports) {
  const availW = vw - 18; // stage.clientWidth 约等于视口宽
  const cellOf = (n) => Math.max(13, Math.floor((availW - 6) / n));
  const overflowAt = Math.floor((availW - 6) / 13); // 13px 时的最大 n
  console.log(`  ${name.padEnd(12)} ${String(availW).padStart(6)}  ${String(cellOf(16)).padStart(6)}px` +
    `  ${String(cellOf(20)).padStart(6)}px  ${String(cellOf(24)).padStart(6)}px  ${String(cellOf(28)).padStart(6)}px` +
    `    n>${overflowAt} 溢出`);
}
console.log('  注：格子最小 13px，远低于 44px 的可点按推荐值；n=20 起单格就小于 20px，误触率会明显上升。');
console.log('  DOM 规模（每格 1 个按钮 + 2 个 span）：');
for (const n of [16, 20, 24, 28]) console.log(`    n=${n} → ${n * n} 格 / 约 ${n * n * 4} 个节点`);

/* ------------------------------------------ ④ 求解预算与「唯一性可否证明」*/
console.log('\n=== ④ 唯一性证明的预算墙（NODE_BUDGET=120k / CALL_BUDGET=9000） ===');
console.log('  buildRegions 每落一格都要解一次盘，落子次数 ≈ n²-n：');
for (const n of [16, 20, 24, 28, 32]) {
  console.log(`    n=${String(n).padStart(2)} → ${String(n * n - n).padStart(4)} 次求解，若每次 10ms 则 ${(n * n - n) * 10}ms`);
}
