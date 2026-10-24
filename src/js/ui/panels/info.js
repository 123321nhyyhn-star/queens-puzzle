/* ============================================================================
 * panels/info.js · 本局信息页
 * ----------------------------------------------------------------------------
 * 顶栏那条信息条点开的就是这里。四张读数卡片（棋盘 / 用时 / 皇后 / 难度）
 * 跟信息条一一对应，步数那张单独占满一行（它记的是「一共走了几步」，
 * 跟撤销栈不是一个数），下面接难度构成。
 *
 * 用时这张要跟着跑：面板开着的时候计时还在走，读数停住会让人以为卡了。
 * 由 main.js 的 250ms 心跳在面板打开时调 tick()。
 *
 * 信息条上那一段难度读数不在这里（见 ui/difficulty.js）：那是骨架上的东西，
 * 面板关着也得更新。
 *
 * 「分享这一局」也住在这里（原先折在设置面板里）：它是「这一局」的属性，不是
 * 偏好，所以常显、不用折叠——就放在读数卡片下面，想分享的人不用先滑过一整屏分析。
 * 这一块只有一行：说明 + 一颗复制钮。**没有代码框**：那串码不显示、也不接受输入，
 * 载入只有一处——「新的一局」面板右上角那颗图标（panels/newgame.js）。
 * 码本身由 ui/share.js 现算（currentShareCode），这边只管 markup 与交互。
 * ========================================================================== */

import { elapsedMs, limitRemaining } from '../../core/clock.js';
import { limitLabel } from '../../core/config.js';
import { btnHud } from '../../core/dom.js';
import { createSheet } from '../../core/sheet.js';
import { state, view } from '../../core/state.js';
import { formatTime, announce } from '../../core/utils.js';
import { sfx, buzz } from '../../core/audio.js';
import { queenCount } from '../../game/rules.js';
import {
  bindShareUI, clearShareStatus, copyText, currentShareCode, setShareStatus, shareReject
} from '../share.js';

export var HTML = /* html */ `
<div class="sheet-wrap" id="diffWrap" hidden>
  <div class="sheet-backdrop" id="diffBackdrop"></div>
  <div class="sheet info-sheet" id="diffSheet" role="dialog" aria-modal="true" aria-labelledby="diffTitle" tabindex="-1">
    <div class="sheet-head">
      <h2 id="diffTitle">本局信息</h2>
      <button class="icon-btn" id="btnCloseDiff" type="button" aria-label="关闭本局信息">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18"></path>
        </svg>
      </button>
    </div>
    <p class="sheet-note">棋盘上方那一条里的几项，这里都摊开说明</p>

    <!-- 卡片的顺序与顶栏信息条一致，点进来不用重新找 -->
    <div class="info-grid">
      <div class="info-card">
        <span class="info-k">棋盘</span>
        <b class="info-v" id="infoSize">8×8</b>
        <span class="info-s" id="infoSizeSub">8 个色块 · 唯一解</span>
      </div>
      <div class="info-card">
        <span class="info-k">用时</span>
        <b class="info-v" id="infoTime">00:00</b>
        <span class="info-s" id="infoTimeSub">落第一子才开始计时</span>
      </div>
      <div class="info-card">
        <span class="info-k">皇后</span>
        <b class="info-v" id="infoQueens">0/8</b>
        <span class="info-s" id="infoQueensSub">还差 8 只</span>
      </div>
      <div class="info-card" id="infoDiffCard">
        <span class="info-k">难度</span>
        <b class="info-v"><span class="info-level" id="diffBadge" data-tone="mid">中等</span> <em id="diffBig">5.2</em></b>
        <span class="info-s" id="infoDiffSub">本局难度评估</span>
      </div>
      <!-- 步数占满一整行：它答的是「这一局一共走了多少步」，跟上面四项读数不是同一类 -->
      <div class="info-card is-wide">
        <span class="info-k">步数</span>
        <b class="info-v" id="infoSteps">0</b>
        <span class="info-s" id="infoStepsSub">还没有动手</span>
      </div>
    </div>

    <!-- 分享这一局：只剩一行——左边一句说明，右上角一颗**复制**。
         这一页不显示那串码，也不接受输入（没有代码框、没有粘贴开局）。
         「拿别人的代码开一局」是换局，那颗载入图标在「新的一局」的右上角，
         那是全应用唯一的入口。 -->
    <div class="share">
      <div class="share-head">
        <div class="stepper-label">分享这一局<small>复制发给朋友，他在「新的一局」载入就能玩</small></div>
        <button class="icon-btn share-copy" id="btnCopyCode" type="button"
          title="复制代码" aria-label="复制这一局的棋盘代码">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2.6"></rect>
            <path d="M15.5 5.5h-8a3 3 0 0 0-3 3v8"></path>
          </svg>
        </button>
      </div>
      <p class="share-status" id="shareStatus" aria-live="polite"></p>
    </div>

    <p class="group-title" id="diffGroupTitle">难度构成</p>

    <p class="diff-lead" id="diffLead"></p>

    <!-- 每一行右端的问号按需展开该技巧的解释（见下面 DIFF_ROWS） -->
    <div class="diff-steps" id="diffSteps"></div>

    <!-- 读数与实际推演的差异：跟名词解释分开，这里是「这些数字不能当什么用」 -->
    <div class="diff-legend" id="diffLegend">
      <b class="dl-title">读数与实际的差异</b>
      <ol class="dl-list">
        <li>次数来自程序按固定顺序走<strong>一条</strong>参考路径，不是这盘的唯一解法；换个起手，同一只皇后可能记在别的技巧下，试推次数也能差出数倍。</li>
        <li>「试错落子」通常为 0：试推在 1200 次以内基本都能推完，非 0 才表示连试推都推不动。</li>
        <li>分数只由边长、试推次数、开局推进率算出，与用时、步数无关；尺寸只决定底分，13×13 不一定比 12×12 难。</li>
      </ol>
    </div>

    <!-- 面板底下不再挂按钮：这一页只「读」，改尺寸 / 难度与载入别人代码都在
         「新的一局」那一层。关掉就靠右上角的 X / Esc / 点背景。 -->
  </div>
</div>`;

var diffWrap = null, diffSheet = null, diffBackdrop = null;

var infoSize = null, infoSizeSub = null, infoTime = null, infoTimeSub = null;
var infoQueens = null, infoQueensSub = null, infoSteps = null, infoStepsSub = null;
var infoDiffCard = null, infoDiffSub = null;
var diffGroupTitle = null, diffBig = null, diffBadge = null;
var diffLead = null, diffSteps = null, diffLegend = null;

var shareStatus = null;

var sheet = null;

/* ==========================================================
   难度构成的五行
   ----------------------------------------------------------
   engine/difficulty.js 会用同一套推理器把这盘推一遍：先纯逻辑，卡住了就
   假设试推，再不行才试错落子。这里只负责展示。

   名词解释不再常显在面板上（一屏五行小字，把读数挤没了）：每一行右端一枚
   问号，点开 / 悬浮才展开那一句。列在这里的 tip 是唯一的出处。
   ========================================================== */
var DIFF_ROWS = [
  { key: 'openSingles', name: '开局可定', cls: 'is-key',
    tip: '第一轮纯逻辑推导定下的皇后数：唯一候选，以及被区块封锁、集合计数解锁的格。' +
      '之后靠假设试推才解锁的格不计入。0 表示开局没有任何一格能被直接确定。' },
  { key: 'block', name: '区块封锁', cls: '',
    tip: '某色块的候选格全部落在同一行（或同一列）时，这一行其余格可以全部排除。计的是这类推理发生的次数。' },
  { key: 'count', name: '集合计数', cls: '',
    tip: 'k 个色块的候选格一共只落在 k 行（或 k 列）里，这 k 行只能由这些色块占用，其余格全部排除。k ≥ 2。' },
  { key: 'probe', name: '假设试推', cls: 'is-probe',
    tip: '假设某一格放皇后，再用纯逻辑往下推，推出矛盾就划掉这一格。计的是假设过的次数，上限 1200 次。' },
  { key: 'guess', name: '试错落子', cls: 'is-guess',
    tip: '假设试推也推不动时才记录：直接落一只皇后再看是否成立。前面的试推绝大多数盘都能推完，所以这一行通常为 0。' }
];

/* ==========================================================
   四张读数卡片
   ========================================================== */
export function paintInfo() {
  if (!sheet || !sheet.isOpen() || !state.size) return;
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
  if (state.status === 'lost') {
    /* 输的原因不同，说法也不同（lostBy）：命用尽 / 步数用尽 / 超时 */
    infoQueensSub.textContent = state.lostBy === 'lives' ? '命用完了，这局没解开'
      : state.lostBy === 'steps' ? '步数用完了，这局没解开'
        : '时间到，这局没解开';
  }
  else if (q >= n) infoQueensSub.textContent = '放满了，对一下行列与色块';
  else infoQueensSub.textContent = '还差 ' + (n - q) + ' 只';

  /* 步数 = 这一局一共落了几次笔（state.steps）。它跟撤销栈是两个数：
   * 撤销栈封顶 UNDO_MAX、刷新后清空，答的是「还能退几步」；这个数不封顶、
   * 跟着存档走，答的是「这一局走到哪儿了」。小字就在两者之间说清关系。 */
  var st = state.steps || 0;
  var depth = view.undo.length;
  infoSteps.textContent = String(st);
  if (state.status === 'lost' && state.lostBy === 'steps') {
    infoStepsSub.textContent = '限步 ' + state.stepLimit + ' 步用完了，这局没解开';
  } else if (state.status === 'lost') {
    // 输掉的局步数也照实说：它是这一局留下的读数，不是「还剩多少」
    infoStepsSub.textContent = (state.lostBy === 'lives' ? '命用完了' : '时间到') +
      '，这局走了 ' + st + ' 步';
  } else if (state.status === 'won') {
    infoStepsSub.textContent = '这局一共走了 ' + st + ' 步';
  } else if (state.stepLimit) {
    infoStepsSub.textContent = '限步 ' + state.stepLimit + ' 步 · 还剩 ' +
      Math.max(0, state.stepLimit - st) + ' 步';
  } else if (!st) {
    infoStepsSub.textContent = '还没有动手';
  } else {
    infoStepsSub.textContent = '撤销不退这个数' + (depth ? ' · 可退 ' + depth + ' 步' : '');
  }
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
      '<span class="ds-n">×' + n2 + '</span>' +
      '<button class="ds-help" type="button" aria-expanded="false"' +
        ' aria-label="' + row.name + '的说明" aria-describedby="dsTip-' + row.key + '">?</button>' +
      '<span class="ds-tip" id="dsTip-' + row.key + '" role="tooltip">' + row.tip + '</span>' +
      '</div>';
  }
  diffSteps.innerHTML = html;

  /* 这一行只报事实（尺寸 / 试推次数 / 纯逻辑能定几只），不写「不猜不试」这类
   * 结论——结论会跟玩家的实际推演打架。试推次数取 steps.probe，与下面那一行
   * 是同一个数；分数用的是另一次独立统计，差异写进面板底部的说明。
   * 措辞控制在一行内：16×16 多出一行就会把面板顶出 92svh。 */
  var n = v.metrics ? v.metrics.n : (v.steps && v.steps.n) || 0;
  var lead = n + '×' + n + ' · 试推 ' + (s.probe || 0) + ' 次 · ';
  lead += '纯逻辑可定 ' + Math.min(s.openSingles || 0, n) + '/' + n + ' 只';
  if (s.guess) lead += ' · 试错落子 ' + s.guess + ' 次';
  diffLead.textContent = lead;
}

/* ==========================================================
   技巧说明（每行的问号）
   ----------------------------------------------------------
   点一下展开，再点收起；点同一处之外的地方也收起。
   桌面端还有 :hover（见 styles/panels/info.css），触屏只有点击这一路。
   ========================================================== */
export function clearDiffTips() {
  var on = diffSteps.querySelectorAll('.diff-step.is-on');
  for (var i = 0; i < on.length; i++) {
    on[i].classList.remove('is-on');
    var b = on[i].querySelector('.ds-help');
    if (b) b.setAttribute('aria-expanded', 'false');
  }
}

/* 返回是否吃掉了这次点击（点在某个问号或已展开的说明上） */
export function toggleDiffTip(target) {
  var btn = target && target.closest ? target.closest('.ds-help') : null;
  if (!btn) {
    if (target && target.closest && target.closest('.ds-tip')) return true;
    clearDiffTips();
    return false;
  }
  var row = btn.closest('.diff-step');
  var open = row.classList.contains('is-on');
  clearDiffTips();
  if (open) return true;
  row.classList.add('is-on');
  btn.setAttribute('aria-expanded', 'true');
  return true;
}

/* ==========================================================
   开关
   ========================================================== */
export function openDiff() { sheet.open(); }
export function closeDiff() { sheet.close(); }
export function isDiffOpen() { return !!sheet && sheet.isOpen(); }
/* main.js 的 250ms 心跳调它：面板开着时用时读数要跟着走 */
export function tick() { if (sheet && sheet.isOpen()) paintInfo(); }

/* ==========================================================
   挂载
   ========================================================== */
export function mount(host) {
  host.insertAdjacentHTML('beforeend', HTML);

  diffWrap = document.getElementById('diffWrap');
  diffSheet = document.getElementById('diffSheet');
  diffBackdrop = document.getElementById('diffBackdrop');
  infoSize = document.getElementById('infoSize');
  infoSizeSub = document.getElementById('infoSizeSub');
  infoTime = document.getElementById('infoTime');
  infoTimeSub = document.getElementById('infoTimeSub');
  infoQueens = document.getElementById('infoQueens');
  infoQueensSub = document.getElementById('infoQueensSub');
  infoSteps = document.getElementById('infoSteps');
  infoStepsSub = document.getElementById('infoStepsSub');
  infoDiffCard = document.getElementById('infoDiffCard');
  infoDiffSub = document.getElementById('infoDiffSub');
  diffGroupTitle = document.getElementById('diffGroupTitle');
  diffBig = document.getElementById('diffBig');
  diffBadge = document.getElementById('diffBadge');
  diffLead = document.getElementById('diffLead');
  diffSteps = document.getElementById('diffSteps');
  diffLegend = document.getElementById('diffLegend');
  shareStatus = document.getElementById('shareStatus');

  /* 分享那一段只剩一行状态字了（没有代码框）：交给 ui/share.js，它不认 id */
  bindShareUI({ status: shareStatus, sheetWrap: diffWrap });

  sheet = createSheet({
    id: 'info',
    wrap: diffWrap,
    panel: diffSheet,
    opener: btnHud,
    /* 不管从哪儿关（Esc / 关闭按钮 / 点背景 / 知道了），焦点都回信息条：
     * 那是玩家点进来的地方，回去不用重新 Tab 一遍。 */
    focusOpener: true,
    /* 每次打开都把上一次那行「已复制」擦掉 */
    beforeOpen: function () { renderDiff(); paintInfo(); clearShareStatus(); },
    beforeClose: clearDiffTips
  });

  btnHud.addEventListener('click', openDiff);
  document.getElementById('btnCloseDiff').addEventListener('click', closeDiff);
  diffBackdrop.addEventListener('click', closeDiff);

  /* 难度构成每行右端的问号：点开那一行的说明，点面板别处收起。
   * 桌面端另有 :hover（styles/panels/info.css），这里是触屏的唯一一路。 */
  diffSheet.addEventListener('click', function (e) { toggleDiffTip(e.target); });

  /* ---- 分享这一局：右上角那颗图标负责复制 ---- */
  document.getElementById('btnCopyCode').addEventListener('click', function () {
    var val = currentShareCode();
    if (!val) { shareReject('现在还没有棋盘可以分享'); return; }
    copyText(val, function (ok) {
      if (ok) {
        setShareStatus('已复制，发给朋友就能玩这一局', 'good');
        sfx('share');
        buzz(10);
        announce('棋盘代码已复制');
      } else {
        setShareStatus('这个浏览器不让自动复制，换个浏览器再试', 'bad');
      }
    });
  });

  /* 代码框是只读的：这一页不接受任何输入，也没有粘贴开局 / Ctrl+Enter 这类暗门。
   * 载入只有一处——「新的一局」右上角那颗图标（ui/share.js 的
   * loadShareFromClipboard）。这里只留「选中了就能复制」这一件原生行为。 */
}
