import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Brand } from "@/components/brand";
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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <div className="flex flex-col items-center gap-5 glass rounded-3xl p-8 text-center">
        <Brand linked={false} />
        <h1 className="text-2xl font-semibold tracking-tight">No access</h1>
        <p className="text-sm text-muted">
          You&apos;re signed in as <span className="font-medium text-ink">{email}</span>, but this
          account isn&apos;t a superadministrator. Ask an existing administrator to grant access.
        </p>
        {reason === "setup" && (
          <p role="status" className="rounded-xl bg-coral-tint px-3 py-2 text-sm text-coral-text">
            The admin database setup hasn&apos;t been applied to this project yet.
          </p>
        )}
        <SignOutButton />
      </div>
    </main>
  );
}
