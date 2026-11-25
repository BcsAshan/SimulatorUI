import { CITIES } from "@/lib/network";

// Schematic hub-and-spoke map of the XX network (positions from CITIES), drawn in a 560×300 box.
const W = 560;
const H = 300;

function arc(a: { x: number; y: number }, b: { x: number; y: number }) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(40, len * 0.18);
  // bend "upwards" (perpendicular, toward smaller y)
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  return `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${(mx + nx * bend).toFixed(1)},${(my + ny * bend).toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
}

const SPOKES: [string, string][] = [
  ["CMB", "DXB"], ["CMB", "SIN"], ["CMB", "BKK"], ["CMB", "MLE"],
  ["CMB", "DEL"], ["CMB", "KUL"], ["CMB", "JAF"], ["DXB", "LHR"],
];

const key = (a: string, b: string) => [a, b].sort().join("-");
const SPOKE_KEYS = new Set(SPOKES.map(([a, b]) => key(a, b)));

/** Spokes flown between origin and destination: the direct one, or both legs of a one-stop connection. */
function activePath(origin?: string, destination?: string): Set<string> {
  if (!origin || !destination || origin === destination) return new Set();
  if (SPOKE_KEYS.has(key(origin, destination))) return new Set([key(origin, destination)]);
  for (const via of Object.keys(CITIES)) {
    if (SPOKE_KEYS.has(key(origin, via)) && SPOKE_KEYS.has(key(via, destination))) {
      return new Set([key(origin, via), key(via, destination)]);
    }
  }
  return new Set();
}

export function RouteMap({ origin, destination }: { origin?: string; destination?: string }) {
  const pts = Object.fromEntries(Object.values(CITIES).map((c) => [c.code, { x: c.x, y: c.y }]));
  const activeKeys = activePath(origin, destination);
  const isActive = (a: string, b: string) => activeKeys.has(key(a, b));
  const activeNodes = new Set<string>();
  for (const [a, b] of SPOKES) {
    if (isActive(a, b)) {
      activeNodes.add(a);
      activeNodes.add(b);
    }
  }

  const label = destination && origin ? `Route map, ${origin} to ${destination} highlighted` : "Demo Air route map from Colombo";

  return (
    <svg className="route-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {SPOKES.map(([a, b]) => (
        <path key={`${a}-${b}`} d={arc(pts[a], pts[b])} className={isActive(a, b) ? "spoke spoke-active" : "spoke"} />
      ))}
      {Object.values(CITIES).map((c) => {
        const p = pts[c.code];
        const hub = c.code === "CMB";
        const on = activeNodes.has(c.code);
        return (
          <g key={c.code}>
            <circle cx={p.x} cy={p.y} r={hub ? 7 : 4.5} className={hub ? "node node-hub" : on ? "node node-active" : "node"} />
            <text x={p.x + c.label.dx} y={p.y + c.label.dy} textAnchor={c.label.anchor} className={on || hub ? "label-active" : undefined}>
              {c.code}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
