// Reading the availability response: journeys per day and the price of each fare for the searched passengers.

import { PRODUCTS } from "./network";
import type { AvailabilityResponse, AvailabilityTrip, AvailableJourney, PaxCounts, ServiceCharge } from "./types";

export interface FareOffer {
  fareAvailabilityKey: string;
  productClass: string;
  productName: string;
  cabin: string;
  classOfService: string;
  fareBasis: string;
  perAdult: number;
  total: number;
  fareOnly: number;
  taxesAndFees: number;
  seatsLeft: number | null;
}

/** Trips (one per day) for criterion `index` (0 outbound, 1 return). */
export function tripsFor(resp: AvailabilityResponse | null, index: number): AvailabilityTrip[] {
  return resp?.results?.[index]?.trips ?? [];
}

export function tripDay(trip: AvailabilityTrip): string {
  return trip.date.slice(0, 10);
}

export function journeysOf(trip: AvailabilityTrip | undefined): AvailableJourney[] {
  if (!trip) return [];
  return Object.values(trip.journeysAvailableByMarket ?? {})
    .flat()
    .sort((a, b) => a.designator.departure.localeCompare(b.designator.departure));
}

function sumCharges(charges: ServiceCharge[], pred: (c: ServiceCharge) => boolean = () => true): number {
  return charges.filter(pred).reduce((s, c) => s + c.amount, 0);
}

// same split as the engine's BookingCalculator: fare, discount and promotion discount are "fare"; the rest is tax/fee
const isFare = (c: ServiceCharge) => c.type === 0 || c.type === 1 || c.type === 7;

/**
 * Price of one fare for the passenger mix. Every passenger type's service charges are per person; connections
 * (isSumOfSector) carry one fare per segment, so all fares are added up.
 */
export function priceFare(resp: AvailabilityResponse, fareAvailabilityKey: string, pax: PaxCounts, seatsLeft: number | null = null): FareOffer | null {
  const fa = resp.faresAvailable?.[fareAvailabilityKey];
  if (!fa || !fa.fares?.length) return null;

  const perType: Record<string, { all: number; fare: number }> = {};
  for (const f of fa.fares) {
    for (const pf of f.passengerFares) {
      const t = (perType[pf.passengerType] ??= { all: 0, fare: 0 });
      t.all += sumCharges(pf.serviceCharges);
      t.fare += sumCharges(pf.serviceCharges, isFare);
    }
  }
  const counts: Record<string, number> = { ADT: pax.ADT, CHD: pax.CHD };
  let total = 0;
  let fareOnly = 0;
  for (const [type, n] of Object.entries(counts)) {
    if (!n) continue;
    const t = perType[type] ?? perType.ADT; // engine prices every searched type; ADT is a safe fallback
    if (!t) continue;
    total += t.all * n;
    fareOnly += t.fare * n;
  }

  const governing = fa.fares[0];
  const product = governing.productClass ?? "";
  const meta = PRODUCTS[product];
  return {
    fareAvailabilityKey,
    productClass: product,
    productName: meta?.name ?? product,
    cabin: meta?.cabin ?? (governing.travelClassCode === "C" ? "Business" : "Economy"),
    classOfService: fa.fares.map((f) => f.classOfService).join("/"),
    fareBasis: governing.fareBasisCode ?? "",
    perAdult: perType.ADT?.all ?? 0,
    total: round2(total),
    fareOnly: round2(fareOnly),
    taxesAndFees: round2(total - fareOnly),
    seatsLeft,
  };
}

/** One offer per product class for a journey, in product order (Saver → Business). */
export function offersFor(resp: AvailabilityResponse, journey: AvailableJourney, pax: PaxCounts): FareOffer[] {
  const byProduct = new Map<string, FareOffer>();
  for (const jf of journey.fares ?? []) {
    const seats = jf.details?.length ? Math.min(...jf.details.map((d) => d.availableCount)) : null;
    const offer = priceFare(resp, jf.fareAvailabilityKey, pax, seats);
    if (!offer) continue;
    const prev = byProduct.get(offer.productClass);
    if (!prev || offer.total < prev.total) byProduct.set(offer.productClass, offer);
  }
  return [...byProduct.values()].sort((a, b) => (PRODUCTS[a.productClass]?.order ?? 9) - (PRODUCTS[b.productClass]?.order ?? 9));
}

export function cheapest(offers: FareOffer[]): FareOffer | null {
  return offers.reduce<FareOffer | null>((min, o) => (!min || o.total < min.total ? o : min), null);
}

/** Lowest per-adult price on a day, for the date strip. */
export function lowestForDay(resp: AvailabilityResponse, trip: AvailabilityTrip, pax: PaxCounts): number | null {
  let min: number | null = null;
  for (const j of journeysOf(trip)) {
    const c = cheapest(offersFor(resp, j, pax));
    if (c && (min === null || c.perAdult < min)) min = c.perAdult;
  }
  return min;
}

export function findJourney(resp: AvailabilityResponse | null, index: number, journeyKey: string): AvailableJourney | null {
  for (const trip of tripsFor(resp, index)) {
    const j = journeysOf(trip).find((x) => x.journeyKey === journeyKey);
    if (j) return j;
  }
  return null;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
