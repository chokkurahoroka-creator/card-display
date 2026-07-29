// ===== 弾(sets)管理 =====
let defaultSetCode = '';

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

  renderSetStatusTable();
}

function renderSetStatusTable() {
  const tbody = document.querySelector('#setStatusTable tbody');
  tbody.innerHTML = sets.map(s => `
    <tr>
      <td>${s.setCode}</td>
      <td>${s.setName}</td>
      <td><input type="checkbox" class="setStatusCb" data-setcode="${s.setCode}" ${s.status === '公開終了' ? 'checked' : ''}></td>
      <td><input type="radio" name="defaultSetRadio" class="defaultSetRadio" data-setcode="${s.setCode}" ${defaultSetCode === s.setCode ? 'checked' : ''}></td>
    </tr>
  `).join('');

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
  const body = {
    action: 'saveSet',
    setCode: document.getElementById('set_code').value.trim(),
    setName: document.getElementById('set_name').value.trim(),
    totalNew: Number(document.getElementById('set_new').value) || 0,
    totalRerun: Number(document.getElementById('set_rerun').value) || 0,
    totalParallel: Number(document.getElementById('set_parallel').value) || 0
  };
  if (!body.setCode) { alert('弾コードを入力してください'); return; }
  await fetch(gasUrl, { method:'POST', headers:{'Content-Type':'text/plain'}, body: JSON.stringify(body) });
  await refreshSets();
  document.getElementById('activeSet').value = body.setCode;
  await renderGallery();
  await onTypeChange();
  alert('弾を保存しました');
});

