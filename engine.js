/* ============================================================================
 * 皇后 Queens · 出题引擎
 * ----------------------------------------------------------------------------
 * 规则（与 expert-queens / LinkedIn Queens 一致）：
 *   · n×n 棋盘切成 n 个连通色块
 *   · 每行、每列、每个色块恰好一个皇后
 *   · 皇后之间不能八向相邻（含斜角相邻）；远距离对角线合法
 *   · 每张棋盘保证唯一解
 *
 * 出题思路：
 *   1. 随机回溯生成一组合法皇后布局（每行一个，列不重复且相邻行不同列相邻）
 *   2. 每只皇后作为自己色块的种子，逐格给"前沿格"染色
 *      每次染色后立即求解验证，必须仍只有 1 个解，否则回溯换色
 *   3. 选格用 MRV（可选颜色最少的格子），颜色按 spindly 分数排序，
 *      让色块长成细长锯齿状（更少对称解、也更好看）
 *   4. 生成后做一次"区域再均衡"，把过大色块的边界格移给较小邻居，
 *      每次都保持连通且唯一解
 *
 * 该文件同时支持浏览器（window.QueensEngine）与 Node（require）使用。
 * ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QueensEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var NODE_BUDGET = 120000;      // 单次求解节点上限
  var CALL_BUDGET = 9000;        // 单次出题允许的求解调用次数
  var MAX_ATTEMPTS = 3;          // 换种子重试次数（取面积最均衡的一张）

  /* ------------------------------------------------------------------ 随机数 */
  function makeRng(seed) {
    var a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* -------------------------------------------------------- 随机合法皇后布局 */
  function randomQueens(n, rnd) {
    var cols = new Array(n).fill(-1);
    var used = new Uint8Array(n);

    function dfs(r) {
      if (r === n) return true;
      var order = [];
      for (var i = 0; i < n; i++) order.push(i);
      shuffle(order, rnd);
      for (var k = 0; k < n; k++) {
        var c = order[k];
        if (used[c]) continue;
        // 相邻行不同列相邻 == 皇后不八向相邻（同列已被 used 排除）
        if (r > 0 && Math.abs(cols[r - 1] - c) <= 1) continue;
        cols[r] = c;
        used[c] = 1;
        if (dfs(r + 1)) return true;
        used[c] = 0;
        cols[r] = -1;
      }
      return false;
    }

    return dfs(0) ? cols : null;
  }

  /* ------------------------------------------------------------------- 求解器
   * 以色块为变量，MRV 选择候选最少的色块；行/列位掩码 + 八邻接判定。
   * 最多数到 limit 个解就停；节点超限返回 aborted=true（调用方按失败处理）。
   */
  function makeSolver(n) {
    return function solve(region, limit, budget) {
      limit = limit || 2;
      budget = budget || NODE_BUDGET;

      var regCells = new Map();
      for (var i = 0; i < n * n; i++) {
        var g = region[i];
        if (g < 0) continue;
        var list = regCells.get(g);
        if (!list) { list = []; regCells.set(g, list); }
        list.push(i);
      }

      var regs = Array.from(regCells.keys());
      var count = 0, nodes = 0, aborted = false;
      var rowMask = 0, colMask = 0, regMask = 0;
      var pr = [], pc = [];

      function dfs(depth) {
        if (aborted || count >= limit) return;
        if (++nodes > budget) { aborted = true; return; }
        if (depth === n) { count++; return; }

        var bestG = -1, bestList = null;
        for (var k = 0; k < regs.length; k++) {
          var rg = regs[k];
          if (regMask & (1 << rg)) continue;
          var cells = regCells.get(rg);
          var cand = [];
          for (var q = 0; q < cells.length; q++) {
            var idx = cells[q], r = (idx / n) | 0, c = idx % n;
            if (rowMask & (1 << r)) continue;
            if (colMask & (1 << c)) continue;
            var bad = false;
            for (var z = 0; z < pr.length; z++) {
              if (Math.abs(pr[z] - r) <= 1 && Math.abs(pc[z] - c) <= 1) { bad = true; break; }
            }
            if (!bad) cand.push(idx);
          }
          if (!bestList || cand.length < bestList.length) {
            bestG = rg; bestList = cand;
            if (!cand.length) break;
          }
        }

        if (bestG < 0 || !bestList || !bestList.length) return;

        for (var m = 0; m < bestList.length; m++) {
          var id = bestList[m], rr = (id / n) | 0, cc = id % n;
          rowMask |= 1 << rr; colMask |= 1 << cc; regMask |= 1 << bestG;
          pr.push(rr); pc.push(cc);
          dfs(depth + 1);
          pr.pop(); pc.pop();
          rowMask &= ~(1 << rr); colMask &= ~(1 << cc); regMask &= ~(1 << bestG);
          if (aborted || count >= limit) return;
        }
      }

      if (regs.length === n) dfs(0);
      return { count: count, aborted: aborted, nodes: nodes };
    };
  }

  /* ------------------------------------------------------------ 逐格构造色块 */
  function buildRegions(n, queens, solve, rnd) {
    var N = n * n;
    var region = new Int8Array(N).fill(-1);
    var colorOrder = [];
    for (var i = 0; i < n; i++) colorOrder.push(i);
    shuffle(colorOrder, rnd);
    for (var r = 0; r < n; r++) region[r * n + queens[r]] = colorOrder[r];

    var areas = new Array(n).fill(0);
    for (var a = 0; a < n; a++) areas[colorOrder[a]] = 1;

    var remaining = N - n;
    var calls = 0;

    function adjacentColors(idx) {
      var row = (idx / n) | 0, col = idx % n;
      var set = [];
      for (var d = 0; d < 4; d++) {
        var nr = row + DIRS4[d][0], nc = col + DIRS4[d][1];
        if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
        var g = region[nr * n + nc];
        if (g >= 0 && set.indexOf(g) === -1) set.push(g);
      }
      return set;
    }

    function scoreOf(idx, g) {
      var row = (idx / n) | 0, col = idx % n;
      var same = 0, diff = 0;
      for (var d = 0; d < 4; d++) {
        var nr = row + DIRS4[d][0], nc = col + DIRS4[d][1];
        if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
        var gg = region[nr * n + nc];
        if (gg < 0) continue;
        if (gg === g) same++; else diff++;
      }
      return diff - 1.5 * same - 0.42 * areas[g] + rnd() * 0.8;
    }

    function pickCell() {
      var bestIdx = -1, bestColors = null, bestLen = 99;
      for (var idx = 0; idx < N; idx++) {
        if (region[idx] >= 0) continue;
        var colors = adjacentColors(idx);
        if (!colors.length) continue;
        if (colors.length < bestLen) {
          bestLen = colors.length;
          bestIdx = idx;
          bestColors = colors;
          if (bestLen === 1) break;
        }
      }
      return bestIdx < 0 ? null : { idx: bestIdx, colors: bestColors };
    }

    function step() {
      if (remaining === 0) return true;
      if (calls > CALL_BUDGET) return false;

      var pick = pickCell();
      if (!pick) return false;

      var opts = pick.colors.map(function (g) {
        return { g: g, s: scoreOf(pick.idx, g) };
      }).sort(function (a, b) { return b.s - a.s; });

      for (var k = 0; k < opts.length; k++) {
        var g = opts[k].g;
        region[pick.idx] = g;
        areas[g]++;
        remaining--;
        calls++;

        var res = solve(region, 2, NODE_BUDGET);
        var unique = !res.aborted && res.count === 1;

        if (unique && step()) return true;

        region[pick.idx] = -1;
        areas[g]--;
        remaining++;
      }
      return false;
    }

    return step() ? region : null;
  }

  /* -------------------------------------------------------------- 区域再均衡
   * 把过大色块的边界格移交给较小的邻居；每步都要求：
   *   · 移出方仍然连通、移入方连通（移入格与目标色块相邻，天然连通）
   *   · 不移动解皇后的格子
   *   · 全盘仍然唯一解
   */
  function rebalance(n, region, solution, solve, rnd, maxChecks) {
    var N = n * n;
    var areas = new Array(n).fill(0);
    var i;
    for (i = 0; i < N; i++) areas[region[i]]++;

    var isQueen = new Uint8Array(N);
    for (var r = 0; r < n; r++) isQueen[r * n + solution[r]] = 1;

    var targetMax = Math.max(4, Math.ceil(n * 2.1));
    var moves = 0;
    var checks = 0;
    var budget = maxChecks || 240;

    function connectedWithout(g, exclude) {
      var start = -1, total = 0;
      for (var j = 0; j < N; j++) {
        if (region[j] !== g || j === exclude) continue;
        total++;
        if (start < 0) start = j;
      }
      if (!start && start !== 0) return false;
      if (total === 0) return false;
      var seen = new Uint8Array(N);
      var stack = [start];
      seen[start] = 1;
      var cnt = 0;
      while (stack.length) {
        var idx = stack.pop();
        cnt++;
        var rr = (idx / n) | 0, cc = idx % n;
        for (var d = 0; d < 4; d++) {
          var nr = rr + DIRS4[d][0], nc = cc + DIRS4[d][1];
          if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
          var j2 = nr * n + nc;
          if (j2 === exclude || seen[j2] || region[j2] !== g) continue;
          seen[j2] = 1;
          stack.push(j2);
        }
      }
      return cnt === total;
    }

    function tryMove(idx, from, to) {
      if (isQueen[idx]) return false;
      if (areas[from] < 2) return false;
      if (checks >= budget) return false;
      if (!connectedWithout(from, idx)) return false;
      region[idx] = to;
      checks++;
      var res = solve(region, 2, 90000);
      if (!res.aborted && res.count === 1) {
        areas[from]--;
        areas[to]++;
        moves++;
        return true;
      }
      region[idx] = from;
      return false;
    }

    function boundaryMoves(from, wantTo) {
      var out = [];
      for (var k = 0; k < N; k++) {
        if (region[k] !== from || isQueen[k]) continue;
        var kr = (k / n) | 0, kc = k % n;
        for (var d = 0; d < 4; d++) {
          var nr = kr + DIRS4[d][0], nc = kc + DIRS4[d][1];
          if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
          var tg = region[nr * n + nc];
          if (tg === from) continue;
          if (wantTo !== undefined) {
            if (tg !== wantTo) continue;
          } else if (areas[tg] >= areas[from] - 1) {
            continue;
          }
          out.push({ i: k, to: tg, a: areas[tg] });
        }
      }
      shuffle(out, rnd);
      out.sort(function (a, b) { return a.a - b.a; });
      return out;
    }

    // 第一阶段：收缩过大的色块
    for (var iter = 0; iter < 120 && checks < budget; iter++) {
      var big = 0;
      for (var g = 1; g < n; g++) if (areas[g] > areas[big]) big = g;
      if (areas[big] <= targetMax) break;

      var cand = boundaryMoves(big);
      if (!cand.length) break;

      var moved = false;
      for (var m = 0; m < Math.min(cand.length, 28); m++) {
        if (tryMove(cand[m].i, big, cand[m].to)) { moved = true; break; }
      }
      if (!moved) break;
    }

    // 第二阶段：尽量把单格色块养大一点（失败不影响主目标）
    var singles = [];
    for (var s = 0; s < n; s++) if (areas[s] === 1) singles.push(s);
    shuffle(singles, rnd);
    for (var si = 0; si < singles.length && checks < budget; si++) {
      var small = singles[si];
      var bestFrom = -1, bestArea = 0;
      for (var j = 0; j < N; j++) {
        if (region[j] !== small) continue;
        var rr = (j / n) | 0, cc = j % n;
        for (var d2 = 0; d2 < 4; d2++) {
          var nr2 = rr + DIRS4[d2][0], nc2 = cc + DIRS4[d2][1];
          if (nr2 < 0 || nr2 >= n || nc2 < 0 || nc2 >= n) continue;
          var og = region[nr2 * n + nc2];
          if (og !== small && areas[og] > bestArea) { bestArea = areas[og]; bestFrom = og; }
        }
      }
      if (bestFrom < 0) continue;
      var opts = boundaryMoves(bestFrom, small);
      for (var q = 0; q < Math.min(opts.length, 10); q++) {
        if (tryMove(opts[q].i, bestFrom, small)) break;
      }
    }

    return { moves: moves, areas: areas, checks: checks };
  }

  function now() {
    return (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
  }

  /* ---------------------------------------------------------------- 单次尝试 */
  function tryGenerate(n, seed) {
    var rnd = makeRng(seed);
    var solve = makeSolver(n);
    var queens = randomQueens(n, rnd);
    if (!queens) return null;

    var region = buildRegions(n, queens, solve, rnd);
    if (!region) return null;

    var check = solve(region, 2, 500000);
    if (check.aborted || check.count !== 1) return null;

    // 生成阶段已经带面积感知，通常不需要再均衡；
    // 这里只做极小预算的兜底，避免大棋盘出现极端巨块。
    rebalance(n, region, queens, solve, rnd, 40);

    check = solve(region, 2, 700000);
    if (check.aborted || check.count !== 1) return null;

    var areas = new Array(n).fill(0);
    var maxArea = 0, minArea = n * n;
    for (var i = 0; i < n * n; i++) areas[region[i]]++;
    for (var g = 0; g < n; g++) {
      if (areas[g] > maxArea) maxArea = areas[g];
      if (areas[g] < minArea) minArea = areas[g];
    }

    return {
      regions: region,
      solution: Int8Array.from(queens),
      areas: areas,
      minArea: minArea,
      maxArea: maxArea
    };
  }

  /* ------------------------------------------------------------------- 对外 API */
  function generate(size, seed) {
    var n = Math.max(4, Math.min(16, Math.round(size || 8)));
    var base = (seed === undefined || seed === null)
      ? (Math.floor(Math.random() * 0xFFFFFFFF) >>> 0)
      : (seed >>> 0);

    var t0 = now();
    var best = null;
    // 面积上限：达到就收工；否则最多再抽几张，取最均衡的那张，避免大棋盘久等
    var maxAllowed = Math.max(6, Math.round(n * 2.4));
    // 大棋盘色块更容易长歪，多给两次机会（每次约 20–30ms，仍在遮罩可接受范围）
    var maxAttempts = n >= 12 ? 5 : 3;

    for (var attempt = 0; attempt < (best ? maxAttempts : 12); attempt++) {
      var s = (base + attempt * 0x9E3779B1) >>> 0;
      var out = tryGenerate(n, s);
      if (!out) continue;
      if (!best || out.maxArea < best.maxArea) {
        out.seed = s;
        best = out;
      }
      if (out.maxArea <= maxAllowed) break;
      // 抽满三轮后如果已经「够用」就不再磨时间，避免大棋盘久等
      if (attempt >= 2 && best.maxArea <= maxAllowed * 1.6) break;
    }

    if (!best) return null;
    return {
      size: n,
      seed: best.seed,
      regions: best.regions,
      solution: best.solution,
      areas: best.areas,
      minArea: best.minArea,
      maxArea: best.maxArea,
      ms: Math.round((now() - t0) * 10) / 10
    };
  }

  /* 校验（测试用）：返回 { ok, reason } */
  function validate(board) {
    var n = board.size;
    var region = board.regions;
    var sol = board.solution;
    var i, g;

    var areas = new Array(n).fill(0);
    for (i = 0; i < n * n; i++) {
      g = region[i];
      if (g < 0 || g >= n) return { ok: false, reason: 'bad region id' };
      areas[g]++;
    }
    if (areas.some(function (a) { return a < 1; })) return { ok: false, reason: 'empty region' };

    // 连通性
    for (g = 0; g < n; g++) {
      var start = -1, total = 0;
      for (i = 0; i < n * n; i++) if (region[i] === g) { total++; if (start < 0) start = i; }
      var seen = new Uint8Array(n * n);
      var stack = [start];
      seen[start] = 1;
      var cnt = 0;
      while (stack.length) {
        var idx = stack.pop(); cnt++;
        var r = (idx / n) | 0, c = idx % n;
        for (var d = 0; d < 4; d++) {
          var nr = r + DIRS4[d][0], nc = c + DIRS4[d][1];
          if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
          var j = nr * n + nc;
          if (seen[j] || region[j] !== g) continue;
          seen[j] = 1; stack.push(j);
        }
      }
      if (cnt !== total) return { ok: false, reason: 'disconnected region ' + g };
    }

    // 解合法性
    var usedG = new Array(n).fill(false);
    for (var r2 = 0; r2 < n; r2++) {
      var c2 = sol[r2];
      if (c2 < 0 || c2 >= n) return { ok: false, reason: 'bad solution column' };
      g = region[r2 * n + c2];
      if (usedG[g]) return { ok: false, reason: 'two queens in region' };
      usedG[g] = true;
    }
    for (var a = 0; a < n; a++) {
      for (var b = a + 1; b < n; b++) {
        if (sol[a] === sol[b]) return { ok: false, reason: 'same column' };
        if (Math.abs(sol[a] - sol[b]) <= 1 && Math.abs(a - b) <= 1) {
          return { ok: false, reason: 'adjacent queens' };
        }
      }
    }

    var res = makeSolver(n)(region, 2, 2000000);
    if (res.aborted) return { ok: false, reason: 'solver aborted' };
    if (res.count !== 1) return { ok: false, reason: 'solutions=' + res.count };

    return { ok: true, areas: areas };
  }

  return {
    version: '1.0.0',
    generate: generate,
    validate: validate,
    solve: function (size, regions, limit, budget) {
      return makeSolver(size)(regions, limit || 2, budget || 2000000);
    },
    randomQueens: randomQueens,
    makeRng: makeRng
  };
});
