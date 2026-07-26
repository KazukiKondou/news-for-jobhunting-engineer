// SQLite の接続・スキーマ・同期。
//
// 役割分担:
//   content/ (git管理)   … 記事本文・修正履歴・アップデート情報。routineが書く「正」のデータ。
//   data/news.db (volume) … 上記を取り込んだもの + 閲覧数/クリック数/評価という実行時データ。
// content/ から同期しても実行時データは消えない。ボリュームを失っても記事は復元できる。

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS days (
  date          TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  intro         TEXT NOT NULL DEFAULT '',
  sections_meta TEXT NOT NULL DEFAULT '[]',
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS articles (
  slug        TEXT PRIMARY KEY,
  date        TEXT NOT NULL,
  position    INTEGER NOT NULL,
  section     TEXT NOT NULL,
  title       TEXT NOT NULL,
  summary     TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url  TEXT NOT NULL,
  tags        TEXT NOT NULL DEFAULT '[]',
  status      TEXT NOT NULL DEFAULT 'published',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(date, position);

-- 記事行を同期で入れ替えてもカウンタが消えないよう別テーブルに分離する。
CREATE TABLE IF NOT EXISTS article_counters (
  slug          TEXT PRIMARY KEY,
  source_clicks INTEGER NOT NULL DEFAULT 0,
  likes         INTEGER NOT NULL DEFAULT 0,
  doubts        INTEGER NOT NULL DEFAULT 0
);

-- 評価の生ログ。「あやしい」をファクトチェック対象として内部で拾うための情報源。
CREATE TABLE IF NOT EXISTS article_feedback (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK(kind IN ('like','doubt')),
  visitor_id  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  reviewed_at TEXT,
  UNIQUE(slug, kind, visitor_id)
);
CREATE INDEX IF NOT EXISTS idx_feedback_review ON article_feedback(kind, reviewed_at);

CREATE TABLE IF NOT EXISTS day_views (
  date  TEXT PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0
);

-- 同一訪問者の同日再訪を二重に数えないための記録。
CREATE TABLE IF NOT EXISTS view_events (
  date       TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  viewed_on  TEXT NOT NULL,
  PRIMARY KEY (date, visitor_id, viewed_on)
);

CREATE TABLE IF NOT EXISTS corrections (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  date         TEXT NOT NULL,
  slug         TEXT,
  kind         TEXT NOT NULL,
  headline     TEXT NOT NULL,
  detail       TEXT NOT NULL DEFAULT '',
  before_text  TEXT,
  after_text   TEXT,
  evidence_url TEXT,
  corrected_on TEXT NOT NULL,
  UNIQUE(date, kind, headline)
);
CREATE INDEX IF NOT EXISTS idx_corrections_date ON corrections(date, corrected_on);

CREATE TABLE IF NOT EXISTS factcheck_runs (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  slug    TEXT NOT NULL,
  ran_on  TEXT NOT NULL,
  verdict TEXT NOT NULL,
  detail  TEXT NOT NULL DEFAULT '',
  action  TEXT NOT NULL DEFAULT '',
  UNIQUE(slug, ran_on)
);

CREATE TABLE IF NOT EXISTS updates (
  id          TEXT PRIMARY KEY,
  released_on TEXT NOT NULL,
  version     TEXT,
  category    TEXT NOT NULL DEFAULT 'feature',
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  items       TEXT NOT NULL DEFAULT '[]'
);
`;

export function openDatabase(file) {
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(SCHEMA);
  return db;
}

export function articleSlug(date, position) {
  return `${date}-${position}`;
}

function readJsonIfExists(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8'));
}

function syncDays(db, contentDir, now) {
  const daysDir = join(contentDir, 'days');
  if (!existsSync(daysDir)) return { days: 0, articles: 0 };

  const files = readdirSync(daysDir).filter((f) => f.endsWith('.json')).sort();

  const upsertDay = db.prepare(`
    INSERT INTO days (date, label, intro, sections_meta, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      label = excluded.label, intro = excluded.intro,
      sections_meta = excluded.sections_meta, updated_at = excluded.updated_at
  `);
  const upsertArticle = db.prepare(`
    INSERT INTO articles (slug, date, position, section, title, summary,
                          source_name, source_url, tags, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      date = excluded.date, position = excluded.position, section = excluded.section,
      title = excluded.title, summary = excluded.summary, source_name = excluded.source_name,
      source_url = excluded.source_url, tags = excluded.tags, status = excluded.status,
      updated_at = excluded.updated_at
  `);
  const ensureCounters = db.prepare('INSERT OR IGNORE INTO article_counters (slug) VALUES (?)');
  const deleteStale = db.prepare(
    'DELETE FROM articles WHERE date = ? AND slug NOT IN (SELECT value FROM json_each(?))'
  );

  let dayCount = 0;
  let articleCount = 0;

  for (const file of files) {
    const day = readJsonIfExists(join(daysDir, file), null);
    if (!day?.date) continue;

    const sectionsMeta = (day.sections ?? []).map((s) => ({
      key: s.key,
      title: s.title,
      intro: s.intro ?? null,
    }));
    upsertDay.run(day.date, day.label ?? day.date, day.intro ?? '', JSON.stringify(sectionsMeta), now);

    const slugs = [];
    for (const section of day.sections ?? []) {
      for (const article of section.articles ?? []) {
        const slug = articleSlug(day.date, article.position);
        slugs.push(slug);
        upsertArticle.run(
          slug, day.date, article.position, section.key,
          article.title, article.summary, article.sourceName, article.sourceUrl,
          JSON.stringify(article.tags ?? []), article.status ?? 'published', now, now
        );
        ensureCounters.run(slug);
        articleCount += 1;
      }
    }
    // JSON から消えた記事はDBからも消す (カウンタは article_counters に残る)。
    deleteStale.run(day.date, JSON.stringify(slugs));
    dayCount += 1;
  }

  return { days: dayCount, articles: articleCount };
}

function syncCorrections(db, contentDir) {
  const rows = readJsonIfExists(join(contentDir, 'corrections.json'), []);
  const insert = db.prepare(`
    INSERT INTO corrections (date, slug, kind, headline, detail, before_text, after_text, evidence_url, corrected_on)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date, kind, headline) DO UPDATE SET
      slug = excluded.slug, detail = excluded.detail, before_text = excluded.before_text,
      after_text = excluded.after_text, evidence_url = excluded.evidence_url,
      corrected_on = excluded.corrected_on
  `);
  for (const row of rows) {
    insert.run(
      row.date, row.slug ?? null, row.kind ?? 'fact_error', row.headline,
      row.detail ?? '', row.before ?? null, row.after ?? null,
      row.evidenceUrl ?? null, row.correctedOn ?? row.date
    );
  }
  return rows.length;
}

function syncFactchecks(db, contentDir) {
  const rows = readJsonIfExists(join(contentDir, 'factchecks.json'), []);
  const insert = db.prepare(`
    INSERT INTO factcheck_runs (slug, ran_on, verdict, detail, action)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(slug, ran_on) DO UPDATE SET
      verdict = excluded.verdict, detail = excluded.detail, action = excluded.action
  `);
  for (const row of rows) {
    insert.run(row.slug, row.ranOn, row.verdict, row.detail ?? '', row.action ?? '');
  }
  return rows.length;
}

function syncUpdates(db, contentDir) {
  const rows = readJsonIfExists(join(contentDir, 'updates.json'), []);
  const insert = db.prepare(`
    INSERT INTO updates (id, released_on, version, category, title, body, items)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      released_on = excluded.released_on, version = excluded.version,
      category = excluded.category, title = excluded.title,
      body = excluded.body, items = excluded.items
  `);
  for (const row of rows) {
    insert.run(
      row.id, row.releasedOn, row.version ?? null, row.category ?? 'feature',
      row.title, row.body ?? '', JSON.stringify(row.items ?? [])
    );
  }
  return rows.length;
}

/** content/ の内容をDBへ取り込む。実行時カウンタには一切触れない。 */
export function syncContent(db, contentDir, now = new Date().toISOString()) {
  db.exec('BEGIN');
  try {
    const { days, articles } = syncDays(db, contentDir, now);
    const corrections = syncCorrections(db, contentDir);
    const factchecks = syncFactchecks(db, contentDir);
    const updates = syncUpdates(db, contentDir);
    db.exec('COMMIT');
    return { days, articles, corrections, factchecks, updates };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
