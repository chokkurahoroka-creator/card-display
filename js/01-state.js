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

// ===== カード番号：数字以外の入力を除去する（末尾のゼロ埋めはそのまま維持） =====
const f_numEl = document.getElementById('f_num');
if (f_numEl) {
  f_numEl.addEventListener('input', () => {
    const cleaned = f_numEl.value.replace(/[^0-9]/g, '');
    if (cleaned !== f_numEl.value) f_numEl.value = cleaned;
  });
}

// ===== カウンター入力（配置スロット・HP・バトンタッチなど）の±ボタン共通処理 =====
// data-target: 対象inputのid、data-step: 1クリックあたりの増減量（HPは10、その他は1）
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.counterBtn');
  if (!btn) return;
  const input = document.getElementById(btn.dataset.target);
  if (!input || input.disabled) return;
  const step = Number(btn.dataset.step) || 1;
  const min = input.min !== '' ? Number(input.min) : -Infinity;
  const current = Number(input.value) || 0;
  const delta = btn.classList.contains('counterPlus') ? step : -step;
  const next = Math.max(min, current + delta);
  input.value = next;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
});

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

