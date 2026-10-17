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

/**
 * Origin the browser PUTs presigned uploads to (S3Storage uses path-style
 * URLs, so it is exactly the endpoint's origin), or null when storage is
 * local disk. These headers are computed when next.config.ts loads at BUILD
 * time, so S3_BUCKET and S3_ENDPOINT must be visible to the production build;
 * a misconfiguration throws to fail the build rather than ship a CSP that
 * silently blocks every direct upload.
 */
export function uploadConnectOrigin(env: Record<string, string | undefined>): string | null {
  if (!env.S3_BUCKET) return null;
  const raw = env.S3_ENDPOINT;
  if (!raw) throw new Error("S3_BUCKET is set but S3_ENDPOINT is missing: the CSP cannot allow direct uploads.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("S3_ENDPOINT is not a valid URL: the CSP cannot allow direct uploads.");
  }
  if (url.protocol !== "https:") throw new Error("S3_ENDPOINT must use https: the CSP only allows https upload origins.");
  return url.origin;
}

const UPLOAD_ORIGIN = uploadConnectOrigin(process.env);

export const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // microphone=(self): voice dictation (Web Speech API) needs mic access on our
  // own origin — microphone=() denied it everywhere and silently broke Dictar.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), interest-cohort=()" },
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; " +
      // 'unsafe-eval' is DEV-ONLY: Next.js react-refresh evaluates strings in
      // development; without it the CSP kills hydration locally (every client
      // effect dead). Production keeps the strict directive.
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; ` +
      `font-src 'self' data:; connect-src 'self'${UPLOAD_ORIGIN ? ` ${UPLOAD_ORIGIN}` : ""}; ` +
      "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  },
];
