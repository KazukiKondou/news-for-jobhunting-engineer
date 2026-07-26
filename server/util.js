// テンプレート出力とHTTPまわりの小さなヘルパー。

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** 文字列をHTMLテキストとして安全にする。 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/**
 * 要約は数値強調の <strong> だけ許可する。
 * まず全体をエスケープしてから <strong> のみ復元するので、他のタグは通らない。
 */
export function renderSummary(value) {
  return escapeHtml(value)
    .replace(/&lt;strong&gt;/g, '<strong>')
    .replace(/&lt;\/strong&gt;/g, '</strong>');
}

const JST_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' });

/** JSTの「今日」を YYYY-MM-DD で返す。 */
export function todayInJst() {
  return JST_DATE.format(new Date());
}

/** YYYY-MM-DD から N日ずらした日付文字列を作る。 */
export function shiftDate(date, days) {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function weekdayOf(date) {
  const [year, month, day] = date.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

/** 2026-01-02 → 1/2 (金) */
export function shortDateLabel(date) {
  const [, month, day] = date.split('-').map(Number);
  return `${month}/${day} (${weekdayOf(date)})`;
}

/** 2026-01-02 → 2026年1月2日 (金) */
export function longDateLabel(date) {
  const [year, month, day] = date.split('-').map(Number);
  return `${year}年${month}月${day}日 (${weekdayOf(date)})`;
}

export function parseCookies(header) {
  const jar = {};
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    jar[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return jar;
}

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function serializeCookie(name, value) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax; HttpOnly`;
}

export function randomVisitorId() {
  return crypto.randomUUID();
}

/** 1234 → "1,234" */
export function formatCount(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}
