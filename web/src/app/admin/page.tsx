import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createUser } from "@/app/actions/admin";

const TEMP_PW_COOKIE = "r360_temp_pw";

export default async function AdminPage() {
  const session = await auth();
  const user = session!.user as { companyId: string; role: string };
  // Only ADMIN/MANAGER may view the team screen.
  if (user.role !== "ADMIN" && user.role !== "MANAGER") redirect("/");
  const companyId = user.companyId;

  const users = await prisma.user.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });

  // Flash the freshly-created temp password from a short-lived httpOnly cookie
  // (kept out of the URL). It auto-expires; cookies can't be cleared at render.
  const temp = (await cookies()).get(TEMP_PW_COOKIE)?.value;

  async function addUser(formData: FormData) {
    "use server";
    const tempPassword = await createUser(formData);
    (await cookies()).set(TEMP_PW_COOKIE, tempPassword, {
      httpOnly: true,
      sameSite: "lax",
      path: "/admin",
      maxAge: 30,
    });
    redirect("/admin");
  }

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 40 }}>
      <h1 style={{ fontSize: 34, fontWeight: 900, marginBottom: 20 }}>Equipo</h1>
      {temp && <p className="mono" style={{ background: "var(--paper-2)", border: "1px solid var(--accent)", padding: 12, borderRadius: 3 }}>
        Usuario creado. Contraseña temporal: <strong>{temp}</strong> — compártela con la persona.
      </p>}
      <ul style={{ listStyle: "none", padding: 0, margin: "20px 0" }}>
        {users.map((u) => (
          <li key={u.id} style={{ borderTop: "1px solid var(--line)", padding: "12px 0", display: "flex", justifyContent: "space-between" }}>
            <span>{u.name} · {u.email}</span><span className="mono" style={{ color: "var(--steel)" }}>{u.role}</span>
          </li>
        ))}
      </ul>
      {user.role === "ADMIN" && (
        <form action={addUser} style={{ display: "grid", gap: 8 }}>
          <input name="name" placeholder="Nombre" required style={fld} />
          <input name="email" type="email" placeholder="Correo" required style={fld} />
          <select name="role" style={fld} defaultValue="RESIDENT">
            <option value="ADMIN">Admin</option><option value="MANAGER">Manager</option>
            <option value="SUPERVISOR">Supervisor</option><option value="RESIDENT">Resident</option>
          </select>
          <button style={{ padding: "10px 18px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 3, fontWeight: 700 }}>Crear usuario</button>
        </form>
      )}
    </main>
  );
}
const fld = { padding: 10, border: "1px solid var(--line)", borderRadius: 3 } as const;
