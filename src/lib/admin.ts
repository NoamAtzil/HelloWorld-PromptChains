import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// The single gate. Call it at the top of EVERY page and EVERY server action
// (layouts do not re-run on client navigations, so a layout check alone is not
// enough). It verifies the session cryptographically and then asks the
// database, which is the source of truth: public.is_superadmin() only answers
// for the caller's own profile flag (profiles.is_superadmin = TRUE).
//
// Every database function this app calls re-checks is_superadmin() itself and
// every table has superadmin-only RLS, so a bug here can never expose data.
export const requireAdmin = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) {
    redirect("/login");
  }

  const { data: isAdmin, error } = await supabase.rpc("is_superadmin");
  if (error) {
    // Function or table missing: the admin migrations are not applied yet.
    if (["42883", "42P01", "PGRST202"].includes(error.code ?? "")) {
      redirect("/no-access?reason=setup");
    }
    // Anything else is transient: show the error page, not a misleading "setup".
    throw new Error("Could not verify access. Please retry.");
  }
  if (isAdmin !== true) {
    redirect("/no-access");
  }

  return {
    supabase,
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
  };
});

// Server actions return friendly messages; raw database errors stay in logs.
export function friendlyError(error: { code?: string; message?: string }) {
  switch (error.code) {
    case "42501":
      return "You don't have permission to do that.";
    case "P0002":
      return error.message ?? "That item no longer exists.";
    // Messages for these codes are written by our own database functions.
    case "22023":
    case "54000":
    case "55P03":
      return error.message ?? "Check the values and try again.";
    case "23505":
      return "That name or position is already taken. Reload and try again.";
    case "23514":
      return "Check the values and try again (a field is empty or too long).";
    default:
      return "Something went wrong. Please try again.";
  }
}
