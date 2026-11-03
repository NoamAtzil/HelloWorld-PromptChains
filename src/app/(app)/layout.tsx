import { requireAdmin } from "@/lib/admin";
import { AccountMenu } from "@/components/account-menu";
import { Brand } from "@/components/brand";
import { NavLinks } from "@/components/nav-links";
import { ThemeToggle } from "@/components/theme-toggle";

// Gate #2 (after the proxy). Pages and actions call requireAdmin() again,
// because layouts do not re-run on client navigations.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { email } = await requireAdmin();
  return (
    <>
      <header className="glass sticky top-0 z-30">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 sm:px-6">
          <Brand />
          <div className="no-scrollbar order-last -mx-1 w-full overflow-x-auto px-1 py-1 sm:order-none sm:mx-0 sm:w-auto sm:p-0">
            <NavLinks />
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            <ThemeToggle />
            <AccountMenu email={email} />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">{children}</main>
      <footer className="mx-auto w-full max-w-6xl px-4 pb-8 text-center text-xs text-muted sm:px-6">
        Chains turn a photo into a caption, one small step at a time.
      </footer>
    </>
  );
}
