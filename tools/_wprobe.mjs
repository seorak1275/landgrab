// 세계 판 밸런스 실측
import { ensureMap, newRun, tick, status, owned, PLAYER, NEUTRAL, totalPool, boardIds } from '../src/region/game.js';
import { runAi } from '../src/region/ai.js';
import { greedyStep, BOT_EVERY } from './region_bot.mjs';
await ensureMap('world');
const board = process.argv[2] || 'asia', T = Number(process.argv[3] || 2400), diff = process.argv[4] || 'normal';
for (const seed of [1, 2]) {
  const legacy = { points: 0, prestigeCount: 0, upgrades: {}, difficulty: diff };
  const s = { legacy, run: newRun(seed, legacy, null, board) };
  let out = null;
  for (let t = 0; t <= T; t++) {
    tick(s, 1); runAi(s, 1);
    if (t % BOT_EVERY === 0) greedyStep(s);
    if (status(s) !== 'playing') { out = `${status(s) === 'conquered' ? '정복' : '전멸'} ${(t / 60).toFixed(1)}분`; break; }
  }
  console.log(`${board} ${diff} seed${seed}:`, out || `미결 ${owned(s, PLAYER).length}/${boardIds(board).length}곳`);
}
