/* ============================================================================
 * config.js
 * 全局常量：棋盘尺寸范围、本地存储键、难度档位、默认设置、皇后 SVG。
 * ========================================================================== */

export var SIZE_MIN = 4;
export var SIZE_MAX = 16;
export var STORE_SETTINGS = 'queens.settings.v1';
export var STORE_GAME = 'queens.game.v1';
export var STORE_RECORDS = 'queens.records.v1';

/* 战绩：最多留多少条（新的在前，超出丢最老的）、列表一次画多少条、
 * 排行榜每组最多显示几名。都只影响展示，不影响统计。 */
export var RECORD_MAX = 300;
export var RECORD_PAGE = 20;
export var RECORD_TOP = 12;

/* 目标难度：每个档位实测下来只对应一段棋盘尺寸（见难度调研报告），
 * 所以「选难度」实际就是「选尺寸区间」，不需要反复重试。 */
export var DIFF_BANDS = {
  easy: { name: '容易', lo: 4, hi: 5 },
  mid: { name: '中等', lo: 6, hi: 8 },
  hard: { name: '困难', lo: 9, hi: 12 },
  extreme: { name: '极难', lo: 13, hi: 16 }
};
export var DIFF_ORDER = ['any', 'easy', 'mid', 'hard', 'extreme'];

/* 挑战：限时挡位（毫秒，0 = 不限时）。
 * 设置面板的按钮按这张表生成，加挡位只改这里。 */
export var LIMIT_OPTIONS = [
  { ms: 0, label: '不限' },
  { ms: 180000, label: '3 分' },
  { ms: 300000, label: '5 分' },
  { ms: 600000, label: '10 分' },
  { ms: 1200000, label: '20 分' }
];

export var LIMIT_MAX = 3600000;

export function normalizeLimit(ms) {
  ms = parseInt(ms, 10);
  if (!ms || ms < 0) return 0;
  return Math.min(ms, LIMIT_MAX);
}

/** 限时的人话说法：「5 分钟」/「不限时」。 */
export function limitLabel(ms) {
  if (!ms) return '不限时';
  var m = Math.round(ms / 60000);
  return m >= 1 ? m + ' 分钟' : '不到 1 分钟';
}

export var DEFAULT_SETTINGS = {
  size: 8,
  difficulty: 'any',
  autoMark: true,
  conflict: true,
  forced: true,
  sound: true,
  haptics: true,
  // 挑战（即时生效，也跟着存盘）
  timeLimit: 0,     // 本局限时（毫秒），0 = 不限时
  noHint: false,    // 禁用提示
  noUndo: false,    // 禁用撤销
  // 外观（即时生效，跟着存盘）：叉的样式、皇后样式
  markStyle: 'x',
  pieceStyle: 'queen'
};

/* ==========================================================
   外观：可换的样式
   ----------------------------------------------------------
   id 会同时写进 settings（存档）和 <html data-mark / data-piece>（CSS 钩子），
   外观面板（ui/look.js）按这两张表现场生成展柜。
   加一套样式 = 这里加一条 + 补一条对应的 CSS（见 17-look.css）。
   ========================================================== */
export var MARK_STYLES = [
  { id: 'x', name: '叉', hint: '轻点标 ×，按住可整行整列连涂' },
  { id: 'dot', name: '点', hint: '轻点标记，按住可整行整列连涂' }
];

export var PIECE_STYLES = [
  { id: 'queen', name: '皇后' },
  { id: 'cat', name: '小猫' }
];

/** 从样式表里认一个 id：认不出来（老存档 / 手改过）就退回第一条。 */
export function styleId(list, id) {
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return id;
  return list[0].id;
}

/** 样式的人话名字，面板标题和读屏播报共用。 */
export function styleName(list, id) {
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name;
  return list[0].name;
}

export var REDUCE_MOTION = window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export var QUEEN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M12 3.3l2.2 4 3.6-2.3-1 5.5H7.2l-1-5.5 3.6 2.3 2.2-4z" fill="currentColor"/>' +
  '<path d="M7.4 11.5h9.2l1.55 6.6H5.85l1.55-6.6z" fill="currentColor"/>' +
  '<rect x="5" y="18.9" width="14" height="2.7" rx="1.35" fill="currentColor"/>' +
  '<circle cx="12" cy="3.3" r="1.45" fill="currentColor"/>' +
  '<circle cx="6.2" cy="5.5" r="1.35" fill="currentColor"/>' +
  '<circle cx="17.8" cy="5.5" r="1.35" fill="currentColor"/>' +
  '</svg>';

/* 小猫：跟皇后一样只画一层墨色剪影，**没有底色**——格子自己的色块色就是它的底。
 * 原来那层粉底一去，眼睛的「眼白」和嘴的两道线就得自己发光，所以改成白色：
 * 墨色脸上留两个白眼圈 + 一张 ω 嘴，远看才认得出是猫，不至于糊成一团墨。
 * 剪影一律走 currentColor，跟皇后同步上色（.piece 的 color）。
 * viewBox 按画面实际占的地方裁过（原图是 200×200，四周留白很多）：
 * 猫身只占 x25–175 / y45–185，裁到 170 见方之后，它在格子里的大小才跟皇后相当。 */
export var CAT_SVG = '<svg viewBox="15 30 170 170" aria-hidden="true">' +
  '<g fill="currentColor">' +
  '<path d="M50 75Q60 35 75 45Q80 55 85 65Z"/>' +
  '<path d="M150 75Q140 35 125 45Q120 55 115 65Z"/>' +
  '<ellipse cx="100" cy="95" rx="60" ry="50"/>' +
  '<rect x="60" y="120" width="80" height="45" rx="22.5"/>' +
  '<rect x="50" y="165" width="100" height="20" rx="10"/>' +
  '<rect x="25" y="90" width="20" height="4" rx="2" transform="rotate(-10 25 90)"/>' +
  '<rect x="30" y="105" width="20" height="4" rx="2" transform="rotate(10 30 105)"/>' +
  '<rect x="155" y="90" width="20" height="4" rx="2" transform="rotate(10 155 90)"/>' +
  '<rect x="150" y="105" width="20" height="4" rx="2" transform="rotate(-10 150 105)"/>' +
  '</g>' +
  '<circle cx="75" cy="90" r="12" fill="#ffffff"/>' +
  '<circle cx="75" cy="90" r="7" fill="currentColor"/>' +
  '<circle cx="73" cy="88" r="2.5" fill="#ffffff"/>' +
  '<circle cx="78" cy="93" r="1" fill="#ffffff"/>' +
  '<circle cx="125" cy="90" r="12" fill="#ffffff"/>' +
  '<circle cx="125" cy="90" r="7" fill="currentColor"/>' +
  '<circle cx="123" cy="88" r="2.5" fill="#ffffff"/>' +
  '<circle cx="128" cy="93" r="1" fill="#ffffff"/>' +
  '<g fill="#f0b7b7" opacity=".8">' +
  '<ellipse cx="55" cy="105" rx="10" ry="6"/>' +
  '<ellipse cx="145" cy="105" rx="10" ry="6"/>' +
  '</g>' +
  '<path d="M93 105Q100 112 107 105" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>' +
  '<path d="M97 105Q100 102 103 105" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>' +
  '</svg>';
