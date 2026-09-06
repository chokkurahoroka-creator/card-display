// ===== タブ切り替え（所持カード ⇔ マイデッキ） =====
document.querySelectorAll('.cpTabBtn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cpTabBtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.cpTabPanel').forEach(p => p.style.display = 'none');
    document.getElementById('cpTab_' + btn.dataset.tab).style.display = 'block';
    cpScheduleFitGridHeights();
  });
});

// ===== スマホ表示：2ペイン構成（所持カード⇔検索して追加／デッキ⇔カードを選ぶ）を
//       「切替タブ」で1画面ずつ表示する（900px以下でのみ見た目上有効。PC幅では
//       CSS側で常に両ペインを表示するため、この切替は影響しない） =====
document.querySelectorAll('.cpPaneToggle').forEach(toggleEl => {
  const splitEl = toggleEl.nextElementSibling;
  if (!splitEl || !splitEl.classList.contains('cpCollectionSplit')) return;
  const panes = Array.from(splitEl.children).filter(el => el.classList.contains('cpCollectionPane'));
  const btns = Array.from(toggleEl.querySelectorAll('.cpPaneToggleBtn'));
  if (panes[0]) panes[0].classList.add('cpPaneActive');
  btns.forEach((btn, i) => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      panes.forEach((p, pi) => p.classList.toggle('cpPaneActive', pi === i));
      cpScheduleFitGridHeights();
    });
  });
});

// ===== ユーザーID表示・端末間の切替 =====
function cpRenderUserIdBox() {
  document.getElementById('cpUserIdDisplay').textContent = userId;
}
document.getElementById('cpUserIdToggleBtn').addEventListener('click', () => {
  const box = document.getElementById('userIdBox');
  const isOpen = box.style.display !== 'none';
  box.style.display = isOpen ? 'none' : 'flex';
  cpScheduleFitGridHeights(); // ID欄の開閉で上部の高さが変わるため、グリッドの高さを再計算する
});

document.getElementById('cpCopyUserIdBtn').addEventListener('click', async () => {
  const btn = document.getElementById('cpCopyUserIdBtn');
  const original = btn.textContent;
  try {
    await navigator.clipboard.writeText(userId);
    btn.textContent = 'コピーしました';
  } catch (e) {
    alert('コピーに失敗しました。お手数ですがIDを直接メモしてください: ' + userId);
  }
  setTimeout(() => { btn.textContent = original; }, 1500);
});

document.getElementById('cpChangeUserIdBtn').addEventListener('click', () => {
  document.getElementById('cpChangeIdInput').value = '';
  document.getElementById('cpChangeIdError').style.display = 'none';
  document.getElementById('cpChangeIdOverlay').style.display = 'flex';
});
document.getElementById('cpChangeIdCloseBtn').addEventListener('click', () => {
  document.getElementById('cpChangeIdOverlay').style.display = 'none';
});
document.getElementById('cpChangeIdOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'cpChangeIdOverlay') document.getElementById('cpChangeIdOverlay').style.display = 'none';
});
document.getElementById('cpChangeIdInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('cpChangeIdConfirmBtn').click();
});
document.getElementById('cpChangeIdConfirmBtn').addEventListener('click', async () => {
  const errEl = document.getElementById('cpChangeIdError');
  const input = document.getElementById('cpChangeIdInput').value.trim().toUpperCase();
  if (!isValidUserIdFormat(input)) {
    errEl.textContent = 'IDの形式が正しくありません（例: K3F9-72QX）';
    errEl.style.display = 'block';
    return;
  }
  // 入力されたID（＝他端末のID）をこの端末の保存先として優先的に採用する
  const saved = cpSaveUserId(input);
  if (!saved) {
    errEl.textContent = '保存に失敗しました。ブラウザでこのサイトのデータ保存が許可されているかご確認ください。';
    errEl.style.display = 'block';
    return;
  }
  document.getElementById('cpChangeIdOverlay').style.display = 'none';
  document.getElementById('userIdBox').style.display = 'flex';
  cpRenderUserIdBox();
  await cpInitCollectionTab();
  await cpLoadDecks();
  cpScheduleFitGridHeights();
  alert('IDを切り替えました');
});

// ===== 初回訪問時のオンボーディング（新規IDを作るか、既存のIDを引き継ぐかを選ばせる） =====
document.getElementById('cpIdOnboardNewBtn').addEventListener('click', async () => {
  cpSaveUserId(generateSimpleUserId());
  cpRenderUserIdBox();
  document.getElementById('cpIdOnboardOverlay').style.display = 'none';
  await Promise.all([cpInitCollectionTab(), cpLoadDecks()]);
  if (typeof cpRenderUnownedDeckCardsPanel === 'function') cpRenderUnownedDeckCardsPanel();
  cpScheduleFitGridHeights();
});
document.getElementById('cpIdOnboardExistingBtn').addEventListener('click', () => {
  document.getElementById('cpIdOnboardChoices').style.display = 'none';
  document.getElementById('cpIdOnboardForm').style.display = 'flex';
  document.getElementById('cpIdOnboardInput').focus();
});
document.getElementById('cpIdOnboardInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('cpIdOnboardConfirmBtn').click();
});
document.getElementById('cpIdOnboardBackBtn').addEventListener('click', () => {
  document.getElementById('cpIdOnboardForm').style.display = 'none';
  document.getElementById('cpIdOnboardError').style.display = 'none';
  document.getElementById('cpIdOnboardChoices').style.display = 'flex';
});
document.getElementById('cpIdOnboardConfirmBtn').addEventListener('click', async () => {
  const errEl = document.getElementById('cpIdOnboardError');
  const input = document.getElementById('cpIdOnboardInput').value.trim().toUpperCase();
  if (!isValidUserIdFormat(input)) {
    errEl.textContent = 'IDの形式が正しくありません（例: K3F9-72QX）';
    errEl.style.display = 'block';
    return;
  }
  const saved = cpSaveUserId(input);
  if (!saved) {
    errEl.textContent = '保存に失敗しました。ブラウザでこのサイトのデータ保存が許可されているかご確認ください。';
    errEl.style.display = 'block';
    return;
  }
  cpRenderUserIdBox();
  document.getElementById('cpIdOnboardOverlay').style.display = 'none';
  await Promise.all([cpInitCollectionTab(), cpLoadDecks()]);
  if (typeof cpRenderUnownedDeckCardsPanel === 'function') cpRenderUnownedDeckCardsPanel();
  cpScheduleFitGridHeights();
});

// ===== 初期化 =====
// 所持カードタブとマイデッキタブの初期読み込みは互いに依存しないため、並列に実行して待ち時間を短縮する。
// ただし「デッキに入っている未所持カード」パネルは所持カードの読み込み完了後の状態が必要なため、
// 両方が完了してから念のためもう一度描画し直す（並列実行の順序次第で古い状態のまま表示され続けるのを防ぐ）
(async function cpInit() {
  cpRenderUserIdBox();
  if (cpIsFirstVisit) {
    // 初回訪問時はオンボーディングでIDが決まるまで待ち、以降の読み込みは各ボタンのハンドラ側で行う
    document.getElementById('cpIdOnboardOverlay').style.display = 'flex';
    return;
  }
  await Promise.all([cpInitCollectionTab(), cpLoadDecks()]);
  if (typeof cpRenderUnownedDeckCardsPanel === 'function') cpRenderUnownedDeckCardsPanel();
  cpScheduleFitGridHeights();
})();

// ===== カードグリッド共通：ホバー時に対象カードを拡大し、周辺カードも少し拡大する演出 =====
// 所持カード・図鑑・追加画面・デッキ確認・デッキ編集など、.cpCard（.cpUnownedGalleryCard含む）を
// 使う全てのグリッドに対して、グリッドの再描画（innerHTML差し替え）に関わらず常に効くよう
// document全体へのイベント委任で実装している（個々のカード要素に都度リスナーを張り直す必要が無い）
(function () {
  const CARD_SELECTOR = '.cpCard, .cpUnownedGalleryCard';
  let magnifyContainer = null;

  function clearMagnify() {
    if (!magnifyContainer) return;
    magnifyContainer.querySelectorAll('.cpMagnifyActive, .cpMagnifyNear').forEach(el => {
      el.classList.remove('cpMagnifyActive', 'cpMagnifyNear');
    });
    magnifyContainer = null;
  }

  function applyMagnify(card) {
    const container = card.parentElement;
    if (!container) return;
    clearMagnify();
    magnifyContainer = container;
    card.classList.add('cpMagnifyActive');

    const hoveredRect = card.getBoundingClientRect();
    const hcx = hoveredRect.left + hoveredRect.width / 2;
    const hcy = hoveredRect.top + hoveredRect.height / 2;

    Array.from(container.children).forEach(other => {
      if (other === card || !other.matches(CARD_SELECTOR)) return;
      const rect = other.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = Math.abs(cx - hcx);
      const dy = Math.abs(cy - hcy);
      const sameRow = dy < rect.height * 0.5;
      const sameCol = dx < rect.width * 0.5;
      // 同じ行で左右に隣接、または同じ列で上下に隣接するカードだけを「近傍」として少し拡大する
      const isHorizontalNeighbor = sameRow && dx > 0 && dx < rect.width * 1.6;
      const isVerticalNeighbor = sameCol && dy > 0 && dy < rect.height * 1.6;
      if (isHorizontalNeighbor || isVerticalNeighbor) other.classList.add('cpMagnifyNear');
    });
  }

  document.addEventListener('mouseover', (e) => {
    const card = e.target.closest(CARD_SELECTOR);
    if (!card || card.classList.contains('cpMagnifyActive')) return;
    applyMagnify(card);
  });

  document.addEventListener('mouseout', (e) => {
    const card = e.target.closest(CARD_SELECTOR);
    if (!card) return;
    if (card.contains(e.relatedTarget)) return; // カード内の子要素間の移動は無視
    const nextCard = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(CARD_SELECTOR);
    if (nextCard && nextCard.parentElement === card.parentElement) return; // 同じグリッド内の別カードへ移動した場合はそちらに処理を任せる
    clearMagnify();
  });
})();
