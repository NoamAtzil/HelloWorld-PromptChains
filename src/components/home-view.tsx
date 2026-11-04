import Link from "next/link";
import { StoryScene } from "@/components/story-scene";
import { ChainCard, type ChainCardData } from "@/components/chain-card";
import { Icon } from "@/components/icons";
import { LocalTime } from "@/components/local-time";
import { EmptyState, Notice, Thumb } from "@/components/ui";

export type FreshRun = { id: number; created_at: string; final_output: string | null; imageUrl: string | undefined };

export type HomeViewProps = {
  deleted?: string;
  cards: ChainCardData[];
  stats: { chains: number; steps: number; captions: number; rate: number | null };
  fresh: FreshRun[];
  hero: { imageUrl: string | undefined; caption: string | null } | null;
};

// Presentational: all data is prepared by the page (or a preview harness).
export function HomeView({ deleted, cards, stats, fresh, hero }: HomeViewProps) {
  const rows = cards;
  const succeeded = { length: stats.captions };
  const rate = stats.rate;
  return (
    <>
      {deleted !== undefined && (
        <Notice tone="ok">
          Chain deleted. {Number(deleted) > 0 ? `${deleted} result${deleted === "1" ? "" : "s"} and their photos were kept in your Gallery and History.` : "It had no results."}
        </Notice>
      )}

      <section className="stage" aria-labelledby="hero-title">
        <div className="stage-beam" aria-hidden="true" />
        <div className="relative grid items-center gap-4 p-6 sm:p-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-6 lg:p-12 lg:pr-8">
          <div className="relative z-10 flex flex-col items-start gap-6">
            <p className="eyebrow liquid inline-flex items-center gap-2 rounded-full px-3.5 py-1.5">
              <Icon name="spark" className="h-3.5 w-3.5" /> Prompt chain studio
            </p>
            <h1 id="hero-title" className="text-balance text-[2.6rem] leading-[1.02] sm:text-6xl lg:text-[4rem]">
              Turn any photo into a caption <em className="font-semibold italic text-accent-text">worth sharing.</em>
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-ink-2">
              Build a chain of small creative steps, run it on a photo, and watch a first impression become a finished line, one idea at a time.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/chains/new" className="btn-primary btn-lg">
                <Icon name="plus" className="h-[1.1rem] w-[1.1rem]" strokeWidth={2.2} /> Create a chain
              </Link>
              {succeeded.length > 0 && (
                <Link href="/media" className="btn-quiet btn-lg">
                  <Icon name="gallery" className="h-[1.1rem] w-[1.1rem]" /> See the gallery
                </Link>
              )}
            </div>
            <dl className="liquid liquid-strong mt-1 flex flex-wrap gap-x-7 gap-y-2 rounded-2xl px-5 py-3.5">
              {[
                { n: stats.chains, l: stats.chains === 1 ? "chain" : "chains" },
                { n: stats.steps, l: stats.steps === 1 ? "step" : "steps" },
                { n: stats.captions, l: stats.captions === 1 ? "caption made" : "captions made" },
                ...(rate !== null ? [{ n: `${rate}%`, l: "run success" }] : []),
              ].map((s) => (
                <div key={s.l} className="flex flex-row-reverse items-baseline justify-end gap-2">
                  <dt className="text-sm text-muted">{s.l}</dt>
                  <dd className="display text-3xl tabular-nums">{s.n}</dd>
                </div>
              ))}
            </dl>
          </div>
          <StoryScene photoUrl={hero?.imageUrl} caption={hero?.caption} />
        </div>
      </section>

      <section aria-labelledby="chains-title" className="reveal flex flex-col gap-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Your recipes</p>
            <h2 id="chains-title" className="mt-1 text-3xl">Chains</h2>
          </div>
          {rows.length > 0 && (
            <Link href="/chains/new" className="btn-ghost btn-sm">
              <Icon name="plus" /> New chain
            </Link>
          )}
        </div>
        {rows.length === 0 ? (
          <EmptyState
            title="Your first chain starts here"
            action={
              <Link href="/chains/new" className="btn-primary">
                <Icon name="plus" strokeWidth={2.2} /> Create a chain
              </Link>
            }
          >
            A chain is a short recipe: look at the photo, find the funny, polish the line. Create one and run it in under a minute.
          </EmptyState>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((chain, i) => (
              <ChainCard key={chain.id} chain={chain} index={i} />
            ))}
            <li className="rise" style={{ "--i": cards.length } as React.CSSProperties}>
              <Link href="/chains/new" className="group flex h-full min-h-[16rem] flex-col items-center justify-center gap-3 rounded-[1.25rem] border-2 border-dashed border-line-strong p-6 text-center transition-colors hover:border-accent hover:bg-tint/50">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-tint text-accent-text transition-transform group-hover:scale-110"><Icon name="plus" className="h-5 w-5" strokeWidth={2.2} /></span>
                <span className="display text-lg">Start a new chain</span>
                <span className="max-w-[14rem] text-xs text-muted">Pick a voice, add a few steps, and run it on a photo.</span>
              </Link>
            </li>
          </ul>
        )}
      </section>

      {fresh.length > 0 && (
        <section aria-labelledby="fresh-title" className="reveal flex flex-col gap-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Just made</p>
              <h2 id="fresh-title" className="mt-1 text-3xl">Fresh from the studio</h2>
            </div>
            <Link href="/media" className="group inline-flex items-center gap-1.5 text-sm font-semibold text-accent-text">
              Open the gallery <Icon name="arrow" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {fresh.map((run, i) => (
              <li key={run.id} className="rise" style={{ "--i": i } as React.CSSProperties}>
                <Link href={`/runs/${run.id}`} className="panel lift group block overflow-hidden">
                  <div className="overflow-hidden"><Thumb src={run.imageUrl} alt="" className="aspect-[4/5] w-full transition-transform duration-700 group-hover:scale-105" /></div>
                  <div className="p-3.5">
                    <p className="caption-text line-clamp-2 text-[0.95rem]">{run.final_output}</p>
                    <p className="mt-1.5 text-xs text-muted"><LocalTime iso={run.created_at} /></p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
