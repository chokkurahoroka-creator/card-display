// ===== 弾(sets)管理 =====
let defaultSetCode = '';
let selectedPackImageFile = null; // 弾保存時にアップロードするパック画像（未選択ならnull）

// ===== パック画像アイコン付きの弾選択ドロップダウン =====
// 既存の<select id="activeSet">はそのままvalue/changeイベントを使い続け、
// 見た目だけをアイコン付きのカスタムリストに差し替える。
// sel.valueを他の箇所（09-gallery.jsなど）から直接変更した場合は、
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
    ? `<img class="iconSelectImg" src="${iconMap[code]}" alt="">`
    : `<span class="iconSelectImg">📦</span>`;
  const current = list.find(s => s.setCode === sel.value);

  wrap.innerHTML = `
    <button type="button" class="iconSelectBtn">
      ${current ? iconHtml(current.setCode) : ''}
      <span class="iconSelectBtnText">${current ? `${current.setCode}（${current.setName}）` : '選択してください'}</span>
      <span class="iconSelectCaret">▾</span>
    </button>
    <div class="iconSelectList" style="display:none;">
      ${list.map(s => `
        <div class="iconSelectItem${s.setCode === sel.value ? ' active' : ''}" data-code="${s.setCode}">
          ${iconHtml(s.setCode)}
          <span>${s.setCode}（${s.setName}）</span>
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

// 選択中のパック画像をボタンの見た目に反映（弾コード入力欄が既存の弾と一致する場合はプレビューも表示）
document.getElementById('set_pack_image').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  selectedPackImageFile = file;
  const reader = new FileReader();
  reader.onload = () => {
    const previewEl = document.getElementById('set_pack_image_preview');
    previewEl.src = reader.result;
    previewEl.style.display = 'inline-block';
  };
  reader.readAsDataURL(file);
});

// ===== 既存の弾（パック）を選んで編集 =====
let editingSetCode = null; // 編集中の弾コード（nullなら新規作成モード）

function loadSetForEdit(s) {
  editingSetCode = s.setCode;
  document.getElementById('set_code').value = s.setCode;
  document.getElementById('set_code').disabled = true; // 誤って弾コードを変更すると別パックとして新規作成されてしまうため編集中はロック
  document.getElementById('set_name').value = s.setName || '';
  document.getElementById('set_new').value = s.totalNew || 0;
  document.getElementById('set_rerun').value = s.totalRerun || 0;
  document.getElementById('set_parallel').value = s.totalParallel || 0;

  selectedPackImageFile = null;
  document.getElementById('set_pack_image').value = '';
  const previewEl = document.getElementById('set_pack_image_preview');
  if (s.packImageUrl) {
    previewEl.src = s.packImageUrl;
    previewEl.style.display = 'inline-block';
  } else {
    previewEl.style.display = 'none';
    previewEl.src = '';
  }

  updateSetEditModeUI();
  document.querySelector('.panelSet').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearSetForm() {
  editingSetCode = null;
  document.getElementById('set_code').value = '';
  document.getElementById('set_code').disabled = false;
  document.getElementById('set_name').value = '';
  document.getElementById('set_new').value = '';
  document.getElementById('set_rerun').value = '';
  document.getElementById('set_parallel').value = '';
  selectedPackImageFile = null;
  document.getElementById('set_pack_image').value = '';
  document.getElementById('set_pack_image_preview').style.display = 'none';
  document.getElementById('set_pack_image_preview').src = '';
  updateSetEditModeUI();
}

function updateSetEditModeUI() {
  const badge = document.getElementById('setEditingBadge');
  const cancelBtn = document.getElementById('setEditCancelBtn');
  const saveBtn = document.getElementById('saveSetBtn');
  if (editingSetCode) {
    badge.textContent = `「${editingSetCode}」を編集中`;
    badge.style.display = 'inline';
    cancelBtn.style.display = 'inline-block';
    saveBtn.textContent = 'この内容で更新する';
  } else {
    badge.style.display = 'none';
    cancelBtn.style.display = 'none';
    saveBtn.textContent = 'この弾を保存';
  }
}
document.getElementById('setEditCancelBtn').addEventListener('click', clearSetForm);

async function refreshSets() {
  const gasUrl = getCfg('gas');
  const [setsRes, defRes] = await Promise.all([
    fetch(gasUrl + '?action=listSets'),
    fetch(gasUrl + '?action=getDefaultSet')
  ]);
  sets = await setsRes.json();
  const defJson = await defRes.json().catch(() => ({}));
  defaultSetCode = defJson.defaultSetCode || '';

  const sel = document.getElementById('activeSet');
  const prevValue = sel.value;
  sel.innerHTML = sets.map(s => `<option value="${s.setCode}">${s.setCode}（${s.setName}）</option>`).join('');
  if (prevValue && sets.some(s => s.setCode === prevValue)) sel.value = prevValue;
  sel.addEventListener('change', renderGallery, { once: false });

  const packIconMap = Object.fromEntries(sets.map(s => [s.setCode, s.packImageUrl]));
  renderIconSelectOptions(sel, sets, packIconMap);

  renderSetStatusTable();
}

function renderSetStatusTable() {
  const tbody = document.querySelector('#setStatusTable tbody');
  tbody.innerHTML = sets.map(s => `
    <tr>
      <td>${s.packImageUrl ? `<img src="${s.packImageUrl}" alt="" style="width:32px;height:32px;object-fit:cover;border-radius:6px;border:1px solid rgba(212,175,106,0.35);">` : '<span style="opacity:0.4;">📦</span>'}</td>
      <td>${s.setCode}</td>
      <td>${s.setName}</td>
      <td><input type="checkbox" class="setStatusCb" data-setcode="${s.setCode}" ${s.status === '公開終了' ? 'checked' : ''}></td>
      <td><input type="radio" name="defaultSetRadio" class="defaultSetRadio" data-setcode="${s.setCode}" ${defaultSetCode === s.setCode ? 'checked' : ''}></td>
      <td><button type="button" class="secondary setEditBtn" data-setcode="${s.setCode}" style="margin-top:0; padding:4px 10px; font-size:12px;">編集</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.setEditBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = sets.find(x => x.setCode === btn.dataset.setcode);
      if (s) loadSetForEdit(s);
    });
  });

  tbody.querySelectorAll('.setStatusCb').forEach(cb => {
    cb.addEventListener('change', async () => {
      const gasUrl = getCfg('gas');
      await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'updateSetStatus',
          setCode: cb.dataset.setcode,
          status: cb.checked ? '公開終了' : '公開中'
        })
      });
      const s = sets.find(x => x.setCode === cb.dataset.setcode);
      if (s) s.status = cb.checked ? '公開終了' : '公開中';
    });
  });

  tbody.querySelectorAll('.defaultSetRadio').forEach(radio => {
    radio.addEventListener('change', async () => {
      const gasUrl = getCfg('gas');
      await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'setDefaultSet', setCode: radio.dataset.setcode })
      });
      defaultSetCode = radio.dataset.setcode;
    });
  });
}

document.getElementById('saveSetBtn').addEventListener('click', async () => {
  const gasUrl = getCfg('gas');
  if (!gasUrl) { alert('先にGAS Web App URLを設定してください'); return; }
  const setCode = document.getElementById('set_code').value.trim();
  if (!setCode) { alert('弾コードを入力してください'); return; }

  const saveBtn = document.getElementById('saveSetBtn');
  // 新しい画像が選ばれていなければ、既存のパック画像URLをそのまま引き継ぐ
  const existing = sets.find(s => s.setCode === setCode);
  let packImageUrl = (existing && existing.packImageUrl) || '';

  if (selectedPackImageFile) {
    const ghUser = getCfg('user'), ghRepo = getCfg('repo'), ghPat = getCfg('pat');
    if (!ghUser || !ghRepo || !ghPat) {
      alert('パック画像をアップロードするには、先に「初期設定」でGitHubの情報を入力してください');
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = 'パック画像をアップロード中...';
    try {
      const packImg = await loadImage(selectedPackImageFile);
      const packDataUrl = cropImageToDataUrl(packImg, { x: 0, y: 0, width: 1, height: 1 }, 400, 0.85);
      const path = `packs/${setCode}.jpg`;
      await uploadToGithub(ghUser, ghRepo, ghPat, path, packDataUrl.split(',')[1]);
      packImageUrl = `https://raw.githubusercontent.com/${ghUser.trim()}/${ghRepo.trim()}/main/${path}`;
    } catch (err) {
      alert('パック画像のアップロードに失敗しました: ' + err.message);
      saveBtn.disabled = false;
      updateSetEditModeUI();
      return;
    }
    saveBtn.disabled = false;
    updateSetEditModeUI();
  }

  const body = {
    action: 'saveSet',
    setCode,
    setName: document.getElementById('set_name').value.trim(),
    totalNew: Number(document.getElementById('set_new').value) || 0,
    totalRerun: Number(document.getElementById('set_rerun').value) || 0,
    totalParallel: Number(document.getElementById('set_parallel').value) || 0,
    packImageUrl
  };
  await fetch(gasUrl, { method:'POST', headers:{'Content-Type':'text/plain'}, body: JSON.stringify(body) });
  const wasEditing = !!editingSetCode;
  clearSetForm();
  await refreshSets();
  document.getElementById('activeSet').value = setCode;
  renderIconSelectOptions(document.getElementById('activeSet'), sets, Object.fromEntries(sets.map(s => [s.setCode, s.packImageUrl])));
  await renderGallery();
  await onTypeChange();
  alert(wasEditing ? '弾を更新しました' : '弾を保存しました');
});

