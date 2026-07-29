// ===== 配信モード中に一覧からカードを開いた際、評価パラメータ以外のトグルを閉じる =====
function applyStreamModeDetailsCollapse() {
  const otherDetailIds = ['basicDetails', 'skillsDetails', 'artsDetails'];
  if (streamModeToggle.checked) {
    otherDetailIds.forEach(id => { const el = document.getElementById(id); if (el) el.open = false; });
    const ratingEl = document.getElementById('ratingDetails');
    if (ratingEl) ratingEl.open = true;
  } else {
    otherDetailIds.forEach(id => { const el = document.getElementById(id); if (el) el.open = true; });
  }
}

// ===== 編集ポップアップの開閉（②アップロードパネルをポップアップ内に一時移動する） =====
let panelUploadHome = { parent: null, next: null };

function openEditModal() {
  const panel = document.querySelector('.panelUpload');
  panelUploadHome.parent = panel.parentElement;
  panelUploadHome.next = panel.nextElementSibling;
  document.getElementById('editModalFieldsMount').appendChild(panel);

  // ポップアップ内では画像アップロード用の要素は不要なので隠す
  document.getElementById('uploadPanelTitle').style.display = 'none';
  document.getElementById('dropZone').style.display = 'none';
  document.getElementById('manualUploadWrap').style.display = 'none';
  document.getElementById('manualDropZone').style.display = 'none';

  document.getElementById('editModalOverlay').classList.add('open');
}

function closeEditModal() {
  const panel = document.querySelector('.panelUpload');
  if (panelUploadHome.parent) {
    panelUploadHome.parent.insertBefore(panel, panelUploadHome.next);
  }
  document.getElementById('uploadPanelTitle').style.display = '';
  document.getElementById('dropZone').style.display = '';
  document.getElementById('manualUploadWrap').style.display = '';

  document.getElementById('editModalOverlay').classList.remove('open');
}

function exitEditMode() {
  editingCard = null;
  allRegisterBtns.forEach(b => { b.textContent = 'この内容で登録する'; });
  closeEditModal();
}

document.getElementById('editModalCloseBtn').addEventListener('click', () => {
  exitEditMode();
  fieldsEl.style.display = 'none';
  document.getElementById('cropPanel').style.display = 'none';
  setStatus('編集をキャンセルしました。');
});
document.getElementById('editModalDeleteBtn').addEventListener('click', async () => {
  if (!editingCard) return;
  if (!confirm(`「${editingCard.cardName}」を削除しますか？この操作は取り消せません。`)) return;
  const gasUrl = getCfg('gas');
  const btn = document.getElementById('editModalDeleteBtn');
  btn.disabled = true;
  btn.textContent = '削除中...';
  try {
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'deleteCard', setCode: editingCard.setCode, type: editingCard.type, slot: editingCard.slot })
    });
    const json = await res.json().catch(() => ({}));
    if (json.error) {
      alert('削除に失敗しました: ' + json.error);
      return;
    }
    if (json.imageUrl) {
      deleteGithubImageByUrl(json.imageUrl).catch(() => {});
    }
    exitEditMode();
    fieldsEl.style.display = 'none';
    document.getElementById('cropPanel').style.display = 'none';
    setStatus('削除しました。');
    await renderGallery();
  } catch (err) {
    alert('削除中にエラーが発生しました: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🗑 このカードを削除';
  }
});
document.getElementById('editModalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'editModalOverlay') document.getElementById('editModalCloseBtn').click();
});

