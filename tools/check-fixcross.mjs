/* 「画错 ×」这条路径的界面检查：答案格被画成 ×，引导应先说「这里画错了」，
 * 照做后清掉这个 ×，再给一次提示就该落子、然后赢。 */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/CJL/.workbuddy/binaries/node/workspace/');
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=2']
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__QUEENS_DEBUG__ && __QUEENS_DEBUG__.state.vibe', { timeout: 20000 });
await page.evaluate(() => __QUEENS_DEBUG__.newGame(8));
await page.waitForFunction('__QUEENS_DEBUG__.state.size === 8 && __QUEENS_DEBUG__.state.vibe', { timeout: 30000 });
await sleep(300);

const setup = await page.evaluate(() => {
  const s = __QUEENS_DEBUG__.state, n = s.size;
  for (let r = 0; r < n - 1; r++) s.marks[r * n + s.solution[r]] = 2;
  const last = (n - 1) * n + s.solution[n - 1];
  s.marks[last] = 1;
  __QUEENS_DEBUG__.render();
  return { last, row: n - 1, col: s.solution[n - 1] };
});
await sleep(350);
await page.click('#btnHint');
await sleep(340);
const g = await page.evaluate(() => {
  const gg = __QUEENS_DEBUG__.guide();
  return gg.open ? { kind: gg.plan.kind, rule: gg.plan.rule, steps: gg.plan.steps.map(s => s.text), action: gg.plan.action } : null;
});
console.log('画错 × 的格:', JSON.stringify(setup));
console.log('引导:', JSON.stringify(g));

for (let i = 1; i < g.steps.length; i++) { await page.click('#coachNext'); await sleep(150); }
await page.screenshot({ path: 'E:/Projects/Games/queens-puzzle/tools/shots/guide-fixcross.png' });
await page.click('#coachNext');
await sleep(600);
const after = await page.evaluate((i) => ({
  mark: __QUEENS_DEBUG__.state.marks[i],
  open: __QUEENS_DEBUG__.guide().open,
  glEmpty: document.getElementById('gl').childElementCount === 0,
  isGuiding: document.getElementById('stage').classList.contains('is-guiding')
}), setup.last);
console.log('照做后:', JSON.stringify(after));

// 再点一次提示：应该直接落子
await page.click('#btnHint');
await sleep(340);
const g2 = await page.evaluate(() => {
  const gg = __QUEENS_DEBUG__.guide();
  return gg.open ? { kind: gg.plan.kind, steps: gg.plan.steps.map(s => s.text) } : null;
});
console.log('第二次提示:', JSON.stringify(g2));
console.log('错误:', errs.length ? errs : '无');
await browser.close();
