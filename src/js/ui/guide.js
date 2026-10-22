/* ============================================================================
 * guide.js
 * 提示引导：把 hint.js 给的推理流程拆成可翻页的面板，并在棋盘上圈画高亮。
 * ========================================================================== */

import { canPlay, placeQueen, setMarks } from '../app/actions.js';
import { buzz, sfx } from '../core/audio.js';
import { boardEl, btnHint, coachDots, coachEl, coachNext, coachPrev, coachText, coachTier,
  glEl, glTags, rlEl, stage } from '../core/dom.js';
import { REGION_COLORS } from '../core/palette.js';
import { guide, settings, state, view } from '../core/state.js';
import { save } from '../core/storage.js';
import { announce, clamp, svgEl } from '../core/utils.js';
import { regionPath } from '../game/geometry.js';
import { flashHint, updateHint } from './hint.js';
import { pushHistory } from '../app/history.js';
import { relayout } from './layout.js';

/* ==========================================================
   提示引导
   ----------------------------------------------------------
   不再直接给答案。先跑一遍人类能讲的规则（L1 直读 → L2 数色块 →
   L3 数线 → L4 试推），把结论拆成「看哪 → 为什么 → 所以哪几格」，
   每一步只高亮一样东西，玩家自己按「下一步」或「照做」。
   面板是钉在舞台底部的浮层（开关都不动棋盘），圈画层 pointer-events:none。
   ========================================================== */

export function guidePlan() {
  if (!window.QueensHint) return null;
  return window.QueensHint.plan({
    n: state.size,
    regions: state.regions,
    solution: state.solution,
    marks: state.marks,
    auto: state.auto || null,
    maxK: 3,
    allowProbe: true
  });
}

function buildDots(count) {
  coachDots.innerHTML = '';
  for (var i = 0; i < count; i++) coachDots.appendChild(document.createElement('i'));
}

export function openGuide() {
  if (!canPlay()) return;
  // 挑战里关掉了提示：按钮是灰的，键盘 H 也得拦住
  if (settings.noHint) {
    flashHint('挑战模式：这局不能用提示');
    buzz(6);
    return;
  }
  if (guide.open) { guideNext(); return; }

  var plan = guidePlan();
  if (!plan || !plan.steps || !plan.steps.length) { flashHint('这盘暂时没有提示可给'); return; }
  if (plan.kind === 'done') { flashHint('已经是解了'); return; }

  guide.open = true;
  guide.plan = plan;
  guide.at = 0;
  state.hints++;
  save();

  coachEl.hidden = false;
  stage.classList.add('is-guiding');
  buildDots(plan.steps.length);
  showStep(0);
  // 「提示」按钮这会儿被藏起来了，焦点不能留在它身上，否则键盘/读屏会掉到 body
  try { coachEl.focus({ preventScroll: true }); } catch (e) { coachEl.focus(); }
  sfx('hint');
  buzz(8);
}

/* 文案里的色块占位符（hint.js 的 segs）直接渲染成小色卡：
   玩家对颜色比记编号快得多，也不用盯着下面色盘找「几号」。 */
function renderCoachText(s) {
  coachText.textContent = '';
  var box = document.createElement('span');
  box.className = 'coach-in';
  var segs = s && s.segs;
  if (!segs || !segs.length) {
    box.textContent = (s && s.text) || '';
    coachText.appendChild(box);
    return;
  }
  var colors = state.regionColors || REGION_COLORS;
  for (var i = 0; i < segs.length; i++) {
    var seg = segs[i];
    if (seg.g == null) { box.appendChild(document.createTextNode(seg.t || '')); continue; }
    var g = seg.g | 0;
    var sw = document.createElement('i');
    sw.className = 'sw';
    sw.style.setProperty('--c', colors[g] || '#FFF');
    // 读屏仍然念「3 号」；眼睛只看见颜色
    var sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = (g + 1) + ' 号';
    sw.appendChild(sr);
    box.appendChild(sw);
  }
  coachText.appendChild(box);
}

export function showStep(i) {
  var p = guide.plan;
  if (!p) return;
  i = clamp(i, 0, p.steps.length - 1);
  guide.at = i;
  var s = p.steps[i] || {};
  var lv = p.level || 0;

  renderCoachText(s);
  coachTier.textContent = (p.kind === 'fixQueen' || p.kind === 'fixCross') ? '检查' : ('L' + lv);
  coachEl.dataset.lv = String(lv);

  var last = i === p.steps.length - 1;
  coachPrev.disabled = i === 0;
  coachNext.textContent = last ? (p.action ? '照做' : '知道了') : '下一步';

  var dots = coachDots.childNodes;
  for (var d = 0; d < dots.length; d++) {
    dots[d].className = d === i ? 'on' : '';
  }

  relayout();          // 面板是浮层，这里只为格子尺寸可能变过时重画描边/连线
  paintGl(s.hl);
  announce(s.text || '');
}

export function guideNext() {
  if (!guide.open) return;
  var p = guide.plan;
  if (!p) return;
  if (guide.at < p.steps.length - 1) { showStep(guide.at + 1); return; }
  if (p.action) applyGuide();
  else closeGuide();
}

export function guidePrev() {
  if (!guide.open) return;
  showStep(guide.at - 1);
}

export function closeGuide() {
  if (!guide.open) return;
  guide.open = false;
  guide.plan = null;
  guide.at = 0;
  coachEl.hidden = true;
  stage.classList.remove('is-guiding');
  paintGl(null);
  relayout();
  updateHint();
  // 焦点本来在面板里（或刚被藏掉的按钮上），收面板时交还给「提示」
  var act = document.activeElement;
  if (!act || act === coachEl || coachEl.contains(act) || act === btnHint ||
      act === document.body) {
    try { btnHint.focus({ preventScroll: true }); } catch (e) { /* 老浏览器忽略 */ }
  }
}

export function applyGuide() {
  var p = guide.plan;
  if (!p || !p.action) { closeGuide(); return; }
  var a = p.action;
  closeGuide();

  if (a.type === 'place') {
    placeQueen(a.cell);
    flashHint('照做了：皇后已放好', true);
    announce('已按提示放好皇后');
    return;
  }

  if (a.type === 'cross') {
    var cnt = 0, k;
    for (k = 0; k < a.cells.length; k++) {
      if (state.marks[a.cells[k]] === 0) cnt++;
    }
    if (!cnt) { flashHint('这几格已经划过了'); return; }
    pushHistory();
    for (k = 0; k < a.cells.length; k++) {
      if (state.marks[a.cells[k]] === 0) state.marks[a.cells[k]] = 1;
    }
    state.moves += cnt;
    sfx('x');
    buzz(5);
    setMarks(state.marks);
    flashHint('已划掉 ' + cnt + ' 格', true);
    announce('已划掉 ' + cnt + ' 格');
    return;
  }

  pushHistory();
  state.marks[a.cell] = 0;
  sfx('xOff');
  buzz(6);
  setMarks(state.marks);
  flashHint('已清掉，重新试试', true);
}

export function addTag(text, x, y, kind) {
  var tag = document.createElement('span');
  tag.className = 'gl-tag' + (kind ? ' is-' + kind : '');
  tag.textContent = text;
  glTags.appendChild(tag);
  // 标签比格子宽，贴边时往里挤一下，别跑到棋盘外面去
  var bw = glTags.offsetWidth || 0;
  var bh = glTags.offsetHeight || 0;
  var left = Math.round(x - tag.offsetWidth / 2);
  var top = Math.round(y - tag.offsetHeight / 2);
  if (bw) left = clamp(left, 2, Math.max(2, bw - tag.offsetWidth - 2));
  if (bh) top = clamp(top, 2, Math.max(2, bh - tag.offsetHeight - 2));
  tag.style.left = left + 'px';
  tag.style.top = top + 'px';
}

/* 引导讲到哪几个色块，就把那几颗色卡一直亮着；换步时先全部熄掉再点亮。
   （老实现是 420ms 的 scale 脉冲，玩家根本来不及看清是哪颗） */
export function setChipHints(list) {
  for (var i = 0; i < view.chips.length; i++) view.chips[i].classList.remove('is-hint');
  for (var j = 0; j < list.length; j++) {
    var chip = view.chips[list[j]];
    if (chip) chip.classList.add('is-hint');
  }
}

export function paintGl(hl) {
  var n = state.size;
  var cell = parseFloat(getComputedStyle(boardEl).getPropertyValue('--cell')) || 0;
  glEl.innerHTML = '';
  glTags.innerHTML = '';
  // 引导一开，色块错误红光就让位：同一时刻只讲一件事
  rlEl.classList.toggle('is-guide', !!hl);
  if (!hl || !cell) { setChipHints([]); return; }

  var size = n * cell;
  glEl.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
  glEl.setAttribute('width', String(size));
  glEl.setAttribute('height', String(size));

  var rows = hl.rows || [], cols = hl.cols || [];
  var regions = hl.regions || [], cells = hl.cells || [];
  var i, r, c;

  for (i = 0; i < rows.length; i++) {
    r = rows[i];
    glEl.appendChild(svgEl('rect', {
      x: 0, y: r * cell, width: size, height: cell, 'class': 'gl-band'
    }));
    // 只在色带端点挂一个 15px 的圆形序号：竖着压在行左端、横着压在列顶端，
    // 最多遮住一格的一角，具体是第几行文案里也会再念一遍。
    addTag('' + (r + 1), 9, r * cell + cell / 2, 'num');
  }

  for (i = 0; i < cols.length; i++) {
    c = cols[i];
    glEl.appendChild(svgEl('rect', {
      x: c * cell, y: 0, width: cell, height: size, 'class': 'gl-band is-col'
    }));
    addTag('' + (c + 1), c * cell + cell / 2, 9, 'num');
  }

  for (i = 0; i < regions.length; i++) {
    var g = regions[i];
    var d = regionPath(n, state.regions, g, cell);
    if (!d) continue;
    glEl.appendChild(svgEl('path', { d: d, 'class': 'gl-region-glow' }));
    glEl.appendChild(svgEl('path', { d: d, 'class': 'gl-region-fill' }));
    var line = svgEl('path', { d: d, 'class': 'gl-region-line' });
    glEl.appendChild(line);
    try {
      var len = line.getTotalLength();
      line.style.strokeDasharray = String(len);
      line.style.setProperty('--len', String(len));
    } catch (e) { /* 老浏览器不画描边动画 */ }
  }
  setChipHints(regions);

  var kill = !!hl.kill;
  for (i = 0; i < cells.length; i++) {
    var idx = cells[i];
    r = (idx / n) | 0;
    c = idx % n;
    var pad = Math.max(1.5, cell * 0.045);
    var attrs = {
      x: c * cell + pad, y: r * cell + pad,
      width: cell - pad * 2, height: cell - pad * 2,
      rx: Math.min(7, cell * 0.16),
      'class': 'gl-cell' + (kill ? ' is-kill' : '') + (hl.bad ? ' is-bad' : '')
    };
    glEl.appendChild(svgEl('rect', attrs));
  }
}

export function useHint() { openGuide(); }
/** 布局重排后按新格子尺寸重画当前这一步的圈画（面板浮层不影响棋盘，只为坐标对齐）。 */
export function refreshGuidePaint() {
  if (guide.open && guide.plan && guide.plan.steps[guide.at]) {
    paintGl(guide.plan.steps[guide.at].hl);
  }
}
