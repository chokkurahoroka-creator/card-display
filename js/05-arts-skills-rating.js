// ===== ホロメン専用項目（複数アーツ・表示切替） =====
const YELL_COLORS = ['白','赤','青','緑','紫','黄','無色'];

function escapeAttr(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function addYellRowTo(container, color, count) {
  const div = document.createElement('div');
  div.className = 'row';
  div.style.alignItems = 'center';
  div.innerHTML = `
    <div class="field" style="flex:2;">
      <select class="yellColor">${YELL_COLORS.map(c => `<option value="${c}" ${c===color?'selected':''}>${c}</option>`).join('')}</select>
    </div>
    <div class="field" style="flex:1;">
      <input type="number" class="yellCount" min="1" value="${count || 1}">
    </div>
    <div class="field" style="flex:0 0 auto;">
      <button type="button" class="secondary removeYellBtn">×</button>
    </div>
  `;
  div.querySelector('.removeYellBtn').addEventListener('click', () => div.remove());
  container.appendChild(div);
}

function addArtsRow(art) {
  art = art || {};
  const wrap = document.getElementById('artsRows');
  const box = document.createElement('div');
  box.className = 'artsBox';
  box.style.cssText = 'border:1px solid rgba(212,175,106,0.25); border-radius:8px; padding:10px; margin-bottom:10px;';
  box.innerHTML = `
    <div class="row">
      <div class="field"><label>アーツ名</label><input class="artsName" value="${escapeAttr(art.name || '')}"></div>
      <div class="field"><label>ダメージ</label><input class="artsDamage" value="${escapeAttr(art.damage || '')}"></div>
    </div>
    <div class="field">
      <label>エールコスト</label>
      <div class="artsYellRows"></div>
      <button type="button" class="secondary addArtsYellBtn">＋ エール追加</button>
    </div>
    <div class="row">
      <div class="field">
        <label>特攻対象色（あれば）</label>
        <select class="artsSpecialColor">
          <option value="">-</option>
          ${YELL_COLORS.map(c => `<option value="${c}" ${c === art.specialAttackColor ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>特攻ダメージ</label><input class="artsSpecialDamage" value="${escapeAttr(art.specialAttackDamage || '')}" placeholder="例: +30"></div>
    </div>
    <div class="field">
      <label>アーツ効果テキスト</label>
      <textarea class="artsEffect" rows="2" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid rgba(212,175,106,0.3);background:#10182a;color:var(--text);font-size:12px;">${escapeAttr(art.effectText || '')}</textarea>
    </div>
    <button type="button" class="secondary removeArtsBtn">このアーツを削除</button>
  `;
  const yellRowsEl = box.querySelector('.artsYellRows');
  (art.yellCost || []).forEach(y => addYellRowTo(yellRowsEl, y.color, y.count));
  box.querySelector('.addArtsYellBtn').addEventListener('click', () => addYellRowTo(yellRowsEl, '無色', 1));
  box.querySelector('.removeArtsBtn').addEventListener('click', () => box.remove());
  wrap.appendChild(box);
}

function getArtsRows() {
  return Array.from(document.querySelectorAll('#artsRows > .artsBox')).map(box => ({
    name: box.querySelector('.artsName').value,
    damage: box.querySelector('.artsDamage').value,
    yellCost: Array.from(box.querySelectorAll('.artsYellRows > .row')).map(r => ({
      color: r.querySelector('.yellColor').value,
      count: Number(r.querySelector('.yellCount').value) || 1
    })),
    specialAttackColor: box.querySelector('.artsSpecialColor').value,
    specialAttackDamage: box.querySelector('.artsSpecialDamage').value,
    effectText: box.querySelector('.artsEffect').value
  }));
}

function setArtsRows(arr) {
  document.getElementById('artsRows').innerHTML = '';
  (Array.isArray(arr) ? arr : []).forEach(a => addArtsRow(a));
}

document.getElementById('addArtsBtn').addEventListener('click', () => addArtsRow({}));

// Google Sheets側の書式（テキスト'1'/チェックボックスtrue/文字列'TRUE'など）の違いを吸収して判定する
function isFlagTrue(v) {
  return v === '1' || v === 1 || v === true || v === 'TRUE' || v === 'true';
}

const SKILL_TYPES = ['ー', 'コラボエフェクト', 'ブルームエフェクト', 'ギフト', 'エクストラ', '推しスキル', 'SP推しスキル', '推しステージスキル'];

function addSkillRow(skill) {
  skill = skill || {};
  const wrap = document.getElementById('skillsRows');
  const box = document.createElement('div');
  box.className = 'skillBox';
  box.style.cssText = 'border:1px solid rgba(212,175,106,0.25); border-radius:8px; padding:10px; margin-bottom:10px;';
  box.innerHTML = `
    <div class="row">
      <div class="field">
        <label>スキル種別</label>
        <select class="skillType">
          ${SKILL_TYPES.map(t => `<option value="${t}" ${t === skill.skillType ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>スキル名（エクストラルール）</label><input class="skillTitle" value="${escapeAttr(skill.title || '')}" placeholder="例: 団長出陣!"></div>
    </div>
    <div class="field">
      <label>スキル効果テキスト</label>
      <textarea class="skillText" rows="2" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid rgba(212,175,106,0.3);background:#10182a;color:var(--text);font-size:12px;">${escapeAttr(skill.text || '')}</textarea>
    </div>
    <button type="button" class="secondary removeSkillBtn">この固有スキルを削除</button>
  `;
  box.querySelector('.removeSkillBtn').addEventListener('click', () => box.remove());
  wrap.appendChild(box);
}

function getSkillRows() {
  return Array.from(document.querySelectorAll('#skillsRows > .skillBox')).map(box => ({
    skillType: box.querySelector('.skillType').value,
    title: box.querySelector('.skillTitle').value,
    text: box.querySelector('.skillText').value
  }));
}

function setSkillRows(arr) {
  document.getElementById('skillsRows').innerHTML = '';
  (Array.isArray(arr) ? arr : []).forEach(s => addSkillRow(s));
}

document.getElementById('addSkillBtn').addEventListener('click', () => addSkillRow({}));

const RATE_KEYS = ['hp', 'power', 'speed', 'stamina', 'luck', 'potential'];

// ===== 評価パラメータ：カードタイプごとの項目名・使用項目 =====
const RATING_LABELS = {
  '推しホロメン': { hp: 'ライフ', power: 'SP・ステージ', speed: '推しスキル', stamina: '革新性', luck: '初心者お勧め度', potential: '将来性' },
  'サポート':     { hp: 'コスト', power: 'パワー', speed: '汎用性', stamina: '革新性', luck: null, potential: '将来性' },
  'ホロメン':     { hp: 'HP', power: '基本パワー', speed: '最大パワー', stamina: '継戦力', luck: '安定力', potential: '将来性' }
};

function getRatingCategory(cardTypeStr) {
  const t = cardTypeStr || '';
  if (t.indexOf('推しホロメン') !== -1) return '推しホロメン';
  if (t.indexOf('サポート') !== -1) return 'サポート';
  return 'ホロメン'; // ホロメン／Buzzホロメンなど、それ以外は現行の項目名を使用
}

function updateRatingLabels() {
  const labels = RATING_LABELS[getRatingCategory(document.getElementById('f_tag').value)] || RATING_LABELS['ホロメン'];
  RATE_KEYS.forEach(k => {
    const wrapEl = document.getElementById('rateField_' + k);
    const labelEl = document.getElementById('rateLabel_' + k);
    if (!wrapEl) return;
    if (labels[k] === null) {
      wrapEl.style.display = 'none';
    } else {
      wrapEl.style.display = '';
      if (labelEl) labelEl.textContent = labels[k];
    }
  });
}

// ===== 評価パラメータ：インジケータ（0.5刻み、1.0〜5.0の10段階をクリックで選択） =====
// バーは段階が上がるほど背が高くなり、大きさの違いで直感的に水準が分かるようにしている
const RATE_STEPS = 10;
const RATE_STEP_VALUE = 0.5;

function initRatingIndicators() {
  RATE_KEYS.forEach(key => {
    const container = document.getElementById('ratingIndicator_' + key);
    if (!container) return;
    container.innerHTML = '';
    for (let i = 1; i <= RATE_STEPS; i++) {
      const v = i * RATE_STEP_VALUE;
      const seg = document.createElement('span');
      seg.className = 'ratingSeg';
      seg.dataset.value = String(v);
      seg.title = String(v);
      seg.addEventListener('click', () => {
        const input = document.getElementById('rate_' + key);
        if (!input || input.disabled) return;
        input.value = (Number(input.value) === v) ? '' : String(v); // 同じ値を再クリックで解除
        renderRatingIndicator(key);
      });
      container.appendChild(seg);
    }
  });
}

function renderRatingIndicator(key) {
  const input = document.getElementById('rate_' + key);
  const container = document.getElementById('ratingIndicator_' + key);
  const valueEl = document.getElementById('rateValue_' + key);
  if (!input || !container) return;
  const val = Number(input.value) || 0;
  container.classList.toggle('ratingIndicatorDisabled', !!input.disabled);
  Array.from(container.children).forEach(seg => {
    seg.classList.toggle('active', Number(seg.dataset.value) <= val + 0.001); // 浮動小数の誤差対策
  });
  if (valueEl) {
    valueEl.textContent = val > 0 ? String(val) : '-';
    valueEl.classList.toggle('empty', val <= 0);
  }
  updateRatingSummary();
}

function renderAllRatingIndicators() {
  RATE_KEYS.forEach(renderRatingIndicator);
}

function resetRatingFields() {
  RATE_KEYS.forEach(k => { document.getElementById('rate_' + k).value = ''; });
  document.getElementById('rate_comment').value = '';
  renderAllRatingIndicators();
}

function getRatingJson() {
  const rating = {};
  RATE_KEYS.forEach(k => { rating[k] = document.getElementById('rate_' + k).value; });
  const hasAny = Object.values(rating).some(v => v !== '');
  return hasAny ? JSON.stringify(rating) : '';
}

// 項目数がカードタイプによって異なる（推しホロメン/ホロメンは6項目、サポートは5項目）ため、
// 合計・平均に加えて「10段階の相対評価点」（平均点(5点満点)を2倍して10点満点に換算）も算出する
function computeRatingSummary(cardTypeStr) {
  const labels = RATING_LABELS[getRatingCategory(cardTypeStr)] || RATING_LABELS['ホロメン'];
  const activeKeys = RATE_KEYS.filter(k => labels[k] !== null);
  let sum = 0, enteredCount = 0;
  activeKeys.forEach(k => {
    const el = document.getElementById('rate_' + k);
    if (el && el.value !== '') {
      const v = Number(el.value);
      if (!isNaN(v)) { sum += v; enteredCount++; }
    }
  });
  const totalItems = activeKeys.length;
  const maxSum = totalItems * 5;
  const avg = enteredCount > 0 ? sum / enteredCount : 0;
  const score10 = enteredCount > 0 ? (avg / 5) * 10 : 0;
  return { sum, enteredCount, totalItems, maxSum, avg, score10 };
}

function updateRatingSummary() {
  const totalEl = document.getElementById('ratingSummaryTotal');
  const avgEl = document.getElementById('ratingSummaryAvg');
  const score10El = document.getElementById('ratingSummaryScore10');
  if (!totalEl || !avgEl || !score10El) return;
  const summary = computeRatingSummary(document.getElementById('f_tag').value);
  if (summary.enteredCount === 0) {
    totalEl.textContent = '-';
    avgEl.textContent = '-';
    score10El.textContent = '-';
    return;
  }
  totalEl.textContent = `${summary.sum} / ${summary.maxSum}`;
  avgEl.textContent = summary.avg.toFixed(1);
  score10El.textContent = `${summary.score10.toFixed(1)} / 10`;
}

function updateHolomenVisibility() {
  const tagVal = document.getElementById('f_tag').value || '';
  const isHolomen = tagVal.indexOf('ホロメン') !== -1;
  const isSupport = tagVal.indexOf('サポート') !== -1;
  document.getElementById('holomenFields').style.display = isHolomen ? 'block' : 'none';
  const supportFieldsEl = document.getElementById('supportFields');
  if (supportFieldsEl) supportFieldsEl.style.display = isSupport ? 'block' : 'none';
  updateRatingLabels();
  updateRatingSummary();
}
document.getElementById('f_tag').addEventListener('input', updateHolomenVisibility);
initRatingIndicators();

