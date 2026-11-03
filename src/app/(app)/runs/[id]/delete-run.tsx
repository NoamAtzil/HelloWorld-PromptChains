"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteRun } from "../actions";

export function DeleteRun({ runId }: { runId: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteRun(runId);
      if (result.ok) router.push("/history");
      else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Delete this run and its photo for good?</span>
          <button type="button" onClick={remove} disabled={pending} className="btn-danger btn-sm">{pending ? "Deleting…" : "Delete run"}</button>
          <button type="button" onClick={() => setConfirming(false)} className="btn-quiet btn-sm">Keep</button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="btn-quiet btn-sm w-fit text-coral-text">Delete run…</button>
      )}
      {error && <p role="alert" className="text-sm text-coral-text">{error}</p>}
    </div>
  );
}
