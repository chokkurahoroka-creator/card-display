const ATTR_ORDER = ['白', '緑', '赤', '青', '紫', '黄', '無色'];
const STAGE_ORDER = ['Debut', '1st', '2nd', 'Spot'];

function stageOrderIndex(stage) {
  const idx = STAGE_ORDER.indexOf(stage);
  return idx === -1 ? STAGE_ORDER.length : idx;
}

// 再録の並び替え順（各属性→サポート→その他）。navList構築側でも同じ順序を使う
const SUPPORT_SUBTYPE_ORDER = ['イベント', 'アイテム', 'スタッフ', 'マスコット', 'ファン'];

function getSupportSubtypeIndex(cardType) {
  const parts = (cardType || '').split('・');
  const sub = parts.length > 1 ? parts[1] : '';
  const idx = SUPPORT_SUBTYPE_ORDER.indexOf(sub);
  return idx === -1 ? SUPPORT_SUBTYPE_ORDER.length : idx; // 該当なしは「その他」扱いで末尾
}

function byNameJa(a, b) {
  return (a.cardName || '').localeCompare(b.cardName || '', 'ja');
}

// 再録・パラレル共通の並び替え順（推しホロメン→ホロメン→サポート→その他）。navList構築側でも同じ順序を使う
function sortByCategory(cardsOfType) {
  const oshiCards = cardsOfType.filter(c => (c.cardType || '').indexOf('推しホロメン') !== -1);
  const holomenCards = cardsOfType.filter(c => (c.cardType || '').indexOf('推しホロメン') === -1 && (c.cardType || '').indexOf('ホロメン') !== -1);
  const supportCards = cardsOfType.filter(c => (c.cardType || '').indexOf('サポート') !== -1);
  const otherCards = cardsOfType.filter(c =>
    oshiCards.indexOf(c) === -1 && holomenCards.indexOf(c) === -1 && supportCards.indexOf(c) === -1
  );

  const byAttrThenName = (a, b) => {
    const ai = ATTR_ORDER.indexOf(a.attribute); const bi = ATTR_ORDER.indexOf(b.attribute);
    return ((ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)) || byNameJa(a, b) || (stageOrderIndex(a.stage) - stageOrderIndex(b.stage));
  };
  oshiCards.sort(byAttrThenName);
  holomenCards.sort(byAttrThenName);
  supportCards.sort((a, b) => {
    const ai = getSupportSubtypeIndex(a.cardType); const bi = getSupportSubtypeIndex(b.cardType);
    return (ai - bi) || byNameJa(a, b);
  });
  otherCards.sort(byNameJa);

  return [...oshiCards, ...holomenCards, ...supportCards, ...otherCards];
}

// ===== 一覧画面の並び替え機能（新規/再録/パラレル・検索結果 共通） =====
// key: 'color'（現在のデフォルト順）/ 'rarity' / 'name'（カード名あいう順）/ 'hp'
// dir: 'asc' / 'desc'
const RARITY_ORDER = ['C', 'U', 'R', 'RR', 'SR', 'OSR'];
const sortState = {
  '新規': { key: 'color', dir: 'asc' },
  '再録': { key: 'color', dir: 'asc' },
  'パラレル': { key: 'color', dir: 'asc' },
  'search': { key: 'color', dir: 'asc' } // 検索結果・注目カード・お気に入り表示で共通利用
};

function rarityOrderIndex(rarity) {
  const idx = RARITY_ORDER.indexOf((rarity || '').toUpperCase());
  return idx === -1 ? RARITY_ORDER.length : idx;
}

// 選択された並び替えキー・方向でカード配列を並び替える（'color'は既存のsortByCategoryを使用）
function sortCardsBy(cards, key, dir) {
  let list;
  if (key === 'rarity') {
    list = cards.slice().sort((a, b) => (rarityOrderIndex(a.rarity) - rarityOrderIndex(b.rarity)) || byNameJa(a, b));
  } else if (key === 'name') {
    list = cards.slice().sort(byNameJa);
  } else if (key === 'hp') {
    list = cards.slice().sort((a, b) => ((Number(a.hp) || 0) - (Number(b.hp) || 0)) || byNameJa(a, b));
  } else {
    list = sortByCategory(cards); // 'color'（現在のデフォルト順）
  }
  if (dir === 'desc') list.reverse();
  return list;
}

// 並び替えキーごとに「その値が変わった位置」を判定するためのグループラベルを返す（'color'は区切り線を出さないためnull）
function sortGroupLabel(card, key) {
  if (key === 'rarity') return card.rarity || 'その他';
  if (key === 'name') return (card.cardName || '').trim().charAt(0) || '？';
  if (key === 'hp') return (card.hp !== undefined && card.hp !== null && card.hp !== '') ? `HP ${card.hp}` : 'HPなし';
  return null;
}

// 並び替え後のカード一覧から、値が変わるたびに区切り線（値を中央に重ねた線）を挟んだHTMLを生成する
function buildCardsHtmlWithDividers(cards, key) {
  let html = '';
  let prevLabel; // 初回は必ずundefinedと不一致になるため、最初のグループの前にも区切り線が入る
  cards.forEach(c => {
    const label = sortGroupLabel(c, key);
    if (label !== null && label !== prevLabel) {
      html += `<div class="sortDivider"><span>${escapeHtml(label)}</span></div>`;
      prevLabel = label;
    }
    html += cardHtml(c);
  });
  return html;
}

// 新規/再録/パラレルの並び順を、現在の並び替え設定に応じて返す（navList構築・renderArea両方で共通利用）
// デフォルト（色・昇順）の場合のみ、新規は枠番号順、再録/パラレルは既存のsortByCategory順を使う
function getSectionOrderedCards(type, cardsOfType) {
  const state = sortState[type] || { key: 'color', dir: 'asc' };
  if (state.key === 'color' && state.dir === 'asc') {
    if (type === '新規') return cardsOfType.slice().sort((a, b) => Number(a.slot) - Number(b.slot));
    return sortByCategory(cardsOfType);
  }
  return sortCardsBy(cardsOfType, state.key, state.dir);
}

function renderArea(type, total, offset) {
  const cardsOfType = lastCards.filter(c => c.type === type);
  document.getElementById('count-' + type).textContent = `${cardsOfType.length} / ${total} 公開`;

  const state = sortState[type] || { key: 'color', dir: 'asc' };
  let html = '';
  if (state.key === 'color' && state.dir === 'asc') {
    // デフォルト表示（空き枠プレースホルダーを含む、既存の見た目のまま）
    if (type === '再録' || type === 'パラレル') {
      // 再録・パラレルは「各属性(ホロメン系)→サポート系→その他」の順に自動並び替え、末尾に残り枠(あまり番号)を表示
      const orderedCards = sortByCategory(cardsOfType);
      const usedSlots = new Set(cardsOfType.map(c => Number(c.slot)));
      const leftoverSlots = [];
      for (let s = 1; s <= total; s++) if (!usedSlots.has(s)) leftoverSlots.push(s);

      html = orderedCards.map(c => cardHtml(c)).join('');
      html += leftoverSlots.map(s => `<div class="card empty"><span class="slotNum">${offset + s}</span></div>`).join('');
    } else {
      const byslot = {};
      cardsOfType.forEach(c => byslot[Number(c.slot)] = c);
      for (let slot = 1; slot <= total; slot++) {
        const c = byslot[slot];
        html += c ? cardHtml(c) : `<div class="card empty"><span class="slotNum">${offset + slot}</span></div>`;
      }
    }
  } else {
    // レアリティ/カード名/HP順、または色の降順が選ばれている場合：登録済みカードのみを並び替えて表示（空き枠は非表示）
    // レアリティ/カード名/HP順のときは、値が切り替わる位置に区切り線を表示する
    const ordered = sortCardsBy(cardsOfType, state.key, state.dir);
    html = (state.key === 'rarity' || state.key === 'name' || state.key === 'hp')
      ? buildCardsHtmlWithDividers(ordered, state.key)
      : ordered.map(c => cardHtml(c)).join('');
  }

  const gridEl = document.getElementById('grid-' + type);
  gridEl.innerHTML = html;
  bindCardClicks(gridEl);
}

// 現在表示中のビュー（通常表示/検索結果/注目カード/お気に入り表示）を、状態を保ったまま再描画する
function rerenderCurrentView() {
  if (typeof favViewGroup !== 'undefined' && favViewGroup) {
    showFavoritesView(favViewGroup);
  } else {
    render();
  }
}

// 各セクションのソートUI（プルダウン＋昇順/降順ボタン）にイベントを紐付ける（画面初期化時に一度だけ呼ぶ）
function bindSortControls() {
  document.querySelectorAll('.sortControl').forEach(ctrl => {
    const section = ctrl.dataset.section;
    if (!sortState[section]) return;
    const sel = ctrl.querySelector('.sortSelect');
    const dirBtn = ctrl.querySelector('.sortDirBtn');
    sel.value = sortState[section].key;
    dirBtn.classList.toggle('desc', sortState[section].dir === 'desc');

    sel.addEventListener('change', () => {
      sortState[section].key = sel.value;
      rerenderCurrentView();
    });
    dirBtn.addEventListener('click', () => {
      sortState[section].dir = sortState[section].dir === 'asc' ? 'desc' : 'asc';
      dirBtn.classList.toggle('desc', sortState[section].dir === 'desc');
      rerenderCurrentView();
    });
  });
}

// そのパックに追加した順番で直近5枚以内、かつ登録から5日以内のカードを「新着」とする
