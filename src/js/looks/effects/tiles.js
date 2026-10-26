/* 翻面插件的画面工具，不读取或改写游戏状态。 */
const pictures = new Map();
export function preloadPicture(url) {
  if (!pictures.has(url)) {
    const image = new Image();
    image.src = url;
    pictures.set(url, image.decode().then(() => true, () => false));
  }
  return pictures.get(url);
}

export function captureTiles(ctx) {
  const reward = ctx.board.querySelector('.look-tiles.is-reward');
  if (reward) return { image: reward.dataset.picture };
  if (!ctx.cells.length) return null;
  const n = Math.sqrt(ctx.cells.length);
  const size = parseFloat(getComputedStyle(ctx.board).getPropertyValue('--cell')) || 40;
  const line = parseFloat(getComputedStyle(ctx.board).getPropertyValue('--bw')) || 2;
  return { n, cells: ctx.cells.map((cell, i) => {
    const css = getComputedStyle(cell), r = Math.floor(i / n), c = i % n, g = ctx.regions[i];
    let edges = '';
    if (r > 0 && ctx.regions[i - n] !== g) edges += `M0 0H${size}`;
    if (c > 0 && ctx.regions[i - 1] !== g) edges += `M0 0V${size}`;
    if (r < n - 1 && ctx.regions[i + n] !== g) edges += `M0 ${size}H${size}`;
    if (c < n - 1 && ctx.regions[i + 1] !== g) edges += `M${size} 0V${size}`;
    return {
      html: cell.innerHTML + `<svg class="look-tile-borders" viewBox="0 0 ${size} ${size}" preserveAspectRatio="none"><path d="${edges}" stroke-width="${line}"/></svg>`,
      color: css.backgroundColor, shadow: css.boxShadow, ink: css.getPropertyValue('--rc-ink'),
      veil: ctx.grid.classList.contains('has-skin') ? css.getPropertyValue('--sk-veil') || '1' : '0',
      mark: cell.matches('.is-x, .is-auto') ? getComputedStyle(cell.querySelector('.mark')).opacity : '0',
      piece: cell.classList.contains('is-q') ? '1' : '0'
    };
  }) };
}

function face(snapshot, r, c, n, back) {
  const el = document.createElement('span');
  el.className = 'look-tile-face' + (back ? ' look-tile-back' : '');
  if (snapshot?.image) {
    el.style.backgroundImage = `url("${snapshot.image}")`;
    el.style.backgroundSize = `${n * 100}% ${n * 100}%`;
    el.style.backgroundPosition = `${c / (n - 1) * 100}% ${r / (n - 1) * 100}%`;
  } else if (snapshot?.cells) {
    const rr = Math.min(snapshot.n - 1, Math.floor((r + .5) * snapshot.n / n));
    const cc = Math.min(snapshot.n - 1, Math.floor((c + .5) * snapshot.n / n));
    const data = snapshot.cells[rr * snapshot.n + cc];
    el.innerHTML = data.html;
    el.style.backgroundColor = data.color;
    el.style.boxShadow = data.shadow;
    el.style.setProperty('--rc-ink', data.ink);
    el.style.setProperty('--sk-veil', data.veil);
    el.style.setProperty('--look-mark', data.mark);
    el.style.setProperty('--look-piece', data.piece);
  }
  return el;
}

export async function flipTiles(ctx, options) {
  if (options.picture && !await preloadPicture(options.picture)) return true;
  if (ctx.signal.aborted) return false;
  const reward = !!options.picture;
  const animated = !ctx.reducedMotion && ctx.animate !== false;
  if (!reward && !animated) return true;
  // 作者原有的 deal 类保留在基座，只有选中本插件时才让它让位。
  for (const cell of ctx.cells) cell.classList.remove('deal');
  const previous = reward ? captureTiles(ctx) : ctx.previous;
  const next = reward ? { image: options.picture } : captureTiles(ctx);
  const layer = document.createElement('div');
  layer.className = 'look-tiles';
  layer.dataset.mode = options.mode;
  layer.dataset.direction = options.mode === 'ripple' ? 'center' : reward ? 'bottom-left' : 'top-left';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.setProperty('--look-n', ctx.n);
  const axis = options.mode === 'wave' ? '1, 0, 0' : options.mode === 'ripple' ? '1, 1, 0' : '0, 1, 0';
  layer.style.setProperty('--look-axis', axis);
  const maxDistance = options.mode === 'ripple' ? Math.hypot((ctx.n - 1) / 2, (ctx.n - 1) / 2) : 2 * (ctx.n - 1);
  const gap = Math.min(65, 540 / Math.max(1, maxDistance));
  let lastDelay = 0;

  if (animated) for (let r = 0; r < ctx.n; r++) for (let c = 0; c < ctx.n; c++) {
    const tile = document.createElement('span');
    tile.className = 'look-tile';
    const card = document.createElement('span');
    card.className = 'look-tile-card';
    const distance = options.mode === 'ripple' ? Math.hypot(r - (ctx.n - 1) / 2, c - (ctx.n - 1) / 2) :
      options.mode === 'wave' ? r + c * .12 : reward ? ctx.n - 1 - r + c : r + c;
    const delay = distance * gap;
    lastDelay = Math.max(lastDelay, delay);
    card.style.setProperty('--look-delay', `${delay}ms`);
    card.append(face(previous, r, c, ctx.n, false), face(next, r, c, ctx.n, true));
    tile.appendChild(card);
    layer.appendChild(tile);
  }

  return new Promise(resolve => {
    let timer = 0, completed = false;
    const clearBusy = () => {
      ctx.board.classList.remove('look-is-animating');
      ctx.grid.removeAttribute('aria-busy');
    };
    const remove = () => {
      layer.remove();
      if (!ctx.board.querySelector('.look-tiles.is-reward')) {
        ctx.board.classList.remove('look-has-reward');
        ctx.grid.removeAttribute('aria-hidden');
      }
    };
    ctx.signal.addEventListener('abort', () => {
      clearTimeout(timer);
      clearBusy();
      if (!(completed && reward && ctx.signal.reason?.keepReward)) remove();
      resolve(false);
    }, { once: true });
    const finish = () => {
      completed = true;
      clearBusy();
      if (reward) {
        layer.replaceChildren();
        layer.classList.add('is-reward');
        layer.dataset.picture = options.picture;
        layer.style.backgroundImage = `url("${options.picture}")`;
        layer.removeAttribute('aria-hidden');
        layer.setAttribute('role', 'img');
        layer.setAttribute('aria-label', options.label);
        ctx.board.classList.add('look-has-reward');
        ctx.grid.setAttribute('aria-hidden', 'true');
        ctx.retain(remove);
        if (options.sparkle && !ctx.reducedMotion) for (let i = 0; i < 8; i++) {
          const star = document.createElement('i');
          star.className = 'look-sparkle';
          const angle = i / 8 * Math.PI * 2;
          star.style.left = `${50 + Math.cos(angle) * 39}%`;
          star.style.top = `${50 + Math.sin(angle) * 39}%`;
          star.style.animationDelay = `${i * 65}ms`;
          layer.appendChild(star);
        }
      } else layer.remove();
      resolve(true);
    };
    ctx.board.appendChild(layer);
    if (animated) {
      ctx.board.classList.add('look-is-animating');
      ctx.grid.setAttribute('aria-busy', 'true');
      timer = window.setTimeout(finish, 540 + lastDelay);
    } else finish();
  });
}
