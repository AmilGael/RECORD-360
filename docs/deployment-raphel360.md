# raphel360.com — domain + email cutover runbook

One-time production setup. Order matters: email DNS can verify before the app moves.

## 1. Resend — verify the sending domain
1. Resend dashboard → Domains → Add `raphel360.com`.
2. At the DNS host, create the records Resend prescribes (SPF TXT + DKIM CNAMEs/TXT).
3. Wait for the domain to show **Verified**.

## 2. Netlify env (site: raphl-record360)
- `EMAIL_FROM` = `Raphel <no-reply@raphel360.com>`  (requires step 1)
- `APP_URL`    = `https://raphel360.com`
- `RESEND_API_KEY` = the production key (create in Resend if unset)

## 3. Netlify — attach the domain
1. Site settings → Domain management → add `raphel360.com` as the primary domain.
2. Add `www.raphel360.com` as an alias (redirects to primary).
3. Point DNS at Netlify (apex A/ALIAS + www CNAME per Netlify's instructions).
4. Wait for the TLS certificate to provision. HSTS/CSP already ship in `netlify.toml`.

## 4. Verify end-to-end (production)
1. Redeploy so the new env vars take effect.
2. Submit a real `/request-access`, approve it as the SUPERADMIN operator, and confirm the
   activation email arrives FROM no-reply@raphel360.com with an https://raphel360.com/activate/… link.
3. On `/login`, use "¿Olvidaste tu contraseña?" and confirm the reset email + link work.
4. DevTools → Network on any page: confirm HSTS, CSP, and X-Frame-Options response headers.

## 5. R2 bucket CORS — required for direct uploads

Plano/document uploads over ~4.4 MB bypass the server (Netlify buffers
function bodies at 6 MB) and PUT straight to R2 with a presigned URL
(`/api/uploads/presign`). The browser preflights that PUT, so the bucket
needs a CORS rule — without it the client silently falls back to the
server-action path, which still 413s on large files.

Cloudflare dashboard → R2 → the bucket → Settings → CORS policy:

```json
[
  {
    "AllowedOrigins": ["https://www.raphel360.com", "https://raphel360.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type", "content-length"],
    "MaxAgeSeconds": 86400
  }
]
```

No `AllowedOrigins` wildcard: the presigned URL already scopes who can
write, but there is no reason to let other origins burn upload quota.
Verify after deploy: upload a >5 MB PDF on the Planos tab; the network
panel should show `PUT` to the R2 endpoint (not a POST to the page) and
the plano should list.
