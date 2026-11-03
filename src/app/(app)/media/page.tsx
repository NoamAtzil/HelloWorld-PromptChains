import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { signedImageUrls } from "@/lib/media";
import { EmptyState, PageHeader } from "@/components/ui";
import { RunGallery, type GalleryRun } from "@/components/run-gallery";

// Media from every chain, grouped by chain. Deleted chains keep their media.
export default async function MediaPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("prompt_chain_runs")
    .select("id, chain_id, chain_name, status, final_output, image_path, image_title, created_at")
    .eq("status", "succeeded")
    .order("created_at", { ascending: false })
    .limit(150)
    .returns<GalleryRun[]>();
  const runs = data ?? [];
  const urls = await signedImageUrls(supabase, runs.map((r) => r.image_path));

  const groups = new Map<string, { id: number | null; name: string; runs: GalleryRun[] }>();
  for (const run of runs) {
    const key = run.chain_id !== null ? `c${run.chain_id}` : `d:${run.chain_name}`;
    const group = groups.get(key) ?? { id: run.chain_id, name: run.chain_name, runs: [] };
    group.runs.push(run);
    groups.set(key, group);
  }

  return (
    <>
      <PageHeader title="Media" description="Every photo your chains have captioned, grouped by the chain that made it." />
      {runs.length === 0 ? (
        <EmptyState title="No media yet" action={<Link href="/" className="btn-primary">Pick a chain to run</Link>}>
          Finished runs show up here with their photo and caption.
        </EmptyState>
      ) : (
        [...groups.values()].map((group) => (
          <section key={group.id ?? `d:${group.name}`} className="flex flex-col gap-3" aria-label={group.name}>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">{group.name}</h2>
              {group.id === null ? (
                <span className="chip chip-mute">deleted chain</span>
              ) : (
                <Link href={`/chains/${group.id}/media`} className="text-sm font-medium text-accent-text hover:underline">
                  Open chain
                </Link>
              )}
              <span className="ml-auto text-xs text-muted">{group.runs.length} item{group.runs.length === 1 ? "" : "s"}</span>
            </div>
            <RunGallery runs={group.runs} urls={urls} />
          </section>
        ))
      )}
    </>
  );
}
