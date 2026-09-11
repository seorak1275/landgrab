# 에셋 출처

- 지형 타일(plain/forest/hill/mountain/citadel.png): Kenney (https://kenney.nl) — CC0 1.0. 파일 목록은 에셋 작업 후 아래에 기록.
- 아이콘(icon-180.png, icon-512.png): tools/make_icon.py 로 직접 생성.

## Kenney Hexagon Pack (kenney_hexagon-pack.zip, CC0) 사용 파일
- plain.png ← PNG/Tiles/Terrain/Grass/grass_05.png
- forest.png ← PNG/Tiles/Terrain/Grass/grass_12.png
- hill.png ← PNG/Tiles/Terrain/Grass/grass_16.png
- mountain.png ← PNG/Tiles/Terrain/Grass/grass_14.png
- citadel.png ← PNG/Tiles/Medieval/medieval_largeCastle.png

## 지도 데이터 (src/maps/*.js, tools/build_maps.mjs 로 생성)
- 대한민국 시·도 경계: southkorea/southkorea-maps (통계청 2013 행정구역, 공유·변형 자유) https://github.com/southkorea/southkorea-maps
- 시·군·구 경계(사단전): 같은 저장소의 **고해상도** `skorea_municipalities_geo.json`(55MB) — 확대해도 깨지지 않게 2026-09-11부터 `_simple` 대신 이것을 받아 `tools/build_sgg.mjs`가 지역 크기에 맞춰 직접 단순화한다
- 서울특별시 자치구 경계: southkorea/seoul-maps (Apache 2.0) https://github.com/southkorea/seoul-maps
- 게임용으로 단순화·정규화했고 235km² 미만 섬과 울릉도·독도는 격자에 잡히지 않아 뺐다.
