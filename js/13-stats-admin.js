// ===== 閲覧・お気に入り・ダウンロード・検索・アクセス統計 =====
// events シート（GAS側でlogEvent/getEventStatsを実装）を集計して表示する。
// 弾一覧が更新されるたび（refreshSets内から）にフィルタの選択肢も更新される。
function populateStatsSetFilter() {
  const sel = document.getElementById('statsSetFilter');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">全弾合算</option>' +
    sets.map(s => `<option value="${s.setCode}">${s.setCode}（${s.setName}）</option>`).join('');
  if (prev && sets.some(s => s.setCode === prev)) sel.value = prev;
}

const STATS_SERIES = [
  { key: 'view', label: '詳細表示', color: '#7ec8e3' },
  { key: 'favorite', label: 'お気に入り登録', color: '#e37eb4' },
  { key: 'download', label: 'ダウンロード', color: '#8ce38f' },
  { key: 'search', label: '検索', color: '#f0c36e' },
  { key: 'visit', label: 'サイト訪問', color: '#b28ce3' }
];

// 日別の推移を折れ線グラフで表示する。seriesリストを指定しない場合はSTATS_SERIES全件を使う
function buildDailyTrendChart(dailyTotals, seriesList) {
  const series = seriesList || STATS_SERIES;
  if (!dailyTotals.length) return '<div class="statsEmptyHint">この期間のデータはまだありません</div>';

  const width = Math.max(600, dailyTotals.length * 26);
  const height = 220;
  const paddingLeft = 36, paddingBottom = 28, paddingTop = 14, paddingRight = 16;
  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;
  const maxVal = Math.max(1, ...dailyTotals.map(d => Math.max(...series.map(s => d[s.key] || 0))));

  const xAt = (i) => paddingLeft + (dailyTotals.length <= 1 ? chartW / 2 : (i / (dailyTotals.length - 1)) * chartW);
  const yAt = (v) => paddingTop + chartH - (v / maxVal) * chartH;

  let gridHtml = '';
  for (let g = 0; g <= 4; g++) {
    const v = Math.round(maxVal * g / 4);
    const y = yAt(v);
    gridHtml += `<line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="rgba(212,175,106,0.12)" stroke-width="1"/>`;
    gridHtml += `<text x="${paddingLeft - 8}" y="${y}" font-size="10" fill="#9aa5c0" text-anchor="end" dominant-baseline="middle">${v}</text>`;
  }

  let xLabelHtml = '';
  const labelStep = Math.ceil(dailyTotals.length / 8) || 1;
  dailyTotals.forEach((d, i) => {
    if (i % labelStep !== 0 && i !== dailyTotals.length - 1) return;
    xLabelHtml += `<text x="${xAt(i)}" y="${height - paddingBottom + 16}" font-size="10" fill="#9aa5c0" text-anchor="middle">${d.date.slice(5)}</text>`;
  });

  const seriesHtml = series.map(s => {
    const points = dailyTotals.map((d, i) => `${xAt(i)},${yAt(d[s.key] || 0)}`).join(' ');
    const dots = dailyTotals.map((d, i) => `<circle cx="${xAt(i)}" cy="${yAt(d[s.key] || 0)}" r="2.5" fill="${s.color}"/>`).join('');
    return `<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="2"/>${dots}`;
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" style="min-width:${width}px; display:block;">
    ${gridHtml}
    ${xLabelHtml}
    ${seriesHtml}
  </svg>`;
}

function statsCardLabel(c) {
  const setLabel = c.setCode + (getSetName(c.setCode) ? ' ' + getSetName(c.setCode) : ''); // パック番号の後ろにパック名も表示
  return `${escapeAttr(c.cardName || '(不明)')} <span class="hint">（${escapeAttr(setLabel)} / ${escapeAttr(c.type)} 枠${escapeAttr(String(c.slot))}）</span>`;
}

// カードごとの内訳ランキング（閲覧＋お気に入りの合計が多い順、全期間で集計）。行クリックでそのカードへ遷移する
function buildRankingTable(cardRanking) {
  if (!cardRanking.length) return '<div class="statsEmptyHint">まだデータがありません</div>';
  const top = cardRanking.slice(0, 30);
  return `
    <table class="statsRankingTable" data-kind="rank">
      <thead><tr><th>#</th><th>カード</th><th>閲覧</th><th>お気に入り</th><th>合計</th></tr></thead>
      <tbody>
        ${top.map((c, i) => `
          <tr class="statsRankRow" data-setcode="${escapeAttr(c.setCode)}" data-type="${escapeAttr(c.type)}" data-slot="${escapeAttr(String(c.slot))}">
            <td class="statsRankNum">${i + 1}</td>
            <td>${statsCardLabel(c)}</td>
            <td>${c.view}</td>
            <td>${c.favorite}</td>
            <td><strong>${c.view + c.favorite}</strong></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ダウンロード数のみでのランキング（全期間・ダウンロードが1件以上あるカードのみ）。行クリックでそのカードへ遷移する
function buildDownloadRankingTable(downloadRanking) {
  if (!downloadRanking.length) return '<div class="statsEmptyHint">まだダウンロードの記録がありません</div>';
  const top = downloadRanking.slice(0, 30);
  return `
    <table class="statsRankingTable" data-kind="download">
      <thead><tr><th>#</th><th>カード</th><th>ダウンロード数</th></tr></thead>
      <tbody>
        ${top.map((c, i) => `
          <tr class="statsRankRow" data-setcode="${escapeAttr(c.setCode)}" data-type="${escapeAttr(c.type)}" data-slot="${escapeAttr(String(c.slot))}">
            <td class="statsRankNum">${i + 1}</td>
            <td>${statsCardLabel(c)}</td>
            <td><strong>${c.download}</strong></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// 端末・ブラウザの内訳を簡易な棒グラフ風リストで表示する
function buildBreakdownList(breakdown) {
  if (!breakdown.length) return '<div class="statsEmptyHint">データがありません</div>';
  const total = breakdown.reduce((s, b) => s + b.count, 0) || 1;
  return `
    <div class="statsBreakdownList">
      ${breakdown.map(b => `
        <div class="statsBreakdownRow">
          <span class="statsBreakdownLabel">${escapeAttr(b.label)}</span>
          <div class="statsBreakdownBarWrap"><div class="statsBreakdownBar" style="width:${Math.round(b.count / total * 100)}%;"></div></div>
          <span class="statsBreakdownCount">${b.count}</span>
        </div>
      `).join('')}
    </div>
  `;
}

// ランキング行クリックでそのカードへ遷移（弾が違えば切り替えてから編集ポップアップを開く）
async function jumpToCardFromStats(setCode, type, slot) {
  const gasUrl = getCfg('gas');
  if (!gasUrl) return;
  const sel = document.getElementById('activeSet');
  try {
    if (sel.value !== setCode) {
      sel.value = setCode;
      renderIconSelectOptions(sel, sets, Object.fromEntries(sets.map(s => [s.setCode, s.packImageUrl])));
      await renderGallery();
    }
    const res = await fetch(gasUrl + `?action=getCard&setCode=${encodeURIComponent(setCode)}&type=${encodeURIComponent(type)}&slot=${encodeURIComponent(slot)}`);
    const card = await res.json();
    if (!card) { alert('該当のカードが見つかりませんでした（削除されている可能性があります）'); return; }
    await startEditCard(card);
  } catch (err) {
    alert('カードの取得に失敗しました: ' + err.message);
  }
}

function bindStatsRankingClicks(container) {
  container.querySelectorAll('.statsRankRow').forEach(row => {
    row.addEventListener('click', () => {
      jumpToCardFromStats(row.dataset.setcode, row.dataset.type, row.dataset.slot);
    });
  });
}

async function loadStats() {
  const gasUrl = getCfg('gas');
  const contentEl = document.getElementById('statsContent');
  if (!contentEl) return;
  if (!gasUrl) { contentEl.innerHTML = '<div class="statsEmptyHint">先に①でGAS Web App URLを設定してください</div>'; return; }

  const setCode = document.getElementById('statsSetFilter').value;
  const days = document.getElementById('statsDaysFilter').value;
  contentEl.innerHTML = '<div class="statsEmptyHint">読み込み中...</div>';

  try {
    const url = gasUrl + `?action=getEventStats&days=${encodeURIComponent(days)}` + (setCode ? `&setCode=${encodeURIComponent(setCode)}` : '');
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) { contentEl.innerHTML = `<div class="statsEmptyHint">取得エラー: ${escapeAttr(data.error)}</div>`; return; }

    const dailyTotals = data.dailyTotals || [];
    const cardRanking = data.cardRanking || [];
    const downloadRanking = data.downloadRanking || [];
    const deviceBreakdown = data.deviceBreakdown || [];
    const browserBreakdown = data.browserBreakdown || [];

    const totals = {};
    STATS_SERIES.forEach(s => { totals[s.key] = dailyTotals.reduce((sum, d) => sum + (d[s.key] || 0), 0); });
    const viewSeries = STATS_SERIES.filter(s => s.key === 'view');
    const otherSeries = STATS_SERIES.filter(s => s.key !== 'view');

    contentEl.innerHTML = `
      <div class="statsSummaryRow">
        ${STATS_SERIES.map(s => `
          <div class="statsSummaryCard"><div class="statsSummaryLabel">期間内・${escapeAttr(s.label)}</div><div class="statsSummaryValue">${totals[s.key]}</div></div>
        `).join('')}
      </div>

      <h3 style="margin:0 0 10px;">詳細表示（クリック数）の推移</h3>
      <div class="statsChartLegend">
        ${viewSeries.map(s => `<span><span class="statsLegendDot" style="background:${s.color};"></span>${escapeAttr(s.label)}</span>`).join('')}
      </div>
      <div class="statsChartWrap">${buildDailyTrendChart(dailyTotals, viewSeries)}</div>

      <h3 style="margin:20px 0 10px;">その他の項目の推移</h3>
      <div class="statsChartLegend">
        ${otherSeries.map(s => `<span><span class="statsLegendDot" style="background:${s.color};"></span>${escapeAttr(s.label)}</span>`).join('')}
      </div>
      <div class="statsChartWrap">${buildDailyTrendChart(dailyTotals, otherSeries)}</div>

      <div class="statsBreakdownRowWrap">
        <div class="statsBreakdownCol">
          <h3 style="margin:0 0 10px;">端末別内訳（期間内）</h3>
          ${buildBreakdownList(deviceBreakdown)}
        </div>
        <div class="statsBreakdownCol">
          <h3 style="margin:0 0 10px;">ブラウザ別内訳（期間内）</h3>
          ${buildBreakdownList(browserBreakdown)}
        </div>
      </div>

      <h3 style="margin:20px 0 10px;">人気カードランキング（全期間・閲覧+お気に入り順・上位30件）</h3>
      <div class="hint" style="margin-bottom:8px;">行をクリックするとそのカードの編集画面に移動します</div>
      ${buildRankingTable(cardRanking)}

      <h3 style="margin:20px 0 10px;">ダウンロードランキング（全期間・上位30件）</h3>
      <div class="hint" style="margin-bottom:8px;">行をクリックするとそのカードの編集画面に移動します</div>
      ${buildDownloadRankingTable(downloadRanking)}
    `;

    bindStatsRankingClicks(contentEl);
  } catch (err) {
    contentEl.innerHTML = `<div class="statsEmptyHint">取得エラー: ${escapeAttr(err.message)}</div>`;
  }
}

document.getElementById('statsRefreshBtn').addEventListener('click', loadStats);
document.getElementById('statsSetFilter').addEventListener('change', loadStats);
document.getElementById('statsDaysFilter').addEventListener('change', loadStats);
