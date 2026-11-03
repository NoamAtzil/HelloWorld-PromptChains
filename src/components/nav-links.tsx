"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Chains", match: (p: string) => p === "/" || p.startsWith("/chains") },
  { href: "/media", label: "Media", match: (p: string) => p.startsWith("/media") },
  { href: "/history", label: "History", match: (p: string) => p.startsWith("/history") || p.startsWith("/runs") },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Sections" className="flex items-center gap-1">
      {LINKS.map((link) => {
        const active = link.match(pathname);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-xl px-3 py-1.5 text-sm transition-colors ${
              active
                ? "bg-tint font-semibold text-accent-text shadow-[inset_0_0_0_1px_rgb(255_122_26/0.28)]"
                : "font-medium text-muted hover:bg-tint/60 hover:text-ink"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
