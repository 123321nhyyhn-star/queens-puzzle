/* 参考求解器（不依赖位掩码，n 任意）
 * 用途：独立校验 engine.js 的唯一性结论、以及验证推理层有没有「乱划格子」。
 * 实现：MRV 选色块 + 显式存活表，逐格排除行/列/色块/八邻接。
 */
export function countSolutions(n, regions, limit = 2, nodeCap = 400000) {
  const N = n * n;
  const regCells = Array.from({ length: n }, () => []);
  for (let i = 0; i < N; i++) regCells[regions[i]].push(i);

  const alive = new Uint8Array(N).fill(1);
  const rowQ = new Uint8Array(n), colQ = new Uint8Array(n), regQ = new Uint8Array(n);
  let count = 0, nodes = 0, aborted = false;
  const sols = [];

  function placeAt(i) {
    const r = (i / n) | 0, c = i % n, g = regions[i];
    const killed = [];
    const kill = (k) => { if (alive[k]) { alive[k] = 0; killed.push(k); } };
    for (let k = r * n; k < r * n + n; k++) kill(k);
    for (let k = c; k < N; k += n) kill(k);
    for (const k of regCells[g]) kill(k);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
        kill(rr * n + cc);
      }
    }
    rowQ[r] = 1; colQ[c] = 1; regQ[g] = 1;
    return { killed, r, c, g };
  }

  function undo(rec) {
    for (let t = rec.killed.length - 1; t >= 0; t--) alive[rec.killed[t]] = 1;
    rowQ[rec.r] = 0; colQ[rec.c] = 0; regQ[rec.g] = 0;
  }

  const path = [];

  function dfs(depth) {
    if (count >= limit || aborted) return;
    if (++nodes > nodeCap) { aborted = true; return; }
    if (depth === n) {
      count++;
      if (sols.length < 2) {
        const sol = new Array(n).fill(-1);
        for (const p of path) sol[p.r] = p.c;
        sols.push(sol);
      }
      return;
    }
    let bestList = null, bestG = -1;
    for (let g = 0; g < n; g++) {
      if (regQ[g]) continue;
      const list = [];
      for (const k of regCells[g]) if (alive[k]) list.push(k);
      if (!bestList || list.length < bestList.length) { bestG = g; bestList = list; }
      if (!list.length) break;
    }
    if (!bestList || !bestList.length) return;
    for (const k of bestList) {
      const rec = placeAt(k);
      path.push({ r: rec.r, c: rec.c });
      dfs(depth + 1);
      path.pop();
      undo(rec);
      if (count >= limit || aborted) return;
    }
  }

  dfs(0);
  return { count, nodes, aborted, sols };
}
