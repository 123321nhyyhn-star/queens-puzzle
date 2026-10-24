/* ============================================================================
 * looks/life.js
 * 「生命」外观插件：挑战「标错惩罚」那几条命画成什么样。
 * ----------------------------------------------------------------------------
 * 这一类跟色块 / 叉 / 皇后不是同一个维度：它不在棋盘上，而是一条贴在信息条
 * 下面的小读数（#lifeRow，见 ui/lives.js）。惩罚没开的时候整条收起来，
 * 所以换这套样式平时看不出来——打开了「标错惩罚」才有得看。
 *
 * 画法分两处：
 *   · 真正在玩的时候 —— CSS（styles/base/lives.css），按 <html data-life> 切换，
 *     所以这里只给名字与说明；
 *   · 展柜里的那一小块 —— 下面两个 svg，面板照其它类一样直接塞进玻璃罩。
 *     红心的预览复用 HEART_PATHS，因此展柜里那颗心和棋盘上方那颗心
 *     是同一笔画（fill 也来自同一条 CSS 规则），不会各画一个样子。
 * ========================================================================== */

/* 一颗心 = 左右两半 + 一圈虚影（虚影只在「已经失去」时显形）。
 * 两半各自多出 0.4 单位互相重叠：不重叠的话两个形状各自抗锯齿，
 * 心口会竖着一道白线。 */
export var HEART_PATHS =
  '<path class="h-l" d="M12.4 20.8C12.4 20.8 3.4 14.6 3.4 9.2 3.4 6.1 5.8 3.8 8.7 3.8' +
    ' 10.4 3.8 11.6 4.6 12.4 5.4Z"/>' +
  '<path class="h-r" d="M11.6 20.8C11.6 20.8 20.6 14.6 20.6 9.2 20.6 6.1 18.2 3.8 15.3 3.8' +
    ' 13.6 3.8 12.4 4.6 11.6 5.4Z"/>';

export var HEART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  HEART_PATHS +
  '<path class="h-ghost" d="M12 20.9C12 20.9 3.4 14.6 3.4 9.2 3.4 6.1 5.8 3.8 8.7 3.8' +
    ' 10.4 3.8 11.5 4.6 12 5.4 12.5 4.6 13.6 3.8 15.3 3.8 18.2 3.8 20.6 6.1 20.6 9.2' +
    ' 20.6 14.6 12 20.9 12 20.9Z"/>' +
  '</svg>';

/* 展柜里的红心：三颗并排（一颗心的预览说明不了「几条命」这件事） */
var HEART_PREVIEW = '<svg viewBox="0 0 100 100" aria-hidden="true">' +
  '<g transform="translate(2 35.6) scale(1.2)">' + HEART_PATHS + '</g>' +
  '<g transform="translate(35.6 35.6) scale(1.2)">' + HEART_PATHS + '</g>' +
  '<g transform="translate(69.2 35.6) scale(1.2)">' + HEART_PATHS + '</g>' +
  '</svg>';

/* 展柜里的血条：跟棋盘上方那条同构（槽 + 填充 + 4 道刻度），只是画成一张静态图 */
var BAR_PREVIEW = '<svg viewBox="0 0 100 100" aria-hidden="true">' +
  '<rect x="2" y="42" width="96" height="18" rx="9" fill="#FFE7E7" stroke="currentColor" stroke-width="3.4"/>' +
  '<rect x="4" y="44" width="54" height="14" rx="7" fill="#E23B3B"/>' +
  '<g fill="currentColor" opacity=".34">' +
    '<rect x="21.4" y="42" width="1.6" height="18"/>' +
    '<rect x="40.6" y="42" width="1.6" height="18"/>' +
    '<rect x="59.8" y="42" width="1.6" height="18"/>' +
    '<rect x="79" y="42" width="1.6" height="18"/>' +
  '</g>' +
  '</svg>';

export default {
  id: 'life',
  name: '生命',
  note: '放错皇后时剩下的命怎么画',

  /* 键名按登记处的规矩走 `<kind>s`（KINDS 里这类叫 life，所以是 lifes）。
   * 顺序 = 展柜里从左到右，第一项就是默认那套。
   * svg 是展柜里那块摆件，跟皇后那类的 svg 是同一个用途。 */
  lifes: [
    {
      id: 'heart',
      name: '红心',
      desc: '一条命一颗心，失去的那颗当场碎开',
      svg: HEART_PREVIEW
    },
    {
      id: 'bar',
      name: '血条',
      desc: '一条带刻度的血槽，扣命时整条缩回去',
      svg: BAR_PREVIEW
    }
  ]
};
