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
/* 色块图案的 <defs>：每套图案每种颜色一枚 symbol，格子里的 <use> 指向它 */
export var skinDefsEl = $('skinDefs');
export var linksEl = $('links');
export var hintEl = $('hint');
export var hintRowEl = $('hintRow');
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

/* 局内信息条：棋盘 / 用时 / 皇后 / 难度四段，整条是一个按钮（btnHud）。
 * 四段只是读数，点了都进同一个信息页，所以不各自做成按钮。 */
export var btnHud = $('btnHud');
export var hudSize = $('hudSize');
export var timePill = $('timePill');
export var timeText = $('timeText');
export var queenPill = $('queenPill');
export var queenCountEl = $('queenCount');
export var diffSeg = $('diffSeg');
export var diffLevelEl = $('diffLevel');
export var diffScoreEl = $('diffScore');
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
export var sizeHint = $('sizeHint');
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

/* 本局信息页：四张读数卡片 + 难度构成（原「难度说明」弹层并进来） */
export var diffWrap = $('diffWrap');
export var diffSheet = $('diffSheet');
export var diffBackdrop = $('diffBackdrop');
export var btnCloseDiff = $('btnCloseDiff');
export var btnDiffDone = $('btnDiffDone');
export var btnInfoSetup = $('btnInfoSetup');
export var infoSize = $('infoSize');
export var infoSizeSub = $('infoSizeSub');
export var infoTime = $('infoTime');
export var infoTimeSub = $('infoTimeSub');
export var infoQueens = $('infoQueens');
export var infoQueensSub = $('infoQueensSub');
export var infoDiffCard = $('infoDiffCard');
export var infoDiffSub = $('infoDiffSub');
export var diffGroupTitle = $('diffGroupTitle');
export var diffBig = $('diffBig');
export var diffBadge = $('diffBadge');
export var diffLead = $('diffLead');
export var diffSteps = $('diffSteps');
export var diffLegend = $('diffLegend');

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

/* 「没抽到够格的盘」那一层：给两条路，不装盘 */
export var mismatchEl = $('mismatch');
export var mmTitle = $('mmTitle');
export var mmSub = $('mmSub');
export var mmNeed = $('mmNeed');
export var mmBest = $('mmBest');
export var mmNote = $('mmNote');
export var btnMmRetry = $('btnMmRetry');
export var btnMmSetup = $('btnMmSetup');

export var fxEl = $('fx');
export var srStatus = $('srStatus');

/* 设置面板里的尺寸步进器与几个开关：只有设置面板会用到，
 * 但也放在这里，保证「元素引用只在一处取」这条约定不被打破。 */
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

/* 外观面板：三排展柜（色块 / 叉 / 皇后），选项按钮按 looks/ 里登记的插件现场生成，
 * 所以这里只取容器与「当前是什么」这两个标题。 */
export var lookWrap = $('lookWrap');
export var lookSheet = $('lookSheet');
export var lookBackdrop = $('lookBackdrop');
export var btnCloseLook = $('btnCloseLook');
export var btnLookDone = $('btnLookDone');
export var surfaceRow = $('surfaceRow');
export var markRow = $('markRow');
export var pieceRow = $('pieceRow');
export var surfaceNow = $('surfaceNow');
export var markNow = $('markNow');
export var pieceNow = $('pieceNow');
