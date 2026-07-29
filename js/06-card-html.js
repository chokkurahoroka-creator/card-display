function computeNewCardKeys(cards) {
  const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const withTime = cards
    .map(c => ({ c, t: new Date(c.timestamp).getTime() }))
    .filter(x => !isNaN(x.t));
  withTime.sort((a, b) => b.t - a.t); // 新しい順
  const latestFive = withTime.slice(0, 5);
  const keys = new Set();
  latestFive.forEach(x => {
    if (now - x.t <= FIVE_DAYS_MS) keys.add(cardKey(x.c));
  });
  return keys;
}

function cardHtml(c) {
  const key = cardKey(c);
  renderedCardsIndex[key] = c;
  const favActive = activeGroup && isFav(c, activeGroup);
  const isNew = newCardKeys.has(key);
  return `
    <div class="card${isNew ? ' isNew' : ''}" data-fullkey="${key}">
      ${isNew ? '<span class="newBadge">NEW</span>' : ''}
      <button class="favStar ${favActive ? 'active' : ''}" data-fullkey="${key}" title="お気に入りに追加/削除">${favActive ? '★' : '☆'}</button>
      <img src="${c.imageUrl}" alt="${escapeHtml(c.cardName)}" loading="lazy">
      <div class="card-body">
        ${c.cardType ? `<div class="tag">${escapeHtml(c.cardType)}</div>` : ''}
        <div class="name">${escapeHtml(c.cardName)}</div>
        <div class="meta metaAttr">${escapeHtml(c.attribute || '')}${c.hp ? ' / HP' + escapeHtml(c.hp) : ''}</div>
        <div class="meta metaNumber">${escapeHtml(c.rarity || '')} ${escapeHtml(c.setCode || '')}${c.setCode && c.cardNumber ? '-' : ''}${escapeHtml(c.cardNumber || '')}</div>
        ${c.tags ? `<div class="meta metaTags">${escapeHtml(c.tags)}</div>` : ''}
      </div>
    </div>`;
}

function bindCardClicks(container) {
  container.querySelectorAll('.card[data-fullkey]').forEach(el => {
    el.addEventListener('click', () => {
      const c = renderedCardsIndex[el.dataset.fullkey];
      if (c) openModal(c);
    });
  });
  container.querySelectorAll('.favStar[data-fullkey]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const c = renderedCardsIndex[btn.dataset.fullkey];
      if (c) toggleFav(c);
    });
  });
}

