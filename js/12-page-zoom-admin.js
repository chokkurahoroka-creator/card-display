// ===== ページ全体の擬似ズーム =====
// ブラウザーのネイティブズーム(Ctrl+ +/-、ピンチズーム)はセキュリティ上の理由で
// JavaScriptから検知・制御できないため、CSSのzoomプロパティで見た目・挙動がほぼ同じ
// ズーム機能を独自に実装している（固定表示の要素も含めページ全体が一緒に拡大縮小される）。
// ※ズームボタン自体はズーム対象から除外するため、body直下の既存要素を専用のラッパーdivへ
//   移し替え、htmlやbody自体ではなくそのラッパーにzoomを適用している
(function () {
  const STORAGE_KEY = 'pageZoom_admin';
  const MIN_ZOOM = 70, MAX_ZOOM = 160, STEP = 10, DEFAULT_ZOOM = 100;

  // body直下の既存要素をすべて専用ラッパーに移す（ズームボタンはこの外側に配置する）
  const contentWrapper = document.createElement('div');
  contentWrapper.id = 'zoomableContent';
  document.body.appendChild(contentWrapper);
  while (document.body.firstChild !== contentWrapper) {
    contentWrapper.appendChild(document.body.firstChild);
  }

  function applyZoom(value) {
    contentWrapper.style.zoom = value + '%';
    const label = document.getElementById('zoomLevelText');
    if (label) label.textContent = value + '%';
    localStorage.setItem(STORAGE_KEY, String(value));
  }

  const saved = Number(localStorage.getItem(STORAGE_KEY)) || DEFAULT_ZOOM;
  let current = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, saved));

  const widget = document.createElement('div');
  widget.className = 'pageZoomWidget';
  widget.innerHTML = `
    <button type="button" id="zoomOutBtn" title="縮小">－</button>
    <span id="zoomLevelText">${current}%</span>
    <button type="button" id="zoomInBtn" title="拡大">＋</button>
    <button type="button" id="zoomResetBtn" title="100%に戻す">↺</button>
  `;
  document.body.appendChild(widget); // contentWrapperの外＝ズームの影響を受けない

  applyZoom(current);

  document.getElementById('zoomOutBtn').addEventListener('click', () => {
    current = Math.max(MIN_ZOOM, current - STEP);
    applyZoom(current);
  });
  document.getElementById('zoomInBtn').addEventListener('click', () => {
    current = Math.min(MAX_ZOOM, current + STEP);
    applyZoom(current);
  });
  document.getElementById('zoomResetBtn').addEventListener('click', () => {
    current = DEFAULT_ZOOM;
    applyZoom(current);
  });
})();
