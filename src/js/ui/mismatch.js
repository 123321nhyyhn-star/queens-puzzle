/* ============================================================================
 * mismatch.js
 * 「没抽到够格的盘」那一层：宁可先不出盘，也不让玩家玩一盘不符合设定的。
 * ----------------------------------------------------------------------------
 * 由 app/puzzle.js 在挑盘没够到档位下限（DIFF_BANDS[x].min）时调用。
 * 那一盘**不装**——装上去了，玩家的「目标难度」就成了一句空话。
 *
 * 只给两条路：
 *   · 再抽一局：交给 puzzle 的 onRetry 再抽一批（同一尺寸、同一档）
 *   · 更换设置：打开设置面板并停在这一档上，可以换个更大的尺寸或换档
 *
 * 跟结果层一样不许 Esc 关掉：关掉之后既没新盘也没旧盘，只剩一块空棋盘。
 * 「继续尝试」这件事一定得由玩家自己决定——这就是这层的全部意义。
 * ========================================================================== */

import { btnMmRetry, btnMmSetup, mismatchEl, mmBest, mmNeed, mmNote, mmSub, mmTitle } from '../core/dom.js';
import { view } from '../core/state.js';
import { announce } from '../core/utils.js';
import { openSheetAt } from './settings.js';

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
  if (view.mismatchOpen) return;
  view.mismatchOpen = true;
  hook = o;

  mmTitle.textContent = '还不够「' + o.band.name + '」';
  mmNeed.textContent = o.band.min.toFixed(1);
  mmBest.textContent = o.vibe.score.toFixed(1);
  // 尺寸和抽了几张放一句话里说完，读屏一次读完不用来回跳
  mmSub.textContent = o.size + '×' + o.size + ' 抽了 ' + o.tried + ' 张，最高 ' +
    o.vibe.score.toFixed(1) + '（' + o.vibe.level + '）';
  mmNote.textContent = nextHint(o.band, o.size);

  mismatchEl.hidden = false;
  announce('没抽到「' + o.band.name + '」的盘：' + o.size + '×' + o.size + ' 抽了 ' + o.tried +
    ' 张，最高 ' + o.vibe.score.toFixed(1) + '，要 ' + o.band.min.toFixed(1) + ' 起');
  window.setTimeout(function () { btnMmRetry.focus(); }, 80);
}

/* 装上新盘 / 换了一局 / 收摊时都要把它收掉，否则会压在棋盘上 */
export function dismissMismatch() {
  if (!view.mismatchOpen) return;
  view.mismatchOpen = false;
  hook = null;
  mismatchEl.hidden = true;
}

btnMmRetry.addEventListener('click', function () {
  var h = hook;
  if (!h) return;
  // 先收层，再抽：抽出来的结果可能又不够格，那时会重新露一次
  dismissMismatch();
  h.onRetry();
});

btnMmSetup.addEventListener('click', function () {
  var h = hook;
  if (!h) return;
  var band = h.difficulty;
  var size = h.size;
  dismissMismatch();
  openSheetAt(band, size);
});
