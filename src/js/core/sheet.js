/* ============================================================================
 * sheet.js · 浮层基座
 * ----------------------------------------------------------------------------
 * 设置 / 本局信息 / 战绩 / 外观 / 结果层 / 「没抽到够格的盘」都是浮层，
 * 显隐之外它们各有各的内容，但「浮层该做的事」是一样的：
 *
 *   · 同一时刻只开一个（开新的自动收起旧的）
 *   · 背景 #app 设 inert，键盘事件挂在 document 上也不会落到棋盘
 *   · Esc 关掉最上面那个（不可关的层自己声明）
 *   · Tab 在层内循环
 *   · 打开期间游戏快捷键全部让路
 *   · 开 / 关时把触发按钮的 aria-expanded 一起改掉
 *
 * 这几件以前在四个面板里各抄了一遍，加一个面板要往 events.js 的 Esc 链、
 * app/actions.js 的 canPlay()、core/state.js 的 view 各插一段。现在收在这里：
 *
 *   view.sheet 是当前开着的浮层 id（字符串或 null），canPlay() 只看它。
 *
 * 面板怎么用（见 ui/panels/ 里任意一个）：
 *
 *   var sheet = createSheet({
 *     id: 'look',
 *     wrap: lookWrap,       // 整层容器，关的时候 hidden = true
 *     panel: lookSheet,     // 焦点与 Tab 的容器
 *     opener: btnLook,      // 触发它的按钮（开时 aria-expanded=true）
 *     focusOpener: true,    // 关的时候焦点回到 opener
 *     beforeOpen: function () { ... },   // 展开前：算读数、重置临时状态
 *     afterOpen: function () { ... },    // 展开后：需要量高度的活儿（如撑开代码框）
 *     canClose: function () { return true; },   // 不许关的层返回 false
 *     onKey: function (e) { ... }        // 层内额外快捷键
 *   });
 *   sheet.open();  sheet.close();  sheet.isOpen();
 * ========================================================================== */

import { app } from './dom.js';
import { view } from './state.js';

/* 登记表：id → 配置。只用来按 id 找配置，不决定顺序：
 * 同一时刻只有一个浮层开着，Esc / Tab 只服务那一个。 */
var REG = {};

/* 当前开着的浮层 id。开 / 关都要同时写 view.sheet（canPlay 看它）。 */
var current = null;

function setInert(on) {
  if (!app) return;
  if ('inert' in HTMLElement.prototype) {
    app.inert = on;
    return;
  }
  if (on) app.setAttribute('aria-hidden', 'true');
  else app.removeAttribute('aria-hidden');
}

/* Tab 在浮层里循环：只算真正能看见的那些，隐藏分页里的按钮不该抢焦点 */
export function trapFocus(e, container) {
  if (!container) return;
  var all = container.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  var items = [];
  for (var i = 0; i < all.length; i++) {
    if (all[i].getClientRects().length) items.push(all[i]);
  }
  if (!items.length) return;
  var first = items[0];
  var last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function blankFocus() {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}

/* ==========================================================
   开 / 关
   ========================================================== */
export function openSheet(id, opt) {
  var c = REG[id];
  if (!c || current === id) return false;
  opt = opt || {};

  /* 互斥：开一个新的就把旧的收掉。swap 让旧的那个别把焦点抢回去，
   * 否则「从信息页跳去设置」会在两帧之间闪一下焦点。 */
  if (current) closeSheet(current, { swap: true });

  current = id;
  view.sheet = id;

  if (c.beforeOpen) c.beforeOpen(opt);
  c.wrap.hidden = false;
  if (c.afterOpen) c.afterOpen(opt);

  /* 遮罩类的层（设置 / 信息 / 战绩 / 外观）把背景设成 inert：键盘事件挂在
   * document 上，不拦的话 Tab 还能走到棋盘后面。结果层和「没抽到够格的盘」
   * 整屏盖住、各自锁焦点，本来就没有可点漏的地方，保持原样不设 inert
   * （设了反而会让「先收层再点面板」这类顺序变得别扭）。 */
  if (c.inert !== false) setInert(true);
  if (c.opener) c.opener.setAttribute('aria-expanded', 'true');
  var f = c.focusEl ? c.focusEl() : c.panel;
  if (f && f.focus) f.focus();
  return true;
}

export function closeSheet(id, opt) {
  var c = REG[id];
  if (!c || current !== id) return false;
  opt = opt || {};
  /* 不许关的层（输掉的结果层、没抽到够格的盘）在这里挡住：
   * Esc、点背景、点按钮都走这一条，只有 opt.force 能强行收掉。 */
  if (c.canClose && !c.canClose(opt)) return false;

  current = null;
  view.sheet = null;

  if (c.beforeClose) c.beforeClose(opt);
  c.wrap.hidden = true;

  if (!opt.swap) {
    if (c.inert !== false) setInert(false);
    if (c.opener) c.opener.setAttribute('aria-expanded', 'false');
    /* 焦点回不回触发按钮，由这一层自己定（focusOpener），调用时还能临时改
     * ——信息页从信息条点进来才回焦点，从设置跳过来就不该抢。 */
    var back = opt.focusOpener != null ? opt.focusOpener : c.focusOpener;
    if (back && c.opener && c.opener.focus) c.opener.focus();
    else blankFocus();
  }
  if (c.afterClose) c.afterClose(opt);
  return true;
}

/** 关掉当前开着的那个（Esc 走这里）。返回关没关成。 */
export function closeTopSheet(opt) {
  return current ? closeSheet(current, opt) : false;
}

export function isOpen(id) { return current === id; }
export function currentSheet() { return current; }

/* ==========================================================
   键盘
   ----------------------------------------------------------
   由 events.js 的 keydown 最前面调用。返回 true 表示这次按键归浮层管，
   后面的游戏快捷键（X / Q / Z / H / N / 方向键）一律不再往下走。
   ========================================================== */
export function handleKey(e) {
  if (!current) return false;
  var c = REG[current];

  if (e.key === 'Escape') {
    e.preventDefault();
    closeSheet(current);
    return true;
  }

  if (e.key === 'Tab') {
    trapFocus(e, c.trapEl ? c.trapEl() : c.panel);
    return true;
  }

  if (c.onKey) c.onKey(e);
  return true;
}

/* ==========================================================
   登记
   ========================================================== */
export function createSheet(cfg) {
  REG[cfg.id] = cfg;
  return {
    id: cfg.id,
    open: function (opt) { return openSheet(cfg.id, opt); },
    close: function (opt) { return closeSheet(cfg.id, opt); },
    isOpen: function () { return current === cfg.id; }
  };
}
