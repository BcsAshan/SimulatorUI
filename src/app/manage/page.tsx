import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/Feedback";
import { ManageClient } from "./ManageClient";

export const metadata: Metadata = { title: "My booking" };

export default function ManagePage() {
  return (
    <Suspense
      fallback={
        <div className="wrap">
          <Loading>Loading…</Loading>
        </div>
      }
    >
      <ManageClient />
    </Suspense>
  );
}
