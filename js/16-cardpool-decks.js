// ===== マイデッキ =====
let cpDecks = [];
let cpEditingDeckId = null;
let cpEditingDeckCards = {}; // { "setCode__type__slot": 枚数, ... }（デッキ機能はルールチェック無しの単純な名前＋カード＋枚数の登録）
let cpDeckSearchTimer = null;

function cpDeckRowHtml(d) {
  const cards = d.cards || {};
  const total = Object.values(cards).reduce((a, b) => a + Number(b), 0);
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
  cpEditingDeckCards = deck ? Object.assign({}, deck.cards) : {};
  document.getElementById('cpDeckNameInput').value = deck ? deck.deckName : '';
  document.getElementById('cpDeckStatus').textContent = '';
  document.getElementById('cpDeckSearchInput').value = '';
  document.getElementById('cpDeckSearchResults').style.display = 'none';
  document.getElementById('cpDeckListView').style.display = 'none';
  document.getElementById('cpDeckEditorView').style.display = 'block';
  cpRenderDeckEditorCards();
}

function cpCloseDeckEditor() {
  document.getElementById('cpDeckEditorView').style.display = 'none';
  document.getElementById('cpDeckListView').style.display = 'block';
}
document.getElementById('cpDeckBackBtn').addEventListener('click', cpCloseDeckEditor);
document.getElementById('cpNewDeckBtn').addEventListener('click', () => cpOpenDeckEditor(null));

// デッキに入っている各カードの情報は、所持カード一覧で読み込み済みのキャッシュを優先し、
// 無ければ個別にGASへ取得しにいく（別の弾のカードをデッキに入れている場合など）
async function cpRenderDeckEditorCards() {
  const listEl = document.getElementById('cpDeckCardsList');
  const keys = Object.keys(cpEditingDeckCards);
  if (!keys.length) {
    listEl.innerHTML = '<div class="cpHint">まだカードが追加されていません。上の検索欄からカードを探して追加してください</div>';
    document.getElementById('cpDeckTotalCount').textContent = '0';
    return;
  }

  const rows = [];
  for (const key of keys) {
    let card = collectionCardsCache[key];
    if (!card) {
      const [setCode, type, slot] = key.split('__');
      try {
        const res = await fetch(GAS_URL + `?action=getCard&setCode=${encodeURIComponent(setCode)}&type=${encodeURIComponent(type)}&slot=${encodeURIComponent(slot)}`);
        card = await res.json();
        if (card) collectionCardsCache[key] = card;
      } catch (e) { /* 取得失敗時はスキップ */ }
    }
    if (card) rows.push({ key, card, qty: cpEditingDeckCards[key] });
  }
  rows.sort((a, b) => (a.card.cardName || '').localeCompare(b.card.cardName || '', 'ja'));

  listEl.innerHTML = rows.map(r => `
    <div class="cpDeckCardRow" data-key="${r.key}">
      <img src="${r.card.imageUrl}" class="cpDeckCardThumb" alt="">
      <span class="cpDeckCardName">${escapeHtml(r.card.cardName)}</span>
      <button type="button" class="cpQtyBtn cpDeckQtyMinus" data-key="${r.key}">−</button>
      <span class="cpQtyValue">${r.qty}</span>
      <button type="button" class="cpQtyBtn cpDeckQtyPlus" data-key="${r.key}">＋</button>
      <button type="button" class="cpDeckRemoveBtn" data-key="${r.key}">削除</button>
    </div>
  `).join('');

  const total = rows.reduce((a, r) => a + Number(r.qty), 0);
  document.getElementById('cpDeckTotalCount').textContent = total;

  listEl.querySelectorAll('.cpDeckQtyPlus').forEach(btn => {
    btn.addEventListener('click', () => {
      cpEditingDeckCards[btn.dataset.key] = (cpEditingDeckCards[btn.dataset.key] || 0) + 1;
      cpRenderDeckEditorCards();
    });
  });
  listEl.querySelectorAll('.cpDeckQtyMinus').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = (cpEditingDeckCards[btn.dataset.key] || 0) - 1;
      if (next <= 0) delete cpEditingDeckCards[btn.dataset.key]; else cpEditingDeckCards[btn.dataset.key] = next;
      cpRenderDeckEditorCards();
    });
  });
  listEl.querySelectorAll('.cpDeckRemoveBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      delete cpEditingDeckCards[btn.dataset.key];
      cpRenderDeckEditorCards();
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
    resultsEl.innerHTML = list.map((c, i) => `
      <div class="cpDeckSearchItem" data-idx="${i}">
        <img src="${c.imageUrl}" class="cpDeckCardThumb" alt="">
        <span>${escapeHtml(c.cardName)}（${escapeHtml(c.setCode)} / ${escapeHtml(c.type)}・${escapeHtml(c.rarity || '')}）</span>
      </div>
    `).join('');
    resultsEl.style.display = 'block';
    resultsEl.querySelectorAll('.cpDeckSearchItem').forEach(el => {
      el.addEventListener('click', () => {
        const card = list[Number(el.dataset.idx)];
        const key = cardKey(card);
        collectionCardsCache[key] = card;
        cpEditingDeckCards[key] = (cpEditingDeckCards[key] || 0) + 1;
        document.getElementById('cpDeckSearchInput').value = '';
        resultsEl.style.display = 'none';
        cpRenderDeckEditorCards();
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
