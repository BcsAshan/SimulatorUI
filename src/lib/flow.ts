"use client";

import { createStore, useStore } from "./store";
import type { AvailabilityResponse, Booking, FareSelection, SearchCriteria } from "./types";

/** Everything the customer booking flow carries between pages (persisted per tab in sessionStorage). */
export interface FlowState {
  criteria: SearchCriteria | null;
  availability: AvailabilityResponse | null;
  searchedAt: number | null;
  day: { out: string | null; ret: string | null };
  selection: { out: FareSelection | null; ret: FareSelection | null };
  /** booking in state after trip/sell */
  booking: Booking | null;
  /** passenger + contact form values, so going back keeps them */
  details: Record<string, unknown> | null;
  /** last committed booking, for the confirmation page */
  confirmed: Booking | null;
}

export const EMPTY_FLOW: FlowState = {
  criteria: null,
  availability: null,
  searchedAt: null,
  day: { out: null, ret: null },
  selection: { out: null, ret: null },
  booking: null,
  details: null,
  confirmed: null,
};

export const flowStore = createStore<FlowState>("pss.flow", EMPTY_FLOW);

export function useFlow(): FlowState {
  return useStore(flowStore, EMPTY_FLOW);
}

export function patchFlow(patch: Partial<FlowState>) {
  flowStore.set((prev) => ({ ...prev, ...patch }));
}

/** Offers in the engine expire after 30 minutes. */
export const OFFER_TTL_MS = 30 * 60_000;
