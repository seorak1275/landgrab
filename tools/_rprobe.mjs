// 사단전 시뮬 추이 실측: node tools/_rprobe.mjs [idle|greedy|aionly] [초] [시드] [난이도]
// greedy = tools/region_bot.mjs 의 능동 플레이어(5초마다 수를 둔다). idle = 아무것도 안 함. aionly = 플레이어 수도를 중립으로 비움
import { newRun, tick, status, owned, PLAYER, NEUTRAL, totalPool, MAP } from '../src/region/game.js';
import { runAi } from '../src/region/ai.js';
import { greedyStep, BOT_EVERY } from './region_bot.mjs';

const mode = process.argv[2] || 'greedy', T = Number(process.argv[3] || 1800), seed = Number(process.argv[4] || 1);
const difficulty = process.argv[5] || 'hell';
const legacy = { points: 0, prestigeCount: 0, upgrades: {}, difficulty };
const state = { legacy, run: newRun(seed, legacy) };
if (mode === 'aionly') { const c = state.run.regions.find(r => r.owner === PLAYER); c.owner = NEUTRAL; c.div = 0; }
const t0 = Date.now();
const line = t => {
  const row = [];
  for (let f = 0; f < state.run.factions; f++) row.push(`${f === PLAYER ? '나' : 'AI' + f}=${owned(state, f).length}(${Math.floor(totalPool(state, f))})`);
  console.log(String(t).padStart(5), row.join(' '), '중립', owned(state, NEUTRAL).length, '행군', state.run.armies.length, '반란', state.run.rebels.length);
};
for (let t = 0; t <= T; t++) {
  tick(state, 1); runAi(state, 1);
  if (mode === 'greedy' && t % BOT_EVERY === 0) greedyStep(state);
  if (t % 300 === 0) line(t);
  if (status(state) !== 'playing') { line(t); console.log('END', status(state), 'at', t, `(${(t / 60).toFixed(1)}분)`); break; }
}
console.log(`지역 ${MAP.regions.length}개 · 난이도 ${difficulty} · ${Date.now() - t0}ms`);
