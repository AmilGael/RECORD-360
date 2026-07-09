# Raphl — web app

Next.js (App Router) + Prisma/PostgreSQL + NextAuth (Auth.js v5). Offline-first PWA for
construction site logging. This is the `web/` workspace; the product PRD lives in the repo-root
`README.md`.

## Prerequisites

- Node.js 18+ and npm
- A PostgreSQL database
- (Production) an S3-compatible bucket (e.g. Cloudflare R2) and a [Resend](https://resend.com) API key

## Getting started (development)

```bash
npm install
cp .env.example .env.local          # then fill in the values
npx prisma migrate dev              # creates/updates your local schema
npm run dev                         # http://localhost:3000
```

Without `S3_BUCKET` set, uploads are written to local disk under `.uploads/` — fine for dev,
but those files are lost on redeploy, so production needs S3/R2.

## Environment variables

All variables are documented in [`.env.example`](./.env.example). Summary:

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (Prisma) |
| `AUTH_SECRET` | ✅ | NextAuth session/JWT signing secret — `openssl rand -base64 32` |
| `AUTH_TRUST_HOST` | self-host | Set `true` when behind a proxy (anything but Vercel) |
| `APP_URL` | ✅ | Public base URL, used in emails and absolute links |
| `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | prod | Media object storage; without `S3_BUCKET`, files go to local disk |
| `S3_REGION` | optional | Defaults to `auto` (R2 convention) |
| `RESEND_API_KEY`, `EMAIL_FROM` | for email | Notifications and member invites |
| `ANTHROPIC_API_KEY` | for informes | AI report generation (Claude API) |
| `DEV_TUNNEL` | dev only | `1` allows `*.trycloudflare.com` origins under `next dev` |

## Scripts

```bash
npm run dev     # dev server
npm run build   # production build
npm start       # serve the production build
npm run lint    # eslint
npm test        # vitest (run once)
```

## Deployment

1. **Provision infrastructure:** a PostgreSQL database, an S3-compatible bucket (R2), and a Resend account.
2. **Set environment variables** on the host (see the table above). Generate a fresh `AUTH_SECRET`;
   set `AUTH_TRUST_HOST=true` if you are *not* on Vercel.
3. **Apply database migrations** against the production database — do this before the app serves traffic:
   ```bash
   npx prisma migrate deploy
   ```
4. **Build and start:**
   ```bash
   npm ci
   npm run build
   npm start
   ```
   On Vercel, the build step runs automatically; add `prisma migrate deploy` to the build/release
   command so migrations apply on each deploy.

### Pre-deploy checklist

- [ ] `npm test` and `npm run build` pass
- [ ] Production `DATABASE_URL` reachable and migrated (`prisma migrate deploy`)
- [ ] `AUTH_SECRET` set (unique per environment), `AUTH_TRUST_HOST` correct for the host
- [ ] S3/R2 bucket configured and writable (else uploaded media is lost on redeploy)
- [ ] `RESEND_API_KEY` + verified `EMAIL_FROM` domain (for invites/notifications)
- [ ] `APP_URL` matches the public URL
