// ランキングページ。指標(元記事クリック / いいね / 日別閲覧数)と期間を切り替えられる。

import { escapeHtml, formatCount, shortDateLabel } from '../util.js';
import { RANKING_METRICS, RANKING_PERIODS } from '../queries.js';
import { layout } from './layout.js';
import { ICONS } from './components.js';

function renderTabs(currentMetric, currentPeriod) {
  const metrics = Object.entries(RANKING_METRICS)
    .map(([key, meta]) => {
      const active = key === currentMetric;
      return `          <a class="rank-tab${active ? ' is-active' : ''}" href="/ranking/?metric=${key}&period=${currentPeriod}"${active ? ' aria-current="page"' : ''}>${meta.label}</a>`;
    })
    .join('\n');

  const periods = Object.entries(RANKING_PERIODS)
    .map(([key, meta]) => {
      const active = key === currentPeriod;
      return `          <a class="rank-chip${active ? ' is-active' : ''}" href="/ranking/?metric=${currentMetric}&period=${key}"${active ? ' aria-current="page"' : ''}>${meta.label}</a>`;
    })
    .join('\n');

  return `      <div class="rank-controls">
        <div class="rank-tabs" aria-label="ランキングの指標">
${metrics}
        </div>
        <div class="rank-chips" aria-label="集計期間">
${periods}
        </div>
      </div>`;
}

function renderArticleRow(row, index, unit) {
  return `          <li class="rank-row">
            <span class="rank-row__num">${index + 1}</span>
            <div class="rank-row__body">
              <a class="rank-row__title" href="/${row.date}/#article-${row.position}">${escapeHtml(row.title)}</a>
              <div class="rank-row__meta">
                <span class="rank-row__source">${ICONS.source}${escapeHtml(row.source_name)}</span>
                <span class="rank-row__sep">·</span>
                <a class="rank-row__date" href="/${row.date}/">${shortDateLabel(row.date)}</a>
              </div>
            </div>
            <div class="rank-row__score">
              <span class="rank-row__score-value">${formatCount(row.score)}</span>
              <span class="rank-row__score-unit">${unit}</span>
            </div>
          </li>`;
}

function renderDayRow(row, index, unit) {
  return `          <li class="rank-row">
            <span class="rank-row__num">${index + 1}</span>
            <div class="rank-row__body">
              <a class="rank-row__title" href="/${row.date}/">${escapeHtml(row.label)}</a>
              <div class="rank-row__meta">
                <span class="rank-row__source">${row.article_count}件のニュース</span>
              </div>
            </div>
            <div class="rank-row__score">
              <span class="rank-row__score-value">${formatCount(row.score)}</span>
              <span class="rank-row__score-unit">${unit}</span>
            </div>
          </li>`;
}

const EMPTY_MESSAGE =
  '      <p class="rank-empty">この期間はまだ集計データがありません。記事が読まれると順位がつきはじめます。</p>';

export function renderRankingPage({ metric, period, rows }) {
  const meta = RANKING_METRICS[metric];
  const renderRow = meta.scope === 'day' ? renderDayRow : renderArticleRow;

  const list =
    rows.length === 0
      ? EMPTY_MESSAGE
      : `      <ol class="rank-list">
${rows.map((row, index) => renderRow(row, index, meta.unit)).join('\n')}
      </ol>`;

  const body = `    <section class="page-head">
      <div class="eyebrow">Ranking</div>
      <h1 class="page-title">ランキング</h1>
      <p class="page-lead">よく読まれた記事・よく開かれた元記事を集計しています。指標と期間を切り替えて見られます。</p>
    </section>

    <section class="section">
${renderTabs(metric, period)}
${list}
    </section>`;

  return layout({
    title: `ランキング (${meta.label}・${RANKING_PERIODS[period].label})`,
    description: `${meta.label}が多い記事のランキング (${RANKING_PERIODS[period].label})。`,
    path: '/ranking/',
    activeNav: 'ranking',
    body,
    // 指標×期間の組み合わせは実質同じ内容なので、検索エンジンには既定の1つだけ見せる。
    noindex: !(metric === 'clicks' && period === 'all'),
  });
}
