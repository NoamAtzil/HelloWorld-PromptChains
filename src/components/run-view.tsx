import Link from "next/link";
import { formatLatency } from "@/lib/format";
import { stagesFor } from "@/lib/stages";
import { voiceLabel } from "@/lib/voices";
import { CopyButton } from "@/components/copy-button";
import { Icon } from "@/components/icons";
import { JourneyTrack } from "@/components/journey";
import { Lightbox } from "@/components/lightbox";
import { LocalTime } from "@/components/local-time";
import { Notice, PageHeader, RunStatusChip, Thumb } from "@/components/ui";
import type { Run } from "@/lib/types";
import { DeleteRun } from "@/app/(app)/runs/[id]/delete-run";

// Presentational: the page (or a preview harness) supplies the run and photo URL.
export function RunView({ run, url }: { run: Run; url: string | undefined }) {
  const total = run.steps.length;
  const stages = stagesFor(total);
  const totalMs = run.step_outputs.reduce((n, o) => n + (o.latency_ms || 0), 0);
  const alt = run.image_title || "The photo that was captioned";

  return (
    <>
      <PageHeader
        eyebrow={`Result · run #${run.id}`}
        title={run.chain_name}
        back={run.chain_id ? { href: `/chains/${run.chain_id}`, label: "Back to the chain" } : { href: "/history", label: "History" }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RunStatusChip status={run.status} />
            {run.chain_id === null && <span className="chip chip-mute">deleted chain</span>}
            {voiceLabel(run.voice_id) && <span className="chip">Voice · {voiceLabel(run.voice_id)}</span>}
          </div>
        }
      />

      {run.chain_id === null && <Notice tone="ok">This chain has been deleted. The result keeps its own copy of the steps, outputs, and photo.</Notice>}
      {run.status === "failed" && (
        <Notice tone="warn">This run stopped after {run.steps_done} of {total} steps{run.error_code ? ` (${run.error_code})` : ""}.</Notice>
      )}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-10">
        <div className="flex flex-col gap-5 lg:sticky lg:top-24">
          <figure className="panel overflow-hidden !rounded-[1.75rem] !shadow-[var(--shadow-lg)]">
            {url ? (
              <Lightbox src={url} alt={alt}>
                <Thumb src={url} alt={alt} className="max-h-[34rem] w-full" />
              </Lightbox>
            ) : (
              <Thumb src={undefined} alt={alt} className="h-64 w-full" />
            )}
          </figure>

          {run.final_output && (
            <div className="result-card flex flex-col gap-4 p-6">
              <p className="eyebrow flex items-center gap-1.5"><Icon name="quote" className="h-3.5 w-3.5" /> Final caption</p>
              <p className="caption-text text-[1.7rem] sm:text-3xl">&ldquo;{run.final_output}&rdquo;</p>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={run.final_output} className="btn-primary btn-sm" />
                {run.chain_id !== null && <Link href={`/chains/${run.chain_id}`} className="btn-quiet btn-sm"><Icon name="retry" /> Run again</Link>}
                <Link href="/media" className="btn-ghost btn-sm"><Icon name="gallery" /> Gallery</Link>
              </div>
            </div>
          )}

          {run.input_text && (
            <blockquote className="rounded-2xl bg-sunken px-5 py-4 ring-1 ring-line">
              <p className="label !mb-1">Your hint</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{run.input_text}</p>
            </blockquote>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-7">
          <section aria-labelledby="made-title" className="flex flex-col gap-5">
            <div>
              <p className="eyebrow">Behind the caption</p>
              <h2 id="made-title" className="mt-1 text-3xl">How it was made</h2>
            </div>
            <div className="rounded-2xl bg-sunken px-4 py-5 ring-1 ring-line sm:px-6">
              <JourneyTrack stages={stages} mode="run" done={run.steps_done} complete={run.status === "succeeded"} compact />
            </div>

            <ol className="flex flex-col gap-5" aria-label="Steps">
              {run.steps.map((step, i) => {
                const out = run.step_outputs[i];
                const stage = stages[i];
                return (
                  <li key={i} className="thread grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4">
                    <span className="step-badge" data-state={out ? "done" : "pending"} aria-hidden="true">
                      {out ? <Icon name="check" className="h-4 w-4" strokeWidth={2.6} /> : i + 1}
                    </span>
                    <article className="panel p-4 sm:p-5">
                      <header className="flex items-center gap-2.5">
                        <span className="grid h-7 w-7 place-items-center rounded-lg bg-tint text-accent-text"><Icon name={stage.icon} className="h-3.5 w-3.5" /></span>
                        <h3 className="text-lg">{stage.label}</h3>
                        {out && <span className="ml-auto text-xs text-muted">{formatLatency(out.latency_ms)}</span>}
                      </header>
                      <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-muted">{step.instruction}</p>
                      <div className="mt-3 rounded-xl bg-sunken px-3.5 py-3 text-sm leading-relaxed ring-1 ring-line">
                        {out ? <p className="whitespace-pre-wrap">{out.output}</p> : <p className="text-muted">This step did not run.</p>}
                      </div>
                    </article>
                  </li>
                );
              })}
            </ol>
          </section>

          <dl className="panel grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 p-5 text-sm">
            <dt className="text-muted">Photo</dt>
            <dd>{run.image_source === "library" ? "From the library" : "Uploaded"}{run.image_title ? ` · ${run.image_title}` : ""}</dd>
            <dt className="text-muted">Model</dt>
            <dd className="font-mono text-xs leading-5">{run.model}</dd>
            <dt className="text-muted">Started</dt>
            <dd><LocalTime iso={run.created_at} /></dd>
            {totalMs > 0 && (<><dt className="text-muted">Thinking time</dt><dd>{formatLatency(totalMs)}</dd></>)}
          </dl>

          <DeleteRun runId={run.id} />
        </div>
      </div>
    </>
  );
}
