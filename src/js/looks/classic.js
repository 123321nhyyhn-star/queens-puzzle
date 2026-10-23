/* ============================================================================
 * looks/classic.js
 * 「墨线」外观插件：开局就有的一套画法，也是这一页的出厂默认。
 * ----------------------------------------------------------------------------
 * 提供三样：
 *   色块 —— 纯色（没有图案，格子就是一块颜色）
 *   叉   —— 叉（两根斜杠）/ 点（一个小圆点）
 *   皇后 —— 皇后 / 小猫（同一套墨色剪影，只换脸）
 * 叉的画法在 17-look.css 里（CSS 换笔画最省事），这里只给名字与提示文案。
 * ========================================================================== */

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

export default {
  id: 'classic',
  name: '墨线',
  note: '叉与点和皇后与小猫，色块是平的',

  surfaces: [
    { id: 'plain', name: '纯色', tone: 0, motifs: null,
      desc: '格子就是一块颜色，什么都不加' }
  ],

  marks: [
    { id: 'x', name: '叉', preview: 'x',
      hint: '轻点标 ×，按住可整行整列连涂',
      hintFree: '轻点标 ×，按住可以顺着手指随意涂' },
    { id: 'dot', name: '点', preview: 'dot',
      hint: '轻点标记，按住可整行整列连涂',
      hintFree: '轻点标记，按住可以顺着手指随意涂' }
  ],

  pieces: [
    { id: 'queen', name: '皇后', svg: QUEEN_SVG },
    { id: 'cat', name: '小猫', svg: CAT_SVG }
  ]
};
