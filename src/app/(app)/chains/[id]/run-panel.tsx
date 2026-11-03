"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { runNextStep, startRun } from "../../runs/actions";
import { Thumb } from "@/components/ui";
import { formatLatency } from "@/lib/format";
import type { LibraryImage } from "@/lib/types";

type StepView = { instruction: string; state: "pending" | "running" | "done" | "failed"; output?: string; latencyMs?: number };

type Props = {
  chainId: number;
  steps: { id: number; instruction: string }[];
  library: (LibraryImage & { url: string })[];
  runnable: boolean;
  notRunnableReason: string | null;
};

export function RunPanel({ chainId, steps, library, runnable, notRunnableReason }: Props) {
  const router = useRouter();
  const [source, setSource] = useState<"upload" | "library">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [libraryId, setLibraryId] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<StepView[] | null>(null);
  const [runId, setRunId] = useState<number | null>(null);
  const [final, setFinal] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function pickFile(next: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    // Check on the client first: a file over the server's body limit would
    // fail with a framework error instead of a friendly message.
    if (next && !["image/jpeg", "image/png", "image/webp"].includes(next.type)) {
      setError("Unsupported file type. Please use a JPEG, PNG, or WebP image.");
      next = null;
    } else if (next && next.size > 4 * 1024 * 1024) {
      setError("That photo is too large. The limit is 4 MB.");
      next = null;
    } else {
      setError(null);
    }
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
  }

  const ready = source === "upload" ? file !== null : libraryId !== null;

  async function run() {
    if (!ready || running) return;
    setError(null);
    setFinal(null);
    setRunId(null);
    setCopied(false);
    setRunning(true);
    setView(steps.map((s) => ({ instruction: s.instruction, state: "pending" })));

    const form = new FormData();
    form.set("chain_id", String(chainId));
    form.set("source", source);
    form.set("input_text", text);
    if (source === "upload" && file) form.set("image", file);
    if (source === "library" && libraryId !== null) form.set("library_id", String(libraryId));

    let current = -1;
    try {
      const started = await startRun(form);
      if (!started.ok) {
        setError(started.error);
        setView(null);
        return;
      }
      setRunId(started.runId);
      // Show the steps the run actually froze, not the page's possibly stale copy.
      setView((cur) => Array.from({ length: started.total }, (_, n) => cur?.[n] ?? { instruction: "", state: "pending" as const }));

      // Strictly sequential: step N+1 is only requested after step N is saved.
      for (let i = 0; i < started.total; i++) {
        current = i;
        setView((cur) => cur && cur.map((s, n) => (n === i ? { ...s, state: "running" } : s)));
        const result = await runNextStep(started.runId);
        if (!result.ok) {
          setView((cur) => cur && cur.map((s, n) => (n === i ? { ...s, state: "failed" } : s)));
          setError(result.error);
          return;
        }
        setView((cur) =>
          cur && cur.map((s, n) => (n === i ? { ...s, state: "done", output: result.output, latencyMs: result.latencyMs } : s)),
        );
        if (result.done) setFinal(result.output);
      }
    } catch (e) {
      // Network drop, timeout, or a framework-level rejection.
      console.error("Run failed:", e);
      if (current >= 0) setView((cur) => cur && cur.map((s, n) => (n === current ? { ...s, state: "failed" } : s)));
      setError("The connection to the server was lost. Check History to see how far the run got.");
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  async function copy() {
    if (!final) return;
    try {
      await navigator.clipboard.writeText(final);
      setCopied(true);
    } catch {
      setError("Could not copy. Select the text and copy it manually.");
    }
  }

  return (
    <section className="panel flex flex-col gap-4 rounded-2xl p-5" aria-labelledby="run-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="run-title" className="text-lg font-semibold">Run this chain</h2>
        <span className="chip">Gemini</span>
      </div>

      {!runnable ? (
        <p className="rounded-xl bg-tint px-3 py-2 text-sm text-muted">{notRunnableReason}</p>
      ) : (
        <>
          <div role="group" aria-label="Photo source" className="grid grid-cols-2 rounded-xl border border-line bg-surface-strong p-0.5">
            {(["upload", "library"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={source === s}
                disabled={running}
                onClick={() => setSource(s)}
                className={`rounded-[0.6rem] px-3 py-1.5 text-sm font-medium transition-colors ${
                  source === s ? "bg-tint text-accent-text shadow-[inset_0_0_0_1px_rgb(255_122_26/0.3)]" : "text-muted hover:text-ink"
                }`}
              >
                {s === "upload" ? "Upload a photo" : "Library"}
              </button>
            ))}
          </div>

          {source === "upload" ? (
            <div>
              <input
                ref={fileInput}
                id="run-image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={running}
                className="sr-only"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
              <label
                htmlFor="run-image"
                className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed border-line bg-tint/40 text-center text-sm text-muted hover:border-glow"
              >
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Selected photo preview" className="max-h-56 w-full object-contain" />
                ) : (
                  <>
                    <span className="font-semibold text-ink">Choose a photo</span>
                    <span>JPEG, PNG or WebP, up to 4 MB</span>
                  </>
                )}
              </label>
              {file && <p className="mt-1 truncate text-xs text-muted">{file.name}</p>}
            </div>
          ) : library.length === 0 ? (
            <p className="rounded-xl bg-tint px-3 py-2 text-sm text-muted">The image library is empty. Upload a photo instead.</p>
          ) : (
            <ul className="grid max-h-60 grid-cols-3 gap-2 overflow-y-auto pr-1" aria-label="Library images">
              {library.map((image) => (
                <li key={image.id}>
                  <button
                    type="button"
                    disabled={running}
                    aria-pressed={libraryId === image.id}
                    onClick={() => setLibraryId(image.id)}
                    title={image.title}
                    className={`block w-full overflow-hidden rounded-xl border-2 transition-colors ${
                      libraryId === image.id ? "border-glow shadow-[var(--shadow-glow)]" : "border-transparent hover:border-line"
                    }`}
                  >
                    <Thumb src={image.url} alt={image.title} className="aspect-square w-full" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div>
            <label htmlFor="run-text" className="label">Context (optional)</label>
            <textarea
              id="run-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              maxLength={2000}
              disabled={running}
              placeholder="e.g. it's my dad's birthday; keep it family friendly"
              className="field"
            />
          </div>

          <button type="button" onClick={run} disabled={!ready || running} className="btn-primary">
            {running ? (<><span className="spinner" aria-hidden="true" /> Running…</>) : `Run ${steps.length} step${steps.length === 1 ? "" : "s"}`}
          </button>
        </>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-coral-tint px-3 py-2 text-sm text-coral-text">{error}</p>
      )}

      {view && (
        <ol className="flex flex-col gap-3" aria-label="Run progress" aria-live="polite">
          {view.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="step-badge" data-state={s.state === "done" ? "done" : s.state === "pending" ? "pending" : undefined} aria-hidden="true">
                {s.state === "running" ? <span className="spinner" /> : s.state === "done" ? "✓" : s.state === "failed" ? "!" : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold uppercase tracking-wider text-muted" title={s.instruction}>
                  Step {i + 1}
                  {s.latencyMs !== undefined && <span className="ml-2 font-normal normal-case tracking-normal">{formatLatency(s.latencyMs)}</span>}
                </p>
                {s.output ? (
                  <p className="mt-1 whitespace-pre-wrap rounded-xl bg-tint/60 px-3 py-2 text-sm">{s.output}</p>
                ) : (
                  <p className="mt-1 text-sm text-muted">
                    {s.state === "running" ? "Thinking…" : s.state === "failed" ? "Failed" : "Waiting"}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {final && (
        <div className="plate flex flex-col gap-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-text">Final caption</p>
          <p className="font-display text-lg font-semibold leading-snug">{final}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copy} className="btn-quiet btn-sm">{copied ? "Copied" : "Copy"}</button>
            {runId !== null && <Link href={`/runs/${runId}`} className="btn-quiet btn-sm">Open run</Link>}
            <Link href={`/chains/${chainId}/media`} className="btn-quiet btn-sm">Chain media</Link>
          </div>
        </div>
      )}
    </section>
  );
}
