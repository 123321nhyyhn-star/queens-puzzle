/* ============================================================================
 * share-code.js
 * 棋盘分享码：编码 / 解码 / 校验（纯函数，不碰 DOM，方便单测）。
 * ========================================================================== */

import { SIZE_MAX, SIZE_MIN } from '../core/config.js';

/* ==========================================================
   分享棋盘
   ----------------------------------------------------------
   代码形如  QNS1-08-<色块>-<解>-<校验>
     · QNS1    版本标记
     · 08      两位十进制边长（04–16）
     · 色块    n*n 个十六进制字符，按行给出每格属于哪个色块
     · 解      n 个十六进制字符，第 r 位是第 r 行皇后所在的列
     · 校验    FNV-1a 32 位取 base36 后 6 位，抄漏一位会被认出来
   解析时宽容处理：空格、换行、大小写、多余的连字符都忽略。
   ========================================================== */
var SHARE_TAG = 'QNS1';
var HEX16 = '0123456789ABCDEF';

function hexOf(v) { return HEX16.charAt(v & 15); }

function shareChecksum(str) {
  var h = 0x811C9DC5;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  var s = h.toString(36).toUpperCase();
  while (s.length < 6) s = '0' + s;
  return s.slice(-6);
}

export function encodeShare(n, regions, solution) {
  var nn = (n < 10 ? '0' : '') + n;
  var body = '', sol = '', i;
  for (i = 0; i < n * n; i++) body += hexOf(regions[i]);
  for (i = 0; i < n; i++) sol += hexOf(solution[i]);
  return SHARE_TAG + '-' + nn + '-' + body + '-' + sol + '-' + shareChecksum(nn + body + sol);
}

export function decodeShare(raw) {
  function bad(msg) { return { ok: false, msg: msg }; }

  var s = String(raw === undefined || raw === null ? '' : raw)
    .toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (s.length < 20) return bad('代码太短了，看看是不是没复制全');
  if (s.slice(0, 4) !== SHARE_TAG) return bad('这不是皇后棋盘代码，应该以 QNS1 开头');

  var n = parseInt(s.slice(4, 6), 10);
  if (!(n >= SIZE_MIN && n <= SIZE_MAX)) return bad('代码里的棋盘尺寸不对');

  var need = 4 + 2 + n * n + n + 6;
  if (s.length < need) return bad('代码不完整，少了 ' + (need - s.length) + ' 位');
  if (s.length > need) return bad('代码比预期的长 ' + (s.length - need) + ' 位');

  var body = s.slice(6, 6 + n * n);
  var sol = s.slice(6 + n * n, 6 + n * n + n);
  var sum = s.slice(need - 6);
  if (!/^[0-9A-F]+$/.test(body) || !/^[0-9A-F]+$/.test(sol)) return bad('代码里有认不出的字符');
  if (shareChecksum(s.slice(4, need - 6)) !== sum) return bad('校验没通过，可能抄错或漏了一位');

  var regions = new Uint8Array(n * n);
  var solution = new Int8Array(n);
  var i, v;
  for (i = 0; i < n * n; i++) {
    v = parseInt(body.charAt(i), 16);
    if (v >= n) return bad('代码内容不合法：色块编号超出范围');
    regions[i] = v;
  }
  for (i = 0; i < n; i++) {
    v = parseInt(sol.charAt(i), 16);
    if (v >= n) return bad('代码内容不合法：皇后位置超出范围');
    solution[i] = v;
  }
  return { ok: true, size: n, regions: regions, solution: solution };
}

export function shareFailText(reason) {
  if (!reason) return '这盘棋验证不通过';
  if (reason.indexOf('solutions=') === 0) {
    var c = parseInt(reason.slice(10), 10);
    return c > 0 ? ('这盘棋不止一个解（' + c + ' 个），没法玩') : '这盘棋没有解，代码可能被改过';
  }
  if (reason.indexOf('disconnected') === 0) return '有色块没连成一片，代码可能被改过';
  if (reason === 'empty region') return '有色块是空的，代码可能被改过';
  if (reason === 'bad region id') return '色块编号不对，代码可能被改过';
  if (reason === 'solver aborted') return '这盘棋太复杂，验算超时了';
  return '这盘棋的解法对不上，代码可能被改过';
}
