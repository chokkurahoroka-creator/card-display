let searchLogTimer = null; // 統計用：検索イベント記録のデバウンス

// ===== パック画像アイコン付きの弾選択ドロップダウン =====
// 既存の<select>はそのまま(value/change)を使い続け、見た目だけをアイコン付きの
// カスタムリストに差し替える。他の箇所からsel.valueを直接変更した場合は
// このrenderIconSelectOptions()を再度呼べば表示が追従する。
function renderIconSelectOptions(sel, list, iconMap) {
  const wrapId = sel.id + 'IconDropdown';
  let wrap = document.getElementById(wrapId);
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = wrapId;
    wrap.className = 'iconSelectDropdown';
    sel.insertAdjacentElement('afterend', wrap);
    sel.classList.add('iconSelectHiddenNative');
  }
  const iconHtml = (code) => (iconMap && iconMap[code])
    ? `<img class="iconSelectImg" src="${iconMap[code]}" alt="" onerror="this.outerHTML='&lt;span class=&quot;iconSelectImg&quot;&gt;📦&lt;/span&gt;'">`
    : `<span class="iconSelectImg">📦</span>`;
  const current = list.find(s => s.setCode === sel.value);

  wrap.innerHTML = `
    <button type="button" class="iconSelectBtn">
      ${current ? iconHtml(current.setCode) : ''}
      <span class="iconSelectBtnText">${current ? `${escapeHtml(current.setCode)}（${escapeHtml(current.setName)}）` : '選択してください'}</span>
      <span class="iconSelectCaret">▾</span>
    </button>
    <div class="iconSelectList" style="display:none;">
      ${list.map(s => `
        <div class="iconSelectItem${s.setCode === sel.value ? ' active' : ''}" data-code="${escapeHtml(s.setCode)}">
          ${iconHtml(s.setCode)}
          <span>${escapeHtml(s.setCode)}（${escapeHtml(s.setName)}）</span>
        </div>
      `).join('')}
    </div>
  `;

  const btn = wrap.querySelector('.iconSelectBtn');
  const listEl = wrap.querySelector('.iconSelectList');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = listEl.style.display !== 'none';
    document.querySelectorAll('.iconSelectList').forEach(l => l.style.display = 'none');
    listEl.style.display = isOpen ? 'none' : 'block';
  });
  listEl.querySelectorAll('.iconSelectItem').forEach(item => {
    item.addEventListener('click', () => {
      if (sel.value !== item.dataset.code) {
        sel.value = item.dataset.code;
        sel.dispatchEvent(new Event('change'));
      }
      listEl.style.display = 'none';
      renderIconSelectOptions(sel, list, iconMap);
    });
  });
}
document.addEventListener('click', () => {
  document.querySelectorAll('.iconSelectList').forEach(l => l.style.display = 'none');
});

function relocateSearchBar() {
  const searchWrapEl = document.getElementById('searchWrapEl');
  const topBar = document.getElementById('topBar');
  const anchorEl = document.querySelector('.sizeFavGroup');
  if (!searchWrapEl || !topBar || !anchorEl) return;
  if (window.innerWidth <= 640) {
    if (searchWrapEl.parentElement !== topBar) topBar.insertBefore(searchWrapEl, topBar.firstChild);
  } else {
    if (searchWrapEl.parentElement !== anchorEl.parentElement) anchorEl.parentElement.insertBefore(searchWrapEl, anchorEl);
  }
}
window.addEventListener('resize', relocateSearchBar);

async function init() {
  logStatEvent('visit', null); // 統計用：サイトへのアクセスを記録
  relocateSearchBar();
  const [setsRes, defRes] = await Promise.all([
    fetch(GAS_URL + '?action=listSets'),
    fetch(GAS_URL + '?action=getDefaultSet')
  ]);
  const allSets = await setsRes.json();
  const defJson = await defRes.json().catch(() => ({}));
  const adminDefaultSetCode = defJson.defaultSetCode || '';
  const sets = allSets.filter(s => s.status !== '公開終了'); // 公開終了の弾は一覧から除外
  const sel = document.getElementById('setSelect');
  sel.innerHTML = sets.map(s => `<option value="${s.setCode}">${s.setCode}（${s.setName}）</option>`).join('');
  sel.addEventListener('change', () => {
    favViewGroup = null;
    featuredFilterActive = false;
    document.getElementById('featuredFilterBtn').classList.remove('active');
    currentSetCode = sel.value;
    localStorage.setItem('lastViewedSetCode', currentSetCode);
    loadCards();
  });

  if (sets.length) {
    // 表示する弾の優先順位: ①前回自分が見ていた弾 → ②管理画面で設定されたデフォルト → ③最後に登録された弾
    const lastViewed = localStorage.getItem('lastViewedSetCode');
    if (lastViewed && sets.some(s => s.setCode === lastViewed)) {
      currentSetCode = lastViewed;
    } else if (adminDefaultSetCode && sets.some(s => s.setCode === adminDefaultSetCode)) {
      currentSetCode = adminDefaultSetCode;
    } else {
      currentSetCode = sets[sets.length - 1].setCode;
    }
    sel.value = currentSetCode;
  }

  const packIconMap = Object.fromEntries(sets.map(s => [s.setCode, s.packImageUrl]));
  renderIconSelectOptions(sel, sets, packIconMap);

  document.getElementById('searchInput').addEventListener('input', (e) => {
    favViewGroup = null;
    featuredFilterActive = false;
    document.getElementById('featuredFilterBtn').classList.remove('active');
    searchQuery = e.target.value.trim();
    render();

    // 統計用：検索イベントを記録（1文字ごとに送ると多すぎるため、入力が落ち着いてから記録する）
    clearTimeout(searchLogTimer);
    if (searchQuery) {
      searchLogTimer = setTimeout(() => logStatEvent('search', null, searchQuery), 800);
    }
  });

  // お気に入りメニュー
  renderFavMenu();
  const favMenuBtn = document.getElementById('favMenuBtn');
  const favMenu = document.getElementById('favMenu');
  favMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    favMenu.style.display = favMenu.style.display === 'none' ? 'block' : 'none';
  });
  document.addEventListener('click', (e) => {
    if (!favMenu.contains(e.target) && e.target !== favMenuBtn) favMenu.style.display = 'none';
  });
  document.getElementById('favNewGroupBtn').addEventListener('click', () => {
    const name = (prompt('新しいグループ名を入力してください', 'お気に入り') || '').trim();
    if (!name) return;
    if (!favGroups[name]) favGroups[name] = [];
    activeGroup = name;
    saveFavGroups();
    renderFavMenu();
  });
  document.getElementById('favShowAllBtn').addEventListener('click', () => {
    favMenu.style.display = 'none';
    favViewGroup = null;
    render();
  });

  document.getElementById('featuredFilterBtn').addEventListener('click', () => {
    featuredFilterActive = !featuredFilterActive;
    document.getElementById('featuredFilterBtn').classList.toggle('active', featuredFilterActive);
    if (featuredFilterActive) {
      searchQuery = '';
      document.getElementById('searchInput').value = '';
      favViewGroup = null;
    }
    render();
  });

  // カード表示サイズ切替
  const savedSize = localStorage.getItem('cardDisplaySize') || 'medium';
  applyCardSize(savedSize);
  document.querySelectorAll('.sizeToggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      applyCardSize(btn.dataset.size);
      localStorage.setItem('cardDisplaySize', btn.dataset.size);
    });
  });

  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModal();
  });
  document.getElementById('modalPrev').addEventListener('click', () => navigate(-1));
  document.getElementById('modalNext').addEventListener('click', () => navigate(1));
  document.getElementById('modalDownload').addEventListener('click', downloadCurrentImage);
  document.getElementById('modalImg').addEventListener('click', () => showImageZoom(document.getElementById('modalImg').src));
  document.getElementById('imageZoomOverlay').addEventListener('click', () => {
    document.getElementById('imageZoomOverlay').classList.remove('open');
  });
  document.addEventListener('keydown', (e) => {
    if (!document.getElementById('modalOverlay').classList.contains('open')) return;
    if (e.key === 'ArrowLeft') navigate(-1);
    if (e.key === 'ArrowRight') navigate(1);
    if (e.key === 'Escape') closeModal();
  });

  // スワイプで前後のカードに移動
  const modalBoxEl = document.querySelector('.modalBox');
  let swipeStartX = 0, swipeStartY = 0;
  modalBoxEl.addEventListener('touchstart', (e) => {
    if (!e.touches.length) return;
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
  }, { passive: true });
  modalBoxEl.addEventListener('touchend', (e) => {
    if (!e.changedTouches.length) return;
    const dx = e.changedTouches[0].clientX - swipeStartX;
    const dy = e.changedTouches[0].clientY - swipeStartY;
    const SWIPE_THRESHOLD = 50;
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      navigate(dx > 0 ? -1 : 1); // 右にスワイプ→前へ、左にスワイプ→次へ
    }
  }, { passive: true });

  await loadCards();
  await checkForUpdates(); // 現在のバージョンを基準値として記録（この時点では再取得しない）
  setInterval(checkForUpdates, REFRESH_INTERVAL);
}

