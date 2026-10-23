/* ============================================================================
 * looks/nature.js
 * 「自然」外观插件：叶、花、蘑菇、松果……每种颜色一枝东西。
 * ----------------------------------------------------------------------------
 * 跟几何那套的区别在语气：那边是直线、正圆、对称；这边都是有机形——
 * 一片叶子、一朵花、一条藤，边缘是弧的，重心偏一点也没关系。
 *
 * 图形按 core/palette.js 的调色板下标排（一种颜色一枚，18 枚）。
 * 约定见 looks/index.js：viewBox 0 0 100 100、只给形状不给颜色、画在 20–80 之间。
 * ========================================================================== */

export var MOTIFS = [
  /* 0  #EDC5C5 叶 */
  '<path d="M30 70C30 44 48 24 74 22C76 48 58 70 30 70Z"/>' +
  '<path d="M30 70L22 80" fill="none" stroke="currentColor" stroke-width="5" ' +
    'stroke-linecap="round"/>',

  /* 1  #FAB6A5 花（五瓣 + 茎） */
  '<g><circle cx="50" cy="26" r="13"/><circle cx="66" cy="38" r="13"/>' +
    '<circle cx="60" cy="56" r="13"/><circle cx="40" cy="56" r="13"/>' +
    '<circle cx="34" cy="38" r="13"/></g>' +
    '<path d="M50 60V84" fill="none" stroke="currentColor" stroke-width="5" ' +
    'stroke-linecap="round"/>',

  /* 2  #F9C494 蘑菇 */
  '<path d="M16 47a34 26 0 0168 0z"/>' +
    '<path d="M39 47h22v18c0 7-5 12-11 12s-11-5-11-12z"/>',

  /* 3  #E4D1AA 麦穗 */
  '<path d="M50 86V26" fill="none" stroke="currentColor" stroke-width="5" ' +
    'stroke-linecap="round"/>' +
    '<path d="M50 72C36 70 24 59 22 45c15 1 26 12 28 27z"/>' +
    '<path d="M50 72C64 70 76 59 78 45c-15 1-26 12-28 27z"/>' +
    '<path d="M50 52C38 50 27 40 25 28c14 1 24 11 25 24z"/>' +
    '<path d="M50 52C62 50 73 40 75 28c-14 1-24 11-25 24z"/>' +
    '<ellipse cx="50" cy="24" rx="6" ry="8"/>',

  /* 4  #EAEAA4 草（三片叶子） */
  '<path d="M26 82C26 60 34 44 44 36C46 54 40 72 34 82Z"/>' +
    '<path d="M48 84C44 58 46 38 56 26C60 46 56 68 52 84Z"/>' +
    '<path d="M62 82C64 64 70 52 80 44C78 58 72 72 68 82Z"/>',

  /* 5  #E0F4CF 蕨（一根弯茎 + 六片小叶） */
  '<path d="M28 84C34 62 46 42 66 28" fill="none" stroke="currentColor" ' +
    'stroke-width="5" stroke-linecap="round"/>' +
    '<ellipse cx="34" cy="64" rx="15" ry="7" transform="rotate(-42 34 64)"/>' +
    '<ellipse cx="50" cy="68" rx="15" ry="7" transform="rotate(28 50 68)"/>' +
    '<ellipse cx="44" cy="48" rx="14" ry="6.5" transform="rotate(-42 44 48)"/>' +
    '<ellipse cx="60" cy="50" rx="14" ry="6.5" transform="rotate(28 60 50)"/>' +
    '<ellipse cx="56" cy="32" rx="12" ry="6" transform="rotate(-42 56 32)"/>' +
    '<ellipse cx="70" cy="36" rx="12" ry="6" transform="rotate(28 70 36)"/>',

  /* 6  #B2E4AA 松树 */
  '<path d="M50 14L66 36H34Z"/>' +
    '<path d="M50 30L72 56H28Z"/>' +
    '<path d="M50 48L78 78H22Z"/>' +
    '<rect x="44" y="76" width="12" height="8" rx="2"/>',

  /* 7  #94F9DE 水滴 */
  '<path d="M50 16C62 34 74 46 74 59a24 24 0 01-48 0c0-13 12-25 24-43z"/>',

  /* 8  #AAE4D5 橡果 */
  '<path d="M22 44a28 18 0 0156 0z"/>' +
    '<path d="M28 46h44v14c0 12-10 20-22 20s-22-8-22-20z"/>' +
    '<path d="M50 26V16" fill="none" stroke="currentColor" stroke-width="5" ' +
    'stroke-linecap="round"/>',

  /* 9  #94F3F9 水纹（三道波） */
  '<g fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round">' +
    '<path d="M20 38q11-13 22 0t22 0"/>' +
    '<path d="M36 56q11-13 22 0t22 0"/>' +
    '<path d="M20 74q11-13 22 0t22 0"/></g>',

  /* 10 #CFF1F4 蒲公英（一颗种子球） */
  '<circle cx="50" cy="56" r="9"/>' +
    '<g fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round">' +
    '<path d="M50 47V22"/><path d="M58 51L74 32"/><path d="M42 51L26 32"/>' +
    '<path d="M61 61L80 60"/><path d="M39 61L20 60"/></g>' +
    '<g><circle cx="50" cy="20" r="3.4"/><circle cx="76" cy="30" r="3.4"/>' +
    '<circle cx="24" cy="30" r="3.4"/><circle cx="82" cy="60" r="3.4"/>' +
    '<circle cx="18" cy="60" r="3.4"/></g>',

  /* 11 #9FDAEF 珊瑚 */
  '<g fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round">' +
    '<path d="M50 84V48"/>' +
    '<path d="M50 62C40 56 34 44 36 30"/>' +
    '<path d="M50 56C60 50 66 38 64 24"/>' +
    '<path d="M40 72C32 68 28 60 28 52"/>' +
    '<path d="M60 74C68 70 72 62 72 54"/></g>',

  /* 12 #94CAF9 蝴蝶 */
  '<path d="M48 46C40 28 24 20 16 30c-6 8 0 18 12 22z"/>' +
    '<path d="M52 46C60 28 76 20 84 30c6 8 0 18-12 22z"/>' +
    '<path d="M46 52C36 62 24 68 20 62c-4-6 2-14 12-16z"/>' +
    '<path d="M54 52C64 62 76 68 80 62c4-6-2-14-12-16z"/>' +
    '<rect x="45" y="40" width="10" height="34" rx="5"/>' +
    '<path d="M46 40C42 30 38 26 34 24M54 40C58 30 62 26 66 24" fill="none" ' +
    'stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',

  /* 13 #B9C2F8 藤蔓 */
  '<g fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round">' +
    '<path d="M30 86C30 66 48 60 56 50 64 40 62 28 50 26"/>' +
    '<path d="M56 50C68 48 76 42 78 32"/></g>' +
    '<ellipse cx="42" cy="70" rx="9" ry="5" transform="rotate(-35 42 70)"/>' +
    '<ellipse cx="66" cy="44" rx="8" ry="4.5" transform="rotate(20 66 44)"/>',

  /* 14 #E1DAFB 花穗 */
  '<path d="M50 86V44" fill="none" stroke="currentColor" stroke-width="5" ' +
    'stroke-linecap="round"/>' +
    '<circle cx="50" cy="20" r="6"/><circle cx="41" cy="30" r="6"/>' +
    '<circle cx="59" cy="30" r="6"/><circle cx="42" cy="42" r="6"/>' +
    '<circle cx="58" cy="42" r="6"/>',

  /* 15 #DFB9F8 树 */
  '<g><circle cx="50" cy="30" r="15"/><circle cx="34" cy="45" r="14"/>' +
    '<circle cx="66" cy="45" r="14"/><circle cx="50" cy="52" r="16"/></g>' +
    '<rect x="45" y="64" width="10" height="20" rx="3"/>',

  /* 16 #F7CDF7 仙人掌 */
  '<g><rect x="43" y="24" width="14" height="58" rx="7"/>' +
    '<rect x="26" y="42" width="11" height="22" rx="5.5"/>' +
    '<rect x="26" y="55" width="24" height="11" rx="5.5"/>' +
    '<rect x="63" y="34" width="11" height="24" rx="5.5"/>' +
    '<rect x="50" y="47" width="24" height="11" rx="5.5"/></g>',

  /* 17 #FBB6D6 浆果 */
  '<path d="M50 44V22" fill="none" stroke="currentColor" stroke-width="5" ' +
    'stroke-linecap="round"/>' +
    '<path d="M50 32C44 26 36 26 32 30" fill="none" stroke="currentColor" ' +
    'stroke-width="4" stroke-linecap="round"/>' +
    '<circle cx="50" cy="56" r="12"/><circle cx="33" cy="66" r="10"/>' +
    '<circle cx="67" cy="66" r="10"/>'
];

export default {
  id: 'nature',
  name: '自然',
  note: '每种颜色一枝东西',

  surfaces: [
    {
      id: 'nature',
      name: '自然',
      /* 有机形比几何形块头大、边也软，压暗 0.05 刚好：能看出是一片叶子，
       * 又不会让满盘的叶子盖住 × 和皇后。 */
      tone: 0.05,
      motifs: MOTIFS,
      desc: '每种颜色一枚叶片 / 花果 / 小虫，压暗一档'
    }
  ]
};
