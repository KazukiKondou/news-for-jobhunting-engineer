// 記事の評価ボタンと「元記事を読む」クリック計測。
// サーバーが最新値を返すので、表示は常にレスポンスで上書きする。
(function () {
  'use strict';

  var DOUBT_LABELS = { on: '報告済み', off: '内容があやしい' };

  function findCount(actions, key) {
    return actions.querySelector('[data-count="' + key + '"]');
  }

  function applyResult(actions, result) {
    var likeButton = actions.querySelector('.react-btn--like');
    var doubtButton = actions.querySelector('.react-btn--doubt');
    var likeCount = findCount(actions, 'like');

    if (likeCount) likeCount.textContent = Number(result.likes || 0).toLocaleString('en-US');

    var liked = result.active === 'like';
    var doubted = result.active === 'doubt';

    likeButton.classList.toggle('is-active', liked);
    likeButton.setAttribute('aria-pressed', String(liked));
    doubtButton.classList.toggle('is-active', doubted);
    doubtButton.setAttribute('aria-pressed', String(doubted));

    var doubtLabel = doubtButton.querySelector('[data-doubt-label]');
    if (doubtLabel) doubtLabel.textContent = doubted ? DOUBT_LABELS.on : DOUBT_LABELS.off;
  }

  function flashError(actions) {
    actions.classList.add('article-actions--error');
    window.setTimeout(function () {
      actions.classList.remove('article-actions--error');
    }, 2000);
  }

  function sendFeedback(actions, kind) {
    var slug = actions.getAttribute('data-slug');
    var buttons = actions.querySelectorAll('.react-btn');
    var i;

    for (i = 0; i < buttons.length; i += 1) buttons[i].disabled = true;

    fetch('/api/articles/' + encodeURIComponent(slug) + '/feedback?kind=' + kind, {
      method: 'POST',
      credentials: 'same-origin',
    })
      .then(function (response) {
        if (!response.ok) throw new Error('feedback failed: ' + response.status);
        return response.json();
      })
      .then(function (result) {
        applyResult(actions, result);
      })
      .catch(function (error) {
        console.error(error);
        flashError(actions);
      })
      .then(function () {
        for (i = 0; i < buttons.length; i += 1) buttons[i].disabled = false;
      });
  }

  // 元記事へは離脱してしまうので、確実に届く sendBeacon で数える。
  function countSourceClick(slug) {
    var url = '/api/articles/' + encodeURIComponent(slug) + '/click';
    if (navigator.sendBeacon && navigator.sendBeacon(url)) return;
    fetch(url, { method: 'POST', credentials: 'same-origin', keepalive: true }).catch(function () {});
  }

  function bumpClickDisplay(slug) {
    var actions = document.querySelector('.article-actions[data-slug="' + slug + '"]');
    if (!actions) return;
    var display = findCount(actions, 'clicks');
    if (!display) return;
    var next = Number(String(display.textContent).replace(/,/g, '')) + 1;
    display.textContent = next.toLocaleString('en-US');
  }

  document.addEventListener('click', function (event) {
    if (!event.target.closest) return;

    var button = event.target.closest('.react-btn');
    if (button) {
      event.preventDefault();
      sendFeedback(button.closest('.article-actions'), button.getAttribute('data-kind'));
      return;
    }

    var link = event.target.closest('[data-source-link]');
    if (link) {
      var slug = link.getAttribute('data-slug');
      if (!slug) return;
      countSourceClick(slug);
      bumpClickDisplay(slug);
    }
  });
})();
