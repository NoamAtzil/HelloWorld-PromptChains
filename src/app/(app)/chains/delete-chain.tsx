"use client";

import { useActionState, useState } from "react";
import { deleteChain, type FormState } from "./actions";

export function DeleteChain({ chainId, name, runCount }: { chainId: number; name: string; runCount: number }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, formAction, pending] = useActionState<FormState, FormData>(deleteChain.bind(null, chainId), undefined);
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();

  return (
    <section className="panel !border-coral/30 p-5 sm:p-6" aria-labelledby="danger-title">
      <h2 id="danger-title" className="text-xl text-coral-text">Delete this chain</h2>
      <p className="mt-1 text-sm text-muted">
        The chain and its steps are removed.{" "}
        <strong className="text-ink">
          {runCount > 0
            ? `Its ${runCount} run${runCount === 1 ? "" : "s"} and their photos are kept`
            : "Past runs, if any, are always kept"}
        </strong>{" "}
        in your Gallery and History, labelled as a deleted chain.
      </p>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="btn-quiet mt-3 text-coral-text">
          Delete chain…
        </button>
      ) : (
        <form action={formAction} className="mt-3 flex flex-col gap-3">
          <div>
            <label htmlFor="confirm_name" className="label">Type “{name}” to confirm</label>
            <input
              id="confirm_name"
              name="confirm_name"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="field"
            />
          </div>
          {state?.error && (
            <p role="alert" className="rounded-xl bg-coral-tint px-3 py-2 text-sm text-coral-text">{state.error}</p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={!matches || pending} className="btn-danger">
              {pending ? "Deleting…" : "Delete permanently"}
            </button>
            <button type="button" onClick={() => { setOpen(false); setTyped(""); }} className="btn-quiet">
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
