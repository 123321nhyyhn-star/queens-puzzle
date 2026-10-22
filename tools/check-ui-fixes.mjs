/* 本轮 UI 修改的验收：① 相邻色块色差 ② 描边连续 ③ 棋盘位置固定 ④ 难度标签对齐棋盘 */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/CJL/.workbuddy/binaries/node/workspace/');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const OUT = 'tools/shots';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

const LAB = `(function(){
  function lin(v){return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);}
  function f(t){return t>0.008856?Math.cbrt(t):7.787*t+16/116;}
  return function(hex){
    const r=lin(parseInt(hex.substr(1,2),16)/255),g=lin(parseInt(hex.substr(3,2),16)/255),b=lin(parseInt(hex.substr(5,2),16)/255);
    const x=f((r*0.4124+g*0.3576+b*0.1805)/0.95047),y=f(r*0.2126+g*0.7152+b*0.0722),z=f((r*0.0193+g*0.1192+b*0.9505)/1.08883);
    return [116*y-16,500*(x-y),200*(y-z)];
  };
})()`;

let fail = 0;
const bad = (msg) => { fail++; console.log('  ✗ ' + msg); };
const ok = (msg) => console.log('  ✓ ' + msg);

for (const [w, h, tag] of [[390, 844, 'iPhone14'], [360, 640, '小屏'], [320, 568, '超小屏'], [820, 1180, 'iPad'], [1280, 800, '桌面横屏']]) {
  for (const n of [4, 5, 8, 12, 16]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto('http://127.0.0.1:8089/', { waitUntil: 'networkidle0' });
    await page.waitForFunction('window.__QUEENS_DEBUG__ && __QUEENS_DEBUG__.state.vibe', { timeout: 20000 });
    await page.evaluate((nn) => __QUEENS_DEBUG__.newGame(nn), n);
    await page.waitForFunction((nn) => __QUEENS_DEBUG__.state.size === nn && __QUEENS_DEBUG__.state.vibe, { timeout: 40000 }, n);
    await sleep(260);

    const before = await page.evaluate((LABSRC) => {
      const lab = eval(LABSRC);
      const r = (id) => document.getElementById(id).getBoundingClientRect();
      const s = window.__QUEENS_DEBUG__.state;
      const n = s.size;
      // 相邻色块的色差
      let minD = 1e9, at = null;
      const seen = new Set();
      for (let i = 0; i < n * n; i++) {
        const rr = (i / n) | 0, cc = i % n;
        for (const [rr2, cc2] of [[rr, cc + 1], [rr + 1, cc]]) {
          if (rr2 >= n || cc2 >= n) continue;
          const j = rr2 * n + cc2, a = s.regions[i], b = s.regions[j];
          if (a === b) continue;
          const key = a < b ? a + '-' + b : b + '-' + a;
          if (seen.has(key)) continue;
          seen.add(key);
          const la = lab(s.regionColors[a]), lb = lab(s.regionColors[b]);
          const d = Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
          if (d < minD) { minD = d; at = [s.regionColors[a], s.regionColors[b]]; }
        }
      }
      const uniq = new Set(s.regionColors).size;
      // 整盘任意两色的最小色差（不只是相邻）
      let minAll = 1e9, atAll = null;
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        const la = lab(s.regionColors[a]), lb = lab(s.regionColors[b]);
        const d = Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
        if (d < minAll) { minAll = d; atAll = [s.regionColors[a], s.regionColors[b]]; }
      }
      const b = r('board'), hr = r('hintRow'), chip = document.getElementById('btnDiff');
      return {
        minAdjDE: minD, at, minAll, atAll, uniq, n,
        board: { top: b.top, left: b.left, right: b.right, bottom: b.bottom, w: b.width },
        hintRight: hr.right, hintLeft: hr.left,
        chipRight: chip.hidden ? null : chip.getBoundingClientRect().right,
        rbPaths: document.querySelectorAll('#rb path').length,
        rbLen: (document.querySelector('#rb path') || { getTotalLength: () => 0 }).getTotalLength(),
      };
    }, LAB);

    // 打开提示
    await page.click('#btnHint');
    await sleep(420);
    const after = await page.evaluate(() => {
      const r = (id) => document.getElementById(id).getBoundingClientRect();
      const b = r('board'), c = r('coach'), t = r('toolbar');
      return { top: b.top, bottom: b.bottom, left: b.left, coachTop: c.top, coachBottom: c.bottom, toolbarBottom: t.bottom, vh: window.innerHeight };
    });

    const line = `${tag} ${w}×${h} n=${n}`;
    const moveD = Math.abs(after.top - before.board.top) + Math.abs(after.left - before.board.left);
    const chipErr = before.chipRight === null ? null : Math.round(before.chipRight - before.board.right);
    const hintL = Math.round(before.hintLeft - before.board.left);
    console.log(`${line}: 相邻色差 minΔE=${before.minAdjDE.toFixed(1)} (${before.at}) 全盘最小 ${before.minAll.toFixed(1)} (${before.atAll}) 用色 ${before.uniq}/${before.n} | 描边 ${before.rbPaths} 笔 ${Math.round(before.rbLen)}px | 标签右差 ${chipErr} | 提示行左差 ${hintL}`);

    if (before.minAdjDE < 18) bad(`${line}: 相邻色块色差太小 ${before.minAdjDE.toFixed(1)}`);
    if (before.uniq < before.n) bad(`${line}: 有重复颜色 ${before.uniq}/${before.n}`);
    if (before.rbPaths < 1) bad(`${line}: 色块描边没画出来`);
    if (moveD > 0.5) bad(`${line}: 开提示后棋盘位移 ${moveD.toFixed(1)}px`);
    if (chipErr !== null && Math.abs(chipErr) > 1.5) bad(`${line}: 难度标签没对齐棋盘右缘（差 ${chipErr}px）`);
    if (Math.abs(hintL) > 1.5) bad(`${line}: 提示行没和棋盘左缘对齐（差 ${hintL}px）`);
    if (after.coachTop < before.board.bottom - 1) console.log(`  ! 面板压到棋盘 ${Math.round(before.board.bottom - after.coachTop)}px（面板 ${Math.round(after.coachBottom - after.coachTop)}px 高）`);
    if (after.toolbarBottom > after.vh + 1) bad(`${line}: 工具栏出屏`);

    if (n === 5 && (tag === 'iPhone14' || tag === '超小屏')) {
      await page.screenshot({ path: `${OUT}/ui-${tag}-${n}-guide.png`, captureBeyondViewport: false });
      await page.click('#coachClose');
      await sleep(300);
      await page.screenshot({ path: `${OUT}/ui-${tag}-${n}.png`, captureBeyondViewport: false });
    }
    if (n === 8 && tag === 'iPhone14') {
      await page.click('#coachClose');
      await sleep(250);
      await page.screenshot({ path: `${OUT}/ui-board-8.png`, captureBeyondViewport: false });
    }
  }
}

console.log('\n错误:', errs.length ? errs : '无');
console.log(fail ? `\n失败 ${fail} 项` : '\n全部通过');
await browser.close();
process.exit(fail ? 1 : 0);
