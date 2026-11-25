"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { allOrigins, CARRIER, cityName, reachableFrom } from "@/lib/network";
import { addDays, todayIso } from "@/lib/pss";
import { useRefData } from "@/lib/refdata";
import type { SearchCriteria } from "@/lib/types";

export function criteriaToQuery(c: SearchCriteria): string {
  const q = new URLSearchParams({ from: c.origin, to: c.destination, depart: c.departDate, adt: String(c.pax.ADT), chd: String(c.pax.CHD) });
  if (c.returnDate) q.set("return", c.returnDate);
  return q.toString();
}

const MAX_PAX = 9;

export function SearchForm({
  initial,
  onRouteChange,
}: {
  initial?: Partial<SearchCriteria>;
  onRouteChange?: (origin: string, destination: string) => void;
}) {
  const router = useRouter();
  const ref = useRefData();
  // Dates are filled in after mount: the page may be prerendered at build time, when "today" was a different day.
  const [today, setToday] = useState("");
  const [roundTrip, setRoundTrip] = useState(initial?.returnDate !== null);
  const [origin, setOrigin] = useState(initial?.origin ?? CARRIER.hub);
  const [destination, setDestination] = useState(initial?.destination ?? "DXB");
  const [depart, setDepart] = useState(initial?.departDate ?? "");
  const [ret, setRet] = useState(initial?.returnDate ?? "");

  useEffect(() => {
    const t = todayIso();
    setToday(t);
    setDepart((d) => d || addDays(t, 7));
    setRet((r) => r || addDays(t, 14));
  }, []);
  const [adt, setAdt] = useState(initial?.pax?.ADT ?? 1);
  const [chd, setChd] = useState(initial?.pax?.CHD ?? 0);
  const [error, setError] = useState<string | null>(null);

  const origins = useMemo(() => allOrigins(ref.markets), [ref.markets]);
  const destinations = useMemo(() => reachableFrom(origin, ref.markets), [origin, ref.markets]);

  useEffect(() => {
    if (destinations.length && !destinations.includes(destination)) setDestination(destinations[0]);
  }, [destinations, destination]);

  useEffect(() => {
    onRouteChange?.(origin, destination);
  }, [origin, destination, onRouteChange]);

  const swap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (origin === destination) return setError("Pick two different airports.");
    if (!depart) return setError("Pick a departure date.");
    if (depart < todayIso()) return setError("The departure date is in the past.");
    if (roundTrip && ret < depart) return setError("The return date must be on or after the departure date.");
    setError(null);
    const c: SearchCriteria = {
      origin,
      destination,
      departDate: depart,
      returnDate: roundTrip ? ret : null,
      pax: { ADT: adt, CHD: chd },
    };
    router.push(`/flights?${criteriaToQuery(c)}`);
  };

  const total = adt + chd;

  return (
    <form className="ticket" onSubmit={submit} aria-label="Search flights">
      <div className="ticket-main">
        <div className="trip-toggle" role="group" aria-label="Trip type">
          <button type="button" aria-pressed={roundTrip} onClick={() => setRoundTrip(true)}>
            Return
          </button>
          <button type="button" aria-pressed={!roundTrip} onClick={() => setRoundTrip(false)}>
            One way
          </button>
        </div>

        <div className="od-row">
          <div className="od-pick">
            <span className="od-label" id="from-label">From</span>
            <span className="code" aria-hidden="true">{origin}</span>
            <span className="city" aria-hidden="true">{cityName(origin, ref.stations)}</span>
            <select aria-labelledby="from-label" value={origin} onChange={(e) => setOrigin(e.target.value)}>
              {(origins.length ? origins : [origin]).map((code) => (
                <option key={code} value={code}>
                  {cityName(code, ref.stations)} ({code})
                </option>
              ))}
            </select>
          </div>

          <button type="button" className="swap" onClick={swap} aria-label="Swap origin and destination">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M7 7h13l-4-4M17 17H4l4 4" />
            </svg>
          </button>

          <div className="od-pick">
            <span className="od-label" id="to-label">To</span>
            <span className={destination ? "code" : "code code-empty"} aria-hidden="true">{destination || "———"}</span>
            <span className="city" aria-hidden="true">{destination ? cityName(destination, ref.stations) : "Choose a destination"}</span>
            <select aria-labelledby="to-label" value={destination} onChange={(e) => setDestination(e.target.value)}>
              {destinations.map((code) => (
                <option key={code} value={code}>
                  {cityName(code, ref.stations)} ({code})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="ticket-fields">
          <label className="field">
            <span>Departing</span>
            <input className="input" type="date" required min={today || undefined} value={depart} onChange={(e) => setDepart(e.target.value)} />
          </label>
          {roundTrip ? (
            <label className="field">
              <span>Returning</span>
              <input className="input" type="date" required min={depart || undefined} value={ret} onChange={(e) => setRet(e.target.value)} />
            </label>
          ) : (
            <div className="field">
              <span>Returning</span>
              <button type="button" className="input" style={{ textAlign: "left", color: "var(--ink-mute)", cursor: "pointer" }} onClick={() => setRoundTrip(true)}>
                Add a return flight
              </button>
            </div>
          )}
        </div>

        {error && (
          <p className="field-error" role="alert" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}
      </div>

      <div className="ticket-stub">
        <div className="stack">
          <div className="pax-counter">
            <span className="who">
              Adults<small>12 years and over</small>
            </span>
            <Counter label="adults" value={adt} min={1} max={MAX_PAX - chd} onChange={setAdt} />
          </div>
          <div className="pax-counter">
            <span className="who">
              Children<small>2 to 11 years</small>
            </span>
            <Counter label="children" value={chd} min={0} max={Math.min(adt * 4, MAX_PAX - adt)} onChange={setChd} />
          </div>
          <p className="hint">
            {total} {total === 1 ? "traveller" : "travellers"}, up to {MAX_PAX} per booking.
          </p>
        </div>
        <button type="submit" className="btn btn-accent btn-lg">
          Find flights
        </button>
      </div>
    </form>
  );
}

function Counter({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <span className="stepper">
      <button type="button" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <output aria-live="polite" aria-label={`${value} ${label}`}>
        {value}
      </output>
      <button type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </span>
  );
}
