"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import { money, paxTypeLabel } from "@/lib/format";
import { cityName } from "@/lib/network";
import { assignSeat, getBooking, getSeatMaps, removeSeat, seatsByLeg } from "@/lib/pss";
import type { Booking, SeatMapAvailability, SeatMapCompartment, SeatMapUnit } from "@/lib/types";
import { ErrorAlert, Loading } from "./Feedback";

const PROPERTY_WORDS: Record<string, string> = {
  WINDOW: "window",
  AISLE: "aisle",
  EXITROW: "exit row",
  LEGROOM: "extra legroom",
  PREFERRED: "front of cabin",
};

/**
 * Seat selection for every leg of the booking in state. One passenger is "active"; clicking an open seat gives it to
 * that passenger (replacing their seat on that flight), clicking their own seat removes it. The engine holds the seat
 * for this session, so another customer sees it as taken right away.
 */
export function SeatPicker({ booking, onBookingChange }: { booking: Booking; onBookingChange: (b: Booking) => void }) {
  const [maps, setMaps] = useState<SeatMapAvailability[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [legIndex, setLegIndex] = useState(0);
  const paxKeys = Object.keys(booking.passengers);
  const [activePax, setActivePax] = useState(paxKeys[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // A string, so a refreshed booking object with the same journeys doesn't trigger a full reload.
  const journeyList = booking.journeys.map((j) => j.journeyKey).join("|");
  const journeyKeys = useMemo(() => (journeyList ? journeyList.split("|") : []), [journeyList]);

  const loadAll = useCallback(async () => {
    const all: SeatMapAvailability[] = [];
    // one call at a time: the engine serialises calls per session
    for (const jk of journeyKeys) all.push(...(await getSeatMaps(jk)));
    return all;
  }, [journeyKeys]);

  useEffect(() => {
    let alive = true;
    loadAll()
      .then((m) => {
        if (!alive) return;
        setMaps(m);
        setLoadError(null);
      })
      .catch((e) => alive && setLoadError(e));
    return () => {
      alive = false;
    };
  }, [loadAll]);

  const owners = useMemo(() => seatsByLeg(booking), [booking]);

  if (loadError) return <ErrorAlert error={loadError} />;
  if (!maps) return <Loading>Loading seat maps…</Loading>;
  if (maps.length === 0) return <p className="hint">No seat maps for these flights.</p>;

  const map = maps[Math.min(legIndex, maps.length - 1)];
  const legSeats = owners[map.legKey] ?? {};
  const ownerOf: Record<string, string> = {};
  for (const [pk, seat] of Object.entries(legSeats)) ownerOf[seat.unitDesignator] = pk;

  const priceOf = (pk: string, group: number) =>
    (map.fees[pk]?.groups[String(group)]?.fees ?? []).flatMap((f) => f.serviceCharges).reduce((s, c) => s + c.amount, 0);

  const paxLabel = (pk: string) => {
    const p = booking.passengers[pk];
    const name = [p?.name?.first, p?.name?.last].filter(Boolean).join(" ");
    return name || `${paxTypeLabel(p?.passengerTypeCode ?? "ADT")} ${paxKeys.indexOf(pk) + 1}`;
  };
  const initials = (pk: string) => {
    const p = booking.passengers[pk];
    const i = `${p?.name?.first?.[0] ?? ""}${p?.name?.last?.[0] ?? ""}`.toUpperCase();
    return i || String(paxKeys.indexOf(pk) + 1);
  };
  const activeType = booking.passengers[activePax]?.passengerTypeCode ?? "ADT";

  const refresh = async (journeyKey: string) => {
    const [b, fresh] = [await getBooking(), await getSeatMaps(journeyKey)];
    onBookingChange(b);
    setMaps((prev) => {
      if (!prev) return fresh;
      const others = prev.filter((m) => m.journeyKey !== journeyKey);
      const merged = [...others, ...fresh];
      // keep the original leg order (journey order, then leg order within the journey)
      return journeyKeys.flatMap((jk) => merged.filter((m) => m.journeyKey === jk));
    });
    return b;
  };

  const choose = async (unit: SeatMapUnit) => {
    if (busy) return;
    const owner = ownerOf[unit.designator];
    if (owner && owner !== activePax) {
      setActivePax(owner);
      return;
    }
    // On the booking but no longer held for us (hold ended): clicking it again re-holds it if it is still free.
    const lostButFree = owner === activePax && unit.availability === 5;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (owner === activePax && !lostButFree) {
        await removeSeat(activePax, legSeats[activePax].unitKey);
        await refresh(map.journeyKey);
        setNotice(`Seat ${unit.designator} removed for ${paxLabel(activePax)}.`);
      } else {
        await assignSeat(activePax, unit.unitKey);
        const b = await refresh(map.journeyKey);
        setNotice(`Seat ${unit.designator} is held for ${paxLabel(activePax)}.`);
        // move on to the next traveller without a seat on this flight
        const nowSeated = seatsByLeg(b)[map.legKey] ?? {};
        const next = paxKeys.find((k) => !nowSeated[k]);
        if (next) setActivePax(next);
      }
    } catch (e) {
      setError(e);
      if (e instanceof ApiError && e.code === "nsk:Seat:UnitNotAvailable") {
        try {
          await refresh(map.journeyKey);
        } catch {
          /* keep the old map */
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const groups = Object.keys(map.groupLookup)
    .map(Number)
    .filter((g) => map.seatMap.decks["1"] && Object.values(map.seatMap.decks["1"].compartments).some((c) => c.units.some((u) => u.group === g && u.availability !== 9)));

  return (
    <div className="seat-picker">
      {maps.length > 1 && (
        <div className="leg-tabs" role="tablist" aria-label="Flights">
          {maps.map((m, i) => (
            <button
              key={m.legKey}
              type="button"
              role="tab"
              aria-selected={i === legIndex}
              onClick={() => {
                setLegIndex(i);
                setError(null);
                setNotice(null);
              }}
            >
              <strong>
                {m.seatMap.departureStation} to {m.seatMap.arrivalStation}
              </strong>
              <small>
                {m.seatMap.marketingCode}, {Object.keys(owners[m.legKey] ?? {}).length} of {paxKeys.length} seated
              </small>
            </button>
          ))}
        </div>
      )}

      <div className="seat-layout">
        <div className="seat-side">
          <h3>
            {cityName(map.seatMap.departureStation)} to {cityName(map.seatMap.arrivalStation)}
          </h3>
          <p className="hint" style={{ marginBottom: 14 }}>
            {map.seatMap.marketingCode}, {map.seatMap.name}. {map.seatMap.availableUnits} seats free.
          </p>

          <div className="pax-list" role="radiogroup" aria-label="Choose a seat for">
            {paxKeys.map((pk) => {
              const seat = legSeats[pk];
              return (
                <button key={pk} type="button" role="radio" aria-checked={pk === activePax} className="pax-chip" onClick={() => setActivePax(pk)}>
                  <span className="pax-initials" aria-hidden="true">
                    {initials(pk)}
                  </span>
                  <span>
                    {paxLabel(pk)}
                    <small>{seat ? `Seat ${seat.unitDesignator}` : "No seat yet"}</small>
                  </span>
                </button>
              );
            })}
          </div>

          <dl className="seat-legend">
            {groups.map((g) => (
              <div key={g}>
                <dt>
                  <span className={`seat-swatch g${g}`} aria-hidden="true" />
                  {map.groupLookup[String(g)]}
                </dt>
                <dd className="num">{priceOf(activePax, g) > 0 ? money(priceOf(activePax, g), booking.currencyCode) : "Included"}</dd>
              </div>
            ))}
            <div>
              <dt>
                <span className="seat-swatch taken" aria-hidden="true" />
                Taken
              </dt>
              <dd />
            </div>
          </dl>
          <p className="hint">Prices are per traveller, per flight, for {paxLabel(activePax)}.</p>

          {notice && !error && (
            <p className="alert alert-info" role="status" style={{ marginTop: 14 }}>
              {notice}
            </p>
          )}
          {error != null && (
            <div style={{ marginTop: 14 }}>
              <ErrorAlert error={error} />
            </div>
          )}
        </div>

        <div className="cabin" aria-busy={busy}>
          <div className="cabin-nose" aria-hidden="true" />
          {Object.values(map.seatMap.decks["1"]?.compartments ?? {})
            .sort((a, b) => a.sequence - b.sequence)
            .map((c) => (
              <Compartment
                key={c.compartmentDesignator}
                compartment={c}
                ownerOf={ownerOf}
                activePax={activePax}
                activeType={activeType}
                initials={initials}
                paxLabel={paxLabel}
                priceFor={(g) => priceOf(activePax, g)}
                currency={booking.currencyCode}
                busy={busy}
                onChoose={choose}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

function Compartment({
  compartment,
  ownerOf,
  activePax,
  activeType,
  initials,
  paxLabel,
  priceFor,
  currency,
  busy,
  onChoose,
}: {
  compartment: SeatMapCompartment;
  ownerOf: Record<string, string>;
  activePax: string;
  activeType: string;
  initials: (pk: string) => string;
  paxLabel: (pk: string) => string;
  priceFor: (group: number) => number;
  currency: string;
  busy: boolean;
  onChoose: (u: SeatMapUnit) => void;
}) {
  const width = compartment.width;
  const seatColumns = new Set(compartment.units.map((u) => u.x));
  const rows = new Map<number, SeatMapUnit[]>();
  for (const u of compartment.units) rows.set(u.y, [...(rows.get(u.y) ?? []), u]);
  const ys = [...rows.keys()].sort((a, b) => a - b);
  const letters: Record<number, string> = {};
  for (const u of rows.get(ys[0]) ?? []) letters[u.x] = u.designator.replace(/^\d+/, "");
  const firstAisle = [...Array(width).keys()].find((x) => !seatColumns.has(x));
  const template = [...Array(width).keys()].map((x) => (seatColumns.has(x) ? "var(--seat)" : "var(--aisle)")).join(" ");

  return (
    <div className="compartment">
      <p className="compartment-name">{compartment.compartmentDesignator === "C" ? "Business" : "Economy"}</p>
      <div className="seat-grid" style={{ gridTemplateColumns: template }} role="group" aria-label={`${compartment.compartmentDesignator === "C" ? "Business" : "Economy"} cabin seats`}>
        {[...Array(width).keys()].map((x) => (
          <span key={`h${x}`} className="seat-col" aria-hidden="true">
            {letters[x] ?? ""}
          </span>
        ))}
        {ys.map((y) => {
          const byX = new Map((rows.get(y) ?? []).map((u) => [u.x, u]));
          const rowNumber = (rows.get(y) ?? [])[0]?.designator.match(/^\d+/)?.[0] ?? "";
          const exit = (rows.get(y) ?? []).some((u) => u.properties.some((p) => p.code === "EXITROW"));
          return [...Array(width).keys()].map((x) => {
            const u = byX.get(x);
            if (!u) {
              return (
                <span key={`${y}-${x}`} className={exit && x === firstAisle ? "seat-row exit" : "seat-row"} aria-hidden="true">
                  {x === firstAisle ? rowNumber : ""}
                </span>
              );
            }
            return (
              <SeatButton
                key={u.unitKey}
                unit={u}
                owner={ownerOf[u.designator]}
                activePax={activePax}
                activeType={activeType}
                initials={initials}
                paxLabel={paxLabel}
                price={priceFor(u.group)}
                currency={currency}
                busy={busy}
                onChoose={onChoose}
              />
            );
          });
        })}
      </div>
    </div>
  );
}

function SeatButton({
  unit,
  owner,
  activePax,
  activeType,
  initials,
  paxLabel,
  price,
  currency,
  busy,
  onChoose,
}: {
  unit: SeatMapUnit;
  owner: string | undefined;
  activePax: string;
  activeType: string;
  initials: (pk: string) => string;
  paxLabel: (pk: string) => string;
  price: number;
  currency: string;
  busy: boolean;
  onChoose: (u: SeatMapUnit) => void;
}) {
  const features = unit.properties.map((p) => PROPERTY_WORDS[p.code]).filter(Boolean).join(", ");
  const restricted = unit.restrictedPassengerTypes.includes(activeType);
  const priceText = price > 0 ? money(price, currency) : "included";

  let state: string;
  let label: string;
  let disabled = busy;
  if (owner && unit.availability !== 4) {
    // on the booking, but the engine no longer holds it for us (the hold ended)
    state = owner === activePax ? "lost active" : "lost";
    label =
      unit.availability === 5
        ? `Seat ${unit.designator}, ${paxLabel(owner)}'s seat, no longer held. Select to hold it again.`
        : `Seat ${unit.designator}, ${paxLabel(owner)}'s seat, now taken by someone else. Select to remove it, then pick another seat.`;
  } else if (owner) {
    state = owner === activePax ? "mine active" : "mine";
    label = owner === activePax ? `Seat ${unit.designator}, ${paxLabel(owner)}'s seat. Select to remove it.` : `Seat ${unit.designator}, ${paxLabel(owner)}'s seat.`;
  } else if (unit.availability === 4) {
    // still yours from the saved booking (you picked a different seat but haven't saved yet)
    state = "previous";
    label = `Seat ${unit.designator}, your current saved seat. Select to keep it.`;
  } else if (unit.availability === 5) {
    state = restricted ? "restricted" : `open g${unit.group}`;
    label = restricted ? `Seat ${unit.designator}, not for children (exit row).` : `Seat ${unit.designator}${features ? `, ${features}` : ""}, ${priceText}.`;
    disabled = disabled || restricted;
  } else if (unit.availability === 2) {
    state = "blocked";
    label = `Seat ${unit.designator}, not available.`;
    disabled = true;
  } else if (unit.availability === 9) {
    state = "restricted";
    label = `Seat ${unit.designator}, ${unit.compartmentDesignator === "C" ? "Business" : "Economy"} cabin, not part of your fare.`;
    disabled = true;
  } else {
    state = "taken";
    label = `Seat ${unit.designator}, taken.`;
    disabled = true;
  }

  return (
    <button type="button" className={`seat ${state}`} disabled={disabled} aria-label={label} title={label} onClick={() => onChoose(unit)}>
      {owner ? initials(owner) : ""}
    </button>
  );
}
