// Time helpers that take the viewer's time zone explicitly. The server renders
// in UTC; the browser re-renders in its own zone (see components/local-time.tsx
// and use-time-zone.ts), so "Today" and clock times are right for the person
// looking at them. Pure and unit-tested.

export function dayKey(iso: string, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function shiftKey(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dayLabel(key: string, todayKey: string): string {
  if (key === todayKey) return "Today";
  if (key === shiftKey(todayKey, -1)) return "Yesterday";
  const sameYear = key.slice(0, 4) === todayKey.slice(0, 4);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(new Date(`${key}T12:00:00Z`));
}

export function formatClock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function formatStamp(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(
    new Date(iso),
  );
}

export function formatDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

/** Groups items (already sorted) into consecutive day buckets in `timeZone`. */
export function groupByDay<T>(items: T[], getIso: (item: T) => string, timeZone: string, now: Date = new Date()) {
  const today = dayKey(now.toISOString(), timeZone);
  const groups: { key: string; label: string; items: T[] }[] = [];
  for (const item of items) {
    const key = dayKey(getIso(item), timeZone);
    const last = groups.at(-1);
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: dayLabel(key, today), items: [item] });
  }
  return groups;
}
