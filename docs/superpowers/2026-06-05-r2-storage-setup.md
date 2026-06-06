# Durable file storage — Cloudflare R2 setup

**Status:** code shipped (`d7bb705`). Storage now picks its driver from the environment:

- **No `S3_BUCKET` set** → files go to local disk (`web/.uploads/`). Fine for dev; **lost on every redeploy** in production.
- **`S3_BUCKET` set** → files go to S3-compatible object storage (Cloudflare R2). This is what production should use.

Files always stay **private**: they are never served from the bucket directly. Every read flows through the authenticated `/api/media/[key]` route, which enforces tenant + project access before streaming the object. So R2 does **not** need public access, custom domains, or presigned URLs.

---

## What you do in Cloudflare (one time, free tier)

R2 free tier: 10 GB storage, 1M Class-A + 10M Class-B ops/month, **zero egress fees**.

1. Cloudflare dashboard → **R2** → *Create bucket*. Name it e.g. `raphl-media`. Region: *Automatic*. Leave it **private** (do not enable public access).
2. R2 → *Manage R2 API Tokens* → **Create API token**.
   - Permissions: **Object Read & Write**.
   - Scope it to the single bucket you just created (least privilege).
   - Create. Copy the **Access Key ID** and **Secret Access Key** (the secret is shown once).
3. Note your **Account ID** (R2 overview page, or the endpoint shown on the token page). Your endpoint is:
   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

---

## The 4 (+1) values to give me / put in `web/.env.local`

```bash
S3_BUCKET=raphl-media
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=<access key id from step 2>
S3_SECRET_ACCESS_KEY=<secret access key from step 2>
# optional — defaults to "auto" (the R2 convention); leave unset unless you know you need it
# S3_REGION=auto
```

`.env.local` is gitignored, so secrets never enter the repo. In production (Vercel/host), set these same vars in the project's environment settings.

---

## Verifying it works

1. Add the vars to `web/.env.local`, restart the dev server.
2. Upload a photo to a registro. It should succeed as before.
3. Confirm it's really in R2: the object appears in the bucket (R2 dashboard → bucket → Objects), and **no** new file lands in `web/.uploads/`.
4. The photo still displays in-app (served through `/api/media/...`), and is **not** reachable by a logged-out user.

## Migrating existing local files (only if you have real uploads to keep)

Anything already in `web/.uploads/` won't move automatically. If there are files worth keeping, tell me and I'll write a one-off copy script (read each `.uploads/<key>` → `PutObject` to the bucket under the same key). For a fresh start, nothing to do.

## Notes

- The adapter is S3-compatible, so the same env vars work with AWS S3 or Backblaze B2 if you ever switch — only `S3_ENDPOINT`/`S3_REGION` change.
- Per-type size caps and the MIME allowlist (no SVG) are unchanged and enforced before upload regardless of driver.
