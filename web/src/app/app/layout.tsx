import Link from "next/link";
import { auth, signOut } from "@/auth";
import { getDict } from "@/i18n/server";
import { LanguageSwitcher } from "@/components/language-switcher";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = role === "ADMIN" || role === "MANAGER";
  const { lang, t } = await getDict();

  return (
    <div className="grid-bg" style={{ minHeight: "100vh" }}>
      <header className="appbar">
        <div className="appbar-inner">
          <Link href="/app" className="brand"><b>RECORD&nbsp;360</b><span className="tag">{t.common.blackBox}</span></Link>
          <nav className="appnav">
            <Link href="/app">{t.nav.sites}</Link>
            {isAdmin && <Link href="/app/admin">{t.nav.team}</Link>}
            <LanguageSwitcher current={lang} />
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button>{t.nav.signOut}</button>
            </form>
          </nav>
        </div>
      </header>
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "44px 28px 90px" }}>{children}</main>
    </div>
  );
}
