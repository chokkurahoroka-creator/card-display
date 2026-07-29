const RATING_LABELS_BY_TYPE = {
  '推しホロメン': { hp: 'ライフ', power: 'SP・ステージ', speed: '推しスキル', stamina: '革新性', luck: '初心者お勧め度', potential: '将来性' },
  'サポート':     { hp: 'コスト', power: 'パワー', speed: '汎用性', stamina: '革新性', luck: null, potential: '将来性' },
  'ホロメン':     { hp: 'HP', power: '基本パワー', speed: '最大パワー', stamina: '継戦力', luck: '安定力', potential: '将来性' }
};
const RATING_KEYS = ['hp', 'power', 'speed', 'stamina', 'luck', 'potential'];

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

function buildRadarChartSvg(rating, cardType) {
  const items = getActiveRatingItems(cardType);
  const maxVal = 5;
  const size = 220;
  const center = size / 2;
  const radius = size / 2 - 38;
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
    const [lx, ly] = pointAt(1.22, i);
    labelHtml += `<text x="${lx}" y="${ly}" font-size="12" fill="#c9d1e0" text-anchor="middle" dominant-baseline="middle">${it.label}</text>`;
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

