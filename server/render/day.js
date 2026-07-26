// 日別ページ。DBから引いた記事レコードを繋ぎ合わせて1枚のHTMLにする。

import { escapeHtml, longDateLabel } from '../util.js';
import { layout } from './layout.js';
import { renderArticleCard, renderCorrections, renderViewStat } from './components.js';

const SECTION_MODIFIER = { thinking: ' articles-group--thinking', other: ' articles-group--other' };

function renderToc(sections) {
  return sections
    .flatMap((section) => section.articles)
    .sort((a, b) => a.position - b.position)
    .map(
      (article) =>
        `          <li><span class="toc__num">${String(article.position).padStart(2, '0')}</span><a href="#article-${article.position}">${escapeHtml(article.title)}</a></li>`
    )
    .join('\n');
}

function renderSection(section, myFeedback) {
  const cards = section.articles
    .map((article) => renderArticleCard(article, { myFeedback: myFeedback.get(article.slug) ?? null }))
    .join('\n\n');

  const intro = section.intro
    ? `        <p class="articles-group__intro">
          ${escapeHtml(section.intro)}
        </p>\n`
    : '';

  return `      <section class="articles-group${SECTION_MODIFIER[section.key] ?? ''}">
        <div class="articles-group__header">
          <h2 class="articles-group__title">
            ${escapeHtml(section.title)}
            <span class="articles-group__count">${section.articles.length}件</span>
          </h2>
        </div>
${intro}        <section class="articles">
${cards}
        </section>
      </section>`;
}

function renderDayNav(date, prev, next) {
  const prevSlot = prev
    ? `        <a class="day-nav__btn day-nav__btn--prev" href="/${prev}/" rel="prev" aria-label="前の日のニュース ${longDateLabel(prev)}へ">
          <span class="day-nav__label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
            前の日
          </span>
          <span class="day-nav__date">${longDateLabel(prev).replace(/ \(.\)$/, '')}</span>
        </a>\n`
    : '';

  const nextSlot = next
    ? `        <a class="day-nav__btn day-nav__btn--next" href="/${next}/" rel="next" aria-label="次の日のニュース ${longDateLabel(next)}へ">
          <span class="day-nav__label">
            次の日
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
          </span>
          <span class="day-nav__date">${longDateLabel(next).replace(/ \(.\)$/, '')}</span>
        </a>`
    : `        <div class="day-nav__status" role="status">
          <svg class="day-nav__status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          <span class="day-nav__status-text">最新の記事です</span>
        </div>`;

  return `      <nav class="day-nav" aria-label="日付ナビゲーション" data-date="${date}">
${prevSlot}        <a class="day-nav__btn day-nav__btn--latest" href="/" aria-label="最新の日のニュースへ">
          最新の日へ
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 17 5-5-5-5M13 17l5-5-5-5"/></svg>
        </a>
${nextSlot}
      </nav>`;
}

export function renderDayPage({ content, corrections, views, myFeedback, prev, next }) {
  const { day, sections, count } = content;
  const headlines = sections
    .flatMap((s) => s.articles)
    .slice(0, 3)
    .map((a) => a.title)
    .join(' / ');

  const correctionsBlock = renderCorrections(corrections);

  const body = `    <article class="day-article">
      <header class="day-header">
        <div class="eyebrow">Daily News</div>
        <h1 class="day-title">${escapeHtml(day.label)}</h1>
        <p class="day-meta">
          <span class="day-stat"><span class="day-stat__count">${count}</span><span class="day-stat__unit">件のニュース</span></span>
          ${renderViewStat(views)}
        </p>
        <p class="day-intro">${escapeHtml(day.intro)}</p>
      </header>
${correctionsBlock ? `\n${correctionsBlock}\n` : ''}
      <details class="toc" open aria-label="本日の見出し一覧">
        <summary class="toc__summary">
          <span class="toc__summary-text">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
            見出し一覧
          </span>
          <span class="toc__summary-meta">
            ${count}件
            <svg class="toc__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
          </span>
        </summary>
        <ol class="toc__list">
${renderToc(sections)}
        </ol>
      </details>

${sections.map((section) => renderSection(section, myFeedback)).join('\n\n')}

${renderDayNav(day.date, prev, next)}
    </article>`;

  const headExtra = [
    prev ? `  <link rel="prev" href="/${prev}/" />` : '',
    next ? `  <link rel="next" href="/${next}/" />` : '',
    `  <meta property="article:published_time" content="${day.date}T00:00:00+09:00" />`,
  ]
    .filter(Boolean)
    .join('\n');

  return layout({
    title: day.label,
    description: `${day.label}のテックニュース ${count}件: ${headlines}`,
    path: `/${day.date}/`,
    activeNav: 'home',
    ogType: 'article',
    headExtra,
    body,
    tagline: 'エンジニア就活生のための日次テックニュース。LINE配信した記事を毎日まとめて公開しています。',
    updatedLabel: `最終更新: ${day.date.replace(/-/g, '/')}`,
    bodyEnd: '  <script src="/assets/feedback.js?v=1" defer></script>',
  });
}
