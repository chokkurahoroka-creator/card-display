// ===== 一覧画面表示（ギャラリー、常時表示）＆ クリック編集 =====
// 表示画面(display.html)と同じ並び替えルールを使用
const ATTR_ORDER = ['白', '緑', '赤', '青', '紫', '黄', '無色'];
const STAGE_ORDER = ['Debut', '1st', '2nd', 'Spot'];
const SUPPORT_SUBTYPE_ORDER = ['イベント', 'アイテム', 'スタッフ', 'マスコット', 'ファン'];

function stageOrderIndex(stage) {
  const idx = STAGE_ORDER.indexOf(stage);
  return idx === -1 ? STAGE_ORDER.length : idx;
}
function getSupportSubtypeIndex(cardType) {
  const parts = (cardType || '').split('・');
  const sub = parts.length > 1 ? parts[1] : '';
  const idx = SUPPORT_SUBTYPE_ORDER.indexOf(sub);
  return idx === -1 ? SUPPORT_SUBTYPE_ORDER.length : idx;
}
function byNameJa(a, b) {
  return (a.cardName || '').localeCompare(b.cardName || '', 'ja');
}

// 評価パラメータが1項目以上入力済みかどうかを判定する（サムネイルへの「評価済み」アイコン表示用）
function hasCardRating(c) {
  try {
    const rating = JSON.parse(c.ratingJson || '{}');
    return RATE_KEYS.some(k => rating[k] !== undefined && rating[k] !== null && rating[k] !== '');
  } catch (e) {
    return false;
  }
}

// カード名だけでなく、タグ・アーツ効果・固有スキル効果のテキストも対象に検索できるようにする
function cardMatchesGalleryQuery(c, query) {
  if ((c.cardName || '').toLowerCase().indexOf(query) !== -1) return true;
  if ((c.tags || '').toLowerCase().indexOf(query) !== -1) return true;

  try {
    const arts = JSON.parse(c.artsJson || '[]');
    if (Array.isArray(arts) && arts.some(a =>
      (a.name || '').toLowerCase().indexOf(query) !== -1 ||
      (a.effectText || '').toLowerCase().indexOf(query) !== -1
    )) return true;
  } catch (e) { /* artsJsonが壊れている場合はスキップ */ }

  try {
    const skills = JSON.parse(c.skillsJson || '[]');
    if (Array.isArray(skills) && skills.some(s =>
      (s.title || '').toLowerCase().indexOf(query) !== -1 ||
      (s.text || '').toLowerCase().indexOf(query) !== -1
    )) return true;
  } catch (e) { /* skillsJsonが壊れている場合はスキップ */ }

  return false;
}

// カードを「推しホロメン」「ホロメン」「サポート」「その他」の4カテゴリに分類し、各カテゴリ内をソートする
// sortModeが指定されていれば（'slot'/'rarity'/'name'）そちらを優先し、未指定（'default'）なら
// これまで通り属性別（推しホロメン/ホロメン）・サブタイプ別（サポート）の並び順を使う
// 戻り値は [{ label, cards }, ...]（該当カードが無いカテゴリは含めない）
const GALLERY_RARITY_ORDER = ['SEC', 'OUR', 'OSR', 'OC', 'HR', 'SY', 'UR', 'SR', 'RR', 'U', 'S', 'R', 'C', 'P', '判別不能', 'その他'];
function galleryRarityOrderIndex(rarity) {
  const r = (rarity || '').toUpperCase().trim();
  if (!r) return GALLERY_RARITY_ORDER.indexOf('その他');
  const idx = GALLERY_RARITY_ORDER.indexOf(r);
  return idx === -1 ? GALLERY_RARITY_ORDER.indexOf('判別不能') : idx;
}
function getGalleryComparator(sortMode) {
  if (sortMode === 'slot') return (a, b) => Number(a.slot) - Number(b.slot);
  if (sortMode === 'rarity') return (a, b) => galleryRarityOrderIndex(a.rarity) - galleryRarityOrderIndex(b.rarity) || byNameJa(a, b);
  if (sortMode === 'name') return byNameJa;
  return null;
}

function categorizeCards(cardsOfType, sortMode) {
  const oshiCards = cardsOfType.filter(c => (c.cardType || '').indexOf('推しホロメン') !== -1);
  const holomenCards = cardsOfType.filter(c => (c.cardType || '').indexOf('推しホロメン') === -1 && (c.cardType || '').indexOf('ホロメン') !== -1);
  const supportCards = cardsOfType.filter(c => (c.cardType || '').indexOf('サポート') !== -1);
  const otherCards = cardsOfType.filter(c =>
    oshiCards.indexOf(c) === -1 && holomenCards.indexOf(c) === -1 && supportCards.indexOf(c) === -1
  );

  const overrideCmp = getGalleryComparator(sortMode);
  if (overrideCmp) {
    // 枠番号順・レアリティ順・カード名順が選ばれている場合は、カテゴリごとの既定の並びより優先する
    [oshiCards, holomenCards, supportCards, otherCards].forEach(arr => arr.sort(overrideCmp));
  } else {
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
  }

  const groups = [
    { label: '推しホロメン', cards: oshiCards },
    { label: 'ホロメン', cards: holomenCards },
    { label: 'サポート', cards: supportCards },
    { label: 'その他', cards: otherCards },
  ];
  return groups.filter(g => g.cards.length > 0);
}
// 新規/再録/パラレルそれぞれを「推しホロメン/ホロメン/サポート/その他」に分類したセクション構成を返す
// 戻り値: [{ typeLabel, label, cards }, ...]
function buildGallerySections(cards, sortMode) {
  const sections = [];
  [
    { type: '新規', typeLabel: '新規' },
    { type: '再録', typeLabel: '再録' },
    { type: 'パラレル', typeLabel: 'パラレル' },
  ].forEach(({ type, typeLabel }) => {
    const cardsOfType = cards.filter(c => c.type === type);
    const groups = categorizeCards(cardsOfType, sortMode);
    groups.forEach(g => sections.push({ typeLabel, label: g.label, cards: g.cards }));
  });
  return sections;
}

// 直近にfetchしたカード一覧をキャッシュしておき、検索・並び替えの変更時は再取得せず
// クライアント側だけで再描画できるようにする（renderGalleryFromCacheが実際の描画を担当）
let galleryCardsCache = [];

async function renderGallery() {
  const gasUrl = getCfg('gas');
  const setCode = document.getElementById('activeSet').value;
  const gridEl = document.getElementById('galleryGrid');
  updateStreamPackTitle();
  if (!gasUrl || !setCode) { gridEl.innerHTML = '<div class="hint">①で弾を選択してください</div>'; return; }

  gridEl.innerHTML = '<div class="hint">読み込み中...</div>';
  const res = await fetch(gasUrl + `?action=list&setCode=${encodeURIComponent(setCode)}`);
  galleryCardsCache = await res.json();
  renderGalleryFromCache();
}

// パック内検索・並び替えの状態に応じて、キャッシュ済みのカード一覧から再描画する
function renderGalleryFromCache() {
  const gasUrl = getCfg('gas');
  const setCode = document.getElementById('activeSet').value;
  const gridEl = document.getElementById('galleryGrid');

  if (!galleryCardsCache.length) {
    gridEl.innerHTML = '<div class="hint">この弾にはまだカードが登録されていません</div>';
    return;
  }

  const query = (document.getElementById('gallerySearchInput').value || '').trim().toLowerCase();
  let cards = query
    ? galleryCardsCache.filter(c => cardMatchesGalleryQuery(c, query))
    : galleryCardsCache;

  if (!cards.length) {
    gridEl.innerHTML = `<div class="hint">「${escapeAttr(query)}」に一致するカードが見つかりませんでした</div>`;
    return;
  }

  const sortMode = document.getElementById('gallerySortSelect').value;
  const sections = buildGallerySections(cards, sortMode);
  let cardCounter = 0;

  gridEl.innerHTML = sections.map(sec => `
    <div class="gallerySection">
      <h3 class="gallerySectionTitle">${escapeAttr(sec.typeLabel)}・${escapeAttr(sec.label)}</h3>
      <div class="galleryGrid galleryGridInner">
        ${sec.cards.map(c => {
          const idx = cardCounter++;
          return `
            <div class="galleryCard" data-index="${idx}">
              <button type="button" class="gcFeatured ${c.featured === 'TRUE' ? 'active' : ''}" data-index="${idx}" title="注目カードに設定/解除">📌</button>
              ${hasCardRating(c) ? '<span class="gcRated" title="評価入力済み">✓</span>' : ''}
              <img src="${c.imageUrl}" alt="${escapeAttr(c.cardName)}" loading="lazy">
              <div class="gcBody">
                ${c.cardType ? `<div class="gcTag">${escapeAttr(c.cardType)}</div>` : ''}
                <div class="gcName">${escapeAttr(c.cardName)}</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `).join('');

  // セクションをまたいだ通し番号でフラットな配列を作り、data-indexから引けるようにする
  const flatCards = sections.flatMap(sec => sec.cards);

  gridEl.querySelectorAll('.galleryCard').forEach(el => {
    el.addEventListener('click', () => startEditCard(flatCards[Number(el.dataset.index)]));
  });

  gridEl.querySelectorAll('.gcFeatured').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const c = flatCards[Number(btn.dataset.index)];
      const newFeatured = c.featured === 'TRUE' ? 'FALSE' : 'TRUE';
      btn.classList.toggle('active', newFeatured === 'TRUE');
      c.featured = newFeatured;
      await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'updateFeatured', setCode, type: c.type, slot: c.slot, featured: newFeatured === 'TRUE' })
      });
    });
  });
}
document.getElementById('gallerySearchInput').addEventListener('input', renderGalleryFromCache);
document.getElementById('gallerySortSelect').addEventListener('change', renderGalleryFromCache);

async function startEditCard(card) {
  editingCard = card;
  editingCardOriginalImageUrl = card.imageUrl;

  // 画像はポップアップ左側に表示（既存のものをそのまま使用、切り抜きツールは非表示）
  document.getElementById('editModalImg').src = card.imageUrl;
  document.getElementById('editModalImg').alt = card.cardName;
  document.getElementById('editModalHeading').textContent = `編集: ${card.cardName}（${card.type} / 枠${card.slot}）`;
  document.getElementById('previewWrap').innerHTML = '';
  document.getElementById('cropPanel').style.display = 'none';

  document.getElementById('activeSet').value = card.setCode;
  document.getElementById('f_type').value = card.type;
  document.getElementById('f_slot').value = card.slot;
  document.getElementById('f_setcode').value = card.setCode;
  document.getElementById('f_num').value = card.cardNumber || '';
  document.getElementById('f_rarity').value = card.rarity || '';
  document.getElementById('f_tag').value = card.cardType || '';
  document.getElementById('f_tags').value = card.tags || '';
  document.getElementById('f_name').value = card.cardName || '';
  document.getElementById('f_attr').value = card.attribute || '';
  document.getElementById('f_hp').value = card.hp || '';
  document.getElementById('f_stage').value = card.stage || '';
  document.getElementById('f_baton').value = card.batonTouchCost || '';
  document.getElementById('f_limited').checked = isFlagTrue(card.isLimited);

  let arts = [], skills = [];
  try { arts = JSON.parse(card.artsJson || '[]'); } catch (e) {}
  try { skills = JSON.parse(card.skillsJson || '[]'); } catch (e) {}
  setArtsRows(arts);
  setSkillRows(skills);

  resetRatingFields();
  try {
    const rating = JSON.parse(card.ratingJson || '{}');
    RATE_KEYS.forEach(k => {
      const el = document.getElementById('rate_' + k);
      if (el && rating[k] !== undefined) el.value = rating[k];
    });
    renderAllRatingIndicators();
  } catch (e) {}
  document.getElementById('rate_comment').value = card.ratingComment || '';

  updateHolomenVisibility();
  updateLinkedCardVisibility();
  clearLinkedCards();
  if ((card.type === 'パラレル' || card.type === '再録') && card.linkedCardKey) {
    await loadLinkedCardsByKeys(card.linkedCardKey);
  }
  // このカードが「元カードと同一」として同期されている場合、対象をハイライトしフィールドをロックする
  // （値自体は既にこのカードのデータとして保存済みのため再取得はしない）
  if (card.syncSourceKey) {
    const srcIdx = linkedCards.findIndex(c => `${c.setCode}__${c.type}__${c.slot}` === card.syncSourceKey);
    if (srcIdx !== -1) {
      syncSourceIdx = srcIdx;
      setSyncFieldsDisabled(true);
      renderLinkedCardsList();
    }
  }

  fieldsEl.style.display = 'block';
  allRegisterBtns.forEach(b => { b.style.display = 'block'; b.textContent = 'この内容で更新する'; });
  setStatus('カードを編集中です。内容を変更して「この内容で更新する」を押してください。');

  applyStreamModeDetailsCollapse();
  openEditModal();
}
