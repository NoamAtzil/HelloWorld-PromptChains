// Pure helpers for reordering a list of step ids (unit-tested).

/** Moves the item at `from` so it ends up at index `to`. Out-of-range = no-op. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const copy = items.slice();
  if (from === to || from < 0 || to < 0 || from >= copy.length || to >= copy.length) return copy;
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/**
 * Where a dragged item lands when dropped on the `over` card: above it when
 * the pointer is in its upper half, below otherwise. `from` is the dragged
 * index. Returns the final index of the dragged item.
 */
export function dropIndex(from: number, over: number, after: boolean) {
  let target = after ? over + 1 : over;
  if (from < target) target -= 1;
  return target;
}

export function sameOrder(a: readonly number[], b: readonly number[]) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Returns a copy of `items` with `item` inserted at `index` (clamped). */
export function insertAt<T>(items: readonly T[], item: T, index: number): T[] {
  const copy = items.slice();
  copy.splice(Math.max(0, Math.min(index, copy.length)), 0, item);
  return copy;
}
