import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { signedImageUrls } from "@/lib/media";
import { voiceTheme } from "@/lib/voice-theme";
import { Icon } from "@/components/icons";
import { EmptyState, PageHeader } from "@/components/ui";
import { RunGallery, type GalleryRun } from "@/components/run-gallery";

// Media from every chain, grouped by chain. Deleted chains keep their media.
export default async function MediaPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("prompt_chain_runs")
    .select("id, chain_id, chain_name, voice_id, status, final_output, image_path, image_title, created_at")
    .eq("status", "succeeded")
    .order("created_at", { ascending: false })
    .limit(150)
    .returns<GalleryRun[]>();
  const runs = data ?? [];
  const urls = await signedImageUrls(supabase, runs.map((r) => r.image_path));

  const groups = new Map<string, { id: number | null; name: string; voice: string | null; runs: GalleryRun[] }>();
  for (const run of runs) {
    const key = run.chain_id !== null ? `c${run.chain_id}` : `d:${run.chain_name}`;
    const group = groups.get(key) ?? { id: run.chain_id, name: run.chain_name, voice: run.voice_id, runs: [] };
    group.runs.push(run);
    groups.set(key, group);
  }

  return (
    <>
      <PageHeader
        eyebrow="Portfolio"
        title="Gallery"
        description="Every photo your chains have captioned, grouped by the chain that made it."
      />
      {runs.length === 0 ? (
        <EmptyState
          title="Your gallery is waiting"
          action={
            <Link href="/" className="btn-primary">
              <Icon name="spark" /> Run a chain
            </Link>
          }
        >
          Finished runs land here with their photo and caption, like a little portfolio of everything you make.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-14">
          {[...groups.values()].map((group) => (
            <section key={group.id ?? `d:${group.name}`} className="flex flex-col gap-5" aria-label={group.name}>
              <div className="flex flex-wrap items-center gap-3 border-b border-line pb-3">
                <span className="h-3 w-3 rounded-full" style={{ background: `linear-gradient(135deg, ${voiceTheme(group.voice).from}, ${voiceTheme(group.voice).to})` }} aria-hidden="true" />
                <h2 className="text-2xl">{group.name}</h2>
                {group.id === null ? (
                  <span className="chip chip-mute">deleted chain</span>
                ) : (
                  <Link href={`/chains/${group.id}`} className="text-sm font-semibold text-accent-text hover:underline">Open chain</Link>
                )}
                <span className="ml-auto text-sm text-muted">{group.runs.length} {group.runs.length === 1 ? "caption" : "captions"}</span>
              </div>
              <RunGallery runs={group.runs} urls={urls} />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
