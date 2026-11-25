"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, ErrorAlert, Loading } from "@/components/Feedback";
import { FlowHeader } from "@/components/FlowHeader";
import { flightNumbers, journeyDuration, SelectionSummary } from "@/components/Summary";
import { ApiError } from "@/lib/api";
import { flowStore, OFFER_TTL_MS, patchFlow, useFlow } from "@/lib/flow";
import { dayDiff, dayMonth, localTime, longDate, money, weekday } from "@/lib/format";
import { cityName } from "@/lib/network";
import { cheapest, findJourney, journeysOf, lowestForDay, offersFor, tripDay, tripsFor, type FareOffer } from "@/lib/offers";
import { resetBooking, searchAvailability, sellTrip } from "@/lib/pss";
import { useHydrated } from "@/lib/store";
import type { AvailabilityResponse, AvailableJourney, FareSelection, SearchCriteria } from "@/lib/types";

const AIRCRAFT: Record<string, string> = { "320": "Airbus A320", "321": "Airbus A321", "333": "Airbus A330-300", AT7: "ATR 72" };

function parseCriteria(q: URLSearchParams): SearchCriteria | null {
  const origin = (q.get("from") ?? "").toUpperCase();
  const destination = (q.get("to") ?? "").toUpperCase();
  const departDate = q.get("depart") ?? "";
  const returnDate = q.get("return") || null;
  const ADT = Number(q.get("adt") ?? 1);
  const CHD = Number(q.get("chd") ?? 0);
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination) || !iso.test(departDate)) return null;
  if (returnDate && !iso.test(returnDate)) return null;
  if (!Number.isInteger(ADT) || !Number.isInteger(CHD) || ADT < 1 || CHD < 0 || ADT + CHD > 9) return null;
  return { origin, destination, departDate, returnDate, pax: { ADT, CHD } };
}

const sameCriteria = (a: SearchCriteria | null, b: SearchCriteria | null) => JSON.stringify(a) === JSON.stringify(b);

export function FlightsClient() {
  const params = useSearchParams();
  const router = useRouter();
  const hydrated = useHydrated();
  const flow = useFlow();
  const criteria = useMemo(() => parseCriteria(new URLSearchParams(params.toString())), [params]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [selling, setSelling] = useState(false);
  const [sellError, setSellError] = useState<unknown>(null);

  const runSearch = useCallback(async (c: SearchCriteria) => {
    setLoading(true);
    setError(null);
    setSellError(null);
    try {
      const availability = await searchAvailability(c);
      patchFlow({
        criteria: c,
        availability,
        searchedAt: Date.now(),
        day: { out: c.departDate, ret: c.returnDate },
        selection: { out: null, ret: null },
        booking: null,
        confirmed: null,
      });
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Search when the URL criteria differ from what's cached, or the cached offers are older than 30 minutes.
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (!criteria) return;
    const f = flowStore.get();
    const fresh = f.searchedAt && Date.now() - f.searchedAt < OFFER_TTL_MS - 60_000;
    const key = JSON.stringify(criteria);
    if ((!sameCriteria(f.criteria, criteria) || !f.availability || !fresh) && started.current !== key) {
      started.current = key; // React dev mode runs effects twice; search once per criteria
      void runSearch(criteria);
    }
  }, [criteria, runSearch]);

  if (!hydrated) return <Loading>Loading flights…</Loading>;

  if (!criteria) {
    return (
      <div className="wrap" style={{ padding: "40px 0" }}>
        <EmptyState title="Start with a search" body="Pick where you're flying from and to, and your dates." />
      </div>
    );
  }

  const resp = sameCriteria(flow.criteria, criteria) ? flow.availability : null;
  const legs = criteria.returnDate ? (["out", "ret"] as const) : (["out"] as const);

  const selected = (leg: "out" | "ret") => {
    const sel = flow.selection[leg];
    if (!resp || !sel) return { journey: null, offer: null };
    const journey = findJourney(resp, leg === "out" ? 0 : 1, sel.journeyKey);
    const offer = journey ? offersFor(resp, journey, criteria.pax).find((o) => o.fareAvailabilityKey === sel.fareAvailabilityKey) ?? null : null;
    return { journey, offer };
  };

  const out = selected("out");
  const back = criteria.returnDate ? selected("ret") : null;
  const ready = !!out.offer && (!criteria.returnDate || !!back?.offer);

  const choose = (leg: "out" | "ret", sel: FareSelection) => {
    const next = { ...flow.selection, [leg]: sel };
    // a new outbound can make the chosen return impossible (it must leave after the outbound lands)
    if (leg === "out" && resp && next.ret) {
      const o = findJourney(resp, 0, sel.journeyKey);
      const r = findJourney(resp, 1, next.ret.journeyKey);
      if (o && r && !returnFits(o, r)) next.ret = null;
    }
    patchFlow({ selection: next });
  };

  const continueToTravellers = async () => {
    if (!ready || !flow.selection.out) return;
    if (!flow.searchedAt || Date.now() - flow.searchedAt > OFFER_TTL_MS) {
      setSellError(new ApiError(400, "nsk:Exceptions:InvalidKey", "Offer expired"));
      return;
    }
    setSelling(true);
    setSellError(null);
    try {
      const keys = [flow.selection.out, ...(flow.selection.ret ? [flow.selection.ret] : [])];
      await resetBooking();
      const booking = await sellTrip(criteria, keys);
      patchFlow({ booking, details: null });
      router.push("/book/passengers");
    } catch (e) {
      setSellError(e);
      setSelling(false);
    }
  };

  const searchAgain = () => void runSearch(criteria);

  return (
    <>
      <FlowHeader criteria={criteria} step="Flights" />
      <div className="wrap">
        <div className="flow-body">
          <div>
            <p style={{ marginBottom: 16 }}>
              <Link href="/">Change search</Link>
            </p>
            {loading && <Loading>Searching live availability…</Loading>}
            {error != null && !loading && (
              <ErrorAlert
                error={error}
                action={
                  <button className="btn btn-ghost" type="button" onClick={searchAgain}>
                    Try again
                  </button>
                }
              />
            )}
            {resp && !loading && (
              <>
                {legs.map((leg) => (
                  <LegResults
                    key={leg}
                    leg={leg}
                    criteria={criteria}
                    resp={resp}
                    day={flow.day[leg] ?? (leg === "out" ? criteria.departDate : criteria.returnDate!)}
                    onDay={(d) => patchFlow({ day: { ...flow.day, [leg]: d } })}
                    selection={flow.selection[leg]}
                    onChoose={(sel) => choose(leg, sel)}
                    mustLeaveAfter={leg === "ret" ? out.journey : null}
                  />
                ))}
              </>
            )}
          </div>

          <SelectionSummary
            legs={[
              { title: "Outbound", journey: out.journey, offer: out.offer },
              ...(back ? [{ title: "Return", journey: back.journey, offer: back.offer }] : []),
            ]}
            currency={resp?.currencyCode ?? "USD"}
            pax={criteria.pax.ADT + criteria.pax.CHD}
          >
            {sellError != null && (
              <div style={{ marginTop: 14 }}>
                <ErrorAlert
                  error={sellError}
                  action={
                    <button className="btn btn-ghost" type="button" onClick={searchAgain}>
                      Search again
                    </button>
                  }
                />
              </div>
            )}
            <button type="button" className="btn btn-primary btn-lg" style={{ width: "100%", marginTop: 16 }} disabled={!ready || selling} onClick={continueToTravellers}>
              {selling ? "Holding your seats…" : "Continue to traveller details"}
            </button>
            {!ready && <p className="hint" style={{ marginTop: 8 }}>Choose a fare for each flight to continue.</p>}
          </SelectionSummary>
        </div>
      </div>
    </>
  );
}

function returnFits(outbound: AvailableJourney, ret: AvailableJourney): boolean {
  const lastOut = outbound.segments.at(-1)?.legs.at(-1)?.legInfo.arrivalTimeUtc;
  const firstRet = ret.segments[0]?.legs[0]?.legInfo.departureTimeUtc;
  if (!lastOut || !firstRet) return true;
  return Date.parse(firstRet) - Date.parse(lastOut) >= 60 * 60_000; // at least an hour on the ground
}

function LegResults({
  leg,
  criteria,
  resp,
  day,
  onDay,
  selection,
  onChoose,
  mustLeaveAfter,
}: {
  leg: "out" | "ret";
  criteria: SearchCriteria;
  resp: AvailabilityResponse;
  day: string;
  onDay: (d: string) => void;
  selection: FareSelection | null;
  onChoose: (s: FareSelection) => void;
  mustLeaveAfter: AvailableJourney | null;
}) {
  const index = leg === "out" ? 0 : 1;
  const trips = tripsFor(resp, index);
  const trip = trips.find((t) => tripDay(t) === day);
  const journeys = journeysOf(trip);
  const from = leg === "out" ? criteria.origin : criteria.destination;
  const to = leg === "out" ? criteria.destination : criteria.origin;

  return (
    <section className="panel" aria-labelledby={`leg-${leg}`} style={{ background: "transparent", padding: 0, marginBottom: 32 }}>
      <div className="leg-title">
        <h2 id={`leg-${leg}`}>
          {leg === "out" ? "Outbound" : "Return"}: {cityName(from)} to {cityName(to)}
        </h2>
        <span className="when">{longDate(day)}</span>
      </div>

      {trips.length > 1 && (
        <div className="date-strip" role="group" aria-label="Other dates">
          {trips.map((t) => {
            const d = tripDay(t);
            const low = lowestForDay(resp, t, criteria.pax);
            return (
              <button key={d} type="button" aria-pressed={d === day} onClick={() => onDay(d)}>
                {weekday(d)} {dayMonth(d)}
                <small className="num">{low != null ? `from ${money(low, resp.currencyCode)}` : "No seats"}</small>
              </button>
            );
          })}
        </div>
      )}

      {journeys.length === 0 ? (
        <div className="empty">
          <h3 style={{ marginBottom: 6 }}>No flights on this day</h3>
          <p>Try another date above. Demo Air flies each route once a day, and flights are scheduled about 30 days ahead.</p>
        </div>
      ) : (
        journeys.map((j) => {
          const blocked = mustLeaveAfter ? !returnFits(mustLeaveAfter, j) : false;
          return (
            <JourneyCard
              key={j.journeyKey}
              journey={j}
              offers={offersFor(resp, j, criteria.pax)}
              currency={resp.currencyCode}
              selection={selection?.journeyKey === j.journeyKey ? selection.fareAvailabilityKey : null}
              blockedReason={blocked ? "Leaves before your outbound flight lands." : null}
              onChoose={(fareAvailabilityKey) => onChoose({ journeyKey: j.journeyKey, fareAvailabilityKey })}
            />
          );
        })
      )}
    </section>
  );
}

function JourneyCard({
  journey,
  offers,
  currency,
  selection,
  blockedReason,
  onChoose,
}: {
  journey: AvailableJourney;
  offers: FareOffer[];
  currency: string;
  selection: string | null;
  blockedReason: string | null;
  onChoose: (fareAvailabilityKey: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const d = journey.designator;
  const plus = dayDiff(d.departure, d.arrival);
  const low = cheapest(offers);
  const connection = journey.segments.length > 1;
  const aircraft = [...new Set(journey.segments.flatMap((s) => s.legs.map((l) => AIRCRAFT[l.legInfo.equipmentType ?? ""] ?? l.legInfo.equipmentType)))]
    .filter(Boolean)
    .join(", ");
  const expanded = open || selection !== null;
  const soldOut = offers.length === 0;

  return (
    <article className="journey" data-selected={selection !== null}>
      <div className="journey-main">
        <div>
          <div className="timeline">
            <div>
              <div className="t num">{localTime(d.departure)}</div>
              <div className="s">{d.origin}</div>
            </div>
            <div className="track">
              {connection && <span className="stopdot" aria-hidden="true" />}
              {journeyDuration(journey)}
              <br />
              {connection ? `1 stop in ${cityName(journey.segments[0].designator.destination)}` : "Non-stop"}
            </div>
            <div>
              <div className="t num">
                {localTime(d.arrival)}
                {plus > 0 && <span className="plus" title={`Arrives ${plus} day${plus > 1 ? "s" : ""} later`}>+{plus}</span>}
              </div>
              <div className="s">{d.destination}</div>
            </div>
          </div>
          <p className="flight-meta">
            {flightNumbers(journey)}
            {aircraft ? `, ${aircraft}` : ""}
          </p>
        </div>
        <div className="from-price">
          {soldOut ? (
            <span className="sold-out">Sold out</span>
          ) : blockedReason ? (
            <span className="hint">{blockedReason}</span>
          ) : (
            <>
              <small>from</small>
              <span className="amt num">{money(low!.perAdult, currency)}</span>
              <small>per adult</small>
              {selection === null && (
                <button type="button" className="btn btn-ghost" aria-expanded={expanded} onClick={() => setOpen((o) => !o)}>
                  {open ? "Hide fares" : "See fares"}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {expanded && !soldOut && !blockedReason && (
        <div className="fare-grid" role="group" aria-label={`Fares for ${flightNumbers(journey)}`}>
          {offers.map((o) => (
            <button
              key={o.fareAvailabilityKey}
              type="button"
              className="fare-option"
              data-product={o.productClass}
              aria-pressed={selection === o.fareAvailabilityKey}
              onClick={() => onChoose(o.fareAvailabilityKey)}
            >
              <span className="fname">
                {o.cabin === "Business" ? "Business" : `Economy ${o.productName}`}
              </span>
              <span className="fprice num">{money(o.total, currency, true)}</span>
              <span className="hint">
                total, {money(o.perAdult, currency, true)} per adult
              </span>
              <ul>
                <li>Booking class {o.classOfService}, fare {o.fareBasis}</li>
                <li>Includes {money(o.taxesAndFees, currency, true)} taxes and fees</li>
              </ul>
              {o.seatsLeft != null && o.seatsLeft <= 5 && <span className="seats-left">{o.seatsLeft} left at this price</span>}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
