// ===== 切り抜き位置調整（ドラッグ&リサイズ） =====
const stageImg = document.getElementById('stageImg');
const cropOverlay = document.getElementById('cropOverlay');
const cropHandle = document.getElementById('cropHandle');
const cropStage = document.getElementById('cropStage');

function setCropSliders(box) {
  // オーバーレイの位置・サイズを%で反映
  cropOverlay.style.left = (box.x * 100) + '%';
  cropOverlay.style.top = (box.y * 100) + '%';
  cropOverlay.style.width = (box.width * 100) + '%';
  cropOverlay.style.height = (box.height * 100) + '%';
}

function refreshCropPreview() {
  if (!currentImg) return;
  document.getElementById('cropPreview').innerHTML =
    `<img src="${cropImageToDataUrl(currentImg, currentCropBox)}">`;
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

let dragMode = null; // 'move' | 'resize'
let dragStart = null;

cropOverlay.addEventListener('pointerdown', (e) => {
  if (e.target === cropHandle) return; // ハンドルは別ハンドラ
  dragMode = 'move';
  dragStart = { x: e.clientX, y: e.clientY, box: { ...currentCropBox } };
  cropOverlay.setPointerCapture(e.pointerId);
  e.preventDefault();
});

cropHandle.addEventListener('pointerdown', (e) => {
  dragMode = 'resize';
  dragStart = { x: e.clientX, y: e.clientY, box: { ...currentCropBox } };
  cropHandle.setPointerCapture(e.pointerId);
  e.stopPropagation();
  e.preventDefault();
});

cropStage.addEventListener('pointermove', (e) => {
  if (!dragMode) return;
  const rect = cropStage.getBoundingClientRect();
  const dxPct = (e.clientX - dragStart.x) / rect.width;
  const dyPct = (e.clientY - dragStart.y) / rect.height;

  if (dragMode === 'move') {
    const w = dragStart.box.width, h = dragStart.box.height;
    currentCropBox = {
      x: clamp(dragStart.box.x + dxPct, 0, 1 - w),
      y: clamp(dragStart.box.y + dyPct, 0, 1 - h),
      width: w, height: h
    };
  } else if (dragMode === 'resize') {
    const x = dragStart.box.x, y = dragStart.box.y;
    currentCropBox = {
      x, y,
      width: clamp(dragStart.box.width + dxPct, 0.05, 1 - x),
      height: clamp(dragStart.box.height + dyPct, 0.05, 1 - y)
    };
  }
  setCropSliders(currentCropBox);
});

['pointerup','pointercancel'].forEach(evt => {
  cropStage.addEventListener(evt, () => {
    if (dragMode) { dragMode = null; refreshCropPreview(); }
  });
});

// ===== 連続登録モード =====
// ONの間、登録が成功するたびに「次のカード番号」「次の配置スロット」「区分」を自動計算して保持しておき、
// 次の画像を読み込んだ時点でその値を自動セットする（毎回番号・スロットを手打ちする手間を省く）
const continuousModeToggle = document.getElementById('continuousModeToggle');
let continuousNextNum = null;
let continuousNextSlot = null;
let continuousNextType = null;
if (continuousModeToggle) {
  continuousModeToggle.checked = localStorage.getItem('continuousMode') === 'true';
  continuousModeToggle.addEventListener('change', () => {
    localStorage.setItem('continuousMode', continuousModeToggle.checked ? 'true' : 'false');
    if (!continuousModeToggle.checked) { continuousNextNum = null; continuousNextSlot = null; continuousNextType = null; }
  });
}

// カード番号の末尾の数字だけを+1する（先頭の文字列・ゼロ埋め桁数は維持。例: "038" -> "039"）
function incrementNumberString(str) {
  const s = String(str || '');
  const m = s.match(/^(.*?)(\d+)$/);
  if (!m) return s;
  const digits = m[2];
  const next = String(Number(digits) + 1).padStart(digits.length, '0');
  return m[1] + next;
}

// AIを使わず、画像だけ読み込んで全項目を空欄で手入力させるフロー
async function handleFileManual(e) {
  const file = e.target.files[0];
  if (!file) return;
  exitEditMode();
  fieldsEl.style.display = 'none';
  document.getElementById('cropPanel').style.display = 'none';
  allRegisterBtns.forEach(b => b.style.display = 'none');
  setStatus('画像を読み込み中...（手動入力モード）');

  currentImg = await loadImage(file);
  document.getElementById('previewWrap').innerHTML = `<img src="${currentImg.src}">`;
  document.getElementById('stageImg').src = currentImg.src;

  // 各項目を空欄にリセット
  document.getElementById('f_setcode').value = '';
  document.getElementById('f_num').value = continuousNextNum || '';
  document.getElementById('f_rarity').value = '';
  document.getElementById('f_tag').value = '';
  document.getElementById('f_tags').value = '';
  document.getElementById('f_name').value = '';
  document.getElementById('f_attr').value = '';
  document.getElementById('f_hp').value = '';
  document.getElementById('f_stage').value = '';
  document.getElementById('f_baton').value = '';
  document.getElementById('f_limited').checked = false;
  setArtsRows([]); // ※以前はここが抜けていて、手動登録を繰り返すと前のカードのアーツが残ってしまっていた
  setSkillRows([]);
  resetRatingFields();
  updateHolomenVisibility();

  // 切り抜き枠は画像全体を初期値にしておき、手動で調整してもらう
  currentCropBox = { x: 0, y: 0, width: 1, height: 1 };
  setCropSliders(currentCropBox);
  const croppedDataUrl = cropImageToDataUrl(currentImg, currentCropBox);
  document.getElementById('cropPreview').innerHTML = `<img src="${croppedDataUrl}">`;

  document.getElementById('f_type').value = continuousNextType || '新規';
  clearLinkedCards();
  updateLinkedCardVisibility();
  fieldsEl.style.display = 'block';
  document.getElementById('cropPanel').style.display = 'block';
  allRegisterBtns.forEach(b => b.style.display = 'block');
  await onTypeChange();
  // 連続登録モードで算出しておいた次のスロット番号があれば、自動サジェストより優先して反映する
  if (continuousNextSlot !== null) { document.getElementById('f_slot').value = continuousNextSlot; }
  continuousNextNum = null; continuousNextSlot = null; continuousNextType = null;
  setStatus('画像を読み込みました。全ての項目を手入力し、切り抜き枠を調整してから登録してください。');
}
// 手動アップロード表示中かどうか（登録完了後もこの状態を維持し、AI用ドロップゾーンへ戻さないようにするため）
let manualModeActive = false;

document.getElementById('manualUploadBtn').addEventListener('click', () => {
  manualModeActive = manualDropZone.style.display === 'none';
  manualDropZone.style.display = manualModeActive ? 'flex' : 'none';
  // 手動アップロードを表示している間はAI解析用のドロップゾーンを隠し、誤って両方に触れないようにする
  dropZone.style.display = manualModeActive ? 'none' : 'flex';
});
manualFileInputEl.addEventListener('change', handleFileManual);
enableDragAndDrop(manualDropZone, manualFileInputEl, handleFileManual);

async function handleFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  exitEditMode();
  fieldsEl.style.display = 'none';
  document.getElementById('cropPanel').style.display = 'none';
  allRegisterBtns.forEach(b => b.style.display = 'none');
  setStatus('画像を読み込み中...');

  const base64 = await fileToBase64(file);
  currentImg = await loadImage(file);
  document.getElementById('previewWrap').innerHTML = `<img src="${currentImg.src}">`;
  document.getElementById('stageImg').src = currentImg.src;

  const gasUrl = getCfg('gas');
  if (!gasUrl) { setStatus('エラー: 先に「初期設定」でGAS Web App URLを入力してください'); return; }

  setStatus('AIがカード情報を解析中...');
  try {
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'analyze', imageBase64: base64, mimeType: file.type || 'image/png' })
    });
    const data = await res.json();
    if (data.error) {
      let detailMsg = '';
      if (data.detail) {
        try { detailMsg = '\n詳細: ' + JSON.stringify(data.detail).slice(0, 500); } catch (e) {}
      }
      setStatus('解析エラー: ' + data.error + detailMsg);
      return;
    }

    document.getElementById('f_setcode').value = data.setCode || '';
    // 連続登録モードで次の番号が算出済みなら、AIの読み取り結果より優先する
    document.getElementById('f_num').value = continuousNextNum || data.cardNumber || '';
    document.getElementById('f_rarity').value = data.rarity || '';
    document.getElementById('f_tag').value = data.cardType || '';
    document.getElementById('f_tags').value = data.tags || '';
    document.getElementById('f_name').value = data.cardName || '';
    document.getElementById('f_attr').value = data.attribute || '';
    document.getElementById('f_hp').value = data.hp || '';
    document.getElementById('f_stage').value = data.stage || '';
    document.getElementById('f_baton').value = data.batonTouchCost || '';
    document.getElementById('f_limited').checked = false;
    setArtsRows(data.arts || []);
    setSkillRows(data.skills || []);
    resetRatingFields();
    updateHolomenVisibility();
    currentCropBox = data.cropBox || { x:0, y:0, width:1, height:1 };
    setCropSliders(currentCropBox);

    const croppedDataUrl = cropImageToDataUrl(currentImg, currentCropBox);
    document.getElementById('cropPreview').innerHTML = `<img src="${croppedDataUrl}">`;

    // 読み取ったsetCodeが「①弾の設定」に存在すれば、登録先の弾を自動選択
    let setMismatchNote = '';
    if (data.setCode) {
      const activeSel = document.getElementById('activeSet');
      const match = sets.find(s => s.setCode === data.setCode);
      if (match) {
        activeSel.value = data.setCode;
      } else if (activeSel.value && activeSel.value !== data.setCode) {
        setMismatchNote = `\n※読み取ったセットコード「${data.setCode}」は①に未登録です。登録先の弾を確認してください。`;
      }
    }

    document.getElementById('f_type').value = continuousNextType || '新規';
    clearLinkedCards();
    updateLinkedCardVisibility();
    fieldsEl.style.display = 'block';
    document.getElementById('cropPanel').style.display = 'block';
    allRegisterBtns.forEach(b => b.style.display = 'block');
    await onTypeChange();
    // 連続登録モードで算出しておいた次のスロット番号があれば、自動サジェストより優先して反映する
    if (continuousNextSlot !== null) { document.getElementById('f_slot').value = continuousNextSlot; }
    continuousNextNum = null; continuousNextSlot = null; continuousNextType = null;
    setStatus('解析完了。区分と配置スロットを確認して登録してください。' + setMismatchNote);
  } catch (err) {
    setStatus('通信エラー: ' + err.message);
  }
}

// 区分変更時：新規なら番号から自動サジェスト、再録/パラレルなら空き枠候補をヒント表示（入力は自由）
async function onTypeChange() {
  const type = document.getElementById('f_type').value;
  const setCode = document.getElementById('activeSet').value;
  const slotInput = document.getElementById('f_slot');
  const hint = document.getElementById('slotHint');

  if (!setCode) { hint.textContent = '先に①で弾を選択してください'; return; }

  const gasUrl = getCfg('gas');
  const res = await fetch(gasUrl + `?action=emptySlots&setCode=${encodeURIComponent(setCode)}&type=${encodeURIComponent(type)}`);
  const data = await res.json();

  if (data.error) {
    hint.textContent = 'エラー: ' + data.error;
    return;
  }
  if (data.total === 0) {
    hint.textContent = `⚠ 「①弾の設定」で ${type} の収録枚数が未設定（0枚）です。先に収録枚数を入力して「この弾を保存」を押してください`;
    return;
  }

  if (type === '新規') {
    const numMatch = (document.getElementById('f_num').value || '').match(/(\d+)\s*$/);
    if (numMatch) slotInput.value = Number(numMatch[1]);
    hint.textContent = `新規 全${data.total}枠中 空き: ${data.empty.length ? data.empty.join(', ') : 'なし'}（番号から自動推定していますが、手入力で変更できます）`;
  } else {
    // 追加した順に連番を割り振る（登録済み枚数+1を提案）
    const usedCount = data.total - data.empty.length;
    const nextSeq = usedCount + 1;
    if (nextSeq <= data.total) slotInput.value = nextSeq;
    hint.textContent = `${type} 全${data.total}枠中 登録済み${usedCount}枚。次の枠として${nextSeq <= data.total ? nextSeq : 'なし（満枠）'}を提案しています（手入力で変更可、後から一覧でも編集できます）`;
  }
}

async function handleRegisterClick() {
  const gasUrl = getCfg('gas');
  const setCode = document.getElementById('activeSet').value;
  const type = document.getElementById('f_type').value;
  const slot = document.getElementById('f_slot').value;

  if (!setCode) { alert('①で弾を選択してください'); return; }
  if (!slot) { alert('配置スロット番号が選択されていません。①で収録枚数が正しく設定されているか確認してください'); return; }

  allRegisterBtns.forEach(b => b.disabled = true);

  try {
    let imageUrl;

    if (editingCard) {
      // 編集モード：画像は変更せず既存のものを使い回す
      imageUrl = editingCard.imageUrl;
      setStatus('スプレッドシートを更新中...');

      // 区分または枠番号が変更されていたら、古い行を削除してから新しい内容で登録し直す
      if (editingCard.type !== type || String(editingCard.slot) !== String(slot)) {
        await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ action: 'deleteCard', setCode: editingCard.setCode, type: editingCard.type, slot: editingCard.slot })
        });
      }
    } else {
      const ghUser = getCfg('user'), ghRepo = getCfg('repo'), ghPat = getCfg('pat');
      if (!ghUser || !ghRepo || !ghPat) { alert('先に「初期設定」でGitHubの情報を入力してください'); allRegisterBtns.forEach(b => b.disabled = false); return; }

      setStatus('カード画像をGitHubにアップロード中...');
      const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const safeId = `${setCode}_${type}_${uniqueId}`.replace(/[^a-zA-Z0-9\-_]/g, '_');
      const path = `cards/${safeId}.jpg`;
      const croppedBase64 = cropImageToDataUrl(currentImg, currentCropBox).split(',')[1];

      try {
        await uploadToGithub(ghUser, ghRepo, ghPat, path, croppedBase64);
      } catch (err) {
        throw new Error('【画像アップロード段階】' + err.message);
      }
      imageUrl = `https://raw.githubusercontent.com/${ghUser}/${ghRepo}/main/${path}`;
      setStatus('スプレッドシートに登録中...');
    }

    try {
      // パック内通し番号を計算：新規→スロットそのまま／再録→スロット+新規収録枚数／パラレル→スロット+新規収録枚数+再録収録枚数
      const setInfo = sets.find(s => s.setCode === setCode) || { totalNew: 0, totalRerun: 0 };
      let overallNumber = Number(slot) || 0;
      if (type === '再録') overallNumber = (Number(slot) || 0) + (Number(setInfo.totalNew) || 0);
      else if (type === 'パラレル') overallNumber = (Number(slot) || 0) + (Number(setInfo.totalNew) || 0) + (Number(setInfo.totalRerun) || 0);

      const gasBody = JSON.stringify({
        action: 'addCard',
        setCode, type, slot,
        cardType: document.getElementById('f_tag').value,
        tags: document.getElementById('f_tags').value,
        cardName: document.getElementById('f_name').value,
        attribute: document.getElementById('f_attr').value,
        rarity: document.getElementById('f_rarity').value,
        cardNumber: document.getElementById('f_num').value,
        originalNumber: '',
        hp: document.getElementById('f_hp').value,
        stage: document.getElementById('f_stage').value,
        batonTouchCost: document.getElementById('f_baton').value,
        isLimited: document.getElementById('f_limited').checked ? '1' : '',
        artsJson: JSON.stringify(getArtsRows()),
        skillsJson: JSON.stringify(getSkillRows()),
        ratingJson: getRatingJson(),
        ratingComment: document.getElementById('rate_comment').value,
        linkedCardKey: (type === 'パラレル' || type === '再録') ? linkedCards.map(c => `${c.setCode}__${c.type}__${c.slot}`).join(',') : '',
        syncSourceKey: (syncSourceIdx !== -1 && linkedCards[syncSourceIdx]) ? `${linkedCards[syncSourceIdx].setCode}__${linkedCards[syncSourceIdx].type}__${linkedCards[syncSourceIdx].slot}` : '',
        imageUrl,
        status: editingCard ? editingCard.status : '公開中',
        featured: editingCard ? editingCard.featured : undefined,
        registeredBy: getWorkerName(),
        overallNumber
      });

      let gasRes;
      try {
        gasRes = await fetch(gasUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: gasBody });
      } catch (firstErr) {
        // 一時的な通信エラーの可能性があるため1回だけ再試行
        setStatus('通信エラーのため再試行中...');
        await new Promise(r => setTimeout(r, 1500));
        gasRes = await fetch(gasUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: gasBody });
      }
      const gasJson = await gasRes.json().catch(() => ({}));
      if (gasJson.error) throw new Error(gasJson.error);
    } catch (err) {
      throw new Error(editingCard ? '【更新段階】' + err.message : '【スプレッドシート登録段階】' + err.message + '（画像はGitHubに保存済みです）');
    }

    const doneMsg = (editingCard ? '更新完了: ' : '登録完了: ') + document.getElementById('f_name').value;
    const wasEditing = !!editingCard;

    // 連続登録モード：新規登録（編集ではない）かつトグルONの場合、次のカード番号・配置スロット・区分を
    // 算出して保持しておく。次に画像を読み込んだ時点でhandleFile/handleFileManualがこの値を自動セットする
    const continuousOn = !!(continuousModeToggle && continuousModeToggle.checked) && !wasEditing;
    if (continuousOn) {
      continuousNextType = type;
      continuousNextNum = incrementNumberString(document.getElementById('f_num').value);
      continuousNextSlot = String((Number(slot) || 0) + 1);
    }

    setStatus(continuousOn
      ? `${doneMsg}\n連続登録モード: 次は カード番号「${continuousNextNum}」/ 配置スロット「${continuousNextSlot}」を自動セットします。次のカード画像をアップロードしてください。`
      : doneMsg);
    if (!continuousOn) alert(doneMsg);

    fieldsEl.style.display = 'none';
    document.getElementById('cropPanel').style.display = 'none';
    allRegisterBtns.forEach(b => b.style.display = 'none');
    exitEditMode();
    await renderGallery();
  } catch (err) {
    const errMsg = (editingCard ? '更新エラー: ' : '登録エラー: ') + err.message;
    setStatus(errMsg);
    alert(errMsg);
  } finally {
    allRegisterBtns.forEach(b => b.disabled = false);
  }
}
registerBtn.addEventListener('click', handleRegisterClick);
registerBtn2.addEventListener('click', handleRegisterClick);

