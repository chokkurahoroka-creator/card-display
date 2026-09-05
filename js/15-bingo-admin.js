// ===== ビンゴ番号抽選 =====
// レアリティごとに候補プール（パック内総合番号）を用意し、指定枚数をランダムに抽選する。
// パラレルは対象外（総合番号の対象は「新規」「再録」のみ）。
// 総合番号の考え方: 新規＝配置スロットそのまま／再録＝配置スロット＋新規収録枚数
// （このパックにまだ古い登録データが残っている場合も、常にこの計算式で総合番号を算出し直すため、
//   カード登録時にサーバーへ保存済みのoverallNumber列の値には依存しない）

const BINGO_RARITY_ORDER = ['SEC', 'OUR', 'OSR', 'OC', 'HR', 'SY', 'UR', 'SR', 'RR', 'U', 'S', 'R', 'C', 'P', '判別不能', 'その他'];
function bingoRarityOrderIndex(rarity) {
  const r = (rarity || '').toUpperCase().trim();
  if (!r) return BINGO_RARITY_ORDER.indexOf('その他');
  const idx = BINGO_RARITY_ORDER.indexOf(r);
  return idx === -1 ? BINGO_RARITY_ORDER.indexOf('判別不能') : idx;
}

let bingoCardsPool = [];   // 選択中パックの「新規」「再録」カード（パラレル除外）＋計算済み総合番号
let bingoLastResults = []; // 直近の抽選結果（画像一括ダウンロード用）

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

document.getElementById('bingoSetSelect').addEventListener('change', loadBingoRarityRows);

async function loadBingoRarityRows() {
  const setCode = document.getElementById('bingoSetSelect').value;
  const rowsEl = document.getElementById('bingoRarityRows');
  document.getElementById('bingoResultGrid').innerHTML = '';
  document.getElementById('bingoResultStatus').textContent = '';
  document.getElementById('bingoDownloadBtn').style.display = 'none';
  bingoLastResults = [];
  bingoCardsPool = [];

  if (!setCode) {
    rowsEl.innerHTML = 'パックを選択すると、収録されているレアリティごとに候補プール（パック内総合番号）が表示されます';
    return;
  }

  rowsEl.innerHTML = '<div class="cpHint"><span class="cpSpinner"></span>読み込み中...</div>';
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
    rowsEl.innerHTML = `<span style="color:#e37e7e;">読み込みに失敗しました: ${escapeHtml(err.message)}</span>`;
    return;
  }

  if (!bingoCardsPool.length) {
    rowsEl.innerHTML = 'このパックには対象となるカード（新規・再録）が登録されていません';
    return;
  }

  const groups = {};
  bingoCardsPool.forEach(c => {
    const r = c.rarity || '未設定';
    if (!groups[r]) groups[r] = [];
    groups[r].push(c);
  });

  const rarities = Object.keys(groups).sort((a, b) => bingoRarityOrderIndex(a) - bingoRarityOrderIndex(b));

  rowsEl.innerHTML = rarities.map(r => {
    const list = groups[r].slice().sort((a, b) => a.overallNumber - b.overallNumber);
    const poolStr = list.map(c => c.overallNumber).join(', ');
    return `
      <div class="siteStatusRow" style="align-items:flex-start; flex-direction:column; gap:8px;">
        <div style="display:flex; justify-content:space-between; width:100%; align-items:center; flex-wrap:wrap; gap:8px;">
          <span class="siteStatusRowLabel">${escapeAttr(r)}（候補 ${list.length}枚）</span>
          <span style="display:flex; align-items:center; gap:6px;">
            <label style="margin:0; white-space:nowrap; font-size:13px;">抽選枚数</label>
            <input type="number" min="0" max="${list.length}" class="bingoDrawCount" data-rarity="${escapeAttr(r)}" style="width:70px;">
          </span>
        </div>
        <div class="hint" style="margin:0;">候補番号（パック内総合番号）。不要な番号を消せば抽選対象から除外できます</div>
        <textarea class="bingoPoolInput" data-rarity="${escapeAttr(r)}" rows="2" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid rgba(212,175,106,0.3);background:#10182a;color:var(--text);font-size:12px;">${escapeAttr(poolStr)}</textarea>
      </div>
    `;
  }).join('');
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
  gridEl.innerHTML = '';
  bingoLastResults = [];

  const poolInputs = Array.from(document.querySelectorAll('.bingoPoolInput'));
  if (!poolInputs.length) { statusEl.textContent = 'パックを選択してください'; return; }

  const errors = [];
  let allWinners = [];

  poolInputs.forEach(poolEl => {
    const rarity = poolEl.dataset.rarity;
    const countEl = document.querySelector(`.bingoDrawCount[data-rarity="${CSS.escape(rarity)}"]`);
    const count = Number(countEl.value) || 0;
    if (count <= 0) return; // 抽選枚数が未入力・0のレアリティはスキップ

    const poolNumbers = poolEl.value.split(/[,\s]+/).map(s => s.trim()).filter(Boolean).map(Number).filter(n => !isNaN(n));
    const uniquePool = [...new Set(poolNumbers)];

    if (!uniquePool.length) { errors.push(`「${rarity}」の候補番号が空です`); return; }
    if (count > uniquePool.length) { errors.push(`「${rarity}」は候補${uniquePool.length}枚に対し抽選枚数${count}枚が指定されています（多すぎます）`); return; }

    const winningNumbers = bingoShuffle(uniquePool).slice(0, count);
    winningNumbers.forEach(num => {
      const card = bingoCardsPool.find(c => c.rarity === rarity && c.overallNumber === num);
      allWinners.push({ rarity, overallNumber: num, card: card || null });
    });
  });

  if (!allWinners.length) {
    statusEl.innerHTML = errors.length
      ? errors.map(e => `⚠ ${escapeHtml(e)}`).join('<br>')
      : '抽選対象がありません。レアリティごとに抽選枚数を入力してください';
    return;
  }

  allWinners = bingoShuffle(allWinners); // 結果全体をシャッフルして表示（レアリティ順に偏らないように）
  bingoLastResults = allWinners;

  gridEl.innerHTML = allWinners.map(w => `
    <div class="galleryCard">
      ${w.card ? `<img src="${w.card.imageUrl}" alt="${escapeAttr(w.card.cardName)}">` : '<div class="hint" style="padding:20px 8px;">該当カードが見つかりません</div>'}
      <div class="gcBody">
        <div class="gcTag">${escapeAttr(w.rarity)} No.${w.overallNumber}</div>
        <div class="gcName">${w.card ? escapeAttr(w.card.cardName) : '（候補番号を確認してください）'}</div>
      </div>
    </div>
  `).join('');

  const missingCount = allWinners.filter(w => !w.card).length;
  statusEl.innerHTML = (errors.length ? errors.map(e => `⚠ ${escapeHtml(e)}`).join('<br>') + '<br>' : '')
    + `抽選結果: ${allWinners.length}枚${missingCount ? `（うち${missingCount}枚は該当カードが見つかりませんでした。候補番号を確認してください）` : ''}`;

  document.getElementById('bingoDownloadBtn').style.display = allWinners.some(w => w.card) ? 'inline-block' : 'none';
});

document.getElementById('bingoDownloadBtn').addEventListener('click', async () => {
  const btn = document.getElementById('bingoDownloadBtn');
  const targets = bingoLastResults.filter(w => w.card && w.card.imageUrl);
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
      const safeName = `${w.rarity}_No${w.overallNumber}_${(w.card.cardName || 'card').replace(/[^\w\-一-龠ぁ-んァ-ヶ]/g, '')}.jpg`;
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
