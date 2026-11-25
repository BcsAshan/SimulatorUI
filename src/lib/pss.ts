"use client";

// One function per engine endpoint the UI uses. Paths and bodies follow Airline-Simulator/docs/API_REFERENCE.md.

import { ApiError } from "./api";
import { authed, authedRetry, bookingCall, currentSession } from "./session";
import type {
  AvailabilityResponse,
  Booking,
  CodeItem,
  Country,
  FareSelection,
  Market,
  Passenger,
  PassengerSeat,
  PaymentMethod,
  SearchCriteria,
  SeatMapAvailability,
  Station,
} from "./types";

// ---------- reference data ----------

export const getStations = () => authedRetry<Station[]>("/api/nsk/v1/resources/stations");
export const getMarkets = () => authedRetry<Market[]>("/api/nsk/v2/resources/markets");
export const getCountries = () => authedRetry<Country[]>("/api/nsk/v2/resources/countries");
export const getTitles = () => authedRetry<CodeItem[]>("/api/nsk/v1/resources/titles");

// ---------- shopping ----------

function paxTypes(c: SearchCriteria) {
  const types = [{ type: "ADT", count: c.pax.ADT }];
  if (c.pax.CHD > 0) types.push({ type: "CHD", count: c.pax.CHD });
  return types;
}

/**
 * Multi-criteria search (POST v4/availability/search): one criterion for one-way, two for a return trip.
 * `spreadDays` widens each date into a window (± days) so the results page can offer a date strip;
 * the engine allows up to 14 days per criterion.
 */
export async function searchAvailability(c: SearchCriteria, spreadDays = 3): Promise<AvailabilityResponse> {
  const window = (date: string) => {
    const begin = addDays(date, -spreadDays);
    const today = todayIso();
    return { beginDate: begin < today ? today : begin, endDate: addDays(date, spreadDays) };
  };
  const criteria = [
    {
      stations: { originStationCodes: [c.origin], destinationStationCodes: [c.destination] },
      dates: window(c.departDate),
      filters: { maxConnections: 1 },
    },
  ];
  if (c.returnDate) {
    criteria.push({
      stations: { originStationCodes: [c.destination], destinationStationCodes: [c.origin] },
      dates: window(c.returnDate),
      filters: { maxConnections: 1 },
    });
  }
  return authedRetry<AvailabilityResponse>("/api/nsk/v4/availability/search", {
    method: "POST",
    body: {
      criteria,
      passengers: { types: paxTypes(c) },
      codes: { currencyCode: "USD" },
      numberOfFaresPerJourney: 4,
      taxesAndFees: "TaxesAndFees",
    },
  });
}

// ---------- booking in state ----------

/** Drops whatever booking the session holds (uncommitted seats are released). Ignores "no booking". */
export async function resetBooking(): Promise<void> {
  if (!currentSession()) return;
  try {
    await bookingCall<null>("/api/nsk/v1/booking/reset", { method: "DELETE" });
  } catch (e) {
    if (e instanceof ApiError && (e.code === "nsk:Booking:NoBookingInState" || e.isSessionExpired)) return;
    throw e;
  }
}

export async function sellTrip(c: SearchCriteria, keys: FareSelection[]): Promise<Booking> {
  return authed<Booking>("/api/nsk/v4/trip/sell", {
    method: "POST",
    body: { keys, passengers: { types: paxTypes(c) }, currencyCode: "USD", preventOverlap: true },
  });
}

export const getBooking = () => bookingCall<Booking>("/api/nsk/v1/booking");
export const getBookingStatus = () => bookingCall<Booking>("/api/nsk/v2/booking/status");

export interface PassengerInput {
  title: string;
  first: string;
  last: string;
  gender: "Male" | "Female";
  dateOfBirth: string;
  nationality: string;
}

export function updatePassenger(passengerKey: string, p: PassengerInput) {
  return bookingCall<null>(`/api/nsk/v3/booking/passengers/${encodeURIComponent(passengerKey)}`, {
    method: "PUT",
    body: {
      name: { first: p.first.trim(), last: p.last.trim(), title: p.title || null },
      info: { nationality: p.nationality || null, residentCountry: p.nationality || null, gender: p.gender, dateOfBirth: p.dateOfBirth },
    },
  });
}

export interface ContactInput {
  first: string;
  last: string;
  email: string;
  phone: string;
  sendItinerary: boolean;
}

/** PUT contacts/P adds or replaces the primary contact, so it's safe to repeat when the user goes back. */
export function putPrimaryContact(c: ContactInput) {
  return bookingCall<null>("/api/nsk/v1/booking/contacts/P", {
    method: "PUT",
    body: {
      contactTypeCode: "P",
      name: { first: c.first.trim(), last: c.last.trim() },
      emailAddress: c.email.trim(),
      phoneNumbers: c.phone.trim() ? [{ type: "Mobile", number: c.phone.trim() }] : [],
      cultureCode: "en-US",
      distributionOption: c.sendItinerary ? "Email" : "None",
    },
  });
}

export const getPassengers = () => bookingCall<Record<string, Passenger>>("/api/nsk/v1/booking/passengers");

// ---------- seats ----------

/** Seat maps for every leg of a journey in the booking (with seat prices per passenger). */
export const getSeatMaps = (journeyKey: string) =>
  bookingCall<SeatMapAvailability[]>(`/api/nsk/v3/booking/seatmaps/journey/${encodeURIComponent(journeyKey)}`);

/** Holds the seat for this session and adds its fee. 409 nsk:Seat:UnitNotAvailable when someone else has it. */
export const assignSeat = (passengerKey: string, unitKey: string) =>
  bookingCall<null>(`/api/nsk/v2/booking/passengers/${encodeURIComponent(passengerKey)}/seats/${encodeURIComponent(unitKey)}`, {
    method: "POST",
    body: {},
  });

export const removeSeat = (passengerKey: string, unitKey: string) =>
  bookingCall<null>(`/api/nsk/v1/booking/passengers/${encodeURIComponent(passengerKey)}/seats/${encodeURIComponent(unitKey)}`, {
    method: "DELETE",
  });

/** Seats on the booking, keyed by legKey → passengerKey → seat. */
export function seatsByLeg(booking: Booking): Record<string, Record<string, PassengerSeat>> {
  const out: Record<string, Record<string, PassengerSeat>> = {};
  for (const j of booking.journeys)
    for (const s of j.segments)
      for (const [pk, ps] of Object.entries(s.passengerSegment ?? {}))
        for (const seat of ps.seats ?? []) {
          const leg = s.legs.find((l) => l.designator?.origin === seat.departureStation && l.designator?.destination === seat.arrivalStation);
          if (!leg) continue;
          (out[leg.legKey] ??= {})[pk] = seat;
        }
  return out;
}

// ---------- payments ----------

export const getPaymentMethods = () => bookingCall<Record<string, PaymentMethod>>("/api/nsk/v2/booking/payments/available");

export const holdAvailable = () => bookingCall<{ expiration: string } | null>("/api/nsk/v2/booking/hold/available");

export interface CardInput {
  method: string; // VI | MC
  number: string;
  expiry: string; // MM/YY or MM/YYYY
  holder: string;
  cvv: string;
}

export function addCardPayment(card: CardInput, amount: number, currencyCode: string) {
  return bookingCall<null>("/api/nsk/v6/booking/payments", {
    method: "POST",
    body: {
      paymentMethodCode: card.method,
      amount,
      currencyCode,
      installments: 1,
      paymentFields: {
        ACCTNO: card.number.replace(/\s+/g, ""),
        EXPDAT: card.expiry.trim(),
        "CC::AccountHolderName": card.holder.trim(),
        "CC::VerificationCode": card.cvv.trim(),
      },
    },
  });
}

export function addCashPayment(amount: number, currencyCode: string) {
  return bookingCall<null>("/api/nsk/v6/booking/payments", {
    method: "POST",
    body: { paymentMethodCode: "CA", amount, currencyCode },
  });
}

export const deletePayment = (paymentKey: string) =>
  bookingCall<null>(`/api/nsk/v1/booking/payments/${encodeURIComponent(paymentKey)}`, { method: "DELETE" });

/** POST v3/booking (first commit) or PUT v3/booking (re-commit a retrieved booking). */
export function commitBooking(first: boolean, receivedBy: string) {
  return bookingCall<null>("/api/nsk/v3/booking", {
    method: first ? "POST" : "PUT",
    body: first ? { receivedBy, notifyContacts: true } : { receivedBy },
  });
}

/** Payments added to the draft but not committed yet (status New/Received). The engine already counts them as paid. */
export function pendingPayments(b: Booking) {
  return b.payments.filter((p) => p.status === 0 || p.status === 1);
}

/** What the customer still has to pay, ignoring uncommitted payments left over from a failed attempt. */
export function amountToPay(b: Booking): number {
  return Math.round((b.breakdown.balanceDue + pendingPayments(b).reduce((s, p) => s + p.amounts.amount, 0)) * 100) / 100;
}

/**
 * Pay the balance and commit, in the order the engine expects:
 * 1. remove payments that were added but never committed (a previous failed attempt); declined ones stay, they
 *    don't count against the balance;
 * 2. add the new payment for exactly `balanceDue` (skipped when holding);
 * 3. commit (cards are authorised here).
 * A declined card only fails the commit when the booking can't be held. When it can, the engine saves the booking
 * on hold instead — that is reported as a decline too, so the customer pays with another card (re-commit = PUT).
 */
export async function payAndCommit(
  pay: { kind: "card"; card: CardInput } | { kind: "cash" } | { kind: "hold" },
  receivedBy: string,
): Promise<Booking> {
  let booking = await getBooking();
  const firstCommit = !booking.recordLocator;

  const stale = pendingPayments(booking);
  for (const p of stale) await deletePayment(p.paymentKey);
  if (stale.length) booking = await getBooking();

  const amount = booking.breakdown.balanceDue;
  if (pay.kind !== "hold" && amount > 0) {
    if (pay.kind === "card") await addCardPayment(pay.card, amount, booking.currencyCode);
    else await addCashPayment(amount, booking.currencyCode);
  }

  await commitBooking(firstCommit, receivedBy);
  const saved = await getBookingStatus();

  if (pay.kind !== "hold" && amount > 0 && saved.breakdown.balanceDue > 0) {
    const until = saved.hold?.expiration ? ` until ${new Date(saved.hold.expiration).toLocaleString()}` : "";
    throw new ApiError(
      400,
      "ui:DeclinedButHeld",
      `The card was declined. Your seats are on hold${until} under booking reference ${saved.recordLocator}. Pay with another card to confirm.`,
    );
  }
  return saved;
}

// ---------- retrieve ----------

/** Customer retrieve (loads into state). Any failure is the same vague nsk:Booking:GeneralRestriction. */
export function retrieveBooking(recordLocator: string, lastName: string) {
  return authed<Booking>("/api/nsk/v2/booking/retrieve", {
    query: { RecordLocator: recordLocator.trim().toUpperCase(), LastName: lastName.trim() },
  });
}

/** Agent: load into state without a name check. */
export function agentRetrieve(recordLocator: string) {
  return bookingCall<Booking>(`/api/nsk/v1/booking/retrieve/byRecordLocator/${encodeURIComponent(recordLocator.trim().toUpperCase())}`);
}

/** Agent: stateless read, does not touch the session. 404 → null. */
export async function agentLookup(recordLocator: string): Promise<Booking | null> {
  try {
    return await bookingCall<Booking>(`/api/nsk/v1/bookings/${encodeURIComponent(recordLocator.trim().toUpperCase())}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

// ---------- dates ----------

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
