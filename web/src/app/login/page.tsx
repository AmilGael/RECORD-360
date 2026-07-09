import { signIn } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getDict } from "@/i18n/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SubmitButton } from "@/components/submit-button";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; activated?: string; reset?: string }> }) {
  const { error, activated, reset } = await searchParams;
  const { lang, t } = await getDict();
  const T = t.login;

  async function doLogin(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirect: false,
      });
    } catch {
      redirect("/login?error=1");
    }
    redirect("/app");
  }

  return (
    <div className="grid-bg" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header className="appbar" style={{ background: "transparent", backdropFilter: "none", borderBottom: "none" }}>
        <div className="appbar-inner" style={{ maxWidth: 1180 }}>
          <Link href="/" className="brand"><b>Raphel<span className="dot" aria-hidden="true">.</span></b><span className="tag">{t.common.blackBox}</span></Link>
          <LanguageSwitcher current={lang} />
        </div>
      </header>

      <main style={{ flex: 1, display: "grid", placeItems: "center", padding: 24 }}>
        <form action={doLogin} className="reveal reveal-2 card" style={{ width: "100%", maxWidth: 360, borderColor: "var(--line-strong)", borderRadius: 6, overflow: "hidden", boxShadow: "8px 8px 0 rgba(25,20,15,0.07)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 16px", background: "var(--ink)", color: "var(--paper)" }}>
            <span className="mono" style={{ fontSize: "0.62rem", letterSpacing: "0.16em" }}>{T.kicker}</span>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />
          </div>
          <div style={{ padding: "26px 22px 24px" }}>
            <h1 className="h-md" style={{ fontSize: "1.7rem", marginBottom: 20 }}>{T.title}</h1>
            {error && (
              <p style={{ background: "rgba(225,74,31,0.08)", border: "1px solid var(--accent)", color: "var(--accent-deep)", padding: "9px 11px", borderRadius: 3, fontSize: "0.84rem", marginBottom: 14 }}>{T.error}</p>
            )}
            {activated && (
              <p style={{ background: "rgba(40,140,60,0.08)", border: "1px solid var(--line-strong)", color: "var(--ink)", padding: "9px 11px", borderRadius: 3, fontSize: "0.84rem", marginBottom: 14 }}>{T.activated}</p>
            )}
            {reset && (
              <p style={{ background: "rgba(40,140,60,0.08)", border: "1px solid var(--line-strong)", color: "var(--ink)", padding: "9px 11px", borderRadius: 3, fontSize: "0.84rem", marginBottom: 14 }}>{T.resetDone}</p>
            )}
            <input name="email" type="email" placeholder={T.email} required className="input" style={{ marginBottom: 10 }} autoComplete="email" autoFocus />
            <input name="password" type="password" placeholder={T.password} required className="input" style={{ marginBottom: 8 }} autoComplete="current-password" />
            <div style={{ textAlign: "right", marginBottom: 18 }}>
              <Link href="/forgot-password" className="mono text-steel" style={{ fontSize: "0.66rem", textDecoration: "none" }}>{T.forgot}</Link>
            </div>
            <SubmitButton className="btn btn-ink" style={{ width: "100%" }} pendingLabel="…">{T.submit} <span className="arrow">→</span></SubmitButton>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 16px", borderTop: "1px solid var(--line)" }}>
            <Link href="/" className="mono text-steel" style={{ fontSize: "0.66rem", textDecoration: "none" }}>← {T.back}</Link>
            <Link href="/request-access" className="mono text-steel" style={{ fontSize: "0.66rem", textDecoration: "none" }}>{T.noAccount}</Link>
          </div>
        </form>
      </main>
    </div>
  );
}
