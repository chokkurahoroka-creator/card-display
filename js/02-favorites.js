function cardKey(c) { return `${c.setCode}__${c.type}__${c.slot}`; }
function isFav(c, group) { return !!(group && favGroups[group] && favGroups[group].includes(cardKey(c))); }
function saveFavGroups() { localStorage.setItem('cardFavGroups', JSON.stringify(favGroups)); }

function toggleFav(c) {
  if (!activeGroup) {
    const name = (prompt('グループ名を入力してください（例: お気に入り）', 'お気に入り') || '').trim();
    if (!name) return;
    if (!favGroups[name]) favGroups[name] = [];
    activeGroup = name;
  }
  const key = cardKey(c);
  const arr = favGroups[activeGroup];
  const idx = arr.indexOf(key);
  if (idx === -1) { arr.push(key); logStatEvent('favorite', c); } else { arr.splice(idx, 1); } // 統計は追加時のみ記録（削除は対象外）
  saveFavGroups();
  renderFavMenu();
  // 表示中のスターの見た目だけ更新（再描画は避けて軽量に）
  document.querySelectorAll(`.favStar[data-fullkey="${key}"]`).forEach(btn => {
    const on = isFav(c, activeGroup);
    btn.classList.toggle('active', on);
    btn.textContent = on ? '★' : '☆';
  });
}

// グループ切り替え時、現在表示中の全カードの星マークをactiveGroup基準で更新
function refreshVisibleFavStars() {
  document.querySelectorAll('.favStar[data-fullkey]').forEach(btn => {
    const c = renderedCardsIndex[btn.dataset.fullkey];
    if (!c) return;
    const on = isFav(c, activeGroup);
    btn.classList.toggle('active', on);
    btn.textContent = on ? '★' : '☆';
  });
}

function renderFavMenu() {
  const listEl = document.getElementById('favGroupList');
  const names = Object.keys(favGroups);
  if (!names.length) {
    listEl.innerHTML = '<div class="favEmptyHint">まだグループがありません。「＋新しいグループ」から作成してください</div>';
    return;
  }
  listEl.innerHTML = names.map(name => `
    <div class="favGroupRow ${name === activeGroup ? 'active' : ''}">
      <span class="favGroupName" data-group="${escapeHtml(name)}">${escapeHtml(name)}（${(favGroups[name]||[]).length}）</span>
      <button type="button" class="favShowBtn" data-group="${escapeHtml(name)}">表示</button>
      <button type="button" class="favDelBtn" data-group="${escapeHtml(name)}">削除</button>
    </div>
  `).join('');

  listEl.querySelectorAll('.favGroupName').forEach(el => {
    el.addEventListener('click', () => {
      activeGroup = el.dataset.group;
      renderFavMenu();
      refreshVisibleFavStars();
    });
  });
  listEl.querySelectorAll('.favShowBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('favMenu').style.display = 'none';
      activeGroup = btn.dataset.group;
      showFavoritesView(btn.dataset.group);
    });
  });
  listEl.querySelectorAll('.favDelBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm(`グループ「${btn.dataset.group}」を削除しますか？（登録したお気に入りも消えます）`)) return;
      delete favGroups[btn.dataset.group];
      if (activeGroup === btn.dataset.group) activeGroup = Object.keys(favGroups)[0] || null;
      saveFavGroups();
      renderFavMenu();
      if (favViewGroup === btn.dataset.group) { favViewGroup = null; render(); }
    });
  });
}

async function showFavoritesView(group) {
  favViewGroup = group;
  searchQuery = '';
  document.getElementById('searchInput').value = '';
  document.getElementById('areas').style.display = 'none';
  document.getElementById('emptyAll').style.display = 'none';
  document.getElementById('noResults').style.display = 'none';
  document.getElementById('loading').style.display = 'block';

  const keys = favGroups[group] || [];
  if (!keys.length) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('searchResultsWrap').style.display = 'none';
    document.getElementById('noResults').textContent = 'このグループにはまだカードが登録されていません';
    document.getElementById('noResults').style.display = 'block';
    return;
  }

  const neededSets = [...new Set(keys.map(k => k.split('__')[0]))];
  let allCards = [];
  for (const sc of neededSets) {
    try {
      const res = await fetch(GAS_URL + `?action=list&setCode=${encodeURIComponent(sc)}`);
      const cards = await res.json();
      allCards = allCards.concat(cards);
    } catch (e) { /* skip failed set */ }
  }
  const matched = allCards.filter(c => keys.includes(cardKey(c)));

  document.getElementById('loading').style.display = 'none';
  document.getElementById('noResults').textContent = '該当するカードが見つかりませんでした';
  if (!matched.length) {
    document.getElementById('searchResultsWrap').style.display = 'none';
    document.getElementById('noResults').style.display = 'block';
    return;
  }
  document.getElementById('noResults').style.display = 'none';
  document.getElementById('searchResultsWrap').style.display = 'block';
  document.getElementById('searchResultsGrid').innerHTML = matched.map(c => cardHtml(c)).join('');
  bindCardClicks(document.getElementById('searchResultsGrid'));
  navList = matched;
}

// 画面幅に応じて検索欄をトップバー(スマホ)⇔controlsRow(PC)に移動
