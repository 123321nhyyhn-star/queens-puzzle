/* ============================================================================
 * 面板"文案 vs 数字"一致性检查：复刻 renderDiff 的 lead 拼装，
 * 看有没有"说靠试推、但试推是 0"这类自相矛盾。
 * ========================================================================== */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const engine = require('../engine.js');
const diff = require('../difficulty.js');

const args = new Map();
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) args.set(m[1], m[2] === undefined ? '1' : m[2]);
}
const [sLo, sHi] = (args.get('sizes') || '4-16').split('-').map(Number);
const per = Number(args.get('per') || 4);

function leadOf(s, n) {
  let lead = n + '×' + n + ' · 最大色块 ' + (s.areaMax || 0) + ' 格 · ';
  if (s.solved && s.openSingles >= n) lead += '不猜不试，纯推理就能推完';
  else if (!s.openSingles) lead += '开局没有能直接落子的格，得靠试推';
  else lead += '开局推理能定 ' + s.openSingles + ' 只，其余靠试推';
  if (s.guess) lead += '（其中 ' + s.guess + ' 只要硬猜）';
  return lead;
}

let boards = 0;
const bad = [];
const tally = { pure: 0, noSingles: 0, partial: 0 };
for (let n = sLo; n <= sHi; n++) {
  const seen = new Set();
  let made = 0;
  for (let k = 0; k < per * 12 && made < per; k++) {
    const seed = (k * 2246822519 + n * 3266489917 + 668265263) >>> 0;
    let b;
    try { b = engine.generate(n, seed); } catch (e) { continue; }
    if (!b) continue;
    const key = b.regions.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    made++;
    boards++;

    const v = diff.vibe(n, b.regions, b.solution);
    const s = v.steps;
    const lead = leadOf(s, n);
    if (s.solved && s.openSingles >= n) tally.pure++;
    else if (!s.openSingles) tally.noSingles++;
    else tally.partial++;

    // 矛盾判定
    if (/得靠试推/.test(lead) && s.probe === 0 && s.guess === 0) {
      bad.push({ n, seed, why: '说"得靠试推"，但试推 0 / 试错 0', s, lead });
    }
    if (/其余靠试推/.test(lead) && s.probe === 0) {
      bad.push({ n, seed, why: '说"其余靠试推"，但试推 0（实际靠数色块/数线）', s, lead });
    }
    if (/纯推理就能推完/.test(lead) && (s.probe > 0 || s.guess > 0)) {
      bad.push({ n, seed, why: '说"纯推理"，但有试推/试错', s, lead });
    }
  }
}

console.log(`样本 ${boards} 盘；文案分支：纯推理 ${tally.pure}、开局无子 ${tally.noSingles}、部分可定 ${tally.partial}`);
console.log(`文案与数字矛盾：${bad.length} 盘`);
for (const x of bad.slice(0, 20)) {
  console.log(`  ${x.n}×${x.n} seed=${x.seed} | ${x.why} | 计数 可定${x.s.openSingles}/块${x.s.block}/计${x.s.count}/试推${x.s.probe}/试错${x.s.guess}`);
  console.log(`     → "${x.lead}"`);
}
