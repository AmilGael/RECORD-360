import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import Link from "next/link";
import { getDict } from "@/i18n/server";
import { LogComposer } from "@/components/log-composer";
import { RecordCard } from "@/components/record-card";
import { PartidaDeleteButton } from "@/components/partida-delete-button";
import { PartidaVerifyButton } from "@/components/partida-verify-button";
import { PartidaProgressForm } from "@/components/partida-progress-form";
import { hasCompanyWideAccess, projectAccessWhere } from "@/lib/authz/projects";
import type { Role } from "@prisma/client";

export default async function PartidaPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ correctionOf?: string; replyTo?: string }>;
}) {
  const { id } = await params;
  const { correctionOf, replyTo } = await searchParams;
  const session = await auth();
  const sessionUser = session!.user as { id: string; companyId: string; role: Role };
  const companyId = sessionUser.companyId;
  const isAdmin = hasCompanyWideAccess(sessionUser.role);
  const { lang, t } = await getDict();
  // Tenant scoping: only return the partida if its project belongs to the caller's company.
  const partida = await prisma.partida.findFirstOrThrow({
    where: { id, project: projectAccessWhere(sessionUser), deletedAt: null },
    include: {
      project: {
        include: {
          locations: { orderBy: { label: "asc" } },
          assignments: { select: { userId: true } },
        },
      },
      registros: {
        include: { attachments: true, location: true, replyTo: { select: { id: true, text: true, hash: true } } },
        orderBy: [{ serverCreatedAt: "desc" }, { id: "desc" }],
      },
    },
  });
  const authorIds = [...new Set(partida.registros.map((r) => r.authorId))];
  const authors = authorIds.length
    ? await prisma.user.findMany({ where: { id: { in: authorIds }, companyId }, select: { id: true, name: true } })
    : [];
  const authorMap = new Map(authors.map((a) => [a.id, a.name]));
  const canEditStructure = isAdmin || partida.project.assignments.some((a) => a.userId === sessionUser.id);
  const locationLabels = partida.project.locations.map((l) => l.label);
  const correctionTarget = correctionOf ? partida.registros.find((r) => r.id === correctionOf) : null;
  const replyTarget = replyTo ? partida.registros.find((r) => r.id === replyTo) : null;
  const correctionCopy =
    lang === "es"
      ? { notice: "Corrigiendo", cancelLabel: "Cancelar", correct: "Corregir", replyNotice: "Respondiendo a", reply: "Responder" }
      : { notice: "Correcting", cancelLabel: "Cancel", correct: "Correct", replyNotice: "Replying to", reply: "Reply" };
  const correction = correctionTarget
    ? {
        id: correctionTarget.id,
        label: `${correctionTarget.hash.slice(0, 8)}…${correctionTarget.hash.slice(-4)}`,
        notice: correctionCopy.notice,
        cancelLabel: correctionCopy.cancelLabel,
      }
    : null;
  const reply = replyTarget
    ? {
        id: replyTarget.id,
        label: `${replyTarget.hash.slice(0, 8)}…${replyTarget.hash.slice(-4)}`,
        notice: correctionCopy.replyNotice,
        cancelLabel: correctionCopy.cancelLabel,
      }
    : null;

  return (
    <div className="reveal" style={{ maxWidth: 640, margin: "0 auto" }}>
      <Link href={`/app/projects/${partida.projectId}`} className="kicker" style={{ textDecoration: "none" }}>← {partida.project.name}</Link>
      <h1 className="h-lg" style={{ fontSize: "clamp(1.9rem, 4vw, 2.7rem)", margin: "10px 0 4px" }}>{partida.name}</h1>
      <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        {isAdmin && (
          <PartidaDeleteButton partidaId={partida.id} projectId={partida.projectId} t={{ del: t.project.del, delConfirm: t.project.delConfirm, yes: t.project.yes, no: t.project.no }} />
        )}
        <PartidaVerifyButton
          partidaId={partida.id}
          t={{ verify: t.partida.verify, verifyOk: t.partida.verifyOk, verifyBroken: t.partida.verifyBroken, verifyError: t.partida.verifyError }}
        />
      </div>
      <PartidaProgressForm partidaId={partida.id} progressPct={partida.progressPct} canEdit={canEditStructure} t={{ progress: t.partida.progress, save: t.project.save }} />
      <LogComposer partidaId={partida.id} t={t.composer} locations={locationLabels} correction={correction} reply={reply} />
      {partida.registros.map((r) => (
        <RecordCard
          key={r.id}
          r={r}
          t={{ ...t.record, correct: correctionCopy.correct, reply: correctionCopy.reply }}
          lang={lang}
          authorName={authorMap.get(r.authorId) ?? null}
          correctionHref={`/app/partidas/${partida.id}?correctionOf=${r.id}`}
          replyHref={`/app/partidas/${partida.id}?replyTo=${r.id}`}
        />
      ))}
      {partida.registros.length === 0 && <p className="text-steel">{t.partida.empty}</p>}
    </div>
  );
}
