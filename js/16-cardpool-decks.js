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
  { key: 'holomen', zone: 'main', label: 'ホロメン（サポート等含む）', mainLimit: 50, reserveLimit: 20 },
  { key: 'yell', zone: 'main', label: 'エール', mainLimit: 20, reserveLimit: 0 },
  { key: 'side', zone: 'side', label: 'サイドデッキ', minLimit: 10, maxLimit: 40 }
];

// カードタイプからメインデッキ内の区分（推しホロメン/ホロメン/エール）を判定する
function cpDeckMainCategory(card) {
  const t = (card && card.cardType) || '';
  if (t.indexOf('推しホロメン') !== -1) return 'oshi';
  if (t.indexOf('エール') !== -1) return 'yell';
  return 'holomen'; // ホロメン、Buzzホロメン、各種サポートはまとめてメインデッキ扱い
}

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
  const res = await fetch(GAS_URL + `?action=listUserDecks&userId=${encodeURIComponent(userId)}`);
  cpDecks = await res.json();
  cpRenderDeckList();
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
  for (const key of keys) {
    if (collectionCardsCache[key]) continue;
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
    if (!data || !data.key || data.pane !== 'deckSource') return;
    cpChangeDeckQty(data.key, 1);
  });
  cpDeckDropZoneInitialized = true;
}
cpSetupDeckDropZone();

function cpDeckSectionHtml(sec, items) {
  const total = items.reduce((a, r) => a + r.qty, 0);
  let limitText, overLimit;
  if (sec.zone === 'side') {
    limitText = `${total}枚（目安 ${sec.minLimit}〜${sec.maxLimit}枚）`;
    overLimit = total > sec.maxLimit;
  } else {
    const totalLimit = sec.mainLimit + (sec.reserveLimit || 0);
    limitText = sec.reserveLimit
      ? `${total} / ${sec.mainLimit}枚（控え枠含む上限 ${totalLimit}枚）`
      : `${total} / ${sec.mainLimit}枚`;
    overLimit = total > totalLimit;
  }
  return `
    <div class="cpDeckSection">
      <div class="cpDeckSectionHeader">
        <span class="cpDeckSectionTitle">${escapeHtml(sec.label)}</span>
        <span class="cpDeckSectionCount ${overLimit ? 'over' : ''}">${limitText}</span>
      </div>
      <div class="cpDeckSectionList">
        ${items.length ? items.map(r => cpDeckCardRowHtml(r, sec.zone)).join('') : '<div class="cpHint" style="padding:6px 0;">カードがありません</div>'}
      </div>
    </div>`;
}

function cpDeckCardRowHtml(r, currentZone) {
  const owned = ownedCollection[r.key] || 0;
  const isUnowned = owned < r.qty;
  const toggleLabel = currentZone === 'side' ? 'メインへ戻す' : 'サイドへ移動';
  return `
    <div class="cpDeckCardRow" data-key="${r.key}">
      <img src="${r.card.imageUrl}" class="cpDeckCardThumb ${isUnowned ? 'cpUnownedThumb' : ''}" alt="">
      <span class="cpDeckCardName">${escapeHtml(r.card.cardName)}${isUnowned ? ' <span class="cpUnownedBadge">未所持</span>' : ''}</span>
      <button type="button" class="cpQtyBtn cpDeckQtyMinus" data-key="${r.key}">−</button>
      <span class="cpQtyValue">${r.qty}</span>
      <button type="button" class="cpQtyBtn cpDeckQtyPlus" data-key="${r.key}">＋</button>
      <button type="button" class="cpSecondaryBtn cpDeckZoneToggle" data-key="${r.key}">${toggleLabel}</button>
      <button type="button" class="cpDeckRemoveBtn" data-key="${r.key}">削除</button>
    </div>`;
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

  const grouped = { oshi: [], holomen: [], yell: [], side: [] };
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

  document.getElementById('cpDeckSections').innerHTML = CP_DECK_SECTIONS.map(sec => cpDeckSectionHtml(sec, grouped[sec.key])).join('');
  document.getElementById('cpDeckTotalCount').textContent = totalAll;
  document.getElementById('cpDeckUnownedCount').textContent = unownedCount;

  cpBindDeckEditorCardEvents(document.getElementById('cpDeckSections'));
}

function cpBindDeckEditorCardEvents(container) {
  container.querySelectorAll('.cpDeckQtyPlus').forEach(btn => {
    btn.addEventListener('click', () => {
      cpEditingDeckCards[btn.dataset.key].qty += 1;
      cpRefreshDeckEditor();
    });
  });
  container.querySelectorAll('.cpDeckQtyMinus').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = cpEditingDeckCards[btn.dataset.key];
      entry.qty -= 1;
      if (entry.qty <= 0) delete cpEditingDeckCards[btn.dataset.key];
      cpRefreshDeckEditor();
    });
  });
  container.querySelectorAll('.cpDeckZoneToggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = cpEditingDeckCards[btn.dataset.key];
      entry.zone = entry.zone === 'side' ? 'main' : 'side';
      cpRefreshDeckEditor();
    });
  });
  container.querySelectorAll('.cpDeckRemoveBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      delete cpEditingDeckCards[btn.dataset.key];
      cpRefreshDeckEditor();
    });
  });
}

document.getElementById('cpDeckSearchInput').addEventListener('input', (e) => {
  const q = e.target.value.trim();
  clearTimeout(cpDeckSearchTimer);
  const resultsEl = document.getElementById('cpDeckSearchResults');
  if (q.length < 2) { resultsEl.style.display = 'none'; return; }
  cpDeckSearchTimer = setTimeout(async () => {
    const res = await fetch(GAS_URL + `?action=searchCards&q=${encodeURIComponent(q)}`);
    const list = await res.json();
    if (!list.length) {
      resultsEl.innerHTML = '<div class="cpHint" style="padding:8px;">該当なし</div>';
      resultsEl.style.display = 'block';
      return;
    }
    resultsEl.innerHTML = list.map((c, i) => {
      const owned = ownedCollection[cardKey(c)] || 0;
      return `
      <div class="cpDeckSearchItem" data-idx="${i}">
        <img src="${c.imageUrl}" class="cpDeckCardThumb ${owned ? '' : 'cpUnownedThumb'}" alt="">
        <span>${escapeHtml(c.cardName)}（${escapeHtml(c.setCode)} / ${escapeHtml(c.type)}・${escapeHtml(c.rarity || '')}）${owned ? '' : ' <span class="cpUnownedBadge">未所持</span>'}</span>
      </div>`;
    }).join('');
    resultsEl.style.display = 'block';
    resultsEl.querySelectorAll('.cpDeckSearchItem').forEach(el => {
      el.addEventListener('click', () => {
        const card = list[Number(el.dataset.idx)];
        const key = cardKey(card);
        collectionCardsCache[key] = card;
        if (!cpEditingDeckCards[key]) cpEditingDeckCards[key] = { qty: 0, zone: 'main' };
        cpEditingDeckCards[key].qty += 1;
        document.getElementById('cpDeckSearchInput').value = '';
        resultsEl.style.display = 'none';
        cpRefreshDeckEditor();
      });
    });
  }, 300);
});
document.addEventListener('click', (e) => {
  const wrap = document.querySelector('.cpDeckSearchWrap');
  if (wrap && !wrap.contains(e.target)) document.getElementById('cpDeckSearchResults').style.display = 'none';
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
