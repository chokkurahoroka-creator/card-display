// ===== 設定 =====
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxDQ0iJY8067G9hSLi-u2pvby54EBuhjiPo0inpIaS-8gIiOSEVZmxO8RwHZ00YqlYf/exec';

// ===== アイコン（絵文字ではなく、マテリアルUI風のシンプルな線画アイコンで統一する） =====
// キー: アイコン名、値: <svg>の中身（pathなど）のみ。実際の<svg>タグはcpIcon()が組み立てる
const CP_ICON_PATHS = {
  search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  add: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  addCircle: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  badge: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="12" r="2"/><line x1="14" y1="10" x2="18" y2="10"/><line x1="14" y1="14" x2="18" y2="14"/>',
  warning: '<path d="M12 2L22 20H2Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  palette: '<circle cx="12" cy="12" r="9"/><circle cx="7.5" cy="10" r="1.3"/><circle cx="12" cy="7" r="1.3"/><circle cx="16.5" cy="10" r="1.3"/><circle cx="10" cy="16" r="1.3"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  tune: '<line x1="4" y1="6" x2="14" y2="6"/><circle cx="17" cy="6" r="2"/><line x1="10" y1="12" x2="20" y2="12"/><circle cx="7" cy="12" r="2"/><line x1="4" y1="18" x2="14" y2="18"/><circle cx="17" cy="18" r="2"/>',
  arrowBack: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  chevronRight: '<polyline points="9 6 15 12 9 18"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.8 12.2L20 3"/><path d="M16 7l3 3"/>',
  card: '<rect x="6" y="3" width="12" height="18" rx="2"/>'
};
function cpIcon(name, size) {
  const px = size || 16;
  return `<svg class="cpIconSvg" viewBox="0 0 24 24" width="${px}" height="${px}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${CP_ICON_PATHS[name] || ''}</svg>`;
}

// ===== ユーザーID管理 =====
// ログイン機能は作らず、「XXXX-XXXX」形式のシンプルなIDをブラウザに保持し、これをキーにスプレッドシート側の
// 所持カード・デッキ情報を保存/取得する。別端末で同じ内容を見たい場合は、このIDを手入力してもらう想定。
// 紛らわしい文字（0/O/1/I）は候補から除外し、手入力での間違いを減らしている。
const USER_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateSimpleUserId() {
  let id = '';
  for (let i = 0; i < 8; i++) id += USER_ID_CHARS[Math.floor(Math.random() * USER_ID_CHARS.length)];
  return id.slice(0, 4) + '-' + id.slice(4);
}
function isValidUserIdFormat(v) {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test((v || '').trim().toUpperCase());
}

// 初回訪問時はここで自動生成はせず、cpIsFirstVisitフラグを見て
// 17-cardpool-boot.js側で「新規IDを作成」／「既存のIDを入力」を選ばせるオンボーディングを表示する
let userId = localStorage.getItem('cardpool_userId') || '';
const cpIsFirstVisit = !userId;

// userIdを更新してlocalStorageへ保存する。保存後に読み直して実際に反映されたかを確認し、
// 失敗していればfalseを返す（プライベートブラウジング等でストレージが使えない場合の保険）
function cpSaveUserId(newId) {
  userId = newId;
  try {
    localStorage.setItem('cardpool_userId', newId);
    return localStorage.getItem('cardpool_userId') === newId;
  } catch (e) {
    return false;
  }
}

// ===== 共通ユーティリティ =====
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function cardKey(c) { return `${c.setCode}__${c.type}__${c.slot}`; }

// 通信がまれに応答なく固まった場合の保険として、タイムアウト付きでfetchするヘルパー。
// 「読み込み中」のまま画面が固まってしまう不具合の対策として、一定時間で必ず失敗扱いにする
async function cpFetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 20000);
  try {
    return await fetch(url, Object.assign({}, options || {}, { signal: controller.signal }));
  } finally {
    clearTimeout(timer);
  }
}

// カード情報のキャッシュ（所持カード一覧・デッキ編集の両方で同じカードを何度も取得しないための共有キャッシュ）
const collectionCardsCache = {};

// 複数カードをキー配列（"setCode__type__slot"形式）でまとめて取得し、collectionCardsCacheへ格納する。
// GASへの通信は1回あたり数百ms〜かかるため、カードを1枚ずつ個別にfetchすると所持枚数が多いほど
// 表示が遅くなる（N回の往復が直列に発生する）。GAS側の action=getCardsByKeys（バッチ取得用）を
// まとめて1回だけ呼ぶことで、この待ち時間をほぼ1回分に短縮する。
// ※ GAS側にaction=getCardsByKeysが無い場合（未反映時）は自動的に個別取得へフォールバックする
// ※ 通信が固まって「読み込み中」から進まなくなる不具合の対策として、各fetchにタイムアウトを設定している
async function cpFetchCardsByKeys(keys) {
  const uncached = [...new Set((keys || []).filter(Boolean))].filter(k => !collectionCardsCache[k]);
  if (!uncached.length) return;
  try {
    const res = await cpFetchWithTimeout(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'getCardsByKeys', keys: uncached })
    }, 20000);
    const json = await res.json();
    if (Array.isArray(json)) {
      json.forEach(c => { if (c) collectionCardsCache[cardKey(c)] = c; });
      return;
    }
    // GAS側が未対応（invalid action等）の場合は個別取得にフォールバック
    if (json && json.error) throw new Error(json.error);
  } catch (e) {
    await Promise.all(uncached.map(async (key) => {
      if (collectionCardsCache[key]) return;
      const [setCode, type, slot] = key.split('__');
      try {
        const r = await cpFetchWithTimeout(GAS_URL + `?action=getCard&setCode=${encodeURIComponent(setCode)}&type=${encodeURIComponent(type)}&slot=${encodeURIComponent(slot)}`, {}, 15000);
        const card = await r.json();
        if (card) collectionCardsCache[key] = card;
      } catch (e2) { /* 取得失敗時はスキップ（該当カードは表示から欠ける） */ }
    }));
  }
}

// データ取得中に表示する共通のローディング表示（スピナー＋メッセージ）
function cpLoadingHtml(msg) {
  return `<div class="cpHint"><span class="cpSpinner"></span>${escapeHtml(msg || '読み込み中...')}</div>`;
}

// ===== カード画像の拡大表示（デッキ内容プレビュー等でカードをタップした時に使用） =====
function cpShowImageZoom(url) {
  if (!url) return;
  document.getElementById('cpImageZoomImg').src = url;
  document.getElementById('cpImageZoomOverlay').classList.add('open');
}
function cpCloseImageZoom() {
  document.getElementById('cpImageZoomOverlay').classList.remove('open');
}
document.getElementById('cpImageZoomOverlay').addEventListener('click', cpCloseImageZoom);

// ===== スマホ表示：カード一覧の枠を、下部固定タブバーの上端まで届くように動的に調整する =====
// 画面上部にある要素（検索欄・切替ボタン・ID/未所持カードパネルの開閉状態など）によって
// 使える縦幅がその都度変わるため、固定のvh指定ではなく実際のレイアウトから逆算して高さを設定する。
// カードが1枚も無い（読み込み中・空の状態）場合は、CSS側の自動サイズ調整に任せて何もしない
const CP_FIT_GRID_SELECTORS = ['#cpOwnedListGrid', '#cpOwnedGrid', '#cpSearchGrid', '#cpZukanGrid', '#cpDeckSections', '#cpDeckSourceGrid', '#cpDeckSearchResults'];
function cpFitVisibleGridHeights() {
  if (window.innerWidth > 640) return; // スマホ表示時のみ
  const tabBar = document.querySelector('.cpTabs');
  const tabBarHeight = tabBar ? tabBar.getBoundingClientRect().height : 0;
  CP_FIT_GRID_SELECTORS.forEach(sel => {
    const el = document.querySelector(sel);
    if (!el || el.offsetParent === null) return; // 非表示中の枠は計算しない
    if (!el.querySelector('.cpCard')) { el.style.height = ''; return; } // 空の枠はCSS側の自動サイズに任せる
    const rect = el.getBoundingClientRect();
    const available = window.innerHeight - rect.top - tabBarHeight - 10;
    el.style.height = Math.max(160, Math.round(available)) + 'px';
  });
}
let cpFitGridHeightsTimer = null;
function cpScheduleFitGridHeights() {
  clearTimeout(cpFitGridHeightsTimer);
  cpFitGridHeightsTimer = setTimeout(cpFitVisibleGridHeights, 60);
}
window.addEventListener('resize', cpScheduleFitGridHeights);
window.addEventListener('orientationchange', cpScheduleFitGridHeights);
