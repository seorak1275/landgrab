import { newRun, tick, status, owned, PLAYER, homesOf } from '../../src/region/game.js';
import { runAi } from '../../src/region/ai.js';
import { greedyStep, BOT_EVERY } from '../region_bot.mjs';
const board = process.argv[2] || 'all', T = Number(process.argv[3] || 3600);
for (const home of homesOf(board)) {
  const res = [];
  for (const seed of [1, 2, 3]) {
    const legacy = { points: 0, prestigeCount: 0, upgrades: {}, difficulty: 'hell' };
    const s = { legacy, run: newRun(seed, legacy, null, board, home) };
    let out = null;
    for (let t = 0; t <= T; t++) {
      tick(s, 1); runAi(s, 1);
      if (t % BOT_EVERY === 0) greedyStep(s);
      if (status(s) !== 'playing') { out = `${status(s) === 'conquered' ? '정복' : '전멸'} ${(t / 60).toFixed(0)}분`; break; }
    }
    res.push(out || `${owned(s, PLAYER).length}곳`);
  }
  console.log(home.padEnd(12), res.join(' / '));
}
