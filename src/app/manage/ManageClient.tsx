"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ErrorAlert, Loading } from "@/components/Feedback";
import { Itinerary } from "@/components/Itinerary";
import { PaymentPanel } from "@/components/PaymentPanel";
import { amountToPay, retrieveBooking } from "@/lib/pss";
import type { Booking } from "@/lib/types";

const RL_RE = /^[A-Z0-9]{6}$/;

export function ManageClient() {
  const params = useSearchParams();
  const [ref, setRef] = useState(() => (params.get("ref") ?? "").toUpperCase());
  const [last, setLast] = useState(() => params.get("last") ?? "");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const autoRan = useRef(false);

  const find = async (rl: string, ln: string) => {
    if (!RL_RE.test(rl)) return setFormError("A booking reference has 6 letters and numbers, like K7PM2Q.");
    if (!ln.trim()) return setFormError("Enter the last name of a traveller or the contact.");
    setFormError(null);
    setBusy(true);
    setError(null);
    setPaid(false);
    try {
      setBooking(await retrieveBooking(rl, ln));
    } catch (e) {
      setBooking(null);
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  // Arriving from the confirmation page with ?ref=…&last=… looks the booking up straight away.
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    const r = (params.get("ref") ?? "").toUpperCase();
    const l = params.get("last") ?? "";
    if (RL_RE.test(r) && l) void find(r, l);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- run once on arrival

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void find(ref.trim().toUpperCase(), last);
  };

  const owes = booking && amountToPay(booking) > 0 && booking.info.status === 1;

  return (
    <>
      <div className="flow-head">
        <div className="wrap">
          <h1>My booking</h1>
          <p className="route-sub">See your flights, travellers and payments, or pay for a booking on hold.</p>
        </div>
      </div>
      <div className="wrap">
        <div className="flow-body">
          <div>
            {busy && <Loading>Finding your booking…</Loading>}
            {error != null && !busy && <ErrorAlert error={error} />}
            {paid && booking && (
              <p className="alert alert-info" role="status" style={{ marginBottom: 16 }}>
                Payment received. Your booking is {booking.info.status === 2 ? "confirmed" : "updated"}.
              </p>
            )}
            {booking && !busy && (
              <div className="stack">
                <Itinerary booking={booking} />
                {owes && (
                  <PaymentPanel
                    booking={booking}
                    allowHold={false}
                    payLabel="Pay and confirm"
                    onBookingChange={setBooking}
                    onDone={(b) => {
                      setBooking(b);
                      setPaid(true);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  />
                )}
              </div>
            )}
            {!booking && !busy && error == null && (
              <div className="empty">
                <h2>Find your booking</h2>
                <p>Enter the 6-character booking reference from your confirmation and the last name of anyone on the booking.</p>
              </div>
            )}
          </div>

          <aside className="summary">
            <form className="panel stack" onSubmit={submit} noValidate aria-label="Find a booking">
              <div className="field">
                <label htmlFor="rl">Booking reference</label>
                <input id="rl" className="input num" value={ref} maxLength={6} autoCapitalize="characters" onChange={(e) => setRef(e.target.value.toUpperCase())} placeholder="K7PM2Q" style={{ letterSpacing: "0.12em", fontWeight: 700 }} />
              </div>
              <div className="field">
                <label htmlFor="ln">Last name</label>
                <input id="ln" className="input" value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" />
              </div>
              {formError && (
                <p className="field-error" role="alert">
                  {formError}
                </p>
              )}
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Find booking
              </button>
            </form>
          </aside>
        </div>
      </div>
    </>
  );
}
