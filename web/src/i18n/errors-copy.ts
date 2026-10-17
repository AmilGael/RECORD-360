// Copy for the error and not-found screens. Plain data with no imports, kept
// out of dictionaries.ts so the client error boundaries can import it without
// shipping the whole dictionary to the browser. dictionaries.ts re-exposes it
// as es.errors / en.errors, so the es/en parity checks still cover it.

export const errorsCopy = {
  es: {
    kicker: "ERROR",
    title: "Algo salió mal",
    body: "No pudimos mostrar esta pantalla. Vuelve a intentarlo. Si sigue ocurriendo, comparte el código con soporte.",
    retry: "Reintentar",
    code: "Código",
    home: "Ir al inicio",
    backToApp: "Volver a Obras",
    notFoundKicker: "NO ENCONTRADO",
    notFoundTitle: "Esta página no existe",
    notFoundBody: "Puede que el enlace esté incompleto o que no tengas acceso a esta página.",
  },
  en: {
    kicker: "ERROR",
    title: "Something went wrong",
    body: "We couldn't show this screen. Try again. If it keeps happening, share the code with support.",
    retry: "Try again",
    code: "Code",
    home: "Go to home",
    backToApp: "Back to Sites",
    notFoundKicker: "NOT FOUND",
    notFoundTitle: "This page doesn't exist",
    notFoundBody: "The link may be incomplete, or you may not have access to this page.",
  },
};

export type ErrorsLang = keyof typeof errorsCopy;
