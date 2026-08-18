import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getDict } from "@/i18n/server";
import { createUser, resendInvite } from "@/app/actions/admin";
import { updateCompanySeal } from "@/app/actions/profile";
import { SubmitButton } from "@/components/submit-button";
import { ResetPasswordButton } from "@/components/reset-password-button";
import { MemberProfileForm } from "@/components/member-profile-form";
import { ArchiveRestoreButton } from "@/components/archive-restore-button";
import type { Lang } from "@/i18n/dictionaries";
import { formatTimestamp } from "@/lib/format/datetime";
import { Key, Plus, Upload } from "@/components/icons";
import Link from "next/link";

const RESET_SENT_COOKIE = "r360_reset_sent";
const INVITE_SENT_COOKIE = "r360_invite_sent";

/** Role hierarchy for ordering and display */
const ROLE_ORDER = ["ADMIN", "MANAGER", "SUPERVISOR", "RESIDENT"] as const;
type RoleKey = (typeof ROLE_ORDER)[number];

function roleClass(role: string): string {
  const map: Record<string, string> = {
    ADMIN: "is-admin",
    MANAGER: "is-manager",
    SUPERVISOR: "is-supervisor",
    RESIDENT: "is-resident",
  };
  return map[role] ?? "is-resident";
}

function avatarClass(role: string): string {
  const map: Record<string, string> = {
    ADMIN: "role-admin",
    MANAGER: "role-manager",
    SUPERVISOR: "role-supervisor",
    RESIDENT: "role-resident",
  };
  return map[role] ?? "role-resident";
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function AdminPage() {
  const session = await auth();
  const user = session!.user as { id: string; companyId: string; role: string };
  // Only ADMIN/MANAGER may view the team screen.
  if (user.role !== "ADMIN" && user.role !== "MANAGER") redirect("/app");
  const { lang, t } = await getDict();
  const A = t.admin;
  const allUsers = await prisma.user.findMany({
    where: { companyId: user.companyId },
    orderBy: { createdAt: "asc" },
  });
  // Archived members (WS2A) get their own collapsed group — never mixed into
  // the active roster, which is what the role-grouped list below shows.
  const users = allUsers.filter((u) => !u.disabledAt);
  const archivedUsers = allUsers.filter((u) => u.disabledAt);

  const assignmentRows = await prisma.projectAssignment.findMany({
    where: { user: { companyId: user.companyId } },
    select: { userId: true, project: { select: { id: true, name: true, archivedAt: true } } },
  });
  const assignmentsByUser = new Map<string, { id: string; name: string; archivedAt: Date | null }[]>();
  for (const a of assignmentRows) {
    const list = assignmentsByUser.get(a.userId) ?? [];
    list.push(a.project);
    assignmentsByUser.set(a.userId, list);
  }
  const company = await prisma.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { sealKey: true } });

  // Flash the reset-link-sent confirmation from a short-lived httpOnly cookie
  // (kept out of the URL). It auto-expires; cookies can't be cleared at render.
  const resetSent = (await cookies()).get(RESET_SENT_COOKIE)?.value === "1";
  const inviteSent = (await cookies()).get(INVITE_SENT_COOKIE)?.value === "1";

  async function addUser(formData: FormData) {
    "use server";
    await createUser(formData);
    (await cookies()).set(INVITE_SENT_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/app/admin", maxAge: 30 });
    redirect("/app/admin");
  }

  // Group users by role
  const grouped = new Map<string, typeof users>();
  for (const role of ROLE_ORDER) {
    const members = users.filter((u) => u.role === role);
    if (members.length > 0) grouped.set(role, members);
  }

  return (
    <div className="reveal" style={{ maxWidth: 720, margin: "0 auto" }}>
      {/* Header */}
      <div className="dash-header">
        <div>
          <div className="kicker">{A.kicker}</div>
          <h1 className="h-lg" style={{ fontSize: "clamp(1.8rem, 4vw, 2.6rem)", margin: "6px 0 0" }}>
            {A.title}
          </h1>
        </div>
        <span className="counter">{users.length} {A.members}</span>
      </div>

      {resetSent && (
        <div className="card" style={{ padding: "14px 18px", marginBottom: 24, borderColor: "var(--line-strong)", display: "flex", alignItems: "center", gap: 12 }}>
          <Key size={18} style={{ color: "var(--accent)", flexShrink: 0 }} />
          <p className="mono" style={{ fontSize: "0.78rem", margin: 0 }}>{A.resetSent}</p>
        </div>
      )}

      {inviteSent && (
        <div className="card" style={{ padding: "14px 18px", marginBottom: 24, borderColor: "var(--line-strong)", display: "flex", alignItems: "center", gap: 12 }}>
          <Key size={18} style={{ color: "var(--accent)", flexShrink: 0 }} />
          <p className="mono" style={{ fontSize: "0.78rem", margin: 0 }}>Invitación enviada. El usuario recibirá un enlace para activar su cuenta.</p>
        </div>
      )}

      {/* Grouped member list */}
      {[...grouped.entries()].map(([role, members]) => (
        <div key={role} className="team-section">
          <div className="team-section-head">
            {A.roles[role as RoleKey]} — {members.length}
          </div>
          {members.map((u) => (
            <div key={u.id} className="member-card">
              <div className="member-row">
                {u.photoKey ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/media/${u.photoKey}`} alt="" className={`avatar ${avatarClass(u.role)}`} style={{ objectFit: "cover" }} />
                ) : (
                  <div className={`avatar ${avatarClass(u.role)}`}>{initials(u.name)}</div>
                )}
                <div className="member-info">
                  <div className="member-name" title={u.name}>{u.name}</div>
                  <div className="member-email" title={`${u.email}${u.phone ? ` · ${u.phone}` : ""}`}>{u.email}{u.phone ? ` · ${u.phone}` : ""}</div>
                  {u.signatureKey && (
                    <div className="mono text-steel" style={{ fontSize: "0.62rem" }}>{A.signed}</div>
                  )}
                  {(u.role === "SUPERVISOR" || u.role === "RESIDENT") && (
                    <details style={{ marginTop: 2 }}>
                      <summary className="mono text-steel" style={{ fontSize: "0.66rem", cursor: "pointer" }}>
                        {(assignmentsByUser.get(u.id) ?? []).length} {A.assignedObras}
                      </summary>
                      <div style={{ display: "grid", gap: 2, marginTop: 4 }}>
                        {(assignmentsByUser.get(u.id) ?? []).map((p) => (
                          <Link key={p.id} href={`/app/projects/${p.id}`} className="mono" style={{ fontSize: "0.7rem", color: "var(--accent-deep)", textDecoration: "none" }}>
                            {p.name}{p.archivedAt ? A.archivedSuffix : ""}
                          </Link>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
                <span className={`role-badge ${roleClass(u.role)}`}>{A.roles[u.role as RoleKey]}</span>
                <span className="member-date">
                  {A.added} {formatTimestamp(u.createdAt, lang as Lang)}
                </span>
              </div>
              <div className="member-actions">
                <MemberProfileForm
                  userId={u.id}
                  phone={u.phone}
                  photoUrl={u.photoKey ? `/api/media/${u.photoKey}` : null}
                  signatureUrl={u.signatureKey ? `/api/media/${u.signatureKey}` : null}
                  t={{
                    editProfile: A.editProfile, phone: A.phone, photo: A.photo, signature: A.signature, saveProfile: A.saveProfile,
                    photoHint: A.photoHint, signatureHint: A.signatureHint, invalidFormat: A.invalidFormat, fileTooLarge: A.fileTooLarge,
                    currentSignature: A.currentSignature, newSignaturePreview: A.newSignaturePreview, currentPhoto: A.currentPhoto, newPhotoPreview: A.newPhotoPreview,
                  }}
                />
                {user.role === "ADMIN" && u.emailVerifiedAt && (
                  <ResetPasswordButton
                    userId={u.id}
                    t={{ resetPw: A.resetPw, resetConfirm: A.resetConfirm, yes: A.yes, no: A.no }}
                  />
                )}
                {user.role === "ADMIN" && !u.emailVerifiedAt && (
                  <form action={resendInvite}>
                    <input type="hidden" name="userId" value={u.id} />
                    <SubmitButton className="btn btn-ghost" style={{ fontSize: "0.7rem" }}>Reenviar invitación</SubmitButton>
                  </form>
                )}
                {user.role === "ADMIN" && u.id !== user.id && (
                  <ArchiveRestoreButton
                    userId={u.id}
                    mode="archive"
                    t={{ archiveMember: A.archiveMember, archiveConfirm: A.archiveConfirm, restoreMember: A.restoreMember, restoreConfirm: A.restoreConfirm, yes: A.yes, no: A.no }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Archived members (WS2A) — collapsed by default, restore-only actions */}
      {archivedUsers.length > 0 && (
        <details className="team-section">
          <summary className="team-section-head" style={{ cursor: "pointer" }}>
            {A.archivedTitle} — {archivedUsers.length}
          </summary>
          {archivedUsers.map((u) => (
            <div key={u.id} className="member-card">
              <div className="member-row">
                {u.photoKey ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/media/${u.photoKey}`} alt="" className={`avatar ${avatarClass(u.role)}`} style={{ objectFit: "cover", opacity: 0.6 }} />
                ) : (
                  <div className={`avatar ${avatarClass(u.role)}`} style={{ opacity: 0.6 }}>{initials(u.name)}</div>
                )}
                <div className="member-info">
                  <div className="member-name" title={u.name}>{u.name}</div>
                  <div className="member-email" title={u.email}>{u.email}</div>
                </div>
                <span className={`role-badge ${roleClass(u.role)}`}>{A.roles[u.role as RoleKey]}</span>
                <span className="member-date">
                  {A.archivedOn} {u.disabledAt ? formatTimestamp(u.disabledAt, lang as Lang) : ""}
                </span>
              </div>
              {user.role === "ADMIN" && (
                <div className="member-actions">
                  <ArchiveRestoreButton
                    userId={u.id}
                    mode="restore"
                    t={{ archiveMember: A.archiveMember, archiveConfirm: A.archiveConfirm, restoreMember: A.restoreMember, restoreConfirm: A.restoreConfirm, yes: A.yes, no: A.no }}
                  />
                </div>
              )}
            </div>
          ))}
        </details>
      )}

      {/* Company seal section */}
      {user.role === "ADMIN" && (
        <div className="card" style={{ padding: 16, marginBottom: 24 }}>
          <div className="form-label" style={{ marginBottom: 6 }}>{A.sealTitle}</div>
          <p className="mono text-steel" style={{ fontSize: "0.7rem", margin: "0 0 10px" }}>{A.sealHint}</p>
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            {company.sealKey ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/media/${company.sealKey}`} alt={A.sealTitle} style={{ width: 72, height: 72, objectFit: "contain", background: "#fff", borderRadius: "var(--radius-sm)", border: "1px solid var(--line-strong)" }} />
            ) : (
              <span className="mono text-steel" style={{ fontSize: "0.74rem" }}>{A.noSeal}</span>
            )}
            <form action={updateCompanySeal} style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap", maxWidth: "100%" }}>
              <input type="file" name="seal" required accept="image/png" style={{ maxWidth: "100%", minWidth: 0 }} />
              <SubmitButton className="btn btn-ghost"><Upload size={12} style={{ verticalAlign: -1, marginRight: 5 }} />{A.sealUpload}</SubmitButton>
            </form>
          </div>
        </div>
      )}

      {/* Invite collaborator panel */}
      {user.role === "ADMIN" && (
        <div className="invite-panel">
          <div className="invite-panel-head">
            <Plus size={14} /> {A.inviteTitle}
          </div>
          <form action={addUser} className="invite-panel-body">
            <div className="invite-grid" style={{ marginBottom: 14 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="team-name">{A.name}</label>
                <input id="team-name" name="name" placeholder="María González" required className="input" />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="team-email">{A.email}</label>
                <input id="team-email" name="email" type="email" placeholder="maria@empresa.com" required className="input" />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">{A.selectRole}</label>
              <div className="invite-grid" style={{ marginTop: 6 }}>
                {ROLE_ORDER.map((role, i) => (
                  <label key={role} className="role-option">
                    <input type="radio" name="role" value={role} defaultChecked={i === 3} />
                    <div>
                      <div className="role-label">{A.roles[role]}</div>
                      <div className="role-desc">{A.roleDescs[role]}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <SubmitButton className="btn btn-accent" style={{ width: "100%" }}>
              {A.create} <span className="arrow">→</span>
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
