"use client";

import { useEffect, useState } from "react";
import { ErrorAlert, Loading } from "@/components/Feedback";
import { instant, money } from "@/lib/format";
import { TEST_CARDS } from "@/lib/network";
import { amountToPay, getBooking, getPaymentMethods, holdAvailable, payAndCommit, type CardInput } from "@/lib/pss";
import { useSession } from "@/lib/session";
import type { Booking, PaymentMethod } from "@/lib/types";

/**
 * Payment step shared by the booking flow (first commit) and Manage booking / Agent desk (paying a held booking).
 * Calls onDone with the committed booking.
 */
export function PaymentPanel({
  booking,
  allowHold,
  onBookingChange,
  onDone,
  payLabel = "Pay and book",
}: {
  booking: Booking;
  allowHold: boolean;
  onBookingChange?: (b: Booking) => void;
  onDone: (b: Booking) => void;
  payLabel?: string;
}) {
  const session = useSession();
  const [methods, setMethods] = useState<Record<string, PaymentMethod> | null>(null);
  const [hold, setHold] = useState<{ expiration: string } | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [method, setMethod] = useState<string>("VI");
  const [card, setCard] = useState<CardInput>({ method: "VI", number: "", expiry: "", holder: "", cvv: "" });
  const [busy, setBusy] = useState<"pay" | "hold" | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // one stateful call at a time per session
        const m = await getPaymentMethods();
        const h = allowHold ? await holdAvailable() : null;
        if (!alive) return;
        setMethods(m);
        setHold(h);
      } catch (e) {
        if (alive) setLoadError(e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [allowHold]);

  const available = methods ? Object.values(methods).filter((m) => m.allowed) : [];
  const cardMethods = available.filter((m) => m.paymentMethodType === 0);
  const cash = available.find((m) => m.paymentMethodCode === "CA");
  const isCash = method === "CA";
  const due = amountToPay(booking);

  const onNumber = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 19);
    const grouped = digits.replace(/(.{4})/g, "$1 ").trim();
    const detected = digits.startsWith("4") ? "VI" : digits.startsWith("5") ? "MC" : null;
    if (detected && cardMethods.some((m) => m.paymentMethodCode === detected)) setMethod(detected);
    setCard((c) => ({ ...c, number: grouped }));
  };

  const onExpiry = (raw: string) => {
    const d = raw.replace(/\D/g, "").slice(0, 4);
    setCard((c) => ({ ...c, expiry: d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d }));
  };

  const validateCard = (): boolean => {
    const errs: Record<string, string> = {};
    const digits = card.number.replace(/\s/g, "");
    if (digits.length < 13 || !luhn(digits)) errs.number = "Enter a valid card number.";
    const m = /^(\d{2})\/(\d{2})$/.exec(card.expiry);
    if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) errs.expiry = "Use MM/YY.";
    else {
      const now = new Date();
      const yy = 2000 + Number(m[2]);
      if (yy < now.getFullYear() || (yy === now.getFullYear() && Number(m[1]) < now.getMonth() + 1)) errs.expiry = "This card has expired.";
    }
    if (!card.holder.trim()) errs.holder = "Enter the name on the card.";
    if (card.holder.trim().length > 30) errs.holder = "Use 30 characters or fewer.";
    if (!/^\d{3,4}$/.test(card.cvv)) errs.cvv = "3 or 4 digits.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const receivedBy = session?.kind === "agent" ? `Agent ${session.user ?? ""}`.trim() : "Web";

  const refresh = async () => {
    try {
      const b = await getBooking();
      onBookingChange?.(b);
    } catch {
      /* keep the old figures */
    }
  };

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCash && !validateCard()) return;
    setBusy("pay");
    setError(null);
    try {
      const done = await payAndCommit(isCash ? { kind: "cash" } : { kind: "card", card: { ...card, method } }, receivedBy);
      onDone(done);
    } catch (err) {
      setError(err);
      setBusy(null);
      void refresh();
    }
  };

  const holdNow = async () => {
    setBusy("hold");
    setError(null);
    try {
      const done = await payAndCommit({ kind: "hold" }, receivedBy);
      onDone(done);
    } catch (err) {
      setError(err);
      setBusy(null);
    }
  };

  if (loadError) return <ErrorAlert error={loadError} />;
  if (!methods) return <Loading>Loading payment options…</Loading>;

  return (
    <div className="stack">
      <form className="panel" onSubmit={pay} noValidate aria-labelledby="pay-h">
        <div className="panel-head">
          <h2 id="pay-h">Pay {money(due, booking.currencyCode, true)}</h2>
          <p>Your card is charged only when the booking is confirmed.</p>
        </div>

        {(cardMethods.length > 1 || cash) && (
          <div className="seg-toggle method-tabs" role="radiogroup" aria-label="Payment method">
            {[...cardMethods, ...(cash ? [cash] : [])].map((m) => (
              <label key={m.paymentMethodCode}>
                <input type="radio" name="method" checked={method === m.paymentMethodCode} onChange={() => setMethod(m.paymentMethodCode)} />
                <span>{m.name}</span>
              </label>
            ))}
          </div>
        )}

        {isCash ? (
          <p className="alert alert-info">
            Take {money(due, booking.currencyCode, true)} in cash from the customer, then confirm. Cash is approved immediately.
          </p>
        ) : (
          <div className="grid-2" style={{ alignItems: "start" }}>
            <div className="stack">
              <Field id="cc-number" label="Card number" error={fieldErrors.number}>
                <input id="cc-number" className="input num" inputMode="numeric" autoComplete="cc-number" value={card.number} onChange={(e) => onNumber(e.target.value)} placeholder="4111 1111 1111 1111" aria-invalid={!!fieldErrors.number || undefined} />
              </Field>
              <div className="grid-2">
                <Field id="cc-exp" label="Expiry" error={fieldErrors.expiry}>
                  <input id="cc-exp" className="input num" inputMode="numeric" autoComplete="cc-exp" value={card.expiry} onChange={(e) => onExpiry(e.target.value)} placeholder="MM/YY" aria-invalid={!!fieldErrors.expiry || undefined} />
                </Field>
                <Field id="cc-cvv" label="Security code" error={fieldErrors.cvv}>
                  <input id="cc-cvv" className="input num" inputMode="numeric" autoComplete="cc-csc" maxLength={4} value={card.cvv} onChange={(e) => setCard((c) => ({ ...c, cvv: e.target.value.replace(/\D/g, "") }))} placeholder="123" aria-invalid={!!fieldErrors.cvv || undefined} />
                </Field>
              </div>
              <Field id="cc-name" label="Name on card" error={fieldErrors.holder}>
                <input id="cc-name" className="input" autoComplete="cc-name" value={card.holder} maxLength={30} onChange={(e) => setCard((c) => ({ ...c, holder: e.target.value }))} aria-invalid={!!fieldErrors.holder || undefined} />
              </Field>
            </div>
            <div className="stack">
              <div className="card-preview" aria-hidden="true">
                <span className="brand-chip">{methods[method]?.name ?? method}</span>
                <span className="pan">{card.number || "•••• •••• •••• ••••"}</span>
                <span className="row">
                  <span>{card.holder || "Name on card"}</span>
                  <span>{card.expiry || "MM/YY"}</span>
                </span>
              </div>
              <details>
                <summary className="hint" style={{ cursor: "pointer" }}>Test cards for this demo</summary>
                <table className="test-cards">
                  <tbody>
                    {TEST_CARDS.map((t) => (
                      <tr key={t.number}>
                        <td>
                          <button type="button" onClick={() => {
                            onNumber(t.number);
                            setMethod(t.method);
                            setCard((c) => ({ ...c, expiry: c.expiry || "12/30", cvv: c.cvv || "123", holder: c.holder || "Test Traveller" }));
                          }}>
                            {t.number}
                          </button>
                        </td>
                        <td>{t.result}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </div>
          </div>
        )}

        {error != null && busy === null && (
          <div style={{ marginTop: 16 }}>
            <ErrorAlert error={error} />
          </div>
        )}

        <div className="row-end">
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy !== null || due <= 0}>
            {busy === "pay" ? "Confirming your booking…" : `${payLabel}, ${money(due, booking.currencyCode, true)}`}
          </button>
        </div>
      </form>

      {allowHold && hold && (
        <section className="panel" aria-labelledby="hold-h">
          <div className="panel-head">
            <h3 id="hold-h">Not ready to pay?</h3>
          </div>
          <p style={{ marginBottom: 14 }}>
            Hold these seats without paying until <strong>{instant(hold.expiration)}</strong>. Pay any time before then from My booking, or the hold is cancelled.
          </p>
          <button type="button" className="btn btn-ghost" onClick={holdNow} disabled={busy !== null}>
            {busy === "hold" ? "Holding…" : "Hold booking and pay later"}
          </button>
        </section>
      )}
    </div>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

function luhn(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}
