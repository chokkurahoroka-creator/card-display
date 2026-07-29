// ===== 配信モード（入力画面の表示/非表示） =====
const streamModeToggle = document.getElementById('streamModeToggle');
const inputLayoutEl = document.getElementById('inputLayout');
const pageTitleEl = document.getElementById('pageTitle');
const pageSubEl = document.getElementById('pageSub');
const configBoxEl = document.getElementById('configBox');
function applyStreamMode() {
  const hide = streamModeToggle.checked ? 'none' : '';
  inputLayoutEl.style.display = hide;
  pageTitleEl.style.display = hide;
  pageSubEl.style.display = hide;
  configBoxEl.style.display = hide;
  updateStreamPackTitle();
}

// 配信モード中、一覧画面の上部にタイトルと同サイズで収録パック名を表示する
function updateStreamPackTitle() {
  const el = document.getElementById('streamPackTitle');
  if (!el) return;
  if (!streamModeToggle.checked) { el.style.display = 'none'; return; }
  const setCode = document.getElementById('activeSet').value;
  const cur = sets.find(s => s.setCode === setCode);
  if (cur) {
    el.textContent = `${cur.setCode}（${cur.setName}）`;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}
streamModeToggle.checked = localStorage.getItem('streamMode') === 'true';
applyStreamMode();
streamModeToggle.addEventListener('change', () => {
  localStorage.setItem('streamMode', streamModeToggle.checked ? 'true' : 'false');
  applyStreamMode();
});

async function init() {
  const gasUrl = getCfg('gas');
  if (!gasUrl) return;
  await refreshSets();
  await renderGallery();
}

