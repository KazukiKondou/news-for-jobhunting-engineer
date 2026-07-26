// 日をまとめて見せるページ (ホーム / アーカイブ)。どちらも days + articles から組み立てる。

import { escapeHtml, shortDateLabel, formatCount } from '../util.js';
import { layout } from './layout.js';
import { renderViewStat, ICONS } from './components.js';

const HOME_GROUP_MODIFIER = {
  thinking: ' home-headlines-group--thinking',
  other: ' home-headlines-group--other',
};
export const RECENT_DAYS = 9;
const HEADLINES_PER_CARD = 3;

function renderHeadlineItem(date, article) {
  return `          <li><a href="/${date}/#article-${article.position}"><span class="home-headlines-list__num">${String(article.position).padStart(2, '0')}</span><span class="home-headlines-list__title">${escapeHtml(article.title)}</span><span class="home-headlines-list__source">${escapeHtml(article.source_name)}</span></a></li>`;
}

function renderHeadlineGroup(date, section) {
  const intro = section.intro
    ? `        <p class="home-headlines-group__intro">
          ${escapeHtml(section.intro)}
        </p>\n`
    : '';

  return `      <div class="home-headlines-group${HOME_GROUP_MODIFIER[section.key] ?? ''}">
        <div class="home-headlines-group__header">
          <h2 class="home-headlines-group__title">
            ${escapeHtml(section.title)}
            <span class="home-headlines-group__count">${section.articles.length}件</span>
          </h2>
        </div>
${intro}        <ol class="home-headlines-list">
${section.articles.map((article) => renderHeadlineItem(date, article)).join('\n')}
        </ol>
      </div>`;
}

function renderDayCard(day, correctionCount) {
  const titles = day.titles.slice(0, HEADLINES_PER_CARD);
  const rest = day.article_count - titles.length;
  const items = titles.map((title) => `            <li>${escapeHtml(title)}</li>`).join('\n');
  const more = rest > 0 ? `\n            <li class="day-card__more">他 ${rest} 件</li>` : '';
  const badge = correctionCount
    ? `<span class="day-card__corrected" title="この日は${correctionCount}件の修正があります">修正${correctionCount}</span>`
    : '';

  return `        <a class="day-card" href="/${day.date}/">
          <div class="day-card__head">
            <div class="day-card__date">${shortDateLabel(day.date)}</div>
            <div class="day-card__count">${day.article_count}件${badge}</div>
          </div>
          <ul class="day-card__list">
${items}${more}
          </ul>
          <div class="day-card__foot">
            <span class="day-card__views">${ICONS.views}${formatCount(day.views)}</span>
            <span class="day-card__cta">詳細を見る ${ICONS.chevronRight}</span>
          </div>
        </a>`;
}

export function renderHomePage({ content, views, recentDays, correctionCounts }) {
  const { day, sections, count } = content;

  const body = `    <section class="hero hero--compact">
      <div class="hero__inner">
        <div class="eyebrow">
          <span class="live-dot" aria-hidden="true"></span>
          最新のニュース
        </div>

        <h1 class="hero__title">${escapeHtml(day.label)}</h1>
        <p class="hero__intro">${escapeHtml(day.intro)}</p>
        <p class="hero__meta">
          <span class="day-stat"><span class="day-stat__count">${count}</span><span class="day-stat__unit">件のニュース</span></span>
          ${renderViewStat(views)}
        </p>
      </div>
    </section>

    <section class="day-article day-article--home">
${sections.map((section) => renderHeadlineGroup(day.date, section)).join('\n\n')}

      <a class="home-read-all" href="/${day.date}/">
        全文を読む
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </a>
    </section>

    <section class="section">
      <h2 class="section__title">過去のニュース</h2>
      <p class="section__sub">直近 ${recentDays.length} 日分</p>

      <div class="day-grid">
${recentDays.map((entry) => renderDayCard(entry, correctionCounts.get(entry.date) ?? 0)).join('\n')}
      </div>

      <a class="see-all" href="/archive/">
        すべてのアーカイブを見る
        ${ICONS.chevronRight}
      </a>
    </section>`;

  return layout({
    title: 'ホーム',
    description: 'Web系・IT系事業会社志望のエンジニア就活生向け、毎日更新の日次ニュース。LINE配信と連動。',
    path: '/',
    activeNav: 'home',
    body,
    updatedLabel: `最終更新: ${day.date.replace(/-/g, '/')}`,
  });
}

export function renderArchivePage({ days, correctionCounts, totals }) {
  const byMonth = new Map();
  for (const day of days) {
    const month = day.date.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(day);
  }

  const months = [...byMonth.entries()]
    .map(([month, entries]) => {
      const [year, monthNumber] = month.split('-');
      return `      <div class="archive-month">
        <h2 class="archive-month__title">${year}年${Number(monthNumber)}月<span class="archive-month__count">${entries.length}日</span></h2>
        <div class="day-grid">
${entries.map((entry) => renderDayCard(entry, correctionCounts.get(entry.date) ?? 0)).join('\n')}
        </div>
      </div>`;
    })
    .join('\n\n');

  const body = `    <section class="page-head">
      <div class="eyebrow">Archive</div>
      <h1 class="page-title">アーカイブ</h1>
      <p class="page-lead">これまでに配信した ${totals.days} 日分・${formatCount(totals.articles)} 件のニュースをすべて残しています。</p>
    </section>

    <section class="section">
${months}
    </section>`;

  return layout({
    title: 'アーカイブ',
    description: `これまでに配信した ${totals.days} 日分・${totals.articles} 件のニュース一覧。`,
    path: '/archive/',
    activeNav: 'archive',
    body,
  });
}
