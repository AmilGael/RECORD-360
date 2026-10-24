import { describe, expect, it } from "vitest";
import { dictionaries } from "@/i18n/dictionaries";
import { informeErrorText } from "@/lib/informes/error-text";
import { UserError, toUserMessage } from "@/lib/errors/user-error";

describe("toUserMessage", () => {
  it("fills a keyed sentence in Spanish and English", () => {
    const e = new UserError("passwordTooShort", { min: 12 });
    expect(toUserMessage(e, dictionaries.es, "test")).toBe("La contraseña debe tener al menos 12 caracteres.");
    expect(toUserMessage(e, dictionaries.en, "test")).toBe("The password has to be at least 12 characters.");
  });

  it("maps the access sentinels to the unauthorized sentence", () => {
    expect(toUserMessage(new Error("Unauthorized"), dictionaries.en, "test")).toBe(dictionaries.en.serverErrors.unauthorized);
    expect(toUserMessage(new Error("Forbidden"), dictionaries.es, "test")).toBe(dictionaries.es.serverErrors.unauthorized);
  });

  it("hides an unknown error, including a database message", () => {
    const leaked = "Invalid `prisma.registro.create()` invocation: secret column";
    const msg = toUserMessage(new Error(leaked), dictionaries.es, "test");
    expect(msg).toBe(dictionaries.es.serverErrors.generic);
    expect(msg).not.toContain("prisma");
    expect(msg).not.toContain("secret");
  });
});

describe("serverErrors", () => {
  it("has the same keys in Spanish and English", () => {
    expect(Object.keys(dictionaries.en.serverErrors).sort()).toEqual(Object.keys(dictionaries.es.serverErrors).sort());
  });
});

describe("informeErrorText", () => {
  it("translates a stored key and the four legacy sentences, and hides anything else", () => {
    const es = dictionaries.es;
    expect(informeErrorText("informeNoCredit", es)).toBe(es.serverErrors.informeNoCredit);
    expect(informeErrorText("El generador de informes no esta configurado (clave de API invalida).", es)).toBe(es.serverErrors.informeBadKey);
    expect(informeErrorText("El servicio esta ocupado. Intentalo de nuevo en un momento.", es)).toBe(es.serverErrors.informeBusy);
    expect(informeErrorText("El generador de informes no esta disponible: la cuenta de API no tiene saldo. Contacta al administrador.", es)).toBe(es.serverErrors.informeNoCredit);
    expect(informeErrorText("No se pudo generar el informe. Intentalo de nuevo.", es)).toBe(es.serverErrors.informeFailed);
    expect(informeErrorText("Invalid `prisma.informe.update()` invocation", es)).toBe(es.serverErrors.generic);
    expect(informeErrorText(null, es)).toBeNull();
    expect(informeErrorText("informeNoCredit", dictionaries.en)).toBe(dictionaries.en.serverErrors.informeNoCredit);
  });
});
