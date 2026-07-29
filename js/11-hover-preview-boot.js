// ===== 関連カード検索結果の画像拡大プレビュー =====
// ===== 検索結果・選択済み関連カードのサムネイルを「ホバー」で拡大表示 =====
function showHoverPreview(imageUrl, x, y) {
  let el = document.getElementById('hoverImgPreview');
  if (!el) {
    el = document.createElement('div');
    el.id = 'hoverImgPreview';
    el.style.cssText = 'position:fixed; z-index:3000; pointer-events:none; display:none; border-radius:10px; overflow:hidden; box-shadow:0 12px 34px rgba(0,0,0,0.65); border:1px solid rgba(212,175,106,0.5); background:#10182a;';
    el.innerHTML = '<img id="hoverImgPreviewImg" style="display:block; width:240px; aspect-ratio:5/7; object-fit:cover;">';
    document.body.appendChild(el);
  }
  document.getElementById('hoverImgPreviewImg').src = imageUrl;
  el.style.display = 'block';
  positionHoverPreview(x, y);
}
function positionHoverPreview(x, y) {
  const el = document.getElementById('hoverImgPreview');
  if (!el) return;
  const margin = 18;
  const boxW = 242, boxH = 340;
  let left = x + margin;
  let top = y + margin;
  if (left + boxW > window.innerWidth) left = x - boxW - margin;
  if (top + boxH > window.innerHeight) top = window.innerHeight - boxH - margin;
  if (top < 0) top = margin;
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}
function hideHoverPreview() {
  const el = document.getElementById('hoverImgPreview');
  if (el) el.style.display = 'none';
}
function attachHoverPreview(img, imageUrl) {
  if (!imageUrl) return;
  img.addEventListener('mouseenter', (e) => showHoverPreview(imageUrl, e.clientX, e.clientY));
  img.addEventListener('mousemove', (e) => positionHoverPreview(e.clientX, e.clientY));
  img.addEventListener('mouseleave', hideHoverPreview);
}

function showLinkPreview(imageUrl) {
  if (!imageUrl) return;
  let overlay = document.getElementById('linkPreviewOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'linkPreviewOverlay';
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index:2000; display:flex; align-items:center; justify-content:center; cursor:zoom-out; padding:20px; box-sizing:border-box;';
    overlay.innerHTML = `<img id="linkPreviewImg" style="max-width:96vw; max-height:96vh; width:auto; height:auto; border-radius:14px; box-shadow:0 20px 70px rgba(0,0,0,0.8);">`;
    overlay.addEventListener('click', () => overlay.style.display = 'none');
    document.body.appendChild(overlay);
  }
  document.getElementById('linkPreviewImg').src = imageUrl;
  overlay.style.display = 'flex';
}

// カード編集ポップアップの画像をクリックで拡大表示
document.getElementById('editModalImg').addEventListener('click', (e) => {
  if (e.target.src) showLinkPreview(e.target.src);
});

init();
