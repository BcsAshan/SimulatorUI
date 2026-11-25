"use client";

import { ApiError, apiRequest, onApiActivity, type RequestOptions } from "./api";
import { createStore, useStore } from "./store";
import type { TokenResponse } from "./types";

/**
 * The engine's JWT is only a handle to a server-side session (Redis, 15 min sliding idle timeout).
 * One session per browser tab: anonymous for web customers, or an agent session after logging in on /agent.
 */
export interface UiSession {
  token: string;
  kind: "anonymous" | "agent";
  user: string | null;
  idleMinutes: number;
  lastActivity: number; // epoch ms of the last authenticated call
}

interface SessionState {
  session: UiSession | null;
}

const NO_SESSION: SessionState = { session: null };
export const sessionStore = createStore<SessionState>("pss.session", NO_SESSION);

if (typeof window !== "undefined") {
  onApiActivity(() => {
    const s = sessionStore.get().session;
    if (s) sessionStore.set({ session: { ...s, lastActivity: Date.now() } });
  });
}

export function useSession(): UiSession | null {
  return useStore(sessionStore, NO_SESSION).session;
}

export function currentSession(): UiSession | null {
  return sessionStore.get().session;
}

function remember(t: TokenResponse, kind: UiSession["kind"], user: string | null): UiSession {
  const s: UiSession = { token: t.token, kind, user, idleMinutes: t.idleTimeoutInMinutes || 15, lastActivity: Date.now() };
  sessionStore.set({ session: s });
  return s;
}

let pendingAnonymous: Promise<UiSession> | null = null;

/** Returns the current session, or creates an anonymous one. Concurrent callers share one token request. */
export async function ensureSession(): Promise<UiSession> {
  const existing = currentSession();
  if (existing && Date.now() - existing.lastActivity < existing.idleMinutes * 60_000 - 15_000) return existing;
  if (existing?.kind === "agent") {
    // An idle agent session is gone on the server too; make the agent sign in again rather than silently downgrading.
    sessionStore.set({ session: null });
    throw new ApiError(401, "core:Unauthorized", "Your agent session ended. Sign in again on the Agent page.");
  }
  if (!pendingAnonymous) {
    pendingAnonymous = apiRequest<TokenResponse>("/api/auth/v1/token/anonymous", {
      method: "POST",
      body: { applicationName: "dotREZWeb" },
    })
      .then((r) => remember(r.data, "anonymous", null))
      .finally(() => {
        pendingAnonymous = null;
      });
  }
  return pendingAnonymous;
}

/** Starts a brand-new anonymous session (drops any booking in state on the old one). */
export async function newAnonymousSession(): Promise<UiSession> {
  const old = currentSession();
  if (old?.kind === "anonymous") void endSession();
  sessionStore.set({ session: null });
  return ensureSession();
}

export async function agentLogin(domain: string, username: string, password: string): Promise<UiSession> {
  const old = currentSession();
  if (old) await endSession();
  const r = await apiRequest<TokenResponse>("/api/auth/v1/token/user", {
    method: "POST",
    body: { applicationName: "dotREZWeb", credentials: { domain, username, password } },
  });
  return remember(r.data, "agent", username);
}

/** DELETE /api/auth/v1/token — ends the server session, releases held seats. Never throws. */
export async function endSession(): Promise<void> {
  const s = currentSession();
  sessionStore.set({ session: null });
  if (!s) return;
  try {
    await apiRequest("/api/auth/v1/token", { method: "DELETE", token: s.token });
  } catch {
    /* already gone */
  }
}

/** Authenticated request on the current session. On 401 the local session is cleared so the UI can recover. */
export async function authed<T>(path: string, options: Omit<RequestOptions, "token"> = {}): Promise<T> {
  return callWith<T>(await ensureSession(), path, options);
}

async function callWith<T>(s: UiSession, path: string, options: Omit<RequestOptions, "token">): Promise<T> {
  try {
    const r = await apiRequest<T>(path, { ...options, token: s.token });
    return r.data;
  } catch (e) {
    if (e instanceof ApiError && e.isSessionExpired && currentSession()?.token === s.token) {
      sessionStore.set({ session: null });
    }
    throw e;
  }
}

/**
 * For stateless calls (search, reference data): if the anonymous session silently expired, start a new one and
 * retry once. Never used for booking calls — a lost session there means the booking in state is lost too.
 */
export async function authedRetry<T>(path: string, options: Omit<RequestOptions, "token"> = {}): Promise<T> {
  const before = currentSession();
  try {
    return await authed<T>(path, options);
  } catch (e) {
    if (e instanceof ApiError && e.isSessionExpired && before?.kind !== "agent" && currentSession() === null) {
      return authed<T>(path, options);
    }
    throw e;
  }
}

/**
 * For calls on the booking in state: uses the existing session only. If it is missing or idle-expired, the held
 * seats and the draft are already gone on the server, so fail with the session-expired error instead of silently
 * starting a new, empty session.
 */
export async function bookingCall<T>(path: string, options: Omit<RequestOptions, "token"> = {}): Promise<T> {
  const s = currentSession();
  if (!s || Date.now() - s.lastActivity > s.idleMinutes * 60_000) {
    sessionStore.set({ session: null });
    throw new ApiError(401, "core:Unauthorized", "Session ended.");
  }
  return callWith<T>(s, path, options);
}
