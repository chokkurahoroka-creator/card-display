// ===== 設定 =====
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxDQ0iJY8067G9hSLi-u2pvby54EBuhjiPo0inpIaS-8gIiOSEVZmxO8RwHZ00YqlYf/exec';

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

let userId = localStorage.getItem('cardpool_userId');
if (!userId) {
  userId = generateSimpleUserId();
  localStorage.setItem('cardpool_userId', userId);
}

// ===== 共通ユーティリティ =====
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function cardKey(c) { return `${c.setCode}__${c.type}__${c.slot}`; }

// カード情報のキャッシュ（所持カード一覧・デッキ編集の両方で同じカードを何度も取得しないための共有キャッシュ）
const collectionCardsCache = {};
