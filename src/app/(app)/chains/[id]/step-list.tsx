"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { addStep, deleteStep, insertStep, reorderSteps, updateStep } from "../actions";
import { Icon, type IconName } from "@/components/icons";
import { moveItem, sameOrder } from "@/lib/order";
import type { SnapshotDiff, StepDiff } from "@/lib/run-state";
import { ideasFor, stageFor } from "@/lib/stages";
import type { RunState, Step, StepView } from "@/lib/types";

const IDEA_ICON: Record<string, IconName> = { think: "spark", refine: "wand", caption: "quote" };

type Props = { chainId: number; steps: Step[]; run: RunState; diff: SnapshotDiff };

type Drag = { id: number; grab: number; y: number; startIds: number[] };

// The left half of the workspace: your creative process as a stack of cards.
// Click a card to edit it, drag the handle (or use the arrows) to reorder, and
// hover between cards to insert a step exactly where it belongs. While a chain
// runs, each card shows its own live state; after edits, cards that changed
// since the last run say so.
export function StepList({ chainId, steps, run, diff }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(steps);
  const [seen, setSeen] = useState(steps);
  if (steps !== seen) {
    setSeen(steps);
    setItems(steps);
  }
  const itemsRef = useRef(items);
  useLayoutEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [insertIdx, setInsertIdx] = useState<number | null>(null);
  const [insertText, setInsertText] = useState("");
  const [newText, setNewText] = useState("");
  const [announce, setAnnounce] = useState("");
  const say = (message: string) => setAnnounce((cur) => (cur === message ? `${message}\u200b` : message)); // a repeat still re-announces
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [dragId, setDragId] = useState<number | null>(null);

  const listRef = useRef<HTMLOListElement>(null);
  const cards = useRef(new Map<number, HTMLLIElement>());
  const offsets = useRef(new Map<number, number>());
  const ready = useRef(false);
  const drag = useRef<Drag | null>(null);
  const raf = useRef(0);

  function persist(previous: Step[], next: Step[]) {
    setError(null);
    startTransition(async () => {
      const result = await reorderSteps(chainId, next.map((s) => s.id));
      if (!result.ok) {
        itemsRef.current = previous;
        setItems(previous);
        setError(result.error);
        router.refresh(); // the list may be stale: reload the server's order
      }
    });
  }

  // ---- placing the dragged card under the pointer ----------------------------
  function place() {
    const d = drag.current;
    const list = listRef.current;
    const li = d && cards.current.get(d.id);
    if (!d || !list || !li) return;
    const top = d.y - list.getBoundingClientRect().top - d.grab; // card top, in list coordinates
    li.style.transform = `translateY(${top - li.offsetTop}px)`;

    const center = top + li.offsetHeight / 2;
    const current = itemsRef.current;
    const from = current.findIndex((s) => s.id === d.id);
    let to = 0;
    for (const s of current) {
      if (s.id === d.id) continue;
      const el = cards.current.get(s.id);
      if (el && el.offsetTop + el.offsetHeight / 2 < center) to += 1;
    }
    if (to !== from) {
      const next = moveItem(current, from, to);
      itemsRef.current = next;
      setItems(next);
    }
  }

  function tick() {
    const d = drag.current;
    if (!d) return;
    if (d.y < 90) window.scrollBy(0, -Math.min(18, (90 - d.y) / 4));
    else if (d.y > window.innerHeight - 90) window.scrollBy(0, Math.min(18, (d.y - (window.innerHeight - 90)) / 4));
    place();
    raf.current = requestAnimationFrame(tick);
  }

  function startDrag(e: React.PointerEvent<HTMLButtonElement>, id: number) {
    if (e.button !== 0 || pending || drag.current) return;
    const li = cards.current.get(id);
    if (!li) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id, grab: e.clientY - li.getBoundingClientRect().top, y: e.clientY, startIds: itemsRef.current.map((s) => s.id) };
    setDragId(id);
    setSelectedId(null);
    raf.current = requestAnimationFrame(tick);
  }

  function endDrag(cancel: boolean) {
    const d = drag.current;
    if (!d) return;
    cancelAnimationFrame(raf.current);
    drag.current = null;
    const li = cards.current.get(d.id);
    if (li) {
      // The card settles into its slot with a little spring.
      li.style.transition = "transform 360ms var(--spring)";
      li.style.transform = "none";
      setTimeout(() => {
        li.style.transition = "";
      }, 380);
    }
    setDragId(null);

    const byId = new Map(itemsRef.current.map((s) => [s.id, s]));
    const original = d.startIds.map((id) => byId.get(id)).filter((s): s is Step => Boolean(s));
    if (cancel) {
      itemsRef.current = original;
      setItems(original);
      return;
    }
    const now = itemsRef.current;
    if (!sameOrder(original.map((s) => s.id), now.map((s) => s.id))) {
      const moved = now.findIndex((s) => s.id === d.id);
      say(`Step moved to position ${moved + 1} of ${now.length}.`);
      persist(original, now);
    }
  }

  useEffect(() => {
    if (dragId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") endDrag(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // endDrag only reads refs and stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // FLIP: neighbours glide aside, new cards rise in. Offsets are positions
  // inside the list, so scrolling cannot confuse them. The dragged card is
  // excluded: it follows the pointer instead.
  useLayoutEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<number, number>();
    for (const [id, el] of cards.current) {
      const top = el.offsetTop;
      next.set(id, top);
      if (!ready.current || reduce || id === drag.current?.id) continue;
      const before = offsets.current.get(id);
      if (before === undefined) {
        el.animate([{ opacity: 0, transform: "translateY(18px) scale(0.96)" }, { opacity: 1, transform: "none" }], {
          duration: 480,
          easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        });
      } else if (Math.abs(before - top) > 1) {
        el.animate([{ transform: `translateY(${before - top}px)` }, { transform: "none" }], {
          duration: 360,
          easing: "cubic-bezier(0.34, 1.3, 0.64, 1)",
        });
      }
    }
    offsets.current = next;
    ready.current = true;
    if (drag.current) place();
  }, [items]);

  // Focus the editor when a card is opened.
  useEffect(() => {
    if (selectedId !== null) document.getElementById(`step-${selectedId}`)?.focus();
  }, [selectedId]);

  function move(index: number, delta: -1 | 1) {
    const to = index + delta;
    if (pending || drag.current || to < 0 || to >= items.length) return;
    say(`Step ${index + 1} moved to position ${to + 1} of ${items.length}.`);
    const next = moveItem(items, index, to);
    setItems(next);
    persist(items, next);
  }

  function append() {
    const text = newText.trim();
    if (!text) return;
    setError(null);
    startTransition(async () => {
      const result = await addStep(chainId, text);
      if (result.ok) setNewText("");
      else setError(result.error);
    });
  }

  function insert() {
    const text = insertText.trim();
    if (!text || insertIdx === null) return;
    setError(null);
    startTransition(async () => {
      // Anchor to the step it follows, not to a list index that may be stale.
      const result = await insertStep(chainId, items[insertIdx - 1]?.id ?? null, text);
      if (result.ok) {
        setInsertText("");
        setInsertIdx(null);
      } else setError(result.error);
    });
  }

  const ideas = ideasFor(items.length);
  const viewFor = (stepId: number): StepView | undefined => {
    if (!run.view || !run.snapshot) return undefined;
    const i = run.snapshot.findIndex((s) => s.id === stepId);
    return i >= 0 ? run.view[i] : undefined;
  };

  const composer = (
    <li className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4" key="composer">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-tint text-accent-text ring-2 ring-accent/40" aria-hidden="true">
        <Icon name="plus" className="h-4 w-4" strokeWidth={2.4} />
      </span>
      <div className="panel pop-in p-4 sm:p-5">
        <label htmlFor="insert-step" className="display text-lg">A new step, right here</label>
        <textarea
          id="insert-step"
          autoFocus
          value={insertText}
          onChange={(e) => setInsertText(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="What should the model do at this point?"
          className="field mt-3 [field-sizing:content] min-h-[4.5rem]"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {ideasFor(2).map((idea) => (
            <button key={idea.title} type="button" onClick={() => setInsertText(idea.text)} className="chip !px-3 !py-1.5 transition-colors hover:bg-tint-2">
              <Icon name={IDEA_ICON[idea.stage]} className="h-3.5 w-3.5" /> {idea.title}
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={() => { setInsertIdx(null); setInsertText(""); }} className="btn-ghost btn-sm">Cancel</button>
          <button type="button" onClick={insert} disabled={pending || !insertText.trim()} className="btn-primary btn-sm">
            {pending ? <><span className="spinner" /> Adding…</> : <><Icon name="plus" strokeWidth={2.2} /> Insert step</>}
          </button>
        </div>
      </div>
    </li>
  );

  const rows: React.ReactNode[] = [];
  items.forEach((step, index) => {
    if (insertIdx === index) rows.push(composer);
    const view = viewFor(step.id);
    const stepDiff: StepDiff | undefined = diff.steps.get(step.id);
    rows.push(
      <li
        key={step.id}
        ref={(el) => {
          if (el) cards.current.set(step.id, el);
          else cards.current.delete(step.id);
        }}
        className="thread relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4"
      >
        <span className="step-badge" data-state={badgeState(run, view)} aria-hidden="true">
          {view?.state === "done" && stepDiff === "same" ? <Icon name="check" className="h-4 w-4" strokeWidth={2.6} /> : index + 1}
        </span>
        <StepCard
          chainId={chainId}
          step={step}
          index={index}
          count={items.length}
          selected={selectedId === step.id}
          onSelect={() => setSelectedId((cur) => (cur === step.id ? null : step.id))}
          draft={drafts[step.id]}
          onDraft={(value) => setDrafts((cur) => ({ ...cur, [step.id]: value }))}
          dragging={dragId === step.id}
          busy={pending}
          view={view}
          diffKind={stepDiff}
          stale={diff.stale}
          runStopped={run.phase === "failed"}
          onMove={move}
          onGripDown={(e) => startDrag(e, step.id)}
          onGripMove={(e) => {
            if (drag.current) drag.current.y = e.clientY;
          }}
          onGripUp={() => endDrag(false)}
          onGripCancel={() => endDrag(true)}
          onError={setError}
        />
        {index < items.length - 1 && dragId === null && insertIdx !== index + 1 && (
          <div className="insert-zone">
            <button type="button" className="insert-btn liquid liquid-strong" aria-label={`Insert a step after step ${index + 1}`} title="Insert a step here" onClick={() => { setInsertIdx(index + 1); setInsertText(""); }}>
              <Icon name="plus" className="h-4 w-4" strokeWidth={2.4} />
            </button>
          </div>
        )}
      </li>,
    );
  });
  if (insertIdx !== null && insertIdx >= items.length) rows.push(composer);

  return (
    <div className="flex flex-col">
      {error && <p role="alert" className="mb-4 rounded-2xl bg-coral-tint px-4 py-3 text-sm font-medium text-coral-text">{error}</p>}
      <p role="status" aria-live="polite" className="sr-only">{announce}</p>

      <ol ref={listRef} className="relative flex flex-col gap-5" aria-label="Steps in order">
        {rows}

        <li className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4">
          <span className="grid h-10 w-10 place-items-center rounded-full border-2 border-dashed border-line-strong text-muted" aria-hidden="true">
            <Icon name="plus" className="h-4 w-4" strokeWidth={2.2} />
          </span>
          <div className="rounded-[1.25rem] border-2 border-dashed border-line-strong p-5 transition-colors focus-within:border-accent">
            <label htmlFor="new-step" className="display text-lg">{items.length === 0 ? "Start with the first step" : "What happens next?"}</label>
            <p className="mt-0.5 text-sm text-muted">
              {items.length === 0 ? "Tell the model how to look at the photo. Every step sees the photo, your hint, and the step before it." : "Each new step builds on the previous one."}
            </p>
            <textarea
              id="new-step"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Describe what this step should do…"
              className="field mt-3 [field-sizing:content] min-h-[4.5rem]"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {ideas.map((idea) => (
                <button key={idea.title} type="button" onClick={() => setNewText(idea.text)} className="chip !px-3 !py-1.5 transition-colors hover:bg-tint-2">
                  <Icon name={IDEA_ICON[idea.stage]} className="h-3.5 w-3.5" /> {idea.title}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-xs tabular-nums text-muted">{newText.length}/1000</span>
              <button type="button" onClick={append} disabled={pending || !newText.trim() || items.length >= 50} className="btn-primary">
                {pending ? <><span className="spinner" /> Working…</> : <><Icon name="plus" strokeWidth={2.2} /> Add step</>}
              </button>
            </div>
          </div>
        </li>
      </ol>
    </div>
  );
}

function badgeState(run: RunState, view: StepView | undefined) {
  if (!view) return run.phase === "running" ? "pending" : undefined;
  if (view.state === "pending" && run.phase !== "running") return undefined;
  return view.state;
}

function StepCard({
  chainId,
  step,
  index,
  count,
  selected,
  onSelect,
  draft: draftValue,
  onDraft,
  dragging,
  busy,
  view,
  diffKind,
  stale,
  runStopped,
  onMove,
  onGripDown,
  onGripMove,
  onGripUp,
  onGripCancel,
  onError,
}: {
  chainId: number;
  step: Step;
  index: number;
  count: number;
  selected: boolean;
  onSelect: () => void;
  draft: string | undefined;
  onDraft: (value: string) => void;
  dragging: boolean;
  busy: boolean;
  view: StepView | undefined;
  diffKind: StepDiff | undefined;
  stale: boolean;
  runStopped: boolean;
  onMove: (index: number, delta: -1 | 1) => void;
  onGripDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onGripMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onGripUp: () => void;
  onGripCancel: () => void;
  onError: (message: string | null) => void;
}) {
  const stage = stageFor(index, count);
  const draft = draftValue ?? step.instruction;
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = draft.trim() !== step.instruction;
  const changed = diffKind === "edited" || diffKind === "new" || diffKind === "moved";

  function save() {
    onError(null);
    startTransition(async () => {
      const result = await updateStep(chainId, step.id, draft);
      if (!result.ok) onError(result.error);
    });
  }
  function remove() {
    onError(null);
    startTransition(async () => {
      const result = await deleteStep(chainId, step.id);
      if (!result.ok) onError(result.error);
    });
  }

  return (
    <article
      className="step-card panel p-4 sm:p-5"
      data-dragging={dragging}
      data-selected={selected}
      data-run={view?.state === "running" ? "running" : undefined}
    >
      <header className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={onSelect}
          aria-expanded={selected}
          aria-controls={`step-body-${step.id}`}
          className="flex min-w-0 flex-1 basis-40 items-start gap-3 rounded-xl text-left"
        >
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-tint text-accent-text"><Icon name={stage.icon} /></span>
          <span className="min-w-0">
            <span className="display block text-lg leading-tight">{stage.label}</span>
            <span className="block text-xs text-muted">{stage.tagline}</span>
          </span>
        </button>
        <div className="-mr-1 ml-auto flex shrink-0 items-center max-sm:-mt-1 max-sm:w-full max-sm:justify-end">
          {view?.state === "running" && <span className="chip mr-1"><span className="spinner !h-3 !w-3" /> Running</span>}
          {view?.state === "done" && !changed && <span className="chip chip-ok mr-1"><Icon name="check" className="h-3 w-3" strokeWidth={2.8} /> Ran</span>}
          {view?.state === "failed" && <span className="chip chip-bad mr-1">Stopped here</span>}
          {view?.state === "pending" && runStopped && <span className="chip chip-mute mr-1">Not run</span>}
          {changed && <span className="chip mr-1">{diffKind === "new" ? "New" : diffKind === "moved" ? "Moved" : "Edited"} since last run</span>}
          {dirty && !selected && <span className="chip chip-mute mr-1">Unsaved</span>}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onPointerDown={onGripDown}
            onPointerMove={onGripMove}
            onPointerUp={onGripUp}
            onPointerCancel={onGripCancel}
            title="Drag to reorder (keyboard: use the arrows)"
            className="icon-btn cursor-grab touch-none active:cursor-grabbing"
          >
            <Icon name="grip" />
          </button>
          <button type="button" className="icon-btn" aria-disabled={busy || index === 0} onClick={() => onMove(index, -1)} aria-label={`Move step ${index + 1} up`} title="Move up"><Icon name="up" strokeWidth={2.2} /></button>
          <button type="button" className="icon-btn" aria-disabled={busy || index === count - 1} onClick={() => onMove(index, 1)} aria-label={`Move step ${index + 1} down`} title="Move down"><Icon name="down" strokeWidth={2.2} /></button>
        </div>
      </header>

      <div id={`step-body-${step.id}`}>
        {selected ? (
          <div className="mt-3">
            <label htmlFor={`step-${step.id}`} className="sr-only">Instruction for step {index + 1}</label>
            <textarea
              id={`step-${step.id}`}
              value={draft}
              onChange={(e) => onDraft(e.target.value)}
              rows={3}
              maxLength={1000}
              className="field [field-sizing:content] min-h-[5rem]"
            />
            <footer className="mt-2.5 flex flex-wrap items-center gap-2">
              {confirming ? (
                <>
                  <span className="text-sm font-medium text-coral-text">Delete this step?</span>
                  <button type="button" onClick={remove} disabled={pending} className="btn-danger btn-sm">{pending ? "Deleting…" : "Delete"}</button>
                  <button type="button" onClick={() => setConfirming(false)} className="btn-quiet btn-sm">Keep it</button>
                </>
              ) : (
                <>
                  <span className="text-xs tabular-nums text-muted">{draft.length}/1000</span>
                  <button type="button" onClick={() => setConfirming(true)} className="btn-ghost btn-sm hover:!text-coral-text" aria-label={`Delete step ${index + 1}`}><Icon name="trash" /> Delete</button>
                  {dirty && (
                    <div className="ml-auto flex items-center gap-2">
                      <button type="button" onClick={() => onDraft(step.instruction)} className="btn-ghost btn-sm">Discard</button>
                      <button type="button" onClick={save} disabled={pending || !draft.trim()} className="btn-primary btn-sm">{pending ? "Saving…" : "Save changes"}</button>
                    </div>
                  )}
                </>
              )}
            </footer>
          </div>
        ) : (
          <button type="button" onClick={onSelect} className="group relative mt-3 block w-full rounded-xl bg-sunken py-3 pl-3.5 pr-11 text-left text-sm leading-relaxed ring-1 ring-line transition-colors hover:bg-tint/60" aria-label={`Edit step ${index + 1}`}>
            <span className="line-clamp-3 whitespace-pre-wrap text-ink-2">{draft}</span>
            <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-lg text-muted transition-colors group-hover:bg-tint group-hover:text-accent-text" aria-hidden="true"><Icon name="edit" className="h-3.5 w-3.5" /></span>
          </button>
        )}

        {view?.state === "running" && (
          <p className="mt-3 text-sm font-medium text-accent-text">Thinking<span className="dots" aria-hidden="true"><span /><span /><span /></span></p>
        )}
        {view?.state === "done" && view.output && (
          <div className={`pop-in mt-3 rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ring-1 ${changed || stale ? "bg-sunken text-muted ring-line" : "bg-ok-tint/60 text-ink-2 ring-ok-text/20"}`}>
            <p className="label !mb-1">{changed || stale ? "Previous output" : "Latest output"}</p>
            <p className="line-clamp-4 whitespace-pre-wrap">{view.output}</p>
          </div>
        )}
      </div>
    </article>
  );
}
