/**
 * Security headers applied to every response.
 *
 * These live here — not in `netlify.toml` [[headers]] — because the
 * @netlify/plugin-nextjs runtime serves responses through Next.js and does NOT
 * apply netlify.toml headers to Next-served routes (which is effectively every
 * route, including the app-router-generated /manifest.webmanifest). Next's
 * `headers()` in next.config.ts IS honored by that runtime, so the header set
 * is defined here and wired in there.
 *
 * X-Frame-Options=DENY + CSP frame-ancestors 'none' block clickjacking of the
 * auth forms; HSTS forces HTTPS; the CSP is the baseline (script/style still
 * allow 'unsafe-inline' — tighten to nonces in a later pass).
 */
export const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), interest-cohort=()" },
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; " +
      "script-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; " +
      "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  },
];
