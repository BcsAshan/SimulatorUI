import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/Feedback";
import { FlightsClient } from "./FlightsClient";

export const metadata: Metadata = { title: "Choose flights" };

export default function FlightsPage() {
  return (
    <Suspense
      fallback={
        <div className="wrap">
          <Loading>Loading flights…</Loading>
        </div>
      }
    >
      <FlightsClient />
    </Suspense>
  );
}
