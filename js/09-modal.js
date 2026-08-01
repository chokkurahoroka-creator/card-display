function openModal(c) {
  navIndex = navList.findIndex(x => x.type === c.type && String(x.slot) === String(c.slot));

  document.getElementById('modalImg').src = c.imageUrl;
  document.getElementById('modalImg').alt = c.cardName;

  let artsHtml = '';
  try {
    const arts = JSON.parse(c.artsJson || '[]');
    if (Array.isArray(arts) && arts.length) {
      const isSupportCard = (c.cardType || '').indexOf('サポート') !== -1;
      artsHtml = arts.map(a => {
        const yellIcons = (a.yellCost || []).map(y => yellIconHtml(y.color, y.count)).join('');
        const effectText = (a.effectText || '').replace(/\\n/g, '\n');
        const specialColorCss = YELL_COLOR_CSS[a.specialAttackColor] || '#fff';
        const specialInline = a.specialAttackColor
          ? `<span class="specialAtkInline">${yellIconHtml(a.specialAttackColor, 1)}${a.specialAttackDamage ? `<span class="specialAtkDamage" style="color:${specialColorCss};">${escapeHtml(a.specialAttackDamage)}</span>` : ''}</span>`
          : '';
        const nameHtml = isSupportCard ? '' : `<span class="artsNameText">${escapeHtml(a.name || 'アーツ')}</span>`;
        return `
          <div class="artsBlock">
            <div class="artsName">
              <span class="artsYellIcons">${yellIcons ? `<span class="yellRow" style="display:inline-flex;vertical-align:middle;">${yellIcons}</span>` : ''}</span>
              ${nameHtml}
              <span class="artsDamageGroup">${a.damage ? `<span class="artsDamageText">${boldNumbers(escapeHtml(a.damage))}</span>` : ''}${specialInline}</span>
            </div>
            ${effectText ? `<div class="artsEffect">${boldNumbers(escapeHtml(effectText))}</div>` : ''}
          </div>`;
      }).join('');
    }
  } catch (e) { /* ignore */ }

  let skillsHtml = '';
  try {
    const skills = JSON.parse(c.skillsJson || '[]');
    if (Array.isArray(skills) && skills.length) {
      skillsHtml = skills.map(s => skillBlockHtml(s)).join('');
    }
  } catch (e) { /* ignore */ }

  const key = cardKey(c);
  const favActive = activeGroup && isFav(c, activeGroup);

  // サポートカードの「LIMITED」チェックがONの場合、赤いバナーで固定文言を表示
  const isSupportLimited = String(c.cardType || '').indexOf('サポート') !== -1 && isFlagTrue(c.isLimited);
  const limitedBannerHtml = isSupportLimited
    ? `<div class="skillBlock"><div class="limitedBanner"><span class="limitedBannerText">LIMITED：ターンに1枚しか使えない。</span></div></div>`
    : '';

  let ratingHtml = '';
  try {
    const rating = JSON.parse(c.ratingJson || '{}');
    const activeItems = getActiveRatingItems(c.cardType);
    const hasRating = activeItems.some(it => rating[it.key] !== '' && rating[it.key] !== undefined && rating[it.key] !== null);
    if (hasRating || c.ratingComment) {
      ratingHtml = `
        <div class="ratingSection">
          ${hasRating ? `<div class="ratingChart">${buildRadarChartSvg(rating, c.cardType)}</div>` : ''}
          ${c.ratingComment ? `<div class="ratingComment"><div class="ratingCommentLabel">評価コメント</div><div class="ratingCommentText">${escapeHtml(c.ratingComment)}</div></div>` : ''}
        </div>`;
    }
  } catch (e) { /* ignore */ }

  const isSupportCardType = String(c.cardType || '').indexOf('サポート') !== -1;

  document.getElementById('modalInfo').innerHTML = `
    <div class="modalBadgeRow">
      ${c.type ? `<span class="modalTypeBadge">${escapeHtml(c.type)}</span>` : ''}
      ${c.rarity ? `<span class="modalTypeBadge" style="background:#7ec8e3;">${escapeHtml(c.rarity)}</span>` : ''}
      ${c.cardType ? `<span class="modalTypeBadge" style="background:#a3a3a3;">${escapeHtml(c.cardType)}</span>` : ''}
      ${(!isSupportCardType && c.stage) ? `<span class="modalTypeBadge" style="background:#9d7cf2;">${escapeHtml(c.stage)}</span>` : ''}
      <button class="favStar modalFavStar ${favActive ? 'active' : ''}" data-fullkey="${key}" title="お気に入りに追加/削除">${favActive ? '★' : '☆'}</button>
    </div>
    <h3>${escapeHtml(c.cardName)}</h3>
    ${limitedBannerHtml}
    ${skillsHtml}
    ${artsHtml}
    ${batonHtml(c.batonTouchCost)}
    ${ratingHtml}
    <div id="relatedCardsSection"></div>
  `;
  document.getElementById('modalOverlay').classList.add('open');
  autofitLongTitles(document.getElementById('modalInfo'));

  document.querySelectorAll('.modalFavStar').forEach(btn => {
    btn.addEventListener('click', () => toggleFav(c));
  });

  const hasNav = navList.length > 1 && navIndex !== -1;
  document.getElementById('modalPrev').style.display = hasNav ? 'flex' : 'none';
  document.getElementById('modalNext').style.display = hasNav ? 'flex' : 'none';

  loadRelatedCards(c);
}

// パラレル⇔元カードの相互リンクを取得してモーダル内に表示する
