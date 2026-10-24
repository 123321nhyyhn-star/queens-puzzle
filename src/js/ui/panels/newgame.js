/* ============================================================================
 * panels/newgame.js · 换一局面板
 * ----------------------------------------------------------------------------
 * 顶栏那颗「新一局」开的就是这里：棋盘大小、目标难度、挑战，以及面板底下
 * 那颗真正换局的按钮。这三组都只写 pending，点「换一局」才落地——中途改完
 * 不换局就等于没改（开了限时又反悔，也不用担心这局被计时追着跑）。
 *
 * 为什么从设置里拆出来：这几项不是偏好，是「另开一局」。原先挤在设置面板里
 * 的时候，想换一局得先在一屏开关里找那颗按钮，位置不合直觉。
 *
 * 右上角那颗下载样子的图标是**载入代码**：朋友发来一串 QNS1-…，点它就读剪贴板
 * 装上那一盘（见 ui/share.js 的 loadShareFromClipboard）。它放在这一层而不是
 * 信息页，是因为「拿别人的代码开一局」的实质是换局，不是读这一局的读数。
 *
 * 这个文件自带四样东西（跟别的面板一个规矩）：
 *   markup    —— 折叠在 HTML 字符串里，index.html 里没有它
 *   refs      —— 元素引用在 mount() 里取，不进 core/dom.js
 *   events    —— 面板内所有点击都在这里绑
 *   open/close—— 走 core/sheet.js 的基座（inert / Esc / Tab 不用再各写一遍）
 * ========================================================================== */

import { newGame } from '../../app/puzzle.js';
import { buzz, sfx } from '../../core/audio.js';
import {
  DIFF_BANDS, DIFF_ORDER, LIFE_OPTIONS, LIMIT_OPTIONS, SIZE_MAX, SIZE_MIN, STEP_OPTIONS,
  bandRangeLabel, lifeLabel, limitLabel, normalizeLives, normalizeLimit, normalizeSteps,
  stepLimitLabel
} from '../../core/config.js';
import { btnNew } from '../../core/dom.js';
import { createSheet } from '../../core/sheet.js';
import { pending, settings, state } from '../../core/state.js';
import { saveSettings } from '../../core/storage.js';
import { announce, clamp } from '../../core/utils.js';
import { loadShareFromClipboard } from '../share.js';

export var HTML = /* html */ `
<div class="sheet-wrap" id="newWrap" hidden>
  <div class="sheet-backdrop" id="newBackdrop"></div>
  <div class="sheet" id="newSheet" role="dialog" aria-modal="true" aria-labelledby="newTitle" tabindex="-1">
    <div class="sheet-head">
      <h2 id="newTitle">新的一局</h2>
      <!-- 载入代码住在右上角：它的实质就是「换一局」，只是这盘是别人给的。
           点下去先读剪贴板（见 ui/share.js 的 loadShareFromClipboard）。 -->
      <div class="head-acts">
        <button class="icon-btn" id="btnLoadCode" type="button"
          title="载入代码" aria-label="载入别人发来的棋盘代码">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 4v10"></path>
            <path d="M8 10.5 12 14.5l4-4"></path>
            <path d="M5 17v1.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V17"></path>
          </svg>
        </button>
        <button class="icon-btn" id="btnCloseNew" type="button" aria-label="关闭新的一局">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18"></path>
          </svg>
        </button>
      </div>
    </div>
    <p class="sheet-note" id="newNote">当前这局：8×8</p>

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

      <div class="limit-row">
        <div class="stepper-label">步数限制<small id="stepHint">用完还没解开就算输；拖动连涂一整行只算一步</small></div>
        <!-- 挡位按钮按 core/config.js 的 STEP_OPTIONS 生成，见 buildStepOpts -->
        <div class="limit-opts" id="stepOpts" role="group" aria-label="步数限制"></div>
      </div>

      <div class="limit-row">
        <div class="stepper-label">标错惩罚<small id="lifeHint">皇后放到错的格子上会扣一条命，扣光判负</small></div>
        <!-- 挡位按钮按 core/config.js 的 LIFE_OPTIONS 生成，见 buildLifeOpts -->
        <div class="limit-opts" id="lifeOpts" role="group" aria-label="标错惩罚"></div>
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
  </div>
</div>`;

var wrap = null, sheet = null, backdrop = null, note = null;
var sizeHint = null, sizeMinus = null, sizePlus = null, sizeVal = null, quickRow = null;
var diffOpts = null, diffHint = null, limitOpts = null, limitHint = null;
var stepOpts = null, stepHint = null, lifeOpts = null, lifeHint = null;
var challengeTitle = null, btnShuffle = null, shuffleHint = null;

var ctl = null;

/* ==========================================================
   挑战：限时 / 步数限制挡位
   ----------------------------------------------------------
   按钮按 LIMIT_OPTIONS / STEP_OPTIONS 生成，省得配置和面板各写一份、
   改一边忘另一边。
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
  syncNew();
  announce('限时：' + (ms ? limitLabel(ms) : '不限') + '（换一局后生效）');
}

function buildStepOpts() {
  if (!stepOpts || stepOpts.childNodes.length) return;
  for (var i = 0; i < STEP_OPTIONS.length; i++) {
    var o = STEP_OPTIONS[i];
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'lbtn';
    b.dataset.steps = String(o.steps);
    b.textContent = o.label;
    b.setAttribute('aria-pressed', 'false');
    stepOpts.appendChild(b);
  }
}

export function setPendingSteps(n) {
  n = normalizeSteps(n);
  if (n === pending.stepLimit) return;
  pending.stepLimit = n;
  syncNew();
  announce('步数限制：' + (n ? stepLimitLabel(n) : '不限') + '（换一局后生效）');
}

/* 标错惩罚：这一局给几条命。跟限时 / 步数一样只写 pending。
 * 0 是「不惩罚」（默认），不是「0 条命」——写文案时别把这两件事混起来。 */
function buildLifeOpts() {
  if (!lifeOpts || lifeOpts.childNodes.length) return;
  for (var i = 0; i < LIFE_OPTIONS.length; i++) {
    var o = LIFE_OPTIONS[i];
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'lbtn';
    b.dataset.lives = String(o.lives);
    b.textContent = o.label;
    b.setAttribute('aria-pressed', 'false');
    lifeOpts.appendChild(b);
  }
}

export function setPendingLives(n) {
  n = normalizeLives(n);
  if (n === pending.lifeLimit) return;
  pending.lifeLimit = n;
  syncNew();
  announce('标错惩罚：' + (n ? lifeLabel(n) : '不惩罚') + '（换一局后生效）');
}

/* 这一组里有哪些还没落地的改动，给「换一局」下方的说明与读屏播报共用 */
function challengeBits() {
  var bits = [];
  if ((pending.timeLimit || 0) !== (settings.timeLimit || 0)) {
    bits.push(pending.timeLimit ? '限时 ' + limitLabel(pending.timeLimit) : '不限时');
  }
  if ((pending.stepLimit || 0) !== (settings.stepLimit || 0)) {
    bits.push(pending.stepLimit ? '限步 ' + stepLimitLabel(pending.stepLimit) : '不限步数');
  }
  if ((pending.lifeLimit || 0) !== (settings.lifeLimit || 0)) {
    bits.push(pending.lifeLimit ? '标错扣命 ' + pending.lifeLimit + ' 条' : '不惩罚');
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
  settings.stepLimit = normalizeSteps(pending.stepLimit);
  settings.lifeLimit = normalizeLives(pending.lifeLimit);
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

export function syncNew() {
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

  note.textContent = '当前这局：' + state.size + '×' + state.size +
    (state.vibe ? ' · ' + state.vibe.level + ' ' + state.vibe.score.toFixed(1) : '') +
    (state.limit ? ' · 限时 ' + limitLabel(state.limit) : '') +
    (state.stepLimit ? ' · 限步 ' + stepLimitLabel(state.stepLimit) : '') +
    (state.lifeLimit ? ' · 标错 ' + state.lifeLimit + ' 条命' : '');

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

  /* 步数限制：跟限时同一个读法，也跟前一排一样只写 pending */
  var sl = pending.stepLimit || 0;
  var slApplied = settings.stepLimit || 0;
  var sbtns = stepOpts.querySelectorAll('.lbtn');
  for (var s = 0; s < sbtns.length; s++) {
    var son = parseInt(sbtns[s].dataset.steps, 10) === sl;
    sbtns[s].classList.toggle('is-on', son);
    sbtns[s].setAttribute('aria-pressed', son ? 'true' : 'false');
  }
  stepHint.textContent = sl !== slApplied
    ? '换一局后生效：' + stepLimitLabel(sl)
    : (sl ? '本局限步 ' + stepLimitLabel(sl) + '，用完判负，可以重试这一局'
        : '用完还没解开就算输；拖动连涂一整行只算一步');

  /* 标错惩罚：同一个读法，也只写 pending */
  var lv = pending.lifeLimit || 0;
  var lvApplied = settings.lifeLimit || 0;
  var lbts = lifeOpts.querySelectorAll('.lbtn');
  for (var q = 0; q < lbts.length; q++) {
    var qon = parseInt(lbts[q].dataset.lives, 10) === lv;
    lbts[q].classList.toggle('is-on', qon);
    lbts[q].setAttribute('aria-pressed', qon ? 'true' : 'false');
  }
  lifeHint.textContent = lv !== lvApplied
    ? '换一局后生效：' + (lv ? lifeLabel(lv) : '不惩罚')
    : (lv ? '本局 ' + lifeLabel(lv) + '，放错一次扣一条，可以重试这一局'
        : '皇后放到错的格子上会扣一条命，扣光判负');

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

export function setPendingSize(n) {
  var rng = rangeOf(pending.difficulty);
  n = clamp(n, rng[0], rng[1]);   // 只能落在这一档开放过的尺寸里
  if (n === pending.size) return;
  pending.size = n;
  syncNew();
}

/* ==========================================================
   开 / 关
   ========================================================== */
export function openNew() { ctl.open(); }
export function closeNew() { ctl.close(); }
export function isNewOpen() { return !!ctl && ctl.isOpen(); }

/* 从「没抽到够格的盘」那层跳过来时，面板要停在他刚才要的那一档上：
 * 打开时是从「这局实际是什么」起算的，可这时压根没装上盘，
 * 照原样开出来会变成「不限」，看着像是他的选择没被记住。 */
export function openSheetAt(difficulty, size) {
  ctl.open();
  if (difficulty && difficulty !== 'any' && DIFF_BANDS[difficulty]) pending.difficulty = difficulty;
  if (size) pending.size = size;
  syncNew();
}

/* ==========================================================
   挂载
   ========================================================== */
export function mount(host) {
  host.insertAdjacentHTML('beforeend', HTML);

  wrap = document.getElementById('newWrap');
  sheet = document.getElementById('newSheet');
  backdrop = document.getElementById('newBackdrop');
  note = document.getElementById('newNote');
  sizeHint = document.getElementById('sizeHint');
  sizeMinus = document.getElementById('sizeMinus');
  sizePlus = document.getElementById('sizePlus');
  sizeVal = document.getElementById('sizeVal');
  quickRow = document.getElementById('quickRow');
  diffOpts = document.getElementById('diffOpts');
  diffHint = document.getElementById('diffHint');
  limitOpts = document.getElementById('limitOpts');
  limitHint = document.getElementById('limitHint');
  stepOpts = document.getElementById('stepOpts');
  stepHint = document.getElementById('stepHint');
  lifeOpts = document.getElementById('lifeOpts');
  lifeHint = document.getElementById('lifeHint');
  challengeTitle = document.getElementById('challengeTitle');
  btnShuffle = document.getElementById('btnShuffle');
  shuffleHint = document.getElementById('shuffleHint');

  buildLimitOpts();
  buildStepOpts();
  buildLifeOpts();

  ctl = createSheet({
    id: 'newgame',
    wrap: wrap,
    panel: sheet,
    opener: btnNew,
    /* 关掉之后直接 blur：键盘用户按 Esc 之后接着用 X / Q / Z 不会误触到按钮上 */
    focusOpener: false,
    beforeOpen: function () {
      // 每次打开都从「这一局实际是什么」重新起算，上次没落地的改动就作废
      pending.size = state.size;
      pending.difficulty = state.diffApplied || settings.difficulty;
      pending.timeLimit = settings.timeLimit || 0;
      pending.stepLimit = settings.stepLimit || 0;
      pending.lifeLimit = settings.lifeLimit || 0;
      pending.noHint = !!settings.noHint;
      pending.noUndo = !!settings.noUndo;
      syncNew();
    }
  });

  document.getElementById('btnCloseNew').addEventListener('click', closeNew);
  backdrop.addEventListener('click', closeNew);

  /* 载入代码：读剪贴板 → 校验 → 装上那一盘（面板由 share.js 自己收）。
   * 校验不过就在提示行说原因，这一层不会掉。 */
  document.getElementById('btnLoadCode').addEventListener('click', function () {
    loadShareFromClipboard();
  });

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
    syncNew();
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

  /* 步数限制：同一套规矩，只记意向 */
  stepOpts.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.lbtn') : null;
    if (!btn) return;
    setPendingSteps(parseInt(btn.dataset.steps, 10));
    sfx('x');
    buzz(5);
  });

  /* 标错惩罚：同一套规矩，只记意向 */
  lifeOpts.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.lbtn') : null;
    if (!btn) return;
    setPendingLives(parseInt(btn.dataset.lives, 10));
    sfx('x');
    buzz(5);
  });

  /* 换一局：唯一会作废当前这局的动作，面板里三组改动都在这里落地 */
  btnShuffle.addEventListener('click', function () {
    var lv = pending.difficulty && pending.difficulty !== 'any' ? pending.difficulty : 'any';
    var band = DIFF_BANDS[lv] || null;
    var challenge = challengeSummary();   // 落地前先记下来，好念给读屏

    settings.difficulty = lv;
    /* 尺寸由玩家在这一档开放的区间里挑（见 syncNew），
     * 这里照抄就是；哪怕 pending 里残留了越界值，newGame 也会再夹一次。 */
    settings.size = clamp(pending.size, SIZE_MIN, SIZE_MAX);
    commitChallenge();
    saveSettings();

    closeNew();
    newGame(settings.size);

    if (band) {
      announce('已换局：' + band.name + ' ' + settings.size + '×' + settings.size +
        (challenge ? '，挑战：' + challenge : ''));
    } else {
      announce('已换局：' + settings.size + '×' + settings.size +
        (challenge ? '，挑战：' + challenge : ''));
    }
  });

  /* 挑战那两颗开关：跟限时 / 步数一样只写 pending，换一局才生效。 */
  sheet.addEventListener('click', function (e) {
    var sw = e.target.closest ? e.target.closest('.switch') : null;
    if (!sw) return;
    if (sw.id === 'swNoHint') {
      pending.noHint = !pending.noHint;
      announce(pending.noHint ? '挑战：换一局后禁用提示' : '挑战：换一局后恢复提示');
    } else if (sw.id === 'swNoUndo') {
      pending.noUndo = !pending.noUndo;
      announce(pending.noUndo ? '挑战：换一局后禁用撤销' : '挑战：换一局后恢复撤销');
    } else {
      return;
    }
    syncNew();
  });
}
