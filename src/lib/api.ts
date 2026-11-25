import type { ApiErrorItem, Envelope } from "./types";

/** All calls go to /pss/* on this app; next.config.ts rewrites them to the Pss gateway. */
export const API_BASE = "/pss";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly errors: ApiErrorItem[];
  readonly correlationId: string | null;

  constructor(status: number, code: string, message: string, errors: ApiErrorItem[] = [], correlationId: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.errors = errors;
    this.correlationId = correlationId;
  }

  /** The server-side session is gone (idle 15 min, logged out, or engine restarted). */
  get isSessionExpired(): boolean {
    return this.status === 401 && (this.code === "core:Unauthorized" || this.code === "http:401");
  }
}

export interface ApiResult<T> {
  data: T;
  status: number;
  headers: Headers;
  messages: Envelope<T>["messages"];
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
  query?: Record<string, string | undefined | null>;
  signal?: AbortSignal;
}

type ActivityListener = () => void;
const activityListeners = new Set<ActivityListener>();

/** Every successful authenticated call slides the 15-minute idle timeout on the server; the UI mirrors that. */
export function onApiActivity(listener: ActivityListener): () => void {
  activityListeners.add(listener);
  return () => {
    activityListeners.delete(listener);
  };
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const { method = "GET", body, token, query, signal } = options;

  let url = `${API_BASE}${path}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v != null && v !== "") qs.set(k, v);
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      cache: "no-store",
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(0, "ui:Network", "Can't reach the booking engine. Check that the gateway is running on the configured PSS_GATEWAY_URL.");
  }

  const correlationId = res.headers.get("X-Correlation-Id");
  const text = res.status === 204 || res.status === 304 ? "" : await res.text();
  let parsed: Envelope<T> | null = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as Envelope<T>;
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    const errors = parsed?.errors ?? [];
    const first = errors[0];
    if (first) throw new ApiError(res.status, first.code, first.message, errors, correlationId);
    throw new ApiError(res.status, `http:${res.status}`, fallbackMessage(res.status), [], correlationId);
  }

  if (token) activityListeners.forEach((l) => l());

  return {
    data: (parsed?.data ?? null) as T,
    status: res.status,
    headers: res.headers,
    messages: parsed?.messages,
  };
}

function fallbackMessage(status: number): string {
  switch (status) {
    case 401:
      return "Your session has ended.";
    case 404:
      return "Not found.";
    case 409:
      return "Another request is still running on this session. Try again in a moment.";
    case 429:
      return "Too many requests in a short time. Wait a minute and try again.";
    case 502:
    case 503:
    case 504:
      return "A booking engine service is not reachable. Check `docker compose ps` in Airline-Simulator.";
    default:
      return `The booking engine returned HTTP ${status}.`;
  }
}

/** Human wording for the engine's error codes, keyed by code. Falls back to the server message. */
const FRIENDLY: Record<string, string> = {
  "core:Unauthorized": "Your session timed out after 15 minutes without activity, so the held seats were released. Search again to start over.",
  "core:Session:ConcurrentRequest": "Another request is still running. Wait a moment and try again.",
  "nsk:Exceptions:InvalidKey": "These fares have expired (offers last 30 minutes). Search again to see current prices.",
  "nsk:Availability:ClassNotAvailable": "Those seats were just taken. Search again to see what's still available.",
  "nsk:Booking:NoBookingInState": "There's no booking in progress. Start with a flight search.",
  "nsk:Booking:GeneralRestriction": "We couldn't find a booking with that reference and name. Check both and try again.",
  "nsk:Authentication:InvalidCredentials": "That username or password isn't right.",
  "nsk:Authorization:AgentOnly": "Only agents can do this. Sign in on the Agent page first.",
  "nsk:Payment:Declined": "The card was declined. Use a different card to finish the booking.",
  "nsk:Payment:InvalidAccountNumber": "That card number isn't valid. Check the digits.",
  "nsk:Payment:CardExpired": "That card has expired or the expiry date can't be read.",
  "nsk:Passenger:InvalidDateOfBirth": "A date of birth doesn't match the passenger type on the travel date (adults 12+, children 2–11).",
  "nsk:Booking:BalanceDueNotAllowed": "This booking needs full payment now. Holding is only possible when the first flight is at least 72 hours away.",
  "nsk:Booking:MissingPrimaryContact": "Add a contact name or email before paying.",
  "nsk:Booking:ModifiedByAnotherSession": "Someone else changed this booking. Retrieve it again and redo your change.",
  "nsk-server:InvalidDateRange": "Pick a date range of 14 days or less.",
  "nsk:Booking:InvalidStationCode": "Pick two different airports.",
  "nsk:Seat:UnitNotAvailable": "That seat is no longer available because someone else has it. Pick another seat.",
  "nsk:Seat:CabinMismatch": "That seat is in a different cabin from your fare.",
  "nsk:Seat:PassengerRestricted": "Children can't sit in an emergency exit row. Pick another seat for this traveller.",
  "nsk:Seat:UnitNotAssignable": "That seat can't be booked.",
};

export function friendlyError(e: unknown): { title: string; detail: string; code?: string } {
  if (e instanceof ApiError) {
    const nice = FRIENDLY[e.code];
    return {
      title: nice ?? e.message,
      detail: nice && e.message && e.message !== nice ? e.message : "",
      code: e.code.startsWith("http:") || e.code.startsWith("ui:") ? undefined : e.code,
    };
  }
  if (e instanceof Error) return { title: e.message, detail: "" };
  return { title: "Something went wrong.", detail: "" };
}
