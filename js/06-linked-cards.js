// ===== 関連カードリンク（パラレル/再録の元カード、複数選択可） =====
let linkedCards = []; // [{ setCode, type, slot, cardName, imageUrl }, ...] 選択中の関連カード一覧
let syncSourceIdx = -1; // 「元カードと同一」がONになっている linkedCards のインデックス（-1は未設定）

function updateLinkedCardVisibility() {
  const t = document.getElementById('f_type').value;
  const show = (t === 'パラレル' || t === '再録');
  document.getElementById('linkedCardWrap').style.display = show ? 'block' : 'none';
}
document.getElementById('f_type').addEventListener('change', updateLinkedCardVisibility);

function clearLinkedCards() {
  linkedCards = [];
  syncSourceIdx = -1;
  setSyncFieldsDisabled(false);
  renderLinkedCardsList();
  document.getElementById('linkSearchResults').style.display = 'none';
}

// 「元カードと同一」ONの間、値の手入力を防ぐために対象フィールドをdisabled/enabledにする
function setSyncFieldsDisabled(disabled) {
  ['f_tag', 'f_tags', 'f_name', 'f_attr', 'f_hp', 'f_stage', 'f_baton', 'f_limited',
   'rate_hp', 'rate_power', 'rate_speed', 'rate_stamina', 'rate_luck', 'rate_potential', 'rate_comment']
    .forEach(id => { document.getElementById(id).disabled = disabled; });
  document.getElementById('addArtsBtn').disabled = disabled;
  document.getElementById('addSkillBtn').disabled = disabled;
  document.querySelectorAll('#artsRows input, #artsRows select, #artsRows textarea, #artsRows button').forEach(el => el.disabled = disabled);
  document.querySelectorAll('#skillsRows input, #skillsRows select, #skillsRows textarea, #skillsRows button').forEach(el => el.disabled = disabled);
  renderAllRatingIndicators();
}

// 指定した関連カードの詳細（GAS getCard）を取得し、カードタイプ・タグ・カード名・属性・HP・ステージ・
// バトンタッチコスト・アーツ・スキル・評価をフォームへコピーする
async function applySyncFromLinkedCard(idx) {
  const target = linkedCards[idx];
  const gasUrl = getCfg('gas');
  if (!gasUrl || !target) return;
  setStatus('元カードのステータスを取得中...');
  try {
    const res = await fetch(gasUrl + `?action=getCard&setCode=${encodeURIComponent(target.setCode)}&type=${encodeURIComponent(target.type)}&slot=${encodeURIComponent(target.slot)}`);
    const src = await res.json();
    if (!src) { setStatus('元カードの情報取得に失敗しました'); syncSourceIdx = -1; renderLinkedCardsList(); return; }

    document.getElementById('f_tag').value = src.cardType || '';
    document.getElementById('f_tags').value = src.tags || '';
    document.getElementById('f_name').value = src.cardName || '';
    document.getElementById('f_attr').value = src.attribute || '';
    document.getElementById('f_hp').value = src.hp || '';
    document.getElementById('f_stage').value = src.stage || '';
    document.getElementById('f_baton').value = src.batonTouchCost || '';
    document.getElementById('f_limited').checked = isFlagTrue(src.isLimited);
    updateHolomenVisibility(); // f_tagを直接書き換えたので、ホロメン/サポート項目の表示や評価ラベルを手動で更新する

    let arts = [], skills = [];
    try { arts = JSON.parse(src.artsJson || '[]'); } catch (e) {}
    try { skills = JSON.parse(src.skillsJson || '[]'); } catch (e) {}
    setArtsRows(arts);
    setSkillRows(skills);

    resetRatingFields();
    try {
      const rating = JSON.parse(src.ratingJson || '{}');
      RATE_KEYS.forEach(k => {
        const el = document.getElementById('rate_' + k);
        if (el && rating[k] !== undefined) el.value = rating[k];
      });
      renderAllRatingIndicators();
    } catch (e) {}
    document.getElementById('rate_comment').value = src.ratingComment || '';

    setSyncFieldsDisabled(true);
    setStatus('元カードのステータスを反映しました');
  } catch (err) {
    setStatus('元カードのステータス取得エラー: ' + err.message);
    syncSourceIdx = -1;
    renderLinkedCardsList();
  }
}

function renderLinkedCardsList() {
  const listEl = document.getElementById('linkSelectedList');
  if (!linkedCards.length) { listEl.innerHTML = ''; return; }
  listEl.innerHTML = linkedCards.map((card, i) => `
    <div style="display:flex; align-items:center; gap:10px; padding:8px 10px; border:1px solid rgba(212,175,106,0.4); border-radius:6px; background:rgba(212,175,106,0.08);">
      <img class="linkSelectedThumb" data-idx="${i}" src="${card.imageUrl || ''}" style="width:48px; aspect-ratio:5/7; object-fit:cover; border-radius:4px;">
      <span style="flex:1; font-size:13px;">${card.cardName}（${card.setCode}${getSetName(card.setCode) ? ' ' + getSetName(card.setCode) : ''} / ${card.type} 枠${card.slot}）</span>
      <button type="button" class="secondary linkSyncBtn ${syncSourceIdx === i ? 'active' : ''}" data-idx="${i}" style="padding:4px 10px; font-size:12px; ${syncSourceIdx === i ? 'background:var(--gold); color:#1a1305; border-color:var(--gold);' : ''}">元カードと同一</button>
      <button type="button" class="secondary linkRemoveBtn" data-idx="${i}" style="padding:4px 10px; font-size:12px;">解除</button>
    </div>
  `).join('');
  listEl.querySelectorAll('.linkSelectedThumb').forEach(img => {
    attachHoverPreview(img, linkedCards[Number(img.dataset.idx)].imageUrl);
  });
  listEl.querySelectorAll('.linkSyncBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      if (syncSourceIdx === idx) {
        // 既にON→OFFにする（コピー済みの値はそのまま編集可能に残す）
        syncSourceIdx = -1;
        setSyncFieldsDisabled(false);
        renderLinkedCardsList();
      } else {
        // 他のカードでONだった場合は排他的に切り替え
        syncSourceIdx = idx;
        renderLinkedCardsList();
        applySyncFromLinkedCard(idx);
      }
    });
  });
  listEl.querySelectorAll('.linkRemoveBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      if (syncSourceIdx === idx) {
        syncSourceIdx = -1;
        setSyncFieldsDisabled(false);
      } else if (syncSourceIdx > idx) {
        syncSourceIdx -= 1; // 前方の要素が消えるのでインデックスをずらす
      }
      linkedCards.splice(idx, 1);
      renderLinkedCardsList();
    });
  });
}

function addLinkedCard(card) {
  const cardK = `${card.setCode}__${card.type}__${card.slot}`;
  if (linkedCards.some(c => `${c.setCode}__${c.type}__${c.slot}` === cardK)) return; // 重複防止
  linkedCards.push(card);
  document.getElementById('f_linkSearch').value = '';
  document.getElementById('linkSearchResults').style.display = 'none';
  hideHoverPreview();
  renderLinkedCardsList();
}

document.addEventListener('click', (e) => {
  const wrap = document.getElementById('linkedCardWrap');
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById('linkSearchResults').style.display = 'none';
  }
});

// 編集モードで既存のlinkedCardKey（"setCode__type__slot"形式、複数はカンマ区切り）から関連カード情報を取得して表示
async function loadLinkedCardsByKeys(linkedCardKeyStr) {
  const keys = String(linkedCardKeyStr).split(',').map(s => s.trim()).filter(Boolean);
  const gasUrl = getCfg('gas');
  if (!gasUrl) return;
  for (const key of keys) {
    const parts = key.split('__');
    if (parts.length !== 3) continue;
    const [lSetCode, lType, lSlot] = parts;
    try {
      const res = await fetch(gasUrl + `?action=getCard&setCode=${encodeURIComponent(lSetCode)}&type=${encodeURIComponent(lType)}&slot=${encodeURIComponent(lSlot)}`);
      const card = await res.json();
      if (card) addLinkedCard(card);
    } catch (err) { /* 取得失敗時はスキップ */ }
  }
}

let linkSearchTimer = null;
document.getElementById('f_linkSearch').addEventListener('input', (e) => {
  const q = e.target.value.trim();
  clearTimeout(linkSearchTimer);
  const resultsEl = document.getElementById('linkSearchResults');
  if (q.length < 2) { resultsEl.style.display = 'none'; return; }
  linkSearchTimer = setTimeout(async () => {
    const gasUrl = getCfg('gas');
    if (!gasUrl) return;
    try {
      const res = await fetch(gasUrl + `?action=searchCards&q=${encodeURIComponent(q)}`);
      const list = await res.json();
      if (!Array.isArray(list) || !list.length) {
        resultsEl.innerHTML = `<div style="padding:8px 10px; font-size:13px; color:#9aa5c0;">該当なし</div>`;
        resultsEl.style.display = 'block';
        return;
      }
      resultsEl.innerHTML = list.map((c, i) => `
        <div class="linkResultItem" data-idx="${i}" style="display:flex; align-items:center; gap:10px; padding:8px 10px; cursor:pointer; border-bottom:1px solid rgba(212,175,106,0.12);">
          <img class="linkResultThumb" data-idx="${i}" src="${c.imageUrl || ''}" style="width:56px; aspect-ratio:5/7; object-fit:cover; border-radius:4px; flex-shrink:0;">
          <span style="font-size:13px;">${c.cardName}（${c.setCode}${getSetName(c.setCode) ? ' ' + getSetName(c.setCode) : ''} / ${c.type} 枠${c.slot}・${c.rarity || ''}）</span>
        </div>
      `).join('');
      resultsEl.style.display = 'block';
      resultsEl.querySelectorAll('.linkResultItem').forEach(el => {
        el.addEventListener('mouseenter', () => el.style.background = 'rgba(212,175,106,0.12)');
        el.addEventListener('mouseleave', () => el.style.background = '');
        el.addEventListener('click', () => addLinkedCard(list[Number(el.dataset.idx)]));
      });
      resultsEl.querySelectorAll('.linkResultThumb').forEach(img => {
        attachHoverPreview(img, list[Number(img.dataset.idx)].imageUrl);
      });
    } catch (err) {
      resultsEl.innerHTML = `<div style="padding:8px 10px; font-size:13px; color:#e37e7e;">検索エラー: ${err.message}</div>`;
      resultsEl.style.display = 'block';
    }
  }, 300);
});


