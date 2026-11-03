import { Icon } from "./icons";

// A warm little sunset used wherever there is no real photo yet.
function Scene() {
  return (
    <svg viewBox="0 0 160 200" className="h-full w-full" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Illustration of a sunset over hills">
      <defs>
        <linearGradient id="scene-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd9ad" />
          <stop offset=".55" stopColor="#ffb070" />
          <stop offset="1" stopColor="#ff8a4c" />
        </linearGradient>
      </defs>
      <rect width="160" height="200" fill="url(#scene-sky)" />
      <circle cx="112" cy="72" r="27" fill="#fff3d6" opacity=".95" />
      <path d="M0 150Q40 108 82 140T160 128V200H0Z" fill="#c2560f" opacity=".85" />
      <path d="M0 176Q52 140 102 166T160 160V200H0Z" fill="#8f3a0a" />
      <path d="M28 58q6-8 12 0 6-8 12 0M58 36q4-6 8 0 4-6 8 0" stroke="#7a3208" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// The homepage centerpiece: a photo, two ideas, a finished caption, joined by
// a thread. Shows the latest real result when there is one.
export function HeroArt({ photoUrl, caption }: { photoUrl?: string | null; caption?: string | null }) {
  return (
    <div className="relative mx-auto aspect-[5/4] w-full max-w-[34rem] select-none" aria-hidden="true">
      <div className="absolute inset-[-6%] bg-[radial-gradient(closest-side,var(--tint-2),transparent)] opacity-80" />
      <svg viewBox="0 0 500 400" className="absolute inset-0 h-full w-full" fill="none">
        <path className="draw" d="M262 150C340 150 336 96 396 84" stroke="var(--glow)" strokeWidth="2.5" strokeLinecap="round" opacity=".85" />
        <path className="draw" d="M236 250C318 262 292 304 336 326" stroke="var(--glow)" strokeWidth="2.5" strokeLinecap="round" opacity=".85" />
        <circle cx="396" cy="84" r="5" fill="var(--glow)" />
        <circle cx="336" cy="326" r="5" fill="var(--glow)" />
      </svg>

      <div className="float absolute left-[2%] top-[3%] w-[48%] rounded-2xl bg-[#fffdf8] p-2.5 pb-9 shadow-[var(--shadow-lg)] ring-1 ring-black/5" style={{ "--r": "-5deg" } as React.CSSProperties}>
        <div className="aspect-[4/5] overflow-hidden rounded-lg bg-tint">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Scene />
          )}
        </div>
        <p className="absolute inset-x-0 bottom-2.5 text-center text-[0.62rem] font-bold tracking-[0.22em] text-[#8a7b6c]">YOUR PHOTO</p>
      </div>

      <div className="float-slow absolute right-[1%] top-[3%] flex items-center gap-2 rounded-full bg-surface-solid px-3.5 py-2 text-xs font-semibold shadow-[var(--shadow)] ring-1 ring-line" style={{ "--r": "3deg" } as React.CSSProperties}>
        <span className="grid h-6 w-6 place-items-center rounded-full bg-tint text-accent-text"><Icon name="spark" className="h-3.5 w-3.5" /></span>
        Spot the funny
      </div>
      <div className="float absolute right-[10%] top-[40%] flex items-center gap-2 rounded-full bg-surface-solid px-3.5 py-2 text-xs font-semibold shadow-[var(--shadow)] ring-1 ring-line" style={{ "--r": "-2deg" } as React.CSSProperties}>
        <span className="grid h-6 w-6 place-items-center rounded-full bg-tint text-accent-text"><Icon name="wand" className="h-3.5 w-3.5" /></span>
        Sharpen it
      </div>

      <div className="float-slow absolute -bottom-[3%] right-[-1%] w-[58%] rounded-2xl bg-plate p-4 shadow-[var(--shadow-lg)] ring-1 ring-line" style={{ "--r": "2deg" } as React.CSSProperties}>
        <p className="eyebrow flex items-center gap-1.5"><Icon name="quote" className="h-3.5 w-3.5" /> Final caption</p>
        <p className="caption-text mt-1.5 line-clamp-3 text-[1.02rem] sm:text-lg">{caption || "Caught between a nap and a masterpiece."}</p>
      </div>
    </div>
  );
}

// A quieter version for empty states.
export function EmptyArt() {
  return (
    <div className="relative mx-auto h-32 w-44" aria-hidden="true">
      <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-tint to-tint-2/40" />
      <div className="float absolute left-3 top-3 w-[46%] rounded-lg bg-[#fffdf8] p-1.5 pb-4 shadow-[var(--shadow)] ring-1 ring-black/5" style={{ "--r": "-6deg" } as React.CSSProperties}>
        <div className="aspect-square overflow-hidden rounded bg-tint"><Scene /></div>
      </div>
      <div className="float-slow absolute bottom-3 right-3 w-[52%] rounded-lg bg-plate p-2 shadow-[var(--shadow)] ring-1 ring-line" style={{ "--r": "4deg" } as React.CSSProperties}>
        <span className="block h-1.5 w-full rounded-full bg-glow/50" />
        <span className="mt-1.5 block h-1.5 w-2/3 rounded-full bg-glow/30" />
      </div>
      <span className="absolute right-4 top-3 text-glow"><Icon name="spark" className="h-5 w-5" /></span>
    </div>
  );
}
