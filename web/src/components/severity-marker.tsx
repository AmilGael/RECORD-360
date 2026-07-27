import type { NotificationSeverity } from "@prisma/client";

// R3 WS1/WS3: severity is always rendered as a colored dot PLUS a text label —
// color is never the only carrier (NO emoji). Shared between the notifications
// list (B1) and the operational pending queue (B2) so the same visual language
// covers both. green=SUCCESS, yellow=IMPORTANT, red=CRITICAL, no marker when null.
// Colors reuse existing state tokens (--state-active, the #b08a2e yellow pattern
// already used by dash-health-fill.yellow/avatar.role-supervisor, --state-blocked)
// rather than introducing new ones.
export type SeverityLabels = { success: string; important: string; critical: string };

export function SeverityMarker({
  severity,
  t,
}: {
  severity: NotificationSeverity | null;
  t: SeverityLabels;
}) {
  if (!severity) return null;
  const color =
    severity === "SUCCESS" ? "var(--state-active)" : severity === "IMPORTANT" ? "#b08a2e" : "var(--state-blocked)";
  const label = severity === "SUCCESS" ? t.success : severity === "IMPORTANT" ? t.important : t.critical;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, maxWidth: "100%", lineHeight: 1.25, overflowWrap: "anywhere" }}>
      <span
        aria-hidden="true"
        style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }}
      />
      <span
        className="mono"
        style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.06em", color, fontWeight: 700 }}
      >
        {label}
      </span>
    </span>
  );
}
