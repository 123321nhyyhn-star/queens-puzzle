/* ============================================================================
 * palette.js
 * 色块配色：18 色淡彩池 + 按邻接图做 Lab 色差分配（同一盘配色永远一致）。
 * ========================================================================== */

/* 色块底色池：18 个淡彩色，**任意两色**的 ΔE 都 ≥ 13（最远点采样 + 色差下限
 * 硬过滤挑出来的，见 tools/gen-palette.mjs）。棋盘最多 16 块，用不满所有颜色；
 * 具体哪块用哪个由 assignRegionColors() 现场分配，保证相邻两块拉得最开。 */
export var REGION_COLORS = [
  '#EDC5C5', '#FAB6A5', '#F9C494', '#E4D1AA', '#EAEAA4', '#E0F4CF',
  '#B2E4AA', '#94F9DE', '#AAE4D5', '#94F3F9', '#CFF1F4', '#9FDAEF',
  '#94CAF9', '#B9C2F8', '#E1DAFB', '#DFB9F8', '#F7CDF7', '#FBB6D6'
];

/* ---- 配色：Lab 距离 + 贪心分配 ----
 * 淡彩色块单看都差不多，真正决定「分不分得清」的是相邻两块差多少。
 * 所以不做「第 g 块取第 g 个色」的轮转，而是按邻接图现场分配。 */
function srgbToLab(hex) {
  function lin(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function f(t) { return t > 0.008856 ? Math.pow(t, 1 / 3) : 7.787 * t + 16 / 116; }
  var r = lin(parseInt(hex.substr(1, 2), 16) / 255);
  var g = lin(parseInt(hex.substr(3, 2), 16) / 255);
  var b = lin(parseInt(hex.substr(5, 2), 16) / 255);
  var x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
  var y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
  var z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

var PALETTE_LAB = REGION_COLORS.map(srgbToLab);

function labDist(a, b) {
  var d0 = a[0] - b[0], d1 = a[1] - b[1], d2 = a[2] - b[2];
  return Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2);
}

/* 给 n 个色块挑底色：
 *  1. 先算出色块之间的邻接图（上下左右相邻且不同块）
 *  2. 邻居多的先着色（约束最大的先挑，后面才有得选）
 *  3. 每块在色池里挑一个还没用过的，让「离它最近的已着色邻居」尽量远；
 *     并列时用「到全场已用色的最近距离」再比一次，让整盘的颜色也散开
 * 全程无随机：刷新、续玩、分享回来的同一盘，配色都一样。 */
export function assignRegionColors(n, regions) {
  var out = [], g, i;
  if (!n || !regions || regions.length < n * n) {
    for (g = 0; g < (n || 0); g++) out.push(REGION_COLORS[g % REGION_COLORS.length]);
    return out;
  }

  var adj = [], deg = [];
  for (g = 0; g < n; g++) { adj.push({}); deg.push(0); }
  for (var r = 0; r < n; r++) {
    for (var c = 0; c < n; c++) {
      i = r * n + c;
      var a = regions[i], b;
      if (c + 1 < n) {
        b = regions[i + 1];
        if (a !== b && !adj[a][b]) { adj[a][b] = 1; adj[b][a] = 1; deg[a]++; deg[b]++; }
      }
      if (r + 1 < n) {
        b = regions[i + n];
        if (a !== b && !adj[a][b]) { adj[a][b] = 1; adj[b][a] = 1; deg[a]++; deg[b]++; }
      }
    }
  }

  var order = [];
  for (g = 0; g < n; g++) order.push(g);
  order.sort(function (p, q) { return deg[q] - deg[p] || p - q; });

  // 全盘两色的最小色差下限：优先只用「跟已用色都差这么远」的颜色，
  // 实在挑不出来（棋盘很大时）再放开 —— 这样色卡横排看着也不会有两块糊在一起。
  var FLOOR = 13.5;

  var pick = new Array(n), used = [];
  for (var o = 0; o < order.length; o++) {
    var gr = order[o], best = -1, bestNear = -1, bestFar = -1;
    for (var pass = 0; pass < 2 && best < 0; pass++) {
      for (var k = 0; k < REGION_COLORS.length; k++) {
        if (used[k]) continue;
        var lab = PALETTE_LAB[k];
        var near = Infinity, far = Infinity, hasColored = false;
        for (var nb in adj[gr]) {
          if (!adj[gr].hasOwnProperty(nb)) continue;
          var pk = pick[+nb];
          if (pk === undefined) continue;
          hasColored = true;
          var d = labDist(lab, PALETTE_LAB[pk]);
          if (d < near) near = d;
        }
        if (!hasColored) near = 1e6;   // 邻居都还没上色：交给 far 决定，尽量铺开
        for (var u = 0; u < REGION_COLORS.length; u++) {
          if (!used[u]) continue;
          var du = labDist(lab, PALETTE_LAB[u]);
          if (du < far) far = du;
        }
        if (!isFinite(far)) far = 1e6;
        if (pass === 0 && far < FLOOR) continue;
        if (near > bestNear + 1e-9 ||
            (Math.abs(near - bestNear) <= 1e-9 && far > bestFar + 1e-9)) {
          best = k; bestNear = near; bestFar = far;
        }
      }
    }
    if (best < 0) {
      // 色池真用完了（理论上 n ≤ 16 < 18 不会发生），退回到按序取
      for (var k2 = 0; k2 < REGION_COLORS.length; k2++) {
        if (!used[k2]) { best = k2; break; }
      }
      if (best < 0) best = 0;
    }
    pick[gr] = best;
    used[best] = true;
  }

  for (g = 0; g < n; g++) {
    var idx = pick[g] === undefined ? g % REGION_COLORS.length : pick[g];
    out.push(REGION_COLORS[idx]);
  }
  return out;
}

/* 「这块的图案色」：同一个颜色按比例压暗一档（三个通道乘同一个系数）。
   不走掺墨：掺墨会把色相往暖里拽，一块淡青的图案泛灰；乘系数只是「这块自己深了」，
   色相不动，远看还是那一块颜色——色块上的图形才不会像贴上去的另一块。

   k 是压暗多少（0–1）。0.045 左右是「看得见但不抢戏」；k = 0 就是原色（没有图案）。 */
export function shadeOf(hex, k) {
  var f = 1 - (isFinite(k) ? Math.max(0, Math.min(.9, k)) : .05);
  var r = Math.round(parseInt(hex.substr(1, 2), 16) * f);
  var g = Math.round(parseInt(hex.substr(3, 2), 16) * f);
  var b = Math.round(parseInt(hex.substr(5, 2), 16) * f);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

/* 「提亮」版的图案色：同一个颜色朝纸白里混，像色块上浮着一层薄云。
   天空那套用它——把图形做得比底色**浅**，比压暗更像天空，也不跟墨色棋子撞。
   k 是混进去多少白（0–1），0.2 上下才有得看：淡彩本来就很浅，掺少了直接糊在一起。 */
export function tintOf(hex, k) {
  var f = isFinite(k) ? Math.max(0, Math.min(.9, k)) : .2;
  function up(c) { return Math.round(c + (255 - c) * f); }
  var r = up(parseInt(hex.substr(1, 2), 16));
  var g = up(parseInt(hex.substr(3, 2), 16));
  var b = up(parseInt(hex.substr(5, 2), 16));
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

/* 「这一格亮起来」用的光色：拿色块底色换个更饱和、略深一点的同色相版本。
   用同一块的颜色去发光，看起来才像它自己亮了一下，而不是糊上去一块别的颜色。 */
export function glowOf(hex) {
  var r = parseInt(hex.substr(1, 2), 16) / 255;
  var g = parseInt(hex.substr(3, 2), 16) / 255;
  var b = parseInt(hex.substr(5, 2), 16) / 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    var d = max - min;
    s = l > .5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  s = Math.min(.88, s * 1.18 + .14);        // 抬饱和度：淡彩才「亮」得起来
  l = Math.min(.72, Math.max(.5, l - .14)); // 压一点明度：光才有实体感

  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  var q = l < .5 ? l * (1 + s) : l + s - l * s;
  var p2 = 2 * l - q;
  var rgb = [hue2rgb(p2, q, h + 1 / 3), hue2rgb(p2, q, h), hue2rgb(p2, q, h - 1 / 3)]
    .map(function (v) { return Math.round(Math.max(0, Math.min(1, v)) * 255); });
  return 'rgba(' + rgb.join(',') + ',1)';
}
