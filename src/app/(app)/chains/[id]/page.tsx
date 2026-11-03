import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { voiceLabel } from "@/lib/voices";
import { libraryUrl } from "@/lib/media";
import { MAX_STEPS_PER_RUN } from "@/lib/prompt";
import { formatDateTime } from "@/lib/format";
import { PageHeader, RunStatusChip } from "@/components/ui";
import type { Chain, LibraryImage, Step } from "@/lib/types";
import { ChainForm } from "../chain-form";
import { DeleteChain } from "../delete-chain";
import { updateChain } from "../actions";
import { RunPanel } from "./run-panel";
import { StepList } from "./step-list";

// Chain steps call Gemini through server actions on this route.
export const maxDuration = 60;

export default async function ChainPage(props: PageProps<"/chains/[id]">) {
  const { supabase } = await requireAdmin();
  const id = Number((await props.params).id);
  if (!Number.isSafeInteger(id)) notFound();

  const [{ data: chain }, { data: steps }, { data: images }, { data: recent, count }] = await Promise.all([
    supabase.from("prompt_chains").select("*").eq("id", id).maybeSingle<Chain>(),
    supabase.from("prompt_chain_steps").select("*").eq("chain_id", id).order("position", { ascending: true }).returns<Step[]>(),
    supabase
      .from("images")
      .select("id, storage_path, title")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(60)
      .returns<LibraryImage[]>(),
    supabase
      .from("prompt_chain_runs")
      .select("id, status, final_output, created_at", { count: "exact" })
      .eq("chain_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  if (!chain) notFound();

  const stepRows = steps ?? [];
  let reason: string | null = null;
  if (!chain.is_active) reason = "This chain is inactive. Turn on “Active” in its settings to run it.";
  else if (stepRows.length === 0) reason = "Add at least one step before running this chain.";
  else if (stepRows.length > MAX_STEPS_PER_RUN) reason = `Only chains with up to ${MAX_STEPS_PER_RUN} steps can be run.`;

  return (
    <>
      <PageHeader
        title={chain.name}
        description={chain.description ?? undefined}
        back={{ href: "/", label: "All chains" }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip ${chain.is_active ? "chip-ok" : "chip-mute"}`}>{chain.is_active ? "Active" : "Inactive"}</span>
            {voiceLabel(chain.voice_id) && <span className="chip">Voice: {voiceLabel(chain.voice_id)}</span>}
            <Link href={`/chains/${id}/media`} className="btn-quiet btn-sm">Media</Link>
          </div>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="steps-title" className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="steps-title" className="text-lg font-semibold">Steps</h2>
              <p className="text-xs text-muted">Drag the handle or use the arrows to reorder.</p>
            </div>
            <StepList chainId={id} steps={stepRows} />
          </section>

          <details className="panel group rounded-2xl p-5">
            <summary className="cursor-pointer list-none text-lg font-semibold marker:content-none">
              Chain settings <span className="ml-1 text-sm font-normal text-muted group-open:hidden">name, voice, active</span>
            </summary>
            <div className="mt-4">
              <ChainForm action={updateChain.bind(null, id)} chain={chain} submitLabel="Save settings" />
            </div>
          </details>

          <DeleteChain chainId={id} name={chain.name} runCount={count ?? 0} />
        </div>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20">
          <RunPanel
            chainId={id}
            steps={stepRows.map((s) => ({ id: s.id, instruction: s.instruction }))}
            library={(images ?? []).map((image) => ({ ...image, url: libraryUrl(image.storage_path) }))}
            runnable={reason === null}
            notRunnableReason={reason}
          />
          <section className="panel rounded-2xl p-5" aria-labelledby="recent-title">
            <div className="flex items-center justify-between">
              <h2 id="recent-title" className="text-lg font-semibold">Recent runs</h2>
              {(count ?? 0) > 0 && <Link href={`/history?chain=${id}`} className="text-sm font-medium text-accent-text hover:underline">All {count}</Link>}
            </div>
            {(recent ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-muted">No runs yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col divide-y divide-line">
                {(recent ?? []).map((run) => (
                  <li key={run.id}>
                    <Link href={`/runs/${run.id}`} className="flex items-center gap-3 py-2 text-sm hover:text-accent-text">
                      <RunStatusChip status={run.status} />
                      <span className="min-w-0 flex-1 truncate">{run.final_output ?? "—"}</span>
                      <span className="shrink-0 text-xs text-muted">{formatDateTime(run.created_at)}</span>
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
