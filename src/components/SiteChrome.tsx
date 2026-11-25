"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { flowStore } from "@/lib/flow";
import { endSession, useSession } from "@/lib/session";

const NAV = [
  { href: "/", label: "Book a flight" },
  { href: "/manage", label: "My booking" },
  { href: "/agent", label: "Agent desk" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const session = useSession();
  const router = useRouter();

  const signOut = async () => {
    await endSession();
    flowStore.reset();
    router.push("/agent");
  };

  return (
    <header className="site-header">
      <div className="wrap">
        <Link href="/" className="brand" aria-label="Demo Air home">
          <span className="brand-mark" aria-hidden="true">XX</span>
          Demo Air
        </Link>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" || pathname.startsWith("/flights") || pathname.startsWith("/book") : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        {session?.kind === "agent" && (
          <span className="agent-badge">
            Agent {session.user}
            <button type="button" onClick={signOut}>
              Sign out
            </button>
          </span>
        )}
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <span>Demo Air (XX) is a simulated airline running on the Pss booking engine. No real tickets are sold.</span>
        <span>Fares in US dollars, including taxes and fees.</span>
      </div>
    </footer>
  );
}
