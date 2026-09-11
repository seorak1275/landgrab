// 전역(단계별 지도)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, stageOf, newCampaign, loadCampaign, saveCampaign, starsFor, isUnlocked, nextStage, totalStars, recordStage, stageUrl, stageFromLocation, CAMPAIGN_KEY } from '../src/campaign.js';
import { MAPS } from '../src/mapgen.js';
import { BOARDS, homeNames, ensureMap } from '../src/region/game.js';

function memStorage() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), m }; }

test('단계 목록: 육각 → 사단전 → 세계 순으로 이어지고, 가리키는 지도가 모두 실재한다', async () => {
  assert.ok(STAGES.length >= 12);
  await ensureMap('sgg');
  const ids = new Set();
  for (const s of STAGES) {
    assert.ok(!ids.has(s.id), `중복 ${s.id}`); ids.add(s.id);
    assert.ok(s.n && s.icon && s.desc && s.par.length === 2 && s.par[0] > s.par[1]);
    if (s.mode === 'hex') assert.ok(MAPS[s.map], `없는 육각 지도 ${s.map}`);
    else { assert.ok(BOARDS[s.board], `없는 판 ${s.board}`); assert.ok(homeNames(s.board).includes(s.home), `${s.board}에 없는 시작지 ${s.home}`); }
  }
  assert.equal(STAGES[0].mode, 'hex');
  assert.ok(STAGES.some(s => s.mode === 'region'));
  assert.ok(STAGES.some(s => BOARDS[s.board] && BOARDS[s.board].map === 'world'), '세계 단계가 있다');
  // 세계 판 단계는 뒤쪽에 온다
  const firstWorld = STAGES.findIndex(s => s.board && BOARDS[s.board].map === 'world');
  assert.ok(firstWorld > STAGES.findIndex(s => s.board === 'all'));
});

test('해금: 앞 단계를 깨야 다음이 열린다', () => {
  const c = newCampaign();
  assert.equal(isUnlocked(c, STAGES[0].id), true);
  assert.equal(isUnlocked(c, STAGES[1].id), false);
  assert.equal(nextStage(c).id, STAGES[0].id);
  recordStage(c, STAGES[0].id, 'conquered', 100);
  assert.equal(isUnlocked(c, STAGES[1].id), true);
  assert.equal(nextStage(c).id, STAGES[1].id);
});

test('별: 정복해야 받고, 빠를수록 많이. 다시 해서 좋아지면 갱신된다', () => {
  const s = STAGES[0];
  assert.equal(starsFor(s, 'wiped', 10), 0);
  assert.equal(starsFor(s, 'conquered', s.par[1]), 3);
  assert.equal(starsFor(s, 'conquered', s.par[0]), 2);
  assert.equal(starsFor(s, 'conquered', s.par[0] + 1), 1);
  const c = newCampaign();
  assert.equal(recordStage(c, s.id, 'wiped', 50), null, '지면 기록 없음');
  recordStage(c, s.id, 'conquered', s.par[0] + 10);
  assert.equal(c.cleared[s.id].stars, 1);
  recordStage(c, s.id, 'conquered', s.par[1] - 10);
  assert.equal(c.cleared[s.id].stars, 3);
  assert.equal(c.cleared[s.id].time, s.par[1] - 10, '더 빠른 시간만 남는다');
  recordStage(c, s.id, 'conquered', s.par[0]);
  assert.equal(c.cleared[s.id].stars, 3, '한 번 받은 별은 안 깎인다');
  assert.equal(totalStars(c), 3);
});

test('저장·불러오기, 깨진 값은 새 진행으로', () => {
  const st = memStorage(), c = newCampaign();
  recordStage(c, STAGES[0].id, 'conquered', 120);
  assert.equal(saveCampaign(c, st), true);
  assert.deepEqual(loadCampaign(st), c);
  st.m.set(CAMPAIGN_KEY, '{'); assert.deepEqual(loadCampaign(st), newCampaign());
  st.m.set(CAMPAIGN_KEY, JSON.stringify({ version: 99 })); assert.deepEqual(loadCampaign(st), newCampaign());
});

test('단계 주소: 모드에 맞는 페이지로, 주소에서 단계를 다시 읽는다', () => {
  for (const s of STAGES) {
    const u = stageUrl(s);
    assert.ok(u.startsWith(s.mode === 'hex' ? 'index.html' : 'region.html'));
    assert.equal(stageFromLocation(u.slice(u.indexOf('?'))).id, s.id);
  }
  assert.equal(stageFromLocation('?x=1'), null);
  assert.equal(stageFromLocation(''), null);
});
