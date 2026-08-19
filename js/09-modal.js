let currentModalCard = null; // ダウンロードボタン右隣の固定お気に入りボタンが対象とする、現在表示中のカード

function openModal(c) {
  navIndex = navList.findIndex(x => x.type === c.type && String(x.slot) === String(c.slot));
  logStatEvent('view', c); // 統計用：詳細表示を開いた記録（表示体験には影響しない）

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
    if (hasRating) {
      const summary = computeRatingSummaryFromValues(rating, c.cardType);
      ratingHtml = `
        <div class="ratingSection">
          <div class="ratingChart">${buildRadarChartSvg(rating, c.cardType)}</div>
          <div class="ratingScoreBox">
            <div class="ratingScoreRow"><span class="ratingScoreLabel">合計</span><span class="ratingScoreValue">${summary.sum} / ${summary.maxSum}</span></div>
            <div class="ratingScoreRow"><span class="ratingScoreLabel">平均</span><span class="ratingScoreValue">${summary.avg.toFixed(1)}</span></div>
            <div class="ratingScoreRow ratingScoreMain"><span class="ratingScoreLabel">評価点</span><span class="ratingScoreValue">${summary.score10.toFixed(1)}<small> / 10</small></span></div>
            ${c.ratingComment ? `<div class="ratingCommentText">${escapeHtml(c.ratingComment)}</div>` : ''}
          </div>
        </div>`;
    } else if (c.ratingComment) {
      // 数値評価が無く、コメントのみ登録されている（過去データなど）場合はコメントだけ表示
      ratingHtml = `
        <div class="ratingSection">
          <div class="ratingComment"><div class="ratingCommentLabel">評価コメント</div><div class="ratingCommentText">${escapeHtml(c.ratingComment)}</div></div>
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

  // ダウンロードボタン右隣の固定お気に入りボタン（要素は使い回すため、状態だけをここで更新する）
  currentModalCard = c;
  const modalFavStarBtn = document.getElementById('modalFavStarBtn');
  if (modalFavStarBtn) {
    modalFavStarBtn.dataset.fullkey = key;
    modalFavStarBtn.classList.toggle('active', favActive);
    modalFavStarBtn.textContent = favActive ? '★' : '☆';
  }

  const hasNav = navList.length > 1 && navIndex !== -1;
  document.getElementById('modalPrev').style.display = hasNav ? 'flex' : 'none';
  document.getElementById('modalNext').style.display = hasNav ? 'flex' : 'none';

  loadRelatedCards(c);
}

// ダウンロードボタン右隣の固定お気に入りボタンは要素自体を使い回すため、クリックリスナーはここで一度だけ登録する
// （openModalのたびに登録すると呼び出しが重複してしまうため）
(function bindModalFavStarOnce() {
  const btn = document.getElementById('modalFavStarBtn');
  if (btn) btn.addEventListener('click', () => { if (currentModalCard) toggleFav(currentModalCard); });
})();

// パラレル⇔元カードの相互リンクを取得してモーダル内に表示する
