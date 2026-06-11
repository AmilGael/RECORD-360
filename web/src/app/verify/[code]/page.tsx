import { prisma } from "@/lib/db";
import { getDict } from "@/i18n/server";
import { isValidRegistrationCode } from "@/lib/project/registration-code";
import { registrationQrDataUrl } from "@/lib/project/qr";
import { formatTimestamp } from "@/lib/format/datetime";
import type { Lang } from "@/i18n/dictionaries";

// PUBLIC certificate page — proves a registration code belongs to a real obra.
// Leaks nothing beyond obra name, company name and registration date.
export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { lang, t } = await getDict();
  const V = t.verify;

  const project = isValidRegistrationCode(code)
    ? await prisma.project.findUnique({
        where: { registrationCode: code },
        select: { name: true, createdAt: true, company: { select: { name: true } } },
      })
    : null;

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card" style={{ maxWidth: 420, width: "100%", padding: 28, textAlign: "center" }}>
        <div className="kicker">Raphel</div>
        <h1 className="h-md" style={{ margin: "6px 0 18px" }}>{V.title}</h1>
        {project ? (
          <>
            <span className="state-badge is-active" style={{ marginBottom: 14 }}>{V.valid}</span>
            <div className="mono" style={{ fontSize: "1.05rem", letterSpacing: "0.12em", margin: "10px 0 18px" }}>{code}</div>
            <div className="form-label">{V.obra}</div>
            <div style={{ fontSize: "1rem", marginBottom: 10 }}>{project.name}</div>
            <div className="form-label">{V.company}</div>
            <div style={{ fontSize: "0.95rem", marginBottom: 10 }}>{project.company.name}</div>
            <div className="form-label">{V.validSince}</div>
            <div style={{ fontSize: "0.9rem", marginBottom: 16 }}>{formatTimestamp(project.createdAt, lang as Lang)}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={await registrationQrDataUrl(code, 160)} alt={code} style={{ width: 160, height: 160, margin: "0 auto" }} />
            <p className="mono text-steel" style={{ fontSize: "0.68rem", marginTop: 14 }}>{V.tagline}</p>
          </>
        ) : (
          <>
            <span className="state-badge is-archived" style={{ marginBottom: 14 }}>{V.invalid}</span>
            <p style={{ fontSize: "0.9rem" }}>{V.invalidBody}</p>
          </>
        )}
      </div>
    </div>
  );
}
