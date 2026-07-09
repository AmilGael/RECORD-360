import QRCode from "qrcode";

/**
 * QR data-URL for an obra's public certificate page. Rendered on demand —
 * never stored. Encodes APP_URL/verify/{code}; falls back to a relative URL
 * in dev when APP_URL is unset.
 */
export async function registrationQrDataUrl(registrationCode: string, width = 240): Promise<string> {
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  return QRCode.toDataURL(`${base}/verify/${registrationCode}`, { margin: 1, width });
}
