/* ============================================================================
 * dom.js · 骨架上的元素引用
 * ----------------------------------------------------------------------------
 * 这里只放 index.html 里写死的那一层：顶栏、棋盘、信息条、工具栏、提示行、遮罩。
 * 它们在模块加载时就存在，所以可以在顶层取一次。
 *
 * 浮层里的元素**不在这里**。每个面板的 markup 跟着自己的模块走（见
 * ui/panels/），引用也在那个模块的 mount() 里取——加一个面板不用动这个文件。
 * 这条边界很重要：dom.js 一旦重新长成一张「全站 id 清单」，它就又变成
 * 第二个 index.html 了。
 * ========================================================================== */

export function $(id) { return document.getElementById(id); }

export var app = $('app');
export var stage = $('stage');
export var boardEl = $('board');
export var gridEl = $('grid');
export var rbEl = $('rb');
export var rlEl = $('rl');
export var rlBad = $('rlBad');
export var rlPeek = $('rlPeek');
/* 色块图案的 <defs>：每套图案每种颜色一枚 symbol，格子里的 <use> 指向它 */
export var skinDefsEl = $('skinDefs');
export var linksEl = $('links');
export var hintEl = $('hint');
export var hintRowEl = $('hintRow');
/* 「只差皇后」时占住整行提示区的补齐按钮（见 ui/hint.js） */
export var btnFinish = $('btnFinish');
export var finishText = $('finishText');
/* 提示行 + 信息条：舞台上算一块，量高度时用它 */
export var stageHeadEl = $('stageHead');
export var regionsEl = $('regions');
export var toolbarEl = $('toolbar');

export var coachEl = $('coach');
export var coachText = $('coachText');
export var coachTier = $('coachTier');
export var coachDots = $('coachDots');
export var coachPrev = $('coachPrev');
export var coachNext = $('coachNext');
export var coachClose = $('coachClose');
export var glEl = $('gl');
export var glTags = $('glTags');

/* 局内信息条：棋盘 / 用时 / 步数 / 皇后 / 难度五段，整条是一个按钮（btnHud）。
 * 各段只是读数，点了都进同一个信息页，所以不各自做成按钮。 */
export var btnHud = $('btnHud');
export var hudSize = $('hudSize');
export var timePill = $('timePill');
export var timeText = $('timeText');
export var stepPill = $('stepPill');
export var stepCountEl = $('stepCount');
export var queenPill = $('queenPill');
export var queenCountEl = $('queenCount');
export var diffSeg = $('diffSeg');
export var diffLevelEl = $('diffLevel');
export var diffScoreEl = $('diffScore');

/* 顶栏四颗按钮：新一局留在 events.js，另外三颗各自的面板自己认领 */
export var btnNew = $('btnNew');
export var btnSettings = $('btnSettings');
export var btnLook = $('btnLook');
export var btnRecords = $('btnRecords');

export var btnUndo = $('btnUndo');
export var btnHint = $('btnHint');
export var btnClear = $('btnClear');

export var veil = $('veil');
export var veilTitle = $('veilTitle');

/* 浮层挂载点：面板的 markup 按注册顺序追加到这里（见 ui/panels/index.js） */
export var sheetsHost = $('sheets');

export var fxEl = $('fx');
export var srStatus = $('srStatus');
