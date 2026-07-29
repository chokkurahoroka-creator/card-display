// ===== アップロード・解析 =====
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const statusEl = document.getElementById('status');
const fieldsEl = document.getElementById('fields');
const registerBtn = document.getElementById('registerBtn');
const registerBtn2 = document.getElementById('registerBtn2');
const allRegisterBtns = [registerBtn, registerBtn2];

dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => handleFile(e));
document.getElementById('f_type').addEventListener('change', () => onTypeChange());

// ドラッグ&ドロップ対応（AIアップロード欄・手動アップロード欄の両方に適用）
function enableDragAndDrop(zoneEl, fileInputEl, onFileFn) {
  ['dragenter', 'dragover'].forEach(evt => {
    zoneEl.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      zoneEl.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(evt => {
    zoneEl.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      zoneEl.classList.remove('dragover');
    });
  });
  zoneEl.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (!files || !files.length) return;
    fileInputEl.files = files;
    onFileFn({ target: fileInputEl });
  });
}
enableDragAndDrop(dropZone, fileInput, (e) => handleFile(e));

const manualDropZone = document.getElementById('manualDropZone');
const manualFileInputEl = document.getElementById('manualFileInput');
manualDropZone.addEventListener('click', (e) => {
  if (e.target !== manualFileInputEl) manualFileInputEl.click();
});

