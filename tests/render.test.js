import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeState, capitalOf } from './helpers.js';
import { PLAYER } from '../src/world.js';
import { hexToPixel } from '../src/hex.js';
import { createCamera, worldToScreen, screenToWorld, pickTile, HEX_SIZE } from '../src/render.js';

test('카메라 변환 왕복', () => {
  const cam = { x: 100, y: -50, scale: 1.5 };
  const [sx, sy] = worldToScreen(cam, 400, 800, 130, 10);
  assert.deepEqual(screenToWorld(cam, 400, 800, sx, sy).map(v => Math.round(v * 1e6) / 1e6), [130, 10]);
});

test('타일 피킹: 수도 중심 화면 좌표를 찍으면 수도', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  const cam = createCamera();
  const [wx, wy] = hexToPixel(c.q, c.r, HEX_SIZE);
  const [sx, sy] = worldToScreen(cam, 390, 700, wx, wy);
  assert.equal(pickTile(s.run, cam, 390, 700, sx + 5, sy + 5), c);
  assert.equal(pickTile(s.run, cam, 390, 700, 5000, 5000), null);
});

test('세력 색: AI는 절대 내 색을 쓰지 않는다 (세력이 늘어도)', async () => {
  const { ownerColor, FACTION_COLORS, setColorblind } = await import('../src/render.js');
  for (const cb of [false, true]) {
    setColorblind(cb);
    const mine = ownerColor(0);
    const ai = [];
    for (let f = 1; f <= 6; f++) { const c = ownerColor(f); assert.notEqual(c, mine, `AI ${f} (색약=${cb})`); ai.push(c); }
    assert.equal(new Set(ai).size, 6, `AI 6세력 색이 서로 달라야 한다 (색약=${cb})`);
    assert.ok(FACTION_COLORS.length >= 7);
    assert.notEqual(ownerColor(-1), mine);
  }
  setColorblind(false);
});
