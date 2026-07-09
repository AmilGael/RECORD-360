import type { EmailMessage } from "./types";

const APP_NAME = "Raphel";

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

/** Sent to a newly created/invited/approved user: a single-use link to set their password. */
export function accountActivationEmail(to: string, name: string, activationUrl: string): EmailMessage {
  return {
    to,
    subject: `${APP_NAME}: activa tu cuenta`,
    text:
      `Hola ${name},\n\n` +
      `Activa tu cuenta en ${APP_NAME} y define tu contraseña con este enlace ` +
      `(válido por 24 horas):\n\n${activationUrl}\n\n` +
      `Si no esperabas este correo, ignóralo.`,
    html:
      `<p>Hola ${esc(name)},</p>` +
      `<p>Activa tu cuenta en <b>${APP_NAME}</b> y define tu contraseña con este enlace ` +
      `(válido por 24 horas):</p>` +
      `<p><a href="${esc(activationUrl)}">Activar mi cuenta</a></p>` +
      `<p>Si no esperabas este correo, ignóralo.</p>`,
  };
}

export type AccessRequestSummary = {
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  website?: string | null;
  message?: string | null;
};

/** Sent to operators when a new access request arrives. */
export function newAccessRequestEmail(to: string, req: AccessRequestSummary, reviewUrl?: string): EmailMessage {
  const rows =
    `Empresa: ${req.businessName}\n` +
    `Contacto: ${req.contactName}\n` +
    `Correo: ${req.email}\n` +
    `Teléfono: ${req.phone}\n` +
    (req.website ? `Sitio: ${req.website}\n` : "") +
    (req.message ? `Mensaje: ${req.message}\n` : "");
  const htmlRows =
    `<li>Empresa: <b>${esc(req.businessName)}</b></li>` +
    `<li>Contacto: ${esc(req.contactName)}</li>` +
    `<li>Correo: ${esc(req.email)}</li>` +
    `<li>Teléfono: ${esc(req.phone)}</li>` +
    (req.website ? `<li>Sitio: ${esc(req.website)}</li>` : "") +
    (req.message ? `<li>Mensaje: ${esc(req.message)}</li>` : "");
  const link = reviewUrl ? `\n\nRevisar: ${reviewUrl}` : "";
  const htmlLink = reviewUrl ? `<p><a href="${esc(reviewUrl)}">Revisar solicitudes</a></p>` : "";
  return {
    to,
    subject: `${APP_NAME}: nueva solicitud de acceso`,
    text: `Nueva solicitud de acceso en ${APP_NAME}.\n\n${rows}${link}`,
    html: `<p>Nueva solicitud de acceso en <b>${APP_NAME}</b>.</p><ul>${htmlRows}</ul>${htmlLink}`,
  };
}

/** Sent when a user (or their admin) requests a password reset: a single-use link, never a credential. */
export function passwordResetLinkEmail(to: string, name: string, resetUrl: string): EmailMessage {
  return {
    to,
    subject: `${APP_NAME}: restablece tu contraseña`,
    text:
      `Hola ${name},\n\n` +
      `Restablece tu contraseña de ${APP_NAME} con este enlace (válido por 2 horas):\n\n` +
      `${resetUrl}\n\n` +
      `Si no solicitaste este cambio, ignora este correo — tu contraseña actual sigue vigente.`,
    html:
      `<p>Hola ${esc(name)},</p>` +
      `<p>Restablece tu contraseña de <b>${APP_NAME}</b> con este enlace (válido por 2 horas):</p>` +
      `<p><a href="${esc(resetUrl)}">Restablecer contraseña</a></p>` +
      `<p>Si no solicitaste este cambio, ignora este correo — tu contraseña actual sigue vigente.</p>`,
  };
}
