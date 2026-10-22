/* 生成 index.html 里那份色块底色池。
 *
 * 目标：一整套「淡彩」但**任意两色都不像**的色板（棋盘最多 16 个色块，色池至少 18 色）。
 * 做法：
 *   1. 在 HSL 里铺很密的候选（色相 4° 一档 × 5 档饱和 × 5 档明度）
 *   2. 过滤：太暗/太亮/太艳的不要，和页面底色 #FEF3E2、格子白 #FFFFFF 太像的也不要
 *      （否则这种色块看着像「没上色」）
 *   3. 用「最远点采样」把候选排成一条从最分散开始的序列
 *   4. 按 ΔE 下限（FLOOR）硬过滤：跟已收的每一色都差 FLOOR 以上才收
 * 用法：node tools/gen-palette.mjs   然后把它打印的数组贴回 index.html
 */
function hsl2rgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  const seg = Math.floor(h * 6);
  if (seg === 0) [r, g, b] = [c, x, 0];
  else if (seg === 1) [r, g, b] = [x, c, 0];
  else if (seg === 2) [r, g, b] = [0, c, x];
  else if (seg === 3) [r, g, b] = [0, x, c];
  else if (seg === 4) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function lab(rgb) {
  const lin = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const r = lin(rgb[0] / 255), g = lin(rgb[1] / 255), b = lin(rgb[2] / 255);
  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  let y = (r * 0.2126 + g * 0.7152 + b * 0.0722);
  let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const de = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const hex = rgb => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

const BG = lab([0xFE, 0xF3, 0xE2]);
const WHITE = lab([255, 255, 255]);
const FLOOR = 13;   // 任意两色的最小 ΔE

const cand = [];
for (let h = 0; h < 360; h += 4) {
  for (const s of [0.52, 0.62, 0.72, 0.82, 0.9]) {
    for (const l of [0.78, 0.815, 0.85, 0.885, 0.92]) {
      const rgb = hsl2rgb(h, s, l);
      const L = lab(rgb);
      if (L[0] < 79 || L[0] > 95) continue;                 // 淡彩：深色墨字压得住
      if (Math.hypot(L[1], L[2]) > 36) continue;            // 彩度别太高，和 UI 状态色分开
      if (de(L, BG) < 15 || de(L, WHITE) < 13) continue;    // 别和白底/页面底色撞
      cand.push({ h, s, l, hex: hex(rgb), lab: L });
    }
  }
}

// 最远点排序
const order = [];
const rest = cand.slice();
let cur = cand[0];
while (rest.length) {
  order.push(cur);
  const idx = rest.indexOf(cur);
  if (idx >= 0) rest.splice(idx, 1);
  let best = null, bd = -1;
  for (const c of rest) {
    let d = 1e9;
    for (const p of order) d = Math.min(d, de(p.lab, c.lab));
    if (d > bd) { bd = d; best = c; }
  }
  cur = best;
}

// 色差下限硬过滤
const keep = [];
for (const c of order) {
  if (keep.every(p => de(p.lab, c.lab) >= FLOOR)) keep.push(c);
}

let mn = 1e9, pair = null;
for (let i = 0; i < keep.length; i++) {
  for (let j = i + 1; j < keep.length; j++) {
    const d = de(keep[i].lab, keep[j].lab);
    if (d < mn) { mn = d; pair = [keep[i].hex, keep[j].hex]; }
  }
}
keep.sort((a, b) => a.h - b.h || a.l - b.l);
console.log(`// ${keep.length} 色，最小 ΔE = ${mn.toFixed(1)}（${pair.join(' / ')}）`);
console.log("var REGION_COLORS = [\n  " + keep.map(p => "'" + p.hex + "'").join(', ') + "\n];");
console.log('\n// 明细');
console.log('// ' + keep.map(p => `${p.hex}(h${p.h} L${p.lab[0].toFixed(0)})`).join(' '));
