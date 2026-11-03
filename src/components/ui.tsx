import Link from "next/link";

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col gap-2">
      {back && (
        <Link href={back.href} className="w-fit text-sm font-medium text-muted hover:text-accent-text">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
        </div>
        {actions}
      </div>
    </div>
  );
}

export function Notice({ tone, children }: { tone: "ok" | "warn"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "warn" ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-sm font-medium ${
        tone === "ok" ? "border-ok-text/20 bg-ok-tint text-ok-text" : "border-coral/25 bg-coral-tint text-coral-text"
      }`}
    >
      {children}
    </p>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="panel flex flex-col items-center gap-2 rounded-2xl px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-tint text-accent-text">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 7H6a3 3 0 0 0 0 6h3M15 7h3a3 3 0 0 1 0 6h-3M8 10h8M9 17H6a3 3 0 0 1 0-6M15 17h3a3 3 0 0 0 0-6" />
        </svg>
      </span>
      <p className="font-display text-lg font-semibold">{title}</p>
      {children && <p className="max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, index = 0 }: { label: string; value: string; hint?: string; index?: number }) {
  return (
    <div className="panel rise relative overflow-hidden rounded-2xl p-4" style={{ "--i": index } as React.CSSProperties}>
      <span aria-hidden="true" className="pointer-events-none absolute -left-6 -top-6 h-20 w-20 rounded-full bg-glow/20 blur-2xl" />
      <p className="relative text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="relative mt-2 text-3xl font-bold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="relative mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

// Signed storage URLs are short-lived and not optimizable by next/image.
export function Thumb({
  src,
  alt,
  className = "",
}: {
  src: string | undefined;
  alt: string;
  className?: string;
}) {
  if (!src) {
    return (
      <div className={`grid place-items-center bg-tint text-xs text-muted ${className}`} role="img" aria-label={alt}>
        Photo unavailable
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" className={`object-cover ${className}`} />;
}

export function RunStatusChip({ status }: { status: string }) {
  if (status === "succeeded") return <span className="chip chip-ok">Done</span>;
  if (status === "failed") return <span className="chip chip-bad">Failed</span>;
  return <span className="chip">Running</span>;
}
