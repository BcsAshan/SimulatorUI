// Formatting helpers. Station-local times from the engine have no offset ("2026-12-10T08:30:00"), so they are
// formatted from their parts and never converted to the browser's time zone.

const moneyFormatters = new Map<string, Intl.NumberFormat>();

export function money(amount: number, currency = "USD", exact = false): string {
  const whole = Math.abs(amount % 1) < 0.005;
  const key = `${currency}|${whole && !exact}`;
  let f = moneyFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: whole && !exact ? 0 : 2,
      maximumFractionDigits: 2,
    });
    moneyFormatters.set(key, f);
  }
  return f.format(amount);
}

function parts(local: string): { y: number; m: number; d: number; hh: number; mm: number } {
  const [date, time = "00:00"] = local.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return { y, m, d, hh: hh || 0, mm: mm || 0 };
}

export function localTime(local: string): string {
  const p = parts(local);
  return `${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}`;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const longDateFmt = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const dayNumFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function asUtcDate(local: string): Date {
  const p = parts(local);
  return new Date(Date.UTC(p.y, p.m - 1, p.d));
}

/** "Thu 10 Dec" */
export function shortDate(local: string): string {
  return dateFmt.format(asUtcDate(local));
}

/** "Thursday 10 December 2026" */
export function longDate(local: string): string {
  return longDateFmt.format(asUtcDate(local));
}

export function weekday(local: string): string {
  return dayFmt.format(asUtcDate(local));
}

export function dayMonth(local: string): string {
  return dayNumFmt.format(asUtcDate(local));
}

/** Calendar days between two station-local datetimes (for the "+1" marker). */
export function dayDiff(fromLocal: string, toLocal: string): number {
  return Math.round((asUtcDate(toLocal).getTime() - asUtcDate(fromLocal).getTime()) / 86_400_000);
}

/** "4h 30m" from two UTC instants. */
export function duration(fromUtc: string, toUtc: string): string {
  const mins = Math.max(0, Math.round((Date.parse(toUtc) - Date.parse(fromUtc)) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** Date-time in the browser zone, for UTC instants such as hold expiry. */
export function instant(utc: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(utc));
}

export function bookingStatusLabel(status: number): { label: string; tone: "confirmed" | "hold" | "other" } {
  switch (status) {
    case 2:
      return { label: "Confirmed", tone: "confirmed" };
    case 1:
      return { label: "On hold, payment due", tone: "hold" };
    case 3:
      return { label: "Closed", tone: "other" };
    case 4:
      return { label: "Hold cancelled", tone: "other" };
    default:
      return { label: "Not saved yet", tone: "other" };
  }
}

export function paymentStatusLabel(status: number): string {
  return ["New", "Received", "Pending", "Approved", "Declined", "Unknown", "Awaiting customer"][status] ?? `Status ${status}`;
}

export function genderLabel(g: number | null | undefined): string {
  return g === 1 ? "Male" : g === 2 ? "Female" : "";
}

export function paxTypeLabel(code: string): string {
  return code === "ADT" ? "Adult" : code === "CHD" ? "Child" : code === "INF" ? "Infant" : code;
}
