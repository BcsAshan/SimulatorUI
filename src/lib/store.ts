"use client";

import { useSyncExternalStore } from "react";

/**
 * Tiny external store persisted in sessionStorage (per browser tab, cleared when the tab closes — the same lifetime
 * as the engine's server-side session). Readable from plain functions (lib/pss.ts) and from components (useStore).
 */
export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
  reset(): void;
}

export function createStore<T>(storageKey: string, initial: T): Store<T> {
  let value: T = initial;
  let hydrated = false;
  const listeners = new Set<() => void>();

  const hydrate = () => {
    if (hydrated || typeof window === "undefined") return;
    hydrated = true;
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw) value = { ...initial, ...JSON.parse(raw) } as T;
    } catch {
      /* corrupted or unavailable storage: start clean */
    }
  };

  const persist = () => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* quota or private mode: keep in memory only */
    }
  };

  return {
    get() {
      hydrate();
      return value;
    },
    set(next) {
      hydrate();
      value = typeof next === "function" ? (next as (prev: T) => T)(value) : next;
      persist();
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset() {
      value = initial;
      hydrated = true;
      if (typeof window !== "undefined") window.sessionStorage.removeItem(storageKey);
      listeners.forEach((l) => l());
    },
  };
}

/** Subscribe a component to a store. Renders `initial` on the server and during hydration. */
export function useStore<T>(store: Store<T>, serverValue: T): T {
  return useSyncExternalStore(store.subscribe, store.get, () => serverValue);
}

/** True after the first client render — use it to avoid flashing "empty" states before sessionStorage is read. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

const noopSubscribe = () => () => {};
