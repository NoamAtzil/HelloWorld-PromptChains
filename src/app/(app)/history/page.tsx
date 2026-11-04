import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { one, pageNumber } from "@/lib/format";
import { signedImageUrls } from "@/lib/media";
import { Icon } from "@/components/icons";
import { EmptyState, PageHeader } from "@/components/ui";
import { Timeline, type TimelineRun } from "./timeline";

const PAGE_SIZE = 20;

type Row = {
  id: number;
  chain_id: number | null;
  chain_name: string;
  voice_id: string | null;
  status: string;
  steps_done: number;
  steps: unknown;
  final_output: string | null;
  image_path: string;
  created_at: string;
  step_outputs: { output: string }[] | null;
};

export default async function HistoryPage(props: PageProps<"/history">) {
  const { supabase } = await requireAdmin();
  const sp = await props.searchParams;
  const chain = one(sp.chain) ?? "";
  const status = one(sp.status) ?? "";
  const page = pageNumber(sp.page);

  const { data: chains } = await supabase.from("prompt_chains").select("id, name").order("name");

  let query = supabase
    .from("prompt_chain_runs")
    .select("id, chain_id, chain_name, voice_id, status, steps_done, steps, final_output, image_path, created_at, step_outputs", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (chain === "deleted") query = query.is("chain_id", null);
  else if (Number.isSafeInteger(Number(chain)) && chain !== "") query = query.eq("chain_id", Number(chain));
  if (status === "running" || status === "succeeded" || status === "failed") query = query.eq("status", status);

  const { data, count } = await query.returns<Row[]>();
  const rows = data ?? [];
  const urls = await signedImageUrls(supabase, rows.map((r) => r.image_path));
  const runs: TimelineRun[] = rows.map((r) => ({
    id: r.id,
    chain_id: r.chain_id,
    chain_name: r.chain_name,
    voice_id: r.voice_id,
    status: r.status,
    steps_done: r.steps_done,
    total: Array.isArray(r.steps) ? r.steps.length : 0,
    final_output: r.final_output,
    imageUrl: urls.get(r.image_path),
    created_at: r.created_at,
    outputs: (r.step_outputs ?? []).map((o) => o.output),
  }));

  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const link = (p: number) => {
    const q = new URLSearchParams();
    if (chain) q.set("chain", chain);
    if (status) q.set("status", status);
    q.set("page", String(p));
    return `/history?${q}`;
  };
  const filtered = Boolean(chain || status);

  return (
    <>
      <PageHeader
        eyebrow="Timeline"
        title="History"
        description="Everything your chains have made, day by day. Open any result, or peek at the thinking behind it."
      />

      <form method="get" className="panel flex flex-wrap items-end gap-3 p-4">
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
          <label htmlFor="status" className="label">Outcome</label>
          <select id="status" name="status" defaultValue={status} className="field">
            <option value="">Any</option>
            <option value="succeeded">Done</option>
            <option value="failed">Stopped</option>
            <option value="running">Running</option>
          </select>
        </div>
        <button type="submit" className="btn-primary">Apply</button>
        {filtered && <Link href="/history" className="btn-ghost">Clear</Link>}
      </form>

      {runs.length === 0 ? (
        <EmptyState
          title={filtered ? "Nothing matches those filters" : "No runs yet"}
          action={filtered ? <Link href="/history" className="btn-quiet">Clear filters</Link> : <Link href="/" className="btn-primary"><Icon name="spark" /> Run a chain</Link>}
        >
          {filtered ? "Try a different chain or outcome." : "When you run a chain, each result is kept here with its photo and every step."}
        </EmptyState>
      ) : (
        <Timeline runs={runs} nowIso={new Date().toISOString()} />
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3">
          {page > 1 ? <Link href={link(page - 1)} className="btn-quiet"><Icon name="arrow" className="rotate-180" /> Newer</Link> : <span />}
          <span className="text-sm text-muted">Page {page} of {pages}</span>
          {page < pages ? <Link href={link(page + 1)} className="btn-quiet">Older <Icon name="arrow" /></Link> : <span />}
        </nav>
      )}
    </>
  );
}
