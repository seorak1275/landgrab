import { newRun, tick, status, owned, PLAYER, NEUTRAL, allocate, move, totalPool } from '../src/region/game.js';
import { runAi } from '../src/region/ai.js';
const legacy = { points: 0, prestigeCount: 0, upgrades: {}, difficulty: 'normal' };
const mode = process.argv[2] || 'idle', T = Number(process.argv[3] || 1800);
const state = { legacy, run: newRun(Number(process.argv[4] || 1), legacy) };
const t0 = Date.now();
for (let t = 0; t <= T; t++) {
  tick(state, 1); runAi(state, 1);
  if (mode === 'greedy' && t % 5 === 0) { // 플레이어: 국경 방어 30%, 나머지 사단, 이길 수 있는 이웃 공격
    for (const r of owned(state, PLAYER)) { allocate(state, r.id, 'def', Math.floor(r.pool * 0.3)); allocate(state, r.id, 'div', 'max'); }
    const { neighbors, effectiveDefense } = await import('../src/region/game.js');
    for (const r of owned(state, PLAYER)) for (const n of neighbors(r.id)) { const x = state.run.regions[n]; if (x.owner !== PLAYER && r.div * 0.7 > effectiveDefense(state, x, PLAYER) * 1.2) { move(state, r.id, n, 0.7); break; } }
  }
  if (t % 300 === 0) { const row = []; for (let f = 0; f < state.run.factions; f++) row.push(`F${f}=${owned(state, f).length}(pool ${Math.floor(totalPool(state, f))})`); console.log(String(t).padStart(5), row.join(' '), 'neutral', owned(state, NEUTRAL).length, 'armies', state.run.armies.length, 'rebels', state.run.rebels.length); }
  if (status(state) !== 'playing') { console.log('END', status(state), 'at', t); break; }
}
console.log('ms', Date.now() - t0);
