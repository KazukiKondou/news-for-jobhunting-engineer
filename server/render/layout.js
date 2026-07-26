// 全ページ共通の <head> / ヘッダー / フッター。既存の静的HTMLと同じマークアップを保つ。

import { escapeHtml } from '../util.js';

const SITE_NAME = 'エンジニア就活ニュース';
const ORIGIN = 'https://news.kazukikondo.com';
const ASSET_VERSION = 5;

const NAV_ITEMS = [
  { key: 'home', href: '/', label: 'ホーム' },
  { key: 'archive', href: '/archive/', label: 'アーカイブ' },
  { key: 'ranking', href: '/ranking/', label: 'ランキング' },
  { key: 'updates', href: '/updates/', label: 'アップデート' },
];

function renderNav(activeKey) {
  return NAV_ITEMS.map((item) => {
    const active = item.key === activeKey;
    return `<a class="site-nav__link${active ? ' site-nav__link--active' : ''}" href="${item.href}"${
      active ? ' aria-current="page"' : ''
    }>${item.label}</a>`;
  }).join('\n        ');
}

function renderHeader(activeKey) {
  return `  <header class="site-header">
    <div class="site-header__inner">
      <a class="site-logo" href="/">
        <span class="site-logo__badge">N</span>
        <span class="site-logo__title">${SITE_NAME}</span>
      </a>
      <nav class="site-nav">
        ${renderNav(activeKey)}
      </nav>
    </div>
  </header>`;
}

function renderFooter(tagline, updatedLabel) {
  return `  <footer class="site-footer">
    <div class="site-footer__inner">
      <div class="site-footer__main">
        <div class="site-footer__brand">
          <span class="site-logo__badge">N</span>
          ${SITE_NAME}
        </div>
        <div class="site-footer__tagline">${escapeHtml(tagline)}</div>
      </div>
      <div class="site-footer__row">
        <div class="site-footer__meta">
          <span>© 2026 Kazuki Kondo</span>
          <span class="site-footer__sep">·</span>
          <span>毎日更新</span>
          <span class="site-footer__sep">·</span>
          <span>LINE配信と連動</span>
        </div>
        <div class="site-footer__updated">${escapeHtml(updatedLabel)}</div>
      </div>
    </div>
  </footer>`;
}

const DEFAULT_TAGLINE =
  'Web系・IT系事業会社志望のエンジニア就活生のための日次ニュース。LINE配信した記事を毎日まとめて公開しています。';

/**
 * ページ全体のHTMLを組み立てる。
 * body 以外はすべて既存デザインの共通部品。
 */
export function layout({
  title,
  description,
  path,
  body,
  activeNav,
  ogType = 'website',
  headExtra = '',
  bodyEnd = '',
  tagline = DEFAULT_TAGLINE,
  updatedLabel = '',
  noindex = false,
}) {
  const fullTitle = path === '/' ? SITE_NAME : `${title} | ${SITE_NAME}`;
  const canonical = `${ORIGIN}${path}`;

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${canonical}" />
${noindex ? '  <meta name="robots" content="noindex" />\n' : ''}  <meta property="og:type" content="${ogType}" />
  <meta property="og:title" content="${escapeHtml(fullTitle)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:site_name" content="${SITE_NAME}" />
  <meta property="og:locale" content="ja_JP" />
${headExtra}
  <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=Noto+Sans+JP:wght@400;500;700&family=Noto+Serif+JP:wght@700;900&display=swap" />
  <link rel="stylesheet" href="/assets/style.css?v=${ASSET_VERSION}" />
</head>
<body>
${renderHeader(activeNav)}

  <main>
${body}
  </main>

${renderFooter(tagline, updatedLabel)}
${bodyEnd}
</body>
</html>
`;
}

export { SITE_NAME, ORIGIN, ASSET_VERSION };
