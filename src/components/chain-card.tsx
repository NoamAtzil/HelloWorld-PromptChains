import Link from "next/link";
import { Icon } from "./icons";
import { LocalTime } from "./local-time";
import { coverGradient } from "@/lib/voice-theme";
import { voiceLabel } from "@/lib/voices";

export type ChainCardData = {
  id: number;
  name: string;
  description: string | null;
  voice_id: string | null;
  is_active: boolean;
  steps: number;
  runs: number;
  lastRun: string | null;
  latest: { url: string | undefined; caption: string } | null;
};

// A chain with personality: its voice colors the cover, and the cover shows
// the latest thing it made, so you recognise a chain by its work.
export function ChainCard({ chain, index = 0 }: { chain: ChainCardData; index?: number }) {
  const dots = Math.min(Math.max(chain.steps, 1), 6);
  return (
    <li className="rise" style={{ "--i": index } as React.CSSProperties}>
      <Link href={`/chains/${chain.id}`} className="panel lift group flex h-full flex-col overflow-hidden">
        <div className="relative aspect-[16/10] overflow-hidden" style={{ background: coverGradient(chain.voice_id) }}>
          {chain.latest?.url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={chain.latest.url} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <p className="caption-text absolute inset-x-4 bottom-3.5 line-clamp-2 text-[1.05rem] text-white [text-shadow:0_1px_8px_rgb(0_0_0/0.45)]">{chain.latest.caption}</p>
            </>
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              <div className="flex items-center" aria-hidden="true">
                {Array.from({ length: dots }, (_, n) => (
                  <span key={n} className="flex items-center">
                    {n > 0 && <span className="h-0.5 w-6 bg-white/55 sm:w-8" />}
                    <span className={`grid h-7 w-7 place-items-center rounded-full ${n === dots - 1 ? "bg-white text-accent-text" : "bg-white/30 text-white ring-1 ring-white/50"} shadow-sm`}>
                      {n === dots - 1 ? <Icon name="quote" className="h-3.5 w-3.5" /> : <Icon name={n === 0 ? "photo" : "spark"} className="h-3.5 w-3.5" />}
                    </span>
                  </span>
                ))}
              </div>
              <span className="absolute -right-4 -top-4 h-28 w-28 rounded-full bg-white/15" aria-hidden="true" />
              <span className="absolute -bottom-8 -left-6 h-32 w-32 rounded-full bg-black/10" aria-hidden="true" />
            </div>
          )}
          <span className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-[0.68rem] font-semibold text-white backdrop-blur ${chain.is_active ? "" : "opacity-80"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${chain.is_active ? "bg-[#7ee2a0]" : "bg-white/60"}`} />
            {chain.is_active ? "Active" : "Inactive"}
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-2 p-5">
          <h3 className="text-xl leading-snug">{chain.name}</h3>
          <p className="line-clamp-2 min-h-[2.6rem] text-sm leading-relaxed text-muted">{chain.description || "No description yet. Open the builder to shape this chain."}</p>
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-3 text-xs text-muted">
            <span className="font-medium text-ink-2">{chain.steps} step{chain.steps === 1 ? "" : "s"}</span>
            {voiceLabel(chain.voice_id) && <span className="chip">{voiceLabel(chain.voice_id)}</span>}
            <span className="ml-auto flex items-center gap-1 font-semibold text-accent-text">
              Open <Icon name="arrow" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </span>
            <span className="w-full text-[0.7rem]">
              {chain.runs > 0 && chain.lastRun ? (
                <>
                  {chain.runs} run{chain.runs === 1 ? "" : "s"} · last <LocalTime iso={chain.lastRun} />
                </>
              ) : (
                "Never run"
              )}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
