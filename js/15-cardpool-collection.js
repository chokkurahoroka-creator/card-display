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

// pane: 'owned'（左＝所持カード一覧、＋/－ステッパー付き）/ 'search'（右＝検索結果、＋ボタン＋所持数バッジ）
function cpCardCellHtml(c, pane) {
  const key = cardKey(c);
  collectionCardsCache[key] = c;
  const qty = ownedCollection[key] || 0;

  const metaHtml = `
    <div class="cpCardBody">
      <div class="cpCardName">${escapeHtml(c.cardName)}</div>
      <div class="cpCardMeta">${escapeHtml(c.rarity || '')} ${escapeHtml(c.setCode)}${c.cardNumber ? '-' + escapeHtml(c.cardNumber) : ''}</div>
    </div>`;

  if (pane === 'owned') {
    return `
      <div class="cpCard owned" data-key="${key}" draggable="true">
        <img src="${c.imageUrl}" alt="${escapeHtml(c.cardName)}" loading="lazy">
        ${metaHtml}
        <div class="cpQtyRow">
          <button type="button" class="cpQtyBtn cpQtyMinus" data-key="${key}">−</button>
          <span class="cpQtyValue">${qty}</span>
          <button type="button" class="cpQtyBtn cpQtyPlus" data-key="${key}">＋</button>
        </div>
      </div>`;
  }

  // 検索パネル側：所持している場合は右上にバッジ表示、追加は＋ボタン1つ
  return `
    <div class="cpCard ${qty > 0 ? 'owned' : ''}" data-key="${key}" draggable="true">
      <span class="cpCardOwnedBadge" id="cpBadge_${key}" style="${qty > 0 ? '' : 'display:none;'}">所持:${qty}</span>
      <img src="${c.imageUrl}" alt="${escapeHtml(c.cardName)}" loading="lazy">
      ${metaHtml}
      <div class="cpQtyRow">
        <button type="button" class="cpQtyBtn cpAddBtn" data-key="${key}" title="追加">＋</button>
      </div>
    </div>`;
}

function cpChangeQty(key, delta) {
  const cur = ownedCollection[key] || 0;
  const next = Math.max(0, cur + delta);
  if (next === 0) delete ownedCollection[key]; else ownedCollection[key] = next;

  cpRenderOwnedGrid();
  cpUpdateSearchBadge(key, next);
  cpScheduleSave();
}

// 検索パネル側に同じカードが表示中であれば、所持数バッジと枠の色だけを軽く更新する（再検索はしない）
function cpUpdateSearchBadge(key, qty) {
  const badge = document.getElementById('cpBadge_' + key);
  if (!badge) return;
  if (qty > 0) { badge.style.display = ''; badge.textContent = '所持:' + qty; }
  else { badge.style.display = 'none'; badge.textContent = ''; }
  const cardEl = badge.closest('.cpCard');
  if (cardEl) cardEl.classList.toggle('owned', qty > 0);
}

function cpBindGridEvents(container, pane) {
  container.querySelectorAll('.cpCard').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ key: el.dataset.key, pane }));
      e.dataTransfer.effectAllowed = 'move';
    });
  });
  container.querySelectorAll('.cpQtyPlus').forEach(btn => {
    btn.addEventListener('click', () => cpChangeQty(btn.dataset.key, 1));
  });
  container.querySelectorAll('.cpQtyMinus').forEach(btn => {
    btn.addEventListener('click', () => cpChangeQty(btn.dataset.key, -1));
  });
  container.querySelectorAll('.cpAddBtn').forEach(btn => {
    btn.addEventListener('click', () => cpChangeQty(btn.dataset.key, 1));
  });
}

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

async function cpRenderOwnedGrid() {
  const gridEl = document.getElementById('cpOwnedGrid');
  const keys = Object.keys(ownedCollection).filter(k => ownedCollection[k] > 0);
  if (!keys.length) {
    gridEl.innerHTML = '<div class="cpHint">まだ所持カードが登録されていません。右側から検索して追加、またはドラッグ＆ドロップしてください</div>';
    return;
  }
  // まだ情報をキャッシュしていないカード（他のタブ・端末で登録済みのもの等）は個別に取得する
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

  // パック（弾）ごとにグループ化する
  const groups = {};
  cards.forEach(c => {
    const sc = c.setCode || '（不明）';
    if (!groups[sc]) groups[sc] = [];
    groups[sc].push(c);
  });
  Object.keys(groups).forEach(sc => groups[sc].sort((a, b) => (a.cardName || '').localeCompare(b.cardName || '', 'ja')));

  // 弾の並び順：sets一覧に載っている順（登録順）の新しい方を上に、載っていない（不明含む）ものは末尾にアルファベット順
  const setOrder = cpSets.map(s => s.setCode);
  const sortedSetCodes = Object.keys(groups).sort((a, b) => {
    const ia = setOrder.indexOf(a), ib = setOrder.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ib - ia;
  });

  gridEl.innerHTML = sortedSetCodes.map(sc => {
    const setName = cpSetNameMap[sc] || '';
    const cardsHtml = groups[sc].map(c => cpCardCellHtml(c, 'owned')).join('');
    return `
      <div class="cpPackGroup">
        <div class="cpPackGroupHeader">
          <span>${escapeHtml(sc)}${setName ? '（' + escapeHtml(setName) + '）' : ''}</span>
          <span class="cpPackGroupCount">${groups[sc].length}種</span>
        </div>
        <div class="cpPackGroupGrid">${cardsHtml}</div>
      </div>`;
  }).join('');
  cpBindGridEvents(gridEl, 'owned');
}

async function cpRenderGridForSet(setCode) {
  const gridEl = document.getElementById('cpSearchGrid');
  gridEl.innerHTML = '<div class="cpHint">読み込み中...</div>';
  const res = await fetch(GAS_URL + `?action=list&setCode=${encodeURIComponent(setCode)}`);
  const cards = await res.json();
  if (!cards.length) { gridEl.innerHTML = '<div class="cpHint">この弾にはまだカードが登録されていません</div>'; return; }
  cards.sort((a, b) => (a.cardName || '').localeCompare(b.cardName || '', 'ja'));
  gridEl.innerHTML = cards.map(c => cpCardCellHtml(c, 'search')).join('');
  cpBindGridEvents(gridEl, 'search');
}

async function cpRenderGridForSearch(query) {
  const gridEl = document.getElementById('cpSearchGrid');
  gridEl.innerHTML = '<div class="cpHint">検索中...</div>';
  const res = await fetch(GAS_URL + `?action=searchCards&q=${encodeURIComponent(query)}`);
  const cards = await res.json();
  if (!cards.length) { gridEl.innerHTML = '<div class="cpHint">該当するカードが見つかりませんでした</div>'; return; }
  gridEl.innerHTML = cards.map(c => cpCardCellHtml(c, 'search')).join('');
  cpBindGridEvents(gridEl, 'search');
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
  if (!cpDropZonesInitialized) {
    cpSetupDropZone(document.getElementById('cpOwnedGrid'), 'owned');
    cpSetupDropZone(document.getElementById('cpSearchGrid'), 'search');
    cpDropZonesInitialized = true;
  }
  await cpRenderOwnedGrid();
  const sel = document.getElementById('cpSetSelect');
  if (sel.value) await cpRenderGridForSet(sel.value);
}
