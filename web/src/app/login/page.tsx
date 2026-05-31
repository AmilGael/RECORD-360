import { signIn } from "@/auth";
import { redirect } from "next/navigation";

export default function LoginPage() {
  async function doLogin(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"), password: formData.get("password"), redirect: false,
      });
    } catch {
      redirect("/login?error=1");
    }
    redirect("/");
  }
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <form action={doLogin} style={{ width: 340, padding: 32, border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper-2)" }}>
        <div className="mono" style={{ fontSize: 12, letterSpacing: 2, color: "var(--steel)" }}>RECORD 360</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: "8px 0 24px" }}>Iniciar sesión</h1>
        <input name="email" type="email" placeholder="Correo" required style={inputStyle} />
        <input name="password" type="password" placeholder="Contraseña" required style={inputStyle} />
        <button type="submit" style={btnStyle}>Entrar →</button>
      </form>
    </main>
  );
}
const inputStyle = { width: "100%", padding: "11px 12px", marginBottom: 12, border: "1px solid var(--line)", borderRadius: 3, fontSize: 14 } as const;
const btnStyle = { width: "100%", padding: "12px", background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 3, fontWeight: 700, cursor: "pointer" } as const;
