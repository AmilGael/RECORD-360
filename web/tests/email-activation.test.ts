import { describe, expect, it } from "vitest";
import { accountActivationEmail, newAccessRequestEmail } from "@/lib/email/templates";

describe("activation + access-request emails", () => {
  it("activation email contains the link and escapes the name", () => {
    const msg = accountActivationEmail("a@b.com", "<b>Ann", "https://x.test/activate/tok");
    expect(msg.to).toBe("a@b.com");
    expect(msg.html).toContain("https://x.test/activate/tok");
    expect(msg.html).not.toContain("<b>Ann");
    expect(msg.text).toContain("https://x.test/activate/tok");
  });

  it("new-access-request email includes the business details for the operator", () => {
    const msg = newAccessRequestEmail(
      "ops@raphel.test",
      { businessName: "Acme SRL", contactName: "Ana", email: "ana@acme.test", phone: "809-555-1212" },
      "https://x.test/app/operator/access-requests",
    );
    expect(msg.html).toContain("Acme SRL");
    expect(msg.html).toContain("ana@acme.test");
    expect(msg.html).toContain("https://x.test/app/operator/access-requests");
  });
});
