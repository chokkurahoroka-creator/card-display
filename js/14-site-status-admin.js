// ===== ページ公開状態（公開/作業中/非公開）の設定 =====
// 一覧ページ（display.html）とカードプール管理ページ（cardpool.html）それぞれについて、
// 公開/作業中/非公開の3状態をGAS側（スクリプトプロパティ）に保存する。
// 各ページ側（js/site-status.js）がこの設定を読み取り、ヘッダーリンクの表示切替や
// メンテナンス中バナーの表示を行う。

async function loadSiteStatus() {
  const gasUrl = getCfg('gas');
  if (!gasUrl) return;
  try {
    const res = await fetch(gasUrl + '?action=getPageStatus');
    const data = await res.json();
    document.getElementById('siteStatusSelect_display').value = data.display || '公開';
    document.getElementById('siteStatusSelect_cardpool').value = data.cardpool || '公開';
  } catch (e) { /* 取得に失敗した場合は既定値（公開）のまま表示しておく */ }
}

function openSiteStatusOverlay() {
  document.getElementById('siteStatusOverlay').classList.add('open');
  document.getElementById('siteStatusSaveStatus').textContent = '';
  loadSiteStatus();
}
function closeSiteStatusOverlay() {
  document.getElementById('siteStatusOverlay').classList.remove('open');
}
document.getElementById('siteStatusSidebarBtn').addEventListener('click', openSiteStatusOverlay);
document.getElementById('siteStatusOverlayCloseBtn').addEventListener('click', closeSiteStatusOverlay);
document.getElementById('siteStatusOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'siteStatusOverlay') closeSiteStatusOverlay();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('siteStatusOverlay').classList.contains('open')) closeSiteStatusOverlay();
});

document.getElementById('siteStatusSaveBtn').addEventListener('click', async () => {
  const gasUrl = getCfg('gas');
  if (!gasUrl) { alert('先に「初期設定」でGAS Web App URLを設定してください'); return; }
  const statusEl = document.getElementById('siteStatusSaveStatus');
  statusEl.textContent = '保存中...';
  const display = document.getElementById('siteStatusSelect_display').value;
  const cardpool = document.getElementById('siteStatusSelect_cardpool').value;
  try {
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'setPageStatus', display, cardpool })
    });
    const json = await res.json();
    statusEl.textContent = json.error ? ('保存に失敗しました: ' + json.error) : '保存しました';
  } catch (e) {
    statusEl.textContent = '保存に失敗しました: ' + e.message;
  }
});
