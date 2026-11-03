import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icons";
import { SignOutButton } from "@/components/sign-out-button";

// Shown to signed-in users who are not superadmins. It reveals no data.
export default async function NoAccessPage(props: PageProps<"/no-access">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) {
    redirect("/login");
  }

  const reason = (await props.searchParams).reason;
  const email = typeof claims.email === "string" ? claims.email : "this account";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
      <div className="panel flex flex-col items-center gap-5 !rounded-[1.75rem] p-8 text-center !shadow-[var(--shadow-lg)]">
        <Brand linked={false} />
        <span className="grid h-14 w-14 place-items-center rounded-full bg-tint text-accent-text"><Icon name="chain" className="h-6 w-6" /></span>
        <h1 className="text-3xl">This studio is invite-only</h1>
        <p className="text-sm leading-relaxed text-muted">
          You&apos;re signed in as <span className="font-semibold text-ink">{email}</span>, but this account isn&apos;t a superadministrator.
          Ask an existing administrator to grant access.
        </p>
        {reason === "setup" && (
          <p role="status" className="rounded-2xl bg-coral-tint px-4 py-3 text-sm font-medium text-coral-text">
            The admin database setup hasn&apos;t been applied to this project yet.
          </p>
        )}
        <SignOutButton />
      </div>
    </main>
  );
}
