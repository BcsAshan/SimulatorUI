"use client";

import Link from "next/link";
import { friendlyError } from "@/lib/api";

export function ErrorAlert({ error, action }: { error: unknown; action?: React.ReactNode }) {
  if (!error) return null;
  const e = friendlyError(error);
  return (
    <div className="alert alert-error" role="alert">
      <strong>{e.title}</strong>
      {e.detail && <p>{e.detail}</p>}
      {e.code && <code>{e.code}</code>}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );
}

export function Loading({ children }: { children: React.ReactNode }) {
  return (
    <div className="loading-row" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {children}
    </div>
  );
}

export function EmptyState({ title, body, href = "/", cta = "Search flights" }: { title: string; body: string; href?: string; cta?: string }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{body}</p>
      <Link className="btn btn-primary" href={href}>
        {cta}
      </Link>
    </div>
  );
}
