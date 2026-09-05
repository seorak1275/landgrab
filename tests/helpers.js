import { generateRun } from '../src/world.js';
export function makeState(seed = 1, prestige = 0, upgrades = {}) {
  const u = { gold: 0, soldiers: 0, attack: 0, startArmy: 0, offline: 0, aiSlow: 0, ...upgrades };
  return { version: 1, legacy: { points: 0, prestigeCount: prestige, upgrades: u }, run: generateRun(seed, prestige, u), lastSave: 0 };
}
export function capitalOf(state, f) { return state.run.tiles.find(t => t.owner === f && t.terrain === 'citadel'); }
