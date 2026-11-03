"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// The server renders in UTC; after hydration the browser's own zone takes over
// without a hydration mismatch (the server snapshot is used for hydration).
export function useTimeZone() {
  return useSyncExternalStore(
    subscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    () => "UTC",
  );
}
