function navigate(delta) {
  if (navIndex === -1 || !navList.length) return;
  const newIndex = (navIndex + delta + navList.length) % navList.length;
  openModal(navList[newIndex]);
}

async function downloadCurrentImage() {
  if (navIndex === -1) return;
  const c = navList[navIndex];
  logStatEvent('download', c); // 統計用：画像ダウンロードを記録
  try {
    const res = await fetch(c.imageUrl);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = `${c.setCode || ''}-${c.cardNumber || c.slot}_${(c.cardName || 'card').replace(/[^\w\-一-龠ぁ-んァ-ヶ]/g,'')}.png`;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('画像のダウンロードに失敗しました: ' + e.message);
  }
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.getElementById('modalPrev').style.display = 'none';
  document.getElementById('modalNext').style.display = 'none';
  navIndex = -1;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

init();
