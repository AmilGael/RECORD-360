---
title: "Raphel — Business Dossier / Dossier de Negocio"
subtitle: "Build cost, running cost & commercial model · Costo de construcción, operación y modelo comercial"
author: "Gamaliel Leguista"
date: "2026-06-11"
lang: en
---

\newpage

# PART I — ENGLISH VERSION

**Classification: INTERNAL.** This document contains cost basis and margin data. Sections 2, 4.1, 5 and 6 may be shared with buyers; **never share section 3.1 (cost basis) or the margin tables** — they are negotiation leverage. The client-facing offer is the separate commercial proposal.

## 1. Executive summary

Raphel is an operational, multi-tenant SaaS for construction-site management in the Dominican Republic — an immutable, legally-oriented site logbook ("la caja negra de tu obra") with offline-first field capture, change-order workflow, and AI-generated reports. It was produced for **under US$2,500** in direct cost, would cost a buyer **US$25,000–180,000 to replicate**, runs on **US$30–50/month** of infrastructure today, and supports a subscription model with **66–77% net margins** at honest, fully-loaded unit costs.

Three ways to monetize, in ascending value: sell the asset now (**US$40–65K**), license it to construction companies (**~US$42K ARR at 10 clients → US$125–170K asset value**), or hybrid (majority sale + retained stake + operator contract).

## 2. The asset

### 2.1 Product (operational today)

- **Immutable registro ledger** — every field entry sealed with server timestamp, GPS, and a cryptographic hash chain; one-click chain verification. This is the legal-evidence core and the hardest-to-replicate component.
- **Offline-first PWA** — full capture without signal (local queue, background sync, idempotent server dedupe). The second hardest-to-replicate component.
- **Multi-tenant + 4-role access control** — Admin / Manager / Supervisor / Resident, project-scoped assignments, tested server-side on every query path.
- **Change orders (Solicitudes de Cambio)** — approval workflow with mandatory reminders, mandatory resolution feedback, cryptographic seals, markers propagated into affected work items.
- **Obras → Bloques → Partidas** structure with per-bloque spaces (Cuaderno, Planos, Levantamientos, Ideas, Media, Recordatorios, Indicadores), tags, recycle bins, full audit log.
- **Notifications, phase-based analytics, PDF reports, ES/EN interface, dark mode.**
- **Security hardening** (independent audit pass): session revocation, login throttling, ledger write locks, PDF sanitization, upload caps, tenancy verified fail-closed.

### 2.2 Engineering quality signals

- 226 automated tests across 53 files, green; lint clean; CI with a real-database test gate.
- Production deploy configuration (Netlify + Supabase + Cloudflare R2 + Resend), migrations pipeline.
- Full written spec history (8 design documents) and a 4-round forward roadmap with one round already shipped.

### 2.3 Roadmap

| Round | Content | Status |
|---|---|---|
| R0 | Rename, labels, permission fixes, change-order hardening, delete notifications | **Shipped 2026-06-11** |
| R1 | Project cover photos, **unique registration code + QR certification**, team profiles, company seal | Spec'd, ~1–2 days |
| R2 | Time-range reports + **AI report generator** with requester signature + company seal | Spec'd, ~2–3 days |
| R3 | Project-page redesign, media galleries, similarity search, faceted filters | Spec'd, ~2–3 days |

## 3. Build cost

### 3.1 Actual cost basis — INTERNAL ONLY

| Input | Detail | Cost |
|---|---|---|
| Claude Max subscription | ~2 weeks of AI-driven development | ~US$100–200 |
| Owner time | ~12 working days of product direction at DR senior-PM salary equivalent | ~US$1,400–2,000 |
| Infrastructure during build | Free tiers | ~US$0 |
| **Total cost basis** | | **≈ US$1,500–2,200** |

This 20–80× gap between production cost and replacement cost is the owner's captured arbitrage; it is **not** the basis for pricing — replacement cost is.

### 3.2 Replacement cost

| Path | Team / duration | Cost | Time to market |
|---|---|---|---|
| Local DR team | 1 senior + 1 mid, 4–6 months | US$25,000–45,000 | 4–6 months |
| Nearshore/LatAm agency | quoted vs. spec | US$50,000–90,000 | 4–6 months |
| US agency | same spec | US$100,000–180,000 | 4–6 months |
| **Buying Raphel** | — | negotiated | **operational today**, field-validated |

### 3.3 Asset-sale valuation

| | Amount | Logic |
|---|---|---|
| Ask | **US$55,000–65,000** | Below the credible nearshore quote |
| Target close | **US$40,000–50,000** | Defensible against any agency bid |
| Floor | **US$28,000–30,000** | Equals cheapest credible local rebuild |
| Timing lever | **+US$10,000–15,000** | Close after R1+R2 ship (QR + AI reports demo) |
| Installation for buyer | **US$2,500–3,500** one-time | Provisioning, migrations, seeding, training |
| Operator retainer | **US$500–800/mo**, 6-month minimum | Owner stays as technical operator |

## 4. Running costs (honest model)

### 4.1 Fixed platform (shared across all clients)

| Service | Today | At ~10 clients |
|---|---|---|
| Supabase (Postgres, backups) | Pro US$25 | US$25–75 |
| Netlify (hosting + functions) | US$0 | US$19 + bandwidth overages |
| Cloudflare R2 (storage) | Free | usage-based |
| Resend (email) | Free | US$0–20 |
| Domain | ~US$1.50/mo | ~US$1.50/mo |
| Claude Max (ongoing development tooling) | US$100–200 | US$100–200 |
| **Fixed total** | **≈ US$30–50/mo** | **≈ US$150–300/mo** |

### 4.2 Marginal cost per client

| Component | Year 1 | Year 2+ (mature) |
|---|---|---|
| Storage (accumulating, never shrinks) | US$0.50–1.50 | US$3–7 |
| Media serving (bandwidth/functions) | US$1–3 | US$5–12 |
| AI reports (context grows with obra history) | US$3–4 | US$6–15 |
| Email / DB share | ~US$0 | US$1–2 |
| Payment processing (~3.5%) | US$5–12 | US$5–20 |
| Support + maintenance allocation (~20% of revenue) | US$30–70 | US$30–90 |
| **Fully-loaded per client** | **≈ US$40–90** | **≈ US$50–135** |

### 4.3 Cost-growth drivers

1. **Storage ratchet** — evidence retention is the product promise; storage only grows. Priced via plan caps + US$0.10/GB/mo overage.
2. **AI context growth** — older obras mean bigger prompts (US$0.14 → US$0.50–1.30 per report); mitigated by date-range scoping and a cheaper-model toggle.
3. **Media-through-functions** — largest controllable cost; a ~1-day engineering change (signed direct-download URLs) nearly eliminates it.
4. **AI price/feature drift** — protected contractually by the annual escalator clause and metered overages.
5. **ITBIS (18%)** — charged on top, never absorbed.

## 5. Commercial model

### 5.1 Pricing (per company, per month, + ITBIS; annual prepay = 2 months free)

| | OBRA | CONSTRUCTORA | EMPRESA |
|---|---|---|---|
| Price | **US$149** | **US$349** | **US$599** |
| Active obras | 1 | 5 | 15 |
| Users | 5 | 15 | 40 |
| AI reports/month | 10 | 30 | 75 |
| Storage cap | 25 GB | 100 GB | 300 GB |
| Onboarding (one-time) | US$500 | US$750 | US$1,200 |

**Overages:** AI report US$2.50 · storage US$0.10/GB/mo · user US$5/mo · extra obra US$25/mo.
**Contract protections:** prices +ITBIS; annual adjustment up to 10% or inflation (60-day notice); fair-use clause.

### 5.2 Margins at fully-loaded cost — INTERNAL ONLY

| Tier | Price | Mature COGS | Net margin |
|---|---|---|---|
| Obra | US$149 | ~US$50 | **~66%** |
| Constructora | US$349 | ~US$80 | **~77%** |
| Empresa | US$599 | ~US$135 | **~77%** |

Context: imported alternatives (Procore/Autodesk class) run US$375–thousands per month. Raphel undercuts them 5–10× while remaining a healthy software business.

### 5.3 Twelve-month revenue scenarios

| Scenario | Clients (mix) | MRR | ARR | + onboarding |
|---|---|---|---|---|
| Conservative | 4 (3 Obra, 1 Constructora) | ~US$800 | ~US$9.5K | ~US$2.3K |
| Base | 10 (4 Obra, 5 Constructora, 1 Empresa) | ~US$2,940 | ~US$35K | ~US$7.2K |
| Strong | 20 (6 Obra, 11 Constructora, 3 Empresa) | ~US$6,530 | ~US$78K | ~US$15K |

Fixed costs at any of these scales stay under US$300/mo — profitable from the **first** client.

## 6. Monetization paths compared

| Path | Year-1 cash | 3-year value | Owner's role |
|---|---|---|---|
| **A. Asset sale now** | US$40–65K + setup + retainer | ~US$50–70K total, done | Exit |
| **B. License (SaaS)** | US$10–35K building up | **US$125–170K+ asset** (3–4× ARR, base case) and still owned | Owner-operator |
| **C. Hybrid** | US$30–40K (majority stake) | sale + retainer + 15–25% upside | Partner/operator |

Buyer-type guide: a construction company wanting it internally → A or C at the top of the range. A software house wanting to resell → they intend B for themselves; price accordingly (US$60K+) or insist on C.

**Negotiation guardrails:** never waive onboarding fees; discount with free months, not lower list price; every signed client before a sale moves the valuation from replacement-cost logic to revenue-multiple logic.

## 7. Risks (disclose honestly in diligence)

- **Pre-revenue** as of this writing; validation is qualitative (one practicing architect driving two structured feedback rounds).
- **Key-person:** owner is the sole operator; mitigated by documentation discipline and the retainer structure.
- **Platform dependencies:** Netlify, Supabase, Cloudflare, Anthropic — all substitutable, but migrations cost effort.
- **Legal positioning:** the immutability chain is strong evidence, but formal Ley 126-02 digital-signature certification requires a certified provider — spec'd as a deferred feature, priced separately when demanded.
- **Liability:** a product marketed as legal evidence should eventually carry E&O insurance and reviewed terms of service.

## 8. One-line positions

**To a buyer:** *"Operational today, validated in the field, US$35–75/month to run, ~US$0.14 per AI report, US$100K+ to rebuild — asking US$55K with installation, training, and six months of support at US$3K + US$650/month."*

**To a client:** *"Por menos de lo que cuesta un día de retraso, cada decisión de tu obra queda registrada para siempre."*

\newpage

# PARTE II — VERSIÓN EN ESPAÑOL

**Clasificación: INTERNO.** Este documento contiene base de costos y márgenes. Las secciones 2, 4.1, 5 y 6 pueden compartirse con compradores; **nunca compartir la sección 3.1 (base de costos) ni las tablas de márgenes** — son su palanca de negociación. La oferta para clientes es la propuesta comercial separada.

## 1. Resumen ejecutivo

Raphel es un SaaS multiempresa, operativo hoy, para la gestión de obras de construcción en la República Dominicana — una bitácora digital inalterable con orientación legal ("la caja negra de tu obra"), captura de campo sin señal, flujo de solicitudes de cambio e informes generados con Inteligencia Artificial. Se produjo por **menos de US$2,500** de costo directo, a un comprador le costaría **US$25,000–180,000 replicarlo**, opera hoy con **US$30–50/mes** de infraestructura, y sostiene un modelo de suscripción con **márgenes netos del 66–77%** sobre costos honestos y completos.

Tres vías de monetización, en valor ascendente: vender el activo ahora (**US$40–65 mil**), licenciarlo a constructoras (**~US$42 mil ARR con 10 clientes → activo de US$125–170 mil**), o híbrido (venta mayoritaria + participación retenida + contrato de operador).

## 2. El activo

### 2.1 Producto (operativo hoy)

- **Registro inalterable** — cada entrada de campo queda sellada con hora del servidor, GPS y una cadena criptográfica de verificación; verificable en un clic. Es el núcleo de evidencia legal y el componente más difícil de replicar.
- **PWA offline-first** — captura completa sin señal (cola local, sincronización en segundo plano, deduplicación idempotente en el servidor). El segundo componente más difícil de replicar.
- **Multiempresa + control de acceso de 4 roles** — Administrador / Gerente / Supervisor / Residente, asignaciones por obra, verificado del lado del servidor en cada consulta.
- **Solicitudes de cambio** — flujo de aprobación con recordatorios obligatorios, feedback obligatorio al cierre, sellos criptográficos y marcadores propagados a las partidas afectadas.
- **Estructura Obras → Bloques → Partidas** con espacios por bloque (Cuaderno, Planos, Levantamientos, Ideas, Media, Recordatorios, Indicadores), etiquetas, papelera de reciclaje y registro de auditoría completo.
- **Notificaciones, analítica por fases, reportes PDF, interfaz ES/EN, modo oscuro.**
- **Endurecimiento de seguridad** (auditoría independiente): revocación de sesiones, límite de intentos de acceso, bloqueos de escritura del registro, sanitización de PDF, topes de subida, multiempresa verificado a prueba de fallos.

### 2.2 Señales de calidad de ingeniería

- 226 pruebas automatizadas en 53 archivos, en verde; análisis estático limpio; CI con pruebas contra base de datos real.
- Configuración de despliegue a producción (Netlify + Supabase + Cloudflare R2 + Resend), pipeline de migraciones.
- Historial completo de especificaciones (8 documentos de diseño) y hoja de ruta de 4 rondas, con una ya entregada.

### 2.3 Hoja de ruta

| Ronda | Contenido | Estado |
|---|---|---|
| R0 | Renombre, etiquetas, correcciones de permisos, endurecimiento de cambios, notificaciones de borrado | **Entregada 2026-06-11** |
| R1 | Fotos de portada, **Código de Registro Único + certificación QR**, perfiles del equipo, sello de la compañía | Especificada, ~1–2 días |
| R2 | Reportes por lapso de tiempo + **generador de informes con IA** con firma del solicitante + sello | Especificada, ~2–3 días |
| R3 | Rediseño de la página de obra, galerías de medios, buscador por similitud, filtros | Especificada, ~2–3 días |

## 3. Costo de construcción

### 3.1 Base de costos real — SOLO INTERNO

| Insumo | Detalle | Costo |
|---|---|---|
| Suscripción Claude Max | ~2 semanas de desarrollo asistido por IA | ~US$100–200 |
| Tiempo del propietario | ~12 días laborables de dirección de producto, a salario equivalente de PM senior en RD | ~US$1,400–2,000 |
| Infraestructura durante el desarrollo | Planes gratuitos | ~US$0 |
| **Base de costos total** | | **≈ US$1,500–2,200** |

Esta brecha de 20–80× entre costo de producción y costo de reposición es el arbitraje capturado por el propietario; **no** es la base del precio — la base es el costo de reposición.

### 3.2 Costo de reposición

| Vía | Equipo / duración | Costo | Tiempo al mercado |
|---|---|---|---|
| Equipo local en RD | 1 senior + 1 medio, 4–6 meses | US$25,000–45,000 | 4–6 meses |
| Agencia nearshore/LatAm | cotizado contra la especificación | US$50,000–90,000 | 4–6 meses |
| Agencia de EE. UU. | misma especificación | US$100,000–180,000 | 4–6 meses |
| **Comprar Raphel** | — | negociado | **operativo hoy**, validado en campo |

### 3.3 Valoración para venta del activo

| | Monto | Lógica |
|---|---|---|
| Precio de salida | **US$55,000–65,000** | Por debajo de la cotización nearshore creíble |
| Cierre objetivo | **US$40,000–50,000** | Defendible frente a cualquier cotización de agencia |
| Piso | **US$28,000–30,000** | Igual a la reconstrucción local creíble más barata |
| Palanca de momento | **+US$10,000–15,000** | Cerrar después de entregar R1+R2 (demo de QR + informes IA) |
| Instalación para el comprador | **US$2,500–3,500** pago único | Aprovisionamiento, migraciones, carga inicial, capacitación |
| Iguala de operador | **US$500–800/mes**, mínimo 6 meses | El propietario permanece como operador técnico |

## 4. Costos de operación (modelo honesto)

### 4.1 Plataforma fija (compartida entre todos los clientes)

| Servicio | Hoy | Con ~10 clientes |
|---|---|---|
| Supabase (Postgres, respaldos) | Pro US$25 | US$25–75 |
| Netlify (hosting + funciones) | US$0 | US$19 + excedentes de ancho de banda |
| Cloudflare R2 (almacenamiento) | Gratis | según uso |
| Resend (correo) | Gratis | US$0–20 |
| Dominio | ~US$1.50/mes | ~US$1.50/mes |
| Claude Max (herramienta de desarrollo continuo) | US$100–200 | US$100–200 |
| **Total fijo** | **≈ US$30–50/mes** | **≈ US$150–300/mes** |

### 4.2 Costo marginal por cliente

| Componente | Año 1 | Año 2+ (maduro) |
|---|---|---|
| Almacenamiento (acumulativo, nunca baja) | US$0.50–1.50 | US$3–7 |
| Servir medios (ancho de banda/funciones) | US$1–3 | US$5–12 |
| Informes IA (el contexto crece con el historial) | US$3–4 | US$6–15 |
| Correo / base de datos | ~US$0 | US$1–2 |
| Procesamiento de pagos (~3.5%) | US$5–12 | US$5–20 |
| Soporte + mantenimiento (~20% del ingreso) | US$30–70 | US$30–90 |
| **Costo completo por cliente** | **≈ US$40–90** | **≈ US$50–135** |

### 4.3 Factores de crecimiento del costo

1. **Trinquete de almacenamiento** — conservar la evidencia es la promesa del producto; el almacenamiento solo crece. Se cobra con topes por plan + US$0.10/GB/mes de excedente.
2. **Crecimiento del contexto IA** — obras más antiguas implican prompts más grandes (US$0.14 → US$0.50–1.30 por informe); se mitiga con informes por lapso de tiempo y un modelo más económico.
3. **Medios servidos por funciones** — el mayor costo controlable; un cambio de ingeniería de ~1 día (URLs firmadas de descarga directa) casi lo elimina.
4. **Deriva de precios/funciones de IA** — protegido contractualmente con la cláusula de ajuste anual y los excedentes medidos.
5. **ITBIS (18%)** — se cobra aparte, nunca se absorbe.

## 5. Modelo comercial

### 5.1 Precios (por compañía, por mes, + ITBIS; pago anual = 2 meses gratis)

| | OBRA | CONSTRUCTORA | EMPRESA |
|---|---|---|---|
| Precio | **US$149** | **US$349** | **US$599** |
| Obras activas | 1 | 5 | 15 |
| Usuarios | 5 | 15 | 40 |
| Informes IA/mes | 10 | 30 | 75 |
| Tope de almacenamiento | 25 GB | 100 GB | 300 GB |
| Onboarding (pago único) | US$500 | US$750 | US$1,200 |

**Excedentes:** informe IA US$2.50 · almacenamiento US$0.10/GB/mes · usuario US$5/mes · obra extra US$25/mes.
**Protecciones contractuales:** precios +ITBIS; ajuste anual hasta 10% o inflación (aviso de 60 días); cláusula de uso justo.

### 5.2 Márgenes a costo completo — SOLO INTERNO

| Plan | Precio | Costo maduro | Margen neto |
|---|---|---|---|
| Obra | US$149 | ~US$50 | **~66%** |
| Constructora | US$349 | ~US$80 | **~77%** |
| Empresa | US$599 | ~US$135 | **~77%** |

Contexto: las alternativas importadas (clase Procore/Autodesk) cuestan US$375–miles por mes. Raphel las socava 5–10× y sigue siendo un negocio de software saludable.

### 5.3 Escenarios de ingresos a doce meses

| Escenario | Clientes (mezcla) | MRR | ARR | + onboarding |
|---|---|---|---|---|
| Conservador | 4 (3 Obra, 1 Constructora) | ~US$800 | ~US$9.5 mil | ~US$2.3 mil |
| Base | 10 (4 Obra, 5 Constructora, 1 Empresa) | ~US$2,940 | ~US$35 mil | ~US$7.2 mil |
| Fuerte | 20 (6 Obra, 11 Constructora, 3 Empresa) | ~US$6,530 | ~US$78 mil | ~US$15 mil |

Los costos fijos en cualquiera de estas escalas se mantienen bajo US$300/mes — rentable desde el **primer** cliente.

## 6. Comparación de vías de monetización

| Vía | Efectivo año 1 | Valor a 3 años | Rol del propietario |
|---|---|---|---|
| **A. Venta del activo ahora** | US$40–65 mil + instalación + iguala | ~US$50–70 mil total, cerrado | Salida |
| **B. Licenciamiento (SaaS)** | US$10–35 mil en crecimiento | **Activo de US$125–170 mil+** (3–4× ARR, caso base) y sigue siendo suyo | Propietario-operador |
| **C. Híbrido** | US$30–40 mil (participación mayoritaria) | venta + iguala + 15–25% de participación | Socio/operador |

Guía por tipo de comprador: una constructora que lo quiere para uso interno → A o C en la parte alta del rango. Una casa de software que quiere revenderlo → ellos planean la vía B para sí mismos; cobre en consecuencia (US$60 mil+) o insista en C.

**Reglas de negociación:** nunca regalar el onboarding; descontar con meses gratis, no bajando el precio de lista; cada cliente firmado antes de una venta mueve la valoración de lógica de costo de reposición a lógica de múltiplo de ingresos.

## 7. Riesgos (declarar con honestidad en una diligencia)

- **Pre-ingresos** a la fecha; la validación es cualitativa (un arquitecto en ejercicio condujo dos rondas estructuradas de retroalimentación).
- **Persona clave:** el propietario es el único operador; mitigado por la disciplina de documentación y la estructura de iguala.
- **Dependencias de plataforma:** Netlify, Supabase, Cloudflare, Anthropic — todas sustituibles, pero migrar cuesta esfuerzo.
- **Posicionamiento legal:** la cadena de inalterabilidad es evidencia sólida, pero la certificación formal de firma digital bajo la Ley 126-02 requiere un proveedor certificado — especificada como funcionalidad diferida, a cotizar cuando se demande.
- **Responsabilidad:** un producto comercializado como evidencia legal debería eventualmente contar con seguro de responsabilidad profesional y términos de servicio revisados.

## 8. Posiciones de una línea

**Para un comprador:** *"Operativo hoy, validado en campo, US$35–75/mes de operación, ~US$0.14 por informe IA, US$100 mil+ reconstruirlo — pido US$55 mil con instalación, capacitación y seis meses de soporte por US$3 mil + US$650/mes."*

**Para un cliente:** *"Por menos de lo que cuesta un día de retraso, cada decisión de tu obra queda registrada para siempre."*
