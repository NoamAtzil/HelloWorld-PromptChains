"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { addStep, deleteStep, reorderSteps, updateStep } from "../actions";
import { dropIndex, moveItem, sameOrder } from "@/lib/order";
import type { Step } from "@/lib/types";

const STARTERS = [
  "Describe what is happening in the photo in two plain sentences.",
  "List the three funniest details visible in the photo.",
  "Pick the funniest angle from the previous step and explain the joke in one line.",
  "Write the final caption using the best angle.",
];

type Props = { chainId: number; steps: Step[] };

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

  function commitOrder(next: Step[]) {
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
    if (to < 0 || to >= items.length) return;
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

  return (
    <div className="flex flex-col">
      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-coral-tint px-3 py-2 text-sm text-coral-text">{error}</p>
      )}

      <p role="status" aria-live="polite" className="sr-only">{announce}</p>

      {items.length === 0 && (
        <p className="panel mb-3 rounded-2xl p-5 text-sm text-muted">
          No steps yet. Add the first instruction below. Each step sees the photo, your optional context, and the previous step&apos;s output.
        </p>
      )}

      <ol className="flex flex-col" aria-label="Steps in order">
        {items.map((step, index) => (
          <li
            key={step.id}
            ref={(el) => {
              if (el) cards.current.set(step.id, el);
              else cards.current.delete(step.id);
            }}
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
            {over?.id === step.id && !over.after && <div className="drop-line mb-1" aria-hidden="true" />}
            <StepCard
              chainId={chainId}
              step={step}
              draft={drafts[step.id]}
              onDraft={(value) => setDrafts((cur) => ({ ...cur, [step.id]: value }))}
              index={index}
              count={items.length}
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
            {over?.id === step.id && over.after && <div className="drop-line mt-1" aria-hidden="true" />}
            {index < items.length - 1 && <div className="link-line" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      <div className="panel mt-4 flex flex-col gap-3 rounded-2xl border-dashed p-4">
        <label htmlFor="new-step" className="label !mb-0">Add a step</label>
        <textarea
          id="new-step"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Tell the model what to do at this step…"
          className="field"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Ideas:</span>
          {STARTERS.map((text) => (
            <button key={text} type="button" onClick={() => setNewText(text)} className="chip hover:brightness-95">
              {text.length > 36 ? `${text.slice(0, 34)}…` : text}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs tabular-nums text-muted">{newText.length}/1000</span>
          <button type="button" onClick={add} disabled={pending || !newText.trim() || items.length >= 50} className="btn-primary">
            {pending ? "Working…" : "+ Add step"}
          </button>
        </div>
      </div>
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
    <article className="step-card panel flex gap-3 rounded-2xl p-4" data-dragging={dragging}>
      <div className="flex flex-col items-center gap-2">
        <span className="step-badge" aria-hidden="true">{index + 1}</span>
        <button
          type="button"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          aria-label={`Drag step ${index + 1} to reorder`}
          title="Drag to reorder"
          className="icon-btn cursor-grab active:cursor-grabbing"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
            <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
          </svg>
        </button>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <label htmlFor={`step-${step.id}`} className="label !mb-0">Step {index + 1}</label>
        <textarea
          id={`step-${step.id}`}
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          rows={3}
          maxLength={1000}
          className="field"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs tabular-nums text-muted">{draft.length}/1000</span>
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {dirty && (
              <>
                <button type="button" onClick={() => onDraft(step.instruction)} className="btn-quiet btn-sm">Discard</button>
                <button type="button" onClick={save} disabled={pending || !draft.trim()} className="btn-primary btn-sm">
                  {pending ? "Saving…" : "Save"}
                </button>
              </>
            )}
            <button type="button" className="icon-btn" aria-disabled={busy || index === 0} onClick={() => onMove(index, -1)} aria-label={`Move step ${index + 1} up`} title="Move up">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
            </button>
            <button type="button" className="icon-btn" aria-disabled={busy || index === count - 1} onClick={() => onMove(index, 1)} aria-label={`Move step ${index + 1} down`} title="Move down">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {confirming ? (
              <>
                <button type="button" onClick={remove} disabled={pending} className="btn-danger btn-sm">{pending ? "Deleting…" : "Delete step"}</button>
                <button type="button" onClick={() => setConfirming(false)} className="btn-quiet btn-sm">Keep</button>
              </>
            ) : (
              <button type="button" className="icon-btn hover:!text-coral-text" onClick={() => setConfirming(true)} aria-label={`Delete step ${index + 1}`} title="Delete step">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
