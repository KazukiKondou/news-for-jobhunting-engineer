#!/usr/bin/env python3
"""
check-site.py — site/ 全体の機械的整合性チェック。

検証項目:
  日ページ (site/YYYY-MM-DD/index.html):
    - article-card の id が article-1..N の連番
    - toc__list の件数・アンカー順序 (#article-1..N) が記事カードと一致
    - toc タイトル == 記事カードタイトル (完全一致)
    - day-meta 件数 == N
    - toc__summary-meta 件数 == N
    - 各セクション articles-group__count の和 == N
    - カード0件のセクションが存在しない
    - day-nav の data-date、静的 prev/next リンク先ディレクトリが実在
    - head <link rel="prev|next"> の先が実在
    - ページ内の内部リンク /YYYY-MM-DD/ が実在
  home (site/index.html):
    - 見出しリンクが最新日 /{latest}/#article-1..N を過不足なく指す
    - RECENT_DAYS day-card のリンク先実在・件数一致・上位タイトル一致
  archive (site/archive/index.html):
    - hero の「N日分」== 日ディレクトリ数
    - 全日ディレクトリに day-card があり、リンク先実在・件数一致・上位3タイトル一致

Usage: python3 tools/check-site.py   (exit 0 = OK, 1 = 不整合あり)
"""

import os
import re
import sys

SITE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "site")

CARD_ID_RE = re.compile(r'<article class="article-card" id="article-(\d+)"')
CARD_TITLE_RE = re.compile(
    r'<article class="article-card" id="article-(\d+)".*?'
    r'<h3 class="article-card__title"><a href="([^"]+)"[^>]*>(.*?)</a></h3>',
    re.DOTALL,
)
TOC_ITEM_RE = re.compile(r'<li><span class="toc__num">\d+</span><a href="#article-(\d+)">(.*?)</a></li>')
DAY_META_RE = re.compile(
    r'<p class="day-meta">(?:<strong>(\d+)</strong>件のニュース|本日のニュース <strong>(\d+)</strong> 件)</p>'
)
TOC_SUMMARY_META_RE = re.compile(r'<span class="toc__summary-meta">\s*(\d+)件', re.DOTALL)
GROUP_START_RE = re.compile(r'<section class="articles-group[^"]*">')
GROUP_COUNT_RE = re.compile(r'<span class="articles-group__count">(\d+)件</span>')
INTERNAL_LINK_RE = re.compile(r'href="/(\d{4}-\d{2}-\d{2})/')
REL_LINK_RE = re.compile(r'<link rel="(prev|next)" href="/(\d{4}-\d{2}-\d{2})/"')
NAV_RE = re.compile(r'<nav class="day-nav"[^>]*data-date="(\d{4}-\d{2}-\d{2})"', re.DOTALL)
DAY_CARD_RE = re.compile(
    r'<a class="day-card" href="/(\d{4}-\d{2}-\d{2})/">.*?'
    r'<div class="day-card__count">(\d+)件</div>.*?'
    r'<ul class="day-card__list">(.*?)</ul>',
    re.DOTALL,
)
DAY_CARD_ITEM_RE = re.compile(r'<li(?! class="day-card__more")[^>]*>(.*?)</li>')
HEADLINE_RE = re.compile(r'<li><a href="/(\d{4}-\d{2}-\d{2})/#article-(\d+)">')
HERO_META_RE = re.compile(r'<p class="hero__meta"><strong>(\d+)</strong>日分のニュース</p>')


def truncate_dash(title):
    return re.split(r"\s*—\s+", title)[0].strip()


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def strip_tags(s):
    return re.sub(r"<[^>]+>", "", s).strip()


def check_day_page(day, days, issues):
    path = os.path.join(SITE, day, "index.html")
    html = read(path)
    where = f"{day}/index.html"

    ids = [int(m) for m in CARD_ID_RE.findall(html)]
    n = len(ids)
    if ids != list(range(1, n + 1)):
        issues.append(f"{where}: 記事IDが連番でない: {ids}")

    cards = CARD_TITLE_RE.findall(html)
    card_titles = {int(i): strip_tags(t) for i, _, t in cards}

    toc = TOC_ITEM_RE.findall(html)
    if [int(i) for i, _ in toc] != list(range(1, n + 1)):
        issues.append(f"{where}: TOCアンカーが連番1..{n}でない: {[i for i, _ in toc]}")
    for i, t in toc:
        tt = strip_tags(t)
        ct = card_titles.get(int(i))
        if ct is not None and tt != ct:
            issues.append(f"{where}: TOC#{i}タイトル不一致: toc='{tt}' card='{ct}'")

    m = DAY_META_RE.search(html)
    if not m:
        issues.append(f"{where}: day-meta が見つからない")
    else:
        meta_n = int(m.group(1) or m.group(2))
        if meta_n != n:
            issues.append(f"{where}: day-meta件数 {meta_n} != 記事数 {n}")

    m = TOC_SUMMARY_META_RE.search(html)
    if m and int(m.group(1)) != n:
        issues.append(f"{where}: toc__summary-meta件数 {m.group(1)} != 記事数 {n}")

    group_counts = []
    starts = [m.start() for m in GROUP_START_RE.finditer(html)]
    for idx, s in enumerate(starts):
        e = starts[idx + 1] if idx + 1 < len(starts) else len(html)
        g = html[s:e]
        gc = GROUP_COUNT_RE.search(g)
        n_cards = len(CARD_ID_RE.findall(g))
        if n_cards == 0:
            issues.append(f"{where}: 記事0件のセクションが残っている")
        if gc:
            group_counts.append(int(gc.group(1)))
            if int(gc.group(1)) != n_cards:
                issues.append(f"{where}: セクション件数表示 {gc.group(1)} != カード数 {n_cards}")
    if group_counts and sum(group_counts) != n:
        issues.append(f"{where}: セクション件数の和 {sum(group_counts)} != 記事数 {n}")

    for target in set(INTERNAL_LINK_RE.findall(html)):
        if target not in days:
            issues.append(f"{where}: 内部リンク先 /{target}/ が実在しない")
    for rel, target in REL_LINK_RE.findall(html):
        if target not in days:
            issues.append(f"{where}: <link rel={rel}> の先 /{target}/ が実在しない")

    m = NAV_RE.search(html)
    if not m:
        issues.append(f"{where}: day-nav が見つからない")
    elif m.group(1) != day:
        issues.append(f"{where}: day-nav data-date={m.group(1)} がページ日付と不一致")

    return n, [card_titles[i] for i in sorted(card_titles)]


def check_day_cards(html, where, days, day_info, issues, top_k=3):
    seen = {}
    for date, count, items_html in DAY_CARD_RE.findall(html):
        seen[date] = True
        if date not in days:
            issues.append(f"{where}: day-card の先 /{date}/ が実在しない")
            continue
        actual_n, titles = day_info[date]
        if int(count) != actual_n:
            issues.append(f"{where}: day-card {date} 件数 {count} != 実際 {actual_n}")
        items = [strip_tags(x) for x in DAY_CARD_ITEM_RE.findall(items_html)]
        expected = [truncate_dash(t) for t in titles[:top_k]]

        def matches(item, exp):
            if item == exp:
                return True
            # カード側は長いタイトルを「…」で省略する
            return item.endswith("…") and exp.startswith(item[:-1])

        ok = len(items) == min(top_k, actual_n) and all(
            matches(i, e) for i, e in zip(items, expected)
        )
        if not ok:
            issues.append(
                f"{where}: day-card {date} 上位タイトル不一致:\n    card={items}\n    expect={expected}"
            )
    return seen


def main():
    days = sorted(
        d for d in os.listdir(SITE)
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", d) and os.path.isfile(os.path.join(SITE, d, "index.html"))
    )
    issues = []
    day_info = {}
    for day in days:
        day_info[day] = check_day_page(day, set(days), issues)

    latest = days[-1]

    home = read(os.path.join(SITE, "index.html"))
    heads = HEADLINE_RE.findall(home)
    latest_n = day_info[latest][0]
    if [(d, int(i)) for d, i in heads] != [(latest, i) for i in range(1, latest_n + 1)]:
        issues.append(
            f"index.html: 見出しリンクが最新日 {latest} の #article-1..{latest_n} と一致しない: {heads}"
        )
    for target in set(INTERNAL_LINK_RE.findall(home)):
        if target not in days:
            issues.append(f"index.html: 内部リンク先 /{target}/ が実在しない")
    recent_seen = check_day_cards(home, "index.html", set(days), day_info, issues)
    expected_recent = list(reversed(days[:-1]))[:9]
    if sorted(recent_seen) != sorted(expected_recent):
        issues.append(
            f"index.html: RECENT_DAYS が直近9日と不一致: got={sorted(recent_seen, reverse=True)} expect={sorted(expected_recent, reverse=True)}"
        )

    arch = read(os.path.join(SITE, "archive", "index.html"))
    m = HERO_META_RE.search(arch)
    if not m:
        issues.append("archive/index.html: hero の日数表示が見つからない")
    elif int(m.group(1)) != len(days):
        issues.append(f"archive/index.html: hero {m.group(1)}日分 != 実際 {len(days)}日")
    arch_seen = check_day_cards(arch, "archive/index.html", set(days), day_info, issues)
    missing = [d for d in days if d not in arch_seen]
    if missing:
        issues.append(f"archive/index.html: day-card が無い日: {missing}")
    for target in set(INTERNAL_LINK_RE.findall(arch)):
        if target not in days:
            issues.append(f"archive/index.html: 内部リンク先 /{target}/ が実在しない")

    if issues:
        print(f"NG: {len(issues)} 件の不整合\n")
        for i in issues:
            print(" -", i)
        sys.exit(1)
    print(f"OK: {len(days)}日分 + home + archive、不整合なし (記事総数 {sum(v[0] for v in day_info.values())})")
    sys.exit(0)


if __name__ == "__main__":
    main()
