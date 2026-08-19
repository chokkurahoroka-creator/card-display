// ===== 所持カード一覧 =====
let ownedCollection = {}; // { "setCode__type__slot": 枚数, ... }
let cpSets = [];
let cpSearchTimer = null;
let cpSaveTimer = null;

async function cpLoadSets() {
  const res = await fetch(GAS_URL + '?action=listSets');
  const all = await res.json();
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

function cpCardCellHtml(c) {
  const key = cardKey(c);
  collectionCardsCache[key] = c;
  const qty = ownedCollection[key] || 0;
  return `
    <div class="cpCard ${qty > 0 ? 'owned' : ''}" data-key="${key}">
      <img src="${c.imageUrl}" alt="${escapeHtml(c.cardName)}" loading="lazy">
      <div class="cpCardBody">
        <div class="cpCardName">${escapeHtml(c.cardName)}</div>
        <div class="cpCardMeta">${escapeHtml(c.rarity || '')} ${escapeHtml(c.setCode)}${c.cardNumber ? '-' + escapeHtml(c.cardNumber) : ''}</div>
      </div>
      <div class="cpQtyRow">
        <button type="button" class="cpQtyBtn cpQtyMinus" data-key="${key}">−</button>
        <span class="cpQtyValue" id="cpQty_${key}">${qty}</span>
        <button type="button" class="cpQtyBtn cpQtyPlus" data-key="${key}">＋</button>
      </div>
    </div>`;
}

function cpChangeQty(key, delta) {
  const cur = ownedCollection[key] || 0;
  const next = Math.max(0, cur + delta);
  if (next === 0) delete ownedCollection[key]; else ownedCollection[key] = next;

  const qtyEl = document.getElementById('cpQty_' + key);
  if (qtyEl) qtyEl.textContent = next;
  const cardEl = document.querySelector(`.cpCard[data-key="${cssEscapeKey(key)}"]`);
  if (cardEl) cardEl.classList.toggle('owned', next > 0);

  cpScheduleSave();
}

// data-key には "__" を含むキーが入るため、CSS.escape が使えない古い環境向けに簡易フォールバックを用意
function cssEscapeKey(key) {
  return (window.CSS && CSS.escape) ? CSS.escape(key) : key.replace(/["\\]/g, '\\$&');
}

function cpBindGridEvents(container) {
  container.querySelectorAll('.cpQtyPlus').forEach(btn => {
    btn.addEventListener('click', () => cpChangeQty(btn.dataset.key, 1));
  });
  container.querySelectorAll('.cpQtyMinus').forEach(btn => {
    btn.addEventListener('click', () => cpChangeQty(btn.dataset.key, -1));
  });
}

async function cpRenderGridForSet(setCode) {
  const gridEl = document.getElementById('cpCollectionGrid');
  gridEl.innerHTML = '<div class="cpHint">読み込み中...</div>';
  const res = await fetch(GAS_URL + `?action=list&setCode=${encodeURIComponent(setCode)}`);
  const cards = await res.json();
  if (!cards.length) { gridEl.innerHTML = '<div class="cpHint">この弾にはまだカードが登録されていません</div>'; return; }
  cards.sort((a, b) => (a.cardName || '').localeCompare(b.cardName || '', 'ja'));
  gridEl.innerHTML = cards.map(cpCardCellHtml).join('');
  cpBindGridEvents(gridEl);
}

async function cpRenderGridForSearch(query) {
  const gridEl = document.getElementById('cpCollectionGrid');
  gridEl.innerHTML = '<div class="cpHint">検索中...</div>';
  const res = await fetch(GAS_URL + `?action=searchCards&q=${encodeURIComponent(query)}`);
  const cards = await res.json();
  if (!cards.length) { gridEl.innerHTML = '<div class="cpHint">該当するカードが見つかりませんでした</div>'; return; }
  gridEl.innerHTML = cards.map(cpCardCellHtml).join('');
  cpBindGridEvents(gridEl);
}

document.getElementById('cpSetSelect').addEventListener('change', (e) => {
  document.getElementById('cpSearchInput').value = '';
  cpRenderGridForSet(e.target.value);
});
document.getElementById('cpSearchInput').addEventListener('input', (e) => {
  const q = e.target.value.trim();
  clearTimeout(cpSearchTimer);
  cpSearchTimer = setTimeout(() => {
    if (q.length >= 2) cpRenderGridForSearch(q);
    else cpRenderGridForSet(document.getElementById('cpSetSelect').value);
  }, 350);
});

async function cpInitCollectionTab() {
  await cpLoadSets();
  await cpLoadOwnedCollection();
  const sel = document.getElementById('cpSetSelect');
  if (sel.value) await cpRenderGridForSet(sel.value);
}
