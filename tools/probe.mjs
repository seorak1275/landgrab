import { makeState, capitalOf, greedy } from '../tests/helpers.js';
import { PLAYER, NEUTRAL } from '../src/world.js';
import { tick, status, tilesOwned } from '../src/sim.js';
import { runAi } from '../src/ai.js';

function step(s, dt) { tick(s, dt); runAi(s, dt); }
function row(s, t) {
  const f = [];
  for (let i = 0; i < s.run.factions; i++) f.push(`${tilesOwned(s, i)}(${Math.floor(s.run.gold[i])}g)`);
  const cap = capitalOf(s, PLAYER);
  return `${String(t).padStart(5)}s  ${f.join('  ')}  neutral=${tilesOwned(s, NEUTRAL)}  pcap=${cap ? Math.floor(cap.soldiers) + '/L' + cap.level + (cap.owner === 0 ? '' : ' LOST') : '-'}`;
}
const mode = process.argv[2] || 'idle';
const seed = Number(process.argv[3] || 1);
const map = process.argv[5] || 'hex';
const s = makeState(seed, 0, {}, map);
if (process.argv[6] === 'nobonus') delete s.run.regions; // 지역 보너스 끄고 비교용
if (mode === 'aionly') for (const t of s.run.tiles) if (t.owner === PLAYER) { t.owner = NEUTRAL; t.soldiers = 30; }
console.log('mode', mode, 'seed', seed, 'map', map, 'tiles', s.run.tiles.length);
const T = Number(process.argv[4] || 3600);
for (let t = 0; t <= T; t++) {
  if (mode === 'greedy' && t % 5 === 0) greedy(s);
  if (t % Math.max(120, T / 20) === 0) console.log(row(s, t));
  if (mode !== 'aionly' && status(s) !== 'playing') { console.log('END', status(s), 'at', t); break; }
  step(s, 1);
}
