const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const w = WEEKDAYS_JA[date.getDay()];
  return `${y}年${m}月${d}日 (${w})`;
}

export function formatDateShort(date: Date): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const w = WEEKDAYS_JA[date.getDay()];
  return `${m}/${d} (${w})`;
}

export function toSlug(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatIso(date: Date): string {
  return date.toISOString().split('T')[0];
}
