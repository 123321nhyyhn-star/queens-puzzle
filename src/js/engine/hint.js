/* ============================================================================
 * 皇后 Queens · 提示引导引擎
 * ----------------------------------------------------------------------------
 * 输入玩家的盘面（marks）+ 唯一解（solution，仅用于「校验」不用于「泄题」），
 * 输出一段可逐步播放的引导脚本：每一步 = 一句人话 + 一组要高亮的东西。
 *
 * 推理只用人类能讲的规则，按优先级逐条尝试：
 *   L1 直读    某个色块 / 某一行 / 某一列 只剩一格            → 落子
 *   L2 数色块  k 个色块的活格只落在 k 条线里                  → 这 k 条线里别人作废
 *   L3 数线    k 条线的活格只属于 k 个色块                    → 这 k 个色块在别处作废
 *   L4 试推    假设某格放皇后，推下去矛盾                     → 这格作废
 *   L5 试猜    实在没有能证明的了，只报「哪几个位置二选一」   → 不下结论，玩家自己选
 *
 * 关键约定：
 *   · 只从「玩家放对的皇后」出发推理，玩家自己画的 × 一律不信（可能是错的）
 *   · auto（自动打叉）只用于判断「这一格玩家是不是已经排除了」，不参与推理
 *   · solution 只干两件事：认出放错的皇后、认出画错 × 的格子
 * 同时支持浏览器（window.QueensHint）与 Node（require），方便命令行验证。
 * ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QueensHint = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAXK = 3;          // 计数类规则最多数到 3 个
  var PROBE_LIMIT = 120;  // L4 最多试几个假设格

  /* ------------------------------------------------------------- 上下文 */
  function ctxOf(n, regions) {
    var N = n * n;
    var regCells = [], rowCells = [], colCells = [];
    for (var g = 0; g < n; g++) regCells.push([]);
    for (var r = 0; r < n; r++) rowCells.push([]);
    for (var c = 0; c < n; c++) colCells.push([]);
    for (var i = 0; i < N; i++) {
      var rr = (i / n) | 0, cc = i % n;
      regCells[regions[i]].push(i);
      rowCells[rr].push(i);
      colCells[cc].push(i);
    }
    return { n: n, N: N, region: regions, regCells: regCells, rowCells: rowCells, colCells: colCells };
  }

  function newState(ctx) {
    var n = ctx.n;
    return {
      alive: new Uint8Array(ctx.N).fill(1),
      cnt: 0,
      rowDone: new Uint8Array(n),
      colDone: new Uint8Array(n),
      regDone: new Uint8Array(n),
      queens: new Int32Array(n).fill(-1)
    };
  }

  function cloneState(s) {
    return {
      alive: s.alive.slice(),
      cnt: s.cnt,
      rowDone: s.rowDone.slice(),
      colDone: s.colDone.slice(),
      regDone: s.regDone.slice(),
      queens: s.queens.slice()
    };
  }

  /* 放一只皇后：整行 / 整列 / 整块 + 八邻域全部作废 */
  function place(st, ctx, idx) {
    var n = ctx.n;
    if (idx == null || idx < 0 || idx >= ctx.N) return;
    var r = (idx / n) | 0, c = idx % n, g = ctx.region[idx];
    var k, cells;
    st.alive[idx] = 0;
    st.cnt++;
    st.rowDone[r] = 1;
    st.colDone[c] = 1;
    st.regDone[g] = 1;
    st.queens[g] = idx;
    cells = ctx.rowCells[r];
    for (k = 0; k < cells.length; k++) st.alive[cells[k]] = 0;
    cells = ctx.colCells[c];
    for (k = 0; k < cells.length; k++) st.alive[cells[k]] = 0;
    cells = ctx.regCells[g];
    for (k = 0; k < cells.length; k++) st.alive[cells[k]] = 0;
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        var rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
        st.alive[rr * n + cc] = 0;
      }
    }
  }

  function liveCells(st, cells) {
    var out = [];
    for (var i = 0; i < cells.length; i++) if (st.alive[cells[i]]) out.push(cells[i]);
    return out;
  }

  var popcount = function (v) {
    v = v - ((v >> 1) & 0x55555555);
    v = (v & 0x33333333) + ((v >> 2) & 0x33333333);
    return (((v + (v >> 4)) & 0x0F0F0F0F) * 0x01010101) >> 24;
  };

  function bitsOf(mask, n) {
    var a = [];
    for (var i = 0; i < n; i++) if (mask & (1 << i)) a.push(i);
    return a;
  }

  function masksOf(st, ctx) {
    var n = ctx.n;
    var m = {
      regRows: new Int32Array(n), regCols: new Int32Array(n), regAlive: new Int32Array(n),
      rowRegs: new Int32Array(n), colRegs: new Int32Array(n),
      rowAlive: new Int32Array(n), colAlive: new Int32Array(n)
    };
    for (var i = 0; i < ctx.N; i++) {
      if (!st.alive[i]) continue;
      var g = ctx.region[i], r = (i / n) | 0, c = i % n;
      m.regRows[g] |= (1 << r);
      m.regCols[g] |= (1 << c);
      m.regAlive[g]++;
      m.rowRegs[r] |= (1 << g);
      m.colRegs[c] |= (1 << g);
      m.rowAlive[r]++;
      m.colAlive[c]++;
    }
    return m;
  }

  /* ------------------------------------------------------- 规则识别（L1） */
  /* 返回第一个命中的推理；都没有返回 null；状态矛盾返回 { dead } */
  function findHit(st, ctx, maxK) {
    var n = ctx.n, g, r, c, i;

    // ---- L1 直读：色块 → 行 → 列
    for (g = 0; g < n; g++) {
      if (st.regDone[g]) continue;
      var lg = liveCells(st, ctx.regCells[g]);
      if (!lg.length) return { dead: { type: 'region', index: g } };
      if (lg.length === 1) return { rule: 'R1', level: 1, kind: 'place', cell: lg[0], g: g };
    }
    for (r = 0; r < n; r++) {
      if (st.rowDone[r]) continue;
      var lr = liveCells(st, ctx.rowCells[r]);
      if (!lr.length) return { dead: { type: 'row', index: r } };
      if (lr.length === 1) return { rule: 'R2', level: 1, kind: 'place', cell: lr[0], dir: 'row', line: r };
    }
    for (c = 0; c < n; c++) {
      if (st.colDone[c]) continue;
      var lc = liveCells(st, ctx.colCells[c]);
      if (!lc.length) return { dead: { type: 'col', index: c } };
      if (lc.length === 1) return { rule: 'R3', level: 1, kind: 'place', cell: lc[0], dir: 'col', line: c };
    }

    if (maxK < 1) return null;
    var M = masksOf(st, ctx);

    // ---- L2 / L3，k 从小到大；k 相同时 L2(A) 先于 L3(B)
    for (var k = 1; k <= maxK; k++) {
      var a1 = countA(st, ctx, M, 'row', k); if (a1) return a1;
      var a2 = countA(st, ctx, M, 'col', k); if (a2) return a2;
      var b1 = countB(st, ctx, M, 'row', k); if (b1) return b1;
      var b2 = countB(st, ctx, M, 'col', k); if (b2) return b2;
    }

    // ---- 走到这里说明所有单位都有 ≥2 个活格；不能算矛盾
    for (i = 0; i < n; i++) {
      if (!st.rowDone[i] && M.rowAlive[i] === 0) return { dead: { type: 'row', index: i } };
      if (!st.colDone[i] && M.colAlive[i] === 0) return { dead: { type: 'col', index: i } };
      if (!st.regDone[i] && M.regAlive[i] === 0) return { dead: { type: 'region', index: i } };
    }
    return null;
  }

  /* L2：k 个色块的活格只落在 k 条线里 → 这 k 条线里别人的格子作废 */
  function countA(st, ctx, M, dir, k) {
    var n = ctx.n;
    var maskOf = dir === 'row' ? M.regRows : M.regCols;
    var lineCells = dir === 'row' ? ctx.rowCells : ctx.colCells;
    var lineDone = dir === 'row' ? st.rowDone : st.colDone;
    var units = [];
    for (var g = 0; g < n; g++) if (!st.regDone[g] && M.regAlive[g] > 0) units.push(g);
    if (units.length < k) return null;

    var picked = [], set = null, found = null;
    function rec(start, union) {
      if (found) return;
      if (picked.length > 0) {
        var bits = popcount(union);
        if (bits < picked.length) return;          // 装不下，无解（不在提示里报）
        if (bits === picked.length) {
          set = {};
          for (var t = 0; t < picked.length; t++) set[picked[t]] = 1;
          var kills = [];
          var lines = bitsOf(union, n);
          for (var li = 0; li < lines.length; li++) {
            var L = lines[li];
            if (lineDone[L]) continue;
            var cells = lineCells[L];
            for (var q = 0; q < cells.length; q++) {
              var cell = cells[q];
              if (!st.alive[cell]) continue;
              if (set[ctx.region[cell]]) continue;
              kills.push(cell);
            }
          }
          if (kills.length) {
            found = {
              rule: 'A' + picked.length, level: 2, kind: 'cross', dir: dir, k: picked.length,
              units: picked.slice(), lines: lines, kills: kills
            };
            return;
          }
        }
        if (picked.length === k) return;
      }
      for (var i = start; i < units.length; i++) {
        picked.push(units[i]);
        rec(i + 1, union | maskOf[units[i]]);
        picked.pop();
        if (found) return;
      }
    }
    rec(0, 0);
    return found;
  }

  /* L3：k 条线的活格只属于 k 个色块 → 这 k 个色块在别处的格子作废 */
  function countB(st, ctx, M, dir, k) {
    var n = ctx.n;
    var maskOf = dir === 'row' ? M.rowRegs : M.colRegs;
    var lineDone = dir === 'row' ? st.rowDone : st.colDone;
    var lineAlive = dir === 'row' ? M.rowAlive : M.colAlive;
    var units = [];
    for (var u = 0; u < n; u++) if (!lineDone[u] && lineAlive[u] > 0) units.push(u);
    if (units.length < k) return null;

    var picked = [], found = null;
    function rec(start, regMask, lineMask) {
      if (found) return;
      if (picked.length > 0) {
        var bits = popcount(regMask);
        if (bits < picked.length) return;
        if (bits === picked.length) {
          var regions = bitsOf(regMask, n);
          var kills = [];
          for (var ri = 0; ri < regions.length; ri++) {
            var cells = ctx.regCells[regions[ri]];
            for (var q = 0; q < cells.length; q++) {
              var cell = cells[q];
              if (!st.alive[cell]) continue;
              var L = dir === 'row' ? ((cell / n) | 0) : (cell % n);
              if (lineMask & (1 << L)) continue;
              kills.push(cell);
            }
          }
          if (kills.length) {
            found = {
              rule: 'B' + picked.length, level: 3, kind: 'cross', dir: dir, k: picked.length,
              lines: picked.slice(), regions: regions, kills: kills
            };
            return;
          }
        }
        if (picked.length === k) return;
      }
      for (var i = start; i < units.length; i++) {
        picked.push(units[i]);
        rec(i + 1, regMask | maskOf[units[i]], lineMask | (1 << units[i]));
        picked.pop();
        if (found) return;
      }
    }
    rec(0, 0, 0);
    return found;
  }

  function applyHit(st, ctx, hit) {
    if (hit.kind === 'place') { place(st, ctx, hit.cell); return; }
    for (var i = 0; i < hit.kills.length; i++) st.alive[hit.kills[i]] = 0;
  }

  /* ------------------------------------------------------------- L4 试推 */
  /* 假设某格放皇后，用 L1–L3 往下推；推出矛盾就说明这格不能放。
     候选顺序：按「所在单位的活格数」从小到大 —— 选择越少，假设越容易撞墙。
     试完这一档还没撞墙就继续试别的单位，直到预算用完。

     skip（= 玩家盘面上已经标过的格子）在这里有**两个**作用，缺一个就会出乱子：
     ① 不拿它当假设的候选；
     ② 试推的盘面里也把它当成「不能放」。
     少了 ②，推演会一路推到一格玩家早就画了 × 的位置，然后念「只剩一格」——
     屏幕上明明白白一个叉，玩家只会觉得提示在胡说（也确实是胡说）。
     这些 × 一定不在解位上：plan 在试推之前就把「把解位画成 ×」的情况拦去纠错了。
     所以把它们当约束只是缩小可行集，不会推出假的「无解」。 */
  function probeRefute(st, ctx, maxK, skip) {
    var n = ctx.n;
    var lists = [], g, r, c, lg, lr, lc;

    function liveOf(cells) {
      var out = [], k, cc;
      for (k = 0; k < cells.length; k++) {
        cc = cells[k];
        if (!st.alive[cc]) continue;
        if (skip && skip(cc)) continue;
        out.push(cc);
      }
      return out;
    }

    for (g = 0; g < n; g++) {
      if (st.regDone[g]) continue;
      lg = liveOf(ctx.regCells[g]);
      if (lg.length > 1) lists.push(lg);
    }
    for (r = 0; r < n; r++) {
      if (st.rowDone[r]) continue;
      lr = liveOf(ctx.rowCells[r]);
      if (lr.length > 1) lists.push(lr);
    }
    for (c = 0; c < n; c++) {
      if (st.colDone[c]) continue;
      lc = liveOf(ctx.colCells[c]);
      if (lc.length > 1) lists.push(lc);
    }
    lists.sort(function (a, b) { return a.length - b.length; });
    if (!lists.length) return null;

    var seen = Object.create(null);
    var tried = 0;
    for (var li = 0; li < lists.length && tried < PROBE_LIMIT; li++) {
      var list = lists[li];
      for (var i = 0; i < list.length && tried < PROBE_LIMIT; i++) {
        var cell = list[i];
        if (seen[cell]) continue;
        seen[cell] = 1;
        tried++;
        var trial = cloneState(st);
        // ② 玩家划掉的格子，在假设里同样不能放
        if (skip) {
          for (var z = 0; z < ctx.N; z++) if (skip(z)) trial.alive[z] = 0;
        }
        place(trial, ctx, cell);
        var trace = [];
        var dead = runToDead(trial, ctx, maxK, trace);
        if (dead) return { rule: 'P', level: 4, kind: 'cross', cell: cell, dead: dead, trace: trace, kills: [cell] };
      }
    }
    return null;
  }

  /* 一路推到没有新结论为止；遇到某个单位一个位置都不剩 → 矛盾。
     trace 给了就把每一步推出来的结论连「推之前那一刻的盘面」一起记下来：
     文案要讲「中间发生了什么」，还得知道那一步之前哪些格子已经没了，
     否则屏幕上明明有十几格空白，文案却说「只剩一格」。 */
  function runToDead(st, ctx, maxK, trace) {
    for (var guard = 0; guard < 400; guard++) {
      var hit = findHit(st, ctx, maxK);
      if (!hit) return null;
      if (hit.dead) return hit.dead;
      if (trace) trace.push({ hit: hit, alive: st.alive.slice() });
      applyHit(st, ctx, hit);
      if (st.cnt === ctx.n) return null;
    }
    return null;
  }

  /* ------------------------------------------------------------- 文案 */
  /* 文案措辞约定（玩家反馈过两轮，别改回去）：
     · 不拟人：「活着的格子」「别家的」「给它」这类说法玩家看不懂，
       一律说成「没被划掉的格子」「其他色块的」「这个色块的」。
     · 不念编号：色块写成 REF 占位符，网页里换成和棋盘同色的小色卡，
       数字只在纯文本（测试输出、文案库）里兜底。 */
  var REF_OPEN = '\u0001', REF_CLOSE = '\u0002';
  var REF_RE = /\u0001(\d+)\u0002/g;

  /* 一个色块的引用 → 网页里渲染成小色卡 */
  function reg(g) { return REF_OPEN + g + REF_CLOSE; }
  /* 多个色块：「3 号、5 号」 */
  function regList(list) { return list.map(reg).join('、'); }

  function plainText(s) {
    return String(s).replace(REF_RE, function (all, d) { return (Number(d) + 1) + ' 号'; });
  }

  /* 拆成 [{ t: '先看 ' }, { g: 2 }, { t: '色块' }]，前端照着拼 DOM 即可 */
  function segsOf(s) {
    var out = [], src = String(s), last = 0;
    src.replace(REF_RE, function (all, d, at) {
      if (at > last) out.push({ t: src.slice(last, at) });
      out.push({ g: Number(d) });
      last = at + all.length;
      return all;
    });
    if (last < src.length) out.push({ t: src.slice(last) });
    return out;
  }

  function lineTxt(dir, list) {
    var body = list.map(function (x) { return x + 1; }).join('、');
    return '第' + body + (dir === 'row' ? '行' : '列');
  }
  function cellTxt(i, n) {
    return '第' + (((i / n) | 0) + 1) + '行第' + ((i % n) + 1) + '列';
  }

  /* 差分去重：圈画层是按格画的，同一格出现两次就会叠两层描边（比旁边的重一倍） */
  function uniqCells(list) {
    var seen = Object.create(null), out = [], i, c;
    for (i = 0; i < list.length; i++) {
      c = list[i];
      if (seen[c]) continue;
      seen[c] = 1;
      out.push(c);
    }
    return out;
  }

  /* 一格周围一圈（3×3 去掉自己）：放皇后时这些格子跟着一起作废 */
  function aroundOf(idx, n) {
    var r = (idx / n) | 0, c = idx % n, out = [];
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        var rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
        out.push(rr * n + cc);
      }
    }
    return out;
  }

  /* 试推链里的一步 → 一句话 + 一组高亮。
     这些结论只在「假设成立」时才对（假设本身是错的），所以圈画要跟真结论分开：
     · 假设里被迫落子的那一格 → assume（紫圈 + 点，读作「假设里的皇后」）
     · 假设里被排除的格子     → ghost（灰虚线圈，不脉冲）
     「X 色块只剩一格」这种话必须把「已经没了的那些格」也圈出来，
     否则玩家一抬头看见一色块的空格子，会觉得文案在乱说。 */
  function traceStepOf(entry, ctx, isDone) {
    var h = entry.hit;
    if (h.kind === 'place') {
      var unit, rows = [], cols = [], regions = [], unitCells;
      if (h.rule === 'R1') { unit = reg(h.g) + '色块'; regions = [h.g]; unitCells = ctx.regCells[h.g]; }
      else if (h.rule === 'R2') { unit = '第' + (h.line + 1) + '行'; rows = [h.line]; unitCells = ctx.rowCells[h.line]; }
      else { unit = '第' + (h.line + 1) + '列'; cols = [h.line]; unitCells = ctx.colCells[h.line]; }
      var away = [], ui;
      for (ui = 0; ui < unitCells.length; ui++) {
        var uc = unitCells[ui];
        if (uc === h.cell || entry.alive[uc]) continue;
        if (isDone && isDone(uc)) continue;
        away.push(uc);
      }
      // 推出来的这一格一定是「玩家盘面上还没标过」的：试推的盘面已经把玩家画掉的
      // 格子当成不能放了（见 probeRefute），所以这里可以放心念「皇后只能放这里」。
      return {
        text: unit + '只剩一格，皇后只能放这里',
        hl: {
          rows: rows, cols: cols, regions: regions,
          cells: away, ghost: away.length > 0,
          assume: [h.cell]
        },
        focus: h.cell
      };
    }
    var rowsHl = h.dir === 'row' ? h.lines : [];
    var colsHl = h.dir === 'col' ? h.lines : [];
    // 文案报「N 格被排除」按假设里的真实代价数；但只圈玩家还没划掉的那些
    var fresh = [], ki;
    for (ki = 0; ki < h.kills.length; ki++) {
      if (!isDone || !isDone(h.kills[ki])) fresh.push(h.kills[ki]);
    }
    var hl = { rows: rowsHl, cols: colsHl, cells: fresh, ghost: true };
    if (h.rule.charAt(0) === 'A') {
      return {
        text: lineTxt(h.dir, h.lines) + '里其他色块的 ' + h.kills.length + ' 格被排除',
        hl: hl, focus: fresh.length ? fresh[0] : h.kills[0]
      };
    }
    hl.regions = h.regions;
    return {
      text: (h.k === 1 ? reg(h.regions[0]) + '色块' : '这 ' + h.k + ' 个色块')
        + '在别处的 ' + h.kills.length + ' 格被排除',
      hl: hl, focus: fresh.length ? fresh[0] : h.kills[0]
    };
  }

  function step(text, hl, extra) {
    var s = { text: plainText(text), segs: segsOf(text), hl: hl || {} };
    if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) s[k] = extra[k];
    return s;
  }

  /* ------------------------------------------- 盘面一致性（文案要对得上眼睛） */
  /* 引擎的推演状态只从「放对的皇后」出发，玩家自己画 × 一律不信。
     于是会出现：引擎早就知道某几格不能放，可玩家还没把它们划掉。
     这时若直接念「只剩这一格没被划掉」，玩家一抬头就看见两格空的 —— 文案在说谎。
     所以凡是引用某个单位（色块 / 行 / 列）的文案，都要先确认：
     这个单位里「引擎判死但玩家还没划掉」的格子已经清空，否则先引导玩家补划掉。
     这些格子一律由已放好的皇后直接排除（同行 / 同列 / 同色块 / 斜着挨着），
     所以划掉它们永远不会误伤真解。 */

  /* 一次推理引用到的单位 */
  function unitsOfHit(hit) {
    var u = { rows: [], cols: [], regions: [] }, i;
    if (hit.rule === 'R1') { u.regions.push(hit.g); return u; }
    if (hit.rule === 'R2') { u.rows.push(hit.line); return u; }
    if (hit.rule === 'R3') { u.cols.push(hit.line); return u; }
    var units = hit.rule.charAt(0) === 'A' ? hit.units : hit.regions;
    for (i = 0; i < units.length; i++) u.regions.push(units[i]);
    var lines = hit.lines || [];
    for (i = 0; i < lines.length; i++) {
      if (hit.dir === 'row') u.rows.push(lines[i]);
      else u.cols.push(lines[i]);
    }
    return u;
  }

  /* 单位里「引擎已判死、玩家盘面上还空着」的格子 */
  function staleIn(st, ctx, units, isDone) {
    var seen = {}, out = [];
    function add(cells) {
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        if (seen[c] || st.alive[c] || isDone(c)) continue;
        seen[c] = 1;
        out.push(c);
      }
    }
    var i;
    for (i = 0; i < units.regions.length; i++) add(ctx.regCells[units.regions[i]]);
    for (i = 0; i < units.rows.length; i++) add(ctx.rowCells[units.rows[i]]);
    for (i = 0; i < units.cols.length; i++) add(ctx.colCells[units.cols[i]]);
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  function unitTxt(units) {
    if (units.regions.length === 1 && !units.rows.length && !units.cols.length) return '先看 ' + reg(units.regions[0]) + '色块';
    if (units.rows.length === 1 && !units.regions.length && !units.cols.length) return '先看' + lineTxt('row', units.rows);
    if (units.cols.length === 1 && !units.regions.length && !units.rows.length) return '先看' + lineTxt('col', units.cols);
    return '先看这几处';
  }

  /* 让玩家把「早就该划掉、但还没划」的格子补上，再回来听结论 */
  function catchUpPlan(ctx, units, stale, head) {
    var hl = { rows: units.rows, cols: units.cols, regions: units.regions };
    var both = {
      rows: units.rows, cols: units.cols, regions: units.regions,
      cells: stale, kill: true
    };
    var steps = [head || step(unitTxt(units), hl)];
    steps.push(step('这里还有 ' + stale.length + ' 格没被划掉',
      { rows: units.rows, cols: units.cols, regions: units.regions, cells: stale },
      { focus: stale[0] }));
    steps.push(step('它们都被已经放好的皇后管着（同行、同列、同色块，或者斜着挨着），先划掉',
      both, { focus: stale[0] }));
    return {
      kind: 'cross', rule: 'C1', level: 1, title: '补划',
      steps: steps, action: { type: 'cross', cells: stale }
    };
  }

  /* ------------------------------------------------- 把一次推理编成脚本 */
  function scriptOf(hit, ctx, st, isDone) {
    var n = ctx.n;
    var steps = [];

    if (hit.rule === 'R1') {
      var cell = hit.cell, g = hit.g;
      steps.push(step('先看 ' + reg(g) + '色块', { regions: [g] }, { focus: cell }));
      steps.push(step('这个色块只剩' + cellTxt(cell, n) + '这一格没被划掉',
        { regions: [g], cells: [cell] }, { focus: cell }));
      steps.push(step('这个色块的皇后就放在这里', { regions: [g], cells: [cell] }, { focus: cell, keep: true }));
      return {
        rule: 'R1', level: 1, title: '直读',
        steps: steps, action: { type: 'place', cell: cell }
      };
    }

    if (hit.rule === 'R2' || hit.rule === 'R3') {
      var isRow = hit.rule === 'R2';
      var line = hit.line, cl = hit.cell;
      var lw = isRow ? '行' : '列';
      var hlUnit = isRow ? { rows: [line] } : { cols: [line] };
      steps.push(step('先看' + lineTxt(hit.dir, [line]), hlUnit, { focus: cl }));
      steps.push(step('这一' + lw + '只剩' + cellTxt(cl, n) + '这一格没被划掉',
        { rows: isRow ? [line] : [], cols: isRow ? [] : [line], cells: [cl] }, { focus: cl }));
      steps.push(step('这一' + lw + '的皇后就放在这里',
        { rows: isRow ? [line] : [], cols: isRow ? [] : [line], cells: [cl] }, { focus: cl }));
      return {
        rule: hit.rule, level: 1, title: '直读',
        steps: steps, action: { type: 'place', cell: cl }
      };
    }

    if (hit.rule.charAt(0) === 'A') {
      var k = hit.k;
      var rowsHl = hit.dir === 'row' ? hit.lines : [];
      var colsHl = hit.dir === 'col' ? hit.lines : [];
      var lwA = hit.dir === 'row' ? '行' : '列';
      var lineA = lineTxt(hit.dir, hit.lines);
      if (k === 1) {
        var g1 = hit.units[0];
        steps.push(step('先看 ' + reg(g1) + '色块', { regions: [g1] }));
        steps.push(step('这个色块没被划掉的格子，全在' + lineA + '里',
          { regions: [g1], rows: rowsHl, cols: colsHl }));
        steps.push(step(lineA + '里只能放这个色块的皇后',
          { regions: [g1], rows: rowsHl, cols: colsHl }));
      } else {
        steps.push(step('先看这 ' + k + ' 个色块：' + regList(hit.units), { regions: hit.units }));
        steps.push(step('这 ' + k + ' 个色块没被划掉的格子，全在' + lineA + '里',
          { regions: hit.units, rows: rowsHl, cols: colsHl }));
        steps.push(step('这 ' + k + ' 个色块一共要放 ' + k + ' 只皇后，正好占满这 ' + k + ' ' + lwA,
          { regions: hit.units, rows: rowsHl, cols: colsHl, lines: hit.lines, dir: hit.dir }));
      }
      // 只把「还没划掉的」圈出来：文案里念的是几个格子，图上就该圈几个
      var newA = hit.kills.filter(function (x) { return !isDone(x); });
      steps.push(step(lineA + '里其他色块的 ' + newA.length + ' 个格子都可以划掉',
        { rows: rowsHl, cols: colsHl, cells: newA, regions: hit.units, kill: true },
        { focus: newA[0] }));
      return {
        rule: hit.rule, level: 2, title: '数色块',
        steps: steps, action: { type: 'cross', cells: newA }
      };
    }

    if (hit.rule.charAt(0) === 'B') {
      var k2 = hit.k;
      var rows2 = hit.dir === 'row' ? hit.lines : [];
      var cols2 = hit.dir === 'col' ? hit.lines : [];
      var lwB = hit.dir === 'row' ? '行' : '列';
      var lineB = lineTxt(hit.dir, hit.lines);
      if (k2 === 1) {
        var g2 = hit.regions[0];
        steps.push(step('先看' + lineB, { rows: rows2, cols: cols2 }));
        steps.push(step('这一' + lwB + '没被划掉的格子，都属于 ' + reg(g2) + '色块',
          { rows: rows2, cols: cols2, regions: [g2] }));
        steps.push(step('所以 ' + reg(g2) + '色块的皇后只能放在这一' + lwB,
          { rows: rows2, cols: cols2, regions: [g2] }));
      } else {
        steps.push(step('先看' + lineB, { rows: rows2, cols: cols2 }));
        steps.push(step('这 ' + k2 + ' ' + lwB + '没被划掉的格子，只属于这 ' + k2 + ' 个色块：' + regList(hit.regions),
          { rows: rows2, cols: cols2, regions: hit.regions }));
        steps.push(step('这 ' + k2 + ' 只皇后只能放在这 ' + k2 + ' ' + lwB + '里',
          { rows: rows2, cols: cols2, regions: hit.regions }));
      }
      var newB = hit.kills.filter(function (x) { return !isDone(x); });
      var killTxt = k2 === 1
        ? reg(hit.regions[0]) + '色块在别处的 ' + newB.length + ' 个格子都可以划掉'
        : '这 ' + k2 + ' 个色块（' + regList(hit.regions) + '）在别处的 ' + newB.length + ' 个格子都可以划掉';
      steps.push(step(killTxt,
        { rows: rows2, cols: cols2, regions: hit.regions, cells: newB, kill: true },
        { focus: newB[0] }));
      return {
        rule: hit.rule, level: 3, title: '数线',
        steps: steps, action: { type: 'cross', cells: newB }
      };
    }

    if (hit.rule === 'P') {
      var pc = hit.cell;
      var dead = hit.dead;
      var pr = (pc / n) | 0, pcn = pc % n, pg = ctx.region[pc];
      var deadHl = {};
      var deadAt = '';
      if (dead.type === 'row') { deadHl.rows = [dead.index]; deadAt = '第' + (dead.index + 1) + '行'; }
      else if (dead.type === 'col') { deadHl.cols = [dead.index]; deadAt = '第' + (dead.index + 1) + '列'; }
      else { deadHl.regions = [dead.index]; deadAt = reg(dead.index) + '色块'; }

      /* 一次假设要讲成一段完整的话，别再退回「往下推 → 就矛盾了」：
         ① 为什么只能试假设 ② 假设谁 ③ 假设立刻排掉了什么
         ④ 顺着往下推的头一步 ⑤ 中间那些重复的步骤归成一句 ⑥ 直接把棋盘推死的那一步
         ⑦ 撞墙 ⑧ 结论。中间只留「头 + 尾」：尾那一步才是撞墙的直接原因。
         假设一放就撞墙（没有中间步）时，④ 改成讲「这个单位是被哪几处挤空的」。

         撞墙那一步还要把那个单位里「玩家盘面上还空着」的格子圈出来（ghost）：
         不然屏幕上明明有几格空白，文案却说「已经没位置可放」—— 跟眼睛对不上。
         同理，玩家自己已经划掉 / 自动划掉的格子不再画圈，别在 × 上套一个框。 */
      var box = aroundOf(pc, n);
      var deadCells = dead.type === 'row' ? ctx.rowCells[dead.index]
        : dead.type === 'col' ? ctx.colCells[dead.index] : ctx.regCells[dead.index];
      var deadGhost = [], boxRing = [], dg;
      for (dg = 0; dg < deadCells.length; dg++) {
        if (!isDone || !isDone(deadCells[dg])) deadGhost.push(deadCells[dg]);
      }
      for (dg = 0; dg < box.length; dg++) {
        if (!isDone || !isDone(box[dg])) boxRing.push(box[dg]);
      }

      steps.push(step('常规的数法都推不动了，试一个假设', { cells: [pc] }, { focus: pc }));
      steps.push(step('假设' + cellTxt(pc, n) + '放皇后', { assume: [pc] }, { focus: pc }));
      steps.push(step('这一行、这一列、这个色块就都满了，周围一圈也不能放',
        { rows: [pr], cols: [pcn], regions: [pg], cells: boxRing, ghost: true, assume: [pc] },
        { focus: pc }));

      var trace = hit.trace || [];
      if (!trace.length) {
        /* 假设自己就把某个单位挤空了。要说准「被哪几处挤空」：
           多数情况是那几格全挨着这一格（斜着挨着也算），少数还要算上整行整列。 */
        var inBox = {}, allInBox = true, di;
        for (di = 0; di < box.length; di++) inBox[box[di]] = 1;
        inBox[pc] = 1;
        for (di = 0; di < deadGhost.length; di++) {
          if (!inBox[deadGhost[di]]) { allInBox = false; break; }
        }
        var squeeze = {
          rows: (deadHl.rows || []).slice(), cols: (deadHl.cols || []).slice(),
          regions: deadHl.regions, cells: uniqCells(boxRing.concat(deadGhost)), ghost: true,
          assume: [pc], dead: true
        };
        if (!allInBox) {
          squeeze.rows = squeeze.rows.concat([pr]);
          squeeze.cols = squeeze.cols.concat([pcn]);
        }
        steps.push(step('偏偏' + deadAt + '的格子全在这几处，一格不剩', squeeze, { focus: pc }));
      } else {
        var firstTs = traceStepOf(trace[0], ctx, isDone);
        steps.push(step('于是' + firstTs.text, firstTs.hl, { focus: firstTs.focus }));

        var middles = trace.slice(1, trace.length - 1);
        if (middles.length) {
          var goneQ = [], gone = [], more = 0;
          for (var mj = 0; mj < middles.length; mj++) {
            var mh = middles[mj].hit;
            if (mh.kind === 'place') { if (!isDone || !isDone(mh.cell)) goneQ.push(mh.cell); }
            else {
              more += mh.kills.length;
              for (var mk = 0; mk < mh.kills.length; mk++) {
                if (!isDone || !isDone(mh.kills[mk])) gone.push(mh.kills[mk]);
              }
            }
          }
          var midTxt = middles.length === 1 ? '中间又这样推了一步'
            : '中间又这样推了 ' + middles.length + ' 步';
          // 中间那几步涉及的格子玩家全都划过了 → 这一步没东西可圈，干脆不说
          if (gone.length || goneQ.length) {
            steps.push(step(midTxt + (more ? '，排掉 ' + more + ' 格' : ''),
              { cells: uniqCells(gone), ghost: true, assume: uniqCells(goneQ) },
              { focus: (gone[0] != null ? gone[0] : goneQ[0]) }));
          }
        }

        if (trace.length > 1) {
          var lastTs = traceStepOf(trace[trace.length - 1], ctx, isDone);
          steps.push(step('接着' + lastTs.text, lastTs.hl, { focus: lastTs.focus }));
        }
        steps.push(step('推到这一步：' + deadAt + '已经没有位置可放',
          { cells: deadGhost, ghost: true, rows: deadHl.rows, cols: deadHl.cols,
            regions: deadHl.regions, assume: [pc], dead: true },
          { focus: pc }));
      }

      steps.push(step('所以' + cellTxt(pc, n) + '不能放皇后', { cells: [pc], kill: true }, { focus: pc }));
      return {
        rule: 'P', level: 4, title: '试推',
        steps: steps, action: { type: 'cross', cells: [pc] }
      };
    }

    return null;
  }

  /* 玩家把「必须放皇后」的格子画成了 × → 先让他撤掉 */
  function fixCrossPlan(cell, n) {
    return {
      kind: 'fixCross', rule: 'FX', level: 0, title: '检查',
      steps: [
        step('这一格不该画 ×', { cells: [cell], bad: true }, { focus: cell }),
        step(cellTxt(cell, n) + '必须放皇后，先把 × 清掉', { cells: [cell], bad: true }, { focus: cell })
      ],
      action: { type: 'unmark', cell: cell }
    };
  }

  /* --------------------------------------------------------------- 主入口 */
  function plan(opt) {
    var n = opt.n;
    var ctx = opt.ctx || ctxOf(n, opt.regions);
    var marks = opt.marks;
    var auto = opt.auto || null;
    var solution = opt.solution;
    var maxK = opt.maxK || MAXK;
    var allowProbe = opt.allowProbe !== false;
    var N = ctx.N;

    function isDone(i) {
      if (marks[i] !== 0) return true;
      return !!(auto && auto[i]);
    }

    var isSol = new Uint8Array(N);
    for (var r = 0; r < n; r++) isSol[r * n + solution[r]] = 1;

    var wrongQ = [], wrongX = [];
    var st = newState(ctx);
    var placed = 0, empty = 0;
    for (var i = 0; i < N; i++) {
      if (marks[i] === 2) {
        if (isSol[i]) { place(st, ctx, i); placed++; }
        else wrongQ.push(i);
      } else if (marks[i] === 1 && isSol[i]) wrongX.push(i);
    }
    if (placed === n) return { kind: 'done', steps: [] };
    if (!marks.length) return { kind: 'none', steps: [] };

    // ① 放错的皇后：先纠这个，否则后面越推越乱
    if (wrongQ.length) {
      var wq = wrongQ[0];
      var wr = (wq / n) | 0;
      return {
        kind: 'fixQueen', rule: 'FQ', level: 0, title: '检查',
        steps: [
          step('这枚皇后放错位置了', { cells: [wq], bad: true }, { focus: wq }),
          step('第' + (wr + 1) + '行的皇后应该在别的列，先把它拿掉', { cells: [wq], bad: true }, { focus: wq })
        ],
        action: { type: 'remove', cell: wq }
      };
    }

    // ② 从「放对的皇后」出发，逐条找结论；已经把棋盘反映出来的结论顺手跳过
    var work = cloneState(st);
    var hit = null;
    for (var guard = 0; guard < 400; guard++) {
      hit = findHit(work, ctx, maxK);
      if (!hit || hit.dead) { hit = null; break; }
      // 「这一格必须放皇后」的结论落在玩家画的 × 上：这个 × 是错的。
      // 绝不能当成「已经反映在盘面上」跳过 —— 那会把这格的整行整列整块静默作废，
      // 后面所有文案就和玩家的盘面对不上了（玩家会看到「明明还有两格没划掉」）。
      if (hit.kind === 'place' && marks[hit.cell] === 1) return fixCrossPlan(hit.cell, n);
      var actionable = hit.kind === 'place'
        ? !isDone(hit.cell)
        : hit.kills.some(function (x) { return !isDone(x); });
      if (actionable) break;
      applyHit(work, ctx, hit);
      hit = null;
      if (work.cnt === n) break;
    }

    // ③ 结论落在玩家自己画错的 × 上 → 先叫他撤掉
    if (hit && hit.kind === 'place' && marks[hit.cell] === 1) {
      return fixCrossPlan(hit.cell, n);
    }

    if (hit) {
      // ③b 文案要经得起「抬头对照盘面」：这个单位里还有没补划掉的格子 → 先补划
      var sc0 = scriptOf(hit, ctx, work, isDone);
      if (sc0) {
        var units = unitsOfHit(hit);
        var stale = staleIn(work, ctx, units, isDone);
        if (stale.length) return catchUpPlan(ctx, units, stale, sc0.steps[0]);
        sc0.kind = hit.kind === 'place' ? 'place' : 'cross';
        return sc0;
      }
    }

    // ④ 玩家把某格的皇后划成了 ×（而那一格就是解位）：先把 × 纠回去，再谈别的。
    //    这一步必须排在试推之前 —— 试推会把玩家的 × 当成「不能放」，
    //    盘面上留着一个错的 ×，推出来的结论就跟着错，玩家照着做只会越走越远。
    if (wrongX.length) return fixCrossPlan(wrongX[0], n);

    // ⑤ 都推不动 → 试推（玩家已经划掉的格子直接跳过）
    if (allowProbe) {
      var pr = probeRefute(work, ctx, maxK, isDone);
      if (pr) {
        var sc2 = scriptOf(pr, ctx, work, isDone);
        if (sc2) { sc2.kind = 'cross'; return sc2; }
      }
    }

    // ⑥ 到了必须猜的地方：把「二选一」的那几格指出来，不替玩家选
    var guess = smallestChoice(work, ctx, isDone);
    if (guess) {
      var gUnits = {
        rows: guess.type === 'row' ? [guess.index] : [],
        cols: guess.type === 'col' ? [guess.index] : [],
        regions: guess.type === 'region' ? [guess.index] : []
      };
      // 同一个道理：盘面上还有没补划掉的格子时，先说「只剩 N 个位置」也是错的
      var gStale = staleIn(work, ctx, gUnits, isDone);
      if (gStale.length) return catchUpPlan(ctx, gUnits, gStale, null);

      var gt = guess.type === 'row' ? '第' + (guess.index + 1) + '行'
        : guess.type === 'col' ? '第' + (guess.index + 1) + '列'
          : reg(guess.index) + '色块';
      if (guess.pin) {
        // 盘面上这一单位只剩一格没划掉：按玩家自己划掉的结果交回去，不冒充证明
        var pinCell = guess.cells[0];
        var pinSteps = [
          step('靠计数能推的都推完了', {}),
          step(gt + '只剩' + cellTxt(pinCell, n) + '这一格没被划掉',
            cellsHl(guess.type, guess.index, guess.cells)),
          step('按你现在划掉的结果，只能先试这一格，放错会马上出现冲突',
            cellsHl(guess.type, guess.index, guess.cells), { focus: pinCell })
        ];
        return {
          kind: 'guess', rule: 'G1', level: 5, title: '该猜了',
          steps: pinSteps, action: null, choices: guess.cells
        };
      }
      var gsteps = [
        step('靠计数能推的都推完了', {}),
        step(gt + '只剩 ' + guess.cells.length + ' 个位置', cellsHl(guess.type, guess.index, guess.cells)),
        step('先试其中一个，放错会马上出现冲突', cellsHl(guess.type, guess.index, guess.cells), { focus: guess.cells[0] })
      ];
      return { kind: 'guess', rule: 'G', level: 5, title: '该猜了', steps: gsteps, action: null, choices: guess.cells };
    }

    return { kind: 'none', rule: null, level: 0, title: '提示', steps: [step('这一步没有能直接推出来的结论')], action: null };
  }

  function cellsHl(type, index, cells) {
    var hl = { cells: cells };
    if (type === 'row') hl.rows = [index];
    else if (type === 'col') hl.cols = [index];
    else hl.regions = [index];
    return hl;
  }

  /* 找「选择最少」的单位；只剩 2–3 格时适合让玩家自己试。
     数的是玩家盘面上**还空着**的格子：已经划掉的格子既没法「试」，
     也不该被算进「只剩 N 个位置」里，否则又和眼睛看到的盘面对不上。
     如果每个单位都只剩 1 格没划掉（说明玩家自己已经排到这一步了），
     就把那一格交回去，并说明「这是按你划掉的看的」，不冒充成证明过的结论。 */
  function smallestChoice(st, ctx, isDone) {
    var n = ctx.n, best = null, bestLen = 99, pin = null, pinLive = 99;
    function consider(type, index, cells) {
      var live = [], i;
      for (i = 0; i < cells.length; i++) if (!isDone || !isDone(cells[i])) live.push(cells[i]);
      if (live.length >= 2 && live.length <= 3) {
        if (live.length < bestLen) { bestLen = live.length; best = { type: type, index: index, cells: live, pin: false }; }
        return;
      }
      // 盘面只剩一格、引擎却还留着别的可能 → 只能「按你划掉的」先试
      if (live.length === 1 && cells.length > 1 && cells.length < pinLive) {
        pinLive = cells.length;
        pin = { type: type, index: index, cells: live, pin: true };
      }
    }
    for (var g = 0; g < n; g++) if (!st.regDone[g]) consider('region', g, liveCells(st, ctx.regCells[g]));
    for (var r = 0; r < n; r++) if (!st.rowDone[r]) consider('row', r, liveCells(st, ctx.rowCells[r]));
    for (var c = 0; c < n; c++) if (!st.colDone[c]) consider('col', c, liveCells(st, ctx.colCells[c]));
    return best || pin;
  }

  return {
    version: '1.0.0',
    plan: plan,
    // 供调试 / 命令行验证
    ctxOf: ctxOf,
    newState: newState,
    place: place,
    findHit: findHit,
    probeRefute: probeRefute
  };
});
