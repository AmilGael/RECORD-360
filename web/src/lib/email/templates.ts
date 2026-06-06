import type { EmailMessage } from "./types";

const APP_NAME = "Raphl";

/** Minimal HTML escaping for values interpolated into email bodies. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loginLink(loginUrl?: string): { text: string; html: string } {
  if (!loginUrl) return { text: "", html: "" };
  return {
    text: `\n\nInicia sesión: ${loginUrl}`,
    html: `<p><a href="${esc(loginUrl)}">Iniciar sesión</a></p>`,
  };
}

/** Sent to a user whose password an admin reset. Carries the temp password. */
export function passwordResetEmail(to: string, tempPassword: string, loginUrl?: string): EmailMessage {
  const link = loginLink(loginUrl);
  return {
    to,
    subject: `${APP_NAME}: contraseña temporal`,
    text:
      `Un administrador restableció tu contraseña en ${APP_NAME}.\n\n` +
      `Contraseña temporal: ${tempPassword}\n\n` +
      `Usa esta contraseña para iniciar sesión.${link.text}`,
    html:
      `<p>Un administrador restableció tu contraseña en <b>${APP_NAME}</b>.</p>` +
      `<p>Contraseña temporal: <code>${esc(tempPassword)}</code></p>` +
      `<p>Usa esta contraseña para iniciar sesión.</p>${link.html}`,
  };
}

/** Sent to a newly created user with their login email + temp password. */
export function userInviteEmail(to: string, name: string, tempPassword: string, loginUrl?: string): EmailMessage {
  const link = loginLink(loginUrl);
  return {
    to,
    subject: `${APP_NAME}: tu acceso`,
    text:
      `Hola ${name},\n\n` +
      `Se creó tu cuenta en ${APP_NAME}.\n\n` +
      `Usuario: ${to}\n` +
      `Contraseña temporal: ${tempPassword}\n\n` +
      `Usa estos datos para iniciar sesión.${link.text}`,
    html:
      `<p>Hola ${esc(name)},</p>` +
      `<p>Se creó tu cuenta en <b>${APP_NAME}</b>.</p>` +
      `<p>Usuario: <code>${esc(to)}</code><br/>Contraseña temporal: <code>${esc(tempPassword)}</code></p>` +
      `<p>Usa estos datos para iniciar sesión.</p>${link.html}`,
  };
}
