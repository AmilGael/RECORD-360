import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ResendMailer } from "@/lib/email/resend";
import { createMailer } from "@/lib/email";
import { LogMailer } from "@/lib/email/log";
import { passwordResetLinkEmail } from "@/lib/email/templates";

describe("ResendMailer.send", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs to the Resend API with auth + the message", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    const mailer = new ResendMailer("key_123", "Raphel <no-reply@raphel.app>");
    await mailer.send({ to: "u@x.do", subject: "Hi", html: "<p>x</p>", text: "x" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer key_123");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ from: "Raphel <no-reply@raphel.app>", to: ["u@x.do"], subject: "Hi", html: "<p>x</p>", text: "x" });
  });

  it("throws when the API responds non-2xx", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 422 }));
    const mailer = new ResendMailer("key", "a@b.do");
    await expect(mailer.send({ to: "u@x.do", subject: "s", html: "h" })).rejects.toThrow(/422/);
  });
});

describe("createMailer selection", () => {
  it("returns ResendMailer when RESEND_API_KEY + EMAIL_FROM are set", () => {
    expect(createMailer({ RESEND_API_KEY: "k", EMAIL_FROM: "a@b.do" })).toBeInstanceOf(ResendMailer);
  });
  it("throws when the key is set but EMAIL_FROM is missing", () => {
    expect(() => createMailer({ RESEND_API_KEY: "k" })).toThrow(/EMAIL_FROM/);
  });
  it("falls back to LogMailer with no key", () => {
    expect(createMailer({})).toBeInstanceOf(LogMailer);
  });
});

describe("templates", () => {
  it("password reset link email carries the link and no credential material", () => {
    const msg = passwordResetLinkEmail("u@x.do", "<b>Ana</b>", "https://raphel360.com/reset/RAWTOKEN");
    expect(msg.to).toBe("u@x.do");
    expect(msg.subject).toMatch(/contraseña/i);
    expect(msg.text).toContain("https://raphel360.com/reset/RAWTOKEN");
    expect(msg.html).toContain('href="https://raphel360.com/reset/RAWTOKEN"');
    expect(msg.html).toContain("&lt;b&gt;Ana&lt;/b&gt;"); // name escaped
    expect(msg.text).toMatch(/2 horas/); // states the short validity window
    expect(msg.text).not.toMatch(/contraseña temporal/i); // never a credential
  });
});
