"use client";

import { bookingStatusLabel, dayDiff, genderLabel, instant, localTime, longDate, money, paxTypeLabel, paymentStatusLabel } from "@/lib/format";
import { cityName } from "@/lib/network";
import type { Booking } from "@/lib/types";
import { flightNumbers, journeyDuration, productLabel } from "./Summary";

export function StatusPill({ status }: { status: number }) {
  const s = bookingStatusLabel(status);
  return <span className={`status-pill status-${s.tone}`}>{s.label}</span>;
}

/** Full read-only view of a stored booking: reference, flights, travellers, contact and payments. */
export function Itinerary({ booking, actions }: { booking: Booking; actions?: React.ReactNode }) {
  const contact = booking.contacts?.P;
  const b = booking.breakdown;
  const titles = booking.journeys.length === 2 ? ["Outbound", "Return"] : booking.journeys.map((_, i) => `Flight ${i + 1}`);

  return (
    <div className="stack">
      <section className="panel" aria-labelledby="ref-h">
        <p className="hint" id="ref-h">
          Booking reference
        </p>
        <div className="pnr-block">
          <span className="pnr">{booking.recordLocator ?? "Not saved"}</span>
          <StatusPill status={booking.info.status} />
        </div>
        {booking.info.status === 1 && booking.hold?.expiration && (
          <p className="alert alert-warn" style={{ marginTop: 16 }}>
            Pay {money(b.balanceDue, booking.currencyCode, true)} before {instant(booking.hold.expiration)} or the seats are released.
          </p>
        )}
        {actions && <div style={{ marginTop: 16 }}>{actions}</div>}
      </section>

      <section className="panel" aria-labelledby="flights-h">
        <h3 id="flights-h" style={{ marginBottom: 4 }}>Flights</h3>
        {booking.journeys.map((j, i) => {
          const d = j.designator;
          const plus = dayDiff(d.departure, d.arrival);
          const fare = j.segments[0]?.fares?.[0];
          return (
            <div className="itin-leg" key={j.journeyKey}>
              <div>
                <p className="hint">
                  {titles[i]}, {longDate(d.departure)}
                </p>
                <div className="timeline" style={{ maxWidth: 420, marginTop: 6 }}>
                  <div>
                    <div className="t num">{localTime(d.departure)}</div>
                    <div className="s">{cityName(d.origin)} ({d.origin})</div>
                  </div>
                  <div className="track">{journeyDuration(j)}</div>
                  <div>
                    <div className="t num">
                      {localTime(d.arrival)}
                      {plus > 0 && <span className="plus">+{plus}</span>}
                    </div>
                    <div className="s">{cityName(d.destination)} ({d.destination})</div>
                  </div>
                </div>
              </div>
              <dl className="kv">
                <dt>Flight</dt>
                <dd>{flightNumbers(j)}</dd>
                {j.segments.length > 1 && (
                  <>
                    <dt>Change in</dt>
                    <dd>{cityName(j.segments[0].designator.destination)}</dd>
                  </>
                )}
                <dt>Fare</dt>
                <dd>{fare ? `${productLabel(fare.productClass)} (${fare.classOfService})` : "–"}</dd>
                <dt>Seats</dt>
                <dd>{j.segments.every((s) => s.status === 6) ? "Confirmed" : "Held"}</dd>
              </dl>
            </div>
          );
        })}
      </section>

      <section className="panel" aria-labelledby="pax-h">
        <h3 id="pax-h" style={{ marginBottom: 12 }}>Travellers</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Type</th>
              <th scope="col">Gender</th>
              <th scope="col">Date of birth</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(booking.passengers).map((p) => (
              <tr key={p.passengerKey}>
                <td>{[p.name.title, p.name.first, p.name.last].filter(Boolean).join(" ") || "–"}</td>
                <td>{paxTypeLabel(p.passengerTypeCode)}</td>
                <td>{genderLabel(p.info.gender) || "–"}</td>
                <td className="num">{p.info.dateOfBirth?.slice(0, 10) ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid-2">
        <section className="panel" aria-labelledby="contact-h">
          <h3 id="contact-h" style={{ marginBottom: 12 }}>Contact</h3>
          {contact ? (
            <dl className="kv">
              <dt>Name</dt>
              <dd>{[contact.name?.first, contact.name?.last].filter(Boolean).join(" ") || "–"}</dd>
              <dt>Email</dt>
              <dd>{contact.emailAddress || "–"}</dd>
              <dt>Phone</dt>
              <dd>{contact.phoneNumbers?.[0]?.number || "–"}</dd>
            </dl>
          ) : (
            <p className="hint">No contact on this booking.</p>
          )}
        </section>

        <section className="panel" aria-labelledby="pay-h">
          <h3 id="pay-h" style={{ marginBottom: 12 }}>Payments</h3>
          <dl className="kv" style={{ marginBottom: 12 }}>
            <dt>Total</dt>
            <dd className="num">{money(b.totalAmount, booking.currencyCode, true)}</dd>
            <dt>Left to pay</dt>
            <dd className="num">{money(b.balanceDue, booking.currencyCode, true)}</dd>
          </dl>
          {booking.payments.length > 0 && (
            <table className="data-table">
              <tbody>
                {booking.payments.map((p) => (
                  <tr key={p.paymentKey}>
                    <td>
                      {p.code} {p.details?.accountNumber ? `ending ${p.details.accountNumber.slice(-4)}` : ""}
                    </td>
                    <td className="num">{money(p.amounts.amount, p.amounts.currencyCode, true)}</td>
                    <td>{paymentStatusLabel(p.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
