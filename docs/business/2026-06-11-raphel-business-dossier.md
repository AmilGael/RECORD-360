# Raphel — Business Dossier: Build Cost, Running Cost & Commercial Model

**Date:** 2026-06-11 · **Prepared for:** Gamaliel Leguista (owner)
**Classification: INTERNAL.** This document contains cost basis and margin data. Share *sections 2, 4.1, 5 and 6* with buyers if useful; **never share section 3.1 (cost basis) or the margin columns** — they are negotiation leverage. The client-facing offer is the separate `2026-06-11-raphel-propuesta-comercial.md`.

---

## 1. Executive summary

Raphel is an operational, multi-tenant SaaS for construction-site management in the Dominican Republic — an immutable, legally-oriented site logbook ("la caja negra de tu obra") with offline-first field capture, change-order workflow, and AI-generated reports. It was produced for **under US$2,500** in direct cost, would cost a buyer **US$25,000–180,000 to replicate**, runs on **US$30–50/month** of infrastructure today, and supports a subscription model with **66–77% net margins** at honest, fully-loaded unit costs.

Three ways to monetize, in ascending value: sell the asset now (**US$40–65K**), license it to construction companies (**~US$42K ARR at 10 clients → US$125–170K asset value**), or hybrid (majority sale + retained stake + operator contract).

---

## 2. The asset

### 2.1 Product (operational today)
- **Immutable registro ledger** — every field entry sealed with server timestamp, GPS, and a cryptographic hash chain; one-click chain verification. This is the legal-evidence core and the hardest-to-replicate component.
- **Offline-first PWA** — full capture without signal (IndexedDB queue, background sync, idempotent server dedupe). The second hardest-to-replicate component.
- **Multi-tenant + 4-role authz** — Admin / Gerente / Supervisor / Residente, project-scoped assignments, tested server-side on every query path.
- **Change orders (Solicitudes de Cambio)** — PR-style workflow with mandatory reminders, mandatory resolution feedback, cryptographic seals, fan-out markers into affected partidas.
- **Obras → Bloques → Partidas** structure with per-bloque spaces (Cuaderno, Planos, Levantamientos, Ideas, Media, Recordatorios, Indicadores), tags, soft-delete recycle bins, full audit log.
- **Notifications, analytics (phase-based health), PDF reports, ES/EN i18n, dark mode.**
- **Security hardening** (independent audit pass): session revocation, login throttling, ledger write locks, PDF sanitization, upload caps, tenancy verified fail-closed.

### 2.2 Engineering quality signals
- 226 automated tests across 53 files, green; lint clean; CI (GitHub Actions with real-database test gate).
- Production deploy configuration (Netlify + Supabase + Cloudflare R2 + Resend), migrations pipeline, security-scoped to production context.
- Full written spec history (8 design docs) and a 4-round forward roadmap with one round already shipped.

### 2.3 Roadmap (spec'd, partially built)
| Round | Content | Status |
|---|---|---|
| R0 | Rename, labels, permission fixes, cambios hardening, delete notifications | **Shipped 2026-06-11** |
| R1 | Project cover photos, **unique registration code + QR certification**, team profiles (photo/phone/signature), company seal | Spec'd, ~1–2 days |
| R2 | Time-range reports (obra/bloque/partida) + **AI report generator** (Claude API) with requester signature + company seal | Spec'd, ~2–3 days |
| R3 | Project-page redesign, WhatsApp-style media galleries, similarity search, faceted filters | Spec'd, ~2–3 days |

---

## 3. Build cost

### 3.1 Actual cost basis — INTERNAL ONLY
| Input | Detail | Cost |
|---|---|---|
| Claude Max subscription | ~2 weeks of AI-driven development (May 31 → Jun 11, 2026) | ~US$100–200 |
| Owner time | ~12 working days of product direction, field-architect liaison, testing — at DR senior-PM salary equivalent (US$2,500–3,500/mo) | ~US$1,400–2,000 |
| Infrastructure during build | Free tiers + dev tunnel | ~US$0 |
| **Total cost basis** | | **≈ US$1,500–2,200** |

This 20–80× gap between production cost and replacement cost is the owner's captured arbitrage; it is **not** the basis for pricing — replacement cost is.

### 3.2 Replacement cost (what a buyer pays to get this any other way)
| Path | Team / duration | Cost | Time to market |
|---|---|---|---|
| Local DR team | 1 senior + 1 mid, 4–6 months | US$25,000–45,000 | 4–6 months |
| Nearshore/LatAm agency | quoted vs. PRD + specs | US$50,000–90,000 | 4–6 months |
| US agency | same spec | US$100,000–180,000 | 4–6 months |
| **Buying Raphel** | — | negotiated | **operational today**, validated by a practicing architect |

The immutable ledger and offline-sync subsystems carry most of the replication risk: both are areas where naïve implementations fail in the field and rework is common.

### 3.3 Asset-sale valuation
| | Amount | Logic |
|---|---|---|
| Ask | **US$55,000–65,000** | Below the credible nearshore quote; rational "buy vs build" |
| Target close | **US$40,000–50,000** | Defensible against any agency bid |
| Floor | **US$28,000–30,000** | Equals cheapest credible local rebuild — below this, keep it |
| Timing lever | **+US$10,000–15,000** | Close after R1+R2 ship (QR certification + AI informes demo) |
| Installation for buyer | **US$2,500–3,500** one-time | Provisioning, migrations, seeding, training |
| Operator retainer | **US$500–800/mo**, 6-mo min | Keeps owner as the irreplaceable technical operator |

---

## 4. Running costs (honest model)

### 4.1 Fixed platform (shared across all clients)
| Service | Today | At ~10 clients |
|---|---|---|
| Supabase (Postgres, backups) | Pro US$25 | US$25–75 (compute add-ons as load grows) |
| Netlify (hosting + functions) | Free US$0 | Pro US$19 + bandwidth overages (see 4.3) |
| Cloudflare R2 (object storage) | Free | usage-based (see per-client) |
| Resend (email) | Free | US$0–20 |
| Domain | ~US$1.50/mo | ~US$1.50/mo |
| Anthropic API floor | usage-based | usage-based |
| Claude Max (ongoing development tooling) | US$100–200 | US$100–200 |
| **Fixed total** | **≈ US$30–50/mo** | **≈ US$150–300/mo** |

### 4.2 Marginal cost per client — year 1 vs. mature
| Component | Year 1 | Year 2+ (mature) | Driver |
|---|---|---|---|
| Storage (R2, accumulating) | US$0.50–1.50 | US$3–7 | **Ratchet:** evidence retention is the product promise; storage only grows |
| Media serving (Netlify bandwidth/functions) | US$1–3 | US$5–12 | All media currently proxies through functions (see 4.4 fix) |
| AI informes | US$3–4 | US$6–15 | Context grows with obra history (US$0.14 → US$0.50–1.30/report); retries; future voice/NLP features |
| Email / DB share | ~US$0 | US$1–2 | |
| Payment processing (~3.5% of plan) | US$5–12 | US$5–20 | |
| Support + maintenance allocation (~20% of revenue) | US$30–70 | US$30–90 | Field users need hand-holding; updates, monitoring, incident response |
| **Fully-loaded per client** | **≈ US$40–90** | **≈ US$50–135** | |

### 4.3 Cost-growth drivers to respect
1. **Storage ratchet** — never decreases; priced via plan caps + US$0.10/GB/mo overage (≈6× raw cost).
2. **AI context growth** — older obras → bigger prompts; mitigate with date-range scoping (already in spec) and a Haiku-model toggle (~⅓ cost) for routine informes.
3. **Media-through-functions** — the largest controllable cost; see 4.4.
4. **AI price/feature drift** — protected contractually by the annual escalator clause (max 10% or inflation) and metered overages.
5. **ITBIS (18%)** — charged on top, never absorbed.

### 4.4 Engineering levers that cut COGS
| Lever | Effort | Effect |
|---|---|---|
| Signed R2 URLs for media (browser pulls directly from Cloudflare; auth enforced at URL mint) | ~1 day, slot into R3 | Eliminates the largest variable cost (Netlify bandwidth) almost entirely |
| Report context windowing (date-scoped data assembly) | already in R2 spec | Caps AI cost per informe |
| Haiku 4.5 toggle for routine informes | hours | ~70% cheaper per report where prose quality permits |

---

## 5. Commercial model

### 5.1 Pricing (per company, per month, + ITBIS; annual prepay = 2 months free)
| | OBRA | CONSTRUCTORA | EMPRESA |
|---|---|---|---|
| Price | **US$149** | **US$349** | **US$599** |
| Obras activas | 1 | 5 | 15 |
| Usuarios | 5 | 15 | 40 |
| Informes IA/mes | 10 | 30 | 75 |
| Storage cap | 25 GB | 100 GB | 300 GB |
| Onboarding (one-time) | US$500 | US$750 | US$1,200 |

**Overages:** informe IA US$2.50 · storage US$0.10/GB/mo · usuario US$5/mo · obra extra US$25/mo.
**Contract protections:** prices +ITBIS; annual adjustment up to 10% or inflation (60-day notice); fair-use clause.

### 5.2 Margins at fully-loaded cost — INTERNAL ONLY
| Tier | Price | Mature COGS | Net margin |
|---|---|---|---|
| Obra | US$149 | ~US$50 | **~66%** |
| Constructora | US$349 | ~US$80 | **~77%** |
| Empresa | US$599 | ~US$135 | **~77%** |

Context: Procore/Autodesk run US$375–thousands per month. Raphel at these prices still undercuts the imported alternative 5–10× while remaining a healthy software business.

### 5.3 Twelve-month revenue scenarios
| Scenario | Clients (mix) | MRR | ARR | + onboarding fees |
|---|---|---|---|---|
| Conservative | 4 (3 Obra, 1 Constructora) | ~US$800 | ~US$9.5K | ~US$2.3K |
| Base | 10 (4 Obra, 5 Constructora, 1 Empresa) | ~US$2,940 | ~US$35K | ~US$7.2K |
| Strong | 20 (6 Obra, 11 Constructora, 3 Empresa) | ~US$6,530 | ~US$78K | ~US$15K |

Fixed costs at any of these scales stay under US$300/mo — the model is profitable from the **first** client.

---

## 6. Monetization paths compared

| Path | Year-1 cash | 3-year value | Owner's role |
|---|---|---|---|
| **A. Asset sale now** | US$40–65K + US$3K setup + retainer | ~US$50–70K total, done | Exit |
| **B. License (SaaS)** | US$10–35K building up | **US$125–170K+ asset** (3–4× ARR at base case) and still owned | Owner-operator |
| **C. Hybrid** | US$30–40K (majority stake) | sale + retainer + 15–25% upside | Partner/operator |

Buyer-type guide: construction company wanting it internally → A or C at the top of the range (worth more as their operating tool than as software). Software house wanting to resell → they intend B for themselves; price accordingly (US$60K+) or insist on C.

**Negotiation guardrails:** never waive onboarding fees; discount with free months, not lower list price; every signed client before a sale moves the valuation from replacement-cost logic to revenue-multiple logic.

---

## 7. Risks (disclose honestly in diligence)
- **Pre-revenue** as of this writing; validation is qualitative (one practicing architect driving two structured feedback rounds).
- **Key-person:** owner is the sole operator; mitigated by spec/plan documentation discipline and the retainer structure.
- **Platform dependencies:** Netlify, Supabase, Cloudflare, Anthropic — all substitutable (standard Next.js/Postgres/S3 interfaces), but migrations cost effort.
- **Legal positioning:** the immutability chain is strong evidence, but formal Ley 126-02 digital-signature certification requires a certified provider (hundreds–thousands US$/yr) — spec'd as a deferred feature, priced separately when demanded.
- **Liability:** a product marketed as legal evidence should eventually carry E&O insurance and reviewed terms of service before scale.

---

## 8. One-line positions

**To a buyer:** *"Operational today, validated in the field, US$35–75/month to run, ~US$0.14 per AI report, US$100K+ to rebuild — asking US$55K with installation, training, and six months of support at US$3K + US$650/month."*

**To a client:** *"Por menos de lo que cuesta un día de retraso, cada decisión de tu obra queda registrada para siempre."*
