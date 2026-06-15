/*
 * day-nav.js — runtime self-healing for the daily-page date navigation.
 *
 * Each page ships a statically-correct 3-slot nav (prev | latest | next/status)
 * baked at build time. This script reads /days.json (the build-time manifest of
 * all YYYY-MM-DD pages) and recomputes prev / next / isLatest for the current
 * page, then rewrites the nav. This lets yesterday's page gain a "next day"
 * button once today's page appears, and fixes any stale status, without
 * regenerating prior pages.
 *
 * Graceful degradation: on no-JS, no manifest, fetch failure, or any unexpected
 * shape we simply leave the static nav untouched. Never throws.
 */
(function () {
  "use strict";

  var nav = document.querySelector(".day-nav[data-date]");
  if (!nav) return;

  function isIsoDate(d) {
    return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
  }

  var cur = nav.dataset.date;
  if (!isIsoDate(cur)) return;

  // "2026-06-13" -> "2026年6月13日" (no leading zeros, matches static labels)
  function fmt(d) {
    var p = d.split("-");
    return p[0] + "年" + Number(p[1]) + "月" + Number(p[2]) + "日";
  }

  function htmlPrev(p) {
    if (!p) return "";
    return (
      '<a class="day-nav__btn day-nav__btn--prev" href="/' + p + '/" rel="prev" ' +
      'aria-label="前の日のニュース ' + fmt(p) + 'へ">' +
      '<span class="day-nav__label">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>' +
      "前の日" +
      "</span>" +
      '<span class="day-nav__date">' + fmt(p) + "</span>" +
      "</a>"
    );
  }

  function htmlLatest() {
    return (
      '<a class="day-nav__btn day-nav__btn--latest" href="/" aria-label="最新の日のニュースへ">' +
      "最新の日へ" +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 17 5-5-5-5M13 17l5-5-5-5"/></svg>' +
      "</a>"
    );
  }

  function htmlNext(n) {
    return (
      '<a class="day-nav__btn day-nav__btn--next" href="/' + n + '/" rel="next" ' +
      'aria-label="次の日のニュース ' + fmt(n) + 'へ">' +
      '<span class="day-nav__label">' +
      "次の日" +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>' +
      "</span>" +
      '<span class="day-nav__date">' + fmt(n) + "</span>" +
      "</a>"
    );
  }

  function htmlStatus() {
    return (
      '<div class="day-nav__status" role="status">' +
      '<svg class="day-nav__status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>' +
      '<span class="day-nav__status-text">最新の記事です</span>' +
      "</div>"
    );
  }

  // Maintain head <link rel="prev|next">: set/update when a date exists, remove otherwise.
  function setRel(rel, date) {
    var link = document.head.querySelector('link[rel="' + rel + '"]');
    if (date) {
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", rel);
        document.head.appendChild(link);
      }
      link.setAttribute("href", "/" + date + "/");
    } else if (link) {
      link.parentNode.removeChild(link);
    }
  }

  fetch("/days.json", { cache: "no-cache" })
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (days) {
      if (!Array.isArray(days)) return;
      var i = days.indexOf(cur);
      if (i < 0) return;
      // Neighbors come from our own build-time manifest, but validate the format
      // anyway before they reach innerHTML — defense in depth, drops anything odd.
      var prev = i > 0 && isIsoDate(days[i - 1]) ? days[i - 1] : null;
      var next = i < days.length - 1 && isIsoDate(days[i + 1]) ? days[i + 1] : null;
      nav.innerHTML = htmlPrev(prev) + htmlLatest() + (next ? htmlNext(next) : htmlStatus());
      setRel("prev", prev);
      setRel("next", next);
    })
    .catch(function () {
      /* fetch / parse failed — keep the static nav as-is */
    });
})();
