"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="panel mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl p-8 text-center">
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="text-sm text-muted">The page could not be loaded. Nothing was changed.</p>
      <button type="button" onClick={reset} className="btn-primary">
        Try again
      </button>
    </div>
  );
}
