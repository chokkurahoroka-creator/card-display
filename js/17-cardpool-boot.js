// ===== タブ切り替え（所持カード ⇔ マイデッキ） =====
document.querySelectorAll('.cpTabBtn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cpTabBtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.cpTabPanel').forEach(p => p.style.display = 'none');
    document.getElementById('cpTab_' + btn.dataset.tab).style.display = 'block';
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

document.getElementById('cpChangeUserIdBtn').addEventListener('click', async () => {
  const input = (prompt('別の端末で表示されているIDを入力してください（例: K3F9-72QX）\n※この端末に保存されている現在のデータは上書きされず、入力したIDのデータに切り替わります。', '') || '').trim().toUpperCase();
  if (!input) return;
  if (!isValidUserIdFormat(input)) { alert('IDの形式が正しくありません（例: K3F9-72QX）'); return; }

  userId = input;
  localStorage.setItem('cardpool_userId', userId);
  document.getElementById('userIdBox').style.display = 'flex';
  cpRenderUserIdBox();
  await cpInitCollectionTab();
  await cpLoadDecks();
  alert('IDを切り替えました');
});

// ===== 初期化 =====
// 所持カードタブとマイデッキタブの初期読み込みは互いに依存しないため、並列に実行して待ち時間を短縮する。
// ただし「デッキに入っている未所持カード」パネルは所持カードの読み込み完了後の状態が必要なため、
// 両方が完了してから念のためもう一度描画し直す（並列実行の順序次第で古い状態のまま表示され続けるのを防ぐ）
(async function cpInit() {
  cpRenderUserIdBox();
  await Promise.all([cpInitCollectionTab(), cpLoadDecks()]);
  if (typeof cpRenderUnownedDeckCardsPanel === 'function') cpRenderUnownedDeckCardsPanel();
})();
