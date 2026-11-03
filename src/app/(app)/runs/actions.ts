"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { friendlyError, requireAdmin } from "@/lib/admin";
import { runChainStep, MODEL } from "@/lib/gemini";
import { detectImageType } from "@/lib/image";
import { LIBRARY_BUCKET, MAX_IMAGE_BYTES, MEDIA_BUCKET } from "@/lib/media";
import { MAX_INPUT_TEXT, buildSystemInstruction, buildUserText } from "@/lib/prompt";
import { voiceInstruction } from "@/lib/voices";
import type { ActionResult } from "@/lib/types";

// Shared with the database (private.app_settings.chain_run_secret). It lets
// only THIS server write run content, so a signed-in superadmin calling the
// database API directly cannot invent outputs. Server-only; never NEXT_PUBLIC.
function runSecret() {
  const secret = process.env.CHAIN_RUN_SECRET;
  return secret && secret.length >= 24 ? secret : null;
}

const SETUP_ERROR = "Run signing is not configured: set CHAIN_RUN_SECRET (see the README).";

const AI_ERRORS = {
  incomplete: "The model's answer came back incomplete or blocked.",
  empty: "The model returned nothing for this step.",
  failed: "Could not reach the model right now.",
} as const;

// Step 1 of a run: validate the input, keep a private copy of the image, and
// ask the database to open the run (it enforces the usage limits, freezes the
// chain's steps, and re-checks superadmin). No AI call happens here.
export async function startRun(formData: FormData): Promise<ActionResult<{ runId: number; total: number }>> {
  const { supabase } = await requireAdmin();
  const secret = runSecret();
  if (!secret) return { ok: false, error: SETUP_ERROR };

  const chainId = Number(formData.get("chain_id"));
  if (!Number.isSafeInteger(chainId)) return { ok: false, error: "Unknown chain." };

  const inputText = String(formData.get("input_text") ?? "").trim();
  if (inputText.length > MAX_INPUT_TEXT) {
    return { ok: false, error: `Keep the context to ${MAX_INPUT_TEXT} characters or fewer.` };
  }

  let bytes: Uint8Array;
  let title = "";
  const source = formData.get("source") === "library" ? "library" : "upload";
  if (source === "library") {
    const imageId = Number(formData.get("library_id"));
    if (!Number.isSafeInteger(imageId)) return { ok: false, error: "Choose a library image." };
    const { data: image } = await supabase
      .from("images")
      .select("storage_path, title")
      .eq("id", imageId)
      .eq("is_active", true)
      .maybeSingle();
    if (!image) return { ok: false, error: "That library image is not available." };
    const { data: blob, error } = await supabase.storage.from(LIBRARY_BUCKET).download(image.storage_path);
    if (error || !blob) return { ok: false, error: "Could not load that library image." };
    bytes = new Uint8Array(await blob.arrayBuffer());
    title = image.title;
  } else {
    const file = formData.get("image");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a photo to run the chain on." };
    bytes = new Uint8Array(await file.arrayBuffer());
    title = file.name.replace(/\.[^.]+$/, "").slice(0, 120);
  }

  if (bytes.byteLength > MAX_IMAGE_BYTES) return { ok: false, error: "That photo is too large. The limit is 4 MB." };
  const type = detectImageType(bytes);
  if (!type) return { ok: false, error: "Unsupported file type. Please use a JPEG, PNG, or WebP image." };

  const path = `${randomUUID()}.${type.ext}`;
  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, bytes, { contentType: type.mimeType, upsert: false });
  if (uploadError) {
    console.error("startRun upload failed:", uploadError.message);
    return { ok: false, error: "Could not store the photo. Try again." };
  }

  const { data: runId, error } = await supabase.rpc("start_chain_run", {
    p_chain_id: chainId,
    p_input_text: inputText,
    p_image_path: path,
    p_image_title: title,
    p_image_source: source,
    p_model: MODEL,
    p_secret: secret,
  });
  if (error || typeof runId !== "number") {
    if (error) console.error("startRun failed:", error.message);
    await supabase.storage.from(MEDIA_BUCKET).remove([path]);
    return { ok: false, error: error ? friendlyError(error) : "Could not start the run." };
  }

  const { data: run } = await supabase.from("prompt_chain_runs").select("steps").eq("id", runId).single();
  const total = Array.isArray(run?.steps) ? run.steps.length : 0;
  if (total === 0) {
    await supabase.rpc("fail_chain_run", {
      p_run_id: runId,
      p_error_code: "no_steps",
      p_claim_token: null,
      p_secret: secret,
    });
    return { ok: false, error: "Could not read the chain's steps. Try again." };
  }
  revalidatePath("/history");
  return { ok: true, runId, total };
}

export type StepDone = {
  index: number;
  output: string;
  latencyMs: number;
  done: boolean;
};

// Step 2 (called once per step, strictly in order): the database hands over the
// next step and locks it; Gemini runs on the server; the result is recorded.
export async function runNextStep(runId: number): Promise<ActionResult<StepDone>> {
  const { supabase } = await requireAdmin();
  const secret = runSecret();
  if (!secret) return { ok: false, error: SETUP_ERROR };
  if (!Number.isSafeInteger(runId)) return { ok: false, error: "Unknown run." };

  const { data: claim, error } = await supabase.rpc("claim_chain_step", { p_run_id: runId });
  if (error || !claim) {
    if (error) console.error("claim_chain_step failed:", error.message);
    return { ok: false, error: error ? friendlyError(error) : "Could not start the step." };
  }
  const c = claim as {
    claim_token: string;
    step_index: number;
    total: number;
    instruction: string;
    voice_id: string | null;
    input_text: string | null;
    image_path: string;
    previous: string[];
  };

  const fail = async (code: string, message: string): Promise<ActionResult<StepDone>> => {
    // Bound to our claim token: if another execution took the step over, this
    // is a no-op and cannot fail the run.
    await supabase.rpc("fail_chain_run", {
      p_run_id: runId,
      p_error_code: code,
      p_claim_token: c.claim_token,
      p_secret: secret,
    });
    revalidatePath("/history");
    return { ok: false, error: message };
  };

  const { data: blob, error: downloadError } = await supabase.storage.from(MEDIA_BUCKET).download(c.image_path);
  if (downloadError || !blob) {
    console.error("runNextStep download failed:", downloadError?.message);
    return fail("image_missing", "The run's photo could not be loaded.");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) return fail("image_invalid", "The run's photo is not a supported image.");

  const started = Date.now();
  const result = await runChainStep({
    bytes,
    mimeType: type.mimeType,
    system: buildSystemInstruction({
      stepIndex: c.step_index,
      total: c.total,
      voice: voiceInstruction(c.voice_id),
    }),
    userText: buildUserText({ instruction: c.instruction, inputText: c.input_text, previous: c.previous }),
  });
  if (!result.ok) return fail(result.code, `Step ${c.step_index + 1} failed: ${AI_ERRORS[result.code]}`);

  const latencyMs = Date.now() - started;
  const { data: status, error: recordError } = await supabase.rpc("record_chain_step", {
    p_run_id: runId,
    p_step_index: c.step_index,
    p_claim_token: c.claim_token,
    p_secret: secret,
    p_output: result.text,
    p_latency_ms: latencyMs,
    p_finish_reason: result.finishReason,
  });
  if (recordError) {
    // Do not fail the run here: a stale claim means another execution owns the
    // step now. An unrecorded claim simply expires.
    console.error("record_chain_step failed:", recordError.message);
    return { ok: false, error: friendlyError(recordError) };
  }

  const done = status === "succeeded";
  if (done) {
    revalidatePath("/history");
    revalidatePath("/media");
  }
  return { ok: true, index: c.step_index, output: result.text, latencyMs, done };
}

// Explicit, separate deletion of one run and its stored photo.
export async function deleteRun(runId: number): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const { data: path, error } = await supabase.rpc("delete_chain_run", { p_run_id: runId });
  if (error) {
    console.error("deleteRun failed:", error.message);
    return { ok: false, error: friendlyError(error) };
  }
  if (typeof path === "string") await supabase.storage.from(MEDIA_BUCKET).remove([path]);
  revalidatePath("/history");
  revalidatePath("/media");
  revalidatePath("/");
  return { ok: true };
}
