"use client";

import { useActionState } from "react";
import type { FormState } from "./actions";
import { VOICES } from "@/lib/voices";
import type { Chain } from "@/lib/types";

export function ChainForm({
  action,
  chain,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  chain?: Pick<Chain, "name" | "description" | "voice_id" | "is_active">;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="name" className="label">Name</label>
        <input id="name" name="name" required maxLength={80} defaultValue={chain?.name} className="field" placeholder="Noir caption pipeline" />
      </div>
      <div>
        <label htmlFor="description" className="label">Description</label>
        <textarea id="description" name="description" rows={2} maxLength={500} defaultValue={chain?.description ?? ""} className="field" placeholder="What this chain is for" />
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label htmlFor="voice_id" className="label">Voice</label>
          <select id="voice_id" name="voice_id" defaultValue={chain?.voice_id ?? ""} className="field">
            <option value="">No voice (neutral)</option>
            {VOICES.map((voice) => (
              <option key={voice.id} value={voice.id}>{voice.label}</option>
            ))}
          </select>
        </div>
        <label className="flex min-h-10 items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="is_active" defaultChecked={chain?.is_active ?? true} className="h-4 w-4 accent-[var(--accent)]" />
          Active (can be run)
        </label>
      </div>
      {state?.error && (
        <p role="alert" className="rounded-xl bg-coral-tint px-3 py-2 text-sm text-coral-text">{state.error}</p>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Saving…" : submitLabel}
        </button>
        {state?.saved && !pending && <span role="status" className="text-sm font-medium text-ok-text">Saved</span>}
      </div>
    </form>
  );
}
