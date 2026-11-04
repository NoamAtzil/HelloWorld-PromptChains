export type Chain = {
  id: number;
  name: string;
  description: string | null;
  voice_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Step = {
  id: number;
  chain_id: number;
  position: number;
  instruction: string;
};

export type StepOutput = {
  position: number;
  instruction: string;
  output: string;
  latency_ms: number;
  finish_reason: string;
};

export type RunStatus = "running" | "succeeded" | "failed";

export type Run = {
  id: number;
  chain_id: number | null;
  chain_name: string;
  voice_id: string | null;
  steps: { position: number; instruction: string }[];
  input_text: string | null;
  image_path: string;
  image_title: string | null;
  image_source: "upload" | "library";
  model: string;
  status: RunStatus;
  steps_done: number;
  step_outputs: StepOutput[];
  final_output: string | null;
  error_code: string | null;
  created_at: string;
  completed_at: string | null;
};

export type LibraryImage = { id: number; storage_path: string; title: string };

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// Live state of the run shown in the workspace (client only).
export type StepView = { state: "pending" | "running" | "done" | "failed"; output?: string; latencyMs?: number };

export type RunState = {
  phase: "idle" | "running" | "done" | "failed";
  view: StepView[] | null;
  final: string | null;
  runId: number | null;
  error: string | null;
  /** The steps the run was started with, to tell a previous result from the current chain. */
  snapshot: { id: number; instruction: string }[] | null;
  photoSrc: string | null;
};

export const IDLE_RUN: RunState = { phase: "idle", view: null, final: null, runId: null, error: null, snapshot: null, photoSrc: null };
