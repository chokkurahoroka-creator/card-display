// ===== 所持カード登録（左＝所持カード／右＝検索して追加、の2分割ビュー） =====
let ownedCollection = {}; // { "setCode__type__slot": 枚数, ... }
let cpSets = []; // 公開終了を除いた弾一覧（検索パネルのプルダウン用）
let cpSetNameMap = {}; // setCode -> setName（公開終了も含む全弾。所持カードのパック見出し表示用）
let cpSearchTimer = null;
let cpSaveTimer = null;
let cpDropZonesInitialized = false;

async function cpLoadSets() {
  const res = await fetch(GAS_URL + '?action=listSets');
  const all = await res.json();
  cpSetNameMap = {};
  all.forEach(s => { cpSetNameMap[s.setCode] = s.setName; });
  cpSets = all.filter(s => s.status !== '公開終了');
  const sel = document.getElementById('cpSetSelect');
  sel.innerHTML = cpSets.map(s => `<option value="${escapeHtml(s.setCode)}">${escapeHtml(s.setCode)}（${escapeHtml(s.setName)}）</option>`).join('');
  if (cpSets.length) sel.value = cpSets[cpSets.length - 1].setCode;
}

async function cpLoadOwnedCollection() {
  const res = await fetch(GAS_URL + `?action=getUserCollection&userId=${encodeURIComponent(userId)}`);
  const data = await res.json();
  ownedCollection = data.collection || {};
}

// 変更のたびに毎回サーバーへ送ると負荷が高いため、入力が落ち着いてからまとめて保存する
function cpScheduleSave() {
  const statusEl = document.getElementById('cpSaveStatus');
  if (statusEl) statusEl.textContent = '保存中…';
  clearTimeout(cpSaveTimer);
  cpSaveTimer = setTimeout(async () => {
    try {
      const res = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'saveUserCollection', userId, collection: ownedCollection })
      });
      const json = await res.json();
      if (statusEl) statusEl.textContent = json.error ? ('保存に失敗しました: ' + json.error) : '保存済み';
    } catch (e) {
      if (statusEl) statusEl.textContent = '保存に失敗しました: ' + e.message;
    }
  }, 800);
}

// レアリティに応じたバッジ色（既存サイトのレア度表記に合わせた簡易な色分け）
function cpRarityColor(rarity) {
  const r = (rarity || '').toUpperCase().trim();
  if (['OSR', 'SEC', 'OUR', 'HR', 'SY', 'UR'].indexOf(r) !== -1) return '#d4af6a';
  if (['SR', 'RR'].indexOf(r) !== -1) return '#e08a3c';
  if (['R', 'U'].indexOf(r) !== -1) return '#5a9bd4';
  return '#7a8296';
}

// 所持カード（owned/deckSource）の並び替え用レアリティ順（display.html/admhoroka.htmlと同じ並び順）
const CP_RARITY_ORDER = ['SEC', 'OUR', 'OSR', 'OC', 'HR', 'SY', 'UR', 'SR', 'RR', 'U', 'S', 'R', 'C', 'P', '判別不能', 'その他'];
function cpRarityOrderIndex(rarity) {
  const r = (rarity || '').toUpperCase().trim();
  if (!r) return CP_RARITY_ORDER.indexOf('その他');
  const idx = CP_RARITY_ORDER.indexOf(r);
  return idx === -1 ? CP_RARITY_ORDER.indexOf('判別不能') : idx;
}

// pane: 'owned'（左＝所持カード一覧）/ 'search'（検索結果）/ 'deckSource'（デッキ編集：所持カードから選ぶ）
// owned/deckSource は ＋/－ステッパー付き、search は＋ボタン＋所持数バッジ。
// いずれも枚数が1以上の時だけ、画像右上にホバー表示の「まとめて削除」×ボタンを出す
function cpCardCellHtml(c, pane) {
  const key = cardKey(c);
  collectionCardsCache[key] = c;
  const ownedQty = ownedCollection[key] || 0;
  const rarity = c.rarity || '';
  const rarityBadge = rarity
    ? `<span class="cpRarityBadge" style="background:${cpRarityColor(rarity)};">${escapeHtml(rarity)}</span>`
    : '';

  if (pane === 'owned' || pane === 'deckSource') {
    const qty = pane === 'deckSource'
      ? (typeof cpTotalDeckQtyForCard === 'function' ? cpTotalDeckQtyForCard(key) : 0)
      : ownedQty;
    // デッキ編集の「所持カードから選ぶ」パネルでは、デッキ内の合計枚数（メイン+サイド）が所持枚数を超えている場合に画像をモノクロ表示する
    const isUnowned = pane === 'deckSource' && qty > ownedQty;
    const removeBtn = qty > 0 ? `<button type="button" class="cpCardRemoveBtn" data-key="${key}" title="まとめて削除">×</button>` : '';
    const ownedBadge = (pane === 'deckSource' && ownedQty > 0)
      ? `<span class="cpQtyBadge" title="所持枚数">${ownedQty}</span>` : '';
    return `
      <div class="cpCard ${qty > 0 ? 'owned' : ''}" data-key="${key}" draggable="true">
        <div class="cpCardImgWrap">
          ${rarityBadge}
          <img src="${c.imageUrl}" class="${isUnowned ? 'cpUnownedThumb' : ''}" alt="${escapeHtml(c.cardName)}" loading="lazy">
          ${ownedBadge}
          ${removeBtn}
        </div>
        <div class="cpCardName">${escapeHtml(c.cardName)}</div>
        <div class="cpQtyRow">
          <button type="button" class="cpQtyBtn cpQtyMinus" data-key="${key}">−</button>
          <span class="cpQtyValue">${qty}</span>
          <button type="button" class="cpQtyBtn cpQtyPlus" data-key="${key}">＋</button>
        </div>
      </div>`;
  }

  // 検索パネル側：未所持なら「＋ 追加」ボタン、所持していれば所持カード一覧と同じ＋/－の数量行に切り替える
  const removeBtn = ownedQty > 0 ? `<button type="button" class="cpCardRemoveBtn" data-key="${key}" title="まとめて削除">×</button>` : '';
  const actionHtml = ownedQty > 0
    ? `<div class="cpQtyRow">
        <button type="button" class="cpQtyBtn cpQtyMinus" data-key="${key}">−</button>
        <span class="cpQtyValue">${ownedQty}</span>
        <button type="button" class="cpQtyBtn cpQtyPlus" data-key="${key}">＋</button>
      </div>`
    : `<button type="button" class="cpAddBtn" data-key="${key}" title="追加">＋ 追加</button>`;
  return `
    <div class="cpCard ${ownedQty > 0 ? 'owned' : ''}" data-key="${key}" draggable="true">
      <div class="cpCardImgWrap">
        ${rarityBadge}
        <img src="${c.imageUrl}" alt="${escapeHtml(c.cardName)}" loading="lazy">
        ${removeBtn}
      </div>
      <div class="cpCardName">${escapeHtml(c.cardName)}</div>
      ${actionHtml}
    </div>`;
}

function cpChangeQty(key, delta) {
  const cur = ownedCollection[key] || 0;
  const next = Math.max(0, cur + delta);
  if (next === 0) delete ownedCollection[key]; else ownedCollection[key] = next;

  cpRenderOwnedGrid();
  cpUpdateSearchCard(key);
  cpScheduleSave();
  if (typeof cpRenderUnownedDeckCardsPanel === 'function') cpRenderUnownedDeckCardsPanel();
}

// 検索パネル側に同じカードが表示中であれば、そのカード1枚だけを再描画して差し替える
// （所持数が0⇔1以上をまたぐと「＋ 追加」ボタン⇔＋/－の数量行でボタン構成そのものが変わるため、
//   グリッド全体ではなく該当カードだけを作り直して再バインドする）
function cpUpdateSearchCard(key) {
  const gridEl = document.getElementById('cpSearchGrid');
  if (!gridEl) return;
  const cardEl = gridEl.querySelector(`.cpCard[data-key="${key}"]`);
  const card = collectionCardsCache[key];
  if (!cardEl || !card) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = cpCardCellHtml(card, 'search').trim();
  const newCardEl = wrapper.firstElementChild;
  cpBindCardElEvents(newCardEl, 'search');
  cardEl.replaceWith(newCardEl);
}

function cpBindGridEvents(container, pane) {
  container.querySelectorAll('.cpCard').forEach(el => cpBindCardElEvents(el, pane));
}

// 1枚のカード要素にイベントを紐づける（cpBindGridEventsから全カード分呼ばれるほか、
// 検索パネルでカードの状態（＋追加⇔＋/－）が切り替わった際、その1枚だけ再バインドする時にも使う）
function cpBindCardElEvents(el, pane) {
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ key: el.dataset.key, pane }));
    e.dataTransfer.effectAllowed = 'move';
  });
  const qtyPlus = el.querySelector('.cpQtyPlus');
  if (qtyPlus) {
    qtyPlus.addEventListener('click', () => {
      if (pane === 'deckSource') cpChangeDeckQty(qtyPlus.dataset.key, 1);
      else cpChangeQty(qtyPlus.dataset.key, 1);
    });
  }
  const qtyMinus = el.querySelector('.cpQtyMinus');
  if (qtyMinus) {
    qtyMinus.addEventListener('click', () => {
      if (pane === 'deckSource') cpChangeDeckQty(qtyMinus.dataset.key, -1);
      else cpChangeQty(qtyMinus.dataset.key, -1);
    });
  }
  const addBtn = el.querySelector('.cpAddBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      if (pane === 'deckSource') cpChangeDeckQty(addBtn.dataset.key, 1);
      else cpChangeQty(addBtn.dataset.key, 1);
    });
  }
  const removeBtn = el.querySelector('.cpCardRemoveBtn');
  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (pane === 'deckSource') cpRemoveCardFromDeckEntirely(removeBtn.dataset.key);
      else cpChangeQty(removeBtn.dataset.key, -(ownedCollection[removeBtn.dataset.key] || 0));
    });
  }
  // 所持カードタブのカードをクリックすると、どのデッキに何枚入っているかの詳細を表示する
  // （＋/－/×ボタンのクリックはここでは無視する）
  if (pane === 'owned') {
    el.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      cpOpenCardUsageOverlay(el.dataset.key);
    });
  }
}

// 所持カードタブでカードをクリックした時に、そのカードがどのデッキに何枚入っているか・
// デッキに入れていない残り枚数を表示する
function cpOpenCardUsageOverlay(key) {
  const card = collectionCardsCache[key];
  if (!card) return;
  const owned = ownedCollection[key] || 0;

  const usageList = [];
  let usedTotal = 0;
  (cpDecks || []).forEach(deck => {
    const cards = (typeof cpNormalizeDeckCards === 'function') ? cpNormalizeDeckCards(deck.cards) : {};
    let qtyInThisDeck = 0;
    Object.values(cards).forEach(entry => {
      if (entry.cardKey === key) qtyInThisDeck += entry.qty;
    });
    if (qtyInThisDeck > 0) {
      usageList.push({ deckName: deck.deckName, qty: qtyInThisDeck });
      usedTotal += qtyInThisDeck;
    }
  });
  const remaining = Math.max(0, owned - usedTotal);

  const box = document.getElementById('cpCardUsageBox');
  box.innerHTML = `
    <button type="button" class="cpModalCloseBtn" id="cpCardUsageCloseBtn">×</button>
    <div class="cpCardUsageHeader">
      <img src="${card.imageUrl}" class="cpCardUsageThumb" alt="${escapeHtml(card.cardName)}">
      <div>
        <div class="cpCardUsageName">${escapeHtml(card.cardName)}</div>
        <div class="cpCardUsageMeta">所持 ${owned}枚 ／ デッキ使用合計 ${usedTotal}枚</div>
      </div>
    </div>
    <div class="cpCardUsageListLabel">使用中のデッキ</div>
    <div class="cpCardUsageList">
      ${usageList.length
        ? usageList.map(u => `<div class="cpCardUsageRow"><span>${escapeHtml(u.deckName)}</span><span>${u.qty}枚</span></div>`).join('')
        : '<div class="cpHint" style="padding:8px 0;">このカードを使用しているデッキはありません</div>'}
    </div>
    <div class="cpCardUsageRemaining">デッキに入れていない残り：<strong>${remaining}枚</strong></div>
  `;
  document.getElementById('cpCardUsageOverlay').style.display = 'flex';
  document.getElementById('cpCardUsageCloseBtn').addEventListener('click', cpCloseCardUsageOverlay);
}

function cpCloseCardUsageOverlay() {
  document.getElementById('cpCardUsageOverlay').style.display = 'none';
}
document.getElementById('cpCardUsageOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'cpCardUsageOverlay') cpCloseCardUsageOverlay();
});

// pane='owned'の枠に検索パネルのカードをドロップ→追加(+1) / pane='search'の枠に所持カードをドロップ→削除(-1)
function cpSetupDropZone(el, pane) {
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('dragOver'); });
  el.addEventListener('dragleave', () => el.classList.remove('dragOver'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('dragOver');
    let data;
    try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (err) { return; }
    if (!data || !data.key) return;
    if (pane === 'owned' && data.pane === 'search') cpChangeQty(data.key, 1);
    else if (pane === 'search' && data.pane === 'owned') cpChangeQty(data.key, -1);
  });
}

// カード配列をパック（弾）ごとにグループ化して枠内に描画する（所持カード・検索結果パネルの両方で共通利用）
// 弾の並び順：sets一覧に載っている順（登録順）の新しい方を上に、載っていない（不明含む）ものは末尾にアルファベット順
function cpRenderGroupedCards(gridEl, cards, pane, emptyMessage) {
  if (!cards.length) {
    gridEl.innerHTML = `<div class="cpHint">${emptyMessage}</div>`;
    return;
  }

  const groups = {};
  cards.forEach(c => {
    const sc = c.setCode || '（不明）';
    if (!groups[sc]) groups[sc] = [];
    groups[sc].push(c);
  });
  // 所持カード関連のパネル（所持カードタブ・デッキ編集の「所持カードから選ぶ」）はレア度順、
  // 検索結果パネルは従来通りカード名順に並べる
  const sortByRarity = (pane === 'owned' || pane === 'deckSource');
  Object.keys(groups).forEach(sc => groups[sc].sort((a, b) => {
    if (sortByRarity) {
      const diff = cpRarityOrderIndex(a.rarity) - cpRarityOrderIndex(b.rarity);
      if (diff !== 0) return diff;
    }
    return (a.cardName || '').localeCompare(b.cardName || '', 'ja');
  }));

  const setOrder = cpSets.map(s => s.setCode);
  const sortedSetCodes = Object.keys(groups).sort((a, b) => {
    const ia = setOrder.indexOf(a), ib = setOrder.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ib - ia;
  });

  // パックの折りたたみ（▶/▼）は「所持カード一覧」タブでのみ有効にする
  const collapsible = gridEl.id === 'cpOwnedListGrid';

  gridEl.innerHTML = sortedSetCodes.map(sc => {
    const setName = cpSetNameMap[sc] || '';
    const cardsHtml = groups[sc].map(c => cpCardCellHtml(c, pane)).join('');
    return `
      <div class="cpPackGroup${collapsible ? ' cpPackGroupCollapsible' : ''}">
        <div class="cpPackGroupHeader">
          <span class="cpPackGroupTitleWrap">
            ${collapsible ? '<span class="cpPackGroupArrow">▶</span>' : ''}
            <span class="cpPackGroupTitle">${escapeHtml(sc)}${setName ? '（' + escapeHtml(setName) + '）' : ''}</span>
          </span>
          <span class="cpPackGroupCount">${groups[sc].length}種</span>
        </div>
        <div class="cpPackGroupGrid">${cardsHtml}</div>
      </div>`;
  }).join('');
  cpBindGridEvents(gridEl, pane);

  if (collapsible) {
    gridEl.querySelectorAll('.cpPackGroupCollapsible > .cpPackGroupHeader').forEach(header => {
      header.addEventListener('click', () => header.parentElement.classList.toggle('cpCollapsed'));
    });
  }
}

async function cpRenderOwnedGrid() {
  const targets = ['cpOwnedGrid', 'cpOwnedListGrid'].map(id => document.getElementById(id)).filter(Boolean);
  if (!targets.length) return;
  const keys = Object.keys(ownedCollection).filter(k => ownedCollection[k] > 0);
  if (!keys.length) {
    const emptyHtml = '<div class="cpHint">まだ所持カードが登録されていません。「所持カードを追加」タブから検索して追加、またはドラッグ＆ドロップしてください</div>';
    targets.forEach(t => { t.innerHTML = emptyHtml; });
    return;
  }
  // まだ情報をキャッシュしていないカード（他のタブ・端末で登録済みのもの等）はまとめて取得する
  const uncachedKeys = keys.filter(k => !collectionCardsCache[k]);
  if (uncachedKeys.length) {
    const loadingHtml = cpLoadingHtml('読み込み中...');
    targets.forEach(t => { t.innerHTML = loadingHtml; });
  }
  await cpFetchCardsByKeys(uncachedKeys);
  const cards = keys.map(k => collectionCardsCache[k]).filter(Boolean);
  targets.forEach(t => cpRenderGroupedCards(t, cards, 'owned', '所持カードが見つかりませんでした'));
}

async function cpRenderGridForSet(setCode) {
  const gridEl = document.getElementById('cpSearchGrid');
  gridEl.innerHTML = cpLoadingHtml('読み込み中...');
  const res = await fetch(GAS_URL + `?action=list&setCode=${encodeURIComponent(setCode)}`);
  const cards = await res.json();
  cpRenderGroupedCards(gridEl, cards, 'search', 'この弾にはまだカードが登録されていません');
}

async function cpRenderGridForSearch(query) {
  const gridEl = document.getElementById('cpSearchGrid');
  gridEl.innerHTML = cpLoadingHtml('検索中...');
  const res = await fetch(GAS_URL + `?action=searchCards&q=${encodeURIComponent(query)}`);
  const cards = await res.json();
  // 検索結果もパックシリーズごとにまとめて表示する（デフォルトの並び替え）
  cpRenderGroupedCards(gridEl, cards, 'search', '該当するカードが見つかりませんでした');
}

document.getElementById('cpSetSelect').addEventListener('change', (e) => {
  document.getElementById('cpSearchInput').value = '';
  cpRenderGridForSet(e.target.value);
  cpCloseFilterPopover();
});
document.getElementById('cpSearchInput').addEventListener('input', (e) => {
  const q = e.target.value.trim();
  clearTimeout(cpSearchTimer);
  cpSearchTimer = setTimeout(() => {
    if (q.length >= 2) cpRenderGridForSearch(q);
    else cpRenderGridForSet(document.getElementById('cpSetSelect').value);
  }, 350);
});

// ===== 検索前のプルダウンを集約した「弾で絞り込む」フィルターポップオーバー =====
function cpToggleFilterPopover() {
  const pop = document.getElementById('cpFilterPopover');
  const isOpen = pop.style.display !== 'none';
  pop.style.display = isOpen ? 'none' : 'block';
  document.getElementById('cpFilterBtn').classList.toggle('active', !isOpen);
}
function cpCloseFilterPopover() {
  document.getElementById('cpFilterPopover').style.display = 'none';
  document.getElementById('cpFilterBtn').classList.remove('active');
}
document.getElementById('cpFilterBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  cpToggleFilterPopover();
});
document.addEventListener('click', (e) => {
  const wrap = document.getElementById('cpFilterWrap') || document.querySelector('.cpFilterWrap');
  if (wrap && !wrap.contains(e.target)) cpCloseFilterPopover();
});
document.getElementById('cpFilterClearBtn').addEventListener('click', () => {
  document.getElementById('cpSearchInput').value = '';
  const sel = document.getElementById('cpSetSelect');
  if (cpSets.length) sel.value = cpSets[cpSets.length - 1].setCode;
  cpRenderGridForSet(sel.value);
  cpCloseFilterPopover();
});

async function cpInitCollectionTab() {
  // 互いに依存しない初期データ取得は並列に行い、直列待ちの時間を減らす
  await Promise.all([cpLoadSets(), cpLoadOwnedCollection()]);
  if (!cpDropZonesInitialized) {
    cpSetupDropZone(document.getElementById('cpOwnedGrid'), 'owned');
    cpSetupDropZone(document.getElementById('cpSearchGrid'), 'search');
    cpDropZonesInitialized = true;
  }
  const sel = document.getElementById('cpSetSelect');
  await Promise.all([
    cpRenderOwnedGrid(),
    sel.value ? cpRenderGridForSet(sel.value) : Promise.resolve()
  ]);
}

// ===== 所持カードタブ：デッキで使用中の未所持カード一覧 =====
// 全デッキを横断して、各カードの「デッキ内での最大使用数（メイン+サイド合計）」と「所持数」を比較し、
// 不足しているカードだけを一覧表示する（同じカードを複数デッキで使っていても、最も多く使うデッキの枚数を基準にする）
async function cpRenderUnownedDeckCardsPanel() {
  const badgeEl = document.getElementById('cpUnownedDeckBadge');
  const panelEl = document.getElementById('cpUnownedDeckPanel');
  if (!badgeEl || !panelEl) return;

  const usageInfo = {}; // cardKey -> { maxQty, deckNames: [] }
  (cpDecks || []).forEach(deck => {
    const cards = (typeof cpNormalizeDeckCards === 'function') ? cpNormalizeDeckCards(deck.cards) : {};
    const perDeckUsage = {};
    Object.values(cards).forEach(entry => {
      perDeckUsage[entry.cardKey] = (perDeckUsage[entry.cardKey] || 0) + entry.qty;
    });
    Object.keys(perDeckUsage).forEach(ck => {
      if (!usageInfo[ck]) usageInfo[ck] = { maxQty: 0, deckNames: [] };
      if (perDeckUsage[ck] > usageInfo[ck].maxQty) usageInfo[ck].maxQty = perDeckUsage[ck];
      usageInfo[ck].deckNames.push(deck.deckName);
    });
  });

  const shortageKeys = Object.keys(usageInfo).filter(ck => (ownedCollection[ck] || 0) < usageInfo[ck].maxQty);

  if (!shortageKeys.length) {
    badgeEl.style.display = 'none';
    panelEl.innerHTML = '<div class="cpHint" style="padding:10px 0;">デッキ内に未所持カードはありません</div>';
    return;
  }

  badgeEl.style.display = '';
  badgeEl.textContent = String(shortageKeys.length);

  await cpFetchCardsByKeys(shortageKeys);
  panelEl.innerHTML = shortageKeys.map(key => {
    const card = collectionCardsCache[key];
    if (!card) return '';
    const owned = ownedCollection[key] || 0;
    const need = usageInfo[key].maxQty;
    const short = need - owned;
    const deckNames = [...new Set(usageInfo[key].deckNames)].join('、');
    return `
      <div class="cpUnownedDeckRow">
        <img src="${card.imageUrl}" class="cpUnownedDeckThumb" alt="">
        <div class="cpUnownedDeckInfo">
          <div class="cpUnownedDeckName">${escapeHtml(card.cardName)}</div>
          <div class="cpUnownedDeckMeta">所持${owned} / 必要${need}（使用デッキ: ${escapeHtml(deckNames)}）</div>
        </div>
        <span class="cpUnownedDeckShortage">不足 ${short}枚</span>
      </div>`;
  }).join('');
}

document.getElementById('cpUnownedDeckToggleBtn').addEventListener('click', () => {
  const panelEl = document.getElementById('cpUnownedDeckPanel');
  panelEl.style.display = panelEl.style.display === 'none' ? 'block' : 'none';
});
