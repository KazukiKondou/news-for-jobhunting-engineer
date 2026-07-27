// RSS / sitemap.xml / robots.txt。いずれもDBの記事レコードから組み立てる。

import { escapeHtml } from '../util.js';
import { ORIGIN, SITE_NAME } from './layout.js';

const DESCRIPTION = 'Web系・IT系事業会社志望のエンジニア就活生のための日次ニュース。';

/** 記事の掲載日を配信時刻(07:00 JST)としてRFC822にする。 */
function pubDate(date) {
  return new Date(`${date}T07:00:00+09:00`).toUTCString();
}

/** RSSのdescriptionはプレーンテキストにする (<strong>は落とす)。 */
function toPlainText(html) {
  return String(html ?? '').replace(/<[^>]*>/g, '');
}

export function renderRss(articles) {
  const items = articles
    .map((article) => {
      const url = `${ORIGIN}/${article.date}/#article-${article.position}`;
      return `    <item>
      <title>${escapeHtml(article.title)}</title>
      <link>${escapeHtml(url)}</link>
      <guid isPermaLink="false">${escapeHtml(article.slug)}</guid>
      <pubDate>${pubDate(article.date)}</pubDate>
      <source url="${escapeHtml(article.source_url)}">${escapeHtml(article.source_name)}</source>
      <description>${escapeHtml(toPlainText(article.summary))}</description>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${SITE_NAME}</title>
    <link>${ORIGIN}/</link>
    <description>${DESCRIPTION}</description>
    <language>ja</language>
    <atom:link href="${ORIGIN}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}

const STATIC_PAGES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/archive/', changefreq: 'daily', priority: '0.7' },
  { path: '/ranking/', changefreq: 'daily', priority: '0.6' },
  { path: '/updates/', changefreq: 'monthly', priority: '0.4' },
];

/** dates は昇順の日付一覧 (queries.listDates と同じ並び)。 */
export function renderSitemap(dates) {
  const newest = dates.at(-1);

  const staticUrls = STATIC_PAGES.map(
    (page) => `  <url>
    <loc>${ORIGIN}${page.path}</loc>${newest ? `\n    <lastmod>${newest}</lastmod>` : ''}
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
  );

  const dayUrls = [...dates].reverse().map(
    (date) => `  <url>
    <loc>${ORIGIN}/${date}/</loc>
    <lastmod>${date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, ...dayUrls].join('\n')}
</urlset>
`;
}

export function renderRobots() {
  return `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${ORIGIN}/sitemap.xml
`;
}
