/* ============================================================================
 * panels/records.js · 战绩与排行榜
 * ----------------------------------------------------------------------------
 * 面板只读 core/records.js 里的数据，自己不存东西：所有改动（增删）都走那边，
 * 这里只负责画出来、把点击翻译成动作。
 *
 * 列表分页：一条记录一张缩略图，20 条一屏画完就停，剩下的点「显示更多」。
 * 上限 300 条的时候一次性全画会把面板卡住，而绝大多数时候没人往下翻那么多。
 *
 * 面板自己的临时视图（看的是哪一页、哪个筛选、哪条展开着）放在这个文件里，
 * 不进 core/state.js——只有这一个面板会读它，每次打开重置，不写盘。
 * ========================================================================== */

import { buzz, sfx } from '../../core/audio.js';
import { DIFF_BANDS, LIMIT_OPTIONS, RECORD_PAGE, RECORD_TOP, limitLabel } from '../../core/config.js';
import { btnRecords } from '../../core/dom.js';
import * as recs from '../../core/records.js';
import { createSheet } from '../../core/sheet.js';
import { state } from '../../core/state.js';
import { announce, formatTime } from '../../core/utils.js';
import { boardPreviewUri } from '../../game/preview.js';
import { encodeShare } from '../../game/share-code.js';
import { tryLoadShare } from '../share.js';

export var HTML = /* html */ `
<div class="sheet-wrap" id="recWrap" hidden>
  <div class="sheet-backdrop" id="recBackdrop"></div>
  <div class="sheet rec-sheet" id="recSheet" role="dialog" aria-modal="true" aria-labelledby="recTitle" tabindex="-1">
    <div class="sheet-head">
      <h2 id="recTitle">战绩</h2>
      <button class="icon-btn" id="btnCloseRec" type="button" aria-label="关闭战绩">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18"></path>
        </svg>
      </button>
    </div>

    <div class="rec-tabs" role="tablist" aria-label="战绩视图">
      <button class="rtab is-on" id="tabRecs" type="button" role="tab" aria-selected="true" aria-controls="paneRecs">记录<i id="recTotal"></i></button>
      <button class="rtab" id="tabBoard" type="button" role="tab" aria-selected="false" aria-controls="paneBoard">排行榜</button>
    </div>

    <div class="rec-pane" id="paneRecs" role="tabpanel" aria-labelledby="tabRecs">
      <p class="rec-hint">解开或超时都会记一局。点开一条能看棋盘、复制分享码，或者原样再玩一遍。</p>
      <div class="rec-list" id="recList"></div>
      <p class="rec-empty" id="recEmpty" hidden>还没有战绩。解完一局就会记在这里。</p>
      <button class="btn rec-more" id="btnMoreRecs" type="button" hidden>显示更多</button>
    </div>

    <div class="rec-pane" id="paneBoard" role="tabpanel" aria-labelledby="tabBoard" hidden>
      <p class="group-title">限时</p>
      <div class="rec-chips" id="limChips" role="group" aria-label="按限时筛选"></div>
      <p class="group-title">难度</p>
      <div class="rec-chips" id="lvChips" role="group" aria-label="按难度筛选"></div>
      <p class="board-note" id="boardNote"></p>
      <div class="rec-list" id="boardList"></div>
      <p class="rec-empty" id="boardEmpty" hidden>这组还没有成绩。</p>
    </div>

    <p class="rec-status" id="recStatus" aria-live="polite"></p>
    <button class="btn-text rec-clear" id="btnClearRecs" type="button" hidden>清空全部记录</button>
  </div>
</div>`;

var recWrap = null, recSheet = null, recBackdrop = null;
var tabRecs = null, tabBoard = null, recTotal = null;
var paneRecs = null, paneBoard = null, recList = null, recEmpty = null, btnMoreRecs = null;
var limChips = null, lvChips = null, boardNote = null, boardList = null, boardEmpty = null;
var recStatus = null, btnClearRecs = null;

var sheet = null;

/* 面板自己的临时视图：看的是哪一页、哪个筛选、哪条展开着。
 * 每次打开重置，不写盘。 */
var v = { tab: 'list', limit: 0, level: 'mid', openId: '', shown: RECORD_PAGE };

/* ==========================================================
   小工具
   ========================================================== */
function pad2(n) { return n < 10 ? '0' + n : String(n); }

/** 「今天 21:04」/「昨天 09:12」/「10月20日 21:04」——最近的更爱说相对时间。 */
function dateText(at) {
  var d = new Date(at), now = new Date();
  if (!isFinite(d.getTime())) return '';
  var hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  var day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  var diff = Math.round((today - day) / 86400000);
  if (diff === 0) return '今天 ' + hm;
  if (diff === 1) return '昨天 ' + hm;
  if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

/** 一条记录的分享码（跟设置面板里那一串是同一种格式）。 */
function codeOf(rec) {
  var b = recs.board(rec);
  if (!b) return '';
  return encodeShare(b.n, b.regions, b.solution);
}

function linkOf(code) {
  var base = '';
  try { base = window.location.href.split('#')[0]; } catch (e) { base = ''; }
  return base ? base + '#' + code : code;
}

function thumbOf(rec, size) {
  var b = recs.board(rec);
  var uri = b ? boardPreviewUri(b.n, b.regions, b.solution, { queens: rec.won }) : '';
  var px = size || 46;
  return '<span class="rec-thumb"><img src="' + uri + '" width="' + px + '" height="' + px +
    '" alt="' + rec.n + '×' + rec.n + ' 棋盘预览，' + recs.toneName(rec.lv) + '" draggable="false"></span>';
}

/** 小字左边那半：限时 / 挑战标记 / 提示 / 步数。
 *  提示 0 次是常态，省略掉，这一行才留得出位置给日期。 */
function metaBits(rec) {
  var bits = [limitLabel(rec.lim)];
  if (!rec.won) bits.push(rec.lim ? '超时' : '未完成');
  if (rec.nh) bits.push('无提示');
  if (rec.nu) bits.push('无撤销');
  if (rec.h > 0) bits.push('提示 ' + rec.h);
  bits.push(rec.mv + ' 步');
  return bits;
}

/* 日期单独钉在右边：窄屏上被省略号吃掉的是中间那些信息，
 * 「哪天打的」永远看得见。 */
function metaLine(rec, cls, withSize) {
  var bits = metaBits(rec);
  if (withSize) bits.unshift(rec.n + '×' + rec.n);
  return '<span class="' + cls + '">' +
    '<span class="rec-info">' + bits.join(' · ') + '</span>' +
    '<span class="rec-date">' + dateText(rec.at) + '</span>' +
  '</span>';
}

function lvChip(rec) {
  var score = rec.sc != null ? ' ' + rec.sc.toFixed(1) : '';
  /* v2 之前记的成绩是按旧刻度打的档（13×13 那时算极难），跟现在的分没法比，
   * 所以挂个角标说清楚：这不是「算错了」，是换了把尺子。 */
  var old = rec.sq !== recs.RECORD_SCALE
    ? '<i class="rec-old" title="按旧刻度算的难度，不进排行榜">旧刻度</i>' : '';
  return '<span class="rec-lv" data-tone="' + rec.lv + '">' +
    recs.toneName(rec.lv) + score + old + '</span>';
}

function setStatus(text, ok) {
  if (!recStatus) return;
  recStatus.textContent = text || '';
  recStatus.dataset.tone = ok === true ? 'good' : ok === false ? 'bad' : '';
  recStatus.dataset.at = String(Date.now());
  var stamp = recStatus.dataset.at;
  window.setTimeout(function () {
    if (recStatus.dataset.at !== stamp) return;   // 期间又冒出一句，让新那句留着
    recStatus.textContent = '';
    recStatus.dataset.tone = '';
  }, 3200);
}

/* 复制：局域网 http 下没有 navigator.clipboard，用临时 textarea 兜底。
 * 不借用设置面板那个代码框——面板可能压根没打开过，引用了也是空的。 */
function copyPlain(text, done) {
  function fallback() {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;font-size:12px';
    document.body.appendChild(ta);
    var ok = false;
    try {
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      ok = document.execCommand('copy');
    } catch (e) { ok = false; }
    if (ta.parentNode) ta.parentNode.removeChild(ta);
    done(ok);
  }
  if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
    try {
      navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
      return;
    } catch (e) { /* 继续走兜底 */ }
  }
  fallback();
}

/* 删除这种不可逆的动作做两步确认：第一次只是把按钮变红并改字，
 * 2.6 秒内再点才真删。比弹 confirm 顺手，也不会误触就没了。 */
function arm(btn, text) {
  btn.dataset.armed = '1';
  if (!btn.dataset.label) btn.dataset.label = btn.textContent;
  btn.textContent = text || '再点一次';
  window.clearTimeout(btn._armTimer);
  btn._armTimer = window.setTimeout(function () { disarm(btn); }, 2600);
}

function disarm(btn) {
  if (!btn) return;
  window.clearTimeout(btn._armTimer);
  if (btn.dataset.armed !== '1') return;
  btn.dataset.armed = '';
  if (btn.dataset.label) {
    btn.textContent = btn.dataset.label;
    delete btn.dataset.label;
  }
}

/* ==========================================================
   开 / 关
   ========================================================== */
export function openRecords() { sheet.open(); }
export function closeRecords() { sheet.close(); }
export function isRecordsOpen() { return !!sheet && sheet.isOpen(); }

/* ==========================================================
   渲染
   ========================================================== */
function syncTabs() {
  var board = v.tab === 'board';
  var n = recs.total();

  recTotal.textContent = n ? String(n) : '';
  tabRecs.classList.toggle('is-on', !board);
  tabRecs.setAttribute('aria-selected', board ? 'false' : 'true');
  tabBoard.classList.toggle('is-on', board);
  tabBoard.setAttribute('aria-selected', board ? 'true' : 'false');

  paneRecs.hidden = board;
  paneBoard.hidden = !board;
  btnClearRecs.hidden = n === 0;
}

export function renderRecords() {
  if (!sheet || !sheet.isOpen()) return;
  syncTabs();
  if (v.tab === 'board') renderBoard();
  else renderList();
}

/* 全屏页里滚的是分页自己（头与标签钉在上面），换页 / 换筛选都要从头看起 */
function resetScroll() {
  if (paneRecs) paneRecs.scrollTop = 0;
  if (paneBoard) paneBoard.scrollTop = 0;
}

function renderList() {
  var all = recs.all();
  var shown = all.slice(0, v.shown);
  var html = '';
  for (var i = 0; i < shown.length; i++) html += rowHtml(shown[i]);
  recList.innerHTML = html;

  recEmpty.hidden = all.length > 0;
  var more = all.length - shown.length;
  btnMoreRecs.hidden = more <= 0;
  if (more > 0) btnMoreRecs.textContent = '显示更多（还有 ' + more + ' 局）';
}

function rowHtml(rec) {
  var open = v.openId === rec.id;
  var code = open ? codeOf(rec) : '';

  return '<article class="rec" data-id="' + rec.id + '" data-won="' + (rec.won ? 1 : 0) + '">' +
    '<button class="rec-hit" type="button" data-act="toggle" aria-expanded="' + (open ? 'true' : 'false') + '">' +
      thumbOf(rec) +
      '<span class="rec-main">' +
        '<span class="rec-l1">' +
          '<b class="rec-time">' + formatTime(rec.ms) + '</b>' +
          '<span class="rec-size">' + rec.n + '×' + rec.n + '</span>' +
          lvChip(rec) +
          (rec.won ? '' : '<span class="rec-lost">未完成</span>') +
        '</span>' +
        metaLine(rec, 'rec-l2', false) +
      '</span>' +
      '<span class="rec-chev" aria-hidden="true">▾</span>' +
    '</button>' +
    (open ?
      '<div class="rec-extra">' +
        '<code class="rec-code" aria-label="这一局的分享码">' + code + '</code>' +
        '<div class="rec-btns">' +
          '<button class="rbtn" type="button" data-act="copy">复制代码</button>' +
          '<button class="rbtn" type="button" data-act="link">复制链接</button>' +
          '<button class="rbtn" type="button" data-act="play">玩这盘</button>' +
          '<button class="rbtn rbtn-warn" type="button" data-act="del">删除</button>' +
        '</div>' +
      '</div>'
      : '') +
  '</article>';
}

function renderBoard() {
  var lim = v.limit, lv = v.level;

  /* 挡位按钮照 LIMIT_OPTIONS 生成。万一筛的是表里没有的限时
   * （老版本存档、或者以后自定义的档位），也给它补一个按钮——
   * 数据既然有，就得有办法筛出来，不能让人看着一片空却不知道去哪儿找。 */
  var opts = LIMIT_OPTIONS.slice();
  var known = false;
  for (var z = 0; z < opts.length; z++) if (opts[z].ms === lim) known = true;
  if (!known) opts.unshift({ ms: lim, label: limitLabel(lim) });

  var lh = '';
  for (var i = 0; i < opts.length; i++) {
    var o = opts[i];
    var onL = o.ms === lim;
    lh += '<button class="rchip' + (onL ? ' is-on' : '') + '" type="button" data-lim="' + o.ms +
      '" aria-pressed="' + (onL ? 'true' : 'false') + '">' + o.label +
      '<i>' + recs.countOf(o.ms, lv) + '</i></button>';
  }
  limChips.innerHTML = lh;

  var vh = '';
  for (var k = 0; k < recs.RECORD_TONES.length; k++) {
    var tone = recs.RECORD_TONES[k];
    var onV = tone === lv;
    vh += '<button class="rchip' + (onV ? ' is-on' : '') + '" type="button" data-lv="' + tone +
      '" aria-pressed="' + (onV ? 'true' : 'false') + '">' + DIFF_BANDS[tone].name +
      '<i>' + recs.countOf(lim, tone) + '</i></button>';
  }
  lvChips.innerHTML = vh;

  var g = recs.group(lim, lv, true);
  var html = '';
  for (var j = 0; j < g.length && j < RECORD_TOP; j++) html += lbRow(g[j], j);
  boardList.innerHTML = html;

  boardEmpty.hidden = g.length > 0;
  if (!g.length) {
    var old = recs.legacyOf(lim, lv);
    boardEmpty.textContent = recs.total()
      ? '「' + limitLabel(lim) + ' · ' + recs.toneName(lv) + '」还没有成绩' +
        (old ? '（另有 ' + old + ' 局是旧刻度，不计入排行）' : '')
      : '还没有战绩，先玩一局吧';
  }

  boardNote.textContent = '「' + limitLabel(lim) + ' · ' + recs.toneName(lv) + '」' +
    (g.length
      ? ' ' + g.length + ' 个成绩，最快 ' + formatTime(g[0].ms)
      : '');
}

function lbRow(rec, i) {
  return '<div class="lb-row" data-id="' + rec.id + '" data-medal="' + (i < 3 ? i + 1 : 0) + '">' +
    '<span class="lb-rank" aria-label="第 ' + (i + 1) + ' 名">' + (i + 1) + '</span>' +
    thumbOf(rec, 38) +
    '<span class="lb-main">' +
      '<b class="lb-time">' + formatTime(rec.ms) + '</b>' +
      metaLine(rec, 'lb-meta', true) +
    '</span>' +
    '<button class="rbtn lb-share" type="button" data-act="copy">分享</button>' +
  '</div>';
}

/* ==========================================================
   交互：点了然后呢
   ========================================================== */
export function switchTab(tab) {
  if (tab !== 'list' && tab !== 'board') return;
  if (v.tab === tab) return;
  v.tab = tab;
  disarm(btnClearRecs);
  renderRecords();
  resetScroll();
  announce(tab === 'board' ? '排行榜' : '战绩记录');
}

export function pickChip(e) {
  var t = e.target;
  var b = t && t.closest ? t.closest('[data-lim]') : null;
  if (b) {
    var ms = parseInt(b.dataset.lim, 10) || 0;
    if (ms === v.limit) return;
    v.limit = ms;
    renderBoard();
    if (paneBoard) paneBoard.scrollTop = 0;   // 换了组：从第一名看起，别停在上组的中间
    sfx('x');
    buzz(4);
    return;
  }
  b = t && t.closest ? t.closest('[data-lv]') : null;
  if (b) {
    if (b.dataset.lv === v.level) return;
    v.level = b.dataset.lv;
    renderBoard();
    if (paneBoard) paneBoard.scrollTop = 0;
    sfx('x');
    buzz(4);
  }
}

export function showMore() {
  v.shown += RECORD_PAGE;
  renderList();
  announce('已显示 ' + Math.min(v.shown, recs.total()) + ' 局');
}

export function recAction(e) {
  var t = e.target;
  var act = t && t.closest ? t.closest('[data-act]') : null;
  if (!act) return;
  var host = act.closest('.lb-row') || act.closest('.rec');
  if (!host) return;

  var rec = recs.get(host.dataset.id);
  if (!rec) { renderRecords(); return; }
  var code = codeOf(rec);

  switch (act.dataset.act) {
    case 'toggle':
      v.openId = v.openId === rec.id ? '' : rec.id;
      renderList();
      return;

    case 'copy':
      copyPlain(code, function (ok) {
        if (ok) {
          setStatus('分享码已复制 · ' + rec.n + '×' + rec.n + ' · 发给朋友就能玩这一盘', true);
          sfx('share');
          buzz(10);
          announce('分享码已复制');
        } else {
          setStatus('这个浏览器不让自动复制，展开这一条后长按代码手动全选', false);
        }
      });
      return;

    case 'link':
      copyPlain(linkOf(code), function (ok) {
        if (ok) {
          setStatus('分享链接已复制 · 打开就直接是这一盘', true);
          sfx('share');
          buzz(10);
          announce('分享链接已复制');
        } else {
          setStatus('这个浏览器不让自动复制，长按代码手动全选更稳', false);
        }
      });
      return;

    case 'play':
      closeRecords();
      tryLoadShare(code);
      return;

    case 'del':
      if (act.dataset.armed === '1') {
        recs.remove(rec.id);
        if (v.openId === rec.id) v.openId = '';
        renderRecords();
        setStatus('已删除这一条战绩', null);
        announce('已删除这一条战绩');
        return;
      }
      arm(act, '再点一次');
      return;

    default:
      return;
  }
}

export function requestClearAll() {
  var btn = btnClearRecs;
  if (!btn) return;
  if (btn.dataset.armed === '1') {
    recs.clear();
    disarm(btn);
    v.openId = '';
    renderRecords();
    setStatus('战绩已清空', null);
    announce('战绩已清空');
    return;
  }
  arm(btn, '再点一次，全部清空');
  announce('再点一次清空全部战绩');
}

/* 全屏页把滚动挪进了分页里：焦点还挂在整层面板上的时候，
 * 方向键 / PageUp / PageDown 得手动转给当前这一页（浏览器只认焦点所在的那条链）。 */
function recKey(e) {
  if (document.activeElement !== recSheet) return;   // 焦点在按钮上：那是按钮的键
  var el = v.tab === 'board' ? paneBoard : paneRecs;
  if (!el) return;
  var page = el.clientHeight * 0.9, step = 0;
  if (e.key === 'PageDown') step = page;
  else if (e.key === 'PageUp') step = -page;
  else if (e.key === 'ArrowDown') step = 60;
  else if (e.key === 'ArrowUp') step = -60;
  if (!step) return;
  e.preventDefault();
  el.scrollTop += step;
}

/* ==========================================================
   挂载
   ========================================================== */
export function mount(host) {
  host.insertAdjacentHTML('beforeend', HTML);

  recWrap = document.getElementById('recWrap');
  recSheet = document.getElementById('recSheet');
  recBackdrop = document.getElementById('recBackdrop');
  tabRecs = document.getElementById('tabRecs');
  tabBoard = document.getElementById('tabBoard');
  recTotal = document.getElementById('recTotal');
  paneRecs = document.getElementById('paneRecs');
  paneBoard = document.getElementById('paneBoard');
  recList = document.getElementById('recList');
  recEmpty = document.getElementById('recEmpty');
  btnMoreRecs = document.getElementById('btnMoreRecs');
  limChips = document.getElementById('limChips');
  lvChips = document.getElementById('lvChips');
  boardNote = document.getElementById('boardNote');
  boardList = document.getElementById('boardList');
  boardEmpty = document.getElementById('boardEmpty');
  recStatus = document.getElementById('recStatus');
  btnClearRecs = document.getElementById('btnClearRecs');

  sheet = createSheet({
    id: 'records',
    wrap: recWrap,
    panel: recSheet,
    opener: btnRecords,
    /* 关掉之后把焦点还给触发按钮（设置 / 战绩这两层沿用原来的做法：
     * 直接 blur，键盘用户按 Esc 之后接着用 X / Q / Z 不会误触到按钮上） */
    focusOpener: false,
    beforeOpen: function () {
      // 默认落在「这一局」的组合上：刚从 5 分钟中等里杀出来，点开就该看见这一组
      v.tab = 'list';
      v.limit = state.limit || 0;
      v.level = (state.vibe && state.vibe.tone) || recs.toneOfSize(state.size);
      v.openId = '';
      v.shown = RECORD_PAGE;
      setStatus('');
    },
    afterOpen: function () { resetScroll(); renderRecords(); },
    onKey: recKey,
    beforeClose: function () { disarm(btnClearRecs); }
  });

  btnRecords.addEventListener('click', openRecords);
  document.getElementById('btnCloseRec').addEventListener('click', closeRecords);
  recBackdrop.addEventListener('click', closeRecords);

  tabRecs.addEventListener('click', function () { switchTab('list'); });
  tabBoard.addEventListener('click', function () { switchTab('board'); });
  limChips.addEventListener('click', pickChip);
  lvChips.addEventListener('click', pickChip);
  recList.addEventListener('click', recAction);
  boardList.addEventListener('click', recAction);
  btnMoreRecs.addEventListener('click', showMore);
  btnClearRecs.addEventListener('click', requestClearAll);
}
