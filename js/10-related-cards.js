const relatedCardsCache = {}; // linkedCardKey -> card（同一表示内での再検索を減らす）

async function loadRelatedCards(c) {
  const sectionEl = document.getElementById('relatedCardsSection');
  if (!sectionEl) return;

  const myKey = cardKey(c);
  let related = [];
  let needsFetch = false;

  const myLinkKeys = String(c.linkedCardKey || '').split(',').map(s => s.trim()).filter(Boolean);
  if ((c.type === 'パラレル' || c.type === '再録') && myLinkKeys.length) {
    // パラレル/再録 → リンクされた元カード（複数可）。まず同じ弾のlastCardsから即座に探す
    myLinkKeys.forEach(k => {
      const label = (c.syncSourceKey && c.syncSourceKey === k) ? '元カード' : '関連カード';
      const found = lastCards.find(x => cardKey(x) === k);
      if (found) related.push({ card: found, label });
      else needsFetch = true; // 別弾のカードなどlastCardsに無い場合のみ後でfetch
    });
  } else {
    // 元カード → 同じ弾の中でリンク元とするパラレル/再録カードを即座に探す
    lastCards
      .filter(cand => String(cand.linkedCardKey || '').split(',').map(s => s.trim()).includes(myKey))
      .forEach(cand => related.push({ card: cand, label: '関連カード' }));
    needsFetch = true; // 別弾に同名カードがある場合もあるため、バックグラウンドで裏取りする
  }

  // パラレル/再録が元カードのリンクを持つ場合は「関連カードが必ず存在する」ことが確定しているため、
  // まだ元カード自体を取得できていなくても（fetch中）ローディングを表示し続ける。
  // 一方、元カード視点での逆引き検索（else側）は関連カードが存在するかどうか自体が不確定なため、
  // 既に1件以上見つかっている場合のみローディングを表示する（無関係カードでの無駄な表示を避ける）
  const isLinkedCardType = (c.type === 'パラレル' || c.type === '再録') && myLinkKeys.length > 0;
  const showLoading = needsFetch && (isLinkedCardType || related.length > 0);
  renderRelatedCardsSection(sectionEl, c, related, showLoading);

  if (!needsFetch) return;

  // 別の弾をまたぐ関連カードの取得はバックグラウンドで行い、見つかり次第追記する
  try {
    let extra = [];
    if ((c.type === 'パラレル' || c.type === '再録') && myLinkKeys.length) {
      for (const k of myLinkKeys) {
        if (related.some(r => cardKey(r.card) === k)) continue;
        const orig = await fetchCardByKey(k);
        if (orig) extra.push({ card: orig, label: (c.syncSourceKey && c.syncSourceKey === k) ? '元カード' : '関連カード' });
      }
    } else {
      const candidates = await searchCardsByName(c.cardName);
      candidates
        .filter(cand => String(cand.linkedCardKey || '').split(',').map(s => s.trim()).includes(myKey))
        .forEach(cand => extra.push({ card: cand, label: '関連カード' }));
    }

    // モーダル表示中に別カードへ移動していた場合は反映しない
    if (!document.getElementById('modalOverlay').classList.contains('open')) return;
    if (document.getElementById('modalImg').src !== c.imageUrl) return;

    if (extra.length) related = related.concat(extra);
    // 読み込み完了。ローディング表示を消して確定内容を描画（該当なしなら関連カード欄自体を消す）
    renderRelatedCardsSection(sectionEl, c, related, false);
  } catch (e) {
    // 追加取得に失敗してもローディング表示だけは消す
    if (document.getElementById('modalOverlay').classList.contains('open') && document.getElementById('modalImg').src === c.imageUrl) {
      renderRelatedCardsSection(sectionEl, c, related, false);
    }
  }
}

function renderRelatedCardsSection(sectionEl, c, relatedRaw, loading) {
  // 同一カードが重複して入る可能性があるため除去
  const seen = new Set();
  const related = relatedRaw.filter(r => {
    const k = cardKey(r.card);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (!related.length && !loading) { sectionEl.innerHTML = ''; return; }

  sectionEl.innerHTML = `
    <div class="relatedCardsWrap" style="margin-top:18px; padding-top:14px; border-top:1px solid rgba(212,175,106,0.2);">
      <div style="font-size:13px; color:#9aa5c0; margin-bottom:8px; display:flex; align-items:center; gap:8px;">
        <span>関連カード</span>
        ${loading ? '<span class="relatedLoadingSpinner" role="status" aria-label="読み込み中"></span>' : ''}
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        ${related.map(r => `
          <div class="relatedCardItem" data-key="${cardKey(r.card)}" style="cursor:pointer; text-align:center; width:90px;">
            <img src="${r.card.imageUrl}" style="width:90px; aspect-ratio:5/7; object-fit:cover; border-radius:6px; border:1px solid rgba(212,175,106,0.3);">
            <div style="font-size:11px; color:#d4af6a; margin-top:4px;">${escapeHtml(r.label)}</div>
          </div>
        `).join('')}
        ${loading ? `
          <div style="text-align:center; width:90px;">
            <div class="relatedCardSkeleton" aria-hidden="true">
              <span class="relatedLoadingSpinner"></span>
            </div>
            <div style="font-size:11px; color:#9aa5c0; margin-top:4px;">読み込み中…</div>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  sectionEl.querySelectorAll('.relatedCardItem').forEach((el, i) => {
    el.addEventListener('click', () => {
      const target = related[i].card;
      // navListに存在すればその位置に合わせ、無ければ単独表示として開く
      const idx = navList.findIndex(x => x.type === target.type && String(x.slot) === String(target.slot) && x.setCode === target.setCode);
      if (idx !== -1) { navIndex = idx; }
      openModal(target);
    });
  });
}

async function fetchCardByKey(linkedCardKey) {
  if (relatedCardsCache[linkedCardKey]) return relatedCardsCache[linkedCardKey];
  const parts = String(linkedCardKey).split('__');
  if (parts.length !== 3) return null;
  const [setCode, type, slot] = parts;
  const res = await fetch(GAS_URL + `?action=getCard&setCode=${encodeURIComponent(setCode)}&type=${encodeURIComponent(type)}&slot=${encodeURIComponent(slot)}`);
  const card = await res.json();
  if (card) relatedCardsCache[linkedCardKey] = card;
  return card;
}

async function searchCardsByName(name) {
  const res = await fetch(GAS_URL + `?action=searchCards&q=${encodeURIComponent(name)}`);
  const list = await res.json();
  return Array.isArray(list) ? list : [];
}

