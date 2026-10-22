/* ============================================================================
 * records.js
 * 战绩面板：每局记录列表（带棋盘缩略图 / 分享码）+ 按限时 × 难度分开的排行榜。
 * ----------------------------------------------------------------------------
 * 面板只读 core/records.js 里的数据，自己不存东西：所有改动（增删）都走那边，
 * 这里只负责画出来、把点击翻译成动作。
 *
 * 列表分页：一条记录一张缩略图，20 条一屏画完就停，剩下的点「显示更多」。
 * 上限 300 条的时候一次性全画会把面板卡住，而绝大多数时候没人往下翻那么多。
 * ========================================================================== */

import { buzz, sfx } from '../core/audio.js';
import { DIFF_BANDS, LIMIT_OPTIONS, RECORD_PAGE, RECORD_TOP, limitLabel } from '../core/config.js';
import { app, boardEmpty, boardList, boardNote, btnClearRecs, btnMoreRecs, btnRecords,
  limChips, lvChips, paneBoard, paneRecs, recEmpty, recList, recSheet, recStatus,
  recTotal, recWrap, tabBoard, tabRecs } from '../core/dom.js';
import * as recs from '../core/records.js';
import { state, view } from '../core/state.js';
import { announce, formatTime } from '../core/utils.js';
import { boardPreviewUri } from '../game/preview.js';
import { encodeShare } from '../game/share-code.js';
import { closeSheet, trapFocus } from './settings.js';
import { tryLoadShare } from './share.js';

/* ==========================================================
   小工具
   ========================================================== */
function pad2(v) { return v < 10 ? '0' + v : String(v); }

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
  return '<span class="rec-lv" data-tone="' + rec.lv + '">' + recs.toneName(rec.lv) + score + '</span>';
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
export function openRecords() {
  if (view.recordsOpen) return;
  if (view.sheetOpen) closeSheet();
  view.recordsOpen = true;

  // 默认落在「这一局」的组合上：刚从 5 分钟中等里杀出来，点开就该看见这一组
  view.recTab = 'list';
  view.recLimit = state.limit || 0;
  view.recLevel = (state.vibe && state.vibe.tone) || recs.toneOfSize(state.size);
  view.recOpenId = '';
  view.recShown = RECORD_PAGE;
  setStatus('');

  recWrap.hidden = false;
  if ('inert' in HTMLElement.prototype) app.inert = true;
  else app.setAttribute('aria-hidden', 'true');
  btnRecords.setAttribute('aria-expanded', 'true');

  renderRecords();
  recSheet.focus();
}

export function closeRecords() {
  if (!view.recordsOpen) return;
  view.recordsOpen = false;
  recWrap.hidden = true;
  disarm(btnClearRecs);
  if ('inert' in HTMLElement.prototype) app.inert = false;
  app.removeAttribute('aria-hidden');
  btnRecords.setAttribute('aria-expanded', 'false');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}

/* ==========================================================
   渲染
   ========================================================== */
function syncTabs() {
  var board = view.recTab === 'board';
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
  if (!view.recordsOpen) return;
  syncTabs();
  if (view.recTab === 'board') renderBoard();
  else renderList();
}

function renderList() {
  var all = recs.all();
  var shown = all.slice(0, view.recShown);
  var html = '';
  for (var i = 0; i < shown.length; i++) html += rowHtml(shown[i]);
  recList.innerHTML = html;

  recEmpty.hidden = all.length > 0;
  var more = all.length - shown.length;
  btnMoreRecs.hidden = more <= 0;
  if (more > 0) btnMoreRecs.textContent = '显示更多（还有 ' + more + ' 局）';
}

function rowHtml(rec) {
  var open = view.recOpenId === rec.id;
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
  var lim = view.recLimit, lv = view.recLevel;

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
  if (!g.length) boardEmpty.textContent = recs.total()
    ? '「' + limitLabel(lim) + ' · ' + recs.toneName(lv) + '」还没有成绩'
    : '还没有战绩，先玩一局吧';

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
   交互（事件绑定都在 events.js，这里只处理「点了然后呢」）
   ========================================================== */
export function switchTab(tab) {
  if (tab !== 'list' && tab !== 'board') return;
  if (view.recTab === tab) return;
  view.recTab = tab;
  disarm(btnClearRecs);
  renderRecords();
  recSheet.scrollTop = 0;
  announce(tab === 'board' ? '排行榜' : '战绩记录');
}

export function pickChip(e) {
  var t = e.target;
  var b = t && t.closest ? t.closest('[data-lim]') : null;
  if (b) {
    var ms = parseInt(b.dataset.lim, 10) || 0;
    if (ms === view.recLimit) return;
    view.recLimit = ms;
    renderBoard();
    sfx('x');
    buzz(4);
    return;
  }
  b = t && t.closest ? t.closest('[data-lv]') : null;
  if (b) {
    if (b.dataset.lv === view.recLevel) return;
    view.recLevel = b.dataset.lv;
    renderBoard();
    sfx('x');
    buzz(4);
  }
}

export function showMore() {
  view.recShown += RECORD_PAGE;
  renderList();
  announce('已显示 ' + Math.min(view.recShown, recs.total()) + ' 局');
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
      view.recOpenId = view.recOpenId === rec.id ? '' : rec.id;
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
        if (view.recOpenId === rec.id) view.recOpenId = '';
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
    view.recOpenId = '';
    renderRecords();
    setStatus('战绩已清空', null);
    announce('战绩已清空');
    return;
  }
  arm(btn, '再点一次，全部清空');
  announce('再点一次清空全部战绩');
}

/** 面板打开时把 Tab 关在面板里（和设置面板同一套做法）。 */
export function trapRecords(e) {
  trapFocus(e, recSheet);
}
