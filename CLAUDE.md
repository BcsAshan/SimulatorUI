# CLAUDE.md — AI reference for SimulatorUI (Demo Air website)

Next.js (App Router, TypeScript, plain CSS) front end for the Pss engine in `../Airline-Simulator`.
Read `../Airline-Simulator/CLAUDE.md` and `../Airline-Simulator/docs/API_REFERENCE.md` before touching anything that
calls the API — the engine contract is the source of truth; `src/lib/types.ts` only mirrors the fields the UI reads.

## Status (last updated 2026-11-25)

| Area | State |
|---|---|
| Customer flow: search → fares → travellers → pay / hold → confirmation | ✅ written |
| Manage booking (reference + last name, pay held balance with PUT commit) | ✅ written |
| Agent desk (login, stateless lookup, load into state, cash/card payment) | ✅ written |
| `npm install` / `next build` | ⬜ **not run yet** — the authoring sandbox had no npm registry. Code was type-checked with hand-written stubs for react/next (no errors) and reviewed by an independent agent against the C# handlers; 4 defects found and fixed (see below) |
| End-to-end run against the Docker engine | ⬜ pending |

### Review fixes already applied (don't reintroduce)

| Issue | Fix |
|---|---|
| A declined card does **not** fail commit when the booking can be held — the engine saves it as Hold (status 1) with the payment Declined (4) | `payAndCommit` checks `balanceDue` after commit and throws `ui:DeclinedButHeld`; retry re-commits with `PUT` |
| A failed commit leaves the card payment on the draft as Received (1); the engine counts it as paid, so `balanceDue` became 0 and the pay button was disabled | `amountToPay()` = `balanceDue` + payments with status 0/1; `payAndCommit` deletes those before paying or holding |
| `bookingCall` went through `ensureSession`, whose idle threshold is 15 s shorter → could silently start a new empty session | `bookingCall` uses the existing session's token directly (`callWith`) |
| Charge type 19 (FareSurcharge) is tax in `BookingCalculator` | `offers.ts` `isFare` = types 0, 1, 7 only |

## Conventions

- **All API calls go through `src/lib/pss.ts`** (one function per endpoint) → `session.ts` (`authed`, `authedRetry`,
  `bookingCall`) → `api.ts` (`apiRequest`). Pages never call `fetch` directly.
  - `authedRetry`: stateless calls (search, reference data); restarts an expired anonymous session once.
  - `bookingCall`: anything on the booking in state; never creates a session (a lost session = lost draft).
- **Browser path `/pss/*`** is rewritten to `PSS_GATEWAY_URL` in `next.config.ts` (baked in at build time).
- **One stateful call at a time per session** — await sequentially (passengers loop, payment steps). Parallel calls
  get 409 `core:Session:ConcurrentRequest` after 5 s.
- **State** lives in `sessionStorage` via `lib/store.ts` (`useSyncExternalStore`). Pages gate on `useHydrated()` before
  reading it, so prerendered HTML never depends on browser state. Server snapshots must be constants.
- **Dates**: station-local times (`designator.departure`) have no offset — format with `lib/format.ts` (string parts,
  UTC formatter), never `new Date(local)`. Durations use the legs' `...Utc` fields.
- **Prices**: computed from `faresAvailable[key].fares[].passengerFares[].serviceCharges` × passenger count
  (`lib/offers.ts`); after sell, only the engine's `breakdown` is shown.
- **Errors**: throw/propagate `ApiError`; show with `<ErrorAlert>`. Add customer wording for new engine codes to
  `FRIENDLY` in `api.ts`. Codes starting `ui:` are UI-generated and use their message as the title.
- **Design tokens** are CSS variables at the top of `src/app/globals.css` (ocean ink, lagoon, saffron, mist; Bricolage
  Grotesque for display, Instrument Sans for text). The search "ticket" with giant station codes is the signature
  element — keep other screens quiet. No all-caps labels, no arrow glyphs in button text.
- `lib/network.ts` duplicates presentation data from `Pss.SeedData/DemoCarrier.cs` (cities, map positions, timetable,
  test cards). Update it when the seed changes. Never hard-code prices.

## Next steps (suggested order)

1. `npm install && npm run build` on the dev machine; fix anything the real React/Next types flag. Then run the
   "Try it" table in README.md against `docker compose up` and record results here.
2. Add Playwright smoke test for the happy path (search → pay 4111… → confirmation shows a 6-character reference).
3. Follow engine Phase 2: seat map step (`booking/seatmaps`, `booking/passengers/{pk}/seats`), bags/SSRs and bundles
   on the fare cards, change/cancel in My booking, infants once `infantCount` is supported.
4. Customer login (`token/user` with domain WWW, `customer@demo.test`) once Phase 4 profile endpoints exist.
