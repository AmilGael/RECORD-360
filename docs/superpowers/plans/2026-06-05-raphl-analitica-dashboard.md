# Analítica — Health Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the Analítica tab as a Red/Yellow/Green health dashboard showing project (general), per-Bloque (medio), and per-Partida (micro) progress plus key risk counts (open Cambios, overdue reminders).

**Architecture:** A pure `healthLevel(progressPct)` helper drives traffic-light badges; the project page already loads segments+partidas with progress, so Analítica reuses that plus two lightweight count queries and renders a new `AnaliticaTab` RSC. No new tables.

**Tech Stack:** Next.js 15 (App Router, RSC), Prisma 6 + Postgres, Vitest, TypeScript.

Source: architect feedback §"charts e indicadores micro/medio/general" + PRD F4.1 (traffic-light health). Run from `web/`. Branch `feat/web-m1-core-loop`; commit directly; do NOT push.

Health thresholds (v1, progress-based; no schedule data yet): 0–33 = red, 34–66 = yellow, 67–100 = green. Risk counts (open Cambios, overdue reminders) are shown alongside, not folded into the color.

---

## File Structure
- `web/src/lib/project/health.ts` — `healthLevel` pure helper. (Task 1)
- `web/src/i18n/dictionaries.ts` — `analitica` strings. (Task 2)
- `web/src/components/analitica-tab.tsx` — the dashboard RSC. (Task 3)
- `web/src/app/app/projects/[id]/page.tsx` — activate tab + data + render. (Task 4)
- `web/src/app/globals.css` — `.health-dot` + `.analitica-*` classes. (Task 4)

---

### Task 1: healthLevel helper

**Files:** Create `web/src/lib/project/health.ts`; Test `web/tests/health.test.ts`

- [ ] **Step 1: Write the failing test** (`web/tests/health.test.ts`):
```typescript
import { describe, it, expect } from "vitest";
import { healthLevel } from "@/lib/project/health";

describe("healthLevel", () => {
  it("red below 34", () => { expect(healthLevel(0)).toBe("red"); expect(healthLevel(33)).toBe("red"); });
  it("yellow 34..66", () => { expect(healthLevel(34)).toBe("yellow"); expect(healthLevel(66)).toBe("yellow"); });
  it("green 67..100", () => { expect(healthLevel(67)).toBe("green"); expect(healthLevel(100)).toBe("green"); });
});
```
- [ ] **Step 2: Run it (fail)** — `npm test -- health` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** (`web/src/lib/project/health.ts`):
```typescript
export type Health = "red" | "yellow" | "green";

/** Traffic-light health from a 0-100 progress percentage (v1: progress-based). */
export function healthLevel(progressPct: number): Health {
  if (progressPct >= 67) return "green";
  if (progressPct >= 34) return "yellow";
  return "red";
}
```
- [ ] **Step 4: Run it (pass)** — `npm test -- health` — Expected: PASS (3).
- [ ] **Step 5: Commit**
```bash
git add web/src/lib/project/health.ts web/tests/health.test.ts
git commit -m "feat(analitica): healthLevel traffic-light helper"
```

---

### Task 2: i18n strings

**Files:** Modify `web/src/i18n/dictionaries.ts`

- [ ] **Step 1:** In the ES `project` object add:
```typescript
      analiticaGeneral: "Salud general",
      analiticaByBloque: "Por bloque",
      analiticaOpenChanges: "Cambios abiertos",
      analiticaOverdue: "Recordatorios vencidos",
      analiticaNoBloques: "Sin bloques todavía.",
```
- [ ] **Step 2:** In the EN `project` object add:
```typescript
      analiticaGeneral: "Overall health",
      analiticaByBloque: "By block",
      analiticaOpenChanges: "Open change requests",
      analiticaOverdue: "Overdue reminders",
      analiticaNoBloques: "No blocks yet.",
```
- [ ] **Step 3:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 4: Commit**
```bash
git add web/src/i18n/dictionaries.ts
git commit -m "i18n: analitica dashboard strings"
```

---

### Task 3: AnaliticaTab component

**Files:** Create `web/src/components/analitica-tab.tsx`

- [ ] **Step 1: Implement** (`web/src/components/analitica-tab.tsx`):
```tsx
import { healthLevel } from "@/lib/project/health";

type PRow = { id: string; name: string; progressPct: number };
type BRow = { id: string; name: string; progress: number; partidas: PRow[] };
type AnaliticaT = {
  general: string; byBloque: string; openChanges: string; overdue: string;
  partidasWord: string; noBloques: string;
};

function Bar({ pct }: { pct: number }) {
  return (
    <div style={{ height: 6, borderRadius: 99, background: "var(--line)", overflow: "hidden", flex: 1, minWidth: 80 }}>
      <i style={{ display: "block", height: "100%", width: `${pct}%`, background: "var(--accent)" }} />
    </div>
  );
}

function Row({ name, pct, sub }: { name: string; pct: number; sub?: string }) {
  return (
    <div className="analitica-row">
      <span className={`health-dot ${healthLevel(pct)}`} aria-hidden="true" />
      <span className="analitica-row-name">{name}{sub ? <span className="text-steel"> · {sub}</span> : null}</span>
      <Bar pct={pct} />
      <span className="analitica-pct mono">{pct}%</span>
    </div>
  );
}

export function AnaliticaTab({ general, bloques, ungrouped, t }: {
  general: { progress: number; partidas: number; openCambios: number; overdueReminders: number };
  bloques: BRow[];
  ungrouped: PRow[];
  t: AnaliticaT;
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <div className="analitica-cards">
        <div className="analitica-card">
          <span className={`health-dot ${healthLevel(general.progress)}`} aria-hidden="true" />
          <strong>{general.progress}%</strong><span>{t.general}</span>
        </div>
        <div className="analitica-card"><strong>{general.partidas}</strong><span>{t.partidasWord}</span></div>
        <div className="analitica-card"><strong>{general.openCambios}</strong><span>{t.openChanges}</span></div>
        <div className="analitica-card"><strong>{general.overdueReminders}</strong><span>{t.overdue}</span></div>
      </div>

      <div className="kicker" style={{ margin: "20px 0 8px" }}>{t.byBloque}</div>
      {bloques.length === 0 && ungrouped.length === 0 && <p className="text-steel">{t.noBloques}</p>}
      <div className="repo-list">
        {bloques.map((b) => (
          <div key={b.id} style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
            <Row name={b.name} pct={b.progress} sub={`${b.partidas.length} ${t.partidasWord}`} />
            <div style={{ marginTop: 8, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
              {b.partidas.map((p) => <Row key={p.id} name={p.name} pct={p.progressPct} />)}
            </div>
          </div>
        ))}
        {ungrouped.length > 0 && (
          <div style={{ padding: "12px 14px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {ungrouped.map((p) => <Row key={p.id} name={p.name} pct={p.progressPct} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```
- [ ] **Step 2:** `npx tsc --noEmit` → exit 0 (component compiles standalone).
- [ ] **Step 3: Commit**
```bash
git add web/src/components/analitica-tab.tsx
git commit -m "feat(analitica): health dashboard component (general/bloque/partida)"
```

---

### Task 4: Activate the tab + wire data + styles

**Files:** Modify `web/src/app/app/projects/[id]/page.tsx`, `web/src/app/globals.css`

- [ ] **Step 1: Import** — add to the icons/imports area of `page.tsx`:
```tsx
import { AnaliticaTab } from "@/components/analitica-tab";
```
- [ ] **Step 2: Extend activeTab** — change the `activeTab` line to include analitica:
```tsx
  const activeTab = tab === "cambios" ? "cambios" : tab === "planos" ? "planos" : tab === "analitica" ? "analitica" : "code";
```
- [ ] **Step 3: Compute analytics data** — after the existing `now` constant (around line 130), add:
```tsx
  const openCambios = activeTab === "analitica"
    ? await prisma.changeRequest.count({ where: { projectId: id, status: "OPEN" } })
    : 0;
  const overdueReminders = activeTab === "analitica"
    ? await prisma.registro.count({ where: { partida: { projectId: id, deletedAt: null }, reminderDueAt: { lt: now }, reminderResolvedAt: null } })
    : 0;
  const analiticaBloques = project.segments.map((s) => ({
    id: s.id, name: s.name, progress: projectProgress(s.partidas),
    partidas: s.partidas.map((p) => ({ id: p.id, name: p.name, progressPct: p.progressPct })),
  }));
  const analiticaUngrouped = project.partidas.map((p) => ({ id: p.id, name: p.name, progressPct: p.progressPct }));
```
- [ ] **Step 4: Make the Analítica tab a Link** — replace the disabled Analítica `<span>` in the tab bar with:
```tsx
        <Link href={`/app/projects/${id}?tab=analitica`} className={`tab ${activeTab === "analitica" ? "is-on" : ""}`} aria-current={activeTab === "analitica" ? "page" : undefined}><BarChart size={13} />{P.tabAnalytics}</Link>
```
(Leave the Ajustes `<span>` stub as-is.)
- [ ] **Step 5: Add the render branch** — add an `activeTab === "analitica"` arm to the body conditional, before the final `code` arm (i.e., after the `planos` arm):
```tsx
      ) : activeTab === "analitica" ? (
        <AnaliticaTab
          general={{ progress: avg, partidas: allPartidas.length, openCambios, overdueReminders }}
          bloques={analiticaBloques}
          ungrouped={analiticaUngrouped}
          t={{ general: P.analiticaGeneral, byBloque: P.analiticaByBloque, openChanges: P.analiticaOpenChanges, overdue: P.analiticaOverdue, partidasWord: P.partidasWord, noBloques: P.analiticaNoBloques }}
        />
      ) : (
```
- [ ] **Step 6: Add CSS** — append to `globals.css`:
```css
/* ---------- analitica (health dashboard) ---------- */
.health-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.health-dot.green { background: var(--state-active); }
.health-dot.yellow { background: #b08a2e; }
.health-dot.red { background: var(--state-blocked); }
.analitica-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.analitica-card { border: 1px solid var(--line); border-radius: var(--radius); background: var(--paper-2); padding: 14px 16px; display: flex; flex-direction: column; gap: 2px; }
.analitica-card .health-dot { margin-bottom: 4px; }
.analitica-card strong { font-family: var(--font-serif), Georgia, serif; font-size: 1.5rem; }
.analitica-card span { font-family: var(--font-mono), monospace; font-size: 0.64rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--steel); }
.analitica-row { display: flex; align-items: center; gap: 10px; }
.analitica-row-name { font-size: 0.88rem; min-width: 120px; }
.analitica-pct { font-size: 0.72rem; color: var(--steel); min-width: 38px; text-align: right; }
```
- [ ] **Step 7: Verify** — `npx tsc --noEmit && npm run build` → exit 0 / success (Analítica tab now navigable).
- [ ] **Step 8: Commit**
```bash
git add "web/src/app/app/projects/[id]/page.tsx" web/src/app/globals.css
git commit -m "feat(analitica): activate tab + render health dashboard"
```

---

### Task 5: Full verification
- [ ] `npm test` → all green (existing + `health`).
- [ ] `npm run lint && npx tsc --noEmit && npm run build` → clean.
- [ ] `rg -n --pcre2 '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}]' src/` → no emoji.
- [ ] Manual: open a project → **Analítica** tab is clickable → general cards (progress + R/Y/G dot, partidas, open Cambios, overdue reminders) + per-Bloque rows each with health dot + progress bar + nested per-Partida rows. ES⇄EN.

---

## Self-Review Notes
- **Coverage:** micro (per-partida rows) / medio (per-bloque) / general (project cards) + R/Y/G via `healthLevel` + risk counts (open Cambios, overdue reminders). Matches the feedback's "charts/indicadores micro/medio/general" + PRD F4.1 traffic light.
- **Type consistency:** `healthLevel` (Task 1) → `AnaliticaTab` (Task 3) → page wiring (Task 4). `AnaliticaT` keys map to `P.analitica*` (Task 2). `analiticaBloques`/`analiticaUngrouped` shapes match `BRow`/`PRow`.
- **No new queries on non-analitica tabs** (count queries gated by `activeTab === "analitica"`); per-bloque/partida progress reuses already-loaded data.
- **v1 scope:** health is progress-based (no schedule baseline yet); risk counts shown separately. NLP risk detection (PRD F4.2) is out of scope.
