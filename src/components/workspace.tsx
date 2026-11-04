"use client";

import { useState } from "react";
import { PreviewPanel } from "./preview-panel";
import { StepList } from "@/app/(app)/chains/[id]/step-list";
import { diffAgainstSnapshot } from "@/lib/run-state";
import { IDLE_RUN, type LibraryImage, type RunState, type Step } from "@/lib/types";

type Props = {
  chainId: number;
  steps: Step[];
  library: (LibraryImage & { url: string })[];
  runnable: boolean;
  notRunnableReason: string | null;
  voiceLabel: string | null;
  modelLabel: string;
  /** Server-rendered extras placed under each half. */
  leftFooter?: React.ReactNode;
  rightFooter?: React.ReactNode;
};

// The split-screen studio: your creative process on the left (about 55%), a live
// preview on the right (about 45%). The run state is shared, so the cards on the
// left can show what is happening on the right, and can tell you when you have
// edited the chain since the result you are looking at.
export function Workspace({ chainId, steps, library, runnable, notRunnableReason, voiceLabel, modelLabel, leftFooter, rightFooter }: Props) {
  const [run, setRun] = useState<RunState>(IDLE_RUN);
  const diff = diffAgainstSnapshot(run.snapshot, steps.map((s) => ({ id: s.id, instruction: s.instruction })));

  return (
    <div className="grid items-start gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]">
      <section aria-labelledby="steps-title" className="flex min-w-0 flex-col gap-5 lg:col-start-1 lg:row-start-1">
        <div>
          <p className="eyebrow">Your creative process</p>
          <h2 id="steps-title" className="mt-1 text-3xl">Steps</h2>
          <p className="mt-1 text-sm text-muted">Click a step to edit it. Drag the handle to reorder, or hover between steps to insert a new one.</p>
        </div>
        <StepList chainId={chainId} steps={steps} run={run} diff={diff} />
      </section>

      {/* On phones the studio follows the steps directly; on desktop it sits beside them. */}
      <aside className="no-scrollbar flex min-w-0 flex-col gap-6 lg:sticky lg:top-[5.25rem] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:-m-3 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:p-3">
        <PreviewPanel
          chainId={chainId}
          steps={steps}
          library={library}
          runnable={runnable}
          notRunnableReason={notRunnableReason}
          run={run}
          setRun={setRun}
          diff={diff}
          voiceLabel={voiceLabel}
          modelLabel={modelLabel}
        />
        {rightFooter}
      </aside>

      <div className="flex min-w-0 flex-col gap-10 lg:col-start-1 lg:row-start-2">{leftFooter}</div>
    </div>
  );
}
