"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { runNextStep, startRun } from "@/app/(app)/runs/actions";
import { CopyButton } from "./copy-button";
import { Creature } from "./creature";
import { Icon } from "./icons";
import { JourneyTrack } from "./journey";
import { Typewriter } from "./typewriter";
import { Thumb } from "./ui";
import { formatLatency } from "@/lib/format";
import { moodFor, moodLine } from "@/lib/mood";
import type { SnapshotDiff } from "@/lib/run-state";
import { stageFor, stagesFor } from "@/lib/stages";
import { IDLE_RUN, type LibraryImage, type RunState, type Step, type StepView } from "@/lib/types";

type Props = {
  chainId: number;
  steps: Step[];
  library: (LibraryImage & { url: string })[];
  runnable: boolean;
  notRunnableReason: string | null;
  run: RunState;
  setRun: React.Dispatch<React.SetStateAction<RunState>>;
  diff: SnapshotDiff;
  voiceLabel: string | null;
  modelLabel: string;
};

const TYPES = ["image/jpeg", "image/png", "image/webp"];

// The right half of the workspace: pick a photo, run the chain, and watch it
// happen. Everything shown here is real: the outputs are Gemini's, the progress
// is the server's, and the Caption Creature's mood follows the actual state.
export function PreviewPanel({ chainId, steps, library, runnable, notRunnableReason, run, setRun, diff, voiceLabel, modelLabel }: Props) {
  const router = useRouter();
  const root = useRef<HTMLElement>(null);
  const [source, setSource] = useState<"upload" | "library">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [libraryId, setLibraryId] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  const running = run.phase === "running";
  const heroSrc = source === "upload" ? preview : (library.find((i) => i.id === libraryId)?.url ?? null);
  const ready = source === "upload" ? file !== null : libraryId !== null;
  const view = run.view;
  const doneCount = view?.filter((s) => s.state === "done").length ?? 0;
  const activeIndex = view?.findIndex((s) => s.state === "running") ?? -1;
  const stages = stagesFor(view?.length ?? steps.length);
  const finished = run.phase === "done" || (run.phase === "failed" && view !== null);
  const staleResult = diff.stale && finished;
  const changes = [...diff.steps.values()].filter((d) => d !== "same").length + diff.removed;

  const mood = moodFor({ phase: run.phase, hasPhoto: ready, stepIndex: activeIndex, total: view?.length ?? steps.length });
  const stage = activeIndex >= 0 ? stageFor(activeIndex, view?.length ?? steps.length) : null;

  // When the caption is ready, make sure it is actually on screen (the panel can scroll on its own).
  useEffect(() => {
    if (!run.final) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("run-result")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  }, [run.final]);

  // Release the preview's object URL when it is replaced or the panel unmounts.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function pickFile(next: File | null) {
    // Check on the client first: a file over the server's body limit would
    // fail with a framework error instead of a friendly message.
    if (next && !TYPES.includes(next.type)) {
      setInputError("Unsupported file type. Please use a JPEG, PNG, or WebP image.");
      next = null;
    } else if (next && next.size > 4 * 1024 * 1024) {
      setInputError("That photo is too large. The limit is 4 MB.");
      next = null;
    } else {
      setInputError(null);
    }
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
  }

  const patch = (f: (v: StepView[]) => StepView[]) => setRun((r) => (r.view ? { ...r, view: f(r.view) } : r));

  async function startChain() {
    if (!ready || running) return;
    setInputError(null);
    setRun({
      ...IDLE_RUN,
      phase: "running",
      view: steps.map(() => ({ state: "pending" })),
      snapshot: steps.map((s) => ({ id: s.id, instruction: s.instruction })),
      photoSrc: heroSrc,
    });
    if (window.innerWidth < 1024) {
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      root.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }

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
        setRun({ ...IDLE_RUN, phase: "failed", error: started.error });
        return;
      }
      setRun((r) => ({ ...r, runId: started.runId, view: Array.from({ length: started.total }, (_, n) => r.view?.[n] ?? { state: "pending" as const }) }));

      // Strictly sequential: step N+1 is only requested after step N is saved.
      for (let i = 0; i < started.total; i++) {
        current = i;
        patch((v) => v.map((s, n) => (n === i ? { ...s, state: "running" } : s)));
        const result = await runNextStep(started.runId);
        if (!result.ok) {
          patch((v) => v.map((s, n) => (n === i ? { ...s, state: "failed" } : s)));
          setRun((r) => ({ ...r, phase: "failed", error: result.error }));
          return;
        }
        patch((v) => v.map((s, n) => (n === i ? { state: "done", output: result.output, latencyMs: result.latencyMs } : s)));
        if (result.done) setRun((r) => ({ ...r, phase: "done", final: result.output }));
      }
    } catch (e) {
      // Network drop, timeout, or a framework-level rejection.
      console.error("Run failed:", e);
      if (current >= 0) patch((v) => v.map((s, n) => (n === current ? { ...s, state: "failed" } : s)));
      setRun((r) => ({ ...r, phase: "failed", error: "The connection to the server was lost. Check History to see how far the run got." }));
    } finally {
      router.refresh();
    }
  }

  const reset = () => setRun(IDLE_RUN);

  const title = run.phase === "running" ? "Making your caption" : run.phase === "done" ? "All done" : run.phase === "failed" ? "That didn't work" : "Run this chain";

  return (
    <section ref={root} id="studio" className="panel flex scroll-mt-24 flex-col gap-5 p-5 sm:p-6" aria-labelledby="run-title">
      <div className="flex items-center gap-4">
        <div className="w-[5.2rem] shrink-0 sm:w-24"><Creature mood={mood} /></div>
        <div className="min-w-0">
          <p className="eyebrow">Live preview</p>
          <h2 id="run-title" className="mt-0.5 text-2xl leading-tight">{title}</h2>
          <p className="mt-2 inline-block rounded-full bg-tint px-3 py-1 text-xs font-medium text-ink-2 ring-1 ring-line" aria-live="polite">{moodLine(mood)}</p>
        </div>
      </div>

      <ul className="flex flex-wrap gap-1.5 text-xs" aria-label="Run settings">
        <li className="chip chip-mute"><Icon name="spark" className="h-3 w-3" /> {modelLabel}</li>
        <li className="chip chip-mute">{voiceLabel ? `Voice · ${voiceLabel}` : "No voice"}</li>
        <li className="chip chip-mute">{steps.length} step{steps.length === 1 ? "" : "s"}</li>
        <li className="chip chip-mute" title="Server-side usage limit">Up to 12 runs an hour</li>
      </ul>

      {!runnable ? (
        <p className="rounded-2xl bg-tint px-4 py-3 text-sm leading-relaxed text-ink-2">{notRunnableReason}</p>
      ) : view === null ? (
        <>
          <div role="group" aria-label="Photo source" className="grid grid-cols-2 gap-1 rounded-2xl bg-sunken p-1 ring-1 ring-line">
            {(["upload", "library"] as const).map((s) => (
              <button key={s} type="button" aria-pressed={source === s} onClick={() => setSource(s)} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${source === s ? "bg-surface-solid text-accent-text shadow-[var(--shadow-sm)]" : "text-muted hover:text-ink"}`}>
                <Icon name={s === "upload" ? "upload" : "library"} /> {s === "upload" ? "Upload" : "Library"}
              </button>
            ))}
          </div>

          {source === "upload" ? (
            <div>
              <input id="run-image" type="file" accept={TYPES.join(",")} className="sr-only" onChange={(e) => { pickFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
              <label
                htmlFor="run-image"
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0] ?? null); }}
                className={`group relative flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 text-center transition-all ${preview ? "border-transparent bg-sunken" : dragging ? "border-dashed border-accent bg-tint" : "border-dashed border-line-strong bg-sunken hover:border-accent hover:bg-tint/60"}`}
              >
                {preview ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="Selected photo preview" className="pop-in h-full w-full object-contain" />
                    <span className="liquid liquid-strong absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-ink-2 transition-transform group-hover:scale-105"><Icon name="retry" className="h-3.5 w-3.5" /> Change photo</span>
                  </>
                ) : (
                  <>
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-tint text-accent-text transition-transform group-hover:scale-110"><Icon name="upload" className="h-5 w-5" /></span>
                    <span className="display text-lg">Drop a photo here</span>
                    <span className="text-xs text-muted">or click to browse · JPEG, PNG, WebP · up to 4 MB</span>
                  </>
                )}
              </label>
              {file && <p className="mt-1.5 truncate text-xs text-muted">{file.name}</p>}
            </div>
          ) : library.length === 0 ? (
            <p className="rounded-2xl bg-tint px-4 py-3 text-sm text-ink-2">The image library is empty. Upload a photo instead.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {heroSrc && (
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-sunken ring-1 ring-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img key={heroSrc} src={heroSrc} alt="Selected library photo" className="pop-in h-full w-full object-contain" />
                </div>
              )}
              <ul className="grid max-h-48 grid-cols-4 gap-2 overflow-y-auto p-1" aria-label="Library images">
                {library.map((image) => (
                  <li key={image.id}>
                    <button type="button" aria-pressed={libraryId === image.id} onClick={() => setLibraryId(image.id)} title={image.title} className={`relative block w-full overflow-hidden rounded-xl ring-2 transition-all ${libraryId === image.id ? "scale-[0.96] ring-accent shadow-[var(--shadow-glow)]" : "ring-transparent hover:ring-line-strong"}`}>
                      <Thumb src={image.url} alt={image.title} className="aspect-square w-full" />
                      {libraryId === image.id && <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-accent text-on-accent"><Icon name="check" className="h-3 w-3" strokeWidth={3} /></span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label htmlFor="run-text" className="label">A hint for the model <span className="font-normal normal-case tracking-normal">(optional)</span></label>
            <textarea id="run-text" value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} placeholder="e.g. it's my dad's birthday, keep it family friendly" className="field [field-sizing:content]" />
          </div>

          <button type="button" onClick={startChain} disabled={!ready} className="btn-primary btn-lg w-full">
            <Icon name="spark" className="h-[1.1rem] w-[1.1rem]" /> Run {steps.length} step{steps.length === 1 ? "" : "s"}
          </button>
          {!ready && <p className="-mt-2 text-center text-xs text-muted">{source === "upload" ? "Choose a photo to begin." : "Pick a library image to begin."}</p>}
          {(inputError || run.error) && <p role="alert" className="rounded-2xl bg-coral-tint px-4 py-3 text-sm font-medium text-coral-text">{inputError ?? run.error}</p>}
        </>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-2xl bg-sunken ring-1 ring-line">
            {run.photoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={run.photoSrc} alt="The photo being captioned" className="max-h-80 w-full object-cover" />
            ) : (
              <div className="grid h-48 place-items-center text-muted"><Icon name="photo" className="h-8 w-8" /></div>
            )}
            {running && <span className="scan" aria-hidden="true" />}
            <span className="liquid absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-ink">
              {running && stage ? <><span className="spinner !h-3 !w-3" /> Step {activeIndex + 1} of {view.length} · {stage.label}</> : run.phase === "done" ? <><Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.6} /> Finished</> : "Stopped"}
            </span>
          </div>

          <div className="flex flex-col gap-3">
            <div className="progress" aria-hidden="true">{view.map((s, i) => <i key={i} data-state={s.state === "failed" ? "pending" : s.state} />)}</div>
            <JourneyTrack stages={stages} mode="run" done={doneCount} active={activeIndex} complete={run.phase === "done"} compact />
          </div>

          <ol className="flex flex-col gap-3" aria-label="Run progress" aria-live="polite">
            {view.map((s, i) => {
              const st = stageFor(i, view.length);
              const isFinal = run.final !== null && i === view.length - 1;
              return (
                <li key={i} className="flex gap-3">
                  <span className="step-badge !h-9 !w-9 !text-[0.95rem]" data-state={s.state} aria-hidden="true">
                    {s.state === "done" ? <Icon name="check" className="h-4 w-4" strokeWidth={2.6} /> : s.state === "failed" ? "!" : s.state === "running" ? <span className="spinner" /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1 pb-1">
                    <p className="flex items-baseline gap-2 text-sm font-semibold">{st.label}{s.latencyMs !== undefined && <span className="text-xs font-normal text-muted">{formatLatency(s.latencyMs)}</span>}</p>
                    {s.state === "done" && s.output ? (
                      isFinal ? <p className="mt-1 text-sm text-muted">Written. Your caption is below.</p> : (
                        <p className="pop-in mt-1.5 whitespace-pre-wrap rounded-2xl bg-sunken px-3.5 py-2.5 text-sm leading-relaxed text-ink-2 ring-1 ring-line"><Typewriter text={s.output} /></p>
                      )
                    ) : s.state === "running" ? (
                      <p className="mt-1 text-sm text-accent-text">Thinking<span className="dots" aria-hidden="true"><span /><span /><span /></span></p>
                    ) : s.state === "failed" ? (
                      <p className="mt-1 text-sm text-coral-text">This step did not finish.</p>
                    ) : (
                      <p className="mt-1 text-sm text-muted">Up next · {st.tagline.toLowerCase()}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {run.error && <p role="alert" className="rounded-2xl bg-coral-tint px-4 py-3 text-sm font-medium text-coral-text">{run.error}</p>}

          {staleResult && (
            <div className="liquid liquid-strong pop-in flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 text-sm" role="status">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-tint text-accent-text"><Icon name="wand" className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1 basis-48">
                <strong className="block">You&apos;ve edited this chain since this run.</strong>
                <span className="text-muted">{changes} change{changes === 1 ? "" : "s"}: this is the <em>previous</em> version&apos;s result.</span>
              </span>
              <button type="button" onClick={startChain} disabled={!ready || running} className="btn-primary btn-sm">Run the new version</button>
            </div>
          )}

          {run.final && (
            <div id="run-result" className="result-card flex scroll-mb-4 flex-col gap-4 p-5" data-stale={staleResult}>
              <p className="eyebrow flex items-center gap-1.5">
                <Icon name="spark" className="h-3.5 w-3.5" /> {staleResult ? "Previous result" : "Your caption is ready"}
              </p>
              <p className="caption-text text-2xl sm:text-[1.7rem]">{run.final}</p>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={run.final} className="btn-primary btn-sm" />
                {run.runId !== null && <Link href={`/runs/${run.runId}`} className="btn-quiet btn-sm"><Icon name="eye" /> View result</Link>}
                <Link href={`/chains/${chainId}/media`} className="btn-ghost btn-sm"><Icon name="gallery" /> Chain gallery</Link>
              </div>
            </div>
          )}

          {!running && (
            <button type="button" onClick={reset} className="btn-quiet w-full"><Icon name="retry" /> {run.final ? "Run it on another photo" : "Try again"}</button>
          )}
        </>
      )}
    </section>
  );
}
