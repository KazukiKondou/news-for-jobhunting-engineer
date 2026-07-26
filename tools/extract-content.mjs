#!/usr/bin/env node
// 既存の site/YYYY-MM-DD/index.html を1記事ずつに分解し content/days/*.json へ書き出す。
// DB化への移行時に一度だけ流す想定だが、冪等なので再実行しても同じ結果になる。
//
//   node tools/extract-content.mjs [--dry]

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_DIR = join(ROOT, 'site');
const OUT_DIR = join(ROOT, 'content', 'days');
const DRY = process.argv.includes('--dry');

const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/;

const SECTION_KEY_BY_MODIFIER = {
  'articles-group--thinking': 'thinking',
  'articles-group--other': 'other',
};

/** HTMLエンティティを実体に戻す。生成元が自前なので出現するものだけ扱う。 */
function decodeEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** タグを落として1行のプレーンテキストにする。 */
function toPlainText(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

/** 要約は <strong> だけ残したい。それ以外のタグは落として空白を畳む。 */
function toSummaryHtml(html) {
  const stripped = html.replace(/<(?!\/?strong\b)[^>]*>/g, '');
  return decodeEntities(stripped).replace(/\s+/g, ' ').trim();
}

function matchOne(source, pattern) {
  const found = source.match(pattern);
  return found ? found[1] : null;
}

/** 開始位置の配列から「次の開始位置まで」でチャンクに切る。 */
function sliceByMarker(html, marker) {
  const chunks = [];
  let index = html.indexOf(marker);
  while (index !== -1) {
    const next = html.indexOf(marker, index + marker.length);
    chunks.push(html.slice(index, next === -1 ? undefined : next));
    index = next;
  }
  return chunks;
}

function parseArticle(chunk) {
  const titleMatch = chunk.match(
    /<h3 class="article-card__title">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h3>/
  );
  if (!titleMatch) return null;

  const position = Number(matchOne(chunk, /id="article-(\d+)"/) ?? 0);
  const summaryRaw = matchOne(chunk, /<p class="article-card__summary">([\s\S]*?)<\/p>/) ?? '';
  const sourceName = matchOne(chunk, /<div class="article-source">[\s\S]*?<span>([\s\S]*?)<\/span>/) ?? '';
  const linkUrl = matchOne(chunk, /<a class="article-link" href="([^"]+)"/);

  const tags = [...chunk.matchAll(/<span class="tag-chip">#?([^<]*)<\/span>/g)]
    .map((m) => toPlainText(m[1]))
    .filter(Boolean);

  return {
    position,
    title: toPlainText(titleMatch[2]),
    summary: toSummaryHtml(summaryRaw),
    sourceName: toPlainText(sourceName),
    // href は属性としてエスケープされているので実体に戻す (&amp; の二重エスケープ防止)。
    sourceUrl: decodeEntities(linkUrl ?? titleMatch[1]),
    tags,
  };
}

function parseGroup(chunk) {
  const modifier = Object.keys(SECTION_KEY_BY_MODIFIER).find((mod) =>
    chunk.startsWith(`<section class="articles-group ${mod}"`)
  );
  const key = modifier ? SECTION_KEY_BY_MODIFIER[modifier] : 'it';
  const title = toPlainText(matchOne(chunk, /<h2 class="articles-group__title">([\s\S]*?)<span/) ?? '');
  const introRaw = matchOne(chunk, /<p class="articles-group__intro">([\s\S]*?)<\/p>/);

  const articles = sliceByMarker(chunk, '<article class="article-card"')
    .map(parseArticle)
    .filter(Boolean);

  return { key, title, intro: introRaw ? toPlainText(introRaw) : null, articles };
}

function parseDay(date, html) {
  const label = toPlainText(matchOne(html, /<h1 class="day-title">([\s\S]*?)<\/h1>/) ?? '');
  const introRaw = matchOne(html, /<p class="day-intro">([\s\S]*?)<\/p>/);

  let sections = sliceByMarker(html, '<section class="articles-group').map(parseGroup);

  // 初期の日付ページはグループ分けが無く <section class="articles"> のみのことがある。
  if (sections.length === 0) {
    const articles = sliceByMarker(html, '<article class="article-card"')
      .map(parseArticle)
      .filter(Boolean);
    sections = [{ key: 'it', title: 'IT就活ニュース', intro: null, articles }];
  }

  sections = sections.filter((section) => section.articles.length > 0);

  return { date, label, intro: introRaw ? toPlainText(introRaw) : '', sections };
}

function main() {
  const dates = readdirSync(SITE_DIR)
    .filter((name) => DATE_DIR.test(name))
    .filter((name) => existsSync(join(SITE_DIR, name, 'index.html')))
    .sort();

  if (!DRY && !existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  let totalArticles = 0;
  const problems = [];

  for (const date of dates) {
    const html = readFileSync(join(SITE_DIR, date, 'index.html'), 'utf8');
    const day = parseDay(date, html);
    const count = day.sections.reduce((sum, s) => sum + s.articles.length, 0);
    totalArticles += count;

    const domCount = (html.match(/<article class="article-card"/g) ?? []).length;
    if (count !== domCount) problems.push(`${date}: parsed ${count} / dom ${domCount}`);
    if (!day.label) problems.push(`${date}: day-title が取れない`);
    if (day.sections.some((s) => s.articles.some((a) => !a.position))) problems.push(`${date}: position 欠落`);

    const positions = day.sections.flatMap((s) => s.articles.map((a) => a.position));
    if (new Set(positions).size !== positions.length) problems.push(`${date}: position 重複`);

    if (!DRY) {
      writeFileSync(join(OUT_DIR, `${date}.json`), `${JSON.stringify(day, null, 2)}\n`, 'utf8');
    }
    console.log(
      `${date}  ${String(count).padStart(2)}件  ${day.sections.map((s) => `${s.key}:${s.articles.length}`).join(' ')}`
    );
  }

  console.log(`\n日数: ${dates.length} / 記事総数: ${totalArticles}`);
  if (problems.length > 0) {
    console.log(`\n要確認 (${problems.length}件):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exitCode = 1;
  } else {
    console.log('検証OK: DOM上の記事数と抽出件数が全日で一致');
  }
}

main();
