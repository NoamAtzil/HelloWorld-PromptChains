import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { signedImageUrls } from "@/lib/media";
import { RunView } from "@/components/run-view";
import type { Run } from "@/lib/types";

export default async function RunPage(props: PageProps<"/runs/[id]">) {
  const { supabase } = await requireAdmin();
  const id = Number((await props.params).id);
  if (!Number.isSafeInteger(id)) notFound();

  const { data: run } = await supabase.from("prompt_chain_runs").select("*").eq("id", id).maybeSingle<Run>();
  if (!run) notFound();
  const urls = await signedImageUrls(supabase, [run.image_path]);

  return <RunView run={run} url={urls.get(run.image_path)} />;
}
