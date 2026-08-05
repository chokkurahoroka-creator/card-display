const RATING_LABELS_BY_TYPE = {
  '推しホロメン': { hp: 'ライフ', power: 'SP・ステージ', speed: '推しスキル', stamina: '革新性', luck: '初心者お勧め度', potential: '将来性' },
  'サポート':     { hp: 'コスト', power: 'パワー', speed: '汎用性', stamina: '革新性', luck: null, potential: '将来性' },
  'ホロメン':     { hp: 'HP', power: '基本パワー', speed: '最大パワー', stamina: '継戦力', luck: '安定力', potential: '将来性' }
};
const RATING_KEYS = ['hp', 'power', 'speed', 'stamina', 'luck', 'potential'];

// レーダーチャートのラベルが枠からはみ出さないよう、既知のラベルは自然な位置で改行する
// （未知のラベルが来た場合は文字数で機械的に2分割するフォールバックを使用）
const RADAR_LABEL_BREAKS = {
  'ライフ': ['ライフ'],
  'SP・ステージ': ['SP', 'ステージ'],
  '推しスキル': ['推し', 'スキル'],
  '革新性': ['革新性'],
  '初心者お勧め度': ['初心者', 'お勧め度'],
  '将来性': ['将来性'],
  'コスト': ['コスト'],
  'パワー': ['パワー'],
  '汎用性': ['汎用性'],
  'HP': ['HP'],
  '基本パワー': ['基本', 'パワー'],
  '最大パワー': ['最大', 'パワー'],
  '継戦力': ['継戦力'],
  '安定力': ['安定力']
};
function wrapRadarLabel(label) {
  if (!label) return [''];
  if (RADAR_LABEL_BREAKS[label]) return RADAR_LABEL_BREAKS[label];
  if (label.length <= 4) return [label];
  const mid = Math.ceil(label.length / 2);
  return [label.slice(0, mid), label.slice(mid)];
}

function getRatingCategory(cardTypeStr) {
  const t = cardTypeStr || '';
  if (t.indexOf('推しホロメン') !== -1) return '推しホロメン';
  if (t.indexOf('サポート') !== -1) return 'サポート';
  return 'ホロメン'; // ホロメン／Buzzホロメンなど、それ以外は現行の項目セットを使用
}

// カードタイプに応じて、実際にレーダーチャートへ表示する項目（キー・ラベル）だけを返す
function getActiveRatingItems(cardType) {
  const labels = RATING_LABELS_BY_TYPE[getRatingCategory(cardType)] || RATING_LABELS_BY_TYPE['ホロメン'];
  return RATING_KEYS.filter(k => labels[k] !== null).map(k => ({ key: k, label: labels[k] }));
}

// 項目数がカードタイプによって異なる（5〜6項目）ため、合計・平均に加えて
// 「10段階の相対評価点」を算出する（平均点(5点満点)を単純に2倍して10点満点に換算）
function computeRatingSummaryFromValues(rating, cardType) {
  const items = getActiveRatingItems(cardType);
  let sum = 0, enteredCount = 0;
  items.forEach(it => {
    const raw = rating ? rating[it.key] : undefined;
    if (raw !== '' && raw !== undefined && raw !== null) {
      const v = Number(raw);
      if (!isNaN(v)) { sum += v; enteredCount++; }
    }
  });
  const totalItems = items.length;
  const maxSum = totalItems * 5;
  const avg = enteredCount > 0 ? sum / enteredCount : 0;
  const score10 = enteredCount > 0 ? (avg / 5) * 10 : 0;
  return { sum, enteredCount, totalItems, maxSum, avg, score10 };
}

function buildRadarChartSvg(rating, cardType) {
  const items = getActiveRatingItems(cardType);
  const maxVal = 5;
  const size = 260; // 表示サイズ(220x220)はCSSのwidth/height属性で維持しつつ、
                     // 内部座標系を広めに取ることでラベル用の余白を確保する
  const center = size / 2;
  const radius = size / 2 - 46;
  const angleStep = (Math.PI * 2) / items.length;

  const pointAt = (frac, i) => {
    const angle = -Math.PI / 2 + i * angleStep;
    const r = frac * radius;
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)];
  };

  let gridHtml = '';
  [0.25, 0.5, 0.75, 1].forEach(frac => {
    const pts = items.map((it, i) => pointAt(frac, i).join(',')).join(' ');
    gridHtml += `<polygon points="${pts}" fill="none" stroke="rgba(212,175,106,0.18)" stroke-width="1"/>`;
  });

  let axisHtml = '';
  let labelHtml = '';
  items.forEach((it, i) => {
    const [x2, y2] = pointAt(1, i);
    axisHtml += `<line x1="${center}" y1="${center}" x2="${x2}" y2="${y2}" stroke="rgba(212,175,106,0.22)" stroke-width="1"/>`;
    const [lx, ly] = pointAt(1.28, i);
    const lines = wrapRadarLabel(it.label);
    const lineHeight = 12;
    const startDy = -((lines.length - 1) * lineHeight) / 2 + 4;
    const tspans = lines.map((line, li) => `<tspan x="${lx}" dy="${li === 0 ? startDy : lineHeight}">${escapeHtml(line)}</tspan>`).join('');
    labelHtml += `<text x="${lx}" y="${ly}" font-size="11" fill="#c9d1e0" text-anchor="middle">${tspans}</text>`;
  });

  const dataPts = items.map((it, i) => {
    const val = Math.min(maxVal, Math.max(0, Number(rating[it.key]) || 0));
    return pointAt(val / maxVal, i).join(',');
  }).join(' ');

  return `<svg viewBox="0 0 ${size} ${size}" width="220" height="220">
    ${gridHtml}
    ${axisHtml}
    <polygon points="${dataPts}" fill="rgba(212,175,106,0.35)" stroke="#d4af6a" stroke-width="2"/>
    ${labelHtml}
  </svg>`;
}

