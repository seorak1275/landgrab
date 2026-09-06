// 지역 특성·지형 친화도 표 (world.js와 sim.js가 둘 다 쓰므로 따로 둔다)
export const TRAITS = {
  mountain: { name: '산악', icon: '⛰', desc: '성벽·망루 ×1.5, 농장 ×0.5, 중립 수비 ×1.25', wall: 1.5, tower: 1.5, farm: 0.5, garrison: 1.25 },
  plain:    { name: '평야', icon: '🌾', desc: '농장 ×1.5, 성벽 ×0.6, 중립 수비 ×0.85',       farm: 1.5, wall: 0.6, garrison: 0.85 },
  city:     { name: '도시', icon: '🏙', desc: '병영 ×1.5, 농장 ×0.7',                        barracks: 1.5, farm: 0.7 },
  coast:    { name: '해안', icon: '🌊', desc: '망루 ×1.3, 병영 ×1.2, 성벽 ×0.8',              tower: 1.3, barracks: 1.2, wall: 0.8 },
};
// 지형 친화도: 산·언덕엔 성벽·망루, 평지엔 농장, 성채엔 병영
export const TERRAIN_AFFINITY = {
  plain:    { farm: 1.3 },
  forest:   { tower: 1.2 },
  hill:     { wall: 1.3, tower: 1.3, farm: 0.8 },
  mountain: { wall: 1.5, tower: 1.5, farm: 0.5 },
  citadel:  { barracks: 1.3 },
  sea:      { farm: 0.3, tower: 1.2, wall: 0.5 },
};
