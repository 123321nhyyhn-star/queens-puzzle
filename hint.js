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
     试完这一档还没撞墙就继续试别的单位，直到预算用完。 */
  function probeRefute(st, ctx, maxK, skip) {
    var n = ctx.n;
    var lists = [], g, r, c, lg, lr, lc;

    for (g = 0; g < n; g++) {
      if (st.regDone[g]) continue;
      lg = liveCells(st, ctx.regCells[g]);
      if (lg.length > 1) lists.push(lg);
    }
    for (r = 0; r < n; r++) {
      if (st.rowDone[r]) continue;
      lr = liveCells(st, ctx.rowCells[r]);
      if (lr.length > 1) lists.push(lr);
    }
    for (c = 0; c < n; c++) {
      if (st.colDone[c]) continue;
      lc = liveCells(st, ctx.colCells[c]);
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
        if (skip && skip(cell)) continue;
        tried++;
        var trial = cloneState(st);
        place(trial, ctx, cell);
        var dead = runToDead(trial, ctx, maxK);
        if (dead) return { rule: 'P', level: 4, kind: 'cross', cell: cell, dead: dead, kills: [cell] };
      }
    }
    return null;
  }

  /* 一路推到没有新结论为止；遇到某个单位一个位置都不剩 → 矛盾 */
  function runToDead(st, ctx, maxK) {
    for (var guard = 0; guard < 400; guard++) {
      var hit = findHit(st, ctx, maxK);
      if (!hit) return null;
      if (hit.dead) return hit.dead;
      applyHit(st, ctx, hit);
      if (st.cnt === ctx.n) return null;
    }
    return null;
  }

  /* ------------------------------------------------------------- 文案 */
  function regTxt(list) {
    if (list.length === 1) return (list[0] + 1) + ' 号';
    return list.map(function (x) { return x + 1; }).join('、') + ' 号';
  }
  function lineTxt(dir, list) {
    var body = list.map(function (x) { return x + 1; }).join('、');
    return '第' + body + (dir === 'row' ? '行' : '列');
  }
  function cellTxt(i, n) {
    return '第' + (((i / n) | 0) + 1) + '行第' + ((i % n) + 1) + '列';
  }
  function unitName(t) {
    return t === 'row' ? '行' : t === 'col' ? '列' : '色块';
  }

  function step(text, hl, extra) {
    var s = { text: text, hl: hl || {} };
    if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) s[k] = extra[k];
    return s;
  }

  /* ------------------------------------------------- 把一次推理编成脚本 */
  function scriptOf(hit, ctx, st, isDone) {
    var n = ctx.n;
    var steps = [];

    if (hit.rule === 'R1') {
      var cell = hit.cell, g = hit.g;
      var r = (cell / n) | 0, c = cell % n;
      steps.push(step('先看 ' + (g + 1) + ' 号色块', { regions: [g] }, { focus: cell }));
      steps.push(step('这一块只剩' + cellTxt(cell, n) + '能放', { regions: [g], cells: [cell] }, { focus: cell }));
      steps.push(step('它的皇后就在这里', { regions: [g], cells: [cell] }, { focus: cell, keep: true }));
      return {
        rule: 'R1', level: 1, title: '直读',
        steps: steps, action: { type: 'place', cell: cell }
      };
    }

    if (hit.rule === 'R2' || hit.rule === 'R3') {
      var isRow = hit.rule === 'R2';
      var line = hit.line, cl = hit.cell;
      var hlUnit = isRow ? { rows: [line] } : { cols: [line] };
      steps.push(step('先看' + lineTxt(hit.dir, [line]), hlUnit, { focus: cl }));
      steps.push(step(isRow ? '这一行只剩' + cellTxt(cl, n) + '一格' : '这一列只剩' + cellTxt(cl, n) + '一格',
        { rows: isRow ? [line] : [], cols: isRow ? [] : [line], cells: [cl] }, { focus: cl }));
      steps.push(step(isRow ? '这一行的皇后就在这里' : '这一列的皇后就在这里',
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
      var lineSet = { rows: rowsHl, cols: colsHl };
      if (k === 1) {
        var g1 = hit.units[0];
        steps.push(step('先看 ' + (g1 + 1) + ' 号色块', { regions: [g1] }));
        steps.push(step('它还活着的格子，全在' + lineTxt(hit.dir, hit.lines) + '里',
          { regions: [g1], rows: rowsHl, cols: colsHl }));
        steps.push(step(lineTxt(hit.dir, hit.lines) + '的皇后只能给它',
          { regions: [g1], rows: rowsHl, cols: colsHl }));
      } else {
        steps.push(step('先看这 ' + k + ' 个色块：' + regTxt(hit.units), { regions: hit.units }));
        steps.push(step('它们还活着的格子，全在' + lineTxt(hit.dir, hit.lines) + '里',
          { regions: hit.units, rows: rowsHl, cols: colsHl }));
        steps.push(step(k + ' 个色块 ' + k + ' 只皇后，一行一只，正好占满这 ' + k + (hit.dir === 'row' ? ' 行' : ' 列'),
          { regions: hit.units, rows: rowsHl, cols: colsHl, lines: hit.lines, dir: hit.dir }));
      }
      var cN = hit.kills.filter(function (x) { return !isDone(x); }).length;
      steps.push(step(lineTxt(hit.dir, hit.lines) + '里别家的 ' + cN + ' 格都可以划掉',
        { rows: rowsHl, cols: colsHl, cells: hit.kills, regions: hit.units, kill: true },
        { focus: hit.kills[0] }));
      return {
        rule: hit.rule, level: 2, title: '数色块',
        steps: steps, action: { type: 'cross', cells: hit.kills }
      };
    }

    if (hit.rule.charAt(0) === 'B') {
      var k2 = hit.k;
      var rows2 = hit.dir === 'row' ? hit.lines : [];
      var cols2 = hit.dir === 'col' ? hit.lines : [];
      if (k2 === 1) {
        var g2 = hit.regions[0];
        steps.push(step('先看' + lineTxt(hit.dir, hit.lines), { rows: rows2, cols: cols2 }));
        steps.push(step('这一' + (hit.dir === 'row' ? '行' : '列') + '还活着的格子，全是 ' + (g2 + 1) + ' 号的',
          { rows: rows2, cols: cols2, regions: [g2] }));
        steps.push(step('所以 ' + (g2 + 1) + ' 号的皇后就在这一' + (hit.dir === 'row' ? '行' : '列'),
          { rows: rows2, cols: cols2, regions: [g2] }));
      } else {
        steps.push(step('先看这 ' + k2 + ' 行：' + lineTxt(hit.dir, hit.lines), { rows: rows2, cols: cols2 }));
        steps.push(step('这几' + (hit.dir === 'row' ? '行' : '列') + '还活着的格子，只有这 ' + k2 + ' 个色块的',
          { rows: rows2, cols: cols2, regions: hit.regions }));
        steps.push(step(k2 + ' 只皇后只能由它们出，都在这 ' + k2 + (hit.dir === 'row' ? ' 行' : ' 列') + '里',
          { rows: rows2, cols: cols2, regions: hit.regions }));
      }
      var cN2 = hit.kills.filter(function (x) { return !isDone(x); }).length;
      steps.push(step(regTxt(hit.regions) + '在别处的 ' + cN2 + ' 格都可以划掉',
        { rows: rows2, cols: cols2, regions: hit.regions, cells: hit.kills, kill: true },
        { focus: hit.kills[0] }));
      return {
        rule: hit.rule, level: 3, title: '数线',
        steps: steps, action: { type: 'cross', cells: hit.kills }
      };
    }

    if (hit.rule === 'P') {
      var pc = hit.cell;
      var pr = (pc / n) | 0, pcd = pc % n;
      var dead = hit.dead;
      var deadHl = {};
      var deadAt = '';
      if (dead.type === 'row') { deadHl.rows = [dead.index]; deadAt = '第' + (dead.index + 1) + '行'; }
      else if (dead.type === 'col') { deadHl.cols = [dead.index]; deadAt = '第' + (dead.index + 1) + '列'; }
      else { deadHl.regions = [dead.index]; deadAt = (dead.index + 1) + ' 号色块'; }
      steps.push(step('简单的数法都用完了，试一个假设', { cells: [pc] }, { focus: pc }));
      steps.push(step('假设' + cellTxt(pc, n) + '放皇后，往下推', { cells: [pc] }, { focus: pc }));
      steps.push(step('推到这里就发现' + deadAt + '一个位置都不剩了',
        { cells: [pc], rows: deadHl.rows, cols: deadHl.cols, regions: deadHl.regions, dead: true },
        { focus: pc }));
      steps.push(step('所以' + cellTxt(pc, n) + '不能放皇后', { cells: [pc], kill: true }, { focus: pc }));
      return {
        rule: 'P', level: 4, title: '试推',
        steps: steps, action: { type: 'cross', cells: [pc] }
      };
    }

    return null;
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
      var wr = (wq / n) | 0, wc = wq % n;
      return {
        kind: 'fixQueen', rule: 'FQ', level: 0, title: '检查',
        steps: [
          step('这只皇后放错位置了', { cells: [wq], bad: true }, { focus: wq }),
          step('第' + (wr + 1) + '行应该放在别的列，先把它拿走', { cells: [wq], bad: true }, { focus: wq })
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
      var fx = hit.cell, fr = (fx / n) | 0, fc = fx % n;
      return {
        kind: 'fixCross', rule: 'FX', level: 0, title: '检查',
        steps: [
          step('这里画错 × 了', { cells: [fx], bad: true }, { focus: fx }),
          step('第' + (fr + 1) + '行第' + (fc + 1) + '列必须放皇后，先把 × 清掉', { cells: [fx], bad: true }, { focus: fx })
        ],
        action: { type: 'unmark', cell: fx }
      };
    }

    if (hit) {
      var sc = scriptOf(hit, ctx, work, isDone);
      if (sc) {
        sc.kind = hit.kind === 'place' ? 'place' : 'cross';
        return sc;
      }
    }

    // ④ 都推不动 → 试推（玩家已经划掉的格子直接跳过）
    if (allowProbe) {
      var pr = probeRefute(work, ctx, maxK, isDone);
      if (pr) {
        var sc2 = scriptOf(pr, ctx, work, isDone);
        if (sc2) { sc2.kind = 'cross'; return sc2; }
      }
    }

    // ⑤ 真是没招了：如果玩家把某格皇后划掉了，先提醒
    if (wrongX.length) {
      var wx = wrongX[0], xr = (wx / n) | 0, xc = wx % n;
      return {
        kind: 'fixCross', rule: 'FX', level: 0, title: '检查',
        steps: [
          step('这里画错 × 了', { cells: [wx], bad: true }, { focus: wx }),
          step('第' + (xr + 1) + '行第' + (xc + 1) + '列必须放皇后，先把 × 清掉', { cells: [wx], bad: true }, { focus: wx })
        ],
        action: { type: 'unmark', cell: wx }
      };
    }

    // ⑥ 到了必须猜的地方：把「二选一」的那几格指出来，不替玩家选
    var guess = smallestChoice(work, ctx);
    if (guess) {
      var gt = guess.type === 'row' ? '第' + (guess.index + 1) + '行'
        : guess.type === 'col' ? '第' + (guess.index + 1) + '列'
          : (guess.index + 1) + ' 号色块';
      var gsteps = [
        step('能直接数出来的都用完了', {}),
        step(gt + '只剩 ' + guess.cells.length + ' 个位置', cellsHl(guess.type, guess.index, guess.cells)),
        step('先试其中一个，不对的话会马上矛盾', cellsHl(guess.type, guess.index, guess.cells), { focus: guess.cells[0] })
      ];
      return { kind: 'guess', rule: 'G', level: 5, title: '该猜了', steps: gsteps, action: null, choices: guess.cells };
    }

    return { kind: 'none', rule: null, level: 0, title: '提示', steps: [step('这一步没有能一眼说清的走法了')], action: null };
  }

  function cellsHl(type, index, cells) {
    var hl = { cells: cells };
    if (type === 'row') hl.rows = [index];
    else if (type === 'col') hl.cols = [index];
    else hl.regions = [index];
    return hl;
  }

  /* 找「选择最少」的单位；只剩 2–3 格时适合让玩家自己试 */
  function smallestChoice(st, ctx) {
    var n = ctx.n, best = null, bestLen = 99;
    function consider(type, index, cells) {
      if (cells.length < 2 || cells.length > 3) return;
      if (cells.length < bestLen) { bestLen = cells.length; best = { type: type, index: index, cells: cells }; }
    }
    for (var g = 0; g < n; g++) if (!st.regDone[g]) consider('region', g, liveCells(st, ctx.regCells[g]));
    for (var r = 0; r < n; r++) if (!st.rowDone[r]) consider('row', r, liveCells(st, ctx.rowCells[r]));
    for (var c = 0; c < n; c++) if (!st.colDone[c]) consider('col', c, liveCells(st, ctx.colCells[c]));
    return best;
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
