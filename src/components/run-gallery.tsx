import Link from "next/link";
import { RunStatusChip, Thumb } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { Run } from "@/lib/types";

export type GalleryRun = Pick<Run, "id" | "chain_id" | "chain_name" | "status" | "final_output" | "image_path" | "image_title" | "created_at">;

// Photo + the caption the chain produced. Each card opens the full run.
export function RunGallery({ runs, urls, showChain = false }: { runs: GalleryRun[]; urls: Map<string, string>; showChain?: boolean }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {runs.map((run, i) => (
        <li key={run.id} className="rise" style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
          <Link
            href={`/runs/${run.id}`}
            className="panel group flex h-full flex-col overflow-hidden rounded-2xl transition-transform hover:-translate-y-0.5 hover:shadow-[var(--shadow-glow)]"
          >
            <Thumb
              src={urls.get(run.image_path)}
              alt={run.image_title || `Photo for run ${run.id}`}
              className="aspect-[4/3] w-full"
            />
            <div className="flex flex-1 flex-col gap-2 p-4">
              <p className="font-display text-base font-semibold leading-snug">
                {run.final_output ?? (run.status === "running" ? "Still running…" : "No caption: the run did not finish.")}
              </p>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-xs text-muted">
                {showChain && (
                  <span className="truncate font-medium text-ink">
                    {run.chain_name}
                    {run.chain_id === null && <span className="chip chip-mute ml-1.5">deleted</span>}
                  </span>
                )}
                {run.status !== "succeeded" && <RunStatusChip status={run.status} />}
                <span className="ml-auto">{formatDateTime(run.created_at)}</span>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
