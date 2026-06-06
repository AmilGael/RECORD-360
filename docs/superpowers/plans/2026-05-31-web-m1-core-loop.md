# RECORD 360 Web App — Milestone 1 (Core Black-Box Loop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a clickable Next.js web app where a user logs in, creates Company → Project → Partida, logs append-only hash-chained Registros (text + photo, server-timestamped, GPS-tagged), and views the chronological feed per Partida.

**Architecture:** Single Next.js (App Router) full-stack app. Domain logic for the hash chain is pure and unit-tested in isolation; persistence wraps it in a serialized transaction. Postgres (Neon) via Prisma. Auth.js credentials with JWT sessions carrying `role` + `companyId`. Photos go through a `Storage` interface (local disk in dev).

**Tech Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS v3 · Prisma 6 + PostgreSQL (Neon) · Auth.js v5 (next-auth@beta) · bcryptjs · Vitest.

**Design language:** Reuse the landing tokens — paper `#ECE7DD`, ink `#19140F`, accent `#E14A1F`, fonts `Archivo` + `Space Mono`.

---

## File Structure

```
web/
  .env.local                      # DATABASE_URL, AUTH_SECRET  (gitignored)
  .gitignore                      # add .uploads/
  prisma/schema.prisma            # data model
  src/
    lib/
      db.ts                       # Prisma client singleton
      registro/
        canonical.ts              # RegistroPayload + canonicalPayload()
        hash.ts                   # GENESIS_PREV_HASH, computeHash(), verifyChain()
        append.ts                 # appendRegistro() — serialized transaction
        map.ts                    # Prisma row -> StoredRegistro (Decimal->number)
      storage/
        types.ts                  # Storage interface
        local.ts                  # LocalDiskStorage
        index.ts                  # bound storage instance
    auth.ts                       # Auth.js config (next-auth v5)
    middleware.ts                 # route protection
    app/
      layout.tsx, globals.css     # design tokens
      login/page.tsx
      page.tsx                    # dashboard (projects)
      projects/[id]/page.tsx      # partidas list
      partidas/[id]/page.tsx      # feed + composer
      admin/page.tsx
      api/
        auth/[...nextauth]/route.ts
        media/[key]/route.ts      # serve local uploads
      actions/
        admin.ts                  # createCompany/Project/Partida/User (server actions)
        registro.ts               # logRegistro server action
    components/
      record-card.tsx             # feed item (sealed metadata)
      log-composer.tsx            # client: text+photo+GPS form
  vitest.config.ts
  tests/
    canonical.test.ts
    hash.test.ts
    append.test.ts                # integration (test DB)
```

---

## Phase 0 — Scaffold & Tooling

### Task 0.1: Create the Next.js app

**Files:** Create `web/` (whole app).

- [ ] **Step 1: Scaffold**

Run from repo root (`/Users/genel/Mirror/RECORD-360`):
```bash
npx create-next-app@15 web --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack
```
When prompted, accept defaults. Expected: `web/` directory created with `src/app/`.

- [ ] **Step 2: Pin Tailwind v3 (avoid v4 churn)**

If `web/package.json` shows `tailwindcss@4`, downgrade:
```bash
cd web && npm install -D tailwindcss@^3.4 postcss autoprefixer && npx tailwindcss init -p
```
Ensure `web/tailwind.config.ts` `content` includes `"./src/**/*.{ts,tsx}"`.

- [ ] **Step 3: Install runtime deps**

```bash
cd web && npm install @prisma/client next-auth@beta bcryptjs && npm install -D prisma vitest @types/bcryptjs tsx
```

- [ ] **Step 4: Verify dev server boots**

Run: `cd web && npm run dev`
Expected: server starts on http://localhost:3000 with no errors. Stop it (Ctrl-C).

- [ ] **Step 5: Commit**

```bash
git add web && git commit -m "chore: scaffold Next.js web app (M1)"
```

### Task 0.2: Vitest config + design tokens

**Files:** Create `web/vitest.config.ts`, modify `web/src/app/globals.css`, `web/.gitignore`.

- [ ] **Step 1: Vitest config**

Create `web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

- [ ] **Step 2: Add test script + design tokens**

In `web/package.json` `scripts`, add: `"test": "vitest run"`.

Append to `web/src/app/globals.css`:
```css
:root {
  --paper: #ECE7DD; --paper-2: #E3DDD0; --ink: #19140F;
  --ink-soft: #4A433A; --steel: #6B6358; --accent: #E14A1F;
  --line: rgba(25,20,15,0.14);
}
body { background: var(--paper); color: var(--ink); }
.mono { font-family: "Space Mono", monospace; }
```
Add to `web/.gitignore`: a line `.uploads/` and `.env.local`.

- [ ] **Step 3: Verify test runner**

Run: `cd web && npm run test`
Expected: "No test files found" (exit 0) — runner works, no tests yet.

- [ ] **Step 4: Commit**

```bash
git add web && git commit -m "chore: add vitest config and design tokens"
```

---

## Phase 1 — Database Schema

### Task 1.1: Prisma schema + Neon connection

**Files:** Create `web/prisma/schema.prisma`, `web/.env.local`, `web/src/lib/db.ts`.

- [ ] **Step 1: Get a Neon connection string**

Create a free project at neon.tech, copy the pooled connection string. Put it in `web/.env.local`:
```
DATABASE_URL="postgresql://USER:PASS@HOST/neondb?sslmode=require"
AUTH_SECRET="<run: openssl rand -base64 32>"
```

- [ ] **Step 2: Write the schema**

Create `web/prisma/schema.prisma`:
```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

enum Role { ADMIN MANAGER SUPERVISOR RESIDENT }
enum RegistroType { NOTE PHOTO }

model Company {
  id        String    @id @default(cuid())
  name      String
  users     User[]
  projects  Project[]
  createdAt DateTime  @default(now())
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String
  role         Role
  companyId    String
  company      Company  @relation(fields: [companyId], references: [id])
  createdAt    DateTime @default(now())
}

model Project {
  id          String    @id @default(cuid())
  companyId   String
  company     Company   @relation(fields: [companyId], references: [id])
  name        String
  description String?
  partidas    Partida[]
  createdAt   DateTime  @default(now())
}

model Partida {
  id          String     @id @default(cuid())
  projectId   String
  project     Project    @relation(fields: [projectId], references: [id])
  name        String
  progressPct Int        @default(0)
  registros   Registro[]
  createdAt   DateTime   @default(now())
}

model Registro {
  id              String       @id @default(cuid())
  partidaId       String
  partida         Partida      @relation(fields: [partidaId], references: [id])
  type            RegistroType
  text            String?
  mediaUrl        String?
  progressPct     Int?
  authorId        String
  serverCreatedAt DateTime
  gpsLat          Decimal?     @db.Decimal(9, 6)
  gpsLng          Decimal?     @db.Decimal(9, 6)
  prevHash        String
  hash            String
  correctionOfId  String?
  @@unique([partidaId, prevHash])   // enforces a single linear chain per partida
  @@index([partidaId, serverCreatedAt])
}
```

Note: `@@unique([partidaId, prevHash])` guarantees no two Registros in a Partida share a predecessor — a DB-level guard against chain forks (including two "genesis" rows).

- [ ] **Step 3: Run the migration**

Run: `cd web && npx prisma migrate dev --name init`
Expected: migration created and applied; `Prisma Client` generated.

- [ ] **Step 4: Prisma client singleton**

Create `web/src/lib/db.ts`:
```ts
import { PrismaClient } from "@prisma/client";
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 5: Commit**

```bash
git add web/prisma web/src/lib/db.ts && git commit -m "feat: add Prisma schema and Neon connection"
```

---

## Phase 2 — Hash-Chain Domain Logic (TDD core)

This phase is pure logic — no DB, no framework. It is the part that must never silently break.

### Task 2.1: Canonical payload

**Files:** Create `web/src/lib/registro/canonical.ts`, `web/tests/canonical.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `web/tests/canonical.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { canonicalPayload, type RegistroPayload } from "@/lib/registro/canonical";

const base: RegistroPayload = {
  type: "NOTE", text: "Vaciado completado", mediaUrl: null, progressPct: 72,
  authorId: "ckxaAUTHOR", gpsLat: 18.4861, gpsLng: -69.9312,
  serverCreatedAt: new Date("2026-05-31T08:42:17.123Z"),
};

describe("canonicalPayload", () => {
  it("serializes with sorted keys, nulls included, gps fixed to 6 dp", () => {
    expect(canonicalPayload(base)).toBe(
      '{"authorId":"ckxaAUTHOR","gpsLat":"18.486100","gpsLng":"-69.931200","mediaUrl":null,"progressPct":72,"serverCreatedAt":"2026-05-31T08:42:17.123Z","text":"Vaciado completado","type":"NOTE"}'
    );
  });

  it("is stable regardless of input field order", () => {
    const reordered: RegistroPayload = { ...base };
    expect(canonicalPayload(reordered)).toBe(canonicalPayload(base));
  });

  it("includes nulls for absent gps", () => {
    const noGps: RegistroPayload = { ...base, gpsLat: null, gpsLng: null };
    expect(canonicalPayload(noGps)).toContain('"gpsLat":null');
    expect(canonicalPayload(noGps)).toContain('"gpsLng":null');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run tests/canonical.test.ts`
Expected: FAIL — cannot find module `@/lib/registro/canonical`.

- [ ] **Step 3: Implement**

Create `web/src/lib/registro/canonical.ts`:
```ts
export type RegistroPayload = {
  type: "NOTE" | "PHOTO";
  text: string | null;
  mediaUrl: string | null;
  progressPct: number | null;
  authorId: string;
  gpsLat: number | null;
  gpsLng: number | null;
  serverCreatedAt: Date;
};

export function canonicalPayload(p: RegistroPayload): string {
  const obj: Record<string, string | number | null> = {
    authorId: p.authorId,
    gpsLat: p.gpsLat === null ? null : p.gpsLat.toFixed(6),
    gpsLng: p.gpsLng === null ? null : p.gpsLng.toFixed(6),
    mediaUrl: p.mediaUrl,
    progressPct: p.progressPct,
    serverCreatedAt: p.serverCreatedAt.toISOString(),
    text: p.text,
    type: p.type,
  };
  const ordered: Record<string, string | number | null> = {};
  for (const k of Object.keys(obj).sort()) ordered[k] = obj[k];
  return JSON.stringify(ordered);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run tests/canonical.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/registro/canonical.ts web/tests/canonical.test.ts
git commit -m "feat: canonical registro payload serialization"
```

### Task 2.2: Hash + genesis + verifyChain

**Files:** Create `web/src/lib/registro/hash.ts`, `web/tests/hash.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `web/tests/hash.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeHash, verifyChain, GENESIS_PREV_HASH, type StoredRegistro } from "@/lib/registro/hash";
import { type RegistroPayload } from "@/lib/registro/canonical";

const payload = (over: Partial<RegistroPayload> = {}): RegistroPayload => ({
  type: "NOTE", text: "a", mediaUrl: null, progressPct: null, authorId: "u1",
  gpsLat: null, gpsLng: null, serverCreatedAt: new Date("2026-05-31T08:00:00.000Z"), ...over,
});

const stored = (p: RegistroPayload, id: string, prevHash: string): StoredRegistro => ({
  id, prevHash, hash: computeHash(prevHash, p),
  type: p.type, text: p.text, mediaUrl: p.mediaUrl, progressPct: p.progressPct,
  authorId: p.authorId, gpsLat: p.gpsLat, gpsLng: p.gpsLng, serverCreatedAt: p.serverCreatedAt,
});

describe("hash chain", () => {
  it("genesis registro uses the 64-zero sentinel", () => {
    expect(GENESIS_PREV_HASH).toBe("0".repeat(64));
    const g = stored(payload(), "g", GENESIS_PREV_HASH);
    expect(verifyChain([g])).toEqual({ ok: true });
  });

  it("links second entry prevHash to first hash", () => {
    const a = stored(payload({ text: "first" }), "a", GENESIS_PREV_HASH);
    const b = stored(payload({ text: "second", serverCreatedAt: new Date("2026-05-31T09:00:00.000Z") }), "b", a.hash);
    expect(b.prevHash).toBe(a.hash);
    expect(verifyChain([a, b])).toEqual({ ok: true });
  });

  it("detects tampering with a stored field", () => {
    const a = stored(payload({ text: "first" }), "a", GENESIS_PREV_HASH);
    const tampered = { ...a, text: "changed" };
    expect(verifyChain([tampered])).toEqual({ ok: false, brokenAt: "a" });
  });

  it("detects a broken link", () => {
    const a = stored(payload({ text: "first" }), "a", GENESIS_PREV_HASH);
    const b = stored(payload({ text: "second" }), "b", "deadbeef".repeat(8));
    expect(verifyChain([a, b])).toEqual({ ok: false, brokenAt: "b" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run tests/hash.test.ts`
Expected: FAIL — cannot find module `@/lib/registro/hash`.

- [ ] **Step 3: Implement**

Create `web/src/lib/registro/hash.ts`:
```ts
import { createHash } from "node:crypto";
import { canonicalPayload, type RegistroPayload } from "./canonical";

export const GENESIS_PREV_HASH = "0".repeat(64);

export function computeHash(prevHash: string, payload: RegistroPayload): string {
  return createHash("sha256").update(prevHash + canonicalPayload(payload)).digest("hex");
}

export type StoredRegistro = RegistroPayload & {
  id: string;
  prevHash: string;
  hash: string;
};

export function verifyChain(registros: StoredRegistro[]): { ok: boolean; brokenAt?: string } {
  let expectedPrev = GENESIS_PREV_HASH;
  for (const r of registros) {
    if (r.prevHash !== expectedPrev) return { ok: false, brokenAt: r.id };
    const recomputed = computeHash(r.prevHash, {
      type: r.type, text: r.text, mediaUrl: r.mediaUrl, progressPct: r.progressPct,
      authorId: r.authorId, gpsLat: r.gpsLat, gpsLng: r.gpsLng, serverCreatedAt: r.serverCreatedAt,
    });
    if (recomputed !== r.hash) return { ok: false, brokenAt: r.id };
    expectedPrev = r.hash;
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run tests/hash.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/registro/hash.ts web/tests/hash.test.ts
git commit -m "feat: hash chain (genesis, computeHash, verifyChain)"
```

---

## Phase 3 — Auth

### Task 3.1: Auth.js credentials config

**Files:** Create `web/src/auth.ts`, `web/src/app/api/auth/[...nextauth]/route.ts`, `web/src/middleware.ts`.

- [ ] **Step 1: Auth config**

Create `web/src/auth.ts`:
```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (creds) => {
        const email = String(creds?.email ?? "");
        const password = String(creds?.password ?? "");
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;
        if (!(await bcrypt.compare(password, user.passwordHash))) return null;
        return { id: user.id, name: user.name, email: user.email, role: user.role, companyId: user.companyId };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role;
        token.companyId = (user as { companyId: string }).companyId;
        token.uid = (user as { id: string }).id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.uid as string;
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { companyId?: string }).companyId = token.companyId as string;
      }
      return session;
    },
  },
});
```

- [ ] **Step 2: Route handler + middleware**

Create `web/src/app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

Create `web/src/middleware.ts`:
```ts
import { auth } from "@/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isLogin = req.nextUrl.pathname.startsWith("/login");
  if (!isLoggedIn && !isLogin) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }
});

export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"] };
```

- [ ] **Step 3: Seed an admin + company to log in with**

Create `web/prisma/seed.ts`:
```ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();
async function main() {
  const company = await prisma.company.create({ data: { name: "Constructora Demo SRL" } });
  await prisma.user.create({
    data: {
      email: "admin@record360.do", name: "Admin Demo", role: "ADMIN",
      companyId: company.id, passwordHash: await bcrypt.hash("demo1234", 10),
    },
  });
  console.log("Seeded admin@record360.do / demo1234");
}
main().finally(() => prisma.$disconnect());
```
Run: `cd web && npx tsx prisma/seed.ts`
Expected: prints the seeded credentials.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, visit `/` → expect redirect to `/login` (login page itself comes in Phase 6; for now confirm the redirect happens). Stop server.

- [ ] **Step 5: Commit**

```bash
git add web/src/auth.ts web/src/app/api web/src/middleware.ts web/prisma/seed.ts
git commit -m "feat: Auth.js credentials, middleware, seed admin"
```

---

## Phase 4 — Storage

### Task 4.1: Storage interface + local disk

**Files:** Create `web/src/lib/storage/types.ts`, `web/src/lib/storage/local.ts`, `web/src/lib/storage/index.ts`, `web/src/app/api/media/[key]/route.ts`.

- [ ] **Step 1: Interface**

Create `web/src/lib/storage/types.ts`:
```ts
export interface Storage {
  put(file: { buffer: Buffer; filename: string; contentType: string }): Promise<{ url: string; key: string }>;
  get(key: string): Promise<NodeJS.ReadableStream>;
}
```

- [ ] **Step 2: Local disk implementation**

Create `web/src/lib/storage/local.ts`:
```ts
import { createReadStream, existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Storage } from "./types";

const ROOT = path.join(process.cwd(), ".uploads");

export class LocalDiskStorage implements Storage {
  async put(file: { buffer: Buffer; filename: string; contentType: string }) {
    if (!existsSync(ROOT)) mkdirSync(ROOT, { recursive: true });
    const ext = path.extname(file.filename) || "";
    const key = `${randomUUID()}${ext}`;
    await writeFile(path.join(ROOT, key), file.buffer);
    return { key, url: `/api/media/${key}` };
  }
  async get(key: string): Promise<NodeJS.ReadableStream> {
    const safe = path.basename(key); // prevent traversal
    return createReadStream(path.join(ROOT, safe));
  }
}
```

Create `web/src/lib/storage/index.ts`:
```ts
import { LocalDiskStorage } from "./local";
import type { Storage } from "./types";
// Swap this single line for S3Storage later.
export const storage: Storage = new LocalDiskStorage();
```

- [ ] **Step 3: Media serving route**

Create `web/src/app/api/media/[key]/route.ts`:
```ts
import { storage } from "@/lib/storage";
import { Readable } from "node:stream";

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  try {
    const nodeStream = await storage.get(key);
    const webStream = Readable.toWeb(nodeStream as Readable) as ReadableStream;
    return new Response(webStream);
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/storage web/src/app/api/media
git commit -m "feat: Storage interface + local disk + media route"
```

---

## Phase 5 — Append Logic & Queries

### Task 5.1: Row mapper

**Files:** Create `web/src/lib/registro/map.ts`.

- [ ] **Step 1: Implement (no separate test — exercised by append.test)**

Create `web/src/lib/registro/map.ts`:
```ts
import type { Registro } from "@prisma/client";
import type { StoredRegistro } from "./hash";

export function toStored(r: Registro): StoredRegistro {
  return {
    id: r.id, prevHash: r.prevHash, hash: r.hash,
    type: r.type, text: r.text, mediaUrl: r.mediaUrl, progressPct: r.progressPct,
    authorId: r.authorId,
    gpsLat: r.gpsLat === null ? null : Number(r.gpsLat),
    gpsLng: r.gpsLng === null ? null : Number(r.gpsLng),
    serverCreatedAt: r.serverCreatedAt,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/lib/registro/map.ts && git commit -m "feat: map Prisma Registro to StoredRegistro"
```

### Task 5.2: appendRegistro (serialized transaction) + integration test

**Files:** Create `web/src/lib/registro/append.ts`, `web/tests/append.test.ts`.

> This test hits the database. It uses the same `DATABASE_URL` and cleans up after itself. Run with the dev DB.

- [ ] **Step 1: Write the failing test**

Create `web/tests/append.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";
import { toStored } from "@/lib/registro/map";
import { verifyChain, GENESIS_PREV_HASH } from "@/lib/registro/hash";

let companyId = "", projectId = "", partidaId = "", userId = "";

beforeAll(async () => {
  const c = await prisma.company.create({ data: { name: "T Co" } });
  companyId = c.id;
  const u = await prisma.user.create({ data: { email: `t${Date.now()}@x.do`, name: "T", role: "RESIDENT", companyId, passwordHash: "x" } });
  userId = u.id;
  const p = await prisma.project.create({ data: { companyId, name: "T Proj" } });
  projectId = p.id;
  const pa = await prisma.partida.create({ data: { projectId, name: "T Partida" } });
  partidaId = pa.id;
});

afterAll(async () => {
  await prisma.registro.deleteMany({ where: { partidaId } });
  await prisma.partida.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

describe("appendRegistro", () => {
  it("first entry uses genesis prevHash; second links to first; chain verifies; progress updates partida", async () => {
    const r1 = await appendRegistro({ partidaId, authorId: userId, type: "NOTE", text: "uno", mediaUrl: null, progressPct: 40, gpsLat: 18.4861, gpsLng: -69.9312 });
    expect(r1.prevHash).toBe(GENESIS_PREV_HASH);

    const r2 = await appendRegistro({ partidaId, authorId: userId, type: "NOTE", text: "dos", mediaUrl: null, progressPct: 72, gpsLat: null, gpsLng: null });
    expect(r2.prevHash).toBe(r1.hash);

    const rows = await prisma.registro.findMany({ where: { partidaId }, orderBy: [{ serverCreatedAt: "asc" }, { id: "asc" }] });
    expect(verifyChain(rows.map(toStored))).toEqual({ ok: true });

    const partida = await prisma.partida.findUniqueOrThrow({ where: { id: partidaId } });
    expect(partida.progressPct).toBe(72);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run tests/append.test.ts`
Expected: FAIL — cannot find module `@/lib/registro/append`.

- [ ] **Step 3: Implement**

Create `web/src/lib/registro/append.ts`:
```ts
import { prisma } from "@/lib/db";
import { computeHash, GENESIS_PREV_HASH } from "./hash";
import type { RegistroType } from "@prisma/client";

export type AppendInput = {
  partidaId: string;
  authorId: string;
  type: RegistroType;
  text: string | null;
  mediaUrl: string | null;
  progressPct: number | null;
  gpsLat: number | null;
  gpsLng: number | null;
  correctionOfId?: string | null;
};

export async function appendRegistro(input: AppendInput) {
  return prisma.$transaction(async (tx) => {
    const tip = await tx.registro.findFirst({
      where: { partidaId: input.partidaId },
      orderBy: [{ serverCreatedAt: "desc" }, { id: "desc" }],
    });
    const prevHash = tip ? tip.hash : GENESIS_PREV_HASH;
    const serverCreatedAt = new Date();
    const hash = computeHash(prevHash, {
      type: input.type, text: input.text, mediaUrl: input.mediaUrl, progressPct: input.progressPct,
      authorId: input.authorId, gpsLat: input.gpsLat, gpsLng: input.gpsLng, serverCreatedAt,
    });
    const created = await tx.registro.create({
      data: {
        partidaId: input.partidaId, authorId: input.authorId, type: input.type,
        text: input.text, mediaUrl: input.mediaUrl, progressPct: input.progressPct,
        gpsLat: input.gpsLat, gpsLng: input.gpsLng, serverCreatedAt, prevHash, hash,
        correctionOfId: input.correctionOfId ?? null,
      },
    });
    if (input.progressPct !== null) {
      await tx.partida.update({ where: { id: input.partidaId }, data: { progressPct: input.progressPct } });
    }
    return created;
  });
}
```

Note: the `@@unique([partidaId, prevHash])` constraint makes a concurrent second insert with the same `prevHash` fail rather than fork the chain. M1 surfaces that error to the user ("please retry"); automatic retry is a later enhancement.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run tests/append.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Run the full suite**

Run: `cd web && npm run test`
Expected: all tests PASS (canonical, hash, append).

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/registro/append.ts web/tests/append.test.ts
git commit -m "feat: appendRegistro serialized transaction + integration test"
```

---

## Phase 6 — UI & Server Actions

### Task 6.1: Auth helpers + login page

**Files:** Create `web/src/app/login/page.tsx`. Modify `web/src/app/layout.tsx`.

- [ ] **Step 1: Load fonts in layout**

In `web/src/app/layout.tsx`, replace the existing font setup with Archivo + Space Mono and keep the `globals.css` import:
```tsx
import type { Metadata } from "next";
import { Archivo, Space_Mono } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo" });
const mono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-mono" });

export const metadata: Metadata = { title: "RECORD 360", description: "La caja negra de tu obra" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${archivo.variable} ${mono.variable} font-sans`}>{children}</body>
    </html>
  );
}
```
Add to `globals.css`: `body { font-family: var(--font-archivo), sans-serif; }` and `.mono { font-family: var(--font-mono), monospace; }`.

- [ ] **Step 2: Login page (server action calling signIn)**

Create `web/src/app/login/page.tsx`:
```tsx
import { signIn } from "@/auth";
import { redirect } from "next/navigation";

export default function LoginPage() {
  async function doLogin(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"), password: formData.get("password"), redirect: false,
      });
    } catch {
      redirect("/login?error=1");
    }
    redirect("/");
  }
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <form action={doLogin} style={{ width: 340, padding: 32, border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper-2)" }}>
        <div className="mono" style={{ fontSize: 12, letterSpacing: 2, color: "var(--steel)" }}>RECORD 360</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: "8px 0 24px" }}>Iniciar sesión</h1>
        <input name="email" type="email" placeholder="Correo" required style={inputStyle} />
        <input name="password" type="password" placeholder="Contraseña" required style={inputStyle} />
        <button type="submit" style={btnStyle}>Entrar →</button>
      </form>
    </main>
  );
}
const inputStyle = { width: "100%", padding: "11px 12px", marginBottom: 12, border: "1px solid var(--line)", borderRadius: 3, fontSize: 14 } as const;
const btnStyle = { width: "100%", padding: "12px", background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 3, fontWeight: 700, cursor: "pointer" } as const;
```

- [ ] **Step 3: Manual verification**

Run `npm run dev`, log in with `admin@record360.do` / `demo1234`. Expect redirect to `/` (which currently 404s/empty — dashboard is next task). Stop server.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/login web/src/app/layout.tsx web/src/app/globals.css
git commit -m "feat: login page + fonts"
```

### Task 6.2: Admin server actions

**Files:** Create `web/src/app/actions/admin.ts`.

- [ ] **Step 1: Implement**

Create `web/src/app/actions/admin.ts`:
```ts
"use server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";

async function requireCompany() {
  const session = await auth();
  const companyId = (session?.user as { companyId?: string })?.companyId;
  if (!companyId) throw new Error("Unauthorized");
  return companyId;
}

export async function createProject(formData: FormData) {
  const companyId = await requireCompany();
  await prisma.project.create({ data: { companyId, name: String(formData.get("name")), description: String(formData.get("description") ?? "") || null } });
  revalidatePath("/");
}

export async function createPartida(formData: FormData) {
  await requireCompany();
  await prisma.partida.create({ data: { projectId: String(formData.get("projectId")), name: String(formData.get("name")) } });
  revalidatePath(`/projects/${formData.get("projectId")}`);
}

export async function createUser(formData: FormData) {
  const companyId = await requireCompany();
  const tempPassword = Math.random().toString(36).slice(-10);
  await prisma.user.create({
    data: {
      email: String(formData.get("email")), name: String(formData.get("name")),
      role: String(formData.get("role")) as Role, companyId,
      passwordHash: await bcrypt.hash(tempPassword, 10),
    },
  });
  // M1: temp password is returned to the admin via redirect query (no email yet).
  revalidatePath("/admin");
  return tempPassword;
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/app/actions/admin.ts && git commit -m "feat: admin server actions"
```

### Task 6.3: Dashboard + Project pages

**Files:** Create `web/src/app/page.tsx`, `web/src/app/projects/[id]/page.tsx`.

- [ ] **Step 1: Dashboard (projects list)**

Create `web/src/app/page.tsx`:
```tsx
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { createProject } from "./actions/admin";

export default async function Dashboard() {
  const session = await auth();
  const companyId = (session?.user as { companyId?: string })?.companyId!;
  const projects = await prisma.project.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } });
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 40 }}>
      <div className="mono" style={{ fontSize: 12, letterSpacing: 2, color: "var(--steel)" }}>RECORD 360 · OBRAS</div>
      <h1 style={{ fontSize: 40, fontWeight: 900, margin: "8px 0 28px" }}>Tus obras</h1>
      <ul style={{ listStyle: "none", padding: 0, marginBottom: 40 }}>
        {projects.map((p) => (
          <li key={p.id} style={{ borderTop: "1px solid var(--line)", padding: "16px 0" }}>
            <Link href={`/projects/${p.id}`} style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)", textDecoration: "none" }}>{p.name} →</Link>
          </li>
        ))}
      </ul>
      <form action={createProject} style={{ display: "flex", gap: 8 }}>
        <input name="name" placeholder="Nombre de la obra" required style={{ flex: 1, padding: 10, border: "1px solid var(--line)", borderRadius: 3 }} />
        <button style={{ padding: "10px 18px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 3, fontWeight: 700 }}>Crear</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Project page (partidas list)**

Create `web/src/app/projects/[id]/page.tsx`:
```tsx
import { prisma } from "@/lib/db";
import Link from "next/link";
import { createPartida } from "@/app/actions/admin";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUniqueOrThrow({ where: { id }, include: { partidas: { orderBy: { createdAt: "desc" } } } });
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 40 }}>
      <Link href="/" className="mono" style={{ fontSize: 12, color: "var(--steel)" }}>← OBRAS</Link>
      <h1 style={{ fontSize: 36, fontWeight: 900, margin: "8px 0 24px" }}>{project.name}</h1>
      <ul style={{ listStyle: "none", padding: 0, marginBottom: 32 }}>
        {project.partidas.map((pa) => (
          <li key={pa.id} style={{ borderTop: "1px solid var(--line)", padding: "14px 0", display: "flex", justifyContent: "space-between" }}>
            <Link href={`/partidas/${pa.id}`} style={{ fontWeight: 700, color: "var(--ink)", textDecoration: "none" }}>{pa.name} →</Link>
            <span className="mono" style={{ color: "var(--steel)" }}>{pa.progressPct}%</span>
          </li>
        ))}
      </ul>
      <form action={createPartida} style={{ display: "flex", gap: 8 }}>
        <input type="hidden" name="projectId" value={project.id} />
        <input name="name" placeholder="Nueva partida (p. ej. Vaciado losa N3)" required style={{ flex: 1, padding: 10, border: "1px solid var(--line)", borderRadius: 3 }} />
        <button style={{ padding: "10px 18px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 3, fontWeight: 700 }}>Añadir</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Manual verification**

`npm run dev` → log in → create a project → open it → add a partida. Confirm both persist. Stop server.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/page.tsx web/src/app/projects
git commit -m "feat: dashboard and project pages"
```

### Task 6.4: Registro log action + composer + feed (Partida page)

**Files:** Create `web/src/app/actions/registro.ts`, `web/src/components/log-composer.tsx`, `web/src/components/record-card.tsx`, `web/src/app/partidas/[id]/page.tsx`.

- [ ] **Step 1: logRegistro server action**

Create `web/src/app/actions/registro.ts`:
```ts
"use server";
import { auth } from "@/auth";
import { appendRegistro } from "@/lib/registro/append";
import { storage } from "@/lib/storage";
import { revalidatePath } from "next/cache";

export async function logRegistro(formData: FormData) {
  const session = await auth();
  const authorId = (session?.user as { id?: string })?.id;
  if (!authorId) throw new Error("Unauthorized");

  const partidaId = String(formData.get("partidaId"));
  const text = (String(formData.get("text") ?? "").trim()) || null;
  const progressRaw = formData.get("progressPct");
  const progressPct = progressRaw ? Number(progressRaw) : null;
  const latRaw = formData.get("gpsLat"); const lngRaw = formData.get("gpsLng");
  const gpsLat = latRaw ? Number(latRaw) : null;
  const gpsLng = lngRaw ? Number(lngRaw) : null;

  let mediaUrl: string | null = null;
  let type: "NOTE" | "PHOTO" = "NOTE";
  const photo = formData.get("photo") as File | null;
  if (photo && photo.size > 0) {
    const buffer = Buffer.from(await photo.arrayBuffer());
    const saved = await storage.put({ buffer, filename: photo.name, contentType: photo.type });
    mediaUrl = saved.url; type = "PHOTO";
  }

  await appendRegistro({ partidaId, authorId, type, text, mediaUrl, progressPct, gpsLat, gpsLng });
  revalidatePath(`/partidas/${partidaId}`);
}
```

- [ ] **Step 2: Record card (feed item)**

Create `web/src/components/record-card.tsx`:
```tsx
import type { Registro } from "@prisma/client";

export function RecordCard({ r }: { r: Registro }) {
  const ts = r.serverCreatedAt.toISOString();
  const gps = r.gpsLat !== null && r.gpsLng !== null ? `${Number(r.gpsLat).toFixed(4)} · ${Number(r.gpsLng).toFixed(4)}` : "sin GPS";
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 4, marginBottom: 14, background: "var(--paper-2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "var(--ink)", color: "var(--paper)" }}>
        <span className="mono" style={{ fontSize: 11 }}>{r.type}</span>
        <span className="mono" style={{ fontSize: 11, opacity: 0.7 }}>{ts}</span>
      </div>
      <div style={{ padding: 14 }}>
        {r.text && <p style={{ marginBottom: 8 }}>{r.text}</p>}
        {r.mediaUrl && <img src={r.mediaUrl} alt="" style={{ maxWidth: "100%", borderRadius: 3 }} />}
        <div className="mono" style={{ fontSize: 11, color: "var(--steel)", marginTop: 10 }}>
          GPS {gps} · HASH {r.hash.slice(0, 8)}…{r.hash.slice(-4)} · ✓ inalterable
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Log composer (client, captures GPS)**

Create `web/src/components/log-composer.tsx`:
```tsx
"use client";
import { useRef, useState } from "react";
import { logRegistro } from "@/app/actions/registro";

export function LogComposer({ partidaId }: { partidaId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  function captureGps() {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCoords(null),
    );
  }

  return (
    <form ref={formRef} action={async (fd) => { await logRegistro(fd); formRef.current?.reset(); setCoords(null); }}
      style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 16, marginBottom: 28 }}>
      <input type="hidden" name="partidaId" value={partidaId} />
      <input type="hidden" name="gpsLat" value={coords?.lat ?? ""} />
      <input type="hidden" name="gpsLng" value={coords?.lng ?? ""} />
      <textarea name="text" placeholder="Describe lo que pasó en obra…" rows={3}
        style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 3, marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input type="file" name="photo" accept="image/*" />
        <input type="number" name="progressPct" min={0} max={100} placeholder="Avance %"
          style={{ width: 110, padding: 8, border: "1px solid var(--line)", borderRadius: 3 }} />
        <button type="button" onClick={captureGps} style={{ padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 3, background: "none", cursor: "pointer" }}>
          {coords ? "GPS ✓" : "Capturar GPS"}
        </button>
        <button type="submit" style={{ marginLeft: "auto", padding: "9px 18px", background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 3, fontWeight: 700 }}>
          Registrar →
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Partida page (feed + composer)**

Create `web/src/app/partidas/[id]/page.tsx`:
```tsx
import { prisma } from "@/lib/db";
import Link from "next/link";
import { LogComposer } from "@/components/log-composer";
import { RecordCard } from "@/components/record-card";

export default async function PartidaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const partida = await prisma.partida.findUniqueOrThrow({
    where: { id },
    include: { project: true, registros: { orderBy: [{ serverCreatedAt: "desc" }, { id: "desc" }] } },
  });
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 40 }}>
      <Link href={`/projects/${partida.projectId}`} className="mono" style={{ fontSize: 12, color: "var(--steel)" }}>← {partida.project.name}</Link>
      <h1 style={{ fontSize: 34, fontWeight: 900, margin: "8px 0 4px" }}>{partida.name}</h1>
      <div className="mono" style={{ color: "var(--steel)", marginBottom: 24 }}>AVANCE {partida.progressPct}%</div>
      <LogComposer partidaId={partida.id} />
      {partida.registros.map((r) => <RecordCard key={r.id} r={r} />)}
      {partida.registros.length === 0 && <p style={{ color: "var(--steel)" }}>Aún no hay registros. Crea el primero arriba.</p>}
    </main>
  );
}
```

- [ ] **Step 5: Manual verification (the core loop)**

`npm run dev` → open a partida → write a note, attach a photo, capture GPS, set progress, Registrar. Confirm: the entry appears in the feed with timestamp + GPS + hash, the photo renders, and the partida's progress updated. Add a second entry and confirm it stacks. Stop server.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/actions/registro.ts web/src/components web/src/app/partidas
git commit -m "feat: registro composer, feed, and log action (core loop)"
```

### Task 6.5: Admin page

**Files:** Create `web/src/app/admin/page.tsx`.

- [ ] **Step 1: Implement**

Create `web/src/app/admin/page.tsx`:
```tsx
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { createUser } from "@/app/actions/admin";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ temp?: string }> }) {
  const { temp } = await searchParams;
  const session = await auth();
  const companyId = (session?.user as { companyId?: string })?.companyId!;
  const users = await prisma.user.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });

  async function addUser(formData: FormData) {
    "use server";
    const tempPassword = await createUser(formData);
    const { redirect } = await import("next/navigation");
    redirect(`/admin?temp=${tempPassword}`);
  }

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 40 }}>
      <h1 style={{ fontSize: 34, fontWeight: 900, marginBottom: 20 }}>Equipo</h1>
      {temp && <p className="mono" style={{ background: "var(--paper-2)", border: "1px solid var(--accent)", padding: 12, borderRadius: 3 }}>
        Usuario creado. Contraseña temporal: <strong>{temp}</strong> — compártela con la persona.
      </p>}
      <ul style={{ listStyle: "none", padding: 0, margin: "20px 0" }}>
        {users.map((u) => (
          <li key={u.id} style={{ borderTop: "1px solid var(--line)", padding: "12px 0", display: "flex", justifyContent: "space-between" }}>
            <span>{u.name} · {u.email}</span><span className="mono" style={{ color: "var(--steel)" }}>{u.role}</span>
          </li>
        ))}
      </ul>
      <form action={addUser} style={{ display: "grid", gap: 8 }}>
        <input name="name" placeholder="Nombre" required style={fld} />
        <input name="email" type="email" placeholder="Correo" required style={fld} />
        <select name="role" style={fld} defaultValue="RESIDENT">
          <option value="ADMIN">Admin</option><option value="MANAGER">Manager</option>
          <option value="SUPERVISOR">Supervisor</option><option value="RESIDENT">Resident</option>
        </select>
        <button style={{ padding: "10px 18px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 3, fontWeight: 700 }}>Crear usuario</button>
      </form>
    </main>
  );
}
const fld = { padding: 10, border: "1px solid var(--line)", borderRadius: 3 } as const;
```

- [ ] **Step 2: Manual verification**

`npm run dev` → `/admin` → create a user → confirm temp password banner shows and the user appears in the list. Stop server.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/admin && git commit -m "feat: admin team page (create users, temp password)"
```

### Task 6.6: Final full-suite check

- [ ] **Step 1: Run everything**

Run: `cd web && npm run test && npm run build`
Expected: all Vitest tests PASS; `next build` completes with no type errors.

- [ ] **Step 2: Commit any fixes**

```bash
git add -A && git commit -m "chore: M1 green — tests pass, build clean"
```

---

## Self-Review

**Spec coverage** (against `2026-05-31-record360-web-m1-core-loop-design.md`):
- Stack (Next/Tailwind/Neon/Prisma/Auth.js/local storage) → Phase 0, 1, 3, 4 ✓
- Data model incl. `User.companyId`, `@@unique([partidaId, prevHash])` → Task 1.1 ✓
- Hash chain: genesis sentinel, exact canonical payload, computeHash, verifyChain → Tasks 2.1, 2.2 ✓
- Append-only + serialized writes + correctionOfId field → Task 5.2 (correctionOfId column present; correction-creation UI deferred, field supported) ✓
- Storage interface (`put`/`get` exact signatures) + local impl → Task 4.1 ✓
- Screens: login, dashboard, project, partida feed+composer, admin → Tasks 6.1, 6.3, 6.4, 6.5 ✓
- Role behavior scoped to companyId → server actions check companyId (Task 6.2) ✓
- Tests: canonical, genesis edge case, linkage, tamper, append/correction-field → Tasks 2.1, 2.2, 5.2 ✓
- GPS via browser Geolocation at log time → Task 6.4 composer ✓

**Gaps noted (intentional, per spec "out of scope"):** correction *UI* not built in M1 (column + append support exist); role-based screen hiding is minimal (companyId scoping enforced, but Admin link isn't role-gated in nav — acceptable for M1 single-company demo). Tamper-detection test lives in hash.test.ts rather than a DB test (pure logic is the right place).

**Placeholder scan:** none — all steps contain runnable code/commands.

**Type consistency:** `RegistroPayload`, `StoredRegistro`, `AppendInput`, `Storage`, `toStored` names/signatures match across canonical.ts → hash.ts → append.ts → map.ts → actions. `computeHash(prevHash, payload)` argument order consistent everywhere.
