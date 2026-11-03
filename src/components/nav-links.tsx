"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

const LINKS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: "/", label: "Chains", icon: "chain", match: (p) => p === "/" || p.startsWith("/chains") },
  { href: "/media", label: "Gallery", icon: "gallery", match: (p) => p.startsWith("/media") },
  { href: "/history", label: "History", icon: "history", match: (p) => p.startsWith("/history") || p.startsWith("/runs") },
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
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
              active ? "bg-tint font-semibold text-accent-text shadow-[inset_0_0_0_1px_var(--line)]" : "font-medium text-muted hover:bg-tint/60 hover:text-ink"
            }`}
          >
            <Icon name={link.icon} className="h-4 w-4" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
