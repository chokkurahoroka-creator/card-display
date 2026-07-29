// ===== 登録済み一覧 =====
// raw.githubusercontent.com のURLからpathを逆算してGitHub上の画像を削除
async function deleteGithubImageByUrl(imageUrl) {
  const ghUser = getCfg('user'), ghRepo = getCfg('repo'), ghPat = getCfg('pat');
  if (!ghUser || !ghRepo || !ghPat) return;
  const marker = `raw.githubusercontent.com/${ghUser}/${ghRepo}/main/`;
  const idx = imageUrl.indexOf(marker);
  if (idx === -1) return;
  const path = imageUrl.slice(idx + marker.length);
  const url = `https://api.github.com/repos/${ghUser}/${ghRepo}/contents/${path}`;
  const authHeader = `Bearer ${ghPat.trim()}`;
  const getRes = await fetch(url, { headers: { 'Authorization': authHeader } });
  if (!getRes.ok) return;
  const info = await getRes.json();
  await fetch(url, {
    method: 'DELETE',
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `delete card image: ${path}`, sha: info.sha })
  });
}

// ===== ユーティリティ =====
function setStatus(msg) {
  statusEl.textContent = msg;
  const bottom = document.getElementById('statusBottom');
  if (bottom) bottom.textContent = msg;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function loadImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = URL.createObjectURL(file);
  });
}
// 画像を切り抜いた上で、表示に十分な最大幅(900px)まで縮小し、JPEGで圧縮する。
// 元画像をそのままPNGで扱うと1枚あたり数MBになりがちで、カード枚数が増えるほど
// display.html/admin一覧の読み込みが重くなるため、ここで軽量化しておく。
function cropImageToDataUrl(img, box, maxWidth = 900, quality = 0.85) {
  const x = Math.max(0, box.x) * img.naturalWidth;
  const y = Math.max(0, box.y) * img.naturalHeight;
  const w = Math.min(1 - box.x, box.width) * img.naturalWidth;
  const h = Math.min(1 - box.y, box.height) * img.naturalHeight;

  const scale = w > maxWidth ? maxWidth / w : 1;
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, x, y, w, h, 0, 0, outW, outH);
  return canvas.toDataURL('image/jpeg', quality);
}
async function uploadToGithub(user, repo, pat, path, base64Content) {
  const url = `https://api.github.com/repos/${user.trim()}/${repo.trim()}/contents/${path}`;
  const authHeader = `Bearer ${pat.trim()}`;

  const doPut = (sha) => {
    const payload = { message: `add card image: ${path}`, content: base64Content };
    if (sha) payload.sha = sha;
    return fetch(url, {
      method: 'PUT',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  };

  let res;
  try {
    res = await doPut(null);
  } catch (e) {
    throw new Error('GitHubへの通信自体が失敗しました（Failed to fetch）。GitHubユーザー名・リポジトリ名・トークンに誤りがないか確認してください。詳細: ' + e.message);
  }

  // 既に同名ファイルがある場合（409/422）は、shaを取得して上書き
  if (!res.ok && (res.status === 409 || res.status === 422)) {
    const getRes = await fetch(url, { headers: { 'Authorization': authHeader } });
    if (getRes.ok) {
      const info = await getRes.json();
      res = await doPut(info.sha);
    }
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(`GitHubアップロード失敗 (${res.status}): ${errBody.message || ''}`);
  }
}

document.getElementById('activeSet').addEventListener('change', () => {
  renderGallery();
  onTypeChange();
  if (document.getElementById('galleryPanel').style.display !== 'none') renderGallery();
});

