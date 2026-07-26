// 記事カード・修正履歴・閲覧数バッジなど、ページ間で共有する部品。

import { escapeHtml, renderSummary, formatCount, shortDateLabel } from '../util.js';

export const ICONS = {
  source: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6Z"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>',
  like: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3Zm0 0 4.4-7.3a1.5 1.5 0 0 1 2.8.9L13.5 9h5.2a2 2 0 0 1 2 2.4l-1.5 7A2 2 0 0 1 17.2 20H7"/></svg>',
  doubt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>',
  views: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  clicks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 9 10.5 3.9-4.3 1.7-1.7 4.3L9 9Z"/><path d="M6 3v3M3 6h3M4.2 13.8 6.3 11.7M13.8 4.2 11.7 6.3"/></svg>',
  correction: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
};

/** 記事1件のカード。評価ボタンと元記事クリック数を内包する。 */
export function renderArticleCard(article, { myFeedback = null } = {}) {
  const tags = article.tags
    .map((tag) => `<span class="tag-chip">#${escapeHtml(tag)}</span>`)
    .join('\n                ');

  const liked = myFeedback === 'like';
  const doubted = myFeedback === 'doubt';

  return `          <article class="article-card" id="article-${article.position}">
            <div class="article-card__body">
              <div class="tags">
                ${tags}
              </div>
              <h3 class="article-card__title"><a href="${escapeHtml(article.source_url)}" target="_blank" rel="noopener noreferrer" data-slug="${escapeHtml(article.slug)}" data-source-link>${escapeHtml(article.title)}</a></h3>
              <p class="article-card__summary">${renderSummary(article.summary)}</p>
              <div class="article-card__meta">
                <div class="article-source">
                  ${ICONS.source}
                  <span>${escapeHtml(article.source_name)}</span>
                </div>
                <a class="article-link" href="${escapeHtml(article.source_url)}" target="_blank" rel="noopener noreferrer" data-slug="${escapeHtml(article.slug)}" data-source-link>元記事を読む ${ICONS.external}</a>
              </div>
              <div class="article-actions" data-slug="${escapeHtml(article.slug)}">
                <button type="button" class="react-btn react-btn--like${liked ? ' is-active' : ''}" data-kind="like" aria-pressed="${liked}">
                  ${ICONS.like}
                  <span class="react-btn__label">参考になった</span>
                  <span class="react-btn__count" data-count="like">${formatCount(article.likes)}</span>
                </button>
                <button type="button" class="react-btn react-btn--doubt${doubted ? ' is-active' : ''}" data-kind="doubt" aria-pressed="${doubted}" title="事実と違う・内容があやしいと思ったら報告してください。翌朝のファクトチェックで検証します。">
                  ${ICONS.doubt}
                  <span class="react-btn__label" data-doubt-label>${doubted ? '報告済み' : '内容があやしい'}</span>
                </button>
                <span class="article-stat" title="「元記事を読む」が押された回数">
                  ${ICONS.clicks}
                  <span class="article-stat__count" data-count="clicks">${formatCount(article.source_clicks)}</span>
                </span>
              </div>
            </div>
          </article>`;
}

const CORRECTION_LABELS = {
  fact_error: '事実の誤り',
  url_fix: 'リンク修正',
  retraction: '記事の取り下げ',
  clarify: '補足・表現の修正',
};

function renderCorrection(row) {
  const label = CORRECTION_LABELS[row.kind] ?? '修正';

  const diff =
    row.before_text || row.after_text
      ? `              <div class="correction__diff">
                ${row.before_text ? `<del class="correction__before">${escapeHtml(row.before_text)}</del>` : ''}
                ${row.after_text ? `<ins class="correction__after">${escapeHtml(row.after_text)}</ins>` : ''}
              </div>`
      : '';

  const anchor = row.slug
    ? `<a class="correction__link" href="#article-${escapeHtml(String(row.slug).split('-').pop())}">該当記事へ ${ICONS.chevronRight}</a>`
    : '';
  const evidence = row.evidence_url
    ? `<a class="correction__link" href="${escapeHtml(row.evidence_url)}" target="_blank" rel="noopener noreferrer">根拠となる情報源 ${ICONS.external}</a>`
    : '';
  const links = anchor || evidence ? `              <div class="correction__links">${anchor}${evidence}</div>` : '';

  return `            <li class="correction">
              <div class="correction__head">
                <span class="correction__badge correction__badge--${escapeHtml(row.kind)}">${label}</span>
                <time class="correction__date" datetime="${escapeHtml(row.corrected_on)}">${shortDateLabel(row.corrected_on)} 修正</time>
              </div>
              <p class="correction__headline">${escapeHtml(row.headline)}</p>
${row.detail ? `              <p class="correction__detail">${escapeHtml(row.detail)}</p>` : ''}
${diff}
${links}
            </li>`;
}

/** 日ページ上部に出す修正履歴。修正が無い日は何も出さない。 */
export function renderCorrections(rows) {
  if (rows.length === 0) return '';

  return `      <section class="day-corrections" aria-label="この日の記事の修正履歴">
        <div class="day-corrections__head">
          <h2 class="day-corrections__title">
            ${ICONS.correction}
            この日の修正履歴
          </h2>
          <span class="day-corrections__count">${rows.length}件</span>
        </div>
        <p class="day-corrections__note">読者からの「内容があやしい」報告をもとに再検証し、誤りが確認された箇所を修正しています。</p>
        <ol class="day-corrections__list">
${rows.map(renderCorrection).join('\n')}
        </ol>
      </section>`;
}

/** 閲覧数バッジ。 */
export function renderViewStat(views) {
  return `<span class="day-stat" title="この日のページが読まれた回数">${ICONS.views}<span class="day-stat__count">${formatCount(views)}</span><span class="day-stat__unit">閲覧</span></span>`;
}
