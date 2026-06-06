# Transactional email — Resend setup

**Status:** code shipped (`c2970ce`). The mailer picks its driver from the environment:

- **No `RESEND_API_KEY`** → emails are **logged only** (a `[email:log]` line), nothing is sent. Fine for dev; flows still work.
- **`RESEND_API_KEY` + `EMAIL_FROM` set** → real email is sent via Resend.

Delivery is **best-effort**: if sending fails, the calling action still succeeds (the temp password is also flashed in-app to the admin as a fallback), and the error is logged.

## What email is sent today

| Trigger | Recipient | Contents |
|---|---|---|
| Admin creates a user | the new user | login email + temp password (invite) |
| Admin resets a password | that user | the new temp password |

(In-app notifications remain in-app; emailing those can be added later.)

---

## What you do in Resend (one time, free tier)

Free tier: 3,000 emails/month, 100/day.

1. Sign up at <https://resend.com> → **API Keys** → *Create API Key* (Sending access). Copy it (`re_...`).
2. **Sender address** — one of:
   - **Quick test:** use `onboarding@resend.dev` as the from address. Resend only lets this deliver to *your own* account email — good for a first smoke test.
   - **Real use:** **Domains** → add your domain → add the shown DNS records (SPF/DKIM) at your registrar → wait for "Verified". Then send from e.g. `Raphl <no-reply@tudominio.com>`.

---

## Env values (`web/.env.local`, and your host's env in prod)

```bash
RESEND_API_KEY=re_xxxxxxxx
EMAIL_FROM=Raphl <no-reply@tudominio.com>   # or: onboarding@resend.dev (test only)
# optional — makes emails include an absolute "Iniciar sesión" link
APP_URL=https://tu-app.com
```

`.env.local` is gitignored. If `EMAIL_FROM` is missing while `RESEND_API_KEY` is set, the app throws on startup (fail-fast, so you can't half-configure it).

---

## Verifying it works

1. Add the vars, restart the dev server.
2. As an admin, create a user (or reset a password) with an address you control.
3. The email arrives. If it doesn't: check the server log for a `[email] delivery failed` line (shows the Resend error), and confirm the domain is verified / you're sending to your own address in test mode.

Without the key, you'll see `[email:log] would send to=… subject="…"` in the server log instead — that confirms the wiring fires; add the key to actually deliver.

## Notes

- The provider is swappable (the `Mailer` interface + `createMailer`); switching to SES/Postmark later is a new adapter, not a rewrite.
- Templates live in `web/src/lib/email/templates.ts` (Spanish, no emoji, HTML-escaped).
