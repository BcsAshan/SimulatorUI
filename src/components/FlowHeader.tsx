"use client";

import { useEffect, useState } from "react";
import { cityName } from "@/lib/network";
import { shortDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { SearchCriteria } from "@/lib/types";

const STEPS = ["Flights", "Travellers", "Seats", "Payment", "Confirmation"] as const;
export type Step = (typeof STEPS)[number];

export function FlowHeader({ criteria, step, showHoldTimer = false }: { criteria: SearchCriteria | null; step: Step; showHoldTimer?: boolean }) {
  const current = STEPS.indexOf(step);
  const pax = criteria ? criteria.pax.ADT + criteria.pax.CHD : 0;

  return (
    <div className="flow-head">
      <div className="wrap">
        {criteria ? (
          <>
            <div className="route-line">
              <span>{criteria.origin}</span>
              <svg width="28" height="16" viewBox="0 0 28 16" aria-hidden="true">
                {criteria.returnDate ? (
                  <path d="M2 5h22l-4-4M26 11H4l4 4" stroke="#f0a202" strokeWidth="2" fill="none" />
                ) : (
                  <path d="M2 8h22l-5-5M24 8l-5 5" stroke="#f0a202" strokeWidth="2" fill="none" />
                )}
              </svg>
              <span>{criteria.destination}</span>
              <span className="visually-hidden">
                {criteria.returnDate ? "return trip" : "one way"} from {cityName(criteria.origin)} to {cityName(criteria.destination)}
              </span>
            </div>
            <p className="route-sub">
              {cityName(criteria.origin)} to {cityName(criteria.destination)}, {shortDate(criteria.departDate)}
              {criteria.returnDate ? `, back ${shortDate(criteria.returnDate)}` : ", one way"}. {pax} {pax === 1 ? "traveller" : "travellers"}.
              {showHoldTimer && <HoldTimer />}
            </p>
          </>
        ) : (
          <div className="route-line">Your trip</div>
        )}
        <ol className="steps" aria-label="Booking steps">
          {STEPS.map((s, i) => (
            <li key={s} data-state={i < current ? "done" : i === current ? "current" : "todo"} aria-current={i === current ? "step" : undefined}>
              {s}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Seats are held as long as the session lives: 15 minutes after the last request. */
function HoldTimer() {
  const session = useSession();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!session) return null;
  const left = Math.max(0, session.lastActivity + session.idleMinutes * 60_000 - now);
  const m = Math.floor(left / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return (
    <span className="session-timer" style={{ marginLeft: 10 }}>
      {left > 0 ? `Seats held for ${m}:${String(s).padStart(2, "0")} while you're inactive.` : "Your seat hold has ended."}
    </span>
  );
}
