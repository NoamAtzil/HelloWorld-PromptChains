"use client";

import { Icon } from "@/components/icons";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="panel mx-auto flex max-w-md flex-col items-center gap-4 p-10 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-coral-tint text-coral-text"><Icon name="x" className="h-6 w-6" /></span>
      <h1 className="text-3xl">That didn&apos;t load</h1>
      <p className="text-sm leading-relaxed text-muted">Something went wrong on our side. Nothing was changed, so it is safe to try again.</p>
      <button type="button" onClick={reset} className="btn-primary"><Icon name="retry" /> Try again</button>
    </div>
  );
}
