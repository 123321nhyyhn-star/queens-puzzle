/* ============================================================================
 * panels/result.js · 结果层（解开 / 时间到）
 * ----------------------------------------------------------------------------
 * 两种结局共用一张卡，按 state.status 换文案与按钮：
 *   解开：再来一局 / 重来这局 / 看看棋盘
 *   超时：重试这一局（同一盘棋重开）/ 换一局新的
 *
 * 输掉的那一屏必须做个选择（重试 / 换一局），Esc 关不掉、点背景也关不掉：
 * 关掉之后棋盘是封的，只剩「新一局」一条路，容易点得莫名其妙。
 * 真的要收掉的地方（换盘、重开）传 force。
 * ========================================================================== */

import { newGame, retryGame } from '../../app/puzzle.js';
import { limitLabel } from '../../core/config.js';
import { boardEl } from '../../core/dom.js';
import { createSheet } from '../../core/sheet.js';
import { state, view } from '../../core/state.js';
import { formatTime } from '../../core/utils.js';
import { queenCount } from '../../game/rules.js';
import { updateStats } from '../render.js';

export var HTML = /* html */ `
<div class="result" id="result" hidden>
  <div class="result-card" role="dialog" aria-modal="true" aria-labelledby="resultTitle">
    <p class="result-kicker" id="resultKicker">PUZZLE SOLVED</p>
    <h2 class="result-title" id="resultTitle">解开了</h2>
    <p class="result-sub" id="resultSub">8×8 · 用时 00:00</p>
    <div class="result-stats">
      <div class="result-stat"><b id="resSize">8×8</b><span>棋盘</span></div>
      <div class="result-stat"><b id="resTime">00:00</b><span id="resTimeLbl">用时</span></div>
      <div class="result-stat"><b id="resHints">0</b><span>提示</span></div>
    </div>
    <button class="btn btn-hint" id="btnAgain" type="button">再来一局</button>
    <div class="result-links">
      <button class="btn-text" id="btnReplay" type="button">重来这局</button>
      <button class="btn-text" id="btnPeek" type="button">看看棋盘</button>
    </div>
  </div>
</div>`;

var el = null;
var resultKicker = null, resultTitle = null, resultSub = null;
var resSize = null, resTime = null, resTimeLbl = null, resHints = null;
var btnAgain = null, btnReplay = null, btnPeek = null;

var sheet = null;

/* 结果层那一行小字：这局在自己组里排第几快。
 * 只有解开的才有名次；本组只此一局时说「本组最快」也不算吹牛。 */
function rankText() {
  var f = view.lastFinish;
  if (!f || !f.rank) return '';
  return f.rank === 1 ? ' · 本组最快' : ' · 本组第 ' + f.rank;
}

/* 打开前把这一局的读数写进卡片。who 由 state.status 决定，调用方不用传。 */
function paint() {
  var lost = state.status === 'lost';

  el.dataset.kind = lost ? 'lost' : 'won';
  resultKicker.textContent = lost ? 'TIME UP' : 'PUZZLE SOLVED';
  resultTitle.textContent = lost ? '时间到' : '解开了';

  resSize.textContent = state.size + '×' + state.size;
  resTime.textContent = lost ? limitLabel(state.limit) : formatTime(state.elapsed);
  resTimeLbl.textContent = lost ? '限时' : '用时';
  resHints.textContent = String(state.hints);

  resultSub.textContent = lost
    ? state.size + '×' + state.size + ' · 限时 ' + limitLabel(state.limit) +
      ' · 还差 ' + Math.max(0, state.size - queenCount()) + ' 只皇后'
    : state.size + '×' + state.size + ' · 用时 ' + formatTime(state.elapsed) +
      (state.vibe ? ' · ' + state.vibe.level + ' ' + state.vibe.score.toFixed(1) : '') +
      rankText();

  btnAgain.textContent = lost ? '重试这一局' : '再来一局';
  btnPeek.textContent = lost ? '换一局新的' : '看看棋盘';
  // 「重来这局」只在解开后露面：输掉的那屏第一个按钮就是重试同一盘，不必再给一个
  btnReplay.hidden = lost;
}

export function showResult() {
  if (sheet.isOpen()) return;
  paint();
  sheet.open();
}

/* 换盘、重开这类真的要收掉的地方传 force = true；
 * 输掉时不给 force 就关不动（Esc / 点背景都走这条）。 */
export function dismissResult(force) {
  if (!sheet.isOpen()) return;
  sheet.close({ force: !!force });
}

/* ==========================================================
   挂载
   ========================================================== */
export function mount(host) {
  host.insertAdjacentHTML('beforeend', HTML);

  el = document.getElementById('result');
  resultKicker = document.getElementById('resultKicker');
  resultTitle = document.getElementById('resultTitle');
  resultSub = document.getElementById('resultSub');
  resSize = document.getElementById('resSize');
  resTime = document.getElementById('resTime');
  resTimeLbl = document.getElementById('resTimeLbl');
  resHints = document.getElementById('resHints');
  btnAgain = document.getElementById('btnAgain');
  btnReplay = document.getElementById('btnReplay');
  btnPeek = document.getElementById('btnPeek');

  sheet = createSheet({
    id: 'result',
    wrap: el,
    inert: false,   // 整屏盖住 + 自己锁焦点，不用把 #app 设成 inert
    panel: el.querySelector('.result-card'),
    focusEl: function () { return btnAgain; },
    beforeOpen: paint,
    /* 输掉的那一屏不许关：只有 force（换盘 / 重开 / 按 N）能收掉 */
    canClose: function (opt) { return state.status !== 'lost' || !!(opt && opt.force); },
    afterClose: function () {
      boardEl.classList.remove('is-won');
      updateStats();
    },
    /* 结果层上按 N 直接开下一局（输掉的那屏也算「重试这一局」） */
    onKey: function (e) {
      if (e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      var lost = state.status === 'lost';
      sheet.close({ force: true });
      if (lost) retryGame(); else newGame(state.size);
    }
  });

  btnAgain.addEventListener('click', function () {
    var lost = state.status === 'lost';
    sheet.close({ force: true });
    if (lost) retryGame(); else newGame(state.size);
  });
  /* 重来这局：同一盘棋从零再下一遍（解开后才会露出来）。
   * 输了那一屏的主按钮本来就是「重试这一局」，这里就不重复了。 */
  btnReplay.addEventListener('click', function () {
    sheet.close({ force: true });
    retryGame();
  });
  btnPeek.addEventListener('click', function () {
    var lost = state.status === 'lost';
    sheet.close({ force: true });
    // 解开时是「看看棋盘」（结果层收掉就行）；输了就只有「换一局新的」这条路
    if (lost) newGame(state.size);
  });
  el.addEventListener('click', function (e) {
    if (e.target === el) sheet.close();
  });
}
