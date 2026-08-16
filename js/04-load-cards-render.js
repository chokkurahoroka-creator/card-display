let isFirstLoad = true;
let lastKnownVersion = null;

async function loadCards() {
  if (!currentSetCode) return;
  if (isFirstLoad) document.getElementById('loading').style.display = 'block';

  const [setsRes, cardsRes] = await Promise.all([
    fetch(GAS_URL + '?action=listSets'),
    fetch(GAS_URL + `?action=list&setCode=${encodeURIComponent(currentSetCode)}`)
  ]);
  const sets = await setsRes.json();
  lastCards = await cardsRes.json();
  lastSetInfo = sets.find(s => s.setCode === currentSetCode) || { totalNew:0, totalRerun:0, totalParallel:0 };
  newCardKeys = computeNewCardKeys(lastCards);

  if (isFirstLoad) {
    document.getElementById('loading').style.display = 'none';
    isFirstLoad = false;
  }
  if (!favViewGroup) render(); // お気に入り表示中は上書きしない
}

// 定期実行:軽量なバージョン確認だけを行い、管理画面側で実際に変更があった時だけ
// listSets/listの本体データを再取得する（毎回全件取得していたのをやめて負荷を削減）
async function checkForUpdates() {
  try {
    const res = await fetch(GAS_URL + '?action=getVersion');
    const data = await res.json();
    if (lastKnownVersion !== null && data.version !== lastKnownVersion) {
      await loadCards();
    }
    lastKnownVersion = data.version;
  } catch (e) { /* 通信失敗時は次回のチェックまで待つ */ }
}

function render() {
  const totalCards = (lastSetInfo.totalNew || 0) + (lastSetInfo.totalRerun || 0) + (lastSetInfo.totalParallel || 0);
  if (!totalCards) {
    document.getElementById('emptyAll').style.display = 'block';
    document.getElementById('areas').style.display = 'none';
    document.getElementById('searchResultsWrap').style.display = 'none';
    document.getElementById('noResults').style.display = 'none';
    return;
  }
  document.getElementById('emptyAll').style.display = 'none';

  if (featuredFilterActive) {
    renderFeaturedResults();
  } else if (searchQuery) {
    renderSearchResults();
  } else {
    document.getElementById('searchResultsWrap').style.display = 'none';
    document.getElementById('noResults').style.display = 'none';
    document.getElementById('areas').style.display = 'block';

    const offsetRerun = lastSetInfo.totalNew || 0;
    const offsetParallel = offsetRerun + (lastSetInfo.totalRerun || 0);
    renderArea('新規', lastSetInfo.totalNew || 0, 0);
    renderArea('再録', lastSetInfo.totalRerun || 0, offsetRerun);
    renderArea('パラレル', lastSetInfo.totalParallel || 0, offsetParallel);

    const newCards = getSectionOrderedCards('新規', lastCards.filter(c => c.type === '新規'));
    const rerunCards = getSectionOrderedCards('再録', lastCards.filter(c => c.type === '再録'));
    const parallelCards = getSectionOrderedCards('パラレル', lastCards.filter(c => c.type === 'パラレル'));
    navList = [...newCards, ...rerunCards, ...parallelCards];
  }
}

function applyCardSize(size) {
  document.body.classList.remove('size-small', 'size-medium', 'size-large');
  document.body.classList.add('size-' + size);
  document.querySelectorAll('.sizeToggle button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.size === size);
  });
}

function matchesQuery(c, q) {
  const query = q.toLowerCase();
  const fields = [c.cardName, c.cardType, c.cardNumber, c.setCode, c.abilityText, c.tags];
  return fields.some(f => (f || '').toString().toLowerCase().includes(query));
}

function renderFeaturedResults() {
  document.getElementById('areas').style.display = 'none';
  let matched = lastCards.filter(c => c.featured === 'TRUE');

  if (!matched.length) {
    document.getElementById('searchResultsWrap').style.display = 'none';
    document.getElementById('noResults').textContent = 'この弾にはまだ注目カードが設定されていません';
    document.getElementById('noResults').style.display = 'block';
    return;
  }
  matched = sortCardsBy(matched, sortState.search.key, sortState.search.dir);
  document.getElementById('noResults').style.display = 'none';
  document.getElementById('searchResultsWrap').style.display = 'block';
  const countEl = document.getElementById('count-search');
  if (countEl) countEl.textContent = `${matched.length} 件`;
  document.getElementById('searchResultsGrid').innerHTML = matched.map(c => cardHtml(c)).join('');
  bindCardClicks(document.getElementById('searchResultsGrid'));
  navList = matched;
}

function renderSearchResults() {
  document.getElementById('noResults').textContent = '該当するカードが見つかりませんでした';
  document.getElementById('areas').style.display = 'none';
  let matched = lastCards.filter(c => matchesQuery(c, searchQuery));

  if (!matched.length) {
    document.getElementById('searchResultsWrap').style.display = 'none';
    document.getElementById('noResults').style.display = 'block';
    return;
  }
  matched = sortCardsBy(matched, sortState.search.key, sortState.search.dir);
  document.getElementById('noResults').style.display = 'none';
  document.getElementById('searchResultsWrap').style.display = 'block';
  const countEl = document.getElementById('count-search');
  if (countEl) countEl.textContent = `${matched.length} 件`;
  document.getElementById('searchResultsGrid').innerHTML = matched.map(c => cardHtml(c)).join('');
  bindCardClicks(document.getElementById('searchResultsGrid'));
  navList = matched;
}

