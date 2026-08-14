// ===== 閲覧・お気に入り統計 =====
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

// 日別の詳細表示数／お気に入り登録数を折れ線グラフで表示する
function buildDailyTrendChart(dailyTotals) {
  if (!dailyTotals.length) return '<div class="statsEmptyHint">この期間のデータはまだありません</div>';

  const width = Math.max(600, dailyTotals.length * 26);
  const height = 220;
  const paddingLeft = 36, paddingBottom = 28, paddingTop = 14, paddingRight = 16;
  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;
  const maxVal = Math.max(1, ...dailyTotals.map(d => Math.max(d.view, d.favorite)));

  const xAt = (i) => paddingLeft + (dailyTotals.length <= 1 ? chartW / 2 : (i / (dailyTotals.length - 1)) * chartW);
  const yAt = (v) => paddingTop + chartH - (v / maxVal) * chartH;

  const viewPoints = dailyTotals.map((d, i) => `${xAt(i)},${yAt(d.view)}`).join(' ');
  const favPoints = dailyTotals.map((d, i) => `${xAt(i)},${yAt(d.favorite)}`).join(' ');

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

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" style="min-width:${width}px; display:block;">
    ${gridHtml}
    ${xLabelHtml}
    <polyline points="${viewPoints}" fill="none" stroke="#7ec8e3" stroke-width="2"/>
    <polyline points="${favPoints}" fill="none" stroke="#e37eb4" stroke-width="2"/>
    ${dailyTotals.map((d, i) => `<circle cx="${xAt(i)}" cy="${yAt(d.view)}" r="2.5" fill="#7ec8e3"/>`).join('')}
    ${dailyTotals.map((d, i) => `<circle cx="${xAt(i)}" cy="${yAt(d.favorite)}" r="2.5" fill="#e37eb4"/>`).join('')}
  </svg>`;
}

// カードごとの内訳ランキング（閲覧＋お気に入りの合計が多い順、全期間で集計）
function buildRankingTable(cardRanking) {
  if (!cardRanking.length) return '<div class="statsEmptyHint">まだデータがありません</div>';
  const top = cardRanking.slice(0, 30);
  return `
    <table class="statsRankingTable">
      <thead><tr><th>#</th><th>カード</th><th>閲覧</th><th>お気に入り</th><th>合計</th></tr></thead>
      <tbody>
        ${top.map((c, i) => `
          <tr>
            <td class="statsRankNum">${i + 1}</td>
            <td>${escapeAttr(c.cardName || '(不明)')} <span class="hint">（${escapeAttr(c.setCode)} / ${escapeAttr(c.type)} 枠${escapeAttr(String(c.slot))}）</span></td>
            <td>${c.view}</td>
            <td>${c.favorite}</td>
            <td><strong>${c.view + c.favorite}</strong></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
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
    const totalView = dailyTotals.reduce((s, d) => s + d.view, 0);
    const totalFav = dailyTotals.reduce((s, d) => s + d.favorite, 0);

    contentEl.innerHTML = `
      <div class="statsSummaryRow">
        <div class="statsSummaryCard"><div class="statsSummaryLabel">期間内・詳細表示</div><div class="statsSummaryValue">${totalView}</div></div>
        <div class="statsSummaryCard"><div class="statsSummaryLabel">期間内・お気に入り登録</div><div class="statsSummaryValue">${totalFav}</div></div>
        <div class="statsSummaryCard"><div class="statsSummaryLabel">集計対象カード数（全期間）</div><div class="statsSummaryValue">${cardRanking.length}</div></div>
      </div>
      <div class="statsChartLegend">
        <span><span class="statsLegendDot" style="background:#7ec8e3;"></span>詳細表示</span>
        <span><span class="statsLegendDot" style="background:#e37eb4;"></span>お気に入り登録</span>
      </div>
      <div class="statsChartWrap">${buildDailyTrendChart(dailyTotals)}</div>
      <h3 style="margin:0 0 10px;">人気カードランキング（全期間・上位30件）</h3>
      ${buildRankingTable(cardRanking)}
    `;
  } catch (err) {
    contentEl.innerHTML = `<div class="statsEmptyHint">取得エラー: ${escapeAttr(err.message)}</div>`;
  }
}

document.getElementById('statsRefreshBtn').addEventListener('click', loadStats);
document.getElementById('statsSetFilter').addEventListener('change', loadStats);
document.getElementById('statsDaysFilter').addEventListener('change', loadStats);
