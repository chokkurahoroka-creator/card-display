const SKILL_BANNER_MAP = { 'コラボエフェクト': 'collabo', 'ブルームエフェクト': 'bloom', 'ギフト': 'gift' };
const YELL_ICON_MAP = { '白': 'white', '赤': 'red', '青': 'blue', '緑': 'green', '紫': 'purple', '黄': 'yellow', '無色': 'colorless' };
const YELL_COLOR_CSS = { '赤': '#e53935', '白': '#f5f5f5', '青': '#2196f3', '緑': '#4caf50', '紫': '#7c4dff', '黄': '#ffca28', '無色': '#9e9e9e' };

function yellIconHtml(color, count) {
  const n = Math.max(1, Number(count) || 1);
  return Array.from({ length: n }).map(() => {
    const assetKey = YELL_ICON_MAP[color];
    const imgSrc = assetKey ? CARD_ASSETS[assetKey] : null;
    const inner = imgSrc
      ? `<img src="${imgSrc}" alt="${escapeHtml(color)}">`
      : `<span class="yellFallback" style="background:${YELL_COLOR_CSS[color] || '#888'}"></span>`;
    return `<span class="yellIconWrap">${inner}</span>`;
  }).join('');
}

// テキスト中の数字を太字で強調する（escape済みテキストに対して適用）
function boldNumbers(escapedText) {
  return escapedText.replace(/(\d+)/g, '<strong class="numHighlight">$1</strong>');
}

// Google Sheets側の書式（テキスト'1'/チェックボックスtrue/文字列'TRUE'など）の違いを吸収して判定する
function isFlagTrue(v) {
  return v === '1' || v === 1 || v === true || v === 'TRUE' || v === 'true';
}

// バトンタッチのエールは無色アイコンをアーツと同じ見た目でまとめて表示
function batonHtml(cost) {
  if (cost === undefined || cost === null || cost === '') return '';
  const n = Number(cost) || 0;
  const wrapStyle = 'margin-top:16px; padding-top:12px; border-top:1px dashed rgba(212,175,106,0.25);';
  if (n === 0) return `<div class="modalMeta" style="${wrapStyle}">バトンタッチ: なし</div>`;
  const icons = Array.from({ length: n }).map(() => yellIconHtml('無色', 1)).join('');
  return `<div class="modalMeta" style="${wrapStyle}">バトンタッチ: <span class="yellRow" style="display:inline-flex;vertical-align:middle;">${icons}</span></div>`;
}

const OSHI_SKILL_GRADIENTS = {
  '推しステージスキル': 'linear-gradient(90deg, #4caf50, #ffd54f)',
  'SP推しスキル': 'linear-gradient(90deg, #7c4dff, #2196f3, #ec4899)',
  '推しスキル': 'linear-gradient(90deg, #ec4899, #9d174d)'
};

// バナー付き固定スキルの技名の色（指定色＋白縁取り）
const SKILL_TITLE_COLOR = { 'コラボエフェクト': '#e53935', 'ブルームエフェクト': '#2196f3', 'ギフト': '#4caf50' };

// 固有スキル名／アーツ名が枠に収まりきらない場合、改行せず文字サイズを縮小して1行に収める
function fitTextToOneLine(el) {
  if (!el) return;
  const baseSize = parseFloat(getComputedStyle(el).fontSize);
  if (!baseSize) return;
  const minSize = Math.max(10, baseSize * 0.45);
  let size = baseSize;
  let guard = 0;
  while (el.scrollWidth > el.clientWidth + 1 && size > minSize && guard < 60) {
    size -= 1;
    el.style.fontSize = size + 'px';
    guard++;
  }
}
function autofitLongTitles(root) {
  if (!root) return;
  root.querySelectorAll('.specialSkillName, .skillTitleInline, .skillTitle, .artsNameText').forEach(fitTextToOneLine);
}

function skillBlockHtml(skill) {
  const bannerKey = SKILL_BANNER_MAP[skill.skillType];
  const isLarge = skill.skillType !== 'エクストラ';
  const textHtml = skill.text ? `<div class="modalAbility${isLarge ? ' skillContentLarge' : ''}">${boldNumbers(escapeHtml((skill.text || '').replace(/\\n/g, '\n')))}</div>` : '';

  if (bannerKey) {
    // バナー画像のある固定スキル（ギフト/コラボエフェクト/ブルームエフェクト）：バナーと技名を横並びに
    const titleColor = SKILL_TITLE_COLOR[skill.skillType] || '#f0e6d2';
    const titleHtml = skill.title ? `<span class="skillTitleInline" style="color:${titleColor};">${escapeHtml(skill.title)}</span>` : '';
    return `<div class="skillBlock">
      <div class="skillBannerRow">
        <img class="skillBannerImg" src="${CARD_ASSETS[bannerKey]}" alt="${escapeHtml(skill.skillType)}">
        ${titleHtml}
      </div>
      ${textHtml}
    </div>`;
  }

  if (skill.skillType === 'エクストラ') {
    // エクストラ：ラベルとスキル内容を横並びで枠囲み
    return `<div class="skillBlock">
      <div class="extraBox">
        <span class="extraLabel">エクストラ</span>
        <span class="extraContent">${boldNumbers(escapeHtml((skill.text || '').replace(/\\n/g, '\n')))}</span>
      </div>
    </div>`;
  }

  if (OSHI_SKILL_GRADIENTS[skill.skillType]) {
    // 推しステージスキル／SP推しスキル／推しスキル：グラデーション枠でラベル＋スキル名を横並び
    return `<div class="skillBlock">
      <div class="specialSkillBox" style="background:${OSHI_SKILL_GRADIENTS[skill.skillType]};">
        <div class="specialSkillInner">
          <span class="specialSkillLabel">${escapeHtml(skill.skillType)}</span>
          ${skill.title ? `<span class="specialSkillName">${escapeHtml(skill.title)}</span>` : ''}
        </div>
      </div>
      ${textHtml}
    </div>`;
  }

  // バナーの無いその他の固有スキル：タグ＋技名＋本文
  const tagHtml = `<div class="tag" style="margin-bottom:6px;">${escapeHtml(skill.skillType || '固有スキル')}</div>`;
  const titleHtml = skill.title ? `<div class="skillTitle">${escapeHtml(skill.title)}</div>` : '';
  return `<div class="skillBlock">${tagHtml}${titleHtml}${textHtml}</div>`;
}

