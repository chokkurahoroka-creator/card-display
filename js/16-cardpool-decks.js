// ===== マイデッキ =====
// デッキは以下の4区分で構成される（ルールの強制チェックはせず、枚数の目安を表示するのみ）：
//   ・推しホロメン：メイン1枚 + 控え枠10枚（上限11枚）
//   ・ホロメン（サポート等も含むメインデッキ）：メイン50枚 + 控え枠20枚（上限70枚）
//   ・エール：20枚
//   ・サイドデッキ：10〜40枚（カードタイプに関係なく、手動で「サイドへ移動」したカードが入る）
let cpDecks = [];
let cpEditingDeckId = null;
let cpEditingDeckCards = {}; // { "setCode__type__slot": { qty: 枚数, zone: 'main'|'side' } }
let cpDeckSearchTimer = null;

const CP_DECK_SECTIONS = [
  { key: 'oshi', zone: 'main', label: '推しホロメン', mainLimit: 1, reserveLimit: 10 },
  { key: 'holomen', zone: 'main', label: 'メインデッキ', mainLimit: 50, reserveLimit: 20 },
  { key: 'side', zone: 'side', label: 'サイドデッキ', minLimit: 10, maxLimit: 40 },
  { key: 'yell', zone: 'main', label: 'エールデッキ', mainLimit: 20, reserveLimit: 0 }
];

// カードタイプからメインデッキ内の区分（推しホロメン/ホロメン/エール）を判定する
function cpDeckMainCategory(card) {
  const t = (card && card.cardType) || '';
  if (t.indexOf('推しホロメン') !== -1) return 'oshi';
  if (t.indexOf('エール') !== -1) return 'yell';
  return 'holomen'; // ホロメン、Buzzホロメン、各種サポートはまとめてメインデッキ扱い
}

// 同名カードがデッキ内に何枚あるか（別の弾・レアリティの再録/パラレルもカード名が同じなら合算してカウントする）
// デッキ内の枚数を増減する（所持カード自体の枚数は変更しない）。0以下になったら完全に削除する
function cpChangeDeckQty(key, delta) {
  const cur = (cpEditingDeckCards[key] && cpEditingDeckCards[key].qty) || 0;
  const next = Math.max(0, cur + delta);
  if (next === 0) {
    delete cpEditingDeckCards[key];
  } else {
    const zone = (cpEditingDeckCards[key] && cpEditingDeckCards[key].zone) || 'main';
    cpEditingDeckCards[key] = { qty: next, zone };
  }
  cpRefreshDeckEditor();
}

// ×ボタン用：枚数に関わらずそのカードをデッキから丸ごと削除する
function cpRemoveCardFromDeckEntirely(key) {
  delete cpEditingDeckCards[key];
  cpRefreshDeckEditor();
}

// デッキ内容が変わるたびに、右側（デッキ本体）と左側（所持カードから選ぶパネル）の両方を再描画して状態を同期する
async function cpRefreshDeckEditor() {
  await cpRenderDeckEditorCards();
  await cpRenderDeckSourceGrid();
}

// 保存済みデータが旧形式（{key: 枚数}）の場合も読み込めるよう変換する
function cpNormalizeDeckCards(raw) {
  const result = {};
  Object.keys(raw || {}).forEach(key => {
    const v = raw[key];
    if (typeof v === 'number') result[key] = { qty: v, zone: 'main' };
    else if (v && typeof v === 'object') result[key] = { qty: Number(v.qty) || 0, zone: v.zone === 'side' ? 'side' : 'main' };
  });
  return result;
}

function cpDeckRowHtml(d) {
  const cards = cpNormalizeDeckCards(d.cards);
  const total = Object.values(cards).reduce((a, v) => a + v.qty, 0);
  const kinds = Object.keys(cards).length;
  return `
    <div class="cpDeckRow" data-deckid="${d.deckId}">
      <div class="cpDeckRowName">${escapeHtml(d.deckName)}</div>
      <div class="cpDeckRowMeta">${kinds}種類 / 計${total}枚</div>
      <button type="button" class="cpSecondaryBtn cpDeckEditBtn" data-deckid="${d.deckId}">編集</button>
      <button type="button" class="cpSecondaryBtn cpDeckDeleteBtn" data-deckid="${d.deckId}">削除</button>
    </div>`;
}

async function cpLoadDecks() {
  const listEl = document.getElementById('cpDeckList');
  if (listEl) listEl.innerHTML = cpLoadingHtml('読み込み中...');
  const res = await fetch(GAS_URL + `?action=listUserDecks&userId=${encodeURIComponent(userId)}`);
  cpDecks = await res.json();
  cpRenderDeckList();
  if (typeof cpRenderUnownedDeckCardsPanel === 'function') cpRenderUnownedDeckCardsPanel();
}

function cpRenderDeckList() {
  const listEl = document.getElementById('cpDeckList');
  if (!cpDecks.length) { listEl.innerHTML = '<div class="cpHint">まだデッキがありません</div>'; return; }
  listEl.innerHTML = cpDecks.map(cpDeckRowHtml).join('');

  listEl.querySelectorAll('.cpDeckEditBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const deck = cpDecks.find(d => d.deckId === btn.dataset.deckid);
      if (deck) cpOpenDeckEditor(deck);
    });
  });
  listEl.querySelectorAll('.cpDeckDeleteBtn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const deck = cpDecks.find(d => d.deckId === btn.dataset.deckid);
      if (!deck) return;
      if (!confirm(`デッキ「${deck.deckName}」を削除しますか？この操作は取り消せません。`)) return;
      await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'deleteDeck', userId, deckId: deck.deckId })
      });
      await cpLoadDecks();
    });
  });
}

function cpOpenDeckEditor(deck) {
  cpEditingDeckId = deck ? deck.deckId : null;
  cpEditingDeckCards = deck ? cpNormalizeDeckCards(deck.cards) : {};
  document.getElementById('cpDeckNameInput').value = deck ? deck.deckName : '';
  document.getElementById('cpDeckStatus').textContent = '';
  document.getElementById('cpDeckSearchInput').value = '';
  document.getElementById('cpDeckSearchResults').style.display = 'none';
  document.getElementById('cpDeckListView').style.display = 'none';
  document.getElementById('cpDeckEditorView').style.display = 'block';
  cpRefreshDeckEditor();
}

function cpCloseDeckEditor() {
  document.getElementById('cpDeckEditorView').style.display = 'none';
  document.getElementById('cpDeckListView').style.display = 'block';
}
document.getElementById('cpDeckBackBtn').addEventListener('click', cpCloseDeckEditor);
document.getElementById('cpNewDeckBtn').addEventListener('click', () => cpOpenDeckEditor(null));

// 左側「所持カードから選ぶ」パネル：所持カードをパックごとにグループ表示する（所持カードタブと同じ描画ロジックを再利用）
async function cpRenderDeckSourceGrid() {
  const gridEl = document.getElementById('cpDeckSourceGrid');
  const keys = Object.keys(ownedCollection).filter(k => ownedCollection[k] > 0);
  if (!keys.length) {
    gridEl.innerHTML = '<div class="cpHint">所持カードがありません。先に「所持カード」タブでカードを登録してください</div>';
    return;
  }
  const uncachedKeys = keys.filter(k => !collectionCardsCache[k]);
  if (uncachedKeys.length) gridEl.innerHTML = cpLoadingHtml('読み込み中...');
  for (const key of uncachedKeys) {
    const [setCode, type, slot] = key.split('__');
    try {
      const res = await fetch(GAS_URL + `?action=getCard&setCode=${encodeURIComponent(setCode)}&type=${encodeURIComponent(type)}&slot=${encodeURIComponent(slot)}`);
      const card = await res.json();
      if (card) collectionCardsCache[key] = card;
    } catch (e) { /* 取得失敗時はスキップ */ }
  }
  const cards = keys.map(k => collectionCardsCache[k]).filter(Boolean);
  cpRenderGroupedCards(gridEl, cards, 'deckSource', '所持カードが見つかりませんでした');
}

// 右側「デッキ」パネル：所持カードパネルからドラッグされたカードをドロップで追加する
let cpDeckDropZoneInitialized = false;
function cpSetupDeckDropZone() {
  if (cpDeckDropZoneInitialized) return;
  const el = document.getElementById('cpDeckSections');
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('dragOver'); });
  el.addEventListener('dragleave', () => el.classList.remove('dragOver'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('dragOver');
    let data;
    try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (err) { return; }
    if (!data || !data.key || (data.pane !== 'deckSource' && data.pane !== 'deckSearch')) return;
    cpChangeDeckQty(data.key, 1);
  });

  // 検索結果の枠に、デッキ内のカードをドラッグして落とすと1枚削除できる
  const resultsEl = document.getElementById('cpDeckSearchResults');
  resultsEl.addEventListener('dragover', (e) => { e.preventDefault(); resultsEl.classList.add('dragOver'); });
  resultsEl.addEventListener('dragleave', () => resultsEl.classList.remove('dragOver'));
  resultsEl.addEventListener('drop', (e) => {
    e.preventDefault();
    resultsEl.classList.remove('dragOver');
    let data;
    try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (err) { return; }
    if (!data || !data.key || data.pane !== 'deckSource') return;
    cpChangeDeckQty(data.key, -1);
  });

  cpDeckDropZoneInitialized = true;
}
cpSetupDeckDropZone();

// 各区分（推しホロメン/ホロメン/エール/サイドデッキ）の合計枚数と上限を、小さな chip テキストで表す
// セクション見出し「ラベル (N枚)」＋区切り線＋カードタイルのグリッド（添付の大会デッキレシピ画像を参考にしたレイアウト）
function cpDeckSectionBlockHtml(sec, items) {
  const total = items.reduce((a, r) => a + r.qty, 0);
  const tilesHtml = items.length
    ? items.map(r => cpDeckCardCopiesHtml(r, sec.zone)).join('')
    : '<div class="cpHint" style="padding:10px 0;">カードがありません</div>';
  return `
    <div class="cpDeckSectionBlock">
      <div class="cpDeckSectionBlockHeader">
        <span class="cpDeckSectionBlockTitle">${escapeHtml(sec.label)}</span>
        <span class="cpDeckSectionBlockCount">(${total}枚)</span>
      </div>
      <div class="cpDeckSectionBlockGrid">${tilesHtml}</div>
      <div class="cpDeckSectionDivider"></div>
    </div>`;
}

// デッキ内カードは1枚＝1タイルでスタックせず、ギャラリーのように並べて表示する（添付画像を参考にしたスタイル）。
// 所持数を超える分（コピー番号がowned以上）のタイルだけモノクロ表示にする。
// メイン/サイドの切替ボタンは同じカードの最初の1枚だけに表示し、コピーごとにホバー×で1枚ずつ削除できる
function cpDeckCardCopiesHtml(r, currentZone) {
  const owned = ownedCollection[r.key] || 0;
  const toggleLabel = currentZone === 'side' ? 'メインへ' : 'サイドへ';
  const rarity = r.card.rarity || '';
  const rarityBadge = rarity
    ? `<span class="cpRarityBadge" style="background:${cpRarityColor(rarity)};">${escapeHtml(rarity)}</span>`
    : '';

  let html = '';
  for (let i = 0; i < r.qty; i++) {
    const isUnownedCopy = i >= owned;
    html += `
      <div class="cpCard ${isUnownedCopy ? '' : 'owned'}" data-key="${r.key}">
        <div class="cpCardImgWrap">
          ${rarityBadge}
          <img src="${r.card.imageUrl}" class="${isUnownedCopy ? 'cpUnownedThumb' : ''}" alt="${escapeHtml(r.card.cardName)}" loading="lazy">
          <button type="button" class="cpCardRemoveBtn" data-key="${r.key}" title="この1枚を削除">×</button>
        </div>
        ${i === 0 ? `<button type="button" class="cpDeckZoneToggle" data-key="${r.key}">${toggleLabel}</button>` : ''}
      </div>`;
  }
  return html;
}

// デッキに入っている各カードの情報は、所持カード一覧で読み込み済みのキャッシュを優先し、
// 無ければ個別にGASへ取得しにいく（別の弾のカードをデッキに入れている場合など）
async function cpRenderDeckEditorCards() {
  const keys = Object.keys(cpEditingDeckCards);

  for (const key of keys) {
    if (collectionCardsCache[key]) continue;
    const [setCode, type, slot] = key.split('__');
    try {
      const res = await fetch(GAS_URL + `?action=getCard&setCode=${encodeURIComponent(setCode)}&type=${encodeURIComponent(type)}&slot=${encodeURIComponent(slot)}`);
      const card = await res.json();
      if (card) collectionCardsCache[key] = card;
    } catch (e) { /* 取得失敗時はスキップ */ }
  }

  const grouped = { oshi: [], holomen: [], side: [], yell: [] };
  let totalAll = 0;
  let unownedCount = 0;

  keys.forEach(key => {
    const entry = cpEditingDeckCards[key];
    const card = collectionCardsCache[key];
    if (!card) return;
    const sectionKey = entry.zone === 'side' ? 'side' : cpDeckMainCategory(card);
    grouped[sectionKey].push({ key, card, qty: entry.qty, zone: entry.zone });
    totalAll += entry.qty;
    const owned = ownedCollection[key] || 0;
    if (owned < entry.qty) unownedCount += (entry.qty - owned);
  });

  Object.keys(grouped).forEach(k => grouped[k].sort((a, b) => (a.card.cardName || '').localeCompare(b.card.cardName || '', 'ja')));

  // 「推しホロメン」→「メイン」→「サイド」→「エール」の順で表示する
  document.getElementById('cpDeckSections').innerHTML = CP_DECK_SECTIONS.map(sec => cpDeckSectionBlockHtml(sec, grouped[sec.key])).join('');
  document.getElementById('cpDeckTotalCount').textContent = totalAll;
  document.getElementById('cpDeckUnownedCount').textContent = unownedCount;

  cpBindDeckEditorCardEvents(document.getElementById('cpDeckSections'));
}

function cpBindDeckEditorCardEvents(container) {
  container.querySelectorAll('.cpDeckZoneToggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = cpEditingDeckCards[btn.dataset.key];
      entry.zone = entry.zone === 'side' ? 'main' : 'side';
      cpRefreshDeckEditor();
    });
  });
  container.querySelectorAll('.cpCardRemoveBtn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      cpChangeDeckQty(btn.dataset.key, -1); // 1枚だけ削除（0になれば自動的にカード自体も消える）
    });
  });
}

// 検索結果を、所持カードから選ぶパネルと同じカードタイルのギャラリーとして表示する（枠内でドラッグ＆ドロップ操作可能）
function cpDeckSearchResultTileHtml(c) {
  const key = cardKey(c);
  collectionCardsCache[key] = c;
  const ownedQty = ownedCollection[key] || 0;
  const rarity = c.rarity || '';
  const rarityBadge = rarity
    ? `<span class="cpRarityBadge" style="background:${cpRarityColor(rarity)};">${escapeHtml(rarity)}</span>`
    : '';
  return `
    <div class="cpCard ${ownedQty > 0 ? 'owned' : ''}" data-key="${key}" draggable="true">
      <div class="cpCardImgWrap">
        ${rarityBadge}
        <img src="${c.imageUrl}" class="${ownedQty > 0 ? '' : 'cpUnownedThumb'}" alt="${escapeHtml(c.cardName)}" loading="lazy">
        <span class="cpQtyBadge" title="所持枚数">${ownedQty}</span>
      </div>
      <div class="cpCardName">${escapeHtml(c.cardName)}</div>
      <button type="button" class="cpAddBtn" data-key="${key}" title="デッキに追加">＋ 追加</button>
    </div>`;
}

function cpBindDeckSearchResultEvents(container) {
  container.querySelectorAll('.cpCard').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ key: el.dataset.key, pane: 'deckSearch' }));
      e.dataTransfer.effectAllowed = 'move';
    });
  });
  container.querySelectorAll('.cpAddBtn').forEach(btn => {
    btn.addEventListener('click', () => cpChangeDeckQty(btn.dataset.key, 1));
  });
}

document.getElementById('cpDeckSearchInput').addEventListener('input', (e) => {
  const q = e.target.value.trim();
  clearTimeout(cpDeckSearchTimer);
  const resultsEl = document.getElementById('cpDeckSearchResults');
  if (q.length < 2) { resultsEl.style.display = 'none'; resultsEl.innerHTML = ''; return; }
  resultsEl.style.display = 'block';
  resultsEl.innerHTML = cpLoadingHtml('検索中...');
  cpDeckSearchTimer = setTimeout(async () => {
    const res = await fetch(GAS_URL + `?action=searchCards&q=${encodeURIComponent(q)}`);
    const list = await res.json();
    resultsEl.style.display = 'grid';
    if (!list.length) {
      resultsEl.style.display = 'block';
      resultsEl.innerHTML = '<div class="cpHint">該当するカードが見つかりませんでした</div>';
      return;
    }
    resultsEl.innerHTML = list.map(c => cpDeckSearchResultTileHtml(c)).join('');
    cpBindDeckSearchResultEvents(resultsEl);
  }, 300);
});

document.getElementById('cpSaveDeckBtn').addEventListener('click', async () => {
  const name = document.getElementById('cpDeckNameInput').value.trim() || '新しいデッキ';
  const statusEl = document.getElementById('cpDeckStatus');
  statusEl.textContent = '保存中...';
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'saveDeck', userId, deckId: cpEditingDeckId, deckName: name, cards: cpEditingDeckCards })
    });
    const json = await res.json();
    if (json.error) { statusEl.textContent = '保存に失敗しました: ' + json.error; return; }
    cpEditingDeckId = json.deckId;
    statusEl.textContent = '保存しました';
    await cpLoadDecks();
  } catch (e) {
    statusEl.textContent = '保存に失敗しました: ' + e.message;
  }
});

// 「未所持カードを一括追加」：このデッキ内で所持数が足りていないカードについて、
// 所持カードの枚数をデッキで使う枚数まで引き上げて所持カード側へ保存する
document.getElementById('cpBulkAddUnownedBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('cpDeckStatus');
  let addedCount = 0;
  Object.keys(cpEditingDeckCards).forEach(key => {
    const need = cpEditingDeckCards[key].qty;
    const owned = ownedCollection[key] || 0;
    if (need > owned) {
      addedCount += (need - owned);
      ownedCollection[key] = need;
    }
  });

  if (addedCount === 0) {
    alert('未所持のカードはありません。');
    return;
  }

  statusEl.textContent = '所持カードに反映中...';
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'saveUserCollection', userId, collection: ownedCollection })
    });
    const json = await res.json();
    if (json.error) {
      statusEl.textContent = '反映に失敗しました: ' + json.error;
      return;
    }
    statusEl.textContent = `${addedCount}枚を所持カードに追加しました`;
  } catch (e) {
    statusEl.textContent = '反映に失敗しました: ' + e.message;
    return;
  }

  await cpRefreshDeckEditor();
  if (typeof cpRenderUnownedDeckCardsPanel === 'function') cpRenderUnownedDeckCardsPanel();
});

/* ============ 所持カードタブ：デッキで使用中の未所持カード一覧 ============ */
// 保存済みの全デッキを見渡し、「そのデッキを組むのに必要な枚数（各カードごとに、複数デッキ中の最大必要数）」に対して
// 所持枚数が足りていないカードを一覧表示する。所持カードタブから、買い足すべきカードをまとめて確認できるようにする
async function cpRenderUnownedDeckCardsPanel() {
  const badgeEl = document.getElementById('cpUnownedDeckBadge');
  const panelEl = document.getElementById('cpUnownedDeckPanel');
  if (!badgeEl || !panelEl) return;

  const maxNeeded = {}; // key -> { maxQty, deckNames: [] }
  cpDecks.forEach(deck => {
    const cards = cpNormalizeDeckCards(deck.cards);
    Object.keys(cards).forEach(key => {
      const qty = cards[key].qty;
      if (!maxNeeded[key]) maxNeeded[key] = { maxQty: 0, deckNames: [] };
      if (qty > maxNeeded[key].maxQty) maxNeeded[key].maxQty = qty;
      if (maxNeeded[key].deckNames.indexOf(deck.deckName) === -1) maxNeeded[key].deckNames.push(deck.deckName);
    });
  });

  const shortageKeys = Object.keys(maxNeeded).filter(key => (ownedCollection[key] || 0) < maxNeeded[key].maxQty);

  if (!shortageKeys.length) {
    badgeEl.style.display = 'none';
    panelEl.innerHTML = '<div class="cpHint">デッキで不足しているカードはありません</div>';
    return;
  }

  badgeEl.style.display = '';
  badgeEl.textContent = String(shortageKeys.length);

  for (const key of shortageKeys) {
    if (collectionCardsCache[key]) continue;
    const [setCode, type, slot] = key.split('__');
    try {
      const res = await fetch(GAS_URL + `?action=getCard&setCode=${encodeURIComponent(setCode)}&type=${encodeURIComponent(type)}&slot=${encodeURIComponent(slot)}`);
      const card = await res.json();
      if (card) collectionCardsCache[key] = card;
    } catch (e) { /* 取得失敗時はスキップ */ }
  }

  const rows = shortageKeys.map(key => {
    const card = collectionCardsCache[key];
    if (!card) return '';
    const owned = ownedCollection[key] || 0;
    const needed = maxNeeded[key].maxQty;
    const shortage = needed - owned;
    return `
      <div class="cpUnownedDeckRow">
        <img src="${card.imageUrl}" class="cpUnownedDeckThumb" alt="">
        <div class="cpUnownedDeckInfo">
          <div class="cpUnownedDeckName">${escapeHtml(card.cardName)}</div>
          <div class="cpUnownedDeckMeta">所持 ${owned} / 必要 ${needed}枚（<span class="cpUnownedDeckShortage">あと${shortage}枚</span>）・ 使用デッキ: ${escapeHtml(maxNeeded[key].deckNames.join('、'))}</div>
        </div>
      </div>`;
  }).join('');

  panelEl.innerHTML = rows || '<div class="cpHint">デッキで不足しているカードはありません</div>';
}

const cpUnownedDeckToggleBtn = document.getElementById('cpUnownedDeckToggleBtn');
if (cpUnownedDeckToggleBtn) {
  cpUnownedDeckToggleBtn.addEventListener('click', () => {
    const panelEl = document.getElementById('cpUnownedDeckPanel');
    panelEl.style.display = panelEl.style.display === 'none' ? 'block' : 'none';
  });
}
