import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// OAuth code-exchange callback. Supabase redirects here (this URL must be in
// Authentication > URL Configuration > Redirect URLs). After the session is
// set we always go to "/", where requireAdmin() decides what the user may see.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";
  const base = isLocalEnv
    ? origin
    : forwardedHost
      ? `https://${forwardedHost}`
      : origin;

  return NextResponse.redirect(`${base}/`);
}
