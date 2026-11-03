import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { formatDateTime, formatLatency } from "@/lib/format";
import { signedImageUrls } from "@/lib/media";
import { voiceLabel } from "@/lib/voices";
import { Notice, PageHeader, RunStatusChip, Thumb } from "@/components/ui";
import type { Run } from "@/lib/types";
import { DeleteRun } from "./delete-run";

export default async function RunPage(props: PageProps<"/runs/[id]">) {
  const { supabase } = await requireAdmin();
  const id = Number((await props.params).id);
  if (!Number.isSafeInteger(id)) notFound();

  const { data: run } = await supabase.from("prompt_chain_runs").select("*").eq("id", id).maybeSingle<Run>();
  if (!run) notFound();
  const urls = await signedImageUrls(supabase, [run.image_path]);
  const total = run.steps.length;

  return (
    <>
      <PageHeader
        title={run.chain_name}
        description={`Run #${run.id} · ${formatDateTime(run.created_at)}`}
        back={{ href: run.chain_id ? `/chains/${run.chain_id}` : "/history", label: run.chain_id ? "Back to the chain" : "Run history" }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RunStatusChip status={run.status} />
            {run.chain_id === null && <span className="chip chip-mute">deleted chain</span>}
            {voiceLabel(run.voice_id) && <span className="chip">Voice: {voiceLabel(run.voice_id)}</span>}
          </div>
        }
      />

      {run.chain_id === null && (
        <Notice tone="ok">This chain was deleted. The run keeps its own copy of the steps, outputs and photo.</Notice>
      )}
      {run.status === "failed" && (
        <Notice tone="warn">
          This run stopped after {run.steps_done} of {total} steps{run.error_code ? ` (${run.error_code})` : ""}.
        </Notice>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
          <div className="panel overflow-hidden rounded-2xl">
            <Thumb src={urls.get(run.image_path)} alt={run.image_title || "Input photo"} className="max-h-96 w-full" />
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 p-4 text-sm">
              <dt className="text-muted">Source</dt>
              <dd>{run.image_source === "library" ? "Library" : "Upload"}{run.image_title ? ` · ${run.image_title}` : ""}</dd>
              <dt className="text-muted">Model</dt>
              <dd className="font-mono text-xs leading-5">{run.model}</dd>
              {run.completed_at && (<><dt className="text-muted">Finished</dt><dd>{formatDateTime(run.completed_at)}</dd></>)}
            </dl>
          </div>
          {run.input_text && (
            <div className="panel rounded-2xl p-4">
              <p className="label">Your context</p>
              <p className="whitespace-pre-wrap text-sm">{run.input_text}</p>
            </div>
          )}
          <DeleteRun runId={run.id} />
        </aside>

        <div className="flex min-w-0 flex-col">
          {run.final_output && (
            <div className="plate mb-5 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-accent-text">Final caption</p>
              <p className="font-display mt-1 text-xl font-semibold leading-snug">{run.final_output}</p>
            </div>
          )}
          <ol className="flex flex-col" aria-label="Steps">
            {run.steps.map((step, i) => {
              const out = run.step_outputs[i];
              return (
                <li key={i}>
                  <article className="panel flex gap-3 rounded-2xl p-4">
                    <span className="step-badge" data-state={out ? "done" : "pending"} aria-hidden="true">{out ? "✓" : i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Step {i + 1}
                        {out && <span className="ml-2 font-normal normal-case tracking-normal">{formatLatency(out.latency_ms)}</span>}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{step.instruction}</p>
                      <div className="mt-2 rounded-xl bg-tint/60 px-3 py-2 text-sm">
                        {out ? <p className="whitespace-pre-wrap">{out.output}</p> : <p className="text-muted">Not run.</p>}
                      </div>
                    </div>
                  </article>
                  {i < total - 1 && <div className="link-line" aria-hidden="true" />}
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-sm text-muted">
            <Link href="/history" className="font-medium text-accent-text hover:underline">All runs</Link>
          </p>
        </div>
      </div>
    </>
  );
}
