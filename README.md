# 땅따먹기

아이폰 사파리에서 여는 방치형 육각 타일 정복 게임. 성(타일)을 업그레이드해 골드와 병사를
생산하고, 병사를 옆 땅에 보내 정복한다. AI 세력이 같은 규칙으로 경쟁하며, 지도를 전부
정복하면 환생해 영구 보너스(유산)를 사고 더 큰 지도에서 다시 시작한다. 꺼둔 시간도
나·AI 양쪽이 시뮬레이션되고, 전멸하면 강제 환생한다.

- 플레이: https://seorak1275.github.io/landgrab/ (사파리 → 공유 → 홈 화면에 추가)
- 규칙·수식: `docs/superpowers/specs/2026-09-05-idle-conquest-design.md` 3장
- 구현 계획: `docs/superpowers/plans/2026-09-05-idle-conquest.md`

## 조작

- 내 땅을 탭해 선택 → 옆 땅을 탭하면 공격(적·중립) 또는 이동(내 땅). 파병 비율 25/50/100%.
- 선택한 내 땅은 하단 [업그레이드]로 레벨을 올린다(골드 생산·병사 생산·병사 한도 증가).
- 한 손가락 드래그로 이동, 두 손가락으로 확대·축소. ≡ 메뉴에 유산 상점·저장 내보내기/가져오기·초기화.

## 개발

프레임워크·빌드 없음. 정적 파일 그대로 배포한다.

```bash
python -m http.server 8765      # http://localhost:8765/ (ES 모듈이라 file:// 로는 안 열림)
node --test                     # 단위·밸런스 테스트
node tools/probe.mjs idle 3 3600         # 시뮬 추이 실측 (idle | greedy | aionly, 시드, 초)
node tools/cdp.mjs http://localhost:8765/ tools/smoke.mjs   # 헤드리스 크롬 화면 검증
```

- `src/` — hex(격자) · world(판 생성) · sim(생산·전투) · ai · offline · prestige · save · render(캔버스) · ui · main
- 저장은 브라우저 localStorage(`landgrab.save.v1`). 홈화면 앱과 사파리 탭은 저장이 따로다.
- 에셋 출처: `assets/CREDITS.md` (Kenney, CC0)
