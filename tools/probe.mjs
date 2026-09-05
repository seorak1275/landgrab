import { makeState, capitalOf } from '../tests/helpers.js';
import { PLAYER, NEUTRAL, TERRAIN } from '../src/world.js';
import { tick, send, upgrade, status, neighborIds, upgradeCost, tilesOwned, attackMul } from '../src/sim.js';
import { runAi } from '../src/ai.js';

function step(s, dt) { tick(s, dt); runAi(s, dt); }
function greedy(s) {
  const mine = s.run.tiles.filter(t => t.owner === PLAYER);
  const low = mine.filter(t => t.level < 10).sort((a, b) => a.level - b.level)[0];
  if (low && s.run.gold[PLAYER] >= upgradeCost(low)) upgrade(s, low.id);
  const am = attackMul(s, PLAYER);
  let best = null;
  for (const t of mine) for (const id of neighborIds(s.run, t)) {
    const n = s.run.tiles[id]; if (n.owner === PLAYER) continue;
    const D = n.soldiers * (1 + TERRAIN[n.terrain].def);
    if (t.soldiers * 0.7 * am > D * 1.05 && (!best || D < best.D)) best = { from: t, to: n, D };
  }
  if (best) send(s, best.from.id, best.to.id, 0.7);
  // 국경 보강: 내부 타일이 한도 절반 이상이면 가장 약한 국경 이웃으로 절반
  const isBorder = t => neighborIds(s.run, t).some(id => s.run.tiles[id].owner !== PLAYER);
  for (const t of mine) {
    if (isBorder(t) || t.soldiers < 10) continue;
    const b = neighborIds(s.run, t).map(id => s.run.tiles[id]).filter(n => n.owner === PLAYER && isBorder(n)).sort((a, b) => a.soldiers - b.soldiers)[0];
    if (b) { send(s, t.id, b.id, 0.5); break; }
  }
}
function row(s, t) {
  const f = [];
  for (let i = 0; i < s.run.factions; i++) f.push(`${tilesOwned(s, i)}(${Math.floor(s.run.gold[i])}g)`);
  const cap = capitalOf(s, PLAYER);
  return `${String(t).padStart(5)}s  ${f.join('  ')}  neutral=${tilesOwned(s, NEUTRAL)}  pcap=${cap ? Math.floor(cap.soldiers) + '/L' + cap.level + (cap.owner === 0 ? '' : ' LOST') : '-'}`;
}
const mode = process.argv[2] || 'idle';
const seed = Number(process.argv[3] || 1);
const s = makeState(seed);
if (mode === 'aionly') for (const t of s.run.tiles) if (t.owner === PLAYER) { t.owner = NEUTRAL; t.soldiers = 30; }
console.log('mode', mode, 'seed', seed);
const T = Number(process.argv[4] || 3600);
for (let t = 0; t <= T; t++) {
  if (mode === 'greedy' && t % 5 === 0) greedy(s);
  if (t % Math.max(120, T / 20) === 0) console.log(row(s, t));
  if (mode !== 'aionly' && status(s) !== 'playing') { console.log('END', status(s), 'at', t); break; }
  step(s, 1);
}
