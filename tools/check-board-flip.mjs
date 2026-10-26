/* 翻格的真实浏览器回归。需要 Playwright（可通过 NODE_PATH 指向已有安装）。
 * node tools/check-board-flip.mjs [url]；QUEENS_BROWSER 可指定 Chromium 路径。 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8080/';
const shots = fileURLToPath(new URL('./shots/board-flip/', import.meta.url));
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.QUEENS_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true
});
let checks = 0;
function check(name, condition) { assert.ok(condition, name); checks++; console.log('PASS ' + name); }
const errors = [];
const ready = page => page.waitForFunction(() => window.__QUEENS_DEBUG__?.state.regions?.length);
const settled = page => page.waitForFunction(() => !document.querySelector('.board.is-flipping'));
const solve = page => page.evaluate(async () => {
  const d = window.__QUEENS_DEBUG__;
  const { placeQueen } = await import('/src/js/app/actions.js');
  for (let r = 0; r < d.state.size; r++) placeQueen(r * d.state.size + d.state.solution[r]);
});
const direction = page => page.evaluate(() => {
  const cards = [...document.querySelectorAll('.flip-card')];
  const n = window.__QUEENS_DEBUG__.state.size;
  return [0, n - 1, n * (n - 1), n * n - 1].map(i => parseFloat(cards[i].style.getPropertyValue('--flip-delay')));
});

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await ready(page);
  await page.waitForSelector('.board.is-flipping');
  let corners = await direction(page);
  check('开局从左上到右下推进', corners[0] === 0 && corners[1] === corners[2] && corners[3] > corners[1]);
  check('翻格时拦住鼠标、键盘落子', await page.evaluate(async () => {
    const { onCell, placeQueen, canPlay } = await import('/src/js/app/actions.js');
    onCell(0); placeQueen(1);
    return !canPlay() && window.__QUEENS_DEBUG__.state.steps === 0 && window.__QUEENS_DEBUG__.state.marks.every(v => v === 0);
  }));
  await page.waitForTimeout(180);
  await page.screenshot({ path: shots + '01-deal.png' });
  await settled(page);
  check('开局后移除装饰层，格子数量正常', await page.locator('.cell').count() === 64 && await page.locator('.board-flip').count() === 0);
  await page.evaluate(async () => { const { onCell } = await import('/src/js/app/actions.js'); onCell(0); });
  await page.waitForTimeout(220);
  await page.evaluate(() => window.__QUEENS_DEBUG__.retry());
  check('重试翻面保留旧棋盘的正面', Number(await page.locator('.flip-face').first().evaluate(el => el.style.getPropertyValue('--flip-mark'))) > .9);
  await settled(page);

  for (const n of [4, 8, 16]) {
    await page.evaluate(n => window.__QUEENS_DEBUG__.newGame(n), n);
    await page.waitForSelector('.board.is-flipping');
    check(`${n}×${n} 每格都有双面翻牌`, await page.locator('.flip-card').count() === n * n && await page.locator('.flip-face').count() === n * n * 2);
    corners = await direction(page);
    check(`${n}×${n} 波程不超过 540ms`, corners[3] <= 540);
    await settled(page);
    check(`${n}×${n} 翻完恢复操作`, await page.evaluate(async () => (await import('/src/js/app/actions.js')).canPlay()));
  }

  await page.setViewportSize({ width: 320, height: 640 });
  await page.evaluate(() => window.__QUEENS_DEBUG__.newGame(8));
  await settled(page);
  check('320px 窄屏棋盘没有横向溢出', await page.locator('#board').evaluate(el => el.getBoundingClientRect().right <= innerWidth));
  await page.evaluate(() => {
    window.flipEvents = [];
    const observer = new MutationObserver(() => {
      if (document.querySelector('#fx .confetti') && !window.flipEvents.includes('confetti')) {
        window.flipEvents.push(document.querySelector('.board.has-reward') ? 'confetti' : 'early-confetti');
      }
      if (!document.querySelector('#result').hidden && !window.flipEvents.includes('result')) window.flipEvents.push('result');
    });
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });
  });
  await solve(page);
  await page.waitForSelector('.board-flip[data-direction="bottom-left"]');
  corners = await direction(page);
  check('胜利从左下到右上推进', corners[2] === 0 && corners[0] === corners[3] && corners[1] > corners[0]);
  check('翻图时没有礼炮或结果遮挡', await page.locator('.confetti').count() === 0 && await page.locator('#result').getAttribute('hidden') !== null);
  check('图片四角切片位置正确', await page.evaluate(() => {
    const backs = [...document.querySelectorAll('.flip-back')];
    const n = window.__QUEENS_DEBUG__.state.size;
    return backs[0].style.backgroundPosition === '0% 0%' && backs[n - 1].style.backgroundPosition === '100% 0%' &&
      backs[n * (n - 1)].style.backgroundPosition === '0% 100%' && backs.at(-1).style.backgroundPosition === '100% 100%';
  }));
  await page.waitForTimeout(340);
  await page.screenshot({ path: shots + '02-victory-flip.png' });
  await page.waitForSelector('.board.has-reward');
  await page.screenshot({ path: shots + '03-reward.png' });
  check('翻完合为完整图片，移除切片接缝', await page.locator('.board-flip[role="img"]').count() === 1 && await page.locator('.flip-card').count() === 0);
  await page.waitForSelector('#result:not([hidden])');
  check('图片 → 礼炮 → 成绩的顺序正确', await page.evaluate(() => window.flipEvents.join(',') === 'confetti,result'));
  await page.click('#btnPeek');
  check('关闭结果后仍可欣赏图片', await page.locator('.board.has-reward').count() === 1);
  const recordCount = await page.evaluate(() => JSON.parse(localStorage.getItem('queens.records.v1')).length);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready(page);
  await page.waitForSelector('.board.has-reward');
  check('刷新已胜利对局保留图片，不重复礼炮和战绩', await page.locator('.confetti').count() === 0 && await page.evaluate(() => JSON.parse(localStorage.getItem('queens.records.v1')).length) === recordCount);

  await page.evaluate(() => window.__QUEENS_DEBUG__.retry());
  await settled(page);
  await solve(page);
  await page.waitForSelector('.board-flip[data-direction="bottom-left"]');
  await page.evaluate(() => window.__QUEENS_DEBUG__.retry());
  await settled(page);
  await page.waitForTimeout(1250);
  check('翻图中重开取消旧礼炮、旧图片与旧成绩', await page.locator('.confetti, .board-flip, .board.has-reward, #result:not([hidden])').count() === 0);
  await solve(page);
  await page.waitForSelector('.board.has-reward');
  await page.evaluate(() => window.__QUEENS_DEBUG__.newGame(4));
  await settled(page);
  await page.waitForTimeout(1250);
  check('礼炮后换局不会弹出旧成绩', await page.locator('#result:not([hidden]), .board.has-reward').count() === 0);
  await page.evaluate(async () => { const { onCell } = await import('/src/js/app/actions.js'); onCell(0); });
  await page.waitForTimeout(250);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready(page);
  await page.waitForSelector('.board.is-flipping');
  await settled(page);
  check('刷新续玩也翻格，并保留进度', await page.evaluate(() => window.__QUEENS_DEBUG__.state.marks[0] === 1 && window.__QUEENS_DEBUG__.state.steps === 1));

  const dailyContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const dailyPage = await dailyContext.newPage();
  dailyPage.on('pageerror', e => errors.push(e.message));
  await dailyPage.goto(url);
  await ready(dailyPage);
  await settled(dailyPage);
  const preferences = await dailyPage.evaluate(() => JSON.stringify(window.__QUEENS_DEBUG__.settings));
  await dailyPage.evaluate(() => window.__QUEENS_DEBUG__.startDaily('easy'));
  await dailyPage.waitForSelector('.board.is-flipping');
  check('每日挑战开局同样逐格翻面', await dailyPage.locator('.flip-card').count() === 25);
  await settled(dailyPage);
  const dailyBoard = await dailyPage.evaluate(() => {
    const s = window.__QUEENS_DEBUG__.state;
    return { seed: s.seed, regions: [...s.regions], daily: s.daily };
  });
  check('翻面后保留每日挑战规则，不改写偏好', await dailyPage.evaluate(preferences => {
    const d = window.__QUEENS_DEBUG__, s = d.state;
    return s.daily.tier === 'easy' && s.limit === 180000 && s.lifeLimit === 3 && s.lives === 3 &&
      s.noHint && s.noSnap && !s.noUndo && JSON.stringify(d.settings) === preferences;
  }, preferences));
  await solve(dailyPage);
  await dailyPage.waitForSelector('.board-flip[data-direction="bottom-left"]');
  check('每日通关翻图前已正确记账，礼炮仍等待图片', await dailyPage.evaluate(() => window.__QUEENS_DEBUG__.daily().done.easy) && await dailyPage.locator('.confetti').count() === 0);
  await dailyPage.waitForSelector('.board.has-reward');
  await dailyPage.waitForSelector('#result:not([hidden])');
  check('每日通关显示奖励图片和成绩', await dailyPage.locator('.board-flip[role="img"]').count() === 1);
  await dailyPage.reload();
  await ready(dailyPage);
  await dailyPage.waitForSelector('.board.has-reward');
  check('刷新每日通关对局保留身份与奖励图', await dailyPage.evaluate(expected => JSON.stringify(window.__QUEENS_DEBUG__.state.daily) === JSON.stringify(expected), dailyBoard.daily));
  await dailyPage.evaluate(() => window.__QUEENS_DEBUG__.retry());
  await settled(dailyPage);
  check('每日重试保留同盘、日期及固定规则', await dailyPage.evaluate(expected => {
    const s = window.__QUEENS_DEBUG__.state;
    return s.seed === expected.seed && JSON.stringify([...s.regions]) === JSON.stringify(expected.regions) &&
      JSON.stringify(s.daily) === JSON.stringify(expected.daily) && s.noHint && s.noSnap && s.lives === 3;
  }, dailyBoard));
  await solve(dailyPage);
  await dailyPage.waitForSelector('.board-flip[data-direction="bottom-left"]');
  await dailyPage.evaluate(() => window.__QUEENS_DEBUG__.newGame(4));
  await settled(dailyPage);
  await dailyPage.waitForTimeout(1250);
  check('每日翻图中切回自定义取消旧结算并恢复自定义规则', await dailyPage.evaluate(() => {
    const d = window.__QUEENS_DEBUG__;
    return !d.state.daily && d.state.noHint === d.settings.noHint && d.state.noSnap === d.settings.noSnap;
  }) && await dailyPage.locator('.board.has-reward, #result:not([hidden])').count() === 0);

  const reduced = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const quiet = await reduced.newPage();
  quiet.on('pageerror', e => errors.push(e.message));
  await quiet.goto(url);
  await ready(quiet);
  check('减少动态效果时不翻转', await quiet.locator('.board.is-flipping, .flip-card').count() === 0);
  await solve(quiet);
  await quiet.waitForSelector('.board.has-reward');
  await quiet.waitForSelector('#result:not([hidden])');
  check('减少动态效果仍有奖励图和成绩，无礼炮', await quiet.locator('.confetti, .flip-card').count() === 0);
  await quiet.click('#btnPeek');
  await quiet.screenshot({ path: shots + '04-desktop-reward.png' });

  const broken = await context.newPage();
  await broken.route('**/victory-kitten.webp', route => route.abort());
  await broken.goto(url);
  await ready(broken);
  await settled(broken);
  await solve(broken);
  await broken.waitForSelector('#result:not([hidden])');
  check('图片加载失败仍可正常结算', await broken.evaluate(() => window.__QUEENS_DEBUG__.state.status === 'won'));
  check('浏览器无脚本错误', errors.length === 0);
  console.log(`\n${checks} checks passed. Screenshots: ${shots}`);
} finally {
  await browser.close();
}
