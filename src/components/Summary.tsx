"use client";

import { duration, localTime, money, shortDate } from "@/lib/format";
import { cityName, PRODUCTS } from "@/lib/network";
import type { FareOffer } from "@/lib/offers";
import { amountToPay } from "@/lib/pss";
import type { AvailableJourney, Booking, BookingJourney } from "@/lib/types";

type AnyJourney = AvailableJourney | BookingJourney;

export function flightNumbers(j: AnyJourney): string {
  return j.segments.map((s) => `${s.identifier.carrierCode}${s.identifier.identifier}`).join(" and ");
}

export function journeyDuration(j: AnyJourney): string {
  const legs = j.segments.flatMap((s) => s.legs ?? []);
  if (!legs.length) return "";
  return duration(legs[0].legInfo.departureTimeUtc, legs[legs.length - 1].legInfo.arrivalTimeUtc);
}

function LegLine({ title, journey, offer }: { title: string; journey: AnyJourney; offer?: FareOffer | null }) {
  const d = journey.designator;
  return (
    <div className="summary-leg">
      <div className="detail">{title}</div>
      <div className="codes">
        {d.origin} to {d.destination}
      </div>
      <div className="detail">
        {shortDate(d.departure)}, {localTime(d.departure)} to {localTime(d.arrival)}
      </div>
      <div className="detail">
        {flightNumbers(journey)}
        {journey.stops > 0 || journey.segments.length > 1 ? `, via ${journey.segments[0].designator.destination}` : ", non-stop"}
        {offer ? `. ${offer.productName}` : ""}
      </div>
    </div>
  );
}

/** Sidebar on the flights page, before anything is sold. */
export function SelectionSummary({
  legs,
  currency,
  pax,
  children,
}: {
  legs: { title: string; journey: AvailableJourney | null; offer: FareOffer | null }[];
  currency: string;
  pax: number;
  children?: React.ReactNode;
}) {
  const chosen = legs.filter((l) => l.journey && l.offer);
  const fare = chosen.reduce((s, l) => s + (l.offer?.fareOnly ?? 0), 0);
  const tax = chosen.reduce((s, l) => s + (l.offer?.taxesAndFees ?? 0), 0);
  const complete = chosen.length === legs.length;

  return (
    <aside className="summary" aria-label="Trip summary">
      <div className="panel">
        <h3 style={{ marginBottom: 12 }}>Your trip</h3>
        {legs.map((l) =>
          l.journey && l.offer ? (
            <LegLine key={l.title} title={l.title} journey={l.journey} offer={l.offer} />
          ) : (
            <div className="summary-leg" key={l.title}>
              <div className="detail">{l.title}</div>
              <div className="detail">Choose a flight and fare.</div>
            </div>
          ),
        )}
        {chosen.length > 0 && (
          <>
            <dl className="money-rows">
              <div>
                <dt>Fares for {pax} {pax === 1 ? "traveller" : "travellers"}</dt>
                <dd>{money(fare, currency, true)}</dd>
              </div>
              <div>
                <dt>Taxes and fees</dt>
                <dd>{money(tax, currency, true)}</dd>
              </div>
            </dl>
            <div className="total-row">
              <span>{complete ? "Total" : "So far"}</span>
              <span className="amt num">{money(fare + tax, currency, true)}</span>
            </div>
          </>
        )}
        {children}
      </div>
    </aside>
  );
}

/** Sidebar once a booking is in state; every amount comes from the engine's breakdown. */
export function BookingSummary({ booking, children }: { booking: Booking; children?: React.ReactNode }) {
  const b = booking.breakdown;
  const tax = b.journeyTotals?.totalTax ?? 0;
  const due = amountToPay(booking);
  const paid = Math.max(0, b.totalAmount - due);
  const titles = booking.journeys.length === 2 ? ["Outbound", "Return"] : booking.journeys.map((_, i) => `Flight ${i + 1}`);
  const pax = Object.keys(booking.passengers).length;
  return (
    <aside className="summary" aria-label="Booking summary">
      <div className="panel">
        <h3 style={{ marginBottom: 12 }}>Your trip</h3>
        {booking.journeys.map((j, i) => (
          <LegLine key={j.journeyKey} title={titles[i] ?? `Flight ${i + 1}`} journey={j} offer={null} />
        ))}
        <dl className="money-rows">
          <div>
            <dt>Fares for {pax} {pax === 1 ? "traveller" : "travellers"}</dt>
            <dd>{money(b.totalAmount - tax, booking.currencyCode, true)}</dd>
          </div>
          <div>
            <dt>Taxes and fees</dt>
            <dd>{money(tax, booking.currencyCode, true)}</dd>
          </div>
          {paid > 0 && (
            <div>
              <dt>Paid</dt>
              <dd>−{money(paid, booking.currencyCode, true)}</dd>
            </div>
          )}
        </dl>
        <div className="total-row">
          <span>{paid > 0 ? "Left to pay" : "Total"}</span>
          <span className="amt num">{money(paid > 0 ? due : b.totalAmount, booking.currencyCode, true)}</span>
        </div>
        {children}
      </div>
    </aside>
  );
}

export function productLabel(productClass?: string | null): string {
  if (!productClass) return "";
  const p = PRODUCTS[productClass];
  return p ? `${p.cabin} ${p.name}` : productClass;
}

export function routeTitle(j: AnyJourney): string {
  return `${cityName(j.designator.origin)} to ${cityName(j.designator.destination)}`;
}
