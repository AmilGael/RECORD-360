import Link from "next/link";
import { getDict } from "@/i18n/server";
import { LanguageSwitcher } from "@/components/language-switcher";

export default async function Landing() {
  const { lang, t } = await getDict();
  const L = t.landing;

  return (
    <div className="grid-bg" style={{ minHeight: "100vh" }}>
      {/* top bar */}
      <header className="appbar">
        <div className="appbar-inner" style={{ maxWidth: 1180 }}>
          <Link href="/" className="brand"><b>Raphl<span className="dot" aria-hidden="true">.</span></b><span className="tag">{t.common.blackBox}</span></Link>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <LanguageSwitcher current={lang} />
            <Link href="/login" className="btn btn-ink" style={{ padding: "0.5rem 1rem", fontSize: "0.82rem" }}>{L.ctaEnter} <span className="arrow">→</span></Link>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "0 28px" }}>
        {/* hero */}
        <section style={{ padding: "92px 0 64px" }}>
          <div className="reveal reveal-1" style={{ display: "inline-flex", alignItems: "center", gap: 12, marginBottom: 30 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
            <span className="kicker">{L.eyebrow}</span>
          </div>
          <h1 className="reveal reveal-2 h-xl" style={{ fontSize: "clamp(3rem, 9vw, 7.6rem)", maxWidth: "14ch" }}>
            {L.heroPre} {L.heroMid} <span style={{ color: "var(--accent)" }}>{L.heroAccent}</span>.
          </h1>

          <div className="hero-split" style={{ marginTop: 48, display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1fr)", gap: 56, alignItems: "end", borderTop: "1px solid var(--line)", paddingTop: 34 }}>
            <div className="reveal reveal-3">
              <p className="text-soft" style={{ fontSize: "clamp(1.02rem, 1.6vw, 1.32rem)", maxWidth: "44ch", lineHeight: 1.5 }}>{L.heroLead}</p>
              <div style={{ display: "flex", gap: 12, marginTop: 30, flexWrap: "wrap" }}>
                <Link href="/login" className="btn btn-ink">{L.ctaStart} <span className="arrow">→</span></Link>
                <a href="#caps" className="btn btn-ghost">{L.ctaSee}</a>
              </div>
            </div>

            {/* record card */}
            <div className="reveal reveal-4 card" style={{ borderColor: "var(--line-strong)", borderRadius: 6, overflow: "hidden", boxShadow: "8px 8px 0 rgba(25,20,15,0.07)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 15px", background: "var(--ink)", color: "var(--paper)" }}>
                <span className="mono" style={{ fontSize: "0.66rem", letterSpacing: "0.14em" }}>{L.rec.id}</span>
                <span style={{ display: "flex", gap: 6 }}>
                  <i style={{ width: 9, height: 9, borderRadius: "50%", background: "#46B04D" }} />
                  <i style={{ width: 9, height: 9, borderRadius: "50%", background: "#E8B23A" }} />
                  <i style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--accent)" }} />
                </span>
              </div>
              <div>
                {[
                  [L.rec.partida, L.rec.partidaVal],
                  [L.rec.when, "2026-05-31T08:42:17Z"],
                  [L.rec.gps, "18.4861°N · 69.9312°O"],
                  [L.rec.evidence, L.rec.evidenceVal],
                  [L.rec.seal, "0x7f3a9c…e91c"],
                ].map(([k, v], i, a) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "11px 15px", borderBottom: i < a.length - 1 ? "1px dashed var(--line)" : "none" }}>
                    <span className="mono" style={{ fontSize: "0.64rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--steel)" }}>{k}</span>
                    <span className="mono" style={{ fontSize: "0.74rem", textAlign: "right", color: k === L.rec.seal ? "var(--accent-deep)" : "var(--ink)" }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: "12px 15px", borderTop: "1px solid var(--line)" }}>
                <span className="mono" style={{ fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--accent)", border: "1px solid var(--accent)", padding: "3px 8px", borderRadius: 2, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <i style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }} /> {L.rec.verified}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* capabilities */}
        <section id="caps" style={{ padding: "70px 0" }}>
          <h2 className="reveal h-md" style={{ fontSize: "clamp(1.7rem, 3.6vw, 2.7rem)", maxWidth: "20ch", borderBottom: "1px solid var(--line)", paddingBottom: 22, marginBottom: 8 }}>{L.capsTitle}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            {L.caps.map((c, i) => (
              <div key={c.t} className="reveal" style={{ animationDelay: `${0.1 + i * 0.08}s`, padding: "34px 28px 34px 0", borderTop: "1px solid var(--line)" }}>
                <span className="mono text-steel" style={{ fontSize: "0.78rem" }}>{String(i + 1).padStart(2, "0")}</span>
                <h3 className="h-md" style={{ fontSize: "1.35rem", margin: "16px 0 8px" }}>{c.t}</h3>
                <p className="text-soft" style={{ fontSize: "0.96rem", maxWidth: "34ch", lineHeight: 1.55 }}>{c.b}</p>
              </div>
            ))}
          </div>
        </section>

        {/* final cta */}
        <section style={{ padding: "96px 0 110px", textAlign: "center" }}>
          <h2 className="reveal h-lg" style={{ fontSize: "clamp(2.4rem, 6vw, 5rem)" }}>
            {L.ctaTitlePre} <br /><span style={{ color: "var(--accent)" }}>{L.ctaTitleAccent}</span>
          </h2>
          <p className="reveal reveal-2 text-soft" style={{ fontSize: "1.1rem", margin: "24px auto 36px", maxWidth: "46ch" }}>{L.ctaLead}</p>
          <Link href="/login" className="reveal reveal-3 btn btn-accent" style={{ fontSize: "1rem", padding: "0.9rem 1.7rem" }}>{L.ctaEnter} <span className="arrow">→</span></Link>
        </section>
      </main>

      <footer style={{ borderTop: "1px solid var(--line-strong)", padding: "40px 0" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 28px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <span className="brand"><b>Raphl<span className="dot" aria-hidden="true">.</span></b></span>
          <span className="mono text-steel" style={{ fontSize: "0.66rem", letterSpacing: "0.08em" }}>{L.footerTagline} · SANTO DOMINGO · © 2026</span>
          <LanguageSwitcher current={lang} />
        </div>
      </footer>
    </div>
  );
}
