/* ============================================================================
 * panels/mismatch.js · 「没抽到够格的盘」
 * ----------------------------------------------------------------------------
 * 宁可先不出盘，也不让玩家玩一盘不符合设定的：这批 3 张都没够到档位下限
 * （DIFF_BANDS[x].min）时由 app/puzzle.js 调 showMismatch()，那一盘**不装**。
 *
 * 只给两条路：
 *   · 再抽一局：交给 puzzle 的 onRetry 再抽一批（同一尺寸、同一档）
 *   · 更换设置：打开设置面板并停在这一档上，可以换个更大的尺寸或换档
 *
 * 跟结果层一样不许 Esc 关掉：关掉之后既没新盘也没旧盘，只剩一块空棋盘。
 * 「继续尝试」这件事一定得由玩家自己决定——这就是这层的全部意义。
 * ========================================================================== */

import { announce } from '../../core/utils.js';
import { createSheet } from '../../core/sheet.js';
import { openSheetAt } from './settings.js';

export var HTML = /* html */ `
<div class="result is-mismatch" id="mismatch" hidden>
  <div class="result-card" role="dialog" aria-modal="true" aria-labelledby="mmTitle" aria-describedby="mmSub">
    <p class="result-kicker">TOO EASY</p>
    <h2 class="result-title" id="mmTitle">还不够「极难」</h2>
    <p class="result-sub" id="mmSub">13×13 抽了 6 张，最高 7.8（困难）</p>
    <div class="result-stats">
      <div class="result-stat"><b id="mmNeed">8.4</b><span>档位要求</span></div>
      <div class="result-stat"><b id="mmBest">7.8</b><span>这批最高</span></div>
    </div>
    <button class="btn btn-hint" id="btnMmRetry" type="button">再抽一局</button>
    <div class="result-links">
      <button class="btn-text" id="btnMmSetup" type="button">更换设置</button>
    </div>
    <p class="mm-note" id="mmNote">同一档里盘越大越容易够格。</p>
  </div>
</div>`;

var el = null;          // #mismatch
var mmTitle = null, mmSub = null, mmNeed = null, mmBest = null, mmNote = null;
var btnMmRetry = null, btnMmSetup = null;

var sheet = null;
/* 这一层要回调谁，只在开着的时候有效 */
var hook = null;

/* 按钮下面那句建议：同一档里盘越大越容易够格（这就是「更换设置」该点哪儿）。
 * 已经是这一档最大的盘了，就别再劝他放大——劝他换档。 */
function nextHint(band, size) {
  if (size < band.hi) {
    return '「' + band.name + '」里盘越大越容易够格：' + size + '×' + size +
      ' 抽不到，就试试 ' + (size + 1) + '×' + (size + 1) + '。';
  }
  return '这已经是「' + band.name + '」能开的最大盘了：再抽一次，或者换个档位。';
}

export function showMismatch(o) {
  if (sheet.isOpen()) return;
  hook = o;
  fill(o);
  sheet.open();
}

/* 装上新盘 / 换了一局 / 收摊时都要把它收掉，否则会压在棋盘上 */
export function dismissMismatch() {
  if (!sheet.isOpen()) return;
  hook = null;
  sheet.close({ force: true });
}

function fill(o) {
  mmTitle.textContent = '还不够「' + o.band.name + '」';
  mmNeed.textContent = o.band.min.toFixed(1);
  mmBest.textContent = o.vibe.score.toFixed(1);
  // 尺寸和抽了几张放一句话里说完，读屏一次读完不用来回跳
  mmSub.textContent = o.size + '×' + o.size + ' 抽了 ' + o.tried + ' 张，最高 ' +
    o.vibe.score.toFixed(1) + '（' + o.vibe.level + '）';
  mmNote.textContent = nextHint(o.band, o.size);

  announce('没抽到「' + o.band.name + '」的盘：' + o.size + '×' + o.size + ' 抽了 ' + o.tried +
    ' 张，最高 ' + o.vibe.score.toFixed(1) + '，要 ' + o.band.min.toFixed(1) + ' 起');
}

/* ==========================================================
   挂载
   ========================================================== */
export function mount(host) {
  host.insertAdjacentHTML('beforeend', HTML);

  el = document.getElementById('mismatch');
  mmTitle = document.getElementById('mmTitle');
  mmSub = document.getElementById('mmSub');
  mmNeed = document.getElementById('mmNeed');
  mmBest = document.getElementById('mmBest');
  mmNote = document.getElementById('mmNote');
  btnMmRetry = document.getElementById('btnMmRetry');
  btnMmSetup = document.getElementById('btnMmSetup');

  /* Esc 关不掉：canClose 只认 force，只有在换盘 / 换局 / 点这两个按钮时才收。 */
  sheet = createSheet({
    id: 'mismatch',
    wrap: el,
    inert: false,   // 整屏盖住 + 自己锁焦点，不用把 #app 设成 inert
    panel: el.querySelector('.result-card'),
    focusEl: function () { return btnMmRetry; },
    /* Esc / 点背景都关不掉；只有换盘、换局、点这两个按钮时传 force 才收 */
    canClose: function (opt) { return !!(opt && opt.force); },
    beforeClose: function () { hook = null; }
  });

  btnMmRetry.addEventListener('click', function () {
    var h = hook;
    if (!h) return;
    // 先收层，再抽：抽出来的结果可能又不够格，那时会重新露一次
    sheet.close({ force: true });
    h.onRetry();
  });

  btnMmSetup.addEventListener('click', function () {
    var h = hook;
    if (!h) return;
    var band = h.difficulty;
    var size = h.size;
    sheet.close({ force: true });
    openSheetAt(band, size);
  });
}
