"use client";

import { useActionState } from "react";
import type { FormState } from "./actions";
import { Icon } from "@/components/icons";
import { VOICES } from "@/lib/voices";
import { coverGradient } from "@/lib/voice-theme";
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
  const selected = chain?.voice_id ?? "";

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div>
        <label htmlFor="name" className="label">Name</label>
        <input id="name" name="name" required maxLength={80} defaultValue={chain?.name} className="field !text-base" placeholder="Noir caption pipeline" />
      </div>
      <div>
        <label htmlFor="description" className="label">Description</label>
        <textarea id="description" name="description" rows={2} maxLength={500} defaultValue={chain?.description ?? ""} className="field [field-sizing:content]" placeholder="What this chain is for, in a sentence" />
      </div>

      <fieldset>
        <legend className="label">Voice</legend>
        <p className="-mt-1 mb-3 text-sm text-muted">The personality every step writes in.</p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {[{ id: "", label: "No voice", tone: "neutral" }, ...VOICES.map((v) => ({ id: v.id as string, label: v.label, tone: v.id }))].map((voice) => (
            <label
              key={voice.id || "none"}
              className="group relative flex cursor-pointer items-center gap-3 rounded-2xl border border-line-strong bg-surface-solid p-3 transition-all hover:border-accent has-[:checked]:border-accent has-[:checked]:bg-tint has-[:checked]:shadow-[var(--shadow-sm)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
            >
              <input type="radio" name="voice_id" value={voice.id} defaultChecked={selected === voice.id} className="sr-only" />
              <span className="h-8 w-8 shrink-0 rounded-full ring-2 ring-white/60 shadow-sm" style={{ background: voice.id ? coverGradient(voice.id) : "var(--tint-2)" }} aria-hidden="true" />
              <span className="text-sm font-semibold leading-tight">{voice.label}</span>
              <span className="absolute right-2.5 top-2.5 hidden h-4 w-4 place-items-center rounded-full bg-accent text-on-accent group-has-[:checked]:grid"><Icon name="check" className="h-2.5 w-2.5" strokeWidth={3.5} /></span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-3 rounded-2xl bg-sunken p-4 ring-1 ring-line">
        <input type="checkbox" name="is_active" defaultChecked={chain?.is_active ?? true} className="h-5 w-5 accent-[var(--accent)]" />
        <span>
          <span className="block text-sm font-semibold">Active</span>
          <span className="text-xs text-muted">Inactive chains stay in your list but cannot be run.</span>
        </span>
      </label>

      {state?.error && <p role="alert" className="rounded-2xl bg-coral-tint px-4 py-3 text-sm font-medium text-coral-text">{state.error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? <><span className="spinner" /> Saving…</> : submitLabel}
        </button>
        {state?.saved && !pending && <span role="status" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ok-text"><Icon name="check" strokeWidth={2.6} /> Saved</span>}
      </div>
    </form>
  );
}
