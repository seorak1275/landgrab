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
