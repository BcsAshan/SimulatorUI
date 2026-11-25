"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ErrorAlert, Loading } from "@/components/Feedback";
import { Itinerary } from "@/components/Itinerary";
import { PaymentPanel } from "@/components/PaymentPanel";
import { SeatPicker } from "@/components/SeatPicker";
import { amountToPay, commitBooking, getBookingStatus, retrieveBooking, seatsByLeg } from "@/lib/pss";
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
  const [seatsOpen, setSeatsOpen] = useState(false);
  const [seatsChanged, setSeatsChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const autoRan = useRef(false);

  const find = async (rl: string, ln: string) => {
    if (!RL_RE.test(rl)) return setFormError("A booking reference has 6 letters and numbers, like K7PM2Q.");
    if (!ln.trim()) return setFormError("Enter the last name of a traveller or the contact.");
    setFormError(null);
    setBusy(true);
    setError(null);
    setPaid(false);
    setSeatsOpen(false);
    setSeatsChanged(false);
    setSaved(false);
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

  // A booking on hold must be paid; a confirmed booking owes money after a paid seat change.
  const owes = !!booking && amountToPay(booking) > 0 && (booking.info.status === 1 || seatsChanged);
  // Moving to a cheaper seat (or dropping a paid one) would need a refund — not available until Phase 2.
  const overpaid = !!booking && seatsChanged && booking.breakdown.balanceDue < 0;
  const canChangeSeats = !!booking && (booking.info.status === 1 || booking.info.status === 2);

  /** Seat change with nothing to pay: commit it (PUT v3/booking). */
  const saveSeats = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await commitBooking(false, "Web");
      setBooking(await getBookingStatus());
      setSeatsChanged(false);
      setSeatsOpen(false);
      setSaved(true);
    } catch (e) {
      setSaveError(e);
    } finally {
      setSaving(false);
    }
  };

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
            {saved && booking && (
              <p className="alert alert-info" role="status" style={{ marginBottom: 16 }}>
                Seat changes saved.
              </p>
            )}
            {booking && !busy && (
              <div className="stack">
                <Itinerary
                  booking={booking}
                  actions={
                    canChangeSeats && !seatsOpen ? (
                      <button type="button" className="btn btn-ghost" onClick={() => setSeatsOpen(true)}>
                        Change seats
                      </button>
                    ) : undefined
                  }
                />
                {seatsOpen && (
                  <section className="panel" aria-labelledby="mseats-h">
                    <div className="panel-head">
                      <h2 id="mseats-h">Change seats</h2>
                      <p>New seats are held for you until you save. Your current seats stay yours until then.</p>
                    </div>
                    <SeatPicker
                      booking={booking}
                      onBookingChange={(b) => {
                        if (JSON.stringify(seatsByLeg(b)) !== JSON.stringify(seatsByLeg(booking))) {
                          setSeatsChanged(true);
                          setSaved(false);
                        }
                        setBooking(b);
                      }}
                    />
                    {overpaid && (
                      <div className="alert alert-warn" role="status" style={{ marginTop: 16 }}>
                        <strong>This change can't be saved online.</strong>
                        Your new seats cost less than the ones you paid for, and refunds aren't available yet. Pick seats of the same price
                        or higher, or discard the changes.
                        <div style={{ marginTop: 10 }}>
                          <button type="button" className="btn btn-ghost" onClick={() => void find(ref.trim().toUpperCase(), last)}>
                            Discard seat changes
                          </button>
                        </div>
                      </div>
                    )}
                    {seatsChanged && !owes && !overpaid && (
                      <div className="row-end">
                        {saveError != null && <ErrorAlert error={saveError} />}
                        <button type="button" className="btn btn-primary" onClick={saveSeats} disabled={saving}>
                          {saving ? "Saving…" : "Save seat changes"}
                        </button>
                      </div>
                    )}
                  </section>
                )}
                {owes && (
                  <PaymentPanel
                    booking={booking}
                    allowHold={false}
                    payLabel={seatsChanged ? "Pay and save seats" : "Pay and confirm"}
                    onBookingChange={setBooking}
                    onDone={(b) => {
                      setBooking(b);
                      setPaid(true);
                      setSeatsChanged(false);
                      setSeatsOpen(false);
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
