"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorAlert, Loading } from "@/components/Feedback";
import { Itinerary } from "@/components/Itinerary";
import { PaymentPanel } from "@/components/PaymentPanel";
import { flowStore } from "@/lib/flow";
import { agentLookup, agentRetrieve, amountToPay } from "@/lib/pss";
import { agentLogin, useSession } from "@/lib/session";
import { useHydrated } from "@/lib/store";
import type { Booking } from "@/lib/types";

export default function AgentPage() {
  const hydrated = useHydrated();
  const session = useSession();
  if (!hydrated) return <Loading>Loading…</Loading>;

  return (
    <>
      <div className="flow-head">
        <div className="wrap">
          <h1>Agent desk</h1>
          <p className="route-sub">
            {session?.kind === "agent"
              ? `Signed in as ${session.user}. Bookings you make from the search page are made on this agent session, so cash payment is available.`
              : "Sign in with an agent account to look up any booking by reference and take cash payments."}
          </p>
        </div>
      </div>
      <div className="wrap">{session?.kind === "agent" ? <AgentConsole /> : <AgentLogin />}</div>
    </>
  );
}

function AgentLogin() {
  const [domain, setDomain] = useState("DEF");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      flowStore.reset(); // a customer draft from this tab belonged to the old session
      await agentLogin(domain.trim().toUpperCase(), username.trim(), password);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="agent-shell">
      <form className="panel stack" onSubmit={submit} aria-label="Agent sign in">
        <h2>Sign in</h2>
        <div className="field">
          <label htmlFor="a-domain">Domain</label>
          <input id="a-domain" className="input" value={domain} onChange={(e) => setDomain(e.target.value)} maxLength={5} />
        </div>
        <div className="field">
          <label htmlFor="a-user">Username</label>
          <input id="a-user" className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </div>
        <div className="field">
          <label htmlFor="a-pass">Password</label>
          <input id="a-pass" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </div>
        {error != null && <ErrorAlert error={error} />}
        <button type="submit" className="btn btn-primary" disabled={busy || !username || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <div className="panel">
        <h3 style={{ marginBottom: 10 }}>Demo account</h3>
        <dl className="kv">
          <dt>Domain</dt>
          <dd>DEF</dd>
          <dt>Username</dt>
          <dd>agent01</dd>
          <dt>Password</dt>
          <dd>Password1!</dd>
        </dl>
        <p className="hint" style={{ marginTop: 12 }}>
          Agent sessions end after 15 minutes without activity, like customer sessions.
        </p>
      </div>
    </div>
  );
}

function AgentConsole() {
  const [rl, setRl] = useState("");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loadedInState, setLoadedInState] = useState(false);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = rl.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setError(new Error("A booking reference has 6 letters and numbers."));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    setNotFound(null);
    setLoadedInState(false);
    try {
      // stateless read: doesn't disturb whatever this session has in state
      const b = await agentLookup(code);
      setBooking(b);
      if (!b) setNotFound(code);
    } catch (err) {
      setBooking(null);
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const openForPayment = async () => {
    if (!booking?.recordLocator) return;
    setBusy(true);
    setError(null);
    try {
      setBooking(await agentRetrieve(booking.recordLocator));
      setLoadedInState(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const owes = !!booking && amountToPay(booking) > 0 && booking.info.status === 1;

  return (
    <div className="agent-shell">
      <div className="stack">
        <form className="panel stack" onSubmit={lookup} aria-label="Find a booking by reference">
          <h2>Find a booking</h2>
          <div className="field">
            <label htmlFor="ag-rl">Booking reference</label>
            <input id="ag-rl" className="input num" value={rl} maxLength={6} onChange={(e) => setRl(e.target.value.toUpperCase())} placeholder="K7PM2Q" style={{ letterSpacing: "0.12em", fontWeight: 700 }} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Look up
          </button>
        </form>
        <div className="panel">
          <h3 style={{ marginBottom: 8 }}>Sell a new booking</h3>
          <p className="hint" style={{ marginBottom: 14 }}>
            Use the normal search. The booking is made on your agent session and you can take cash at the payment step.
          </p>
          <Link className="btn btn-ghost" href="/">
            Search flights
          </Link>
        </div>
      </div>

      <div>
        {busy && <Loading>Working…</Loading>}
        {error != null && !busy && <ErrorAlert error={error} />}
        {notice && (
          <p className="alert alert-info" role="status" style={{ marginBottom: 16 }}>
            {notice}
          </p>
        )}
        {notFound && !busy && (
          <div className="empty">
            <h2>No booking {notFound}</h2>
            <p>Check the reference. Only committed bookings can be found.</p>
          </div>
        )}
        {booking && !busy && (
          <div className="stack">
            <Itinerary
              booking={booking}
              actions={
                owes && !loadedInState ? (
                  <button type="button" className="btn btn-accent" onClick={openForPayment}>
                    Take payment
                  </button>
                ) : undefined
              }
            />
            {owes && loadedInState && (
              <PaymentPanel
                booking={booking}
                allowHold={false}
                payLabel="Take payment and confirm"
                onBookingChange={setBooking}
                onDone={(b) => {
                  setBooking(b);
                  setLoadedInState(false);
                  setNotice(`Payment taken. ${b.recordLocator} is ${b.info.status === 2 ? "confirmed" : "updated"}.`);
                }}
              />
            )}
          </div>
        )}
        {!booking && !notFound && !busy && error == null && (
          <div className="empty">
            <h2>Look up a booking</h2>
            <p>Enter a booking reference to see its flights, travellers and payments. No name check is needed on the agent desk.</p>
          </div>
        )}
      </div>
    </div>
  );
}
