"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState, ErrorAlert, Loading } from "@/components/Feedback";
import { FlowHeader } from "@/components/FlowHeader";
import { BookingSummary } from "@/components/Summary";
import { ApiError } from "@/lib/api";
import { patchFlow, useFlow } from "@/lib/flow";
import { paxTypeLabel } from "@/lib/format";
import { getBooking, putPrimaryContact, updatePassenger, type ContactInput, type PassengerInput } from "@/lib/pss";
import { useRefData } from "@/lib/refdata";
import { useHydrated } from "@/lib/store";
import type { Booking } from "@/lib/types";

interface DetailsForm {
  pax: Record<string, PassengerInput>;
  contact: ContactInput;
}

const NAME_RE = /^[\p{L}][\p{L}\p{M} '\-]*$/u;

function emptyPassenger(booking: Booking, key: string): PassengerInput {
  const p = booking.passengers[key];
  return {
    title: p?.name?.title ?? "",
    first: p?.name?.first ?? "",
    last: p?.name?.last ?? "",
    gender: p?.info?.gender === 2 ? "Female" : "Male",
    dateOfBirth: p?.info?.dateOfBirth ? p.info.dateOfBirth.slice(0, 10) : "",
    nationality: p?.info?.nationality ?? "LK",
  };
}

function ageOn(dob: string, onDate: string): number {
  const [by, bm, bd] = dob.split("-").map(Number);
  const [y, m, d] = onDate.slice(0, 10).split("-").map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age--;
  return age;
}

type Errors = Record<string, string>;

function validate(form: DetailsForm, booking: Booking): Errors {
  const errs: Errors = {};
  const firstFlight = booking.journeys[0]?.designator.departure ?? new Date().toISOString();
  for (const [key, p] of Object.entries(form.pax)) {
    const type = booking.passengers[key]?.passengerTypeCode ?? "ADT";
    for (const part of ["first", "last"] as const) {
      const v = p[part].trim();
      if (!v) errs[`${key}.${part}`] = `Enter the ${part} name as it appears on the passport.`;
      else if (v.length > 32) errs[`${key}.${part}`] = "Use 32 characters or fewer.";
      else if (!NAME_RE.test(v)) errs[`${key}.${part}`] = "Use letters, spaces, hyphens and apostrophes only.";
    }
    if (!p.dateOfBirth) errs[`${key}.dob`] = "Enter the date of birth.";
    else {
      const age = ageOn(p.dateOfBirth, firstFlight);
      if (type === "ADT" && age < 12) errs[`${key}.dob`] = "Adults must be 12 or older on the day of travel.";
      if (type === "CHD" && (age < 2 || age > 11)) errs[`${key}.dob`] = "Children must be 2 to 11 years old on the day of travel.";
    }
  }
  const c = form.contact;
  if (!c.first.trim()) errs["contact.first"] = "Enter a first name.";
  if (!c.last.trim()) errs["contact.last"] = "Enter a last name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) errs["contact.email"] = "Enter an email address like name@example.com.";
  if (c.phone.trim() && !/^\+?[0-9 ()-]{6,20}$/.test(c.phone.trim())) errs["contact.phone"] = "Use digits, spaces and an optional leading +.";
  return errs;
}

export default function PassengersPage() {
  const hydrated = useHydrated();
  const flow = useFlow();
  if (!hydrated) return <Loading>Loading your booking…</Loading>;
  if (!flow.booking) {
    return (
      <div className="wrap" style={{ padding: "40px 0" }}>
        <EmptyState title="No booking in progress" body="Search for flights and choose your fares first. Seats are held once you continue from the flights page." />
      </div>
    );
  }
  return <PassengersForm booking={flow.booking} saved={flow.details as DetailsForm | null} />;
}

function PassengersForm({ booking, saved }: { booking: Booking; saved: DetailsForm | null }) {
  const flow = useFlow();
  const router = useRouter();
  const ref = useRefData();
  const keys = Object.keys(booking.passengers);

  const [form, setForm] = useState<DetailsForm>(() => {
    const pax: Record<string, PassengerInput> = {};
    for (const k of keys) pax[k] = saved?.pax?.[k] ?? emptyPassenger(booking, k);
    const p = booking.contacts?.P;
    return {
      pax,
      contact: saved?.contact ?? {
        first: p?.name?.first ?? "",
        last: p?.name?.last ?? "",
        email: p?.emailAddress ?? "",
        phone: p?.phoneNumbers?.[0]?.number ?? "",
        sendItinerary: true,
      },
    };
  });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<unknown>(null);

  const setPax = (key: string, patch: Partial<PassengerInput>) =>
    setForm((f) => ({ ...f, pax: { ...f.pax, [key]: { ...f.pax[key], ...patch } } }));
  const setContact = (patch: Partial<ContactInput>) => setForm((f) => ({ ...f, contact: { ...f.contact, ...patch } }));

  const copyFirstAdult = () => {
    const firstAdult = keys.find((k) => booking.passengers[k].passengerTypeCode === "ADT") ?? keys[0];
    const p = form.pax[firstAdult];
    setContact({ first: p.first, last: p.last });
  };

  const counters: Record<string, number> = {};
  const labelFor = (key: string) => {
    const type = booking.passengers[key].passengerTypeCode;
    counters[type] = (counters[type] ?? 0) + 1;
    return `${paxTypeLabel(type)} ${counters[type]}`;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate(form, booking);
    setErrors(errs);
    if (Object.keys(errs).length) {
      const first = Object.keys(errs)[0];
      document.getElementById(`f-${first}`)?.focus();
      return;
    }
    setBusy(true);
    setApiError(null);
    try {
      // the engine runs one stateful call per session at a time, so send them one by one
      for (const k of keys) await updatePassenger(k, form.pax[k]);
      await putPrimaryContact(form.contact);
      const fresh = await getBooking();
      patchFlow({ booking: fresh, details: form as unknown as Record<string, unknown> });
      router.push("/book/payment");
    } catch (err) {
      setApiError(err);
      setBusy(false);
    }
  };

  const sessionLost = apiError instanceof ApiError && (apiError.isSessionExpired || apiError.code === "nsk:Booking:NoBookingInState");
  const titles = ref.titles;

  return (
    <>
      <FlowHeader criteria={flow.criteria} step="Travellers" showHoldTimer />
      <div className="wrap">
        <form className="flow-body" onSubmit={submit} noValidate>
          <div>
            <section className="panel" aria-labelledby="pax-h">
              <div className="panel-head">
                <h2 id="pax-h">Who's travelling</h2>
                <p>Names must match each traveller's passport.</p>
              </div>
              {keys.map((k) => {
                const p = form.pax[k];
                const label = labelFor(k);
                const err = (f: string) => errors[`${k}.${f}`];
                return (
                  <fieldset key={k} className="pax-card" style={{ border: 0, padding: 0, margin: 0 }}>
                    <legend className="visually-hidden">{label}</legend>
                    <h3 aria-hidden="true">
                      {label}
                      <small>{booking.passengers[k].passengerTypeCode === "CHD" ? "2 to 11 years on the day of travel" : "12 years or older"}</small>
                    </h3>
                    <div className="grid-4">
                      <label className="field">
                        <span>Title</span>
                        <select className="select" value={p.title} onChange={(e) => setPax(k, { title: e.target.value })}>
                          <option value="">None</option>
                          {titles.map((t) => (
                            <option key={t.code} value={t.code}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <TextField id={`f-${k}.first`} label="First name" value={p.first} error={err("first")} onChange={(v) => setPax(k, { first: v })} autoComplete="given-name" />
                      <TextField id={`f-${k}.last`} label="Last name" value={p.last} error={err("last")} onChange={(v) => setPax(k, { last: v })} autoComplete="family-name" />
                      <TextField id={`f-${k}.dob`} label="Date of birth" type="date" value={p.dateOfBirth} error={err("dob")} onChange={(v) => setPax(k, { dateOfBirth: v })} />
                    </div>
                    <div className="grid-2" style={{ marginTop: 16 }}>
                      <div className="field">
                        <span id={`g-${k}`}>Gender</span>
                        <div className="seg-toggle" role="radiogroup" aria-labelledby={`g-${k}`}>
                          {(["Male", "Female"] as const).map((g) => (
                            <label key={g}>
                              <input type="radio" name={`gender-${k}`} checked={p.gender === g} onChange={() => setPax(k, { gender: g })} />
                              <span>{g}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <label className="field">
                        <span>Nationality</span>
                        <select className="select" value={p.nationality} onChange={(e) => setPax(k, { nationality: e.target.value })}>
                          {(ref.countries.length ? ref.countries : [{ countryCode: "LK", name: "Sri Lanka", inActive: false }]).map((c) => (
                            <option key={c.countryCode} value={c.countryCode}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </fieldset>
                );
              })}
            </section>

            <section className="panel" aria-labelledby="contact-h">
              <div className="panel-head">
                <h2 id="contact-h">Contact details</h2>
                <button type="button" className="btn btn-ghost" onClick={copyFirstAdult}>
                  Use first adult's name
                </button>
              </div>
              <div className="grid-2">
                <TextField id="f-contact.first" label="First name" value={form.contact.first} error={errors["contact.first"]} onChange={(v) => setContact({ first: v })} autoComplete="given-name" />
                <TextField id="f-contact.last" label="Last name" value={form.contact.last} error={errors["contact.last"]} onChange={(v) => setContact({ last: v })} autoComplete="family-name" />
                <TextField id="f-contact.email" label="Email" type="email" value={form.contact.email} error={errors["contact.email"]} onChange={(v) => setContact({ email: v })} autoComplete="email" />
                <TextField id="f-contact.phone" label="Mobile number (optional)" type="tel" value={form.contact.phone} error={errors["contact.phone"]} onChange={(v) => setContact({ phone: v })} autoComplete="tel" placeholder="+94 77 000 0000" />
              </div>
              <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16 }}>
                <input type="checkbox" checked={form.contact.sendItinerary} onChange={(e) => setContact({ sendItinerary: e.target.checked })} />
                Email me the itinerary when the booking is confirmed
              </label>
            </section>

            {apiError != null && (
              <div style={{ marginTop: 16 }}>
                <ErrorAlert
                  error={apiError}
                  action={
                    sessionLost ? (
                      <Link className="btn btn-ghost" href="/">
                        Search again
                      </Link>
                    ) : undefined
                  }
                />
              </div>
            )}

            <div className="row-between">
              <Link href={flow.criteria ? `/flights?${new URLSearchParams({ from: flow.criteria.origin, to: flow.criteria.destination, depart: flow.criteria.departDate, adt: String(flow.criteria.pax.ADT), chd: String(flow.criteria.pax.CHD), ...(flow.criteria.returnDate ? { return: flow.criteria.returnDate } : {}) })}` : "/"}>
                Back to flights
              </Link>
              <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
                {busy ? "Saving…" : "Continue to payment"}
              </button>
            </div>
          </div>

          <BookingSummary booking={booking} />
        </form>
      </div>
    </>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  type = "text",
  autoComplete,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        autoComplete={autoComplete}
        placeholder={placeholder}
      />
      {error && (
        <span id={`${id}-err`} className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}
