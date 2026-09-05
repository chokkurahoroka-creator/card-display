// ===== ビンゴ番号抽選 =====
// レア度を複数選択して候補プール（パック内総合番号）を組み立て、指定枚数をランダムに抽選する。
// パラレルは対象外（総合番号の対象は「新規」「再録」のみ）。
// 総合番号の考え方: 新規＝配置スロットそのまま／再録＝配置スロット＋新規収録枚数
// （カード登録時にサーバーへ保存済みのoverallNumber列には依存せず、常にこの計算式で算出し直す）
//
// 抽選グループ：レア度チェックボックス（複数選択可・例: C&Uを両方チェックすると合算プールになる）＋
//               候補番号（自動反映・手動編集可）＋抽選枚数、のセット。「＋ 抽選グループを追加」で複数設定できる。
// 特殊マス：カード抽選とは別枠で、手入力した文字列をそのまま最終結果に混ぜ込める（画像は無くテキストのみ表示）。
// 抽選結果は、全グループの当選カード＋特殊マスをまとめてシャッフルし、ランダムな並び順で表示する。

const BINGO_RARITY_ORDER = ['SEC', 'OUR', 'OSR', 'OC', 'HR', 'SY', 'UR', 'SR', 'RR', 'U', 'S', 'R', 'C', 'P', '判別不能', 'その他'];
function bingoRarityOrderIndex(rarity) {
  const r = (rarity || '').toUpperCase().trim();
  if (!r) return BINGO_RARITY_ORDER.indexOf('その他');
  const idx = BINGO_RARITY_ORDER.indexOf(r);
  return idx === -1 ? BINGO_RARITY_ORDER.indexOf('判別不能') : idx;
}

let bingoCardsPool = [];    // 選択中パックの「新規」「再録」カード（パラレル除外）＋計算済み総合番号
let bingoRaritiesList = []; // 選択中パックに存在するレア度一覧（チェックボックス表示用）
let bingoGroupCounter = 0;  // 抽選グループのユニークID採番用
let bingoLastResults = [];  // 直近の抽選結果（画像一括ダウンロード用）

// 新規＝スロットそのまま、再録＝スロット＋新規収録枚数、パラレルは対象外（nullを返す）
function bingoComputeOverallNumber(card, setInfo) {
  const slot = Number(card.slot) || 0;
  if (card.type === '新規') return slot;
  if (card.type === '再録') return slot + (Number(setInfo.totalNew) || 0);
  return null;
}

function openBingoOverlay() {
  document.getElementById('bingoOverlay').classList.add('open');
  populateBingoSetSelect();
}
function closeBingoOverlay() {
  document.getElementById('bingoOverlay').classList.remove('open');
}
document.getElementById('bingoSidebarBtn').addEventListener('click', openBingoOverlay);
document.getElementById('bingoOverlayCloseBtn').addEventListener('click', closeBingoOverlay);
document.getElementById('bingoOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'bingoOverlay') closeBingoOverlay();
});

function populateBingoSetSelect() {
  const sel = document.getElementById('bingoSetSelect');
  const prev = sel.value;
  sel.innerHTML = '<option value="">選択してください</option>' +
    sets.map(s => `<option value="${s.setCode}">${s.setCode}（${s.setName}）</option>`).join('');
  if (prev && sets.some(s => s.setCode === prev)) sel.value = prev;
}

document.getElementById('bingoSetSelect').addEventListener('change', loadBingoPackData);
document.getElementById('bingoAddGroupBtn').addEventListener('click', addBingoGroup);

async function loadBingoPackData() {
  const setCode = document.getElementById('bingoSetSelect').value;
  const containerEl = document.getElementById('bingoRarityRows');
  document.getElementById('bingoResultGrid').innerHTML = '';
  document.getElementById('bingoNumberSequenceRow').innerHTML = '';
  document.getElementById('bingoResultStatus').textContent = '';
  document.getElementById('bingoDownloadBtn').style.display = 'none';
  document.getElementById('bingoAddGroupBtn').style.display = 'none';
  bingoLastResults = [];
  bingoCardsPool = [];
  bingoRaritiesList = [];

  if (!setCode) {
    containerEl.innerHTML = 'パックを選択すると、レア度を複数選択して候補プール（パック内総合番号）を組み立てられます';
    return;
  }

  containerEl.innerHTML = '<div class="cpHint"><span class="cpSpinner"></span>読み込み中...</div>';
  try {
    const gasUrl = getCfg('gas');
    const setInfo = sets.find(s => s.setCode === setCode) || { totalNew: 0, totalRerun: 0 };
    const res = await fetch(gasUrl + `?action=list&setCode=${encodeURIComponent(setCode)}`);
    const allCards = await res.json();

    // パラレルを除外し、総合番号を計算しておく
    bingoCardsPool = allCards
      .filter(c => c.type !== 'パラレル')
      .map(c => Object.assign({}, c, { overallNumber: bingoComputeOverallNumber(c, setInfo) }))
      .filter(c => c.overallNumber !== null);
  } catch (err) {
    containerEl.innerHTML = `<span style="color:#e37e7e;">読み込みに失敗しました: ${escapeHtml(err.message)}</span>`;
    return;
  }

  if (!bingoCardsPool.length) {
    containerEl.innerHTML = 'このパックには対象となるカード（新規・再録）が登録されていません';
    return;
  }

  const raritySet = new Set(bingoCardsPool.map(c => c.rarity || '未設定'));
  bingoRaritiesList = Array.from(raritySet).sort((a, b) => bingoRarityOrderIndex(a) - bingoRarityOrderIndex(b));

  containerEl.innerHTML = '';
  bingoGroupCounter = 0;
  addBingoGroup(); // 初期状態で1グループ表示
  document.getElementById('bingoAddGroupBtn').style.display = 'inline-block';
}

// レア度チェックボックス＋候補番号＋抽選枚数の1セット（抽選グループ）を追加する
function addBingoGroup() {
  bingoGroupCounter++;
  const containerEl = document.getElementById('bingoRarityRows');
  const box = document.createElement('div');
  box.className = 'bingoGroupBox';
  box.style.cssText = 'border:1px solid rgba(212,175,106,0.25); border-radius:8px; padding:12px; margin-bottom:12px;';
  box.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
      <span style="font-size:13px; font-weight:bold; color:var(--gold);">抽選グループ ${bingoGroupCounter}</span>
      <button type="button" class="secondary bingoRemoveGroupBtn" style="margin-top:0; padding:4px 10px; font-size:12px;">グループを削除</button>
    </div>
    <div class="hint" style="margin-bottom:6px;">対象レア度（複数選択可・例: CとUを両方チェックすると合算したプールになります）</div>
    <div class="bingoRarityChecks" style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
      ${bingoRaritiesList.map(r => `
        <label style="display:flex; align-items:center; gap:4px; font-size:13px; cursor:pointer;">
          <input type="checkbox" class="bingoRarityCheckbox" value="${escapeAttr(r)}">
          ${escapeAttr(r)}
        </label>
      `).join('')}
    </div>
    <div class="hint" style="margin:0 0 4px;">候補番号（パック内総合番号・レア度選択で自動反映／手動編集も可）</div>
    <textarea class="bingoPoolInput" rows="2" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid rgba(212,175,106,0.3);background:#10182a;color:var(--text);font-size:12px;"></textarea>
    <div style="display:flex; align-items:center; gap:6px; margin-top:8px;">
      <label style="margin:0; font-size:13px;">抽選枚数</label>
      <input type="number" min="0" class="bingoDrawCount" style="width:70px;">
    </div>
  `;
  containerEl.appendChild(box);

  box.querySelectorAll('.bingoRarityCheckbox').forEach(cb => {
    cb.addEventListener('change', () => regenerateBingoGroupPool(box));
  });
  box.querySelector('.bingoRemoveGroupBtn').addEventListener('click', () => {
    if (containerEl.querySelectorAll('.bingoGroupBox').length <= 1) {
      alert('抽選グループは最低1つ必要です');
      return;
    }
    box.remove();
  });
}

// チェックされているレア度から候補番号（総合番号）を自動で組み立てて反映する
function regenerateBingoGroupPool(box) {
  const checked = Array.from(box.querySelectorAll('.bingoRarityCheckbox:checked')).map(cb => cb.value);
  const poolEl = box.querySelector('.bingoPoolInput');
  if (!checked.length) { poolEl.value = ''; return; }
  const matched = bingoCardsPool.filter(c => checked.includes(c.rarity || '未設定'));
  const nums = [...new Set(matched.map(c => c.overallNumber))].sort((a, b) => a - b);
  poolEl.value = nums.join(', ');
}

// Fisher-Yatesシャッフル
function bingoShuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

document.getElementById('bingoDrawBtn').addEventListener('click', () => {
  const statusEl = document.getElementById('bingoResultStatus');
  const gridEl = document.getElementById('bingoResultGrid');
  const numberRowEl = document.getElementById('bingoNumberSequenceRow');
  gridEl.innerHTML = '';
  numberRowEl.innerHTML = '';
  bingoLastResults = [];

  const groupBoxes = Array.from(document.querySelectorAll('.bingoGroupBox'));
  if (!groupBoxes.length) { statusEl.textContent = 'パックを選択してください'; return; }

  const errors = [];
  let allWinners = [];

  groupBoxes.forEach((box, idx) => {
    const checkedRarities = Array.from(box.querySelectorAll('.bingoRarityCheckbox:checked')).map(cb => cb.value);
    const poolEl = box.querySelector('.bingoPoolInput');
    const countEl = box.querySelector('.bingoDrawCount');
    const count = Number(countEl.value) || 0;
    if (count <= 0) return; // 抽選枚数が未入力・0のグループはスキップ

    const label = checkedRarities.length ? checkedRarities.join('&') : `グループ${idx + 1}`;
    const poolNumbers = poolEl.value.split(/[,\s]+/).map(s => s.trim()).filter(Boolean).map(Number).filter(n => !isNaN(n));
    const uniquePool = [...new Set(poolNumbers)];

    if (!uniquePool.length) { errors.push(`「${label}」の候補番号が空です`); return; }
    if (count > uniquePool.length) { errors.push(`「${label}」は候補${uniquePool.length}枚に対し抽選枚数${count}枚が指定されています（多すぎます）`); return; }

    const winningNumbers = bingoShuffle(uniquePool).slice(0, count);
    winningNumbers.forEach(num => {
      // 複数レア度を選択している場合があるため、選択中レア度のいずれかに該当する総合番号でカードを特定する
      const card = bingoCardsPool.find(c => c.overallNumber === num && checkedRarities.includes(c.rarity || '未設定'));
      allWinners.push({ label, overallNumber: num, card: card || null });
    });
  });

  // 特殊マス（手入力）を、カード抽選とは別枠でそのまま結果に追加する
  const specialRaw = document.getElementById('bingoSpecialInput').value;
  const specialEntries = specialRaw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  specialEntries.forEach(label => allWinners.push({ special: true, label }));

  if (!allWinners.length) {
    statusEl.innerHTML = errors.length
      ? errors.map(e => `⚠ ${escapeHtml(e)}`).join('<br>')
      : '抽選対象がありません。抽選グループの枚数、または特殊マスを入力してください';
    return;
  }

  allWinners = bingoShuffle(allWinners); // カードの当選結果と特殊マスをまとめてシャッフルし、ランダムな並び順で出力する
  bingoLastResults = allWinners;

  // 抜き出したカード番号（特殊マスを除く）だけを、シャッフル後の並び順のままテキスト行として表示する
  const numberSequence = allWinners.filter(w => !w.special).map(w => w.overallNumber);
  numberRowEl.innerHTML = numberSequence.length
    ? `<div style="font-size:22px; font-weight:bold; letter-spacing:0.06em; text-align:center; padding:16px; border:1px solid rgba(212,175,106,0.4); border-radius:10px; background:rgba(212,175,106,0.08); color:var(--gold);">${numberSequence.join('　→　')}</div>`
    : '';

  gridEl.innerHTML = allWinners.map(w => {
    if (w.special) {
      return `
        <div class="galleryCard" style="display:flex; align-items:center; justify-content:center; min-height:160px; background:rgba(212,175,106,0.12); border:2px dashed rgba(212,175,106,0.5);">
          <div style="text-align:center; padding:12px;">
            <div style="font-size:24px;">🎁</div>
            <div class="gcName" style="margin-top:6px;">${escapeAttr(w.label)}</div>
          </div>
        </div>`;
    }
    return `
      <div class="galleryCard">
        ${w.card ? `<img src="${w.card.imageUrl}" alt="${escapeAttr(w.card.cardName)}">` : '<div class="hint" style="padding:20px 8px;">該当カードが見つかりません</div>'}
        <div class="gcBody">
          <div class="gcTag">${escapeAttr(w.label)} No.${w.overallNumber}</div>
          <div class="gcName">${w.card ? escapeAttr(w.card.cardName) : '（候補番号を確認してください）'}</div>
        </div>
      </div>`;
  }).join('');

  const missingCount = allWinners.filter(w => !w.special && !w.card).length;
  statusEl.innerHTML = (errors.length ? errors.map(e => `⚠ ${escapeHtml(e)}`).join('<br>') + '<br>' : '')
    + `抽選結果: ${allWinners.length}件${missingCount ? `（うち${missingCount}件は該当カードが見つかりませんでした。候補番号を確認してください）` : ''}`;

  document.getElementById('bingoDownloadBtn').style.display = allWinners.some(w => w.card) ? 'inline-block' : 'none';
});

document.getElementById('bingoDownloadBtn').addEventListener('click', async () => {
  const btn = document.getElementById('bingoDownloadBtn');
  const targets = bingoLastResults.filter(w => w.card && w.card.imageUrl); // 特殊マス（画像なし）は自動的に対象外
  if (!targets.length) return;

  const original = btn.textContent;
  btn.disabled = true;

  try {
    const zip = new JSZip();
    for (let i = 0; i < targets.length; i++) {
      const w = targets[i];
      btn.textContent = `画像を取得中... (${i + 1}/${targets.length})`;
      const res = await fetch(w.card.imageUrl);
      const blob = await res.blob();
      const safeName = `${w.label}_No${w.overallNumber}_${(w.card.cardName || 'card').replace(/[^\w\-一-龠ぁ-んァ-ヶ]/g, '')}.jpg`;
      zip.file(safeName, blob);
    }
    btn.textContent = 'ZIPを作成中...';
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bingo_${document.getElementById('bingoSetSelect').value}_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('画像の一括ダウンロードに失敗しました: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});
