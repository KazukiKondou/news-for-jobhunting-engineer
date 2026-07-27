// HTTPサーバー。ルーティングと、DBから引いたデータの描画への受け渡しだけを担当する。

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDatabase, syncContent } from './db.js';
import {
  createQueries,
  RANKING_METRICS,
  RANKING_PERIODS,
  DEFAULT_METRIC,
  DEFAULT_PERIOD,
} from './queries.js';
import { parseCookies, serializeCookie, randomVisitorId } from './util.js';
import { layout } from './render/layout.js';
import { renderDayPage } from './render/day.js';
import { renderHomePage, renderArchivePage, RECENT_DAYS } from './render/listings.js';
import { renderRankingPage } from './render/ranking.js';
import { renderUpdatesPage } from './render/updates.js';
import { renderRss, renderSitemap, renderRobots } from './render/feeds.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const PORT = Number(process.env.PORT ?? 8080);
const DB_PATH = process.env.DB_PATH ?? join(ROOT, 'data', 'news.db');
const CONTENT_DIR = process.env.CONTENT_DIR ?? join(ROOT, 'content');
const ASSETS_DIR = join(ROOT, 'site', 'assets');

const DATE_PATH = /^\/(\d{4}-\d{2}-\d{2})\/?$/;
const VISITOR_COOKIE = 'nvid';

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const db = openDatabase(DB_PATH);
const synced = syncContent(db, CONTENT_DIR);
console.log(
  `[news] content synced: ${synced.days}日 / ${synced.articles}記事 / 修正${synced.corrections} / 更新情報${synced.updates}`
);
const queries = createQueries(db);

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

function sendHtml(res, status, html, extraHeaders = {}) {
  send(res, status, html, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache, must-revalidate',
    ...extraHeaders,
  });
}

function sendJson(res, status, payload, extraHeaders = {}) {
  send(res, status, JSON.stringify(payload), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
}

/** 訪問者IDを取り出す。無ければ発行してSet-Cookie値も返す。 */
function resolveVisitor(req) {
  const existing = parseCookies(req.headers.cookie)[VISITOR_COOKIE];
  if (existing) return { visitorId: existing, setCookie: null };

  const visitorId = randomVisitorId();
  return { visitorId, setCookie: serializeCookie(VISITOR_COOKIE, visitorId) };
}

function renderNotFound() {
  return layout({
    title: 'ページが見つかりません',
    description: 'お探しのページは見つかりませんでした。',
    path: '/404',
    activeNav: null,
    noindex: true,
    body: `    <section class="page-head">
      <div class="eyebrow">404</div>
      <h1 class="page-title">ページが見つかりません</h1>
      <p class="page-lead">URLが変わったか、記事が取り下げられた可能性があります。</p>
      <a class="see-all" href="/">最新のニュースへ</a>
    </section>`,
  });
}

async function serveAsset(res, pathname) {
  const relative = normalize(pathname.slice('/assets/'.length)).replace(/^(\.\.[/\\])+/, '');
  const file = join(ASSETS_DIR, relative);
  if (!file.startsWith(ASSETS_DIR)) return sendHtml(res, 403, renderNotFound());

  try {
    const content = await readFile(file);
    return send(res, 200, content, {
      'Content-Type': MIME_TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600, must-revalidate',
    });
  } catch {
    return sendHtml(res, 404, renderNotFound());
  }
}

/** 日カードに載せる見出しを日付ごとにまとめる。 */
function daySummariesWithTitles() {
  const titles = queries.articleTitles();
  return queries.daySummaries().map((day) => ({ ...day, titles: titles.get(day.date) ?? [] }));
}

function handleHome(res, visitor) {
  const latest = queries.latestDate();
  if (!latest) return sendHtml(res, 503, renderNotFound());

  const summaries = daySummariesWithTitles();
  const html = renderHomePage({
    content: queries.dayContent(latest),
    views: queries.recordDayView(latest, visitor.visitorId),
    recentDays: summaries.filter((day) => day.date !== latest).slice(0, RECENT_DAYS),
    correctionCounts: queries.correctionCounts(),
  });
  return sendHtml(res, 200, html);
}

function handleArchive(res) {
  const html = renderArchivePage({
    days: daySummariesWithTitles(),
    correctionCounts: queries.correctionCounts(),
    totals: queries.siteTotals(),
  });
  return sendHtml(res, 200, html);
}

function handleDay(res, date, visitor) {
  const content = queries.dayContent(date);
  if (!content) return sendHtml(res, 404, renderNotFound());

  const dates = queries.listDates();
  const index = dates.indexOf(date);

  const html = renderDayPage({
    content,
    corrections: queries.correctionsForDay(date),
    views: queries.recordDayView(date, visitor.visitorId),
    myFeedback: queries.myFeedbackForDay(visitor.visitorId, date),
    prev: index > 0 ? dates[index - 1] : null,
    next: index >= 0 && index < dates.length - 1 ? dates[index + 1] : null,
  });
  return sendHtml(res, 200, html);
}

function handleRanking(res, url) {
  const requestedMetric = url.searchParams.get('metric');
  const requestedPeriod = url.searchParams.get('period');
  const metric = RANKING_METRICS[requestedMetric] ? requestedMetric : DEFAULT_METRIC;
  const period = RANKING_PERIODS[requestedPeriod] ? requestedPeriod : DEFAULT_PERIOD;

  return sendHtml(res, 200, renderRankingPage({ metric, period, rows: queries.ranking(metric, period) }));
}

/**
 * 「内容があやしい」と報告された記事の一覧。日次routineのファクトチェック入力。
 * どの記事が疑われているかは公開したくないので、トークン必須。
 * FACTCHECK_TOKEN を設定していない環境では無効 (404)。
 */
function handleFactcheckQueue(req, res) {
  const token = process.env.FACTCHECK_TOKEN;
  if (!token) return sendJson(res, 404, { error: 'not_found' });
  if (req.headers['x-factcheck-token'] !== token) return sendJson(res, 401, { error: 'unauthorized' });

  return sendJson(res, 200, { generatedAt: new Date().toISOString(), articles: queries.pendingDoubts() });
}

function handleApi(req, res, url, visitor) {
  if (url.pathname === '/api/factcheck/queue') return handleFactcheckQueue(req, res);

  const match = url.pathname.match(/^\/api\/articles\/([\w-]+)\/(feedback|click)$/);
  if (!match) return sendJson(res, 404, { error: 'not_found' });
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

  const [, slug, action] = match;
  const headers = visitor.setCookie ? { 'Set-Cookie': visitor.setCookie } : {};

  if (action === 'click') {
    const clicks = queries.recordSourceClick(slug);
    if (clicks === null) return sendJson(res, 404, { error: 'unknown_article' }, headers);
    return sendJson(res, 200, { slug, clicks }, headers);
  }

  const kind = url.searchParams.get('kind');
  if (kind !== 'like' && kind !== 'doubt') return sendJson(res, 400, { error: 'bad_kind' }, headers);

  const result = queries.toggleFeedback(slug, kind, visitor.visitorId);
  if (!result) return sendJson(res, 404, { error: 'unknown_article' }, headers);
  return sendJson(res, 200, { slug, ...result }, headers);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const { pathname } = url;
    const visitor = resolveVisitor(req);

    if (pathname.startsWith('/api/')) return handleApi(req, res, url, visitor);
    if (pathname === '/healthz') return sendJson(res, 200, { ok: true, ...queries.siteTotals() });
    if (pathname.startsWith('/assets/')) return serveAsset(res, pathname);

    // クローラー向け。Cookie も Vary: Cookie も付けずに返してCDNに任せる。
    if (pathname === '/robots.txt') {
      return send(res, 200, renderRobots(), {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
      });
    }
    if (pathname === '/sitemap.xml') {
      return send(res, 200, renderSitemap(queries.listDates()), {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      });
    }
    if (pathname === '/feed.xml') {
      return send(res, 200, renderRss(queries.recentArticles()), {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return sendHtml(res, 405, renderNotFound());

    // 末尾スラッシュに正規化して canonical と一致させる。
    if (pathname !== '/' && !pathname.endsWith('/') && !extname(pathname)) {
      return send(res, 301, '', { Location: `${pathname}/` });
    }

    res.setHeader('Vary', 'Cookie');
    if (visitor.setCookie) res.setHeader('Set-Cookie', visitor.setCookie);

    if (pathname === '/') return handleHome(res, visitor);
    if (pathname === '/archive/') return handleArchive(res);
    if (pathname === '/ranking/') return handleRanking(res, url);
    if (pathname === '/updates/') return sendHtml(res, 200, renderUpdatesPage({ updates: queries.listUpdates() }));

    const dateMatch = pathname.match(DATE_PATH);
    if (dateMatch) return handleDay(res, dateMatch[1], visitor);

    return sendHtml(res, 404, renderNotFound());
  } catch (error) {
    console.error('[news] request failed', req.url, error);
    return sendHtml(res, 500, renderNotFound());
  }
});

server.listen(PORT, () => console.log(`[news] listening on :${PORT}`));

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
