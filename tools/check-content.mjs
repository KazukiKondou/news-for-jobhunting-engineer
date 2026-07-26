#!/usr/bin/env node
// content/ の機械的整合性チェック。日次routineがpushする前に流す。
//
//   node tools/check-content.mjs
//
// 静的HTML時代の tools/check-site.py の置き換え。HTMLはDBから生成するようになったので、
// 検証対象は生成元のJSONだけでよくなった。

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'content');

const SECTION_KEYS = new Set(['it', 'thinking', 'other']);
const CORRECTION_KINDS = new Set(['fact_error', 'url_fix', 'retraction', 'clarify']);
const ARTICLE_STATUSES = new Set(['published', 'retracted']);
const VERDICTS = new Set(['ok', 'wrong', 'unverifiable']);
// summary は保存時はプレーンテキストで、描画時に <strong> だけ復元される。
// 他のタグは自動でエスケープされて文字として出るため危険ではない。
// 一方 <strong> の開閉が揃っていないと表示が崩れるので、そこだけ見る。
const STRONG_OPEN = /<strong>/g;
const STRONG_CLOSE = /<\/strong>/g;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const problems = [];
const fail = (where, message) => problems.push(`${where}: ${message}`);

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(file, `JSONとして読めない (${error.message})`);
    return fallback;
  }
}

function checkArticle(where, article, seenUrls) {
  for (const field of ['title', 'summary', 'sourceName', 'sourceUrl']) {
    if (!article[field] || String(article[field]).trim() === '') fail(where, `${field} が空`);
  }
  if (!Number.isInteger(article.position) || article.position < 1) fail(where, 'position が正の整数でない');

  if (article.sourceUrl && !/^https?:\/\//.test(article.sourceUrl)) {
    fail(where, `sourceUrl がhttp(s)で始まらない: ${article.sourceUrl}`);
  }
  if (article.sourceUrl?.includes('&amp;')) {
    fail(where, 'sourceUrl に &amp; が入っている (実体のURLをそのまま書く)');
  }
  if (article.summary) {
    const opens = (article.summary.match(STRONG_OPEN) ?? []).length;
    const closes = (article.summary.match(STRONG_CLOSE) ?? []).length;
    if (opens !== closes) fail(where, `summary の <strong> の開閉が揃っていない (${opens}/${closes})`);
  }
  if (article.status && !ARTICLE_STATUSES.has(article.status)) {
    fail(where, `status が不正: ${article.status}`);
  }
  if (article.tags && !Array.isArray(article.tags)) fail(where, 'tags が配列でない');

  if (article.sourceUrl) {
    if (seenUrls.has(article.sourceUrl)) fail(where, `同じ日にURLが重複: ${article.sourceUrl}`);
    seenUrls.add(article.sourceUrl);
  }
}

function checkDay(file) {
  const day = readJson(join(CONTENT, 'days', file), null);
  if (!day) return { date: null, slugs: [] };

  const date = file.replace('.json', '');
  if (day.date !== date) fail(file, `date フィールド(${day.date}) がファイル名と一致しない`);
  if (!day.label) fail(file, 'label が空');
  if (!Array.isArray(day.sections)) {
    fail(file, 'sections が配列でない');
    return { date, slugs: [] };
  }

  const positions = [];
  const slugs = [];
  const seenUrls = new Set();

  for (const section of day.sections) {
    if (!SECTION_KEYS.has(section.key)) fail(file, `section.key が不正: ${section.key}`);
    if (!section.title) fail(file, `section(${section.key}) の title が空`);
    if (!Array.isArray(section.articles) || section.articles.length === 0) {
      fail(file, `section(${section.key}) に記事が無い`);
      continue;
    }
    for (const article of section.articles) {
      checkArticle(`${file} #${article.position}`, article, seenUrls);
      positions.push(article.position);
      slugs.push(`${date}-${article.position}`);
    }
  }

  const sorted = [...positions].sort((a, b) => a - b);
  const expected = positions.map((_, index) => index + 1);
  if (JSON.stringify(sorted) !== JSON.stringify(expected)) {
    fail(file, `position が1からの連番でない: [${sorted.join(', ')}]`);
  }

  return { date, slugs };
}

function main() {
  const daysDir = join(CONTENT, 'days');
  if (!existsSync(daysDir)) {
    console.error('content/days が無い');
    process.exit(1);
  }

  const files = readdirSync(daysDir).filter((f) => f.endsWith('.json')).sort();
  const knownSlugs = new Set();
  const knownDates = new Set();

  for (const file of files) {
    const { date, slugs } = checkDay(file);
    if (date) knownDates.add(date);
    for (const slug of slugs) knownSlugs.add(slug);
  }

  for (const row of readJson(join(CONTENT, 'corrections.json'), [])) {
    const where = `corrections.json (${row.headline ?? '見出し無し'})`;
    if (!knownDates.has(row.date)) fail(where, `date ${row.date} の日が存在しない`);
    if (!row.headline) fail(where, 'headline が空');
    if (!CORRECTION_KINDS.has(row.kind)) fail(where, `kind が不正: ${row.kind}`);
    if (row.slug && !knownSlugs.has(row.slug)) fail(where, `slug ${row.slug} の記事が存在しない`);
    if (row.correctedOn && !ISO_DATE.test(row.correctedOn)) fail(where, 'correctedOn が日付形式でない');
  }

  for (const row of readJson(join(CONTENT, 'factchecks.json'), [])) {
    const where = `factchecks.json (${row.slug})`;
    if (!knownSlugs.has(row.slug)) fail(where, '記事が存在しない');
    if (!VERDICTS.has(row.verdict)) fail(where, `verdict が不正: ${row.verdict}`);
    if (!ISO_DATE.test(row.ranOn ?? '')) fail(where, 'ranOn が日付形式でない');
  }

  const updateIds = new Set();
  for (const row of readJson(join(CONTENT, 'updates.json'), [])) {
    const where = `updates.json (${row.id})`;
    if (!row.id) fail(where, 'id が空');
    if (updateIds.has(row.id)) fail(where, 'id が重複');
    updateIds.add(row.id);
    if (!ISO_DATE.test(row.releasedOn ?? '')) fail(where, 'releasedOn が日付形式でない');
    if (!row.title) fail(where, 'title が空');
  }

  console.log(`検査: ${files.length}日 / ${knownSlugs.size}記事`);

  if (problems.length > 0) {
    console.log(`\nNG (${problems.length}件):`);
    for (const problem of problems) console.log(`  - ${problem}`);
    process.exit(1);
  }
  console.log('OK: content/ に整合性の問題なし');
}

main();
