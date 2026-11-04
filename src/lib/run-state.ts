// Compares the steps a run was started with against the chain as it is NOW, so
// the workspace can say, truthfully, "this result is from a previous version".

export type SnapStep = { id: number; instruction: string };
export type StepDiff = "same" | "edited" | "new" | "moved";

export type SnapshotDiff = {
  /** True when the current chain differs from what the result was made with. */
  stale: boolean;
  steps: Map<number, StepDiff>;
  /** Steps that existed in the run but have since been deleted. */
  removed: number;
};

const norm = (s: string) => s.trim();

export function diffAgainstSnapshot(snapshot: SnapStep[] | null, current: SnapStep[]): SnapshotDiff {
  const steps = new Map<number, StepDiff>();
  if (!snapshot) return { stale: false, steps, removed: 0 };

  const currentIds = new Set(current.map((s) => s.id));
  const snapIds = new Set(snapshot.map((s) => s.id));
  // "Moved" is about RELATIVE order among the steps that exist in both: adding
  // or deleting a step must not flag everything after it.
  const orderBefore = snapshot.filter((s) => currentIds.has(s.id)).map((s) => s.id);
  const orderNow = current.filter((s) => snapIds.has(s.id)).map((s) => s.id);
  const before = new Map(snapshot.map((s) => [s.id, norm(s.instruction)]));
  current.forEach((step) => {
    const old = before.get(step.id);
    if (old === undefined) steps.set(step.id, "new");
    else if (old !== norm(step.instruction)) steps.set(step.id, "edited");
    else if (orderBefore.indexOf(step.id) !== orderNow.indexOf(step.id)) steps.set(step.id, "moved");
    else steps.set(step.id, "same");
  });

  const removed = snapshot.filter((s) => !currentIds.has(s.id)).length;
  const stale = removed > 0 || [...steps.values()].some((d) => d !== "same");
  return { stale, steps, removed };
}
