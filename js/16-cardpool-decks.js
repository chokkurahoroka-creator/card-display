// ===== マイデッキ =====
// デッキは以下の4区分で構成される（ルールの強制チェックはせず、枚数の目安を表示するのみ）：
//   ・推しホロメン：メイン1枚 + 控え枠10枚（上限11枚）
//   ・メインデッキ（サポート等も含む）：メイン50枚 + 控え枠20枚（上限70枚）
//   ・サイドデッキ：10〜40枚
//   ・エールデッキ：20枚
//
// データ構造：cpEditingDeckCards は「カードキー::ゾーン」を辞書キーとして持つ
//   { "setCode__type__slot::main": { cardKey, zone, qty, order }, "setCode__type__slot::side": {...} }
// 同じカードをメイン・サイド両方に独立して入れられるようにするため、ゾーンごとに別エントリとして管理する。
// order はドラッグ＆ドロップによる手動並び替えの表示順（追加時は自動採番、並び替え時に書き換える）
let cpDecks = [];
let cpEditingDeckId = null;
let cpEditingDeckCards = {};
let cpDeckSearchTimer = null;
let cpDeckDropZoneInitialized = false;

const CP_DECK_SECTIONS = [
  { key: 'oshi', zone: 'main', label: '推しホロメン', mainLimit: 1, reserveLimit: 10 },
  { key: 'holomen', zone: 'main', label: 'メインデッキ', mainLimit: 50, reserveLimit: 20 },
  { key: 'yell', zone: 'main', label: 'エールデッキ', mainLimit: 20, reserveLimit: 0 },
  { key: 'side', zone: 'side', label: 'サイドデッキ', minLimit: 10, maxLimit: 40 }
];

function cpDeckEntryId(cardKeyStr, zone) { return cardKeyStr + '::' + zone; }

// カードタイプからメインデッキ内の区分（推しホロメン/メイン/エール）を判定する
function cpDeckMainCategory(card) {
  const t = (card && card.cardType) || '';
  if (t.indexOf('推しホロメン') !== -1) return 'oshi';
  if (t.indexOf('エール') !== -1) return 'yell';
  return 'holomen'; // ホロメン、Buzzホロメン、各種サポートはまとめてメインデッキ扱い
}

// 現在のエントリの中で最大のorderの次の値を返す（新規追加・末尾への移動に使用）
function cpNextOrder() {
  let max = 0;
  Object.values(cpEditingDeckCards).forEach(e => { if ((e.order || 0) > max) max = e.order; });
  return max + 1;
}

// 指定カードのデッキ内合計枚数（メイン+サイド）を返す（「所持カードから選ぶ」パネルのバッジ表示用）
function cpTotalDeckQtyForCard(cardKeyStr) {
  let total = 0;
  Object.values(cpEditingDeckCards).forEach(entry => {
    if (entry.cardKey === cardKeyStr) total += entry.qty;
  });
  return total;
}

// 指定ゾーンでの枚数を増減する（0以下になったらそのゾーンのエントリを削除）。所持カード自体の枚数は変更しない
function cpChangeDeckQty(cardKeyStr, delta, zone) {
  zone = zone === 'side' ? 'side' : 'main';
  const entryId = cpDeckEntryId(cardKeyStr, zone);
  const cur = (cpEditingDeckCards[entryId] && cpEditingDeckCards[entryId].qty) || 0;
  const next = Math.max(0, cur + delta);
  if (next === 0) {
    delete cpEditingDeckCards[entryId];
  } else {
    const order = (cpEditingDeckCards[entryId] && cpEditingDeckCards[entryId].order !== undefined)
      ? cpEditingDeckCards[entryId].order : cpNextOrder();
    cpEditingDeckCards[entryId] = { cardKey: cardKeyStr, zone, qty: next, order };
  }
  cpRefreshDeckEditor();
}

// 「所持カードから選ぶ」パネルの×ボタン用：ゾーンに関わらずそのカードをデッキから丸ごと削除する
function cpRemoveCardFromDeckEntirely(cardKeyStr) {
  Object.keys(cpEditingDeckCards).forEach(entryId => {
    if (cpEditingDeckCards[entryId].cardKey === cardKeyStr) delete cpEditingDeckCards[entryId];
  });
  cpRefreshDeckEditor();
}

// ドラッグ＆ドロップの着地点を処理する共通関数。
//  ・所持カード/検索結果からのドロップ → そのゾーンへ追加（targetCardKeyがあればその直前に挿入）
//  ・デッキ内カードからのドロップ → 同じゾーンなら並び替え、別ゾーンならゾーン移動（メイン⇔サイド）
//    移動先に同じカードが既にあれば加算し、同じカードをメイン・サイド両方に別々に持つこともできる
function cpHandleDeckDrop(data, targetZone, targetCardKey) {
  if (!data || !data.key) return;

  const insertOrderNear = () => {
    if (targetCardKey) {
      const targetEntry = cpEditingDeckCards[cpDeckEntryId(targetCardKey, targetZone)];
      if (targetEntry) return targetEntry.order - 0.5;
    }
    return cpNextOrder();
  };

  if (data.pane === 'deckSource' || data.pane === 'deckSearch') {
    const entryId = cpDeckEntryId(data.key, targetZone);
    const cur = (cpEditingDeckCards[entryId] && cpEditingDeckCards[entryId].qty) || 0;
    const order = (cpEditingDeckCards[entryId] && cpEditingDeckCards[entryId].order !== undefined)
      ? cpEditingDeckCards[entryId].order : insertOrderNear();
    cpEditingDeckCards[entryId] = { cardKey: data.key, zone: targetZone, qty: cur + 1, order };
    cpRefreshDeckEditor();
    return;
  }

  if (data.pane === 'deckCard') {
    const sourceZone = data.zone === 'side' ? 'side' : 'main';
    const sourceEntryId = cpDeckEntryId(data.key, sourceZone);
    const sourceEntry = cpEditingDeckCards[sourceEntryId];
    if (!sourceEntry) return;
    if (sourceZone === targetZone && data.key === targetCardKey) return; // 自分自身へのドロップは無視

    const newOrder = insertOrderNear();

    if (sourceZone === targetZone) {
      // 同じゾーン内での並び替え
      sourceEntry.order = newOrder;
    } else {
      // 別ゾーンへ移動（メイン⇔サイド）。移動先に同じカードが既にあれば加算する
      const destEntryId = cpDeckEntryId(data.key, targetZone);
      const destExisting = cpEditingDeckCards[destEntryId];
      if (destExisting) {
        destExisting.qty += sourceEntry.qty;
      } else {
        cpEditingDeckCards[destEntryId] = { cardKey: data.key, zone: targetZone, qty: sourceEntry.qty, order: newOrder };
      }
      delete cpEditingDeckCards[sourceEntryId];
    }
    cpRefreshDeckEditor();
  }
}

// デッキ本体（右側パネル）に「メインへ/サイドへドロップ」の受け皿を用意する
function cpSetupDeckDropZone() {
  if (cpDeckDropZoneInitialized) return;

  ['main', 'side'].forEach(zone => {
    const el = document.getElementById(zone === 'main' ? 'cpDeckMainZone' : 'cpDeckSideZone');
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('dragOver'); });
    el.addEventListener('dragleave', () => el.classList.remove('dragOver'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('dragOver');
      let data;
      try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (err) { return; }
      cpHandleDeckDrop(data, zone, null); // 個別カード以外（余白）へのドロップ＝末尾へ追加/移動
    });
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
    if (!data || !data.key || data.pane !== 'deckCard') return;
    cpChangeDeckQty(data.key, -1, data.zone);
  });

  cpDeckDropZoneInitialized = true;
}
cpSetupDeckDropZone();

// 保存済みデータの形式を吸収して正規化する。
//  ・最新形式: { "cardKey::zone": {qty, order} }
//  ・旧形式  : { "cardKey": {qty, zone} }
//  ・旧々形式: { "cardKey": 枚数 }
// 戻り値は常に { "cardKey::zone": {cardKey, zone, qty, order} } の最新形式
function cpNormalizeDeckCards(raw) {
  const result = {};
  let orderCounter = 0;
  Object.keys(raw || {}).forEach(k => {
    const v = raw[k];
    if (k.indexOf('::') !== -1) {
      const idx = k.lastIndexOf('::');
      const cardKeyStr = k.slice(0, idx);
      const zone = k.slice(idx + 2) === 'side' ? 'side' : 'main';
      const qty = (v && typeof v === 'object') ? (Number(v.qty) || 0) : (Number(v) || 0);
      if (qty <= 0) return;
      const order = (v && typeof v === 'object' && v.order !== undefined) ? v.order : (orderCounter++);
      result[k] = { cardKey: cardKeyStr, zone, qty, order };
    } else if (typeof v === 'number') {
      if (v <= 0) return;
      const entryId = cpDeckEntryId(k, 'main');
      result[entryId] = { cardKey: k, zone: 'main', qty: v, order: orderCounter++ };
    } else if (v && typeof v === 'object') {
      const zone = v.zone === 'side' ? 'side' : 'main';
      const qty = Number(v.qty) || 0;
      if (qty <= 0) return;
      const entryId = cpDeckEntryId(k, zone);
      result[entryId] = { cardKey: k, zone, qty, order: orderCounter++ };
    }
  });
  return result;
}

function cpDeckRowHtml(d) {
  const cards = cpNormalizeDeckCards(d.cards);
  const entries = Object.values(cards);
  const total = entries.reduce((a, v) => a + v.qty, 0);
  const kinds = new Set(entries.map(v => v.cardKey)).size;
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

// セクション見出し「ラベル (N枚)」＋区切り線＋カードタイルのグリッド
function cpDeckSectionBlockHtml(sec, items) {
  const total = items.reduce((a, r) => a + r.qty, 0);
  const tilesHtml = items.length
    ? items.map(r => cpDeckCardCopiesHtml(r)).join('')
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

// デッキ内カードは1枚＝1タイルでスタックせず、ギャラリーのように並べて表示する。
// 各タイルはドラッグ可能で、他のカードの上にドロップすると並び替え、別ゾーンの枠にドロップするとメイン⇔サイドを移動できる。
// r.unownedFlags（あらかじめ計算済みの配列）で、所持数を超える分のコピーだけモノクロ表示にする
function cpDeckCardCopiesHtml(r) {
  const rarity = r.card.rarity || '';
  const rarityBadge = rarity
    ? `<span class="cpRarityBadge" style="background:${cpRarityColor(rarity)};">${escapeHtml(rarity)}</span>`
    : '';
  let html = '';
  for (let i = 0; i < r.qty; i++) {
    const isUnownedCopy = !!(r.unownedFlags && r.unownedFlags[i]);
    html += `
      <div class="cpCard ${isUnownedCopy ? '' : 'owned'}" data-key="${r.key}" data-zone="${r.zone}" draggable="true">
        <div class="cpCardImgWrap">
          ${rarityBadge}
          <img src="${r.card.imageUrl}" class="${isUnownedCopy ? 'cpUnownedThumb' : ''}" alt="${escapeHtml(r.card.cardName)}" loading="lazy">
          <button type="button" class="cpCardRemoveBtn" data-key="${r.key}" data-zone="${r.zone}" title="この1枚を削除">×</button>
        </div>
      </div>`;
  }
  return html;
}

// デッキに入っている各カードの情報は、所持カード一覧で読み込み済みのキャッシュを優先し、
// 無ければ個別にGASへ取得しにいく（別の弾のカードをデッキに入れている場合など）
async function cpRenderDeckEditorCards() {
  const entryIds = Object.keys(cpEditingDeckCards);
  const cardKeysNeeded = [...new Set(entryIds.map(id => cpEditingDeckCards[id].cardKey))];
  const uncached = cardKeysNeeded.filter(ck => !collectionCardsCache[ck]);

  if (uncached.length) {
    const loadingHtml = cpLoadingHtml('読み込み中...');
    document.getElementById('cpDeckMainZone').innerHTML = loadingHtml;
    document.getElementById('cpDeckSideZone').innerHTML = '';
  }
  for (const ck of uncached) {
    const [setCode, type, slot] = ck.split('__');
    try {
      const res = await fetch(GAS_URL + `?action=getCard&setCode=${encodeURIComponent(setCode)}&type=${encodeURIComponent(type)}&slot=${encodeURIComponent(slot)}`);
      const card = await res.json();
      if (card) collectionCardsCache[ck] = card;
    } catch (e) { /* 取得失敗時はスキップ */ }
  }

  const grouped = { oshi: [], holomen: [], side: [], yell: [] };
  let totalAll = 0;
  const usageByCardKey = {};

  entryIds.forEach(entryId => {
    const entry = cpEditingDeckCards[entryId];
    const card = collectionCardsCache[entry.cardKey];
    if (!card) return;
    const sectionKey = entry.zone === 'side' ? 'side' : cpDeckMainCategory(card);
    grouped[sectionKey].push({ key: entry.cardKey, card, qty: entry.qty, zone: entry.zone, order: entry.order || 0 });
    totalAll += entry.qty;
    usageByCardKey[entry.cardKey] = (usageByCardKey[entry.cardKey] || 0) + entry.qty;
  });

  let unownedCount = 0;
  Object.keys(usageByCardKey).forEach(ck => {
    const owned = ownedCollection[ck] || 0;
    if (owned < usageByCardKey[ck]) unownedCount += (usageByCardKey[ck] - owned);
  });

  Object.keys(grouped).forEach(k => grouped[k].sort((a, b) => a.order - b.order));

  // 所持数をメインゾーン優先で消費し、残りをサイドゾーンに割り当てて、コピーごとの所持/未所持を判定する
  const ownedRemaining = {};
  Object.keys(usageByCardKey).forEach(ck => { ownedRemaining[ck] = ownedCollection[ck] || 0; });
  ['oshi', 'holomen', 'yell', 'side'].forEach(sk => {
    grouped[sk].forEach(r => {
      const flags = [];
      for (let i = 0; i < r.qty; i++) {
        if ((ownedRemaining[r.key] || 0) > 0) { ownedRemaining[r.key]--; flags.push(false); }
        else flags.push(true);
      }
      r.unownedFlags = flags;
    });
  });

  const mainHtml = '<div class="cpDeckZoneLabel">▼ ここにドロップでメインデッキへ</div>'
    + CP_DECK_SECTIONS.filter(s => s.zone === 'main').map(sec => cpDeckSectionBlockHtml(sec, grouped[sec.key])).join('');
  const sideHtml = '<div class="cpDeckZoneLabel">▼ ここにドロップでサイドデッキへ</div>'
    + CP_DECK_SECTIONS.filter(s => s.zone === 'side').map(sec => cpDeckSectionBlockHtml(sec, grouped[sec.key])).join('');

  document.getElementById('cpDeckMainZone').innerHTML = mainHtml;
  document.getElementById('cpDeckSideZone').innerHTML = sideHtml;
  document.getElementById('cpDeckTotalCount').textContent = totalAll;
  document.getElementById('cpDeckUnownedCount').textContent = unownedCount;

  cpBindDeckEditorCardEvents(document.getElementById('cpDeckMainZone'));
  cpBindDeckEditorCardEvents(document.getElementById('cpDeckSideZone'));
}

// デッキ内タイルのドラッグ開始・並び替え／ゾーン移動用ドロップ・1枚削除ボタンを紐づける
function cpBindDeckEditorCardEvents(container) {
  container.querySelectorAll('.cpCard').forEach(tile => {
    tile.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ key: tile.dataset.key, zone: tile.dataset.zone, pane: 'deckCard' }));
      e.dataTransfer.effectAllowed = 'move';
    });
    tile.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
    tile.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation(); // 親のゾーン全体のドロップ処理と二重に走らないようにする
      let data;
      try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (err) { return; }
      cpHandleDeckDrop(data, tile.dataset.zone, tile.dataset.key);
    });
  });
  container.querySelectorAll('.cpCardRemoveBtn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      cpChangeDeckQty(btn.dataset.key, -1, btn.dataset.zone);
    });
  });
}

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

// デッキ内容が変わるたびに、デッキ本体（メイン/サイド）と所持カードから選ぶパネルの両方を再描画して状態を同期する
async function cpRefreshDeckEditor() {
  await cpRenderDeckEditorCards();
  await cpRenderDeckSourceGrid();
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
    btn.addEventListener('click', () => cpChangeDeckQty(btn.dataset.key, 1, 'main'));
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

// 「未所持カードを一括追加」：このデッキ内（メイン+サイド合計）で所持数が足りていないカードについて、
// 所持カードの枚数をデッキで使う枚数まで引き上げて所持カード側へ保存する
document.getElementById('cpBulkAddUnownedBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('cpDeckStatus');
  const usage = {};
  Object.values(cpEditingDeckCards).forEach(entry => {
    usage[entry.cardKey] = (usage[entry.cardKey] || 0) + entry.qty;
  });

  let addedCount = 0;
  Object.keys(usage).forEach(ck => {
    const need = usage[ck];
    const owned = ownedCollection[ck] || 0;
    if (need > owned) {
      addedCount += (need - owned);
      ownedCollection[ck] = need;
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
