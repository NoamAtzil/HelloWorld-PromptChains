import Link from "next/link";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icons";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-5 py-16 text-center">
      <Brand />
      <p className="eyebrow">404</p>
      <h1 className="text-4xl">This page wandered off</h1>
      <p className="text-sm leading-relaxed text-muted">The chain, result, or page you were looking for doesn&apos;t exist, or it was deleted.</p>
      <Link href="/" className="btn-primary"><Icon name="arrow" className="rotate-180" /> Back to your chains</Link>
    </main>
  );
}
