import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { formatDateTime, one } from "@/lib/format";
import { voiceLabel } from "@/lib/voices";
import { EmptyState, Notice, PageHeader, StatCard } from "@/components/ui";

type ChainRow = {
  id: number;
  name: string;
  description: string | null;
  voice_id: string | null;
  is_active: boolean;
  prompt_chain_steps: { count: number }[];
};

export default async function ChainsPage(props: PageProps<"/">) {
  const { supabase } = await requireAdmin();
  const deleted = one((await props.searchParams).deleted);

  const [{ data: chains }, { data: runs }] = await Promise.all([
    supabase
      .from("prompt_chains")
      .select("id, name, description, voice_id, is_active, prompt_chain_steps(count)")
      .order("name", { ascending: true })
      .returns<ChainRow[]>(),
    supabase
      .from("prompt_chain_runs")
      .select("chain_id, status, created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  const rows = chains ?? [];
  const allRuns = runs ?? [];
  const finished = allRuns.filter((r) => r.status !== "running");
  const succeeded = finished.filter((r) => r.status === "succeeded").length;
  const stats = new Map<number, { count: number; last: string }>();
  for (const run of allRuns) {
    if (run.chain_id == null) continue;
    const entry = stats.get(run.chain_id);
    if (entry) entry.count += 1;
    else stats.set(run.chain_id, { count: 1, last: run.created_at });
  }
  const totalSteps = rows.reduce((sum, c) => sum + (c.prompt_chain_steps[0]?.count ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Prompt chains"
        description="Each chain is an ordered list of steps. Run one on a photo and every step builds on the one before it."
        actions={
          <Link href="/chains/new" className="btn-primary">
            + New chain
          </Link>
        }
      />

      {deleted !== undefined && (
        <Notice tone="ok">
          Chain deleted. {Number(deleted) > 0 ? `${deleted} run${deleted === "1" ? "" : "s"} and their photos were kept in History and Media.` : "It had no runs."}
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard index={0} label="Chains" value={String(rows.length)} hint={`${rows.filter((c) => c.is_active).length} active`} />
        <StatCard index={1} label="Steps" value={String(totalSteps)} hint="across all chains" />
        <StatCard index={2} label="Runs" value={String(allRuns.length)} hint="most recent 1,000" />
        <StatCard
          index={3}
          label="Success rate"
          value={finished.length ? `${Math.round((succeeded / finished.length) * 100)}%` : "—"}
          hint={`${succeeded} of ${finished.length} finished`}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No chains yet"
          action={
            <Link href="/chains/new" className="btn-primary">
              Create the first chain
            </Link>
          }
        >
          A chain turns a photo into a caption in several small, inspectable steps.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((chain, i) => {
            const steps = chain.prompt_chain_steps[0]?.count ?? 0;
            const stat = stats.get(chain.id);
            return (
              <li key={chain.id} className="rise" style={{ "--i": i } as React.CSSProperties}>
                <Link
                  href={`/chains/${chain.id}`}
                  className="panel group flex h-full flex-col gap-3 rounded-2xl p-5 transition-transform hover:-translate-y-0.5 hover:shadow-[var(--shadow-glow)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-lg font-semibold leading-snug">{chain.name}</h2>
                    <span className={`chip ${chain.is_active ? "chip-ok" : "chip-mute"}`}>
                      {chain.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="line-clamp-2 min-h-[2.5rem] text-sm text-muted">
                    {chain.description || "No description."}
                  </p>
                  <div className="flex items-center gap-1.5" aria-hidden="true">
                    {Array.from({ length: Math.min(steps, 10) }, (_, n) => (
                      <span key={n} className="flex items-center gap-1.5">
                        {n > 0 && <span className="h-px w-3 bg-glow/60" />}
                        <span className="h-2.5 w-2.5 rounded-full bg-glow" />
                      </span>
                    ))}
                    {steps === 0 && <span className="text-xs text-muted">No steps yet</span>}
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs text-muted">
                    <span>{steps} step{steps === 1 ? "" : "s"}</span>
                    {voiceLabel(chain.voice_id) && <span className="chip">{voiceLabel(chain.voice_id)}</span>}
                    <span className="ml-auto">
                      {stat ? `${stat.count} run${stat.count === 1 ? "" : "s"} · ${formatDateTime(stat.last)}` : "Never run"}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
