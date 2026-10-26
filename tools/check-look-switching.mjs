/* 通关后及翻图期间切换外观的浏览器回归。
 * node tools/check-look-switching.mjs [url]；依赖与 check-look-effects.mjs 相同。 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({
  executablePath: process.env.QUEENS_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true
});
const url = process.argv[2] || 'http://127.0.0.1:8080/';
let checks = 0;
let page;
const errors = [];
function check(name, condition) { assert.ok(condition, name); checks++; console.log('PASS ' + name); }
const settled = async page => {
  const effects = await page.evaluateHandle(async () => import('/src/js/looks/effects.js'));
  await page.waitForFunction(effects => !effects.isLookBusy() && !document.querySelector('.board.look-is-animating'), effects);
  await effects.dispose();
};
const solve = async page => {
  const actions = await page.evaluateHandle(async () => import('/src/js/app/actions.js'));
  await page.waitForFunction(actions => actions.canPlay(), actions);
  await actions.dispose();
  const outcome = await page.evaluate(async () => {
    const d = window.__QUEENS_DEBUG__;
    const { placeQueen, canPlay } = await import('/src/js/app/actions.js');
    const { view } = await import('/src/js/core/state.js');
    const before = { canPlay: canPlay(), sheet: view.sheet, rolling: view.rolling, filling: view.filling };
    for (let r = 0; r < d.state.size; r++) placeQueen(r * d.state.size + d.state.solution[r]);
    return { before, status: d.state.status, marks: [...d.state.marks], solution: [...d.state.solution] };
  });
  assert.equal(outcome.status, 'won', JSON.stringify(outcome));
};
const monitor = page => page.evaluate(() => {
  window.lookObserver?.disconnect();
  window.lookEvents = { sparkles: 0, fireworks: 0, hearts: 0, confetti: 0, results: 0 };
  window.lookObserver = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches('.look-sparkle')) window.lookEvents.sparkles++;
        if (node.matches('.look-celebration')) window.lookEvents[node.dataset.kind]++;
        if (node.matches('.confetti')) window.lookEvents.confetti++;
      }
      if (record.type === 'attributes' && record.target.id === 'result' && !record.target.hidden) window.lookEvents.results++;
    }
  });
  window.lookObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
});
const directPick = (page, selections) => page.evaluate(async selections => {
  const { pickLook } = await import('/src/js/ui/panels/look.js');
  for (const [kind, id] of selections) pickLook(kind, id);
}, selections);

try {
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__QUEENS_DEBUG__?.state.regions?.length);
  await settled(page);
  await directPick(page, [['reveal', 'starlight'], ['confetti', 'hearts']]);
  await page.evaluate(async () => {
    const { findOf } = await import('/src/js/looks/index.js');
    await Promise.all(['kitten', 'starlight'].map(id => findOf('reveal', id).preload()));
  });
  await monitor(page);
  await solve(page);
  await page.waitForSelector('#result:not([hidden])');
  check('星光拼图通关只播放一轮星光和所选爱心礼花', await page.evaluate(() =>
    lookEvents.sparkles === 8 && lookEvents.hearts === 1 && lookEvents.fireworks === 0 && lookEvents.results === 1));
  await page.click('#btnPeek');
  await page.waitForSelector('.look-celebration', { state: 'detached' });
  await page.evaluate(() => {
    window.savedReward = document.querySelector('.look-tiles.is-reward');
    window.savedRecords = localStorage.getItem('queens.records.v1');
  });
  await monitor(page);
  const pick = async (kind, id) => {
    await page.click('#btnLook');
    await page.click(`.showcase[data-${kind}="${id}"]`);
    await page.click('#btnLookDone');
  };
  for (const id of ['fireworks', 'quiet', 'hearts', 'original', 'fireworks']) await pick('confetti', id);
  check('通关后反复切换礼炮保留同一张图片', await page.evaluate(() => savedReward === document.querySelector('.look-tiles.is-reward')));
  check('切换礼炮不重放星光、礼花或结果卡', await page.evaluate(() => Object.values(lookEvents).every(count => count === 0)));
  check('切换礼炮不重复记战绩', await page.evaluate(() => savedRecords === localStorage.getItem('queens.records.v1')));

  await directPick(page, [['reveal', 'kitten']]);
  await page.waitForSelector('.look-tiles.is-reward[data-picture$="victory-kitten.webp"]');
  await monitor(page);
  await pick('reveal', 'starlight');
  await page.waitForSelector('.look-tiles.is-reward[data-picture$="starlight-rabbit.webp"]');
  check('通关后切换图片只显示静态预览，不重放星光或礼炮', await page.evaluate(() =>
    document.querySelectorAll('.look-sparkle, .look-celebration').length === 0 && Object.values(lookEvents).every(count => count === 0)));
  await page.reload();
  await page.waitForSelector('.look-tiles.is-reward');
  check('恢复已通关存档不会重放星光或礼炮', await page.locator('.look-sparkle, .look-celebration, .confetti').count() === 0);

  await directPick(page, [['reveal', 'kitten'], ['confetti', 'fireworks']]);
  await page.evaluate(() => window.__QUEENS_DEBUG__.retry());
  await settled(page);
  await monitor(page);
  await solve(page);
  await page.waitForSelector('.board.look-is-animating .look-tiles');
  await page.evaluate(() => { window.savedReveal = document.querySelector('.look-tiles'); });
  await directPick(page, [['confetti', 'quiet'], ['deal', 'wave'], ['confetti', 'hearts'], ['confetti', 'fireworks']]);
  check('翻图期间切换礼炮和开局样式不重建通关动画', await page.evaluate(() => savedReveal === document.querySelector('.look-tiles')));
  await page.waitForSelector('.look-celebration[data-kind="fireworks"]');
  check('猫咪拼图可以搭配星芒礼炮，且在图片完成后播放', await page.evaluate(() =>
    document.querySelector('.look-tiles.is-reward').dataset.picture.endsWith('/victory-kitten.webp') &&
    document.querySelectorAll('.look-particle').length === 48 && lookEvents.fireworks === 1 && lookEvents.hearts === 0 && lookEvents.sparkles === 0));
  await page.waitForSelector('#result:not([hidden])');
  await page.click('#btnPeek');
  await page.waitForSelector('.look-celebration', { state: 'detached' });
  check('翻图期间切换只结算一次', await page.evaluate(() => lookEvents.results === 1 && lookEvents.fireworks === 1));

  await page.evaluate(() => window.__QUEENS_DEBUG__.retry());
  await settled(page);
  await monitor(page);
  await solve(page);
  await page.waitForSelector('.board.look-is-animating .look-tiles');
  await directPick(page, [['reveal', 'starlight'], ['reveal', 'kitten'], ['reveal', 'starlight']]);
  await page.waitForSelector('#result:not([hidden])');
  await page.click('#btnPeek');
  await page.waitForSelector('.look-celebration', { state: 'detached' });
  check('翻图期间连续换图片最终只播放一轮星光、礼炮和结果', await page.evaluate(() =>
    lookEvents.sparkles === 8 && lookEvents.fireworks === 1 && lookEvents.results === 1 &&
    document.querySelector('.look-tiles.is-reward').dataset.picture.endsWith('/starlight-rabbit.webp')));
  check('浏览器无脚本错误', errors.length === 0);
  console.log(`\n${checks} checks passed.`);
} catch (error) {
  console.error('Browser errors:', errors);
  if (page) console.error('Game state:', await page.evaluate(async () => {
    const d = window.__QUEENS_DEBUG__;
    const { view } = await import('/src/js/core/state.js');
    return { status: d.state.status, marks: [...d.state.marks], sheet: view.sheet, rolling: view.rolling, filling: view.filling,
      busy: (await import('/src/js/looks/effects.js')).isLookBusy(),
      reward: !!document.querySelector('.look-tiles.is-reward'), events: window.lookEvents };
  }));
  throw error;
} finally {
  await browser.close();
}
