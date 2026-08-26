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

// 複数カードをキー配列（"setCode__type__slot"形式）でまとめて取得し、collectionCardsCacheへ格納する。
// GASへの通信は1回あたり数百ms〜かかるため、カードを1枚ずつ個別にfetchすると所持枚数が多いほど
// 表示が遅くなる（N回の往復が直列に発生する）。GAS側の action=getCardsByKeys（バッチ取得用）を
// まとめて1回だけ呼ぶことで、この待ち時間をほぼ1回分に短縮する。
// ※ GAS側にaction=getCardsByKeysが無い場合（未反映時）は自動的に個別取得へフォールバックする
async function cpFetchCardsByKeys(keys) {
  const uncached = [...new Set((keys || []).filter(Boolean))].filter(k => !collectionCardsCache[k]);
  if (!uncached.length) return;
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'getCardsByKeys', keys: uncached })
    });
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
        const r = await fetch(GAS_URL + `?action=getCard&setCode=${encodeURIComponent(setCode)}&type=${encodeURIComponent(type)}&slot=${encodeURIComponent(slot)}`);
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
