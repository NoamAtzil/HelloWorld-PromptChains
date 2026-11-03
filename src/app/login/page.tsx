import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Brand } from "@/components/brand";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
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
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-4 py-10">
      <div className="flex flex-col items-center gap-6 glass rounded-3xl p-8 text-center">
        <Brand linked={false} />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Prompt chains</h1>
          <p className="text-sm text-muted">
            Sign in with Google. Access is limited to superadministrators.
          </p>
        </div>
        <GoogleSignInButton />
      </div>
      <div className="flex justify-center">
        <ThemeToggle />
      </div>
    </main>
  );
}
