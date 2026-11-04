"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { LocalTime } from "@/components/local-time";
import { RunStatusChip, Thumb } from "@/components/ui";
import { groupByDay } from "@/lib/time";
import { useTimeZone } from "@/lib/use-time-zone";
import { voiceTheme } from "@/lib/voice-theme";

export type TimelineRun = {
  id: number;
  chain_id: number | null;
  chain_name: string;
  voice_id: string | null;
  status: string;
  steps_done: number;
  total: number;
  final_output: string | null;
  imageUrl: string | undefined;
  created_at: string;
  outputs: string[];
};

// A day-by-day timeline. Days are computed in the viewer's own time zone.
// `nowIso` comes from the server so "Today" is the same instant during server
// render and hydration (reading the clock while rendering could disagree
// across midnight).
export function Timeline({ runs, nowIso }: { runs: TimelineRun[]; nowIso: string }) {
  const timeZone = useTimeZone();
  const groups = groupByDay(runs, (r) => r.created_at, timeZone, new Date(nowIso));

  return (
    <div className="flex flex-col gap-9">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <h2 className="mb-4 flex items-center gap-3 text-xl">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-tint text-accent-text"><Icon name="clock" className="h-3.5 w-3.5" /></span>
            {group.label}
            <span className="text-sm font-normal text-muted">{group.items.length}</span>
          </h2>
          <ol className="ml-3.5 flex flex-col gap-4 border-l-2 border-line pl-6 sm:pl-8">
            {group.items.map((run) => (
              <li key={run.id} className="relative">
                <span className="absolute -left-[2.05rem] top-6 h-3 w-3 rounded-full ring-4 ring-bg sm:-left-[2.55rem]" style={{ background: voiceTheme(run.voice_id).from }} aria-hidden="true" />
                <article className="panel overflow-hidden sm:flex">
                  <Link href={`/runs/${run.id}`} className="relative block h-44 shrink-0 overflow-hidden sm:h-auto sm:min-h-[9.5rem] sm:w-44" aria-label={`Open result ${run.id}`}>
                    <Thumb src={run.imageUrl} alt="" className="absolute inset-0 h-full w-full" />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2">
                        {run.chain_name}
                        {run.chain_id === null && <span className="chip chip-mute">deleted chain</span>}
                      </span>
                      <RunStatusChip status={run.status} />
                      <LocalTime iso={run.created_at} variant="clock" className="ml-auto" />
                    </div>
                    <p className="caption-text text-xl">
                      {run.final_output ? <>&ldquo;{run.final_output}&rdquo;</> : <span className="text-base text-muted">Stopped after {run.steps_done} of {run.total} steps.</span>}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      {run.outputs.length > 0 && (
                        <details className="group min-w-0 flex-1 basis-full">
                          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-accent-text marker:content-none">
                            <Icon name="down" className="h-4 w-4 transition-transform group-open:rotate-180" />
                            See the thinking · {run.outputs.length} step{run.outputs.length === 1 ? "" : "s"}
                          </summary>
                          <ol className="mt-3 flex flex-col gap-2">
                            {run.outputs.map((out, i) => (
                              <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink-2">
                                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-tint-2 text-xs font-bold text-muted">{i + 1}</span>
                                <span className="whitespace-pre-wrap">{out}</span>
                              </li>
                            ))}
                          </ol>
                        </details>
                      )}
                      <Link href={`/runs/${run.id}`} className="group/open ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-accent-text">
                        Open result <Icon name="arrow" className="h-4 w-4 transition-transform group-hover/open:translate-x-0.5" />
                      </Link>
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
