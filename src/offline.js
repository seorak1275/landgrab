import { tick, tilesOwned, status } from './sim.js';
import { runAi } from './ai.js';
import { PLAYER } from './world.js';

export function offlineCapSeconds(state) { return (8 + 4 * (state.legacy.upgrades.offline || 0)) * 3600; }

// step은 AI 주기(8초)의 약수로. 전투(4초)가 생긴 뒤로는 잔 틱과 완전히 같진 않고 1시간에 골드 ±10% 안팎으로 갈라진다
export function simulateOffline(state, elapsedSec, step = 1) {
  const seconds = Math.max(0, Math.min(elapsedSec, offlineCapSeconds(state)));
  const goldBefore = state.run.gold[PLAYER];
  const tilesBefore = tilesOwned(state, PLAYER);
  let remaining = seconds;
  while (remaining > 0 && status(state) === 'playing') {
    const dt = Math.min(step, remaining);
    tick(state, dt);
    runAi(state, dt);
    remaining -= dt;
  }
  return {
    seconds,
    goldGained: state.run.gold[PLAYER] - goldBefore,
    tilesBefore,
    tilesAfter: tilesOwned(state, PLAYER),
    outcome: status(state),
  };
}
