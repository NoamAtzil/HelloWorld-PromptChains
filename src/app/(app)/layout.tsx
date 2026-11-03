import { requireAdmin } from "@/lib/admin";
import { Brand } from "@/components/brand";
import { NavLinks } from "@/components/nav-links";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";

// Gate #2 (after the proxy). Pages and actions call requireAdmin() again,
// because layouts do not re-run on client navigations.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { email } = await requireAdmin();
  return (
    <>
      <header className="glass sticky top-0 z-30 border-x-0 border-t-0">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <Brand />
          <NavLinks />
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <span className="hidden max-w-[14rem] truncate text-xs text-muted md:inline" title={email}>
              {email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:py-8">{children}</main>
    </>
  );
}
