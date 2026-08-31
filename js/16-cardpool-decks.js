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

// ===== デッキのアイコン（表紙カード）＆枠色（最大2色）設定 =====
// デッキごとの見た目設定は、専用シート列を増やさずに済むよう cardsJson の中に
// 予約キー "__meta__" として同居させる（cardKey::zone 形式ではないため cpNormalizeDeckCards 側で除外している）
let cpEditingDeckIconKey = ''; // アイコンに使うカードキー（未設定なら空文字）
let cpEditingDeckColors = ['#d4af6a']; // 枠色。1〜2件（2件ならグラデーション表示）

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
    if (k === '__meta__') return; // アイコン/枠色の設定用予約キーはカード情報ではないため除外
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

// 保存済みcardsJsonから "__meta__" （アイコン用カードキー・枠色）を取り出す。無ければ既定値を返す
function cpExtractDeckMeta(raw) {
  const meta = (raw && raw.__meta__ && typeof raw.__meta__ === 'object') ? raw.__meta__ : {};
  const icon = typeof meta.icon === 'string' ? meta.icon : '';
  const colors = Array.isArray(meta.colors) ? meta.colors.filter(c => typeof c === 'string' && c).slice(0, 2) : [];
  return { icon, colors };
}

// 表紙カード画像＋枠色（1〜2色）のアイコンフレームHTML。カード画像が未取得/未設定ならプレースホルダーを表示
function cpDeckIconFrameHtml(meta, imageUrl) {
  const colors = (meta.colors && meta.colors.length) ? meta.colors : ['#d4af6a'];
  const bg = colors.length >= 2 ? `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` : colors[0];
  const inner = imageUrl
    ? `<img src="${imageUrl}" alt="">`
    : `<span class="cpDeckIconPlaceholder">${cpIcon('card', 24)}</span>`;
  return `<div class="cpDeckIconFrame" style="background:${bg};"><div class="cpDeckIconInner">${inner}</div></div>`;
}

function cpDeckTileHtml(d) {
  const cards = cpNormalizeDeckCards(d.cards);
  const entries = Object.values(cards);
  const total = entries.reduce((a, v) => a + v.qty, 0);
  const kinds = new Set(entries.map(v => v.cardKey)).size;
  const meta = cpExtractDeckMeta(d.cards);
  const iconCard = meta.icon ? collectionCardsCache[meta.icon] : null;
  return `
    <div class="cpDeckTile" data-deckid="${d.deckId}">
      ${cpDeckIconFrameHtml(meta, iconCard ? iconCard.imageUrl : '')}
      <div class="cpDeckTileName">${escapeHtml(d.deckName)}</div>
      <div class="cpDeckTileMeta">${kinds}種類 / 計${total}枚</div>
      <div class="cpDeckTileActions">
        <button type="button" class="cpSecondaryBtn cpDeckEditBtn" data-deckid="${d.deckId}">編集</button>
        <button type="button" class="cpSecondaryBtn cpDeckDeleteBtn" data-deckid="${d.deckId}">削除</button>
      </div>
    </div>`;
}

// 各デッキのアイコンに使われているカード画像を、一覧描画前にまとめて取得しておく
async function cpPreloadDeckIcons() {
  const keys = [...new Set(cpDecks.map(d => cpExtractDeckMeta(d.cards).icon).filter(Boolean))];
  await cpFetchCardsByKeys(keys);
}

async function cpLoadDecks() {
  const listEl = document.getElementById('cpDeckList');
  if (listEl) listEl.innerHTML = cpLoadingHtml('読み込み中...');
  try {
    const res = await cpFetchWithTimeout(GAS_URL + `?action=listUserDecks&userId=${encodeURIComponent(userId)}`, {}, 20000);
    cpDecks = await res.json();
  } catch (e) {
    console.error('デッキ一覧の取得に失敗しました:', e);
    if (listEl) {
      listEl.innerHTML = '<div class="cpHint">読み込みに失敗しました（通信エラー）。<button type="button" class="cpSecondaryBtn cpRetryDecksBtn" style="margin-left:8px;">再読み込み</button></div>';
      const btn = listEl.querySelector('.cpRetryDecksBtn');
      if (btn) btn.addEventListener('click', cpLoadDecks);
    }
    return;
  }
  await cpPreloadDeckIcons();
  cpRenderDeckList();
  if (typeof cpRenderUnownedDeckCardsPanel === 'function') cpRenderUnownedDeckCardsPanel();
}

function cpRenderDeckList() {
  const listEl = document.getElementById('cpDeckList');
  if (!cpDecks.length) { listEl.innerHTML = '<div class="cpHint">まだデッキがありません</div>'; return; }
  listEl.innerHTML = cpDecks.map(cpDeckTileHtml).join('');

  // タイル本体のクリック（編集/削除ボタン以外）でデッキ内容のプレビューを開く
  listEl.querySelectorAll('.cpDeckTile').forEach(tile => {
    tile.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const deck = cpDecks.find(d => d.deckId === tile.dataset.deckid);
      if (deck) cpOpenDeckPreview(deck);
    });
  });
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

async function cpOpenDeckEditor(deck) {
  cpEditingDeckId = deck ? deck.deckId : null;
  cpEditingDeckCards = deck ? cpNormalizeDeckCards(deck.cards) : {};
  const meta = deck ? cpExtractDeckMeta(deck.cards) : { icon: '', colors: [] };
  cpEditingDeckIconKey = meta.icon || '';
  cpEditingDeckColors = (meta.colors && meta.colors.length) ? meta.colors.slice(0, 2) : ['#d4af6a'];

  document.getElementById('cpDeckNameInput').value = deck ? deck.deckName : '';
  document.getElementById('cpDeckStatus').textContent = '';
  document.getElementById('cpDeckSearchInput').value = '';
  document.getElementById('cpDeckSearchResults').innerHTML = '<div class="cpHint" style="grid-column:1/-1;">カード名を2文字以上入力してください</div>';
  document.getElementById('cpDeckIconPickerPopover').style.display = 'none';
  document.getElementById('cpDeckSettingsPanel').style.display = 'none';
  document.getElementById('cpDeckSettingsToggleBtn').classList.remove('active');
  document.querySelectorAll('.cpDeckAddModeBtn').forEach(b => b.classList.toggle('active', b.dataset.mode === 'owned'));
  document.getElementById('cpDeckAddModeOwned').style.display = 'block';
  document.getElementById('cpDeckAddModeSearch').style.display = 'none';

  const hasColor2 = cpEditingDeckColors.length > 1;
  document.getElementById('cpDeckColor1Input').value = cpEditingDeckColors[0] || '#d4af6a';
  document.getElementById('cpDeckColor2Toggle').checked = hasColor2;
  document.getElementById('cpDeckColor2Input').value = hasColor2 ? cpEditingDeckColors[1] : '#5a9bd4';
  document.getElementById('cpDeckColor2Input').disabled = !hasColor2;
  cpRenderDeckIconPreview();

  document.getElementById('cpDeckListView').style.display = 'none';
  document.getElementById('cpDeckEditorView').style.display = 'block';
  await cpRefreshDeckEditor();
  cpRenderDeckIconPreview(); // デッキカードの取得後、アイコン用カード画像が読み込まれていれば反映する
}

function cpCloseDeckEditor() {
  document.getElementById('cpDeckEditorView').style.display = 'none';
  document.getElementById('cpDeckListView').style.display = 'block';
}
document.getElementById('cpDeckBackBtn').addEventListener('click', cpCloseDeckEditor);
document.getElementById('cpNewDeckBtn').addEventListener('click', () => cpOpenDeckEditor(null));

// ===== デッキ編集画面：アイコン用カード＆枠色の設定UI =====
function cpRenderDeckIconPreview() {
  const iconCard = cpEditingDeckIconKey ? collectionCardsCache[cpEditingDeckIconKey] : null;
  document.getElementById('cpDeckIconPreviewWrap').innerHTML =
    cpDeckIconFrameHtml({ colors: cpEditingDeckColors }, iconCard ? iconCard.imageUrl : '');
}

function cpApplyDeckColorInputs() {
  const colors = [document.getElementById('cpDeckColor1Input').value];
  if (document.getElementById('cpDeckColor2Toggle').checked) {
    colors.push(document.getElementById('cpDeckColor2Input').value);
  }
  cpEditingDeckColors = colors;
  cpRenderDeckIconPreview();
}
document.getElementById('cpDeckColor1Input').addEventListener('input', cpApplyDeckColorInputs);
document.getElementById('cpDeckColor2Input').addEventListener('input', cpApplyDeckColorInputs);
document.getElementById('cpDeckColor2Toggle').addEventListener('change', (e) => {
  document.getElementById('cpDeckColor2Input').disabled = !e.target.checked;
  cpApplyDeckColorInputs();
});

// 現在デッキに入っているカードの中から、アイコンに使う1枚を選ぶポップオーバー
async function cpOpenDeckIconPicker() {
  const pop = document.getElementById('cpDeckIconPickerPopover');
  const willOpen = pop.style.display === 'none';
  if (!willOpen) { pop.style.display = 'none'; return; }

  const cardKeys = [...new Set(Object.values(cpEditingDeckCards).map(e => e.cardKey))];
  if (!cardKeys.length) {
    pop.innerHTML = '<div class="cpHint" style="padding:4px; grid-column:1/-1;">先にデッキへカードを追加してください</div>';
    pop.style.display = 'grid';
    return;
  }
  const uncached = cardKeys.filter(k => !collectionCardsCache[k]);
  if (uncached.length) await cpFetchCardsByKeys(uncached);
  pop.innerHTML = cardKeys.map(key => {
    const card = collectionCardsCache[key];
    if (!card) return '';
    return `<img src="${card.imageUrl}" class="cpDeckIconPickerThumb ${key === cpEditingDeckIconKey ? 'selected' : ''}" data-key="${key}" alt="${escapeHtml(card.cardName)}">`;
  }).join('');
  pop.style.display = 'grid';
  pop.querySelectorAll('.cpDeckIconPickerThumb').forEach(img => {
    img.addEventListener('click', () => {
      cpEditingDeckIconKey = img.dataset.key;
      cpRenderDeckIconPreview();
      pop.style.display = 'none';
    });
  });
}
document.getElementById('cpDeckIconPickBtn').addEventListener('click', cpOpenDeckIconPicker);
document.addEventListener('click', (e) => {
  const pop = document.getElementById('cpDeckIconPickerPopover');
  const btn = document.getElementById('cpDeckIconPickBtn');
  if (pop.style.display !== 'none' && !pop.contains(e.target) && e.target !== btn) pop.style.display = 'none';
});

// 表紙カード・枠色・一括追加の設定パネル（🎨ボタン）の開閉。スマホでは邪魔にならないよう普段は畳んでおく
// （PC幅ではCSS側で常時展開表示にしており、このボタン自体も非表示になる）
document.getElementById('cpDeckSettingsToggleBtn').addEventListener('click', () => {
  const panel = document.getElementById('cpDeckSettingsPanel');
  const toggleBtn = document.getElementById('cpDeckSettingsToggleBtn');
  const willOpen = panel.style.display === 'none';
  panel.style.display = willOpen ? 'block' : 'none';
  toggleBtn.classList.toggle('active', willOpen);
});

// セクション見出し「ラベル (N枚)」＋区切り線＋カードタイルのグリッド
// readonly=true の場合はデッキ内容プレビュー用の表示となり、ドラッグ・削除ボタンを出さない
function cpDeckSectionBlockHtml(sec, items, readonly) {
  const total = items.reduce((a, r) => a + r.qty, 0);
  const tilesHtml = items.length
    ? items.map(r => cpDeckCardCopiesHtml(r, readonly)).join('')
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

// 推しホロメン＋エールをまとめた表示ブロック（デッキ内容プレビュー専用）。
// エールは同じ絵柄が大量に入ることが多いが、違う絵柄のエールカードが混在することもあるため、
// 絵柄（カード）ごとに1枚だけ画像を出し、その上に合計枚数をバッジで重ねて表示する
function cpDeckOshiYellBlockHtml(oshiItems, yellItems) {
  const oshiTotal = oshiItems.reduce((a, r) => a + r.qty, 0);
  const oshiTilesHtml = oshiItems.map(r => cpDeckCardCopiesHtml(r, true)).join('');

  // エールは同じ絵柄が大量に入ることが多いが、違う絵柄が混在することもあるため、
  // 絵柄（カード）ごとに1枚だけ画像を出し、右下に合計枚数をバッジで重ねる。
  // 推しホロメンと同じグリッド（.cpDeckSectionBlockGrid）に並べることで、カードサイズをメインデッキと完全に揃える
  const yellByCard = {};
  (yellItems || []).forEach(r => {
    if (!yellByCard[r.key]) yellByCard[r.key] = { card: r.card, qty: 0 };
    yellByCard[r.key].qty += r.qty;
  });
  const yellEntries = Object.values(yellByCard);
  const yellTotal = yellEntries.reduce((a, v) => a + v.qty, 0);
  const yellTilesHtml = yellEntries.map(v => `
    <div class="cpCard owned cpDeckYellTile">
      <div class="cpCardImgWrap">
        <img src="${v.card.imageUrl}" alt="${escapeHtml(v.card.cardName)}" loading="lazy">
        <span class="cpQtyBadge">×${v.qty}</span>
      </div>
    </div>`).join('');

  const combinedTilesHtml = oshiTilesHtml + yellTilesHtml;
  const bodyHtml = combinedTilesHtml
    ? `<div class="cpDeckSectionBlockGrid">${combinedTilesHtml}</div>`
    : '<div class="cpHint" style="padding:10px 0;">カードがありません</div>';

  const countParts = [`推し${oshiTotal}枚`];
  if (yellTotal > 0) countParts.push(`エール${yellTotal}枚`);

  return `
    <div class="cpDeckSectionBlock">
      <div class="cpDeckSectionBlockHeader">
        <span class="cpDeckSectionBlockTitle">推しホロメン・エール</span>
        <span class="cpDeckSectionBlockCount">(${countParts.join(' / ')})</span>
      </div>
      ${bodyHtml}
      <div class="cpDeckSectionDivider"></div>
    </div>`;
}

// デッキ内カードは1枚＝1タイルでスタックせず、ギャラリーのように並べて表示する。
// 各タイルはドラッグ可能で、他のカードの上にドロップすると並び替え、別ゾーンの枠にドロップするとメイン⇔サイドを移動できる。
// r.unownedFlags（あらかじめ計算済みの配列）で、所持数を超える分のコピーだけモノクロ表示にする
function cpDeckCardCopiesHtml(r, readonly) {
  const rarity = r.card.rarity || '';
  const rarityBadge = rarity
    ? `<span class="cpRarityBadge" style="background:${cpRarityColor(rarity)};">${escapeHtml(rarity)}</span>`
    : '';
  let html = '';
  for (let i = 0; i < r.qty; i++) {
    const isUnownedCopy = !!(r.unownedFlags && r.unownedFlags[i]);
    const removeBtn = readonly ? '' : `<button type="button" class="cpCardRemoveBtn" data-key="${r.key}" data-zone="${r.zone}" title="この1枚を削除">×</button>`;
    html += `
      <div class="cpCard ${isUnownedCopy ? '' : 'owned'}" data-key="${r.key}" data-zone="${r.zone}" ${readonly ? '' : 'draggable="true"'}>
        <div class="cpCardImgWrap">
          ${rarityBadge}
          <img src="${r.card.imageUrl}" class="${isUnownedCopy ? 'cpUnownedThumb' : ''}" alt="${escapeHtml(r.card.cardName)}" loading="lazy">
          ${removeBtn}
        </div>
      </div>`;
  }
  return html;
}

// 「所持カードから選ぶ」の上に表示する、デッキ中身のミニプレビュー（1行25枚・閲覧専用・並び順はデッキ本体と同じ）
function cpDeckMiniPreviewHtml(grouped) {
  let html = '';
  ['oshi', 'holomen', 'yell', 'side'].forEach(sectionKey => {
    grouped[sectionKey].forEach(r => {
      for (let i = 0; i < r.qty; i++) {
        const isUnownedCopy = !!(r.unownedFlags && r.unownedFlags[i]);
        html += `<img src="${r.card.imageUrl}" class="cpDeckMiniPreviewThumb ${isUnownedCopy ? 'cpUnownedThumb' : ''}" alt="${escapeHtml(r.card.cardName)}" loading="lazy">`;
      }
    });
  });
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
  await cpFetchCardsByKeys(uncached);

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

  // パネル切替タブの「🎴 デッキ」バッジ、および「カードを追加」上部のミニプレビューを更新
  // （カードを選ぶ画面に切り替えていても、デッキに何枚入っているかが常に見えるようにする）
  const paneCountEl = document.getElementById('cpDeckPaneCount');
  if (paneCountEl) paneCountEl.textContent = totalAll;
  const miniPreviewGridEl = document.getElementById('cpDeckMiniPreviewGrid');
  if (miniPreviewGridEl) {
    miniPreviewGridEl.innerHTML = totalAll
      ? cpDeckMiniPreviewHtml(grouped)
      : '<div class="cpHint" style="padding:6px 0; grid-column:1/-1;">まだカードがありません</div>';
  }

  cpBindDeckEditorCardEvents(document.getElementById('cpDeckMainZone'));
  cpBindDeckEditorCardEvents(document.getElementById('cpDeckSideZone'));
}

// ===== デッキ一覧のアイコンをクリックした時：デッキ内容プレビュー（読み取り専用） =====
// 編集画面と同じ区分（推しホロメン/メインデッキ/エールデッキ/サイドデッキ）でカードを並べて表示する。
// ドラッグ・削除ボタンは出さず、閲覧専用として使う
async function cpOpenDeckPreview(deck) {
  const overlayEl = document.getElementById('cpDeckPreviewOverlay');
  const boxEl = document.getElementById('cpDeckPreviewBox');
  boxEl.innerHTML = `<button type="button" class="cpModalCloseBtn" id="cpDeckPreviewCloseBtn">×</button>` + cpLoadingHtml('読み込み中...');
  overlayEl.style.display = 'flex';
  document.getElementById('cpDeckPreviewCloseBtn').addEventListener('click', cpCloseDeckPreview);

  const cardsMap = cpNormalizeDeckCards(deck.cards);
  const entryIds = Object.keys(cardsMap);
  const cardKeysNeeded = [...new Set(entryIds.map(id => cardsMap[id].cardKey))];
  const uncached = cardKeysNeeded.filter(ck => !collectionCardsCache[ck]);
  await cpFetchCardsByKeys(uncached);

  // 取得中にモーダルを閉じられていた場合は反映しない
  if (overlayEl.style.display !== 'flex') return;

  const grouped = { oshi: [], holomen: [], side: [], yell: [] };
  let totalAll = 0;
  const usageByCardKey = {};
  entryIds.forEach(entryId => {
    const entry = cardsMap[entryId];
    const card = collectionCardsCache[entry.cardKey];
    if (!card) return;
    const sectionKey = entry.zone === 'side' ? 'side' : cpDeckMainCategory(card);
    grouped[sectionKey].push({ key: entry.cardKey, card, qty: entry.qty, zone: entry.zone, order: entry.order || 0 });
    totalAll += entry.qty;
    usageByCardKey[entry.cardKey] = (usageByCardKey[entry.cardKey] || 0) + entry.qty;
  });
  Object.keys(grouped).forEach(k => grouped[k].sort((a, b) => a.order - b.order));

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

  const sectionsHtml = cpDeckOshiYellBlockHtml(grouped.oshi, grouped.yell)
    + CP_DECK_SECTIONS.filter(sec => sec.key !== 'oshi' && sec.key !== 'yell')
      .map(sec => cpDeckSectionBlockHtml(sec, grouped[sec.key], true)).join('');
  const kinds = new Set(entryIds.map(id => cardsMap[id].cardKey)).size;

  boxEl.innerHTML = `
    <button type="button" class="cpModalCloseBtn" id="cpDeckPreviewCloseBtn">×</button>
    <div class="cpModalDragHandle"></div>
    <div class="cpDeckPreviewHeader">
      <div class="cpDeckPreviewTitleWrap">
        <div class="cpDeckPreviewName">${escapeHtml(deck.deckName)}</div>
        <div class="cpDeckPreviewMeta">${kinds}種類 / 計${totalAll}枚</div>
      </div>
      <button type="button" class="cpSecondaryBtn cpDeckPreviewEditBtn" id="cpDeckPreviewEditBtn"><span class="cpBtnIcon">${cpIcon('edit', 13)}</span> 編集</button>
    </div>
    <div class="cpDeckPreviewSections">${sectionsHtml}</div>
  `;
  document.getElementById('cpDeckPreviewCloseBtn').addEventListener('click', cpCloseDeckPreview);
  document.getElementById('cpDeckPreviewEditBtn').addEventListener('click', () => {
    cpCloseDeckPreview();
    cpOpenDeckEditor(deck);
  });

  // カードをタップすると画像を拡大表示する（このプレビューは閲覧専用のため、ドラッグ操作と競合しない）
  boxEl.querySelectorAll('.cpDeckPreviewSections .cpCard img').forEach(img => {
    img.addEventListener('click', () => cpShowImageZoom(img.src));
  });
}

function cpCloseDeckPreview() {
  document.getElementById('cpDeckPreviewOverlay').style.display = 'none';
}
document.getElementById('cpDeckPreviewOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'cpDeckPreviewOverlay') cpCloseDeckPreview();
});

// ===== デッキ内容プレビュー：下にスワイプすると閉じる（モバイルのボトムシート表示向け） =====
(function cpBindDeckPreviewSwipeToClose() {
  const boxEl = document.getElementById('cpDeckPreviewBox');
  let startY = 0, currentY = 0, swiping = false;

  boxEl.addEventListener('touchstart', (e) => {
    if (boxEl.scrollTop > 0 || !e.touches.length) return; // 中身がスクロール中の時は誤動作しないようにする
    startY = e.touches[0].clientY;
    currentY = startY;
    swiping = true;
    boxEl.style.transition = 'none';
  }, { passive: true });

  boxEl.addEventListener('touchmove', (e) => {
    if (!swiping || !e.touches.length) return;
    currentY = e.touches[0].clientY;
    const dy = currentY - startY;
    if (dy > 0) boxEl.style.transform = `translateY(${dy}px)`;
  }, { passive: true });

  boxEl.addEventListener('touchend', () => {
    if (!swiping) return;
    swiping = false;
    boxEl.style.transition = '';
    boxEl.style.transform = '';
    if (currentY - startY > 90) cpCloseDeckPreview();
    startY = 0; currentY = 0;
  });
})();

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
  await cpFetchCardsByKeys(uncachedKeys);
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
  if (q.length < 2) {
    resultsEl.innerHTML = '<div class="cpHint" style="grid-column:1/-1;">カード名を2文字以上入力してください</div>';
    return;
  }
  resultsEl.innerHTML = cpLoadingHtml('検索中...');
  cpDeckSearchTimer = setTimeout(async () => {
    const res = await fetch(GAS_URL + `?action=searchCards&q=${encodeURIComponent(q)}`);
    const list = await res.json();
    if (!list.length) {
      resultsEl.innerHTML = '<div class="cpHint" style="grid-column:1/-1;">該当するカードが見つかりませんでした</div>';
      return;
    }
    resultsEl.innerHTML = list.map(c => cpDeckSearchResultTileHtml(c)).join('');
    cpBindDeckSearchResultEvents(resultsEl);
  }, 300);
});

// ===== 「カードを追加」：所持カードから追加／検索して追加の切替 =====
document.querySelectorAll('.cpDeckAddModeBtn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cpDeckAddModeBtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('cpDeckAddModeOwned').style.display = btn.dataset.mode === 'owned' ? 'block' : 'none';
    document.getElementById('cpDeckAddModeSearch').style.display = btn.dataset.mode === 'search' ? 'block' : 'none';
  });
});

document.getElementById('cpSaveDeckBtn').addEventListener('click', async () => {
  const name = document.getElementById('cpDeckNameInput').value.trim() || '新しいデッキ';
  const statusEl = document.getElementById('cpDeckStatus');
  statusEl.textContent = '保存中...';
  // アイコン用カードキー・枠色は "__meta__" キーとしてカード一覧に同居させて保存する
  const cardsToSave = Object.assign({}, cpEditingDeckCards, {
    __meta__: { icon: cpEditingDeckIconKey || '', colors: cpEditingDeckColors || [] }
  });
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'saveDeck', userId, deckId: cpEditingDeckId, deckName: name, cards: cardsToSave })
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
