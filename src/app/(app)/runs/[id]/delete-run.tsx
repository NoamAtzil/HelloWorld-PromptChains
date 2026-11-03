"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteRun } from "../actions";
import { Icon } from "@/components/icons";

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
    <div className="flex flex-col gap-2 border-t border-line pt-5">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-coral-text">Delete this result and its photo for good?</span>
          <button type="button" onClick={remove} disabled={pending} className="btn-danger btn-sm">{pending ? "Deleting…" : "Delete"}</button>
          <button type="button" onClick={() => setConfirming(false)} className="btn-quiet btn-sm">Keep it</button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="btn-ghost btn-sm w-fit hover:!text-coral-text"><Icon name="trash" /> Delete this result</button>
      )}
      {error && <p role="alert" className="text-sm text-coral-text">{error}</p>}
    </div>
  );
}
