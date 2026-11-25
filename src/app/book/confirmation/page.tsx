"use client";

import Link from "next/link";
import { EmptyState, Loading } from "@/components/Feedback";
import { FlowHeader } from "@/components/FlowHeader";
import { Itinerary } from "@/components/Itinerary";
import { useFlow } from "@/lib/flow";
import { useHydrated } from "@/lib/store";

export default function ConfirmationPage() {
  const hydrated = useHydrated();
  const flow = useFlow();
  if (!hydrated) return <Loading>Loading your booking…</Loading>;

  const b = flow.confirmed;
  if (!b) {
    return (
      <div className="wrap" style={{ padding: "40px 0" }}>
        <EmptyState title="No recent booking in this tab" body="Find an existing booking with its reference and last name." href="/manage" cta="Find my booking" />
      </div>
    );
  }

  const held = b.info.status === 1;
  const email = b.contacts?.P?.emailAddress;
  const lastName = Object.values(b.passengers)[0]?.name?.last ?? "";

  return (
    <>
      <FlowHeader criteria={flow.criteria} step="Confirmation" />
      <div className="wrap">
        <div className="flow-body single">
          <div className="stack">
            <div>
              <h1>{held ? "Your seats are on hold" : "You're booked"}</h1>
              <p style={{ marginTop: 10, color: "var(--ink-soft)", maxWidth: "60ch" }}>
                {held
                  ? "Pay before the hold ends to confirm the booking. Use your booking reference and last name in My booking."
                  : email
                    ? `We've sent the itinerary to ${email}. Keep your booking reference handy for check-in.`
                    : "Keep your booking reference handy for check-in."}
              </p>
            </div>
            <Itinerary
              booking={b}
              actions={
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <Link className="btn btn-primary" href={`/manage?ref=${b.recordLocator ?? ""}&last=${encodeURIComponent(lastName)}`}>
                    {held ? "Pay now" : "Manage this booking"}
                  </Link>
                  <Link className="btn btn-ghost" href="/">
                    Book another trip
                  </Link>
                </div>
              }
            />
          </div>
        </div>
      </div>
    </>
  );
}
