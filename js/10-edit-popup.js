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
  // 画像を差し替えたが保存せずにキャンセルした場合、表示中のカードデータを元のURLに戻しておく
  if (editingCard && editingCardOriginalImageUrl && editingCard.imageUrl !== editingCardOriginalImageUrl) {
    editingCard.imageUrl = editingCardOriginalImageUrl;
  }
  editingCard = null;
  editingCardOriginalImageUrl = null;
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

// ===== 登録済みカードの画像差し替え（編集ポップアップの画像下のボタンから） =====
// アップロードした新しい画像をGitHubへ登録し、editingCard.imageUrlとプレビューを差し替える。
// 実際の保存（スプレッドシートへの反映）は、通常通り「この内容で更新する」を押した時点で行われる。
document.getElementById('imageReplaceBtn').addEventListener('click', () => {
  if (!editingCard) return;
  document.getElementById('imageReplaceInput').click();
});

document.getElementById('imageReplaceInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  const input = e.target;
  if (!file || !editingCard) return;

  const ghUser = getCfg('user'), ghRepo = getCfg('repo'), ghPat = getCfg('pat');
  if (!ghUser || !ghRepo || !ghPat) {
    alert('画像を差し替えるには、先に「初期設定」でGitHubの情報を入力してください');
    input.value = '';
    return;
  }

  const btn = document.getElementById('imageReplaceBtn');
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'アップロード中...';
  try {
    const img = await loadImage(file);
    const dataUrl = cropImageToDataUrl(img, { x: 0, y: 0, width: 1, height: 1 }, 900, 0.85);
    const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const path = `cards/${uniqueId}.jpg`;
    await uploadToGithub(ghUser, ghRepo, ghPat, path, dataUrl.split(',')[1]);
    const newUrl = `https://raw.githubusercontent.com/${ghUser.trim()}/${ghRepo.trim()}/main/${path}`;

    editingCard.imageUrl = newUrl;
    document.getElementById('editModalImg').src = newUrl;
    setStatus('画像を差し替えました。「この内容で更新する」を押すと保存されます。');
  } catch (err) {
    alert('画像の差し替えに失敗しました: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
    input.value = '';
  }
});

