"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState, Loading } from "@/components/Feedback";
import { FlowHeader } from "@/components/FlowHeader";
import { PaymentPanel } from "@/components/PaymentPanel";
import { BookingSummary } from "@/components/Summary";
import { patchFlow, useFlow } from "@/lib/flow";
import { genderLabel } from "@/lib/format";
import { seatList } from "@/components/Itinerary";
import { currentSession, endSession } from "@/lib/session";
import { useHydrated } from "@/lib/store";
import type { Booking } from "@/lib/types";

export default function PaymentPage() {
  const hydrated = useHydrated();
  const flow = useFlow();
  const router = useRouter();

  if (!hydrated) return <Loading>Loading your booking…</Loading>;
  const booking = flow.booking;
  if (!booking && flow.confirmed) return <Loading>Opening your confirmation…</Loading>;
  if (!booking || !flow.details) {
    return (
      <div className="wrap" style={{ padding: "40px 0" }}>
        <EmptyState title="No booking in progress" body="Search for flights and add traveller details before paying." />
      </div>
    );
  }

  const done = (b: Booking) => {
    patchFlow({ confirmed: b, booking: null, details: null, selection: { out: null, ret: null }, availability: null, searchedAt: null });
    // Web customers end their session once the booking is saved (frees the server session right away).
    if (currentSession()?.kind === "anonymous") void endSession();
    router.push("/book/confirmation");
  };

  return (
    <>
      <FlowHeader criteria={flow.criteria} step="Payment" showHoldTimer />
      <div className="wrap">
        <div className="flow-body">
          <div>
            <section className="panel" aria-labelledby="who-h" style={{ marginBottom: 16 }}>
              <div className="panel-head">
                <h3 id="who-h">Travellers</h3>
                <span style={{ display: "flex", gap: 16 }}>
                  <Link href="/book/passengers">Edit details</Link>
                  <Link href="/book/seats">Change seats</Link>
                </span>
              </div>
              <table className="data-table">
                <tbody>
                  {Object.values(booking.passengers).map((p) => (
                    <tr key={p.passengerKey}>
                      <td>
                        {[p.name.title, p.name.first, p.name.last].filter(Boolean).join(" ")}
                      </td>
                      <td>{p.passengerTypeCode === "CHD" ? "Child" : "Adult"}</td>
                      <td>{genderLabel(p.info.gender)}</td>
                      <td>{seatList(booking, p.passengerKey) || "No seats"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <PaymentPanel booking={booking} allowHold seatsHref="/book/seats" onBookingChange={(b) => patchFlow({ booking: b })} onDone={done} />
          </div>
          <BookingSummary booking={booking} />
        </div>
      </div>
    </>
  );
}
