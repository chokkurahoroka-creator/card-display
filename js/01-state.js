// ===== 設定読み書き (localStorage) =====
const CFG_KEYS = ['gas','user','repo','pat'];
function loadCfg() {
  CFG_KEYS.forEach(k => {
    const v = localStorage.getItem('cfg_'+k);
    if (v) document.getElementById('cfg_'+k).value = v;
  });
}
function getCfg(k) { return localStorage.getItem('cfg_'+k) || ''; }
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

