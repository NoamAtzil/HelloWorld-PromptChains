import Link from "next/link";
import { Icon } from "./icons";
import { LocalTime } from "./local-time";
import { RunStatusChip, Thumb } from "./ui";
import { voiceTheme } from "@/lib/voice-theme";
import type { Run } from "@/lib/types";

export type GalleryRun = Pick<Run, "id" | "chain_id" | "chain_name" | "voice_id" | "status" | "final_output" | "image_path" | "image_title" | "created_at">;

// A portfolio wall: photos keep their natural proportions, captions are set in
// the display serif, and each card opens the full result.
export function RunGallery({ runs, urls, showChain = false }: { runs: GalleryRun[]; urls: Map<string, string>; showChain?: boolean }) {
  return (
    <ul className="columns-1 gap-5 sm:columns-2 xl:columns-3 [&>li]:mb-5">
      {runs.map((run, i) => (
        <li key={run.id} className="rise break-inside-avoid" style={{ "--i": Math.min(i, 9) } as React.CSSProperties}>
          <Link href={`/runs/${run.id}`} className="panel lift group block overflow-hidden !rounded-[1.6rem]">
            <div className="relative min-h-48 overflow-hidden bg-tint">
              <Thumb src={urls.get(run.image_path)} alt={run.image_title || `Photo for result ${run.id}`} className="h-auto w-full transition-transform duration-700 group-hover:scale-[1.04]" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-[#211a14] opacity-0 shadow-lg transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 translate-y-1">
                View result <Icon name="arrow" className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="liquid liquid-strong relative z-10 mx-3 -mt-14 mb-3 flex flex-col gap-3 rounded-2xl p-4 transition-transform duration-500 ease-[var(--ease-out)] group-hover:-translate-y-1.5">
              <p className="caption-text text-[1.25rem]">
                {run.final_output ? <>&ldquo;{run.final_output}&rdquo;</> : run.status === "running" ? "Still being written…" : "This run stopped before a caption was written."}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
                {showChain && (
                  <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-ink-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: voiceTheme(run.voice_id).from }} aria-hidden="true" />
                    <span className="truncate">{run.chain_name}</span>
                    {run.chain_id === null && <span className="chip chip-mute">deleted</span>}
                  </span>
                )}
                {run.status !== "succeeded" && <RunStatusChip status={run.status} />}
                <LocalTime iso={run.created_at} className="ml-auto" />
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
