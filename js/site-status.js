// ===== ページ公開状態（公開/作業中/非公開）の反映 =====
// display.html と cardpool.html の両方から読み込まれる共通スクリプト。
// 管理画面（🚧アイコン）でGAS側に保存された状態を取得し、
//  ・非公開に設定されたページへのヘッダーリンクを、両ページのナビから非表示にする
//  ・このページ自身が「作業中」の場合、上部・下部にメンテナンス中バナーを表示する（閲覧自体は通常通り可能）
// 読み込み前に、各HTML側で `const THIS_PAGE_KEY = 'display'` または `'cardpool'` を定義しておくこと。
// GAS_URL は各ページの設定用スクリプト（01-config-state.js / 14-cardpool-config.js）で定義済みの前提。
(async function applySiteStatus() {
  if (typeof GAS_URL === 'undefined' || typeof THIS_PAGE_KEY === 'undefined') return;

  let status;
  try {
    const res = await fetch(GAS_URL + '?action=getPageStatus');
    status = await res.json();
  } catch (e) {
    return; // 取得できない場合は何もせず通常表示のままにする
  }
  if (!status) return;

  // 非公開に設定されているページへのヘッダーリンクを非表示にする（両ページ共通のnav構造から探す）
  const PAGE_HREF = { display: 'display.html', cardpool: 'cardpool.html' };
  Object.keys(PAGE_HREF).forEach(pageKey => {
    if (status[pageKey] !== '非公開') return;
    const link = document.querySelector(`a.siteNavLink[href="${PAGE_HREF[pageKey]}"]`);
    if (link) link.style.display = 'none';
  });

  // このページ自身が「作業中」の場合、上部・下部にスライドするメンテナンス中バナーを表示する
  if (status[THIS_PAGE_KEY] === '作業中') {
    document.body.classList.add('maintenanceMode');
    const bannerItem = '<span class="maintenanceBannerItem">▶ <span class="jp">作業中</span> <span class="en">CAUTION</span> ▶ <span class="en">WORK IN PROGRESS</span></span>';
    const track = Array(16).fill(bannerItem).join(''); // 画面幅より確実に長くなる数だけ繰り返す
    const trackHtml = `<div class="maintenanceBannerTrack">${track}${track}</div>`; // 2倍にして-50%移動時に継ぎ目なくループさせる

    const topBanner = document.createElement('div');
    topBanner.className = 'maintenanceBanner top';
    topBanner.innerHTML = trackHtml;

    const bottomBanner = document.createElement('div');
    bottomBanner.className = 'maintenanceBanner bottom';
    bottomBanner.innerHTML = trackHtml;

    document.body.insertBefore(topBanner, document.body.firstChild);
    document.body.appendChild(bottomBanner);
  }
})();
