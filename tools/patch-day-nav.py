#!/usr/bin/env python3
"""
patch-day-nav.py — one-shot, idempotent migration of existing daily pages to the
3-slot day-nav (prev | latest | next/status) + runtime self-healing assets.

For every site/YYYY-MM-DD/index.html (sorted ascending) this script:
  1. Computes prev / next / isLatest from the directory list.
  2. Replaces the whole <nav class="day-nav">...</nav> with the canonical 3-slot
     markup (data-date set; prev <a> omitted on the oldest page; right slot is a
     day-nav__status on the latest page, otherwise a day-nav__btn--next).
  3. Inserts <script src="/assets/day-nav.js?v=1" defer></script> before </body>
     (deduped).
  4. Rebuilds head <link rel="prev"> / <link rel="next"> right after the
     canonical link (strips any pre-existing rel=prev/next links first).
  5. Bumps style.css?v=2 -> ?v=3.

home (site/index.html), 404 (site/404.html) and archive (site/archive/index.html)
get the ?v=2 -> ?v=3 bump ONLY; their nav is left untouched.

Idempotent: re-running yields byte-identical output.

Usage:
    python3 tools/patch-day-nav.py            # patch in place
    python3 tools/patch-day-nav.py --check    # report would-change files, no write
"""

import os
import re
import sys
import glob

SITE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "site")

NAV_RE = re.compile(r'<nav class="day-nav".*?</nav>', re.DOTALL)
SCRIPT_TAG = '<script src="/assets/day-nav.js?v=1" defer></script>'
SCRIPT_RE = re.compile(r'[ \t]*<script src="/assets/day-nav\.js[^"]*"[^>]*></script>\n')
REL_LINK_RE = re.compile(r'[ \t]*<link rel="(?:prev|next)"[^>]*/?>\n')
CANONICAL_RE = re.compile(r'(<link rel="canonical"[^>]*/?>\n)')


def fmt_label(iso):
    """'2026-06-13' -> '2026年6月13日' (no leading zeros)."""
    y, m, d = iso.split("-")
    return "{}年{}月{}日".format(int(y), int(m), int(d))


def build_nav(date_iso, prev, nxt):
    parts = ['<nav class="day-nav" aria-label="日付ナビゲーション" data-date="{}">'.format(date_iso)]

    if prev:
        parts.append(
            '        <a class="day-nav__btn day-nav__btn--prev" href="/{p}/" rel="prev" aria-label="前の日のニュース {pl}へ">\n'
            '          <span class="day-nav__label">\n'
            '            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>\n'
            '            前の日\n'
            '          </span>\n'
            '          <span class="day-nav__date">{pl}</span>\n'
            '        </a>'.format(p=prev, pl=fmt_label(prev))
        )

    parts.append(
        '        <a class="day-nav__btn day-nav__btn--latest" href="/" aria-label="最新の日のニュースへ">\n'
        '          最新の日へ\n'
        '          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 17 5-5-5-5M13 17l5-5-5-5"/></svg>\n'
        '        </a>'
    )

    if nxt:
        parts.append(
            '        <a class="day-nav__btn day-nav__btn--next" href="/{n}/" rel="next" aria-label="次の日のニュース {nl}へ">\n'
            '          <span class="day-nav__label">\n'
            '            次の日\n'
            '            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>\n'
            '          </span>\n'
            '          <span class="day-nav__date">{nl}</span>\n'
            '        </a>'.format(n=nxt, nl=fmt_label(nxt))
        )
    else:
        parts.append(
            '        <div class="day-nav__status" role="status">\n'
            '          <svg class="day-nav__status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>\n'
            '          <span class="day-nav__status-text">最新の記事です</span>\n'
            '        </div>'
        )

    parts.append('      </nav>')
    return "\n".join(parts)


def build_head_links(prev, nxt):
    """rel=prev / rel=next link tags (indented 2 spaces to match head block)."""
    out = ""
    if prev:
        out += '  <link rel="prev" href="/{}/" />\n'.format(prev)
    if nxt:
        out += '  <link rel="next" href="/{}/" />\n'.format(nxt)
    return out


def bump_css(text):
    return text.replace("/assets/style.css?v=2", "/assets/style.css?v=3")


def patch_daily(path, date_iso, prev, nxt):
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    orig = text

    # 1. nav block
    nav_html = build_nav(date_iso, prev, nxt)
    if not NAV_RE.search(text):
        raise RuntimeError("no <nav class=\"day-nav\"> found in {}".format(path))
    text = NAV_RE.sub(lambda _m: nav_html, text, count=1)

    # 2. head rel links: strip existing, then re-insert right after canonical
    text = REL_LINK_RE.sub("", text)
    head_links = build_head_links(prev, nxt)
    if head_links:
        text = CANONICAL_RE.sub(lambda m: m.group(1) + head_links, text, count=1)

    # 3. day-nav.js script before </body> (dedupe first)
    text = SCRIPT_RE.sub("", text)
    text = text.replace("</body>", "  " + SCRIPT_TAG + "\n</body>", 1)

    # 4. css version
    text = bump_css(text)

    changed = text != orig
    if changed:
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
    return changed


def patch_css_only(path):
    if not os.path.exists(path):
        return False
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    new = bump_css(text)
    if new != text:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new)
        return True
    return False


def main():
    check = "--check" in sys.argv

    dirs = sorted(
        os.path.basename(os.path.dirname(p))
        for p in glob.glob(os.path.join(SITE, "20[0-9][0-9]-[0-1][0-9]-[0-3][0-9]", "index.html"))
    )
    if not dirs:
        print("no daily pages found under", SITE, file=sys.stderr)
        return 1

    changed = []
    for i, date_iso in enumerate(dirs):
        prev = dirs[i - 1] if i > 0 else None
        nxt = dirs[i + 1] if i < len(dirs) - 1 else None
        path = os.path.join(SITE, date_iso, "index.html")
        if check:
            with open(path, "r", encoding="utf-8") as f:
                before = f.read()
            # dry-run by simulating in a temp copy via in-memory compare
            tmp = before
            tmp = NAV_RE.sub(lambda _m: build_nav(date_iso, prev, nxt), tmp, count=1)
            tmp = REL_LINK_RE.sub("", tmp)
            hl = build_head_links(prev, nxt)
            if hl:
                tmp = CANONICAL_RE.sub(lambda m: m.group(1) + hl, tmp, count=1)
            tmp = SCRIPT_RE.sub("", tmp)
            tmp = tmp.replace("</body>", "  " + SCRIPT_TAG + "\n</body>", 1)
            tmp = bump_css(tmp)
            if tmp != before:
                changed.append(date_iso)
        else:
            if patch_daily(path, date_iso, prev, nxt):
                changed.append(date_iso)

    # home / 404 / archive: css bump only (nav left untouched)
    css_only = []
    for rel in ("index.html", "404.html", os.path.join("archive", "index.html")):
        p = os.path.join(SITE, rel)
        if not os.path.exists(p):
            continue
        if check:
            with open(p, "r", encoding="utf-8") as f:
                if "style.css?v=2" in f.read():
                    css_only.append(rel)
        else:
            if patch_css_only(p):
                css_only.append(rel)

    verb = "would patch" if check else "patched"
    print("daily pages {}: {} ({} files)".format(verb, ", ".join(changed) or "none", len(changed)))
    print("css-only {}: {}".format(verb, ", ".join(css_only) or "none"))
    print("total daily pages scanned:", len(dirs))
    return 0


if __name__ == "__main__":
    sys.exit(main())
