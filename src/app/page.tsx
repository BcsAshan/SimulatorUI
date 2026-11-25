"use client";

import { useCallback, useState } from "react";
import { ErrorAlert } from "@/components/Feedback";
import { RouteMap } from "@/components/RouteMap";
import { SearchForm } from "@/components/SearchForm";
import { CITIES, HUB_TIMETABLE } from "@/lib/network";
import { useRefData } from "@/lib/refdata";

export default function HomePage() {
  const [route, setRoute] = useState<{ o: string; d: string }>({ o: "CMB", d: "DXB" });
  const onRouteChange = useCallback((o: string, d: string) => setRoute({ o, d }), []);
  const ref = useRefData();
  const [formKey, setFormKey] = useState(0);
  const [preset, setPreset] = useState<{ origin: string; destination: string } | undefined>(undefined);

  const pick = (to: string) => {
    setPreset({ origin: "CMB", destination: to });
    setFormKey((k) => k + 1);
    document.getElementById("search")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div>
            <h1>Fly from Colombo to eight cities, non-stop or via Dubai.</h1>
            <p className="hero-lede">
              Search live seats and fares, hold your seats while you fill in the details, and pay by card. Every price includes taxes and fees.
            </p>
          </div>
          <RouteMap origin={route.o} destination={route.d} />
        </div>
      </section>

      <div className="wrap search-overlap" id="search">
        <SearchForm key={formKey} initial={preset} onRouteChange={onRouteChange} />
        {ref.error != null && (
          <div style={{ marginTop: 16 }}>
            <ErrorAlert error={ref.error} />
          </div>
        )}
      </div>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <h2>Daily departures from Colombo</h2>
            <p>Every route runs once a day. Times are local to Colombo.</p>
          </div>
          <table className="dest-table">
            <thead>
              <tr>
                <th scope="col">Destination</th>
                <th scope="col" className="hide-sm">Flight</th>
                <th scope="col">Departs</th>
                <th scope="col" className="hide-sm">Flight time</th>
                <th scope="col">
                  <span className="visually-hidden">Search</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {HUB_TIMETABLE.map((r) => (
                <tr key={r.to}>
                  <td>
                    <span className="dest-code">{r.to}</span> {CITIES[r.to]?.city}
                  </td>
                  <td className="hide-sm">{r.flights}</td>
                  <td className="num">{r.departs}</td>
                  <td className="hide-sm">{r.flightTime}</td>
                  <td style={{ textAlign: "right" }}>
                    <button type="button" onClick={() => pick(r.to)}>
                      See fares to {CITIES[r.to]?.city}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
