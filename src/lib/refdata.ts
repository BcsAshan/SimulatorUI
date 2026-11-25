"use client";

import { useEffect, useState } from "react";
import { fallbackMarkets } from "./network";
import { getCountries, getMarkets, getStations, getTitles } from "./pss";
import type { CodeItem, Country, Market, Station } from "./types";

export interface RefData {
  stations: Station[];
  markets: Market[];
  countries: Country[];
  titles: CodeItem[];
  /** true when the engine answered; false while loading or when using the built-in fallback */
  live: boolean;
  error: unknown;
}

const FALLBACK: RefData = {
  stations: [],
  markets: fallbackMarkets(),
  countries: [],
  titles: [
    { code: "MR", name: "Mr", inActive: false },
    { code: "MRS", name: "Mrs", inActive: false },
    { code: "MS", name: "Ms", inActive: false },
    { code: "MSTR", name: "Master", inActive: false },
    { code: "MISS", name: "Miss", inActive: false },
  ],
  live: false,
  error: null,
};

let cache: RefData | null = null;
let inflight: Promise<RefData> | null = null;

function load(): Promise<RefData> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = (async () => {
      try {
        // sequential first call creates the session once; the rest run in parallel on it
        const stations = await getStations();
        const [markets, countries, titles] = await Promise.all([getMarkets(), getCountries(), getTitles()]);
        cache = {
          stations: stations.filter((s) => !s.inActive),
          markets: markets.filter((m) => !m.inActive),
          countries: countries.filter((c) => !c.inActive).sort((a, b) => a.name.localeCompare(b.name)),
          titles: titles.filter((t) => !t.inActive),
          live: true,
          error: null,
        };
        return cache;
      } catch (e) {
        return { ...FALLBACK, error: e };
      } finally {
        inflight = null;
      }
    })();
  }
  return inflight;
}

export function useRefData(): RefData {
  const [data, setData] = useState<RefData>(cache ?? FALLBACK);
  useEffect(() => {
    let alive = true;
    load().then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
  }, []);
  return data;
}
