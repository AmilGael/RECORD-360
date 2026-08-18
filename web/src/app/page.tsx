import Link from "next/link";
import { getDict } from "@/i18n/server";
import { LanguageSwitcher } from "@/components/language-switcher";

/*
LANDING SURFACE — Registro Strip (seed da5cc0ba, surface scope, Persuade)
inside the committed Plancha Industrial world. The first viewport proves the
mechanism instead of claiming it: one registro travels three plates —
Registra (chalk outline: being captured) → Sella (rust edge: being stamped) →
Inalterable (full chalk plane: sealed) — the app's own state grammar teaching
itself. The painted yard (comp-B reference, generated asset) is the atmosphere
band, not the structure. The landing commits to night regardless of the theme
cookie: it is the brand surface, and the black box's native state is night.
*/
export default async function Landing() {
  const { lang, t } = await getDict();
  const L = t.landing;

  return (
    <div className="grid-bg lp-night" style={{ minHeight: "100vh" }}>
      {/* top bar */}
      <header className="appbar">
        <div className="appbar-inner" style={{ maxWidth: 1180 }}>
          <Link href="/" className="brand"><b>Raphel<span className="dot" aria-hidden="true">.</span></b><span className="tag">{t.common.blackBox}</span></Link>
          <div className="lp-nav-links">
            <a href="#caps" className="lp-anchor">{L.navCaps}</a>
            <a href="#flujo" className="lp-anchor">{L.navHow}</a>
            <LanguageSwitcher current={lang} />
            <Link href="/login" className="btn btn-ghost" style={{ padding: "0.5rem 1rem", fontSize: "0.78rem" }}>{L.ctaEnter}</Link>
            <Link href="/request-access" className="btn btn-ink" style={{ padding: "0.5rem 1rem", fontSize: "0.78rem" }}>{L.ctaAccess} <span className="arrow">→</span></Link>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "0 28px" }}>
        {/* hero: claim, then the mechanism proven as a strip */}
        <section style={{ padding: "84px 0 56px" }}>
          <div className="reveal reveal-1" style={{ display: "inline-flex", alignItems: "center", gap: 12, marginBottom: 26 }}>
            <span style={{ width: 8, height: 8, background: "var(--accent)", display: "inline-block" }} />
            <span className="kicker">{L.eyebrow}</span>
          </div>
          <h1 className="reveal reveal-2 h-xl" style={{ fontSize: "clamp(2.9rem, 7.2vw, 5.6rem)", maxWidth: "16ch" }}>
            {L.heroPre} {L.heroMid} <span style={{ color: "var(--accent)" }}>{L.heroAccent}</span>.
          </h1>
          <div className="reveal reveal-3" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 28, flexWrap: "wrap", marginTop: 18 }}>
            <p className="text-soft" style={{ fontSize: "clamp(1.02rem, 1.6vw, 1.28rem)", maxWidth: "46ch", lineHeight: 1.5, margin: 0 }}>{L.heroLead}</p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link href="/request-access" className="btn btn-accent">{L.ctaAccess} <span className="arrow">→</span></Link>
              <a href="#flujo" className="btn btn-ghost">{L.ctaSee}</a>
            </div>
          </div>

          {/* the registro strip: capture → stamp → sealed, in the app's own state marks */}
          <div className="lp-strip reveal reveal-4" role="img" aria-label={`${L.flow[0].t} → ${L.flow[1].t} → ${L.rec.verified}`}>
            <div className="lp-plate lp-plate--outline">
              <span className="lp-plate-step">01 · {L.flow[0].t}</span>
              <dl>
                <div><dt>{L.rec.partida}</dt><dd>{L.rec.partidaVal}</dd></div>
                <div><dt>{L.rec.evidence}</dt><dd>{L.rec.evidenceVal}</dd></div>
              </dl>
            </div>
            <span className="lp-strip-joint" aria-hidden="true">→</span>
            <div className="lp-plate lp-plate--stamp">
              <span className="lp-plate-step">02 · {L.flow[1].t}</span>
              <dl>
                <div><dt>{L.rec.when}</dt><dd>2026-05-31T08:42:17Z</dd></div>
                <div><dt>{L.rec.gps}</dt><dd>18.4861°N · 69.9312°O</dd></div>
                <div><dt>{L.rec.seal}</dt><dd className="lp-hash">0x7f3a9c…e91c</dd></div>
              </dl>
            </div>
            <span className="lp-strip-joint" aria-hidden="true">→</span>
            <div className="lp-plate lp-plate--sealed">
              <span className="lp-plate-step">03 · {L.rec.id}</span>
              <dl>
                <div><dt>{L.rec.partida}</dt><dd>{L.rec.partidaVal}</dd></div>
                <div><dt>{L.rec.seal}</dt><dd className="lp-hash">0x7f3a9c…e91c</dd></div>
              </dl>
              <span className="lp-seal-mark">{L.rec.verified}</span>
            </div>
          </div>
        </section>
      </main>

      {/* the yard at night — the world's atmosphere band (generated painting) */}
      <div className="lp-yard" role="presentation" aria-hidden="true" />

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "0 28px" }}>
        {/* capabilities */}
        <section id="caps" style={{ padding: "70px 0", scrollMarginTop: 72 }}>
          <div className="lp-sec-head reveal">
            <h2 className="h-md" style={{ fontSize: "clamp(1.6rem, 3.4vw, 2.5rem)", maxWidth: "22ch" }}>{L.capsTitle}</h2>
            <span className="lp-sec-index">{L.secCaps}</span>
          </div>
          <div className="lp-caps-grid">
            {L.caps.map((c, i) => (
              <div key={c.t} className="lp-cap reveal" style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
                <span className="lp-cap-num">{String(i + 1).padStart(2, "0")}</span>
                <h3>{c.t}</h3>
                <p>{c.b}</p>
              </div>
            ))}
          </div>
        </section>

        {/* flow: the path of every entry */}
        <section id="flujo" style={{ padding: "70px 0", scrollMarginTop: 72 }}>
          <div className="lp-sec-head reveal">
            <h2 className="h-md" style={{ fontSize: "clamp(1.6rem, 3.4vw, 2.5rem)", maxWidth: "22ch" }}>{L.flowSecTitle}</h2>
            <span className="lp-sec-index">{L.secFlow}</span>
          </div>

          <div className="lp-flow reveal">
            <span className="lp-flow-kicker">{L.flowKicker}</span>
            <p className="lp-flow-title">{L.flowTitle}</p>
            <div className="lp-flow-chain">
              {L.flow.map((step, i, a) => (
                <div key={step.t} className="lp-node">
                  <span className="lp-step">{L.stepWord} {String(i + 1).padStart(2, "0")}</span>
                  <h3>{step.t}</h3>
                  <p>{step.b}</p>
                  {i < a.length - 1 && <span className="lp-arrow" aria-hidden="true">→</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="lp-stats reveal">
            {L.stats.map((s) => (
              <div key={s.label} className="lp-stat">
                <div className="lp-num">{s.num}{s.unit && <span className="lp-unit">{s.unit}</span>}</div>
                <p className="lp-label">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* final cta */}
        <section style={{ padding: "90px 0 104px", textAlign: "center" }}>
          <h2 className="reveal h-lg" style={{ fontSize: "clamp(2.2rem, 5.6vw, 4.6rem)" }}>
            {L.ctaTitlePre} <br /><span style={{ color: "var(--accent)" }}>{L.ctaTitleAccent}</span>
          </h2>
          <p className="reveal reveal-2 text-soft" style={{ fontSize: "1.08rem", margin: "24px auto 36px", maxWidth: "46ch" }}>{L.ctaLead}</p>
          <Link href="/request-access" className="reveal reveal-3 btn btn-accent" style={{ fontSize: "0.95rem", padding: "0.95rem 1.8rem" }}>{L.ctaAccess} <span className="arrow">→</span></Link>
        </section>
      </main>

      <footer style={{ borderTop: "1px solid var(--line-strong)", padding: "40px 0" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 28px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <span className="brand"><b>Raphel<span className="dot" aria-hidden="true">.</span></b></span>
          <span className="mono text-steel" style={{ fontSize: "0.72rem", letterSpacing: "0.08em" }}>{L.footerTagline} · SANTO DOMINGO · © 2026</span>
          <LanguageSwitcher current={lang} />
        </div>
      </footer>
    </div>
  );
}
