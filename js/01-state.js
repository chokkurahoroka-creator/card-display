// ===== 設定読み書き (localStorage) =====
const CFG_KEYS = ['gas','user','repo','pat'];
function loadCfg() {
  CFG_KEYS.forEach(k => {
    const v = localStorage.getItem('cfg_'+k);
    if (v) document.getElementById('cfg_'+k).value = v;
  });
}
function getCfg(k) { return localStorage.getItem('cfg_'+k) || ''; }

// ===== 作業者名（カード登録時に「登録者」として記録する） =====
// 初期設定と同様、入力値はlocalStorageに保存し、次回以降も自動で表示される
const workerNameInput = document.getElementById('worker_name');
if (workerNameInput) {
  workerNameInput.value = localStorage.getItem('workerName') || '';
  workerNameInput.addEventListener('input', () => {
    localStorage.setItem('workerName', workerNameInput.value.trim());
  });
}
function getWorkerName() {
  const el = document.getElementById('worker_name');
  return (el && el.value.trim()) || localStorage.getItem('workerName') || '';
}
document.getElementById('saveCfgBtn').addEventListener('click', () => {
  CFG_KEYS.forEach(k => localStorage.setItem('cfg_'+k, document.getElementById('cfg_'+k).value.trim()));
  alert('設定を保存しました');
  init();
});
loadCfg();

let sets = [];

// setCodeから弾名（パック名）を取得する
function getSetName(setCode) {
  const s = sets.find(x => x.setCode === setCode);
  return s ? s.setName : '';
}
let currentImg = null;
let currentCropBox = null;
let editingCard = null; // 編集中のカード（ギャラリーから選択時にセット）
let editingCardOriginalImageUrl = null; // 画像差し替え機能：更新せずキャンセルした場合に元へ戻すため

