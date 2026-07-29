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

// 再録・パラレル共通の並び替え順（各属性→サポート→その他）。navList構築側でも同じ順序を使う
function sortByCategory(cardsOfType) {
  const holomenCards = cardsOfType.filter(c => (c.cardType || '').indexOf('ホロメン') !== -1);
  const supportCards = cardsOfType.filter(c => (c.cardType || '').indexOf('サポート') !== -1);
  const otherCards = cardsOfType.filter(c => holomenCards.indexOf(c) === -1 && supportCards.indexOf(c) === -1);

  holomenCards.sort((a, b) => {
    const ai = ATTR_ORDER.indexOf(a.attribute); const bi = ATTR_ORDER.indexOf(b.attribute);
    return ((ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)) || byNameJa(a, b) || (stageOrderIndex(a.stage) - stageOrderIndex(b.stage));
  });
  supportCards.sort((a, b) => {
    const ai = getSupportSubtypeIndex(a.cardType); const bi = getSupportSubtypeIndex(b.cardType);
    return (ai - bi) || byNameJa(a, b);
  });
  otherCards.sort(byNameJa);

  return [...holomenCards, ...supportCards, ...otherCards];
}

function renderArea(type, total, offset) {
  const cardsOfType = lastCards.filter(c => c.type === type);
  document.getElementById('count-' + type).textContent = `${cardsOfType.length} / ${total} 公開`;

  let html = '';
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

  const gridEl = document.getElementById('grid-' + type);
  gridEl.innerHTML = html;
  bindCardClicks(gridEl);
}

// そのパックに追加した順番で直近5枚以内、かつ登録から5日以内のカードを「新着」とする
