"use client";

import { useTimeZone } from "@/lib/use-time-zone";
import { formatClock, formatDay, formatStamp } from "@/lib/time";

const FORMATS = { stamp: formatStamp, clock: formatClock, day: formatDay };

// A timestamp in the viewer's own time zone ("Nov 3, 4:25 PM").
export function LocalTime({ iso, variant = "stamp", className }: { iso: string; variant?: keyof typeof FORMATS; className?: string }) {
  const timeZone = useTimeZone();
  return (
    <time dateTime={iso} className={className}>
      {FORMATS[variant](iso, timeZone)}
    </time>
  );
}
