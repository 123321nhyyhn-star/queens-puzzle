/* 先把棋盘推到「纯逻辑推不动」的状态（等价于玩家自己走了一段），
 * 再打开引导，抓 L4 试推 / L5 该猜了 两档的界面。
 * 用的就是页面里那份 QueensHint，所以和真实引导完全一致。 */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/CJL/.workbuddy/binaries/node/workspace/');
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const OUT = 'E:/Projects/Games/queens-puzzle/tools/shots';
const n = parseInt(process.argv[2] || '10', 10);
const want = process.argv[3] || 'P';       // P = 试推，G = 该猜了

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=2']
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__QUEENS_DEBUG__ && __QUEENS_DEBUG__.state.vibe', { timeout: 20000 });
await sleep(300);

let ok = false;
for (let trial = 0; trial < 12 && !ok; trial++) {
  await page.evaluate((nn) => __QUEENS_DEBUG__.newGame(nn), n);
  await page.waitForFunction((nn) => __QUEENS_DEBUG__.state.size === nn && __QUEENS_DEBUG__.state.vibe, { timeout: 30000 }, n);
  await sleep(240);

  const res = await page.evaluate((wantRule) => {
    const st = __QUEENS_DEBUG__.state;
    const H = window.QueensHint;
    const w = st.size;
    const mk = new Uint8Array(st.marks);
    let guard = 0;
    while (guard++ < 200) {
      const p = H.plan({ n: w, regions: st.regions, solution: st.solution, marks: mk, auto: null, maxK: 3, allowProbe: true });
      if (!p || !p.steps || p.kind === 'done' || p.kind === 'none') return { stuck: true };
      if (p.rule === wantRule) {
        // 把推到这里为止的痕迹写回棋盘，然后让 UI 重画
        st.marks = mk;
        __QUEENS_DEBUG__.render();
        return { hit: true, kind: p.kind, rule: p.rule, steps: p.steps.map(s => s.text) };
      }
      if (!p.action) return { stuck: true };
      if (p.action.type === 'place') mk[p.action.cell] = 2;
      else if (p.action.type === 'cross') for (const c of p.action.cells) mk[c] = 1;
      else mk[p.action.cell] = 0;
    }
    return { stuck: true };
  }, want);

  if (res.hit) {
    await sleep(320);
    await page.click('#btnHint');
    await sleep(360);
    console.log(`trial ${trial}: ${res.rule}/${res.kind}`);
    res.steps.forEach((t, i) => console.log('  ', i, t));
    const info = await page.evaluate(() => ({
      h: Math.round(document.getElementById('coach').getBoundingClientRect().height),
      tier: document.getElementById('coachTier').textContent,
      next: document.getElementById('coachNext').textContent
    }));
    console.log('面板高', info.h, '角标', info.tier, '末步按钮', info.next);
    for (let i = 0; i < res.steps.length; i++) {
      await sleep(420);
      await page.screenshot({ path: `${OUT}/${want}-${i + 1}.png` });
      if (i < res.steps.length - 1) { await page.click('#coachNext'); await sleep(140); }
    }
    ok = true;
  }
}
if (!ok) console.log(`12 盘都没找到 ${want} 步`);
await browser.close();
