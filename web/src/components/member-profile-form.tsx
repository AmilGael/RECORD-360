import { updateUserProfile } from "@/app/actions/profile";
import { SubmitButton } from "@/components/submit-button";
import { Pencil } from "@/components/icons";

type T = { editProfile: string; phone: string; photo: string; signature: string; saveProfile: string };

export function MemberProfileForm({ userId, phone, t }: { userId: string; phone: string | null; t: T }) {
  return (
    <details className="inline-edit">
      <summary><Pencil size={11} /> {t.editProfile}</summary>
      <form action={updateUserProfile} style={{ display: "grid", gap: 8, marginTop: 8 }}>
        <input type="hidden" name="userId" value={userId} />
        <label className="form-label">
          {t.phone}
          <input name="phone" defaultValue={phone ?? ""} maxLength={30} className="input" style={{ marginTop: 4 }} />
        </label>
        <label className="form-label">
          {t.photo}
          <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "block", marginTop: 4, fontSize: "0.78rem" }} />
        </label>
        <label className="form-label">
          {t.signature}
          <input name="signature" type="file" accept="image/png" style={{ display: "block", marginTop: 4, fontSize: "0.78rem" }} />
        </label>
        <SubmitButton className="btn btn-ghost" style={{ justifySelf: "start" }}>{t.saveProfile}</SubmitButton>
      </form>
    </details>
  );
}
