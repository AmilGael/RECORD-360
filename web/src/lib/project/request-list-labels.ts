import type { Dict } from "@/i18n/dictionaries";

/**
 * The label bundle `CambiosList` takes. Both the Solicitudes tab and the
 * bloque workspace's Solicitudes space render that list, so the bundle is
 * built in one place.
 */
export function requestListLabels(t: Dict) {
  return {
    empty: t.changes.empty, states: t.changes.states,
    new: t.changes.new, fieldTitle: t.changes.fieldTitle, fieldDescription: t.changes.fieldDescription,
    fieldPartidas: t.changes.fieldPartidas,
    fieldReminder: t.changes.fieldReminder, fieldReminderPlaceholder: t.changes.fieldReminderPlaceholder,
    evidence: t.changes.evidence,
    kindLabel: t.requests.kindLabel, kindChange: t.requests.kindChange, kindAlert: t.requests.kindAlert,
    severityLabel: t.requests.severityLabel, severityImportant: t.requests.severityImportant, severityCritical: t.requests.severityCritical,
    gpsAcquiring: t.requests.gpsAcquiring, gpsAcquired: t.requests.gpsAcquired, gpsDenied: t.requests.gpsDenied,
    gpsUnavailable: t.requests.gpsUnavailable, gpsTimeout: t.requests.gpsTimeout, gpsInvalid: t.requests.gpsInvalid,
    gpsRetry: t.requests.gpsRetry,
    close: t.project.panelClose,
  };
}
