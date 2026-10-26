/* 棋盘翻面：只画装饰层，局面、撤销栈和战绩仍由原来的模块管理。 */
import { REDUCE_MOTION } from '../core/config.js';
import { boardEl, gridEl } from '../core/dom.js';
import { state, view } from '../core/state.js';

const REWARD_URL = new URL('../../assets/victory-kitten.webp', import.meta.url).href;
const FLIP_MS = 500;
let active = null;
let version = 0;

// 开局就预载，通关时不用等图片下载；失败时仍正常放礼花、显示成绩。
const reward = new Image();
reward.src = REWARD_URL;
const rewardReady = reward.decode().then(() => true, () => false);

export function captureBoard() {
  if (boardEl.classList.contains('has-reward')) return { size: state.size, image: REWARD_URL };
  if (!view.cells.length || !state.regions) return null;
  const n = view.cells.length ** .5;
  const size = parseFloat(getComputedStyle(boardEl).getPropertyValue('--cell')) || 40;
  const line = parseFloat(getComputedStyle(boardEl).getPropertyValue('--bw')) || 2;
  return {
    size: n,
    cells: view.cells.map((cell, i) => {
      const css = getComputedStyle(cell);
      const r = Math.floor(i / n), c = i % n, g = state.regions[i];
      let edges = '';
      if (r > 0 && state.regions[i - n] !== g) edges += `M0 0H${size}`;
      if (c > 0 && state.regions[i - 1] !== g) edges += `M0 0V${size}`;
      if (r < n - 1 && state.regions[i + n] !== g) edges += `M0 ${size}H${size}`;
      if (c < n - 1 && state.regions[i + 1] !== g) edges += `M${size} 0V${size}`;
      const borders = `<svg class="flip-borders" viewBox="0 0 ${size} ${size}" preserveAspectRatio="none"><path d="${edges}" stroke-width="${line}"/></svg>`;
      return {
        html: cell.innerHTML + borders,
        background: css.backgroundColor,
        shadow: css.boxShadow,
        ink: css.getPropertyValue('--rc-ink'),
        veil: gridEl.classList.contains('has-skin') ? css.getPropertyValue('--sk-veil') || '1' : '0',
        mark: cell.matches('.is-x, .is-auto') ? getComputedStyle(cell.querySelector('.mark')).opacity : '0',
        piece: cell.classList.contains('is-q') ? '1' : '0'
      };
    })
  };
}

export function cancelBoardFlip(keepReward = false) {
  version++;
  if (active) {
    clearTimeout(active.timer);
    active.layer.remove();
    active.resolve(false);
    active = null;
  }
  const preserve = keepReward && boardEl.classList.contains('has-reward');
  if (!preserve) boardEl.querySelector('.board-flip')?.remove();
  boardEl.classList.remove('is-flipping');
  if (!preserve) boardEl.classList.remove('has-reward');
  gridEl.removeAttribute('aria-busy');
  if (!preserve) gridEl.removeAttribute('aria-hidden');
  view.flipping = false;
}

function face(snapshot, r, c, n, back) {
  const el = document.createElement('span');
  el.className = 'flip-face' + (back ? ' flip-back' : '');
  if (snapshot?.image) {
    el.classList.add('flip-picture');
    el.style.backgroundImage = `url("${snapshot.image}")`;
    el.style.backgroundSize = `${n * 100}% ${n * 100}%`;
    el.style.backgroundPosition = `${c / (n - 1) * 100}% ${r / (n - 1) * 100}%`;
  } else if (snapshot?.cells) {
    // 换尺寸时按相对位置取旧格，所有装饰仍在新棋盘的格子里翻转。
    const oldR = Math.min(snapshot.size - 1, Math.floor((r + .5) * snapshot.size / n));
    const oldC = Math.min(snapshot.size - 1, Math.floor((c + .5) * snapshot.size / n));
    const data = snapshot.cells[oldR * snapshot.size + oldC];
    el.innerHTML = data.html;
    el.style.backgroundColor = data.background;
    el.style.boxShadow = data.shadow;
    el.style.setProperty('--rc-ink', data.ink);
    el.style.setProperty('--sk-veil', data.veil);
    el.style.setProperty('--flip-mark', data.mark);
    el.style.setProperty('--flip-piece', data.piece);
  }
  return el;
}

function showPicture(layer) {
  layer.replaceChildren();
  layer.classList.add('is-reward');
  layer.style.backgroundImage = `url("${REWARD_URL}")`;
  layer.removeAttribute('aria-hidden');
  layer.setAttribute('role', 'img');
  layer.setAttribute('aria-label', '通关奖励：戴着小皇冠的可爱猫咪');
  boardEl.classList.add('has-reward');
  gridEl.setAttribute('aria-hidden', 'true');
}

function play(previous, next, isReward) {
  const n = state.size;
  if (REDUCE_MOTION && !isReward) return Promise.resolve(true);
  const layer = document.createElement('div');
  layer.className = 'board-flip';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.setProperty('--flip-n', String(n));
  layer.dataset.direction = isReward ? 'bottom-left' : 'top-left';

  if (REDUCE_MOTION) {
    boardEl.appendChild(layer);
    showPicture(layer);
    return Promise.resolve(true);
  }

  // 同一斜线依次推进，总波程封顶，16×16 也不用等数秒。
  const gap = Math.min(65, 540 / (2 * (n - 1)));
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const tile = document.createElement('span');
      tile.className = 'flip-tile';
      const card = document.createElement('span');
      card.className = 'flip-card';
      const diagonal = isReward ? n - 1 - r + c : r + c;
      card.style.setProperty('--flip-delay', `${diagonal * gap}ms`);
      card.append(face(previous, r, c, n, false), face(next, r, c, n, true));
      tile.appendChild(card);
      layer.appendChild(tile);
    }
  }

  return new Promise(resolve => {
    const task = { layer, resolve, timer: 0 };
    active = task;
    view.flipping = true;
    gridEl.setAttribute('aria-busy', 'true');
    boardEl.appendChild(layer);
    boardEl.classList.add('is-flipping');
    task.timer = window.setTimeout(() => {
      if (active !== task) return;
      if (isReward) showPicture(layer); else layer.remove();
      boardEl.classList.remove('is-flipping');
      gridEl.removeAttribute('aria-busy');
      view.flipping = false;
      active = null;
      resolve(true);
    }, FLIP_MS + 2 * (n - 1) * gap + 40);
  });
}

export function flipBoard(previous) {
  cancelBoardFlip();
  return play(previous, captureBoard(), false);
}

export async function revealReward(animate = true) {
  const ticket = version;
  const marks = state.marks;
  if (!await rewardReady) return version === ticket && state.marks === marks;
  if (version !== ticket || state.marks !== marks || state.status !== 'won') return false;
  const previous = captureBoard();
  cancelBoardFlip();
  if (!animate) {
    const layer = document.createElement('div');
    layer.className = 'board-flip';
    boardEl.appendChild(layer);
    showPicture(layer);
    return true;
  }
  return play(previous, { image: REWARD_URL }, true);
}
