"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { addStep, deleteStep, reorderSteps, updateStep } from "../actions";
import { Icon, type IconName } from "@/components/icons";
import { dropIndex, moveItem, sameOrder } from "@/lib/order";
import { ideasFor, stageFor } from "@/lib/stages";
import type { Step } from "@/lib/types";

type Props = { chainId: number; steps: Step[] };

const IDEA_ICON: Record<string, IconName> = { think: "spark", refine: "wand", caption: "quote" };

// Local state only covers the time between an action and the server's refreshed
// copy of the steps: when new `steps` arrive they replace `items`. Unsaved
// drafts and the "add a step" text live here, keyed by step id, so they
// survive reorders, saves and deletes of OTHER steps.
export function StepList({ chainId, steps }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(steps);
  const [seen, setSeen] = useState(steps);
  if (steps !== seen) {
    setSeen(steps);
    setItems(steps);
  }
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [announce, setAnnounce] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<{ id: number; after: boolean } | null>(null);
  const [newText, setNewText] = useState("");
  const cards = useRef(new Map<number, HTMLLIElement>());
  const offsets = useRef(new Map<number, number>());
  const ready = useRef(false);

  // FLIP: when the order changes, cards glide from where they were to where
  // they are; a card that did not exist before rises in. Positions are
  // offsets inside the list, so scrolling cannot confuse them.
  useLayoutEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<number, number>();
    for (const [id, el] of cards.current) {
      const top = el.offsetTop;
      next.set(id, top);
      if (!ready.current || reduce) continue;
      const before = offsets.current.get(id);
      if (before === undefined) {
        el.animate(
          [{ opacity: 0, transform: "translateY(16px) scale(0.97)" }, { opacity: 1, transform: "none" }],
          { duration: 420, easing: "cubic-bezier(0.2, 0.9, 0.3, 1.1)" },
        );
      } else if (Math.abs(before - top) > 1) {
        el.animate([{ transform: `translateY(${before - top}px)` }, { transform: "none" }], {
          duration: 340,
          easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        });
      }
    }
    offsets.current = next;
    ready.current = true;
  }, [items]);

  function commitOrder(next: Step[]) {
    if (pending) return; // one reorder at a time keeps rollback simple
    if (sameOrder(next.map((s) => s.id), items.map((s) => s.id))) return;
    const previous = items;
    setItems(next);
    setError(null);
    startTransition(async () => {
      const result = await reorderSteps(chainId, next.map((s) => s.id));
      if (!result.ok) {
        setItems(previous);
        setError(result.error);
        router.refresh(); // the list may be stale: reload the server's order
      }
    });
  }

  function move(index: number, delta: -1 | 1) {
    const to = index + delta;
    if (pending || to < 0 || to >= items.length) return;
    setAnnounce(`Step ${index + 1} moved to position ${to + 1} of ${items.length}.`);
    commitOrder(moveItem(items, index, to));
  }

  function onDrop(targetId: number, after: boolean) {
    const from = items.findIndex((s) => s.id === dragId);
    const target = items.findIndex((s) => s.id === targetId);
    setDragId(null);
    setOver(null);
    if (from < 0 || target < 0) return;
    const to = dropIndex(from, target, after);
    if (to !== from) setAnnounce(`Step ${from + 1} moved to position ${to + 1} of ${items.length}.`);
    commitOrder(moveItem(items, from, to));
  }

  function add() {
    const text = newText.trim();
    if (!text) return;
    setError(null);
    startTransition(async () => {
      const result = await addStep(chainId, text);
      if (result.ok) setNewText("");
      else setError(result.error);
    });
  }

  const ideas = ideasFor(items.length);

  return (
    <div className="flex flex-col">
      {error && (
        <p role="alert" className="mb-4 rounded-2xl bg-coral-tint px-4 py-3 text-sm font-medium text-coral-text">{error}</p>
      )}
      <p role="status" aria-live="polite" className="sr-only">{announce}</p>

      <ol className="flex flex-col gap-5" aria-label="Steps in order">
        {items.map((step, index) => {
          const stage = stageFor(index, items.length);
          return (
            <li
              key={step.id}
              ref={(el) => {
                if (el) cards.current.set(step.id, el);
                else cards.current.delete(step.id);
              }}
              className="thread grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4"
              onDragOver={(e) => {
                if (dragId === null || dragId === step.id) return;
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                const after = e.clientY > rect.top + rect.height / 2;
                setOver((cur) => (cur?.id === step.id && cur.after === after ? cur : { id: step.id, after }));
              }}
              onDrop={(e) => {
                if (dragId === null) return;
                e.preventDefault();
                onDrop(step.id, over?.id === step.id ? over.after : false);
              }}
            >
              <span className="step-badge" aria-hidden="true">{index + 1}</span>
              <div className="min-w-0">
                {over?.id === step.id && !over.after && <div className="drop-line mb-2" aria-hidden="true" />}
                <StepCard
                  chainId={chainId}
                  step={step}
                  draft={drafts[step.id]}
                  onDraft={(value) => setDrafts((cur) => ({ ...cur, [step.id]: value }))}
                  index={index}
                  count={items.length}
                  stage={stage}
                  dragging={dragId === step.id}
                  busy={pending}
                  onMove={move}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(step.id));
                    const card = cards.current.get(step.id);
                    if (card) e.dataTransfer.setDragImage(card, 24, 24);
                    setDragId(step.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOver(null);
                  }}
                  onError={setError}
                />
                {over?.id === step.id && over.after && <div className="drop-line mt-2" aria-hidden="true" />}
              </div>
            </li>
          );
        })}

        <li className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4">
          <span className="grid h-10 w-10 place-items-center rounded-full border-2 border-dashed border-line-strong text-muted" aria-hidden="true">
            <Icon name="plus" className="h-4 w-4" strokeWidth={2.2} />
          </span>
          <div className="rounded-[1.25rem] border-2 border-dashed border-line-strong p-5 transition-colors focus-within:border-accent">
            <label htmlFor="new-step" className="display text-lg">{items.length === 0 ? "Start with the first step" : "What happens next?"}</label>
            <p className="mt-0.5 text-sm text-muted">
              {items.length === 0
                ? "Tell the model how to look at the photo. Every step sees the photo, your hint, and the step before it."
                : "Each new step builds on the previous one."}
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
                  <Icon name={IDEA_ICON[idea.stage]} className="h-3.5 w-3.5" />
                  {idea.title}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-xs tabular-nums text-muted">{newText.length}/1000</span>
              <button type="button" onClick={add} disabled={pending || !newText.trim() || items.length >= 50} className="btn-primary">
                {pending ? <><span className="spinner" /> Working…</> : <><Icon name="plus" strokeWidth={2.2} /> Add step</>}
              </button>
            </div>
          </div>
        </li>
      </ol>
    </div>
  );
}

function StepCard({
  chainId,
  step,
  draft: draftValue,
  onDraft,
  index,
  count,
  stage,
  dragging,
  busy,
  onMove,
  onDragStart,
  onDragEnd,
  onError,
}: {
  chainId: number;
  step: Step;
  draft: string | undefined;
  onDraft: (value: string) => void;
  index: number;
  count: number;
  stage: ReturnType<typeof stageFor>;
  dragging: boolean;
  busy: boolean;
  onMove: (index: number, delta: -1 | 1) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onError: (message: string | null) => void;
}) {
  const draft = draftValue ?? step.instruction;
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = draft.trim() !== step.instruction;

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
    <article className="step-card panel p-4 sm:p-5" data-dragging={dragging}>
      <header className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-tint text-accent-text">
          <Icon name={stage.icon} />
        </span>
        <div className="min-w-0 flex-1 basis-40">
          <h3 className="text-lg leading-tight">{stage.label}</h3>
          <p className="text-xs text-muted">{stage.tagline}</p>
        </div>
        <div className="-mr-1 ml-auto flex shrink-0 items-center max-sm:-mt-1 max-sm:w-full max-sm:justify-end">
          <button
            type="button"
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            aria-label={`Drag step ${index + 1} to reorder`}
            title="Drag to reorder"
            className="icon-btn cursor-grab active:cursor-grabbing"
          >
            <Icon name="grip" />
          </button>
          <button type="button" className="icon-btn" aria-disabled={busy || index === 0} onClick={() => onMove(index, -1)} aria-label={`Move step ${index + 1} up`} title="Move up">
            <Icon name="up" strokeWidth={2.2} />
          </button>
          <button type="button" className="icon-btn" aria-disabled={busy || index === count - 1} onClick={() => onMove(index, 1)} aria-label={`Move step ${index + 1} down`} title="Move down">
            <Icon name="down" strokeWidth={2.2} />
          </button>
          <button type="button" className="icon-btn hover:!text-coral-text" onClick={() => setConfirming(true)} aria-label={`Delete step ${index + 1}`} title="Delete step">
            <Icon name="trash" />
          </button>
        </div>
      </header>

      <label htmlFor={`step-${step.id}`} className="sr-only">Instruction for step {index + 1}</label>
      <textarea
        id={`step-${step.id}`}
        value={draft}
        onChange={(e) => onDraft(e.target.value)}
        rows={3}
        maxLength={1000}
        className="field mt-3 [field-sizing:content] min-h-[4.25rem]"
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
            {dirty && (
              <div className="ml-auto flex items-center gap-2">
                <button type="button" onClick={() => onDraft(step.instruction)} className="btn-ghost btn-sm">Discard</button>
                <button type="button" onClick={save} disabled={pending || !draft.trim()} className="btn-primary btn-sm">
                  {pending ? "Saving…" : "Save changes"}
                </button>
              </div>
            )}
          </>
        )}
      </footer>
    </article>
  );
}
