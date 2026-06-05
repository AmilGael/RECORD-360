import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getDict } from "@/i18n/server";
import { createUser } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";
import { ResetPasswordButton } from "@/components/reset-password-button";
import type { Lang } from "@/i18n/dictionaries";
import { formatTimestamp } from "@/lib/format/datetime";
import { Key, Plus } from "@/components/icons";

const TEMP_PW_COOKIE = "r360_temp_pw";

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
  const user = session!.user as { companyId: string; role: string };
  // Only ADMIN/MANAGER may view the team screen.
  if (user.role !== "ADMIN" && user.role !== "MANAGER") redirect("/app");
  const { lang, t } = await getDict();
  const A = t.admin;
  const users = await prisma.user.findMany({
    where: { companyId: user.companyId },
    orderBy: { createdAt: "asc" },
  });

  // Flash the freshly-created temp password from a short-lived httpOnly cookie
  // (kept out of the URL). It auto-expires; cookies can't be cleared at render.
  const temp = (await cookies()).get(TEMP_PW_COOKIE)?.value;

  async function addUser(formData: FormData) {
    "use server";
    const tempPassword = await createUser(formData);
    (await cookies()).set(TEMP_PW_COOKIE, tempPassword, {
      httpOnly: true,
      sameSite: "lax",
      path: "/app/admin",
      maxAge: 30,
    });
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

      {/* Flash temp password */}
      {temp && (
        <div
          className="card"
          style={{
            padding: "14px 18px",
            marginBottom: 24,
            borderColor: "var(--accent)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Key size={18} style={{ color: "var(--accent)", flexShrink: 0 }} />
          <p className="mono" style={{ fontSize: "0.78rem", margin: 0 }}>
            {A.tempPre} <strong style={{ color: "var(--accent)" }}>{temp}</strong> {A.tempPost}
          </p>
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
              <div className={`avatar ${avatarClass(u.role)}`}>{initials(u.name)}</div>
              <div className="member-info">
                <div className="member-name">{u.name}</div>
                <div className="member-email">{u.email}</div>
              </div>
              <span className={`role-badge ${roleClass(u.role)}`}>{A.roles[u.role as RoleKey]}</span>
              <span className="member-date">
                {A.added} {formatTimestamp(u.createdAt, lang as Lang)}
              </span>
              {user.role === "ADMIN" && (
                <ResetPasswordButton
                  userId={u.id}
                  t={{ resetPw: A.resetPw, resetConfirm: A.resetConfirm, yes: A.yes, no: A.no }}
                />
              )}
            </div>
          ))}
        </div>
      ))}

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
