"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { friendlyError, requireAdmin } from "@/lib/admin";
import { isVoiceId } from "@/lib/voices";
import type { ActionResult } from "@/lib/types";

export type FormState = { error?: string; saved?: boolean } | undefined;

function readChain(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const voice = String(formData.get("voice_id") ?? "");
  if (name.length < 1 || name.length > 80) return { error: "Name must be 1 to 80 characters." } as const;
  if (description.length > 500) return { error: "Description must be 500 characters or fewer." } as const;
  if (voice && !isVoiceId(voice)) return { error: "Pick a voice from the list." } as const;
  return {
    value: {
      name,
      description: description || null,
      voice_id: voice || null,
      is_active: formData.get("is_active") === "on",
    },
  } as const;
}

export async function createChain(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const parsed = readChain(formData);
  if ("error" in parsed) return { error: parsed.error };

  const { data, error } = await supabase.from("prompt_chains").insert(parsed.value).select("id").single();
  if (error || !data) {
    console.error("createChain failed:", error?.message);
    return { error: friendlyError(error ?? {}) };
  }
  revalidatePath("/");
  redirect(`/chains/${data.id}`);
}

export async function updateChain(chainId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const parsed = readChain(formData);
  if ("error" in parsed) return { error: parsed.error };

  const { data, error } = await supabase
    .from("prompt_chains")
    .update(parsed.value)
    .eq("id", chainId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("updateChain failed:", error.message);
    return { error: error ? friendlyError(error) : "That chain no longer exists." };
  }
  revalidatePath("/");
  revalidatePath(`/chains/${chainId}`);
  return { saved: true };
}

// The explicit, safe deletion: the exact chain name must be typed, the chain
// and its steps are removed, and every run (with its image) is KEPT. The
// database function enforces the confirmation, not just the UI.
export async function deleteChain(chainId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("delete_prompt_chain", {
    p_chain_id: chainId,
    p_confirm_name: String(formData.get("confirm_name") ?? ""),
  });
  if (error) {
    console.error("deleteChain failed:", error.message);
    return { error: friendlyError(error) };
  }
  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/media");
  redirect(`/?deleted=${Number(data) || 0}`);
}

export async function addStep(chainId: number, instruction: string): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const text = instruction.trim();
  if (text.length < 1 || text.length > 1000) {
    return { ok: false, error: "A step instruction must be 1 to 1000 characters." };
  }
  const { error } = await supabase.rpc("add_prompt_chain_step", { p_chain_id: chainId, p_instruction: text });
  if (error) {
    console.error("addStep failed:", error.message);
    return { ok: false, error: friendlyError(error) };
  }
  revalidatePath(`/chains/${chainId}`);
  revalidatePath("/");
  return { ok: true };
}

export async function updateStep(chainId: number, stepId: number, instruction: string): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const text = instruction.trim();
  if (text.length < 1 || text.length > 1000) {
    return { ok: false, error: "A step instruction must be 1 to 1000 characters." };
  }
  const { data, error } = await supabase
    .from("prompt_chain_steps")
    .update({ instruction: text })
    .eq("id", stepId)
    .eq("chain_id", chainId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("updateStep failed:", error.message);
    return { ok: false, error: error ? friendlyError(error) : "That step no longer exists." };
  }
  revalidatePath(`/chains/${chainId}`);
  return { ok: true };
}

export async function deleteStep(chainId: number, stepId: number): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("delete_prompt_chain_step", { p_step_id: stepId });
  if (error) {
    console.error("deleteStep failed:", error.message);
    return { ok: false, error: friendlyError(error) };
  }
  revalidatePath(`/chains/${chainId}`);
  revalidatePath("/");
  return { ok: true };
}

export async function reorderSteps(chainId: number, stepIds: number[]): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  if (!Array.isArray(stepIds) || stepIds.length === 0 || !stepIds.every((n) => Number.isSafeInteger(n))) {
    return { ok: false, error: "Invalid step order." };
  }
  const { error } = await supabase.rpc("reorder_prompt_chain_steps", {
    p_chain_id: chainId,
    p_step_ids: stepIds,
  });
  if (error) {
    console.error("reorderSteps failed:", error.message);
    return { ok: false, error: friendlyError(error) };
  }
  revalidatePath(`/chains/${chainId}`);
  return { ok: true };
}
