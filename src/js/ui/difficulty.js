/* ============================================================================
 * difficulty.js
 * 本局信息页：顶栏那条信息条点开的就是这里。
 *
 * 四张读数卡片（棋盘 / 用时 / 皇后 / 难度）跟信息条一一对应，
 * 下面接原来那张难度说明——分数、分级、这局到底靠什么推出来的。
 * ========================================================================== */

import { limitRemaining, elapsedMs } from '../core/clock.js';
import { limitLabel } from '../core/config.js';
import { app, btnHud, diffBadge, diffBig, diffGroupTitle, diffLead, diffLegend, diffLevelEl,
  diffScoreEl, diffSeg, diffSheet, diffSteps, diffWrap, infoDiffCard, infoDiffSub, infoQueens,
  infoQueensSub, infoSize, infoSizeSub, infoTime, infoTimeSub } from '../core/dom.js';
import { state, view } from '../core/state.js';
import { formatTime } from '../core/utils.js';
import { queenCount } from '../game/rules.js';

/* ==========================================================
   难度
   ----------------------------------------------------------
   engine/difficulty.js 会用同一套推理器把这盘推一遍：先纯逻辑，卡住了就
   假设试推，再不行才试错落子。这里只负责展示。
   ========================================================== */
var DIFF_ROWS = [
  { key: 'openSingles', name: '开局可定', cls: 'is-key' },
  { key: 'block', name: '区块封锁', cls: '' },
  { key: 'count', name: '集合计数', cls: '' },
  { key: 'probe', name: '假设试推', cls: 'is-probe' },
  { key: 'guess', name: '试错落子', cls: 'is-guess' }
];

/* 信息条上那一段：只有分级和分数，没有就整段收起来（刚开局还没算完的那一瞬间） */
export function updateDiffChip() {
  var v = state.vibe;
  if (!v) { diffSeg.hidden = true; paintHudLabel(); return; }
  diffSeg.hidden = false;
  diffSeg.dataset.tone = v.tone;
  diffLevelEl.textContent = v.level;
  diffScoreEl.textContent = v.score.toFixed(1);
  paintHudLabel();
}

/* 整条读成一个按钮，读屏器听到的就是这一句：把四段读数连起来说，
 * 不然只念一句「本局信息」，等于什么都没说。 */
export function paintHudLabel() {
  if (!state.size) return;
  var parts = [
    '棋盘 ' + state.size + '×' + state.size,
    '皇后 ' + queenCount() + '/' + state.size
  ];
  if (state.vibe) parts.push('难度 ' + state.vibe.level + ' ' + state.vibe.score.toFixed(1) + ' 分');
  btnHud.setAttribute('aria-label', '本局信息：' + parts.join('，'));
}

/* ==========================================================
   信息页的四张卡片
   ----------------------------------------------------------
   用时这张要跟着跑：面板开着的时候计时还在走，读数停住会让人以为卡了。
   由 main.js 的 250ms 心跳在面板打开时调 paintInfo()。
   ========================================================== */
export function paintInfo() {
  if (!view.diffOpen || !state.size) return;
  var n = state.size;
  var q = queenCount();
  var playing = state.status === 'playing';

  infoSize.textContent = n + '×' + n;
  infoSizeSub.textContent = n + ' 个色块 · 唯一解';

  var on = state.limit > 0 && state.status !== 'won';
  var left = limitRemaining();
  var ms = on ? Math.max(0, Math.ceil(left / 1000) * 1000) : elapsedMs();
  infoTime.textContent = formatTime(ms);
  infoTime.classList.toggle('is-low', on && playing && left <= 30000);

  if (on) {
    infoTimeSub.textContent = left <= 0
      ? '限时 ' + limitLabel(state.limit) + ' · 已经超时'
      : '限时 ' + limitLabel(state.limit) + ' · 超时判负';
  } else if (state.status === 'won') {
    infoTimeSub.textContent = '这局的用时';
  } else if (state.runningSince) {
    infoTimeSub.textContent = '正在计时';
  } else if (state.elapsed) {
    infoTimeSub.textContent = '计时停着（切回来就接着走）';
  } else {
    infoTimeSub.textContent = '落第一子才开始计时';
  }

  infoQueens.textContent = q + '/' + n;
  if (state.status === 'lost') infoQueensSub.textContent = '时间到，这局没解开';
  else if (q >= n) infoQueensSub.textContent = '放满了，对一下行列与色块';
  else infoQueensSub.textContent = '还差 ' + (n - q) + ' 只';
}

export function renderDiff() {
  var v = state.vibe;
  var has = !!v;
  diffGroupTitle.hidden = !has;
  diffLead.hidden = !has;
  diffSteps.hidden = !has;
  diffLegend.hidden = !has;
  if (!has) {
    infoDiffCard.dataset.tone = '';
    diffBadge.textContent = '—';
    diffBadge.dataset.tone = '';
    diffBig.textContent = '—';
    infoDiffSub.textContent = '这盘还没算出来';
    return;
  }

  var s = v.steps || {};

  diffBig.textContent = v.score.toFixed(1);
  diffBadge.textContent = v.level;
  diffBadge.dataset.tone = v.tone;
  infoDiffCard.dataset.tone = v.tone;

  var sub = v.label || '本局难度评估';
  infoDiffSub.textContent = sub;

  var max = 1;
  for (var i = 0; i < DIFF_ROWS.length; i++) {
    var c = s[DIFF_ROWS[i].key] || 0;
    if (c > max) max = c;
  }

  var html = '';
  for (var j = 0; j < DIFF_ROWS.length; j++) {
    var row = DIFF_ROWS[j], n2 = s[row.key] || 0;
    var w = Math.max(n2 ? 6 : 0, Math.round(100 * n2 / max));
    html += '<div class="diff-step ' + row.cls + (n2 ? '' : ' is-zero') + '">' +
      '<span class="ds-name">' + row.name + '</span>' +
      '<span class="ds-bar"><i style="width:' + w + '%"></i></span>' +
      '<span class="ds-n">×' + n2 + '</span></div>';
  }
  diffSteps.innerHTML = html;

  var n = v.metrics.n;
  var lead = n + '×' + n + ' · 最大色块 ' + (s.areaMax || 0) + ' 格 · ';
  if (s.solved && s.openSingles >= n) {
    lead += '不猜不试，纯推理就能推完';
  } else if (!s.openSingles) {
    lead += '开局没有能直接落子的格，得靠试推';
  } else {
    lead += '开局推理能定 ' + s.openSingles + ' 只，其余靠试推';
  }
  if (s.guess) lead += '（其中 ' + s.guess + ' 只要硬猜）';
  diffLead.textContent = lead;
}

export function openDiff() {
  if (view.diffOpen) return;
  view.diffOpen = true;
  renderDiff();
  paintInfo();
  diffWrap.hidden = false;
  if ('inert' in HTMLElement.prototype) app.inert = true;
  else app.setAttribute('aria-hidden', 'true');
  btnHud.setAttribute('aria-expanded', 'true');
  diffSheet.focus();
}

export function closeDiff(fromHud) {
  if (!view.diffOpen) return;
  view.diffOpen = false;
  diffWrap.hidden = true;
  if ('inert' in HTMLElement.prototype) app.inert = false;
  app.removeAttribute('aria-hidden');
  btnHud.setAttribute('aria-expanded', 'false');
  if (fromHud) btnHud.focus();
  else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}
