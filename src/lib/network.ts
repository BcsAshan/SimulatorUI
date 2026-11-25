// Static presentation data for the demo carrier XX (mirrors Airline-Simulator/tools/Pss.SeedData/DemoCarrier.cs).
// Prices and availability always come from the engine; this file only adds city names, map positions and
// the timetable shown on the home page. If the seed changes, update it here too.

import type { Market, Station } from "./types";

export const CARRIER = { code: "XX", name: "Demo Air", hub: "CMB" };

export interface CityInfo {
  code: string;
  city: string;
  country: string;
  /** schematic position on the 560×300 route map (geographic direction kept, distances compressed) */
  x: number;
  y: number;
  label: { dx: number; dy: number; anchor: "start" | "end" | "middle" };
}

export const CITIES: Record<string, CityInfo> = {
  CMB: { code: "CMB", city: "Colombo", country: "Sri Lanka", x: 330, y: 214, label: { dx: 0, dy: 26, anchor: "middle" } },
  JAF: { code: "JAF", city: "Jaffna", country: "Sri Lanka", x: 352, y: 168, label: { dx: 10, dy: 4, anchor: "start" } },
  DXB: { code: "DXB", city: "Dubai", country: "United Arab Emirates", x: 196, y: 118, label: { dx: -10, dy: -8, anchor: "end" } },
  SIN: { code: "SIN", city: "Singapore", country: "Singapore", x: 508, y: 262, label: { dx: 10, dy: 5, anchor: "start" } },
  BKK: { code: "BKK", city: "Bangkok", country: "Thailand", x: 476, y: 136, label: { dx: 10, dy: 4, anchor: "start" } },
  MLE: { code: "MLE", city: "Malé", country: "Maldives", x: 252, y: 266, label: { dx: -10, dy: 5, anchor: "end" } },
  DEL: { code: "DEL", city: "Delhi", country: "India", x: 318, y: 62, label: { dx: 0, dy: -12, anchor: "middle" } },
  KUL: { code: "KUL", city: "Kuala Lumpur", country: "Malaysia", x: 482, y: 220, label: { dx: 10, dy: 4, anchor: "start" } },
  LHR: { code: "LHR", city: "London", country: "United Kingdom", x: 40, y: 40, label: { dx: 0, dy: -12, anchor: "middle" } },
};

export function cityName(code: string, stations?: Station[]): string {
  return CITIES[code]?.city ?? stations?.find((s) => s.stationCode === code)?.name ?? code;
}

/** Timetable from the hub (seeded daily flights). LHR is sold as a connection via DXB. */
export const HUB_TIMETABLE: { to: string; flights: string; departs: string; flightTime: string }[] = [
  { to: "MLE", flights: "XX401", departs: "10:00", flightTime: "1h 20m" },
  { to: "JAF", flights: "XX801", departs: "07:00", flightTime: "1h 00m" },
  { to: "DEL", flights: "XX501", departs: "09:15", flightTime: "3h 45m" },
  { to: "BKK", flights: "XX301", departs: "01:10", flightTime: "3h 15m" },
  { to: "SIN", flights: "XX201", departs: "23:55", flightTime: "3h 45m" },
  { to: "KUL", flights: "XX601", departs: "13:00", flightTime: "3h 50m" },
  { to: "DXB", flights: "XX101", departs: "08:30", flightTime: "4h 30m" },
  { to: "LHR", flights: "XX101 and XX701 via Dubai", departs: "08:30", flightTime: "about 17h with the connection" },
];

/** Fallback when reference data can't be loaded yet: direct markets of the seed, both directions. */
const SEED_MARKETS: [string, string][] = [
  ["CMB", "DXB"], ["CMB", "SIN"], ["CMB", "BKK"], ["CMB", "MLE"],
  ["CMB", "DEL"], ["CMB", "KUL"], ["DXB", "LHR"], ["CMB", "JAF"],
];

export function fallbackMarkets(): Market[] {
  return SEED_MARKETS.flatMap(([a, b]) => [
    { locationCode: a, travelLocationCode: b, inActive: false },
    { locationCode: b, travelLocationCode: a, inActive: false },
  ]);
}

/** Destinations reachable from `origin` non-stop or with one connection (the engine searches maxConnections 1). */
export function reachableFrom(origin: string, markets: Market[]): string[] {
  const direct = new Map<string, Set<string>>();
  for (const m of markets) {
    if (m.inActive) continue;
    if (!direct.has(m.locationCode)) direct.set(m.locationCode, new Set());
    direct.get(m.locationCode)!.add(m.travelLocationCode);
  }
  const out = new Set<string>();
  for (const a of direct.get(origin) ?? []) {
    out.add(a);
    for (const b of direct.get(a) ?? []) if (b !== origin) out.add(b);
  }
  return [...out].sort((x, y) => cityName(x).localeCompare(cityName(y)));
}

export function allOrigins(markets: Market[]): string[] {
  return [...new Set(markets.filter((m) => !m.inActive).map((m) => m.locationCode))].sort((x, y) =>
    cityName(x).localeCompare(cityName(y)),
  );
}

/** Product classes the engine prices (DemoCarrier fare classes), with customer-facing names. */
export const PRODUCTS: Record<string, { name: string; cabin: string; order: number; note: string }> = {
  EC: { name: "Saver", cabin: "Economy", order: 1, note: "Lowest economy price" },
  ES: { name: "Standard", cabin: "Economy", order: 2, note: "Economy, mid-range fare class" },
  EF: { name: "Flex", cabin: "Economy", order: 3, note: "Full-fare economy class" },
  BZ: { name: "Business", cabin: "Business", order: 4, note: "Business cabin" },
};

export const TEST_CARDS = [
  { number: "4111 1111 1111 1111", method: "VI", result: "Approved" },
  { number: "5555 5555 5555 4444", method: "MC", result: "Approved" },
  { number: "4000 0000 0000 0002", method: "VI", result: "Declined: do not honour" },
  { number: "4000 0000 0000 9995", method: "VI", result: "Declined: insufficient funds" },
];
