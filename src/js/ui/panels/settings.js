/* ============================================================================
 * panels/settings.js · 设置面板
 * ----------------------------------------------------------------------------
 * 上半部分（棋盘大小 / 目标难度 / 挑战）只写 pending，点「换一局」才落地；
 * 下半部分（自动打叉 / 淡化 / 音效…）即时生效。
 *
 * 这个文件自带四样东西，加一个开关不会再牵动别的模块：
 *   markup    —— 折叠在 HTML 字符串里，index.html 里没有它
 *   refs      —— 元素引用在 mount() 里取，不进 core/dom.js
 *   events    —— 面板内所有点击 / 粘贴 / 键盘都在这里绑
 *   open/close—— 走 core/sheet.js 的基座（inert / Esc / Tab 不用再各写一遍）
 *
 * 分享那一段的 UI 也在这里（代码框 / 复制 / 载入），数据那头在 ui/share.js：
 * 这边 mount() 时把元素交给它（bindShareUI）。
 * ========================================================================== */

import { newGame } from '../../app/puzzle.js';
import { audio, buzz, sfx } from '../../core/audio.js';
import { DIFF_BANDS, DIFF_ORDER, LIMIT_OPTIONS, bandRangeLabel, limitLabel, normalizeLimit, SIZE_MAX, SIZE_MIN } from '../../core/config.js';
import { btnSettings } from '../../core/dom.js';
import { createSheet } from '../../core/sheet.js';
import { pending, settings, state, view } from '../../core/state.js';
import { saveSettings } from '../../core/storage.js';
import { announce, clamp } from '../../core/utils.js';
import { decodeShare } from '../../game/share-code.js';
import { applyFadeNow } from '../fade.js';
import { updateHint } from '../hint.js';
import { render } from '../render.js';
import {
  bindShareUI, copyText, fitShareCode, isShareFocusHold, refreshShareCode,
  setShareStatus, shareReject, tryLoadShare
} from '../share.js';

export var HTML = /* html */ `
<div class="sheet-wrap" id="sheetWrap" hidden>
  <div class="sheet-backdrop" id="sheetBackdrop"></div>
  <div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle" tabindex="-1">
    <div class="sheet-head">
      <h2 id="sheetTitle">设置</h2>
      <button class="icon-btn" id="btnCloseSheet" type="button" aria-label="关闭设置">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18"></path>
        </svg>
      </button>
    </div>
    <p class="sheet-note" id="sheetNote">当前这局：8×8</p>

    <div class="stepper" id="sizeStepper">
      <div class="stepper-label">棋盘大小<small id="sizeHint">4×4 到 16×16，每盘唯一解</small></div>
      <div class="stepper-ctl">
        <button class="step-btn" type="button" id="sizeMinus" aria-label="减小棋盘">−</button>
        <span class="step-val" id="sizeVal">8</span>
        <button class="step-btn" type="button" id="sizePlus" aria-label="增大棋盘">+</button>
      </div>
    </div>

    <!-- 常用尺寸按钮按「目标难度」开放的范围重建，见 buildQuickRow -->
    <div class="quick-row" id="quickRow">
      <span class="q-label">常用</span>
    </div>

    <div class="diff-row">
      <div class="stepper-label">目标难度<small id="diffHint">选好档位，点下面「换一局」生效</small></div>
      <div class="diff-opts" id="diffOpts" role="group" aria-label="目标难度">
        <button class="dbtn is-on" type="button" data-level="any" aria-pressed="true">不限</button>
        <button class="dbtn" type="button" data-level="easy" aria-pressed="false">容易</button>
        <button class="dbtn" type="button" data-level="mid" aria-pressed="false">中等</button>
        <button class="dbtn" type="button" data-level="hard" aria-pressed="false">困难</button>
        <button class="dbtn" type="button" data-level="extreme" aria-pressed="false">极难</button>
      </div>
    </div>

    <p class="group-title" id="challengeTitle">挑战</p>

    <div class="challenge">
      <div class="limit-row">
        <div class="stepper-label">限时<small id="limitHint">开启后第一次操作开始倒计时，超时判负</small></div>
        <!-- 挡位按钮按 core/config.js 的 LIMIT_OPTIONS 生成，见 buildLimitOpts -->
        <div class="limit-opts" id="limitOpts" role="group" aria-label="限时"></div>
      </div>

      <div class="switch-row">
        <div class="stepper-label">禁用提示<small>这局的「提示」按钮不可用，只能自己推</small></div>
        <button class="switch" id="swNoHint" type="button" role="switch" aria-checked="false" aria-label="禁用提示"></button>
      </div>

      <div class="switch-row">
        <div class="stepper-label">禁用撤销<small>落错子不能退回，也没有重做</small></div>
        <button class="switch" id="swNoUndo" type="button" role="switch" aria-checked="false" aria-label="禁用撤销"></button>
      </div>
    </div>

    <div class="shuffle-row">
      <button class="btn btn-hint" id="btnShuffle" type="button">换一局</button>
      <p class="shuffle-hint" id="shuffleHint">换一幅新棋盘，上面的棋盘大小、目标难度与挑战一起生效</p>
    </div>

    <!-- 「更多选项」：默认只露出换一局和它上面那几组，开关与分享折在里面。
         展开状态只活在这一次会话（模块里的 moreOpen），刷新页面就收回去。 -->
    <button class="more-btn" id="btnMoreOpts" type="button" aria-expanded="false" aria-controls="sheetMore">
      <span id="moreOptsLabel">显示更多选项</span>
      <svg class="more-caret" width="12" height="12" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6 9l6 6 6-6"></path>
      </svg>
    </button>

    <div class="sheet-more" id="sheetMore" hidden>
      <div class="switch-row">
        <div class="stepper-label">自动打 ×<small>同行、同列、相邻格和整片同色块都会自动打叉</small></div>
        <button class="switch" id="swAuto" type="button" role="switch" aria-checked="true" aria-label="自动标记"></button>
      </div>

      <div class="switch-row">
        <div class="stepper-label">拖动按行列对齐<small>开着时长按拖动只涂一行或一列；关掉后可以顺着手指轨迹随意涂</small></div>
        <button class="switch" id="swAlignDrag" type="button" role="switch" aria-checked="true" aria-label="拖动按行列对齐"></button>
      </div>

      <div class="switch-row">
        <div class="stepper-label">淡化 ×<small>打过 × 的格子整格透成背景色，手停 0.5 秒后生效</small></div>
        <button class="switch" id="swFadeMark" type="button" role="switch" aria-checked="false" aria-label="淡化叉"></button>
      </div>

      <div class="switch-row">
        <div class="stepper-label">淡化皇后<small>放了皇后的格子整格透成背景色，换什么外观都一样</small></div>
        <button class="switch" id="swFadeQueen" type="button" role="switch" aria-checked="false" aria-label="淡化皇后"></button>
      </div>

      <div class="switch-row">
        <div class="stepper-label">冲突高亮<small>皇后互相冲突时闪红并连线</small></div>
        <button class="switch" id="swConflict" type="button" role="switch" aria-checked="true" aria-label="冲突高亮"></button>
      </div>

      <div class="switch-row">
        <div class="stepper-label">唯一位置提示<small>某行、某列或某个色块只剩一格没标 × 时，这格会亮一下</small></div>
        <button class="switch" id="swForced" type="button" role="switch" aria-checked="true" aria-label="唯一位置提示"></button>
      </div>

      <div class="switch-row">
        <div class="stepper-label">音效<small>落子、打叉、冲突与胜利提示音</small></div>
        <button class="switch" id="swSound" type="button" role="switch" aria-checked="true" aria-label="音效"></button>
      </div>

      <div class="switch-row">
        <div class="stepper-label">震动<small>手机上的触感反馈</small></div>
        <button class="switch" id="swHaptics" type="button" role="switch" aria-checked="true" aria-label="震动"></button>
      </div>

      <div class="share">
        <div class="share-head">
          <div class="stepper-label">分享这一局<small>复制代码发给朋友，他粘进来就能玩同一盘</small></div>
          <span class="share-tag" id="shareTag">8×8</span>
        </div>
        <textarea class="share-code" id="shareCode" rows="2" spellcheck="false"
          autocomplete="off" autocapitalize="off" autocorrect="off" wrap="soft"
          aria-label="棋盘代码：可以直接复制，也可以粘贴别人的代码"></textarea>
        <div class="share-btns">
          <button class="btn" id="btnCopyCode" type="button">复制代码</button>
          <button class="btn btn-hint" id="btnLoadCode" type="button">载入代码</button>
        </div>
        <p class="share-status" id="shareStatus" aria-live="polite"></p>
      </div>
    </div>
  </div>
</div>`;

var sheetWrap = null, sheet = null, sheetBackdrop = null;
var sheetNote = null, sizeHint = null, sizeMinus = null, sizePlus = null, sizeVal = null;
var quickRow = null, diffOpts = null, diffHint = null, limitOpts = null, limitHint = null;
var challengeTitle = null, btnShuffle = null, shuffleHint = null;
var btnMoreOpts = null, moreOptsLabel = null, sheetMore = null;
var shareCode = null, shareTag = null, shareStatus = null;

var sheetCtl = null;

/* 「更多选项」展开着没有。只活在这一次会话里：刷新页面就收回，不写盘——
 * 大多数人打开设置只是换一局，开关那一堆不该每次都摊在眼前。 */
var moreOpen = false;

/* ==========================================================
   挑战：限时挡位
   ----------------------------------------------------------
   按钮按 LIMIT_OPTIONS 生成，省得配置和面板各写一份、改一边忘另一边。
   ========================================================== */
function buildLimitOpts() {
  if (!limitOpts || limitOpts.childNodes.length) return;
  for (var i = 0; i < LIMIT_OPTIONS.length; i++) {
    var o = LIMIT_OPTIONS[i];
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'lbtn';
    b.dataset.limit = String(o.ms);
    b.textContent = o.label;
    b.setAttribute('aria-pressed', 'false');
    limitOpts.appendChild(b);
  }
}

/* 挑战只写 pending，跟棋盘大小 / 目标难度一个规矩：点「换一局」才落地。
 * 中途改完不换局就等于没改——开了限时又反悔，也不用担心这局被计时追着跑。 */
export function setPendingLimit(ms) {
  ms = normalizeLimit(ms);
  if (ms === pending.timeLimit) return;
  pending.timeLimit = ms;
  syncSheet();
  announce('限时：' + (ms ? limitLabel(ms) : '不限') + '（换一局后生效）');
}

/* 这一组里有哪些还没落地的改动，给「换一局」下方的说明与读屏播报共用 */
function challengeBits() {
  var bits = [];
  if ((pending.timeLimit || 0) !== (settings.timeLimit || 0)) {
    bits.push(pending.timeLimit ? '限时 ' + limitLabel(pending.timeLimit) : '不限时');
  }
  if (!!pending.noHint !== !!settings.noHint) {
    bits.push(pending.noHint ? '禁用提示' : '提示可用');
  }
  if (!!pending.noUndo !== !!settings.noUndo) {
    bits.push(pending.noUndo ? '禁用撤销' : '撤销可用');
  }
  return bits;
}

export function challengeSummary() {
  return challengeBits().join(' · ');
}

/* 换一局时把挑战的意向落到设置上：这是它唯一生效的时机 */
export function commitChallenge() {
  settings.timeLimit = normalizeLimit(pending.timeLimit);
  settings.noHint = !!pending.noHint;
  settings.noUndo = !!pending.noUndo;
  saveSettings();
}

/* ==========================================================
   面板内容
   ========================================================== */
/* 档位开放给玩家的尺寸区间。没选档位就是全量 4–16。
 * 这不是「限制」，是实测出来的可达性：4×4 里不存在困难的盘，
 * 16×16 也不会是容易的，把够不着的组合收起来比让人选完失望好。 */
function rangeOf(level) {
  var b = level && level !== 'any' ? DIFF_BANDS[level] : null;
  return b ? [b.lo, b.hi] : [SIZE_MIN, SIZE_MAX];
}

/* 「不限」时给几个常用尺寸；选了档位就把这一档开放的尺寸全摊开 */
var QUICK_ANY = [6, 8, 10, 12, 15];
var quickKey = '';

function buildQuickRow(lo, hi) {
  var key = lo + '-' + hi;
  if (key === quickKey) return;
  quickKey = key;

  var all = lo === SIZE_MIN && hi === SIZE_MAX;
  var sizes = all ? QUICK_ANY : [];
  for (var i = lo; !all && i <= hi; i++) sizes.push(i);

  var html = '<span class="q-label">' + (all ? '常用' : '可选') + '</span>';
  for (var k = 0; k < sizes.length; k++) {
    html += '<button class="qbtn" type="button" data-size="' + sizes[k] + '">' +
      sizes[k] + '×' + sizes[k] + '</button>';
  }
  quickRow.innerHTML = html;
}

export function syncSheet() {
  var diff = pending.difficulty;
  var target = diff && diff !== 'any' ? diff : null;
  var band = target ? DIFF_BANDS[target] : null;
  var rng = rangeOf(target);
  var lo = rng[0], hi = rng[1];

  /* 换了档位就把待生效尺寸夹回它开放的区间：选完「极难」还挂着 8×8 是要闹哪样 */
  pending.size = clamp(pending.size, lo, hi);

  sizeVal.textContent = String(pending.size);
  sizeMinus.disabled = pending.size <= lo;
  sizePlus.disabled = pending.size >= hi;
  buildQuickRow(lo, hi);

  /* 两行各说一件事，别重复：尺寸那行说「这一档能挑多大」，
   * 难度那行说「这一档的分数区间」+ 什么时候生效。 */
  sizeHint.textContent = band
    ? '「' + band.name + '」开放 ' + lo + '×' + lo + '–' + hi + '×' + hi
    : '4×4 到 16×16，每盘唯一解';

  sheetNote.textContent = '当前这局：' + state.size + '×' + state.size +
    (state.vibe ? ' · ' + state.vibe.level + ' ' + state.vibe.score.toFixed(1) : '') +
    (state.limit ? ' · 限时 ' + limitLabel(state.limit) : '');

  /* 区间两头都写出来：只写「7.0 分起」会让人以为越难越好，抽到 8.6 的极难盘也算数 */
  diffHint.textContent = band
    ? '「' + band.name + '」' + bandRangeLabel(band) + ' · 挑好尺寸，点「换一局」生效'
    : '选好档位，再挑一个尺寸，点下面「换一局」生效';

  var dbtns = diffOpts.querySelectorAll('.dbtn');
  for (var d = 0; d < dbtns.length; d++) {
    var on = dbtns[d].dataset.level === diff;
    dbtns[d].classList.toggle('is-on', on);
    dbtns[d].setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  setSwitch('swAuto', settings.autoMark);
  setSwitch('swAlignDrag', settings.alignDrag);
  setSwitch('swFadeMark', settings.fadeMark);
  setSwitch('swFadeQueen', settings.fadeQueen);
  setSwitch('swConflict', settings.conflict);
  setSwitch('swForced', settings.forced);
  setSwitch('swSound', settings.sound);
  setSwitch('swHaptics', settings.haptics);

  /* ---- 挑战（只写 pending，点「换一局」才生效） ---- */
  var lim = pending.timeLimit || 0;
  var applied = settings.timeLimit || 0;
  var lbtns = limitOpts.querySelectorAll('.lbtn');
  for (var l = 0; l < lbtns.length; l++) {
    var lon = parseInt(lbtns[l].dataset.limit, 10) === lim;
    lbtns[l].classList.toggle('is-on', lon);
    lbtns[l].setAttribute('aria-pressed', lon ? 'true' : 'false');
  }
  limitHint.textContent = lim !== applied
    ? '换一局后生效：' + (lim ? '限时 ' + limitLabel(lim) : '不限时')
    : (lim ? '本局限时 ' + limitLabel(lim) + '，超时判负，可以重试这一局'
        : '开启后第一次操作开始倒计时，超时判负');
  setSwitch('swNoHint', pending.noHint);
  setSwitch('swNoUndo', pending.noUndo);

  // 有没落地的改动就把组标题点亮，别让人以为已经生效了
  var cbits = challengeBits();
  if (challengeTitle) {
    challengeTitle.textContent = cbits.length ? '挑战 · 待换一局生效' : '挑战';
    challengeTitle.classList.toggle('is-pending', cbits.length > 0);
  }

  var chips = quickRow.querySelectorAll('.qbtn');
  for (var i = 0; i < chips.length; i++) {
    chips[i].classList.toggle('is-on', parseInt(chips[i].dataset.size, 10) === pending.size);
  }

  syncShuffleRow();
}

function setSwitch(id, on) {
  var el = document.getElementById(id);
  if (el) el.setAttribute('aria-checked', on ? 'true' : 'false');
}

/* 换一局按钮下方的说明：有改动没落地就把改动列出来，顺带把按钮点亮 */
export function syncShuffleRow() {
  var bits = [];
  var any = !pending.difficulty || pending.difficulty === 'any';
  if (any) {
    if (pending.size !== state.size) bits.push(pending.size + '×' + pending.size);
    if (state.diffApplied && state.diffApplied !== 'any') bits.push('不限难度');
  } else if (pending.difficulty !== state.diffApplied || pending.size !== state.size) {
    // 档位和尺寸现在是一起选的：哪一项变了都说清楚，别只报档位
    bits.push(DIFF_BANDS[pending.difficulty].name + ' ' + pending.size + '×' + pending.size);
  }
  bits = bits.concat(challengeBits());

  var hasPending = bits.length > 0;
  btnShuffle.classList.toggle('is-pending', hasPending);
  shuffleHint.classList.toggle('is-pending', hasPending);
  shuffleHint.textContent = hasPending
    ? '点这里生效：' + bits.join(' · ')
    : '换一幅新棋盘，上面的棋盘大小、目标难度与挑战一起生效';
}

/* ==========================================================
   「显示更多选项」
   ========================================================== */
export function setMoreOpen(open) {
  moreOpen = !!open;
  sheetMore.hidden = !moreOpen;
  btnMoreOpts.setAttribute('aria-expanded', moreOpen ? 'true' : 'false');
  moreOptsLabel.textContent = moreOpen ? '收起更多选项' : '显示更多选项';
  // 分享框刚从 hidden 里出来时高度是 0，露出来之后再量一次
  if (moreOpen) fitShareCode();
}

export function toggleMore() {
  setMoreOpen(!moreOpen);
  announce(moreOpen ? '已展开全部设置' : '已收起更多选项');
}

export function setPendingSize(n) {
  var rng = rangeOf(pending.difficulty);
  n = clamp(n, rng[0], rng[1]);   // 只能落在这一档开放过的尺寸里
  if (n === pending.size) return;
  pending.size = n;
  syncSheet();
}

/* ==========================================================
   开 / 关
   ========================================================== */
export function openSettings() { sheetCtl.open(); }
export function closeSettings() { sheetCtl.close(); }
export function isSettingsOpen() { return !!sheetCtl && sheetCtl.isOpen(); }

/* 从「没抽到够格的盘」那层跳过来时，面板要停在他刚才要的那一档上：
 * 打开时是从「这局实际是什么」起算的，可这时压根没装上盘，
 * 照原样开出来会变成「不限」，看着像是他的选择没被记住。 */
export function openSheetAt(difficulty, size) {
  sheetCtl.open();
  if (difficulty && difficulty !== 'any' && DIFF_BANDS[difficulty]) pending.difficulty = difficulty;
  if (size) pending.size = size;
  syncSheet();
}

/* ==========================================================
   挂载
   ========================================================== */
export function mount(host) {
  host.insertAdjacentHTML('beforeend', HTML);

  sheetWrap = document.getElementById('sheetWrap');
  sheet = document.getElementById('sheet');
  sheetBackdrop = document.getElementById('sheetBackdrop');
  sheetNote = document.getElementById('sheetNote');
  sizeHint = document.getElementById('sizeHint');
  sizeMinus = document.getElementById('sizeMinus');
  sizePlus = document.getElementById('sizePlus');
  sizeVal = document.getElementById('sizeVal');
  quickRow = document.getElementById('quickRow');
  diffOpts = document.getElementById('diffOpts');
  diffHint = document.getElementById('diffHint');
  limitOpts = document.getElementById('limitOpts');
  limitHint = document.getElementById('limitHint');
  challengeTitle = document.getElementById('challengeTitle');
  btnShuffle = document.getElementById('btnShuffle');
  shuffleHint = document.getElementById('shuffleHint');
  btnMoreOpts = document.getElementById('btnMoreOpts');
  moreOptsLabel = document.getElementById('moreOptsLabel');
  sheetMore = document.getElementById('sheetMore');
  shareCode = document.getElementById('shareCode');
  shareTag = document.getElementById('shareTag');
  shareStatus = document.getElementById('shareStatus');

  buildLimitOpts();

  /* 分享那一段的 UI 交给 ui/share.js：它只认这个对象，不认 id */
  bindShareUI({
    code: shareCode,
    status: shareStatus,
    tag: shareTag,
    sheetWrap: sheetWrap,
    close: closeSettings
  });

  sheetCtl = createSheet({
    id: 'settings',
    wrap: sheetWrap,
    panel: sheet,
    opener: btnSettings,
    /* 关掉之后把焦点还给触发按钮（设置 / 战绩这两层沿用原来的做法：
     * 直接 blur，键盘用户按 Esc 之后接着用 X / Q / Z 不会误触到按钮上） */
    focusOpener: false,
    beforeOpen: function () {
      // 每次打开都从「这一局实际是什么」重新起算，上次没落地的改动就作废
      pending.size = state.size;
      pending.difficulty = state.diffApplied || settings.difficulty;
      pending.timeLimit = settings.timeLimit || 0;
      pending.noHint = !!settings.noHint;
      pending.noUndo = !!settings.noUndo;
      syncSheet();
      setMoreOpen(moreOpen);   // 沿用这次会话里上次的展开状态
    },
    afterOpen: refreshShareCode   // 露出后再量高度，长代码才能自动撑开
  });

  btnSettings.addEventListener('click', openSettings);
  document.getElementById('btnCloseSheet').addEventListener('click', closeSettings);
  sheetBackdrop.addEventListener('click', closeSettings);
  /* 「显示更多选项」：只改面板露出多少，不碰任何设置 */
  btnMoreOpts.addEventListener('click', toggleMore);

  sizeMinus.addEventListener('click', function () {
    setPendingSize(pending.size - 1);
  });
  sizePlus.addEventListener('click', function () {
    setPendingSize(pending.size + 1);
  });
  quickRow.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.qbtn') : null;
    if (!btn) return;
    setPendingSize(parseInt(btn.dataset.size, 10));
  });

  /* 目标难度：只记选择，不碰正在下的这局——点「换一局」才生效。 */
  diffOpts.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.dbtn') : null;
    if (!btn) return;
    var lv = btn.dataset.level;
    if (DIFF_ORDER.indexOf(lv) < 0 || lv === pending.difficulty) return;

    pending.difficulty = lv;
    syncSheet();
    var band = lv !== 'any' ? DIFF_BANDS[lv] : null;
    announce(band
      ? '目标难度：' + band.name + '，' + bandRangeLabel(band) + '，开放 ' +
        band.lo + '×' + band.lo + '–' + band.hi + '×' + band.hi +
        '，先按 ' + pending.size + '×' + pending.size + ' 出（换一局后生效）'
      : '目标难度：不限（换一局后生效）');
  });

  /* 限时：跟尺寸 / 难度一样只记意向，点「换一局」才真的开始计时 */
  limitOpts.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.lbtn') : null;
    if (!btn) return;
    setPendingLimit(parseInt(btn.dataset.limit, 10));
    sfx('x');
    buzz(5);
  });

  /* 换一局：唯一会作废当前这局的动作，面板上半部分（尺寸 / 难度 / 挑战）的改动都在这里落地 */
  btnShuffle.addEventListener('click', function () {
    var lv = pending.difficulty && pending.difficulty !== 'any' ? pending.difficulty : 'any';
    var band = DIFF_BANDS[lv] || null;
    var challenge = challengeSummary();   // 落地前先记下来，好念给读屏

    settings.difficulty = lv;
    /* 尺寸由玩家在这一档开放的区间里挑（见 syncSheet），
     * 这里照抄就是；哪怕 pending 里残留了越界值，newGame 也会再夹一次。 */
    settings.size = clamp(pending.size, SIZE_MIN, SIZE_MAX);
    commitChallenge();
    saveSettings();

    closeSettings();
    newGame(settings.size);

    if (band) {
      announce('已换局：' + band.name + ' ' + settings.size + '×' + settings.size +
        (challenge ? '，挑战：' + challenge : ''));
    } else {
      announce('已换局：' + settings.size + '×' + settings.size +
        (challenge ? '，挑战：' + challenge : ''));
    }
  });

  /* ---- 开关：即时生效，跟音效 / 冲突高亮一个规矩 ---- */
  sheet.addEventListener('click', function (e) {
    var sw = e.target.closest ? e.target.closest('.switch') : null;
    if (!sw) return;
    var id = sw.id;
    if (id === 'swAuto') {
      settings.autoMark = !settings.autoMark;
      render();
    } else if (id === 'swAlignDrag') {
      // 拖动对齐只影响手指怎么涂，棋盘不用重画；提示行那句话跟着换
      settings.alignDrag = !settings.alignDrag;
      updateHint();
      announce(settings.alignDrag ? '拖动：按行列对齐' : '拖动：可以随意涂');
    } else if (id === 'swFadeMark' || id === 'swFadeQueen') {
      // 淡化是纯外观，不用重画格子：只加减一个类。拨开关的人正盯着效果，
      // 这里不跟 0.5 秒防抖，立刻落地（见 ui/fade.js 的 applyFadeNow）。
      if (id === 'swFadeMark') settings.fadeMark = !settings.fadeMark;
      else settings.fadeQueen = !settings.fadeQueen;
      applyFadeNow();
    } else if (id === 'swConflict') {
      settings.conflict = !settings.conflict;
      if (!settings.conflict) view.lastConflictCount = 0;
      render();
    } else if (id === 'swForced') {
      settings.forced = !settings.forced;
      render();
    } else if (id === 'swSound') {
      settings.sound = !settings.sound;
      if (settings.sound) { audio.init(); sfx('x'); }
    } else if (id === 'swHaptics') {
      settings.haptics = !settings.haptics;
      if (settings.haptics) buzz(12);
    } else if (id === 'swNoHint') {
      // 挑战这一组只写 pending：这一局的规则不改，换一局才生效
      pending.noHint = !pending.noHint;
      announce(pending.noHint ? '挑战：换一局后禁用提示' : '挑战：换一局后恢复提示');
    } else if (id === 'swNoUndo') {
      pending.noUndo = !pending.noUndo;
      announce(pending.noUndo ? '挑战：换一局后禁用撤销' : '挑战：换一局后恢复撤销');
    }
    syncSheet();
    saveSettings();
  });

  /* ---- 分享 ---- */
  document.getElementById('btnCopyCode').addEventListener('click', function () {
    var val = (shareCode.value || '').trim();
    if (!val) { shareReject('现在还没有棋盘可以分享'); return; }
    copyText(val, function (ok) {
      if (ok) {
        setShareStatus('已复制，发给朋友就能玩这一局', 'good');
        sfx('share');
        buzz(10);
        announce('棋盘代码已复制');
      } else {
        setShareStatus('这个浏览器不让自动复制，长按上面的代码手动全选吧', 'bad');
        shareCode.focus();
        shareCode.select();
      }
    });
  });

  document.getElementById('btnLoadCode').addEventListener('click', function () {
    tryLoadShare(shareCode.value);
  });

  shareCode.addEventListener('paste', function (e) {
    var text = '';
    try {
      var cb = e.clipboardData || window.clipboardData;
      text = cb ? (cb.getData('text') || '') : '';
    } catch (err) { text = ''; }
    if (!text) return;

    var out = decodeShare(text);
    if (out.ok) {
      // 粘的是一整串棋盘代码，直接开这一局
      e.preventDefault();
      shareCode.value = text.trim();
      tryLoadShare(text);
      return;
    }
    window.setTimeout(function () { setShareStatus(out.msg, 'bad'); }, 0);
  });

  shareCode.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      tryLoadShare(shareCode.value);
    }
  });

  // 手机上弹出键盘会盖住面板下半截，聚焦时把分享区顶到可视范围靠上
  shareCode.addEventListener('focus', function () {
    if (isShareFocusHold()) return;
    window.setTimeout(function () {
      if (!isSettingsOpen() || sheet.scrollHeight <= sheet.clientHeight + 4) return;
      var top = shareCode.parentNode.offsetTop - 12;
      if (sheet.scrollTop < top) sheet.scrollTop = top;
    }, 80);
  });

  shareCode.addEventListener('input', function () {
    if (shareStatus.classList.contains('is-bad')) setShareStatus('');
  });
}
