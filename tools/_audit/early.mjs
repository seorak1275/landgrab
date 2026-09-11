import { newRun, tick, status, owned, totalProd, PLAYER, homesOf } from '../../src/region/game.js';
import { runAi } from '../../src/region/ai.js';
import { greedyStep, BOT_EVERY } from '../region_bot.mjs';
const board = process.argv[2] || 'all';
console.log(`[${board}] 시작지별 초반 (지옥, 봇, 시드 1~5 평균)`);
for (const home of homesOf(board)) {
  const at5 = [], at10 = [], prod10 = [], dead = [];
  for (const seed of [1, 2, 3, 4, 5]) {
    const legacy = { points: 0, prestigeCount: 0, upgrades: {}, difficulty: 'hell' };
    const s = { legacy, run: newRun(seed, legacy, null, board, home) };
    for (let t = 1; t <= 600; t++) {
      tick(s, 1); runAi(s, 1);
      if (t % BOT_EVERY === 0) greedyStep(s);
      if (t === 300) at5.push(owned(s, PLAYER).length);
      if (status(s) !== 'playing') { dead.push(t); break; }
    }
    at10.push(owned(s, PLAYER).length); prod10.push(totalProd(s, PLAYER));
  }
  const avg = a => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
  console.log(home.padEnd(12), '5분', avg(at5).padStart(5), '· 10분', avg(at10).padStart(5), '곳 · 생산', avg(prod10).padStart(6), dead.length ? `· 전멸 ${dead.length}/5` : '');
}
