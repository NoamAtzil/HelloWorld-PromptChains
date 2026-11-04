// Time helpers that take the viewer's time zone explicitly. The server renders
// in UTC; the browser re-renders in its own zone (see components/local-time.tsx
// and use-time-zone.ts), so "Today" and clock times are right for the person
// looking at them.
//
// HYDRATION SAFETY: no engine's Intl is allowed to write the TEXT. Browsers
// (and Node) differ in how they punctuate dates: Safari renders "Nov 3 at
// 10:25 PM" where Node renders "Nov 3, 10:25 PM", and newer ICU puts a narrow
// no-break space before AM/PM. If the server and the browser disagree, React
// throws a hydration error. So Intl is used only for what it is reliable at,
// time-zone arithmetic, and only its NUMERIC parts are read. The words and
// punctuation come from the fixed tables below, so every engine produces the
// same characters for the same instant and zone. Pure and unit-tested.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const short = (name: string) => name.slice(0, 3);

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

type Zoned = { y: number; m: number; d: number; h: number; min: number };

/** The calendar date and clock time of an instant in a time zone, as plain numbers. */
function zoned(iso: string, timeZone: string): Zoned {
  const parts = formatterFor(timeZone).formatToParts(new Date(iso));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: n("year"), m: n("month"), d: n("day"), h: n("hour") % 24, min: n("minute") };
}

const pad = (n: number) => String(n).padStart(2, "0");

function clock12({ h, min }: Zoned) {
  return `${h % 12 || 12}:${pad(min)} ${h < 12 ? "AM" : "PM"}`;
}

export function dayKey(iso: string, timeZone: string): string {
  const { y, m, d } = zoned(iso, timeZone);
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function shiftKey(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dayLabel(key: string, todayKey: string): string {
  if (key === todayKey) return "Today";
  if (key === shiftKey(todayKey, -1)) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const sameYear = key.slice(0, 4) === todayKey.slice(0, 4);
  return `${weekday}, ${MONTHS[m - 1]} ${d}${sameYear ? "" : `, ${y}`}`;
}

/** "10:25 PM" */
export function formatClock(iso: string, timeZone: string): string {
  return clock12(zoned(iso, timeZone));
}

/** "Nov 3, 10:25 PM" */
export function formatStamp(iso: string, timeZone: string): string {
  const z = zoned(iso, timeZone);
  return `${short(MONTHS[z.m - 1])} ${z.d}, ${clock12(z)}`;
}

/** "Nov 3, 2026" */
export function formatDay(iso: string, timeZone: string): string {
  const z = zoned(iso, timeZone);
  return `${short(MONTHS[z.m - 1])} ${z.d}, ${z.y}`;
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
