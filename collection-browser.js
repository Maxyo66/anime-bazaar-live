/* Additive Collection browsing. Cosmetic definitions and equip/buy actions stay in index.html. */
(() => {
  'use strict';
  const original = collectionHTML;
  const state = { query: '', filter: 'all', compared: [], inspected: null };
  const previews = new Map();
  const keyOf = (k, id) => k + '|' + id;
  function entries(k) {
    if (k === 'skins') return HEROES.flatMap(h => [
      { k, id: 'default:' + h.id, name: h.name + ' — Default', hero: h.name, def: {} },
      ...skinIdsFor(h.id).map(id => ({ k, id, name: SKINS[id].name, hero: h.name, def: SKINS[id] }))
    ]);
    return Object.entries(COS[k]).map(([id, def]) => ({ k, id, name: def.name, hero: '', def }));
  }
  function find(key) {
    const [k, id] = key.split('|');
    return COS[k] && entries(k).find(e => e.id === id);
  }
  function status(e) {
    const standard = e.k === 'skins' && e.id.startsWith('default:');
    const owned = standard || META.owned[e.k].includes(e.id);
    const equipped = e.k === 'skins'
      ? standard ? !META.equip.skins[e.id.slice(8)] : META.equip.skins[e.def.hero] === e.id
      : META.equip[e.k] === e.id;
    return { owned, equipped };
  }
  function unlock(e) {
    if (e.k === 'skins' && e.id.startsWith('default:')) return 'Available from the start';
    return unlockHint(e.k, e.id) || (e.def.price != null ? 'Available for Ryo' : 'See the Collection reward');
  }
  function completionHTML() {
    const list = entries(COL_TAB).filter(e => !(e.k === 'skins' && e.id.startsWith('default:')));
    const owned = list.filter(e => status(e).owned).length;
    return `<div class="cb-completion"><b>${esc(COS_LABEL[COL_TAB])}s: ${owned} of ${list.length} collected</b>${list.length ? `<progress value="${owned}" max="${list.length}" aria-label="Collected ${esc(COS_LABEL[COL_TAB])}s">${owned} of ${list.length}</progress>` : ''}${COL_TAB === 'skins' ? '<span class="small">Default looks are included from the start and are not counted.</span>' : ''}</div>`;
  }
  function routes(e) {
    if (e.k === 'skins' && e.id.startsWith('default:')) return ['Available from the start.'];
    const result = [];
    if (!e.def.excl && Number.isFinite(e.def.price)) {
      const short = Math.max(0, e.def.price - META.ryo);
      result.push(`${e.def.price} Ryo — you have ${META.ryo}${short ? `; ${short} more needed` : '; enough Ryo'}.`);
    }
    const levelReward = Object.entries(LEVEL_REWARDS).find(([, r]) => r.k === e.k && r.id === e.id);
    const target = levelReward ? Number(levelReward[0]) : e.k === 'styles' ? STYLE_LEVELS[e.id] : null;
    if (target) result.push(`Reach account level ${target} — current level ${levelOf(META.xp).level}.`);
    const achievement = ACH.find(a => a.rw.k === e.k && a.rw.id === e.id);
    if (achievement) result.push(`${achievement.name}: ${achievement.desc} ${META.ach[achievement.id] ? 'Achievement earned.' : 'Achievement not yet earned.'}`);
    if (e.k === 'skins') {
      const level = e.def.slot ? 6 : 3;
      result.push(`${heroById(e.def.hero).name} Mastery ${level} — current Mastery ${masteryLv(META.mastery[e.def.hero])}.`);
    } else if (e.k === 'titles' && e.id.endsWith('_master')) {
      const hero = heroById(e.id.slice(0, -7));
      if (hero) result.push(`${hero.name} Mastery 10 — current Mastery ${masteryLv(META.mastery[hero.id])}.`);
    }
    return result.length ? result : [unlock(e)];
  }
  function inspectorHTML() {
    const e = state.inspected && find(state.inspected);
    if (!e || e.k !== COL_TAB) return '';
    const s = status(e), requirements = routes(e);
    return `<section class="cb-inspector" aria-labelledby="cb-inspect-heading"><div class="cb-heading"><h2 id="cb-inspect-heading" tabindex="-1">${esc(e.name)}</h2><button type="button" data-cb-close>Close details</button></div><div class="cb-inspect-body"><div class="cprev">${previews.get(state.inspected) || ''}</div><div><p>${esc(COS_LABEL[e.k])} · ${s.equipped ? 'Equipped' : s.owned ? 'Owned' : 'Not owned'}</p><h3>${s.owned ? 'Unlock routes' : 'How to unlock'}</h3><ul>${requirements.map(r => `<li>${esc(r)}</li>`).join('')}</ul>${requirements.length > 1 ? '<p class="small">These are alternative unlock routes.</p>' : ''}${e.def.excl ? '<p class="small">Reward only.</p>' : ''}</div></div><p class="small">Appearance only. Inspecting does not buy or equip anything.</p></section>`;
  }
  function updateInspector(focus = false) {
    const panel = document.querySelector('[data-cb-inspector]'); if (!panel) return;
    panel.innerHTML = inspectorHTML();
    document.querySelectorAll('[data-cb-inspect]').forEach(b => b.setAttribute('aria-expanded', String(b.dataset.cbInspect === state.inspected)));
    if (focus) panel.querySelector('h2')?.focus();
  }
  function compareHTML() {
    if (!state.compared.length) return '<p class="small cb-help">Choose up to two cosmetics to compare their look and unlock requirements. Comparing does not buy or equip anything.</p>';
    return `<section class="cb-comparison" aria-label="Cosmetic comparison"><div class="cb-heading"><h2>Compare cosmetics</h2><button type="button" data-cb-clear>Clear comparison</button></div><div class="cb-columns">${state.compared.map(key => {
      const e = find(key); if (!e) return '';
      const s = status(e);
      return `<article class="cb-choice"><div class="cprev">${previews.get(key) || ''}</div><h3>${esc(e.name)}</h3><dl><dt>Kind</dt><dd>${esc(COS_LABEL[e.k])}</dd><dt>Status</dt><dd>${s.equipped ? 'Equipped' : s.owned ? 'Owned' : 'Not owned'}</dd><dt>Unlock</dt><dd>${esc(unlock(e))}</dd><dt>Price</dt><dd>${e.def.excl ? 'Reward only' : e.def.price != null ? esc(String(e.def.price)) + ' Ryo' : 'Included'}</dd></dl><button type="button" data-cb-remove="${esc(key)}">Remove from comparison</button></article>`;
    }).join('')}</div><p class="small">Cosmetic appearance only. No gameplay stats change.</p></section>`;
  }
  function applyFilters(host) {
    let visible = 0;
    const terms = state.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    host.querySelectorAll('[data-cb-entry]').forEach(tile => {
      const e = find(tile.dataset.cbEntry); if (!e) return;
      const s = status(e);
      const haystack = `${e.name} ${e.hero} ${COS_LABEL[e.k]} ${unlock(e)}`.toLocaleLowerCase();
      const show = terms.every(t => haystack.includes(t)) && (state.filter === 'all' || (state.filter === 'owned' ? s.owned : s.equipped));
      tile.hidden = !show;
      if (show) visible++;
    });
    host.querySelectorAll('.cgrid').forEach(grid => {
      const hasEntries = !!grid.querySelector('[data-cb-entry]');
      if (!hasEntries) return;
      grid.hidden = !grid.querySelector('[data-cb-entry]:not([hidden])');
      if (grid.previousElementSibling?.classList.contains('lbl')) grid.previousElementSibling.hidden = grid.hidden;
    });
    const count = host.querySelector('[data-cb-count]');
    if (count) count.textContent = `${visible} cosmetic${visible === 1 ? '' : 's'} shown`;
    const empty = host.querySelector('[data-cb-empty]'); if (empty) empty.hidden = !!visible;
  }
  collectionHTML = function collectionBrowserHTML() {
    const host = document.createElement('div'); host.innerHTML = original();
    host.querySelector('.wrap')?.classList.add('collection-browser-screen');
    const list = entries(COL_TAB), tiles = host.querySelectorAll('.cgrid .ctile');
    // The original grid is the authority. Leave it untouched if its shape ever changes.
    if (tiles.length !== list.length) return host.innerHTML;
    tiles.forEach((tile, i) => {
      const e = list[i], key = keyOf(e.k, e.id); tile.dataset.cbEntry = key;
      previews.set(key, tile.querySelector('.cprev')?.innerHTML || '');
      const inspect = document.createElement('button'); inspect.type = 'button'; inspect.dataset.cbInspect = key;
      inspect.setAttribute('aria-expanded', String(state.inspected === key)); inspect.setAttribute('aria-controls', 'cb-inspector');
      inspect.setAttribute('aria-label', 'Inspect ' + e.name); inspect.textContent = 'Inspect'; tile.append(inspect);
      const button = document.createElement('button'); button.type = 'button'; button.dataset.cbCompare = key;
      button.setAttribute('aria-pressed', String(state.compared.includes(key)));
      button.setAttribute('aria-label', 'Compare ' + e.name); button.textContent = 'Compare'; tile.append(button);
    });
    const tabs = host.querySelector('.seg');
    tabs.insertAdjacentHTML('beforebegin', `<form class="cb-toolbar" aria-label="Browse cosmetics"><label>Search cosmetics<input type="search" data-cb-search value="${esc(state.query)}" placeholder="Name, hero or unlock…" maxlength="120"></label><label>Show<select data-cb-filter><option value="all"${state.filter === 'all' ? ' selected' : ''}>All cosmetics</option><option value="owned"${state.filter === 'owned' ? ' selected' : ''}>Owned</option><option value="equipped"${state.filter === 'equipped' ? ' selected' : ''}>Equipped</option></select></label><button type="button" data-cb-reset>Reset filters</button><span class="small" data-cb-count role="status" aria-live="polite"></span></form>`);
    tabs.insertAdjacentHTML('afterend', `${completionHTML()}<div id="cb-inspector" data-cb-inspector>${inspectorHTML()}</div><div data-cb-panel>${compareHTML()}</div><p class="cb-empty small" data-cb-empty hidden>No cosmetics match these filters. Try another name or reset the filters.</p>`);
    applyFilters(host);
    return host.innerHTML;
  };
  function updateComparison() {
    const panel = document.querySelector('[data-cb-panel]'); if (!panel) return;
    panel.innerHTML = compareHTML();
    document.querySelectorAll('[data-cb-compare]').forEach(b => b.setAttribute('aria-pressed', String(state.compared.includes(b.dataset.cbCompare))));
  }
  document.addEventListener('input', e => {
    if (!e.target.matches('[data-cb-search]')) return;
    state.query = e.target.value; applyFilters(document);
  });
  document.addEventListener('change', e => {
    if (!e.target.matches('[data-cb-filter]')) return;
    state.filter = e.target.value; applyFilters(document);
  });
  document.addEventListener('submit', e => { if (e.target.matches('.cb-toolbar')) e.preventDefault(); });
  document.addEventListener('click', e => {
    const button = e.target.closest('[data-cb-inspect],[data-cb-close],[data-cb-compare],[data-cb-remove],[data-cb-clear],[data-cb-reset]');
    if (!button) return;
    if (button.hasAttribute('data-cb-inspect')) {
      state.inspected = button.dataset.cbInspect; updateInspector(true); return;
    }
    if (button.hasAttribute('data-cb-close')) {
      const key = state.inspected; state.inspected = null; updateInspector();
      Array.from(document.querySelectorAll('[data-cb-inspect]')).find(b => b.dataset.cbInspect === key && !b.closest('[hidden]'))?.focus();
      return;
    }
    if (button.hasAttribute('data-cb-reset')) {
      state.query = ''; state.filter = 'all';
      document.querySelector('[data-cb-search]').value = ''; document.querySelector('[data-cb-filter]').value = 'all'; applyFilters(document); return;
    }
    if (button.hasAttribute('data-cb-clear')) state.compared = [];
    else if (button.hasAttribute('data-cb-remove')) state.compared = state.compared.filter(k => k !== button.dataset.cbRemove);
    else {
      const key = button.dataset.cbCompare;
      if (state.compared.includes(key)) state.compared = state.compared.filter(k => k !== key);
      else if (state.compared.length < 2) state.compared.push(key);
      else { const help = document.querySelector('.cb-comparison .small'); if (help) help.textContent = 'Two cosmetics selected. Remove one to compare another. No gameplay stats change.'; return; }
    }
    updateComparison();
  });
  const css = document.createElement('style'); css.id = 'collection-browser-styles';
  css.textContent = `.collection-browser-screen>.screen-navigation{position:static}.cb-toolbar{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin:20px 0}.cb-toolbar label{display:grid;gap:5px;font-size:13px}.cb-toolbar label:first-child{flex:1;min-width:180px}.cb-toolbar input,.cb-toolbar select{font:inherit;color:inherit;background:var(--panel,#161a28);border:1px solid #ffffff35;border-radius:8px;padding:10px;min-height:42px}.cb-toolbar input{width:100%}.cb-toolbar button{min-height:42px}.cb-toolbar [role=status]{align-self:center}.cb-comparison{border:1px solid #e5bd6b88;border-radius:14px;padding:18px;margin:16px 0 24px;background:#151724aa}.cb-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.cb-heading h2{font-size:22px;margin:0}.cb-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:18px}.cb-choice{padding:16px;background:#ffffff08;border-radius:10px;min-width:0}.cb-choice h3{font-size:17px;overflow-wrap:anywhere}.cb-choice .cprev{min-height:90px}.cb-choice dl{display:grid;grid-template-columns:70px 1fr;gap:7px 12px;font-size:13px}.cb-choice dt{opacity:.65}.cb-choice dd{margin:0;overflow-wrap:anywhere}.cb-help{margin:4px 0 20px}.cb-empty{padding:24px;text-align:center}.ctile[data-cb-entry][hidden],.cgrid[hidden],.lbl[hidden],.cb-empty[hidden]{display:none!important}[data-cb-compare][aria-pressed=true]{border-color:#e5bd6b;color:#ffe2a8}[data-cb-compare]:focus-visible,.cb-toolbar :focus-visible,.cb-choice button:focus-visible{outline:2px solid #ffe2a8;outline-offset:3px}@media(max-width:540px){.cb-columns{grid-template-columns:1fr}.cb-toolbar label{flex:1}.cb-toolbar [role=status]{width:100%}.cb-heading{align-items:start}}`;
  css.textContent += `.cb-completion{display:grid;gap:8px;margin:14px 0}.cb-completion progress{width:min(100%,420px);height:10px;accent-color:#e5bd6b}.cb-inspector{padding:18px;border:1px solid #e5bd6b88;border-radius:14px;background:#151724aa;margin:16px 0}.cb-inspector h2{font-size:22px;margin:0}.cb-inspector h3{font-size:15px;margin:12px 0 8px}.cb-inspect-body{display:grid;grid-template-columns:minmax(140px,1fr) minmax(0,2fr);gap:20px;align-items:center}.cb-inspect-body>.cprev{display:grid;place-items:center;min-width:0;min-height:100px}.cb-inspect-body .avatar{width:90px;height:90px}.cb-inspector li{margin:8px 0}.cb-inspector button:focus-visible,[data-cb-inspect]:focus-visible{outline:2px solid #ffe2a8;outline-offset:3px}.cb-inspector h2:focus{outline:2px solid #ffe2a8;outline-offset:4px}@media(max-width:540px){.cb-inspect-body{grid-template-columns:1fr}}`;
  document.head.append(css);
})();
