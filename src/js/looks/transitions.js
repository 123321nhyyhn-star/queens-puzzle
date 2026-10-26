/* 翻面外观插件：选项、预览、资源和动作都在 looks/ 内。 */
import { captureTiles, flipTiles, preloadPicture } from './effects/tiles.js';

const kittenPicture = new URL('./assets/victory-kitten.webp', import.meta.url).href;
const starlightPicture = new URL('./assets/starlight-rabbit.webp', import.meta.url).href;
const picturePreview = url => '<svg viewBox="0 0 100 100" aria-hidden="true"><image href="' + url + '" width="100" height="100"/></svg>';
const icon = axis => '<svg viewBox="0 0 80 80" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round">' +
  (axis === 'ripple' ? '<circle cx="40" cy="40" r="11"/><circle cx="40" cy="40" r="23"/><path d="M8 40h5m54 0h5M40 8v5m0 54v5"/>' :
    axis === 'wave' ? '<path d="M14 20h52v12H14zm0 27h52v13H14zM26 37l14 6 14-6"/>' :
      '<path d="M13 14h22v22H13zm32 30h22v22H45zM45 15l20 8-5 20-20-8z"/>') + '</g></svg>';

export default {
  id: 'transitions', name: '翻面', note: '翻格、拼图与星光，只改变画法',
  stylesheet: new URL('./effects/tiles.css', import.meta.url).href,
  deals: [
    { id: 'diagonal', name: '斜向翻牌', desc: '从左上翻向右下', svg: icon('diagonal'),
      capture: captureTiles, play: ctx => flipTiles(ctx, { mode: 'diagonal' }) },
    { id: 'wave', name: '逐行翻页', desc: '横轴翻转，逐行向下推进', svg: icon('wave'),
      capture: captureTiles, play: ctx => flipTiles(ctx, { mode: 'wave' }) },
    { id: 'ripple', name: '涟漪翻面', desc: '从中央向四周展开', svg: icon('ripple'),
      capture: captureTiles, play: ctx => flipTiles(ctx, { mode: 'ripple' }) }
  ],
  reveals: [
    { id: 'kitten', name: '猫咪拼图', desc: '从左下翻向右上，拼出皇冠猫咪', svg: picturePreview(kittenPicture),
      preload: () => preloadPicture(kittenPicture),
      play: ctx => flipTiles(ctx, { mode: 'diagonal', picture: kittenPicture, label: '戴着小皇冠的可爱猫咪' }) },
    { id: 'starlight', name: '星光拼图', desc: '涟漪翻出抱着星星的月亮小兔，伴着一圈星光', svg: picturePreview(starlightPicture),
      preload: () => preloadPicture(starlightPicture),
      play: ctx => flipTiles(ctx, { mode: 'ripple', picture: starlightPicture, sparkle: true, label: '月亮上抱着星星的可爱小兔' }) }
  ]
};
