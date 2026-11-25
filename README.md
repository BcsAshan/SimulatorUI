# Demo Air — booking website (SimulatorUI)

A Next.js front end for the **Pss** airline engine in `../Airline-Simulator`. Customers search flights, choose fares,
enter traveller details, pay by card (or hold the booking) and manage their booking. Agents sign in, look up any
booking and take cash payments.

| Page | What it does | Engine endpoints |
|---|---|---|
| `/` | Search: return or one way, route, dates, adults and children | `resources/stations`, `v2/resources/markets` |
| `/flights` | Results with a date strip (±3 days), journeys, four fares per flight (Saver, Standard, Flex, Business) | `v4/availability/search`, then `v1/booking/reset` + `v4/trip/sell` |
| `/book/passengers` | Traveller names, dates of birth, nationality; primary contact | `PUT v3/booking/passengers/{key}`, `PUT v1/booking/contacts/P`, `GET v1/booking` |
| `/book/seats` | Seat map per flight: pick a seat for each traveller (prices per seat group), change or remove it; optional step | `v3/booking/seatmaps/journey/{key}`, `POST/DELETE v2/booking/passengers/{pk}/seats/{unitKey}` |
| `/book/payment` | Card form (Visa/MasterCard, cash for agents), "hold and pay later" when allowed | `v2/booking/payments/available`, `v2/booking/hold/available`, `v6/booking/payments`, `POST v3/booking`, `v2/booking/status` |
| `/book/confirmation` | Booking reference, status, itinerary | – (from the commit result) |
| `/manage` | Find a booking by reference and last name; pay a booking on hold; change seats (pay the difference, then save) | `v2/booking/retrieve`, payments, `PUT v3/booking` |
| `/agent` | Agent sign-in, look up by reference (no name check), take payment | `token/user`, `v1/bookings/{rl}`, `v1/booking/retrieve/byRecordLocator/{rl}` |

## Run it

1. Start the engine (from `../Airline-Simulator`): `docker compose up --build`. The gateway listens on `http://localhost:5000`.
2. In this folder:

   ```bash
   npm install
   npm run dev
   ```

3. Open http://localhost:3000.

Needs Node 20.9 or newer. The first `npm run dev`/`npm run build` downloads the two Google fonts (Bricolage Grotesque
and Instrument Sans) through `next/font`, so it needs internet access once.

If the gateway is somewhere else, copy `.env.example` to `.env.local` and set `PSS_GATEWAY_URL`.

### Production build / Docker

```bash
npm run build && npm start          # uses PSS_GATEWAY_URL at build time
```

Or run it next to the engine containers. Add this service to `../Airline-Simulator/docker-compose.yml`:

```yaml
  ui:
    build:
      context: ../SimulatorUI
      args:
        PSS_GATEWAY_URL: http://gateway:8080
    ports: ["3000:3000"]
    depends_on: [gateway]
```

## Try it

| What | How |
|---|---|
| Happy path | Search CMB to DXB a few days ahead, pick a fare, fill in names, pay with `4111 1111 1111 1111`, any future expiry, any CVV |
| Declined card | Pay with `4000 0000 0000 0002`. If the first flight is more than 72 hours away the engine keeps the seats on hold, and the page asks for another card |
| Hold | Choose "Hold booking and pay later" (only shown when the first flight is at least 72 hours away), then pay it from **My booking** |
| Seats | Pick seats on the Seats step. Exit rows cost more and are adults only; Flex and Business fares get seats free |
| Seat clash | Open the same flight in two browser windows (or one normal + one private window). A seat picked in one shows as taken in the other, and clicking it there gets "That seat is no longer available" |
| Connection | Search CMB to LHR (via DXB) |
| Agent | **Agent desk**, domain `DEF`, user `agent01`, password `Password1!`. Bookings made while signed in can be paid in cash |
| Itinerary email | Mailpit at http://localhost:8025 |

The test cards are also listed under the card form ("Test cards for this demo").

## How it talks to the engine

- The browser only calls `/pss/*` on this app. `next.config.ts` rewrites that to the gateway, so there is no CORS and
  the gateway address never reaches the browser.
- **One engine session per browser tab.** The token and the booking flow are kept in `sessionStorage` (`pss.session`,
  `pss.flow`), the same lifetime as the engine's server-side session. An anonymous token is created on first use.
- The engine ends a session after **15 minutes without a request** and releases held seats. The flow pages show a
  countdown. Search and reference-data calls quietly start a new session if the old one expired; booking calls don't
  (the draft is gone), they show "Search again".
- Stateful calls are sent one at a time, because the engine allows one stateful call per session at once.
- Payment: earlier payments that were added but never committed are removed first, then one payment for exactly the
  balance due is added, then the booking is committed. Card details go straight to the engine and are never stored
  in the browser.
- Web customers are logged out (`DELETE /api/auth/v1/token`) once their booking is saved. Agents stay signed in until
  they press **Sign out**.

## Project layout

```
src/
  app/            routes (App Router): /, /flights, /book/*, /manage, /agent
  components/     SearchForm (the ticket), RouteMap, FlowHeader, Summary, PaymentPanel, Itinerary, SiteChrome
  lib/
    api.ts        fetch wrapper, envelope parsing, ApiError, friendly error texts
    session.ts    engine session (anonymous / agent), idle tracking
    pss.ts        one function per engine endpoint + payAndCommit
    offers.ts     reading availability: journeys per day, price per fare for the passenger mix
    flow.ts       booking-flow state shared between pages
    network.ts    static presentation data for carrier XX (cities, map positions, timetable, test cards)
    types.ts      TypeScript shapes of the engine contract
```

See `CLAUDE.md` for conventions and next steps.
