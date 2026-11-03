import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { formatDateTime, one, pageNumber } from "@/lib/format";
import { signedImageUrls } from "@/lib/media";
import { EmptyState, PageHeader, RunStatusChip, Thumb } from "@/components/ui";

const PAGE_SIZE = 20;

export default async function HistoryPage(props: PageProps<"/history">) {
  const { supabase } = await requireAdmin();
  const sp = await props.searchParams;
  const chain = one(sp.chain) ?? "";
  const status = one(sp.status) ?? "";
  const page = pageNumber(sp.page);

  const { data: chains } = await supabase.from("prompt_chains").select("id, name").order("name");

  let query = supabase
    .from("prompt_chain_runs")
    .select("id, chain_id, chain_name, status, steps_done, steps, final_output, image_path, image_title, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (chain === "deleted") query = query.is("chain_id", null);
  else if (Number.isSafeInteger(Number(chain)) && chain !== "") query = query.eq("chain_id", Number(chain));
  if (status === "running" || status === "succeeded" || status === "failed") query = query.eq("status", status);

  const { data, count } = await query;
  const runs = data ?? [];
  const urls = await signedImageUrls(supabase, runs.map((r) => r.image_path));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const link = (p: number) => {
    const q = new URLSearchParams();
    if (chain) q.set("chain", chain);
    if (status) q.set("status", status);
    q.set("page", String(p));
    return `/history?${q}`;
  };

  return (
    <>
      <PageHeader title="Run history" description="Every execution, including runs of chains that have since been deleted." />

      <form method="get" className="panel flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <div className="min-w-44 flex-1">
          <label htmlFor="chain" className="label">Chain</label>
          <select id="chain" name="chain" defaultValue={chain} className="field">
            <option value="">All chains</option>
            {(chains ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            <option value="deleted">Deleted chains</option>
          </select>
        </div>
        <div className="min-w-36">
          <label htmlFor="status" className="label">Status</label>
          <select id="status" name="status" defaultValue={status} className="field">
            <option value="">Any</option>
            <option value="succeeded">Done</option>
            <option value="failed">Failed</option>
            <option value="running">Running</option>
          </select>
        </div>
        <button type="submit" className="btn-primary">Filter</button>
      </form>

      {runs.length === 0 ? (
        <EmptyState title="No runs match">Run a chain from its builder page, or clear the filters.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {runs.map((run) => (
            <li key={run.id}>
              <Link href={`/runs/${run.id}`} className="panel flex items-center gap-4 rounded-2xl p-3 transition-colors hover:bg-tint/60">
                <Thumb src={urls.get(run.image_path)} alt={run.image_title || `Run ${run.id}`} className="h-16 w-16 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    <span className="truncate">{run.chain_name}</span>
                    {run.chain_id === null && <span className="chip chip-mute">deleted chain</span>}
                    <RunStatusChip status={run.status} />
                  </p>
                  <p className="mt-0.5 truncate text-sm text-muted">{run.final_output ?? `${run.steps_done} of ${Array.isArray(run.steps) ? run.steps.length : "?"} steps completed`}</p>
                </div>
                <span className="hidden shrink-0 text-xs text-muted sm:block">{formatDateTime(run.created_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between">
          {page > 1 ? <Link href={link(page - 1)} className="btn-quiet">← Newer</Link> : <span />}
          <span className="text-sm text-muted">Page {page} of {pages}</span>
          {page < pages ? <Link href={link(page + 1)} className="btn-quiet">Older →</Link> : <span />}
        </nav>
      )}
    </>
  );
}
