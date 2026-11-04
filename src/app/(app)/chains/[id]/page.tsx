import { notFound } from "next/navigation";
import { ChainView } from "@/components/chain-view";
import { MODEL } from "@/lib/gemini";
import { requireAdmin } from "@/lib/admin";
import { libraryUrl, signedImageUrls } from "@/lib/media";
import { MAX_STEPS_PER_RUN } from "@/lib/prompt";
import type { Chain, LibraryImage, Step } from "@/lib/types";

// Chain steps call Gemini through server actions on this route.
export const maxDuration = 60;

type Recent = { id: number; status: string; final_output: string | null; image_path: string; created_at: string };

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
      .select("id, status, final_output, image_path, created_at", { count: "exact" })
      .eq("chain_id", id)
      .order("created_at", { ascending: false })
      .limit(4)
      .returns<Recent[]>(),
  ]);
  if (!chain) notFound();

  const stepRows = steps ?? [];
  const recentRuns = recent ?? [];
  const urls = await signedImageUrls(supabase, recentRuns.map((r) => r.image_path));

  let reason: string | null = null;
  if (!chain.is_active) reason = "This chain is inactive. Turn on “Active” in its settings to run it.";
  else if (stepRows.length === 0) reason = "Add at least one step to the recipe, then come back to run it.";
  else if (stepRows.length > MAX_STEPS_PER_RUN) reason = `Only chains with up to ${MAX_STEPS_PER_RUN} steps can be run.`;

  return (
    <ChainView
      chain={chain}
      steps={stepRows}
      library={(images ?? []).map((image) => ({ ...image, url: libraryUrl(image.storage_path) }))}
      recent={recentRuns.map((r) => ({ id: r.id, status: r.status, final_output: r.final_output, created_at: r.created_at, imageUrl: urls.get(r.image_path) }))}
      runCount={count ?? 0}
      notRunnableReason={reason}
      modelLabel={MODEL.replace("gemini-flash-latest", "Gemini Flash")}
    />
  );
}
