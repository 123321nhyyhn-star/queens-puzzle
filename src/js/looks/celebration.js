/* 礼炮外观插件：粒子与样式都独立于游戏结算。 */
const heart = '<svg viewBox="0 0 80 80" aria-hidden="true"><path d="M40 62L16 38C0 19 25 6 40 25 55 6 80 19 64 38Z" fill="#ed8d9c"/><path d="M10 12l5 6m50-5-5 6M39 5v9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
const firework = '<svg viewBox="0 0 80 80" aria-hidden="true"><g stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M40 9v15m0 32v15M9 40h15m32 0h15M18 18l10 10m24 24 10 10m0-44L52 28M28 52 18 62"/></g><circle cx="40" cy="40" r="7" fill="#efc768"/></svg>';

function launch(ctx, type) {
  if (ctx.reducedMotion || ctx.signal.aborted) return true;
  const rect = ctx.board.getBoundingClientRect();
  const root = document.createElement('div');
  root.className = 'look-celebration';
  root.dataset.kind = type;
  root.setAttribute('aria-hidden', 'true');
  const colors = ['#e98b9e', '#edb65e', '#81bcaa', '#a794cb', '#79abcf'];
  const count = type === 'hearts' ? 30 : 48;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    p.className = 'look-particle';
    const group = i % 3;
    const angle = (Math.floor(i / 3) / (count / 3)) * Math.PI * 2;
    const radius = rect.width * (.3 + Math.random() * .18);
    p.style.left = (rect.left + rect.width * (type === 'hearts' ? .15 + Math.random() * .7 : [.25, .5, .75][group])) + 'px';
    p.style.top = (rect.top + rect.height * (type === 'hearts' ? .55 + Math.random() * .25 : [.5, .3, .5][group])) + 'px';
    p.style.setProperty('--particle-color', colors[i % colors.length]);
    p.style.setProperty('--particle-x', (type === 'hearts' ? (Math.random() - .5) * rect.width * .5 : Math.cos(angle) * radius) + 'px');
    p.style.setProperty('--particle-y', (type === 'hearts' ? -rect.height * (.55 + Math.random() * .5) : Math.sin(angle) * radius) + 'px');
    p.style.setProperty('--particle-delay', (type === 'hearts' ? i * 16 : group * 150) + 'ms');
    root.appendChild(p);
  }
  ctx.fx.appendChild(root);
  const timer = window.setTimeout(() => root.remove(), 2200);
  ctx.signal.addEventListener('abort', () => { clearTimeout(timer); root.remove(); }, { once: true });
  return true;
}

export default {
  id: 'celebration', name: '庆祝', note: '换一阵礼花，不改变成绩',
  stylesheet: new URL('./effects/celebration.css', import.meta.url).href,
  confettis: [
    { id: 'hearts', name: '爱心礼花', desc: '柔和彩色爱心缓缓升起', svg: heart, play: ctx => launch(ctx, 'hearts') },
    { id: 'fireworks', name: '星芒礼炮', desc: '三束彩色星芒依次绽放', svg: firework, play: ctx => launch(ctx, 'fireworks') },
    { id: 'quiet', name: '安静庆祝', desc: '保留通关效果，收起礼花', svg: '<svg viewBox="0 0 80 80" aria-hidden="true"><path d="M17 40l15 15 31-33" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>', play: () => true }
  ]
};
