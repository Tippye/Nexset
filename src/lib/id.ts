let counter = 0;

/**
 * Sortable unique id: millisecond timestamp + per-process counter + random tail.
 * No external deps; collision-safe enough for a local-first, few-devices app.
 */
export function newId(): string {
  counter = (counter + 1) % 1296; // 36^2
  const time = Date.now().toString(36).padStart(9, '0');
  const count = counter.toString(36).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  return `${time}${count}${rand}`;
}

/** Local calendar date as YYYY-MM-DD. */
export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
