/* ============================================================================
 * looks/sky.js
 * 「天空」外观插件：云、太阳、月亮、彩虹……每种颜色一片天色。
 * ----------------------------------------------------------------------------
 * 这套跟前两套最大的不同在**深浅方向**：图形不是压暗，而是朝纸白提亮
 * （surface 上的 `ink: 'tint'`）。淡彩本来就浅，白一点的那层像浮在色块上的
 * 一层薄云 / 雾，比再压深一档更透气，也不会跟墨色的皇后、× 抢黑。
 *
 * 约定见 looks/index.js：viewBox 0 0 100 100、只给形状不给颜色、画在 20–80 之间。
 * ========================================================================== */

/* 一圈辐条：从 r=from 到 r=to、宽 w 的圆角短棒，绕中心均分 count 份 */
function spokes(count, from, to, w) {
  var out = '';
  for (var i = 0; i < count; i++) {
    var deg = Math.round(360 / count * i);
    out += '<rect x="' + (50 - w / 2) + '" y="' + from + '" width="' + w +
      '" height="' + (to - from) + '" rx="' + (w / 2) + '"' +
      (deg ? ' transform="rotate(' + deg + ' 50 50)"' : '') + '/>';
  }
  return out;
}

export var MOTIFS = [
  /* 0  #EDC5C5 云 */
  '<g><circle cx="36" cy="54" r="14"/><circle cx="56" cy="44" r="18"/>' +
    '<circle cx="74" cy="56" r="12"/><rect x="22" y="54" width="52" height="14" rx="7"/></g>',

  /* 1  #FAB6A5 太阳 */
  '<circle cx="50" cy="50" r="17"/>' + spokes(8, 14, 29, 5),

  /* 2  #F9C494 月牙 */
  '<path fill-rule="evenodd" d="M50 18a32 32 0 1 0 0 64 32 32 0 1 0 0-64z' +
    'M64 24a26 26 0 1 0 0 52 26 26 0 1 0 0-52z"/>',

  /* 3  #E4D1AA 四角星 */
  '<path d="M50 16c4 18 12 26 30 34-18 8-26 16-30 34-4-18-12-26-30-34 ' +
    '18-8 26-16 30-34z"/>',

  /* 4  #EAEAA4 彩虹 */
  '<g fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round">' +
    '<path d="M18 76a32 32 0 0164 0"/>' +
    '<path d="M34 76a16 16 0 0132 0"/></g>',

  /* 5  #E0F4CF 雨（三滴） */
  '<g><path d="M34 28c0 0 10 12 10 19a10 10 0 01-20 0c0-7 10-19 10-19z"/>' +
    '<path d="M64 40c0 0 10 12 10 19a10 10 0 01-20 0c0-7 10-19 10-19z"/>' +
    '<path d="M46 56c0 0 10 12 10 19a10 10 0 01-20 0c0-7 10-19 10-19z"/></g>',

  /* 6  #B2E4AA 闪电 */
  '<path d="M58 12L26 56h20l-6 32 34-46H54z"/>',

  /* 7  #94F9DE 风 */
  '<g fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round">' +
    '<path d="M18 38h36a10 10 0 10-8-16"/>' +
    '<path d="M22 60h44a10 10 0 11-10 14"/></g>',

  /* 8  #AAE4D5 热气球 */
  '<path d="M50 12c17 0 28 13 28 28 0 16-16 25-28 34-12-9-28-18-28-34 0-15 11-28 28-28z"/>' +
    '<rect x="43" y="74" width="14" height="12" rx="3"/>',

  /* 9  #94F3F9 风筝（纸飞机几个面叠成一块，看着只是个三角） */
  '<g><path d="M50 10L80 40L50 78L20 40Z"/>' +
    '<path d="M50 78c-2 8-8 12-16 14" fill="none" stroke="currentColor" ' +
    'stroke-width="4" stroke-linecap="round"/></g>',

  /* 10 #CFF1F4 彗星 */
  '<circle cx="64" cy="34" r="13"/>' +
    '<path d="M54 44L18 80l16-2 24-26z"/>',

  /* 11 #9FDAEF 星座 */
  '<path d="M28 66L46 40M54 36L72 56" fill="none" stroke="currentColor" ' +
    'stroke-width="4" stroke-linecap="round"/>' +
    '<g><circle cx="26" cy="68" r="7"/><circle cx="50" cy="34" r="9"/>' +
    '<circle cx="74" cy="58" r="6"/></g>',

  /* 12 #94CAF9 云雨 */
  '<g><circle cx="40" cy="40" r="12"/><circle cx="58" cy="34" r="15"/>' +
    '<circle cx="72" cy="42" r="10"/><rect x="28" y="40" width="48" height="12" rx="6"/></g>' +
    '<g><path d="M38 60c0 0 7 8 7 13a7 7 0 01-14 0c0-5 7-13 7-13z"/>' +
    '<path d="M62 60c0 0 7 8 7 13a7 7 0 01-14 0c0-5 7-13 7-13z"/></g>',

  /* 13 #B9C2F8 光芒 */
  spokes(8, 16, 42, 9),

  /* 14 #E1DAFB 雾（三道横线） */
  '<g fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round">' +
    '<path d="M22 34h30"/><path d="M40 52h42"/><path d="M26 70h30"/></g>',

  /* 15 #DFB9F8 双星 */
  '<path d="M40 20c2 11 6 15 17 19-11 4-15 8-17 19-2-11-6-15-17-19 11-4 15-8 17-19z"/>' +
    '<path d="M68 52c1.5 7 4 9.5 11 12-7 2.5-9.5 5-11 12-1.5-7-4-9.5-11-12 ' +
    '7-2.5 9.5-5 11-12z"/>',

  /* 16 #F7CDF7 龙卷 */
  '<g><rect x="20" y="22" width="60" height="9" rx="4.5"/>' +
    '<rect x="26" y="38" width="48" height="9" rx="4.5"/>' +
    '<rect x="34" y="54" width="34" height="9" rx="4.5"/>' +
    '<rect x="42" y="70" width="18" height="9" rx="4.5"/></g>' +
    '<path d="M60 86c8 0 12-4 12-9" fill="none" stroke="currentColor" ' +
    'stroke-width="6" stroke-linecap="round"/>',

  /* 17 #FBB6D6 日晕 */
  '<path fill-rule="evenodd" d="M50 12a38 38 0 1 0 0 76 38 38 0 1 0 0-76z' +
    'M50 24a26 26 0 1 1 0 52 26 26 0 1 1 0-52z"/>' +
    '<circle cx="50" cy="50" r="7"/>'
];

export default {
  id: 'sky',
  name: '天空',
  note: '每种颜色一片天色',

  surfaces: [
    {
      id: 'sky',
      name: '天空',
      /* 提亮而不是压暗：0.22 是「一层薄云拂过」的分寸。
       * 淡彩本来就浅，掺白少了直接糊成一片，多了就发白、像掉色。 */
      ink: 'tint',
      tone: 0.22,
      motifs: MOTIFS,
      desc: '每种颜色一片云 / 日光 / 星，朝纸白提亮一档'
    }
  ]
};
