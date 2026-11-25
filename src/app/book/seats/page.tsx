"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState, Loading } from "@/components/Feedback";
import { FlowHeader } from "@/components/FlowHeader";
import { SeatPicker } from "@/components/SeatPicker";
import { BookingSummary } from "@/components/Summary";
import { patchFlow, useFlow } from "@/lib/flow";
import { seatsByLeg } from "@/lib/pss";
import { useHydrated } from "@/lib/store";

export default function SeatsPage() {
  const hydrated = useHydrated();
  const flow = useFlow();
  const router = useRouter();

  if (!hydrated) return <Loading>Loading your booking…</Loading>;
  const booking = flow.booking;
  if (!booking || !flow.details) {
    return (
      <div className="wrap" style={{ padding: "40px 0" }}>
        <EmptyState title="No booking in progress" body="Search for flights and add traveller details before choosing seats." />
      </div>
    );
  }

  const seated = Object.values(seatsByLeg(booking)).reduce((n, byPax) => n + Object.keys(byPax).length, 0);

  return (
    <>
      <FlowHeader criteria={flow.criteria} step="Seats" showHoldTimer />
      <div className="wrap">
        <div className="flow-body">
          <div>
            <section className="panel" aria-labelledby="seats-h">
              <div className="panel-head">
                <h2 id="seats-h">Choose your seats</h2>
                <p>Optional. Without a seat choice, seats are given at check-in.</p>
              </div>
              <SeatPicker booking={booking} onBookingChange={(b) => patchFlow({ booking: b })} />
            </section>

            <div className="row-between">
              <Link href="/book/passengers">Back to travellers</Link>
              <button type="button" className="btn btn-primary btn-lg" onClick={() => router.push("/book/payment")}>
                {seated === 0 ? "Skip seats and continue to payment" : "Continue to payment"}
              </button>
            </div>
          </div>
          <BookingSummary booking={booking} />
        </div>
      </div>
    </>
  );
}
