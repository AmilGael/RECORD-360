import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getDict } from "@/i18n/server";
import { createUser } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";

const TEMP_PW_COOKIE = "r360_temp_pw";

export default async function AdminPage() {
  const session = await auth();
  const user = session!.user as { companyId: string; role: string };
  // Only ADMIN/MANAGER may view the team screen.
  if (user.role !== "ADMIN" && user.role !== "MANAGER") redirect("/app");
  const { t } = await getDict();
  const A = t.admin;
  const users = await prisma.user.findMany({ where: { companyId: user.companyId }, orderBy: { createdAt: "asc" } });

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

  return (
    <div className="reveal" style={{ maxWidth: 640, margin: "0 auto" }}>
      <h1 className="h-lg" style={{ fontSize: "clamp(2rem, 4.5vw, 3rem)", marginBottom: 18 }}>{A.title}</h1>
      {temp && (
        <p className="mono" style={{ background: "var(--paper-2)", border: "1px solid var(--accent)", padding: 12, borderRadius: 3, fontSize: "0.78rem" }}>
          {A.tempPre} <strong>{temp}</strong> {A.tempPost}
        </p>
      )}
      <ul style={{ listStyle: "none", padding: 0, margin: "20px 0" }}>
        {users.map((u) => (
          <li key={u.id} className="row">
            <span>{u.name} · <span className="text-steel">{u.email}</span></span>
            <span className="mono text-steel" style={{ fontSize: "0.78rem" }}>{u.role}</span>
          </li>
        ))}
      </ul>
      {user.role === "ADMIN" && (
        <form action={addUser} style={{ display: "grid", gap: 8 }}>
          <input name="name" placeholder={A.name} required className="input" />
          <input name="email" type="email" placeholder={A.email} required className="input" />
          <select name="role" className="input" defaultValue="RESIDENT">
            <option value="ADMIN">Admin</option>
            <option value="MANAGER">Manager</option>
            <option value="SUPERVISOR">Supervisor</option>
            <option value="RESIDENT">Resident</option>
          </select>
          <SubmitButton className="btn btn-accent">{A.create}</SubmitButton>
        </form>
      )}
    </div>
  );
}
