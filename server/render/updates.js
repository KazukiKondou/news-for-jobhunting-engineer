// アップデート情報ページ。内容は updates テーブルから読む。

import { escapeHtml, longDateLabel } from '../util.js';
import { layout } from './layout.js';

const CATEGORY_LABELS = {
  feature: '新機能',
  fix: '不具合修正',
  content: 'コンテンツ',
  design: 'デザイン',
};

function renderUpdate(update) {
  const items = update.items.length
    ? `          <ul class="update__items">
${update.items.map((item) => `            <li>${escapeHtml(item)}</li>`).join('\n')}
          </ul>`
    : '';

  const version = update.version ? `<span class="update__version">${escapeHtml(update.version)}</span>` : '';

  return `        <li class="update">
          <div class="update__head">
            <time class="update__date" datetime="${escapeHtml(update.released_on)}">${longDateLabel(update.released_on)}</time>
            <span class="update__badge update__badge--${escapeHtml(update.category)}">${CATEGORY_LABELS[update.category] ?? 'お知らせ'}</span>
            ${version}
          </div>
          <h2 class="update__title">${escapeHtml(update.title)}</h2>
${update.body ? `          <p class="update__body">${escapeHtml(update.body)}</p>` : ''}
${items}
        </li>`;
}

export function renderUpdatesPage({ updates }) {
  const list =
    updates.length === 0
      ? '      <p class="rank-empty">まだアップデート情報はありません。</p>'
      : `      <ol class="update-list">
${updates.map(renderUpdate).join('\n')}
      </ol>`;

  const body = `    <section class="page-head">
      <div class="eyebrow">Updates</div>
      <h1 class="page-title">アップデート情報</h1>
      <p class="page-lead">このサイトの機能追加・改善の記録です。新しいものから並んでいます。</p>
    </section>

    <section class="section">
${list}
    </section>`;

  return layout({
    title: 'アップデート情報',
    description: 'エンジニア就活ニュースの機能追加・改善の記録。',
    path: '/updates/',
    activeNav: 'updates',
    body,
    updatedLabel: updates.length ? `最終更新: ${updates[0].released_on.replace(/-/g, '/')}` : '',
  });
}
