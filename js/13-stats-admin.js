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

// カードごとの内訳ランキング（閲覧＋お気に入り＋ダウンロードの合計が多い順、全期間で集計）。行クリックでそのカードへ遷移する
function buildRankingTable(cardRanking) {
  if (!cardRanking.length) return '<div class="statsEmptyHint">まだデータがありません</div>';
  const top = cardRanking.slice(0, 30);
  return `
    <table class="statsRankingTable" data-kind="rank">
      <thead><tr><th>#</th><th>カード</th><th>閲覧</th><th>お気に入り</th><th>DL</th><th>合計</th></tr></thead>
      <tbody>
        ${top.map((c, i) => `
          <tr class="statsRankRow" data-setcode="${escapeAttr(c.setCode)}" data-type="${escapeAttr(c.type)}" data-slot="${escapeAttr(String(c.slot))}">
            <td class="statsRankNum">${i + 1}</td>
            <td>${statsCardLabel(c)}</td>
            <td>${c.view}</td>
            <td>${c.favorite}</td>
            <td>${c.download}</td>
            <td><strong>${c.view + c.favorite + c.download}</strong></td>
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

// 端末・ブラウザの内訳を簡易な棒グラフ風リストで表示する（件数の後ろに割合(%)も表示）
function buildBreakdownList(breakdown) {
  if (!breakdown.length) return '<div class="statsEmptyHint">データがありません</div>';
  const total = breakdown.reduce((s, b) => s + b.count, 0) || 1;
  return `
    <div class="statsBreakdownList">
      ${breakdown.map(b => {
        const pct = Math.round(b.count / total * 100);
        return `
        <div class="statsBreakdownRow">
          <span class="statsBreakdownLabel">${escapeAttr(b.label)}</span>
          <div class="statsBreakdownBarWrap"><div class="statsBreakdownBar" style="width:${pct}%;"></div></div>
          <span class="statsBreakdownCount">${b.count}(${pct}%)</span>
        </div>
      `;
      }).join('')}
    </div>
  `;
}

// 数値を「概数（キリの良い数）」に丸める。ラジアルバーチャートの目盛りラベル用
// 例: 7→5, 13→10, 42→40, 137→150, 1230→1200
function roundToNiceNumber(n) {
  if (n <= 0) return 0;
  const magnitude = Math.pow(10, Math.floor(Math.log10(n)));
  const norm = n / magnitude; // 1.0〜10.0の範囲に正規化
  let niceNorm;
  if (norm < 1.5) niceNorm = 1;
  else if (norm < 3) niceNorm = 2;
  else if (norm < 7) niceNorm = 5;
  else niceNorm = 10;
  return niceNorm * magnitude;
}

// 時間帯（0〜23時）別のアクセス数をレーダー風のradial bar chart（円形の棒グラフ）で表示する
// items: 24件の配列（インデックス=時）。各要素は { hour, sum または count, avg?, max?, min? } を想定
//   - avg/max/min が含まれる場合（期間集計）：ホバー時に日平均・最大・最小も表示する
//   - 含まれない場合（直近24時間の実データ）：件数のみのシンプルな表示
// opts.size: SVGの一辺のサイズ（省略時380）
// opts.color: バーの塗り色（CSS色。省略時は金色テーマ）
// opts.strokeColor / opts.gridColor: バー枠線・目盛り円の色（省略時は金色テーマに合わせた値）
function buildHourlyRadialChart(items, opts) {
  opts = opts || {};
  const pad2 = (n) => String(n).padStart(2, '0');
  const getValue = (it) => (it.sum !== undefined ? it.sum : (it.count || 0));

  if (!Array.isArray(items) || items.length < 24 || !items.some(it => getValue(it) > 0)) {
    return '<div class="statsEmptyHint">この期間の時間帯データはまだありません</div>';
  }

  const barColor = opts.color || 'var(--gold)';
  const barStroke = opts.strokeColor || 'rgba(212,175,106,0.55)';
  const gridStroke = opts.gridColor || 'rgba(212,175,106,0.16)';

  const size = opts.size || 380;
  const center = size / 2;
  // ラベル分の余白（時刻ラベル+数字ラベルの高さを見込んで center から一定量を必ず確保する）
  const labelMargin = Math.max(56, size * 0.17);
  const innerR = size * 0.135;
  const maxBarLen = center - labelMargin - innerR;
  const maxVal = Math.max(1, ...items.map(getValue));
  const stepDeg = 360 / 24;
  const gapDeg = 1.4;
  const toRad = (deg) => (deg * Math.PI) / 180;

  // 目盛りの同心円＋その概数ラベル（右上45°方向に配置し、時刻ラベルと重ならないようにする）
  let gridHtml = '';
  [0.33, 0.66, 1].forEach(frac => {
    const r = innerR + maxBarLen * frac;
    gridHtml += `<circle cx="${center}" cy="${center}" r="${r.toFixed(1)}" fill="none" stroke="${gridStroke}" stroke-width="1"/>`;
    const gv = roundToNiceNumber(maxVal * frac);
    const gx = center + r * Math.cos(toRad(-45));
    const gy = center + r * Math.sin(toRad(-45));
    gridHtml += `<text x="${gx.toFixed(1)}" y="${gy.toFixed(1)}" font-size="11.5" fill="#8894ab" text-anchor="middle" dominant-baseline="middle">${gv}</text>`;
  });

  let barsHtml = '';
  let labelsHtml = '';
  let valueLabelsHtml = '';
  for (let h = 0; h < 24; h++) {
    const it = items[h] || {};
    const val = getValue(it);
    const outerR = innerR + (val / maxVal) * maxBarLen;
    const startAngle = -90 + h * stepDeg + gapDeg / 2;
    const endAngle = -90 + (h + 1) * stepDeg - gapDeg / 2;
    const midAngle = -90 + h * stepDeg + stepDeg / 2;

    const x1 = center + innerR * Math.cos(toRad(startAngle));
    const y1 = center + innerR * Math.sin(toRad(startAngle));
    const x2 = center + outerR * Math.cos(toRad(startAngle));
    const y2 = center + outerR * Math.sin(toRad(startAngle));
    const x3 = center + outerR * Math.cos(toRad(endAngle));
    const y3 = center + outerR * Math.sin(toRad(endAngle));
    const x4 = center + innerR * Math.cos(toRad(endAngle));
    const y4 = center + innerR * Math.sin(toRad(endAngle));
    const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;
    const opacity = (0.32 + (val / maxVal) * 0.68).toFixed(2);

    let tooltip = `${pad2(h)}:00 — ${val}件`;
    if (it.avg !== undefined) {
      tooltip += ` / 日平均 ${it.avg}件 / 最大 ${it.max}件 / 最小 ${it.min}件`;
    }

    barsHtml += `<path class="statsRadialBar" data-tooltip="${escapeAttr(tooltip)}" d="M${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)} A${outerR.toFixed(1)},${outerR.toFixed(1)} 0 ${largeArc} 1 ${x3.toFixed(1)},${y3.toFixed(1)} L${x4.toFixed(1)},${y4.toFixed(1)} A${innerR.toFixed(1)},${innerR.toFixed(1)} 0 ${largeArc} 0 ${x1.toFixed(1)},${y1.toFixed(1)} Z" fill="${barColor}" fill-opacity="${opacity}" stroke="${barStroke}" stroke-width="0.5" style="cursor:pointer;"></path>`;

    // バーの値をバー先端のすぐ外側に表示
    if (val > 0) {
      const vr = outerR + 13;
      const vx = center + vr * Math.cos(toRad(midAngle));
      const vy = center + vr * Math.sin(toRad(midAngle));
      valueLabelsHtml += `<text x="${vx.toFixed(1)}" y="${vy.toFixed(1)}" font-size="12.5" fill="${barColor}" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${val}</text>`;
    }

    // 時刻ラベル（3時間おき・"00:00"形式。0時・12時も必ず含まれる）
    if (h % 3 === 0) {
      const labelR = innerR + maxBarLen + 26;
      const lx = center + labelR * Math.cos(toRad(midAngle));
      const ly = center + labelR * Math.sin(toRad(midAngle));
      labelsHtml += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="13" fill="#9aa5c0" text-anchor="middle" dominant-baseline="middle">${pad2(h)}:00</text>`;
    }
  }

  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="display:block; overflow:visible;">
    ${gridHtml}
    ${barsHtml}
    ${valueLabelsHtml}
    ${labelsHtml}
    <circle cx="${center}" cy="${center}" r="${(innerR - 2).toFixed(1)}" fill="#10182a" stroke="${gridStroke}" stroke-width="1"/>
  </svg>`;
}

// ===== radial bar chart用のホバーツールチップ（SVGネイティブの<title>は表示が遅く見えづらいため、
// カード検索結果のホバープレビュー(11-hover-preview-boot.js)と同様に即時表示するカスタム実装にしている） =====
function showStatsTooltip(text, x, y) {
  let el = document.getElementById('statsRadialTooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'statsRadialTooltip';
    el.style.cssText = 'position:fixed; z-index:3000; pointer-events:none; display:none; padding:6px 11px; font-size:12px; line-height:1.5; color:#f0e6d2; background:rgba(10,14,24,0.96); border:1px solid rgba(212,175,106,0.55); border-radius:6px; box-shadow:0 8px 22px rgba(0,0,0,0.5); white-space:nowrap;';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.display = 'block';
  positionStatsTooltip(x, y);
}
function positionStatsTooltip(x, y) {
  const el = document.getElementById('statsRadialTooltip');
  if (!el) return;
  const margin = 14;
  const rect = el.getBoundingClientRect();
  let left = x + margin, top = y + margin;
  if (left + rect.width > window.innerWidth) left = x - rect.width - margin;
  if (top + rect.height > window.innerHeight) top = window.innerHeight - rect.height - margin;
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}
function hideStatsTooltip() {
  const el = document.getElementById('statsRadialTooltip');
  if (el) el.style.display = 'none';
}
function bindStatsRadialTooltips(container) {
  container.querySelectorAll('.statsRadialBar[data-tooltip]').forEach(el => {
    el.addEventListener('mouseenter', (e) => showStatsTooltip(el.dataset.tooltip, e.clientX, e.clientY));
    el.addEventListener('mousemove', (e) => positionStatsTooltip(e.clientX, e.clientY));
    el.addEventListener('mouseleave', hideStatsTooltip);
  });
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
    const hourlyStats = data.hourlyStats || [];
    const recentHourly = data.recentHourly || [];

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

      <div class="statsSection">
        <h3>推移グラフ</h3>
        <div class="statsChartsRow">
          <div class="statsChartCol">
            <div class="hint" style="margin-bottom:10px;">詳細表示（クリック数）の推移</div>
            <div class="statsChartLegend">
              ${viewSeries.map(s => `<span><span class="statsLegendDot" style="background:${s.color};"></span>${escapeAttr(s.label)}</span>`).join('')}
            </div>
            <div class="statsChartWrap">${buildDailyTrendChart(dailyTotals, viewSeries)}</div>
          </div>
          <div class="statsChartCol">
            <div class="hint" style="margin-bottom:10px;">その他の項目の推移</div>
            <div class="statsChartLegend">
              ${otherSeries.map(s => `<span><span class="statsLegendDot" style="background:${s.color};"></span>${escapeAttr(s.label)}</span>`).join('')}
            </div>
            <div class="statsChartWrap">${buildDailyTrendChart(dailyTotals, otherSeries)}</div>
          </div>
        </div>
      </div>

      <div class="statsSection">
        <h3>時間帯別アクセス数</h3>
        <div class="statsRadialRow">
          <div class="statsRadialCol">
            <h4>期間中のアクセス数（時間帯別）</h4>
            <div class="statsRadialNote">バーにカーソルを合わせると日平均・最大・最小を表示します</div>
            <div class="statsRadialSvgWrap">${buildHourlyRadialChart(hourlyStats, { size: 400 })}</div>
          </div>
          <div class="statsRadialCol">
            <h4>直近24時間のアクセス数</h4>
            <div class="statsRadialNote">期間の絞り込みによらず常に直近24時間を表示します</div>
            <div class="statsRadialSvgWrap">${buildHourlyRadialChart(recentHourly, { size: 400, color: '#5fb3e8', strokeColor: 'rgba(95,179,232,0.6)', gridColor: 'rgba(95,179,232,0.18)' })}</div>
          </div>
        </div>
      </div>

      <div class="statsSection">
        <h3>端末・ブラウザ内訳（期間内）</h3>
        <div class="statsBreakdownRowWrap" style="margin-top:0;">
          <div class="statsBreakdownCol">
            <div class="hint" style="margin-bottom:10px;">端末別</div>
            ${buildBreakdownList(deviceBreakdown)}
          </div>
          <div class="statsBreakdownCol">
            <div class="hint" style="margin-bottom:10px;">ブラウザ別</div>
            ${buildBreakdownList(browserBreakdown)}
          </div>
        </div>
      </div>

      <div class="statsSection">
        <h3>カードランキング <span class="hint" style="display:inline;">（行クリックでそのカードの編集画面に移動）</span></h3>
        <div class="statsRankingRowWrap">
          <div class="statsRankingCol">
            <div class="hint">人気ランキング（全期間・閲覧+お気に入り+ダウンロード順・上位30件）</div>
            ${buildRankingTable(cardRanking)}
          </div>
          <div class="statsRankingCol">
            <div class="hint">ダウンロードランキング（全期間・上位30件）</div>
            ${buildDownloadRankingTable(downloadRanking)}
          </div>
        </div>
      </div>
    `;

    bindStatsRankingClicks(contentEl);
    bindStatsRadialTooltips(contentEl);
  } catch (err) {
    contentEl.innerHTML = `<div class="statsEmptyHint">取得エラー: ${escapeAttr(err.message)}</div>`;
  }
}

document.getElementById('statsRefreshBtn').addEventListener('click', loadStats);
document.getElementById('statsSetFilter').addEventListener('change', loadStats);
document.getElementById('statsDaysFilter').addEventListener('change', loadStats);

// ===== 「今すぐログを集計」：eventsシートに溜まっている古いログを今すぐ集計シートへロールアップする =====
document.getElementById('statsRollupNowBtn').addEventListener('click', async () => {
  const gasUrl = getCfg('gas');
  if (!gasUrl) { alert('先に①でGAS Web App URLを設定してください'); return; }
  if (!confirm('eventsシートに現在あるログを、日数に関わらず今すぐ全て集計シートへまとめ、eventsシートから削除します。よろしいですか？')) return;

  const btn = document.getElementById('statsRollupNowBtn');
  const statusEl2 = document.getElementById('statsRollupStatus');
  btn.disabled = true;
  btn.textContent = '集計中...';
  statusEl2.style.display = 'none';
  try {
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'rollupNow' })
    });
    const json = await res.json();
    if (json.error) {
      alert('集計に失敗しました: ' + json.error);
    } else if (json.rolledUp === 0) {
      statusEl2.textContent = '集計対象のログはありませんでした（eventsシートは空です）';
      statusEl2.style.display = 'inline';
    } else {
      statusEl2.textContent = `${json.rolledUp}件のログを集計しました（eventsシートの残り: ${json.remaining}件）`;
      statusEl2.style.display = 'inline';
      await loadStats(); // 集計結果を画面に反映
    }
  } catch (err) {
    alert('集計中にエラーが発生しました: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '今すぐログを集計';
  }
});

// ===== 左サイドバーのアイコンから統計オーバーレイ（画面の95%サイズ）を開閉 =====
function openStatsOverlay() {
  document.getElementById('statsOverlay').classList.add('open');
  loadStats();
}
function closeStatsOverlay() {
  document.getElementById('statsOverlay').classList.remove('open');
}
document.getElementById('statsSidebarBtn').addEventListener('click', openStatsOverlay);
document.getElementById('statsOverlayCloseBtn').addEventListener('click', closeStatsOverlay);
document.getElementById('statsOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'statsOverlay') closeStatsOverlay();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('statsOverlay').classList.contains('open')) closeStatsOverlay();
});
