import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HeroArt } from "@/components/art";
import { Brand } from "@/components/brand";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { Icon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function LoginPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  // Already signed in: requireAdmin() on "/" decides between the app and the
  // no-access page.
  if (data?.claims) {
    redirect("/");
  }

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-5 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
      <div className="flex flex-col items-start gap-6">
        <Brand linked={false} />
        <p className="eyebrow inline-flex items-center gap-2 rounded-full bg-tint px-3 py-1.5">
          <Icon name="spark" className="h-3.5 w-3.5" /> Prompt chain studio
        </p>
        <h1 className="text-[2.6rem] leading-[1.03] sm:text-6xl">
          Make every photo <em className="font-semibold italic text-accent-text">say something.</em>
        </h1>
        <p className="max-w-lg text-lg leading-relaxed text-ink-2">Design small creative recipes, run them on your photos, and keep a portfolio of the captions they write.</p>
        <div className="hidden w-full lg:block"><HeroArt /></div>
      </div>

      <div className="flex flex-col gap-5">
        <div className="panel mx-auto flex w-full max-w-md flex-col gap-6 !rounded-[1.75rem] p-7 !shadow-[var(--shadow-lg)] sm:p-9">
          <div>
            <h2 className="text-3xl">Welcome back</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">Sign in with Google to open the studio. Access is limited to superadministrators.</p>
          </div>
          <GoogleSignInButton />
        </div>
        <div className="flex justify-center"><ThemeToggle /></div>
      </div>
    </main>
  );
}
