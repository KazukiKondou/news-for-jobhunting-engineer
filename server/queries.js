// ページ描画とAPIが使うDB操作をまとめた層。SQLはここにだけ置く。

import { todayInJst, shiftDate } from './util.js';

const ACTIVE = "status <> 'retracted'";

/** ランキングで選べる指標。doubt は公開しない (内部のファクトチェック用途のみ)。 */
export const RANKING_METRICS = {
  clicks: { label: '元記事クリック', unit: 'クリック', column: 'c.source_clicks', scope: 'article' },
  likes: { label: 'いいね', unit: 'いいね', column: 'c.likes', scope: 'article' },
  views: { label: '日別の閲覧数', unit: '閲覧', column: 'v.views', scope: 'day' },
};

export const RANKING_PERIODS = {
  all: { label: '全期間', days: null },
  '30d': { label: '直近30日', days: 30 },
  '7d': { label: '直近7日', days: 7 },
};

function periodCutoff(period) {
  const days = RANKING_PERIODS[period]?.days;
  return days ? shiftDate(todayInJst(), -days) : '0000-01-01';
}

export function createQueries(db) {
  const statements = {
    listDates: db.prepare('SELECT date FROM days ORDER BY date ASC'),
    latestDate: db.prepare('SELECT date FROM days ORDER BY date DESC LIMIT 1'),
    getDay: db.prepare('SELECT * FROM days WHERE date = ?'),
    articlesForDay: db.prepare(`
      SELECT a.*, c.source_clicks, c.likes, c.doubts
      FROM articles a
      LEFT JOIN article_counters c ON c.slug = a.slug
      WHERE a.date = ? AND ${ACTIVE}
      ORDER BY a.position ASC
    `),
    dayView: db.prepare('SELECT views FROM day_views WHERE date = ?'),
    addViewEvent: db.prepare('INSERT OR IGNORE INTO view_events (date, visitor_id, viewed_on) VALUES (?, ?, ?)'),
    bumpDayView: db.prepare(`
      INSERT INTO day_views (date, views) VALUES (?, 1)
      ON CONFLICT(date) DO UPDATE SET views = views + 1
    `),
    daySummaries: db.prepare(`
      SELECT d.date, d.label, d.intro,
             COUNT(a.slug) AS article_count,
             COALESCE(v.views, 0) AS views
      FROM days d
      LEFT JOIN articles a ON a.date = d.date AND a.${ACTIVE}
      LEFT JOIN day_views v ON v.date = d.date
      GROUP BY d.date
      ORDER BY d.date DESC
    `),
    correctionsForDay: db.prepare('SELECT * FROM corrections WHERE date = ? ORDER BY corrected_on DESC, id DESC'),
    correctionCounts: db.prepare('SELECT date, COUNT(*) AS n FROM corrections GROUP BY date'),
    articleBySlug: db.prepare('SELECT slug FROM articles WHERE slug = ?'),
    ensureCounters: db.prepare('INSERT OR IGNORE INTO article_counters (slug) VALUES (?)'),
    bumpClicks: db.prepare('UPDATE article_counters SET source_clicks = source_clicks + 1 WHERE slug = ?'),
    findFeedback: db.prepare('SELECT id FROM article_feedback WHERE slug = ? AND kind = ? AND visitor_id = ?'),
    insertFeedback: db.prepare('INSERT INTO article_feedback (slug, kind, visitor_id, created_at) VALUES (?, ?, ?, ?)'),
    deleteFeedback: db.prepare('DELETE FROM article_feedback WHERE slug = ? AND kind = ? AND visitor_id = ?'),
    recountFeedback: db.prepare(`
      UPDATE article_counters SET
        likes  = (SELECT COUNT(*) FROM article_feedback f WHERE f.slug = ? AND f.kind = 'like'),
        doubts = (SELECT COUNT(*) FROM article_feedback f WHERE f.slug = ? AND f.kind = 'doubt')
      WHERE slug = ?
    `),
    countersFor: db.prepare('SELECT likes, doubts, source_clicks FROM article_counters WHERE slug = ?'),
    myFeedback: db.prepare(`
      SELECT slug, kind FROM article_feedback
      WHERE visitor_id = ? AND slug IN (SELECT slug FROM articles WHERE date = ?)
    `),
    articleTitles: db.prepare(`
      SELECT date, title FROM articles WHERE ${ACTIVE} ORDER BY date DESC, position ASC
    `),
    listUpdates: db.prepare('SELECT * FROM updates ORDER BY released_on DESC, id DESC'),
    // 未レビューの「あやしい」評価。ファクトチェックのキュー。
    pendingDoubts: db.prepare(`
      SELECT a.slug, a.date, a.title, a.source_url, c.doubts,
             MIN(f.created_at) AS first_reported
      FROM article_feedback f
      JOIN articles a ON a.slug = f.slug
      LEFT JOIN article_counters c ON c.slug = a.slug
      WHERE f.kind = 'doubt' AND f.reviewed_at IS NULL
      GROUP BY a.slug
      ORDER BY c.doubts DESC, first_reported ASC
    `),
    markReviewed: db.prepare("UPDATE article_feedback SET reviewed_at = ? WHERE slug = ? AND kind = 'doubt'"),
    siteTotals: db.prepare(`
      SELECT (SELECT COUNT(*) FROM articles WHERE ${ACTIVE}) AS articles,
             (SELECT COUNT(*) FROM days) AS days,
             (SELECT COALESCE(SUM(views), 0) FROM day_views) AS views,
             (SELECT COALESCE(SUM(source_clicks), 0) FROM article_counters) AS clicks
    `),
  };

  function rankArticles(metric, period, limit) {
    // 指標名は RANKING_METRICS の固定値なので、列名の文字列結合に外部入力は混ざらない。
    const column = RANKING_METRICS[metric].column;
    return db
      .prepare(`
        SELECT a.slug, a.date, a.position, a.title, a.source_name, a.source_url, a.section,
               c.source_clicks, c.likes, ${column} AS score
        FROM articles a
        JOIN article_counters c ON c.slug = a.slug
        WHERE a.${ACTIVE} AND a.date >= ? AND ${column} > 0
        ORDER BY score DESC, a.date DESC, a.position ASC
        LIMIT ?
      `)
      .all(periodCutoff(period), limit);
  }

  function rankDays(period, limit) {
    return db
      .prepare(`
        SELECT d.date, d.label, d.intro, v.views AS score,
               (SELECT COUNT(*) FROM articles a WHERE a.date = d.date AND a.${ACTIVE}) AS article_count
        FROM days d
        JOIN day_views v ON v.date = d.date
        WHERE d.date >= ? AND v.views > 0
        ORDER BY score DESC, d.date DESC
        LIMIT ?
      `)
      .all(periodCutoff(period), limit);
  }

  return {
    listDates: () => statements.listDates.all().map((row) => row.date),
    latestDate: () => statements.latestDate.get()?.date ?? null,
    getDay: (date) => statements.getDay.get(date) ?? null,
    daySummaries: () => statements.daySummaries.all(),

    /** 日付 → その日の記事タイトル(position順) のマップ。日カードの見出しに使う。 */
    articleTitles() {
      const map = new Map();
      for (const row of statements.articleTitles.all()) {
        if (!map.has(row.date)) map.set(row.date, []);
        map.get(row.date).push(row.title);
      }
      return map;
    },

    correctionCounts: () => new Map(statements.correctionCounts.all().map((r) => [r.date, r.n])),
    correctionsForDay: (date) => statements.correctionsForDay.all(date),
    listUpdates: () => statements.listUpdates.all().map((row) => ({ ...row, items: JSON.parse(row.items || '[]') })),
    siteTotals: () => statements.siteTotals.get(),
    pendingDoubts: () => statements.pendingDoubts.all(),
    markDoubtsReviewed: (slug) => statements.markReviewed.run(new Date().toISOString(), slug),

    /** 日ページの記事をセクション定義と突き合わせて組み立てる。 */
    dayContent(date) {
      const day = statements.getDay.get(date);
      if (!day) return null;

      const articles = statements.articlesForDay.all(date);
      const meta = JSON.parse(day.sections_meta || '[]');
      const sections = meta
        .map((section) => ({
          ...section,
          articles: articles
            .filter((article) => article.section === section.key)
            .map((article) => ({ ...article, tags: JSON.parse(article.tags || '[]') })),
        }))
        .filter((section) => section.articles.length > 0);

      return { day, sections, count: articles.length };
    },

    /** 同じ訪問者の同日再訪はカウントしない。 */
    recordDayView(date, visitorId) {
      const inserted = statements.addViewEvent.run(date, visitorId, todayInJst());
      if (inserted.changes > 0) statements.bumpDayView.run(date);
      return statements.dayView.get(date)?.views ?? 0;
    },

    myFeedbackForDay(visitorId, date) {
      const map = new Map();
      for (const row of statements.myFeedback.all(visitorId, date)) map.set(row.slug, row.kind);
      return map;
    },

    recordSourceClick(slug) {
      if (!statements.articleBySlug.get(slug)) return null;
      statements.ensureCounters.run(slug);
      statements.bumpClicks.run(slug);
      return statements.countersFor.get(slug)?.source_clicks ?? 0;
    },

    /**
     * 同じボタンをもう一度押したら取り消し。like と doubt は相反するので排他にする。
     * 戻り値の active が押下後の状態 (null なら未評価)。
     */
    toggleFeedback(slug, kind, visitorId) {
      if (!statements.articleBySlug.get(slug)) return null;
      statements.ensureCounters.run(slug);

      const opposite = kind === 'like' ? 'doubt' : 'like';
      const already = statements.findFeedback.get(slug, kind, visitorId);

      if (already) {
        statements.deleteFeedback.run(slug, kind, visitorId);
      } else {
        statements.deleteFeedback.run(slug, opposite, visitorId);
        statements.insertFeedback.run(slug, kind, visitorId, new Date().toISOString());
      }
      statements.recountFeedback.run(slug, slug, slug);

      return { ...statements.countersFor.get(slug), active: already ? null : kind };
    },

    ranking(metric, period, limit = 30) {
      return RANKING_METRICS[metric].scope === 'day'
        ? rankDays(period, limit)
        : rankArticles(metric, period, limit);
    },
  };
}
