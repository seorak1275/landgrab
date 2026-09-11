// 전적·계급·훈장·장군 화면 (두 모드가 같이 쓴다)
import { GENERALS, GENERAL_SPECS, MEDALS, ownedGenerals, generalOf, setLead, rankOf, nextRank, careerScore, records, bestRecord } from './career.js';
import { DIFFICULTIES } from './sim.js';
import { showModal, hideModal } from './ui.js';

const hms = sec => { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h ? `${h}시간 ${m}분` : `${m}분`; };

// 환생 창에 넣는 "앞장설 장군" 고르기
export function generalPickerHtml(state) {
  const gs = ownedGenerals(state.legacy);
  if (!gs.length) return '';
  const lead = generalOf(state.legacy);
  return `<p class="sub">앞장설 장군 (특기에 레벨당 5%)</p><div class="perk-row">${gs.map(g => `<label><input type="radio" name="general" value="${g.key}" ${lead && lead.key === g.key ? 'checked' : ''}><b>${GENERAL_SPECS[g.spec].icon} ${g.name} Lv.${g.level}</b><span class="desc">${GENERAL_SPECS[g.spec].name} · ${GENERAL_SPECS[g.spec].desc}</span></label>`).join('')}</div>`;
}
export const pickedGeneral = () => { const el = document.querySelector('input[name="general"]:checked'); return el ? el.value : null; };

// 🎖 전적·계급 창. boardName(key) 은 그 모드에서 판 이름을 붙여 주는 함수 (없으면 모드 이름)
export function openCareer({ state, save, after = hideModal, mode = null, boardName = null, canChangeLead = () => true }) {
  const L = state.legacy, r = rankOf(L), nx = nextRank(L), best = bestRecord(L, mode);
  const gs = ownedGenerals(L), lead = generalOf(L);
  const medalRows = Object.entries(MEDALS).map(([k, m]) => `<span style="opacity:${L.medals && L.medals[k] ? 1 : 0.25}" title="${m.desc}">${m.icon} ${m.name}</span>`).join(' · ');
  const label = x => (boardName && boardName(x.board)) || (x.mode === 'region' ? '사단전' : '육각');
  const rows = records(L).filter(x => !mode || x.mode === mode).slice(0, 10)
    .map(x => `<div class="shop-row"><span class="name">${x.outcome === 'conquered' ? '🎉 정복' : '💀 전멸'} <b>${x.regions}/${x.total}</b><span class="desc">${label(x)} · ${(DIFFICULTIES[x.difficulty] || {}).name || ''} · ${hms(x.elapsed)} · ✨${x.points}</span></span></div>`).join('')
    || '<p class="sub">아직 끝낸 판이 없습니다.</p>';
  showModal({
    title: `🎖 ${r.name} · 공적 ${careerScore(L)}`,
    html: `<p>${nx ? `다음 계급 <b>${nx.name}</b>까지 공적 ${nx.need - careerScore(L)} (환생 +1, 정복 +2)` : '최고 계급입니다'} · 생산 +${Math.round(r.bonus * 100)}%</p>
      <p class="sub">훈장 ${Object.keys(L.medals || {}).length}/${Object.keys(MEDALS).length}</p><p>${medalRows}</p>
      <p class="sub">장군 ${gs.length}/${GENERALS.length}명 · 지금 ${lead ? `${GENERAL_SPECS[lead.spec].icon} ${lead.name} Lv.${lead.level}` : '없음'}</p>
      ${gs.length ? `<p>${gs.map(g => `${GENERAL_SPECS[g.spec].icon} ${g.name} Lv.${g.level}${lead && lead.key === g.key ? ' ✓' : canChangeLead() ? ` <button data-action="lead:${g.key}">앞장</button>` : ''}`).join(' · ')}</p>
        ${canChangeLead() ? '' : '<p class="sub">앞장설 장군은 판이 시작될 때(환생 창·시작 휴전 동안)만 바꿀 수 있습니다.</p>'}`
        : '<p class="sub">환생할 때마다 장군을 한 명 얻습니다.</p>'}
      <p class="sub">최고 기록: ${best ? `${best.outcome === 'conquered' ? '🎉 정복' : '💀 전멸'} ${best.regions}/${best.total} · ${hms(best.elapsed)}` : '없음'}</p>
      <p class="sub">최근 판</p>${rows}`,
    actions: [{ label: '닫기', onClick: after, primary: true }],
    onBodyClick: a => { if (a.startsWith('lead:') && canChangeLead()) { setLead(L, a.slice(5)); if (save) save(state); openCareer({ state, save, after, mode, boardName, canChangeLead }); } },
  });
}
