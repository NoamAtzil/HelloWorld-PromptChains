import Link from "next/link";
import { voiceLabel } from "@/lib/voices";
import { coverGradient } from "@/lib/voice-theme";
import { stagesFor } from "@/lib/stages";
import { Icon } from "@/components/icons";
import { JourneyTrack } from "@/components/journey";
import { LocalTime } from "@/components/local-time";
import { RunStatusChip, Thumb } from "@/components/ui";
import type { Chain, LibraryImage, Step } from "@/lib/types";
import { ChainForm } from "@/app/(app)/chains/chain-form";
import { DeleteChain } from "@/app/(app)/chains/delete-chain";
import { updateChain } from "@/app/(app)/chains/actions";
import { RunPanel } from "@/app/(app)/chains/[id]/run-panel";
import { StepList } from "@/app/(app)/chains/[id]/step-list";

export type RecentRun = { id: number; status: string; final_output: string | null; created_at: string; imageUrl: string | undefined };

export type ChainViewProps = {
  chain: Chain;
  steps: Step[];
  library: (LibraryImage & { url: string })[];
  recent: RecentRun[];
  runCount: number;
  notRunnableReason: string | null;
};

// Presentational: all data is prepared by the page (or a preview harness).
export function ChainView({ chain, steps: stepRows, library, recent: recentRuns, runCount: count, notRunnableReason: reason }: ChainViewProps) {
  const id = chain.id;
  return (
    <>
      <div className="flex flex-col gap-4">
        <Link href="/" className="group inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-accent-text">
          <Icon name="arrow" className="h-4 w-4 rotate-180 transition-transform group-hover:-translate-x-0.5" /> All chains
        </Link>

        <section className="panel relative overflow-hidden !rounded-[1.75rem]" aria-labelledby="chain-title">
          <div className="h-1.5 w-full" style={{ background: coverGradient(chain.voice_id) }} aria-hidden="true" />
          <div className="flex flex-col gap-7 p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`chip ${chain.is_active ? "chip-ok" : "chip-mute"}`}>{chain.is_active ? "Active" : "Inactive"}</span>
                  {voiceLabel(chain.voice_id) && <span className="chip">Voice · {voiceLabel(chain.voice_id)}</span>}
                  <span className="chip chip-mute">{stepRows.length} step{stepRows.length === 1 ? "" : "s"}</span>
                </div>
                <h1 id="chain-title" className="mt-3 text-4xl leading-[1.05] sm:text-5xl">{chain.name}</h1>
                {chain.description && <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-2">{chain.description}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/chains/${id}/media`} className="btn-quiet btn-sm"><Icon name="gallery" /> Gallery</Link>
                <Link href={`/history?chain=${id}`} className="btn-quiet btn-sm"><Icon name="history" /> History</Link>
                <a href="#studio" className="btn-primary btn-sm lg:hidden"><Icon name="spark" /> Jump to the studio</a>
              </div>
            </div>
            <div className="rounded-2xl bg-sunken px-4 py-5 ring-1 ring-line sm:px-8">
              <JourneyTrack stages={stagesFor(stepRows.length)} />
            </div>
          </div>
        </section>
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="flex min-w-0 flex-col gap-10">
          <section aria-labelledby="steps-title" className="flex flex-col gap-5">
            <div>
              <p className="eyebrow">The recipe</p>
              <h2 id="steps-title" className="mt-1 text-3xl">Steps</h2>
              <p className="mt-1 text-sm text-muted">Drag the handle, or use the arrows, to change the order. Changes to the order save instantly.</p>
            </div>
            <StepList chainId={id} steps={stepRows} />
          </section>

          <details className="panel group p-5 sm:p-6">
            <summary className="flex cursor-pointer list-none items-center gap-3 marker:content-none">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-tint text-accent-text"><Icon name="settings" /></span>
              <span className="flex-1">
                <span className="display block text-lg leading-tight">Chain settings</span>
                <span className="text-xs text-muted">Name, description, voice, and whether it can be run</span>
              </span>
              <Icon name="down" className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-5 border-t border-line pt-5">
              <ChainForm action={updateChain.bind(null, id)} chain={chain} submitLabel="Save settings" />
            </div>
          </details>

          <DeleteChain chainId={id} name={chain.name} runCount={count} />
        </div>

        <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-24">
          <RunPanel
            chainId={id}
            steps={stepRows.map((s) => ({ id: s.id, instruction: s.instruction }))}
            library={library}
            runnable={reason === null}
            notRunnableReason={reason}
          />

          <section className="panel p-5" aria-labelledby="recent-title">
            <div className="flex items-center justify-between">
              <h2 id="recent-title" className="text-xl">Recent results</h2>
              {(count) > 0 && <Link href={`/history?chain=${id}`} className="text-sm font-semibold text-accent-text hover:underline">All {count}</Link>}
            </div>
            {recentRuns.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Nothing yet. Your first run will show up here.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-1">
                {recentRuns.map((run) => (
                  <li key={run.id}>
                    <Link href={`/runs/${run.id}`} className="-mx-2 flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-tint/70">
                      <Thumb src={run.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg" />
                      <span className="min-w-0 flex-1">
                        <span className="caption-text line-clamp-1 block text-[0.95rem]">{run.final_output ?? "Unfinished run"}</span>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                          {run.status !== "succeeded" && <RunStatusChip status={run.status} />}
                          <LocalTime iso={run.created_at} />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
