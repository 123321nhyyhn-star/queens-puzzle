/* ============================================================================
 * dom.js
 * DOM 引用集中处：所有元素只在这里取一次，模块里直接 import 用。
 * ========================================================================== */

/* ==========================================================
   DOM
   ========================================================== */
export function $(id) { return document.getElementById(id); }

export var app = $('app');
export var stage = $('stage');
export var boardEl = $('board');
export var gridEl = $('grid');
export var rbEl = $('rb');
export var rlEl = $('rl');
export var rlBad = $('rlBad');
export var rlPeek = $('rlPeek');
export var linksEl = $('links');
export var hintEl = $('hint');
export var hintRowEl = $('hintRow');
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

export var btnSize = $('btnSize');
export var timePill = $('timePill');
export var timeText = $('timeText');
export var queenPill = $('queenPill');
export var btnNew = $('btnNew');
export var btnSettings = $('btnSettings');
export var btnLook = $('btnLook');
export var btnRecords = $('btnRecords');

export var btnUndo = $('btnUndo');
export var btnHint = $('btnHint');
export var btnClear = $('btnClear');

export var veil = $('veil');
export var veilTitle = $('veilTitle');

export var sheetWrap = $('sheetWrap');
export var sheet = $('sheet');
export var sheetBackdrop = $('sheetBackdrop');
export var btnCloseSheet = $('btnCloseSheet');
export var btnShuffle = $('btnShuffle');
export var shuffleHint = $('shuffleHint');
export var sizeMinus = $('sizeMinus');
export var sizePlus = $('sizePlus');
export var sizeVal = $('sizeVal');
export var quickRow = $('quickRow');
export var sheetNote = $('sheetNote');
export var diffOpts = $('diffOpts');
export var diffHint = $('diffHint');

export var limitOpts = $('limitOpts');
export var limitHint = $('limitHint');
export var challengeTitle = $('challengeTitle');

export var shareCode = $('shareCode');
export var shareTag = $('shareTag');
export var shareStatus = $('shareStatus');
export var btnCopyCode = $('btnCopyCode');
export var btnLoadCode = $('btnLoadCode');

export var btnDiff = $('btnDiff');
export var diffLevelEl = $('diffLevel');
export var diffScoreEl = $('diffScore');
export var diffWrap = $('diffWrap');
export var diffSheet = $('diffSheet');
export var diffBackdrop = $('diffBackdrop');
export var btnCloseDiff = $('btnCloseDiff');
export var btnDiffDone = $('btnDiffDone');
export var diffBig = $('diffBig');
export var diffBadge = $('diffBadge');
export var diffLead = $('diffLead');
export var diffSteps = $('diffSteps');

export var resultEl = $('result');
export var resultKicker = $('resultKicker');
export var resultTitle = $('resultTitle');
export var resultSub = $('resultSub');
export var resSize = $('resSize');
export var resTime = $('resTime');
export var resTimeLbl = $('resTimeLbl');
export var resHints = $('resHints');
export var btnAgain = $('btnAgain');
export var btnReplay = $('btnReplay');
export var btnPeek = $('btnPeek');

export var fxEl = $('fx');
export var srStatus = $('srStatus');

/* 设置面板里的尺寸步进器与几个开关：只有设置面板会用到，
 * 但也放在这里，保证「元素引用只在一处取」这条约定不被打破。 */
export var sizeStepperEl = $('sizeStepper');
export var swAuto = $('swAuto');
export var swAlignDrag = $('swAlignDrag');
export var swFadeMark = $('swFadeMark');
export var swFadeQueen = $('swFadeQueen');
export var swConflict = $('swConflict');
export var swForced = $('swForced');
export var swSound = $('swSound');
export var swHaptics = $('swHaptics');
/* 「显示更多选项」：换一局以下的那堆开关与分享都折在这块里 */
export var btnMoreOpts = $('btnMoreOpts');
export var moreOptsLabel = $('moreOptsLabel');
export var sheetMore = $('sheetMore');
/* 挑战那一组 */
export var swNoHint = $('swNoHint');
export var swNoUndo = $('swNoUndo');

/* 战绩 / 排行榜面板 */
export var recWrap = $('recWrap');
export var recSheet = $('recSheet');
export var recBackdrop = $('recBackdrop');
export var btnCloseRec = $('btnCloseRec');
export var tabRecs = $('tabRecs');
export var tabBoard = $('tabBoard');
export var paneRecs = $('paneRecs');
export var paneBoard = $('paneBoard');
export var recTotal = $('recTotal');
export var recList = $('recList');
export var recEmpty = $('recEmpty');
export var btnMoreRecs = $('btnMoreRecs');
export var limChips = $('limChips');
export var lvChips = $('lvChips');
export var boardNote = $('boardNote');
export var boardList = $('boardList');
export var boardEmpty = $('boardEmpty');
export var recStatus = $('recStatus');
export var btnClearRecs = $('btnClearRecs');

/* 外观面板：两排展柜（叉 / 皇后），选项按钮按 core/config.js 的样式表现场生成，
 * 所以这里只取容器与「当前是什么」这两个标题。 */
export var lookWrap = $('lookWrap');
export var lookSheet = $('lookSheet');
export var lookBackdrop = $('lookBackdrop');
export var btnCloseLook = $('btnCloseLook');
export var btnLookDone = $('btnLookDone');
export var markRow = $('markRow');
export var pieceRow = $('pieceRow');
export var markNow = $('markNow');
export var pieceNow = $('pieceNow');
