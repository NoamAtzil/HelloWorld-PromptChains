import { requireAdmin } from "@/lib/admin";
import { one } from "@/lib/format";
import { signedImageUrls } from "@/lib/media";
import type { ChainCardData } from "@/components/chain-card";
import { HomeView } from "@/components/home-view";

type ChainRow = {
  id: number;
  name: string;
  description: string | null;
  voice_id: string | null;
  is_active: boolean;
  prompt_chain_steps: { count: number }[];
};

type RunRow = {
  id: number;
  chain_id: number | null;
  status: string;
  created_at: string;
  final_output: string | null;
  image_path: string;
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
      .select("id, chain_id, status, created_at, final_output, image_path")
      .order("created_at", { ascending: false })
      .limit(300)
      .returns<RunRow[]>(),
  ]);

  const rows = chains ?? [];
  const allRuns = runs ?? [];
  const finished = allRuns.filter((r) => r.status !== "running");
  const succeeded = allRuns.filter((r) => r.status === "succeeded" && r.final_output);
  const rate = finished.length ? Math.round((finished.filter((r) => r.status === "succeeded").length / finished.length) * 100) : null;

  const perChain = new Map<number, { runs: number; last: string; latest: RunRow | null }>();
  for (const run of allRuns) {
    if (run.chain_id == null) continue;
    const entry = perChain.get(run.chain_id) ?? { runs: 0, last: run.created_at, latest: null };
    entry.runs += 1;
    if (!entry.latest && run.status === "succeeded" && run.final_output) entry.latest = run;
    perChain.set(run.chain_id, entry);
  }

  const fresh = succeeded.slice(0, 4);
  const urls = await signedImageUrls(supabase, [...fresh.map((r) => r.image_path), ...[...perChain.values()].flatMap((e) => (e.latest ? [e.latest.image_path] : []))]);
  const hero = succeeded[0];

  const cards: ChainCardData[] = rows.map((chain) => {
    const stat = perChain.get(chain.id);
    return {
      id: chain.id,
      name: chain.name,
      description: chain.description,
      voice_id: chain.voice_id,
      is_active: chain.is_active,
      steps: chain.prompt_chain_steps[0]?.count ?? 0,
      runs: stat?.runs ?? 0,
      lastRun: stat?.last ?? null,
      latest: stat?.latest ? { url: urls.get(stat.latest.image_path), caption: stat.latest.final_output ?? "" } : null,
    };
  });
  const totalSteps = cards.reduce((n, c) => n + c.steps, 0);

  return (
    <HomeView
      deleted={deleted}
      cards={cards}
      stats={{ chains: rows.length, steps: totalSteps, captions: succeeded.length, rate }}
      fresh={fresh.map((r) => ({ id: r.id, created_at: r.created_at, final_output: r.final_output, imageUrl: urls.get(r.image_path) }))}
      hero={hero ? { imageUrl: urls.get(hero.image_path), caption: hero.final_output } : null}
    />
  );
}
