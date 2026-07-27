"use client";
import { useActionState, useEffect, useState } from "react";
import { updateUserProfile } from "@/app/actions/profile";
import { SubmitButton } from "@/components/submit-button";
import { Pencil } from "@/components/icons";

type T = {
  editProfile: string; phone: string; photo: string; signature: string; saveProfile: string;
  photoHint: string; signatureHint: string; invalidFormat: string; fileTooLarge: string;
  currentSignature: string; newSignaturePreview: string; currentPhoto: string; newPhotoPreview: string;
};

type Result = { ok: true } | { ok: false; error: string };

// Mirrors uploadBrandedImage's server-side limit (lib/storage/image-upload.ts).
// Kept in sync manually — there is no shared runtime constant importable from
// a client component; if the server limit changes, update this too.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SIGNATURE_TYPES = new Set(["image/png"]);

/**
 * Client wrapper around the (throwing) server action so useActionState can
 * surface a friendly inline error instead of an unhandled-rejection/error
 * overlay. `updateUserProfile` itself is untouched — same single-arg,
 * throwing contract the existing server-side tests rely on.
 */
async function submitProfile(_prev: Result | null, formData: FormData): Promise<Result> {
  try {
    await updateUserProfile(formData);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo actualizar el perfil." };
  }
}

function validateFile(file: File, kind: "photo" | "signature", t: T): string | null {
  const allowed = kind === "signature" ? SIGNATURE_TYPES : PHOTO_TYPES;
  if (!allowed.has(file.type)) return t.invalidFormat;
  if (file.size > MAX_IMAGE_BYTES) return t.fileTooLarge;
  return null;
}

function FilePreviewField({
  name, accept, hint, label, kind, currentUrl, currentLabel, previewLabel, t, onValidate,
}: {
  name: string; accept: string; hint: string; label: string; kind: "photo" | "signature";
  currentUrl: string | null; currentLabel: string; previewLabel: string; t: T;
  onValidate: (error: string | null) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // Release the object URL when replaced or when the field unmounts (e.g. the
  // <details> is collapsed) — otherwise each selection leaks a blob URL.
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const file = e.target.files?.[0];
    if (!file) { setPreviewUrl(null); setLocalError(null); onValidate(null); return; }
    // Client-side validation mirrors the server's rule (same type + size
    // limits as uploadBrandedImage) so a bad file never leaves the device.
    const err = validateFile(file, kind, t);
    if (err) {
      setPreviewUrl(null);
      setLocalError(err);
      onValidate(err);
      e.target.value = ""; // reject the selection
      return;
    }
    setLocalError(null);
    onValidate(null);
    setPreviewUrl(URL.createObjectURL(file));
  }

  return (
    <label className="form-label">
      {label}
      <input name={name} type="file" accept={accept} onChange={onChange} style={{ display: "block", marginTop: 4, fontSize: "0.78rem" }} />
      <span className="mono text-steel" style={{ display: "block", fontSize: "0.62rem", marginTop: 2 }}>{hint}</span>
      {localError && (
        <span role="alert" className="mono" style={{ display: "block", fontSize: "0.68rem", color: "var(--accent-deep)", marginTop: 3 }}>{localError}</span>
      )}
      {(currentUrl || previewUrl) && (
        <div style={{ display: "flex", gap: 10, marginTop: 6, alignItems: "flex-start" }}>
          {currentUrl && !previewUrl && (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={currentUrl} alt={currentLabel} style={{ width: 56, height: 56, objectFit: "contain", background: "#fff", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-sm)" }} />
              <div className="mono text-steel" style={{ fontSize: "0.58rem", marginTop: 2 }}>{currentLabel}</div>
            </div>
          )}
          {previewUrl && (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt={previewLabel} style={{ width: 56, height: 56, objectFit: "contain", background: "#fff", border: "1px solid var(--accent)", borderRadius: "var(--radius-sm)" }} />
              <div className="mono text-steel" style={{ fontSize: "0.58rem", marginTop: 2 }}>{previewLabel}</div>
            </div>
          )}
        </div>
      )}
    </label>
  );
}

export function MemberProfileForm({
  userId, phone, photoUrl, signatureUrl, t,
}: {
  userId: string; phone: string | null; photoUrl: string | null; signatureUrl: string | null; t: T;
}) {
  const [state, formAction] = useActionState<Result | null, FormData>(submitProfile, null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const blocked = Boolean(photoError || signatureError);

  return (
    <details className="inline-edit">
      <summary><Pencil size={11} /> {t.editProfile}</summary>
      <form action={formAction} style={{ display: "grid", gap: 8, marginTop: 8 }}>
        <input type="hidden" name="userId" value={userId} />
        <label className="form-label">
          {t.phone}
          <input name="phone" defaultValue={phone ?? ""} maxLength={30} className="input" style={{ marginTop: 4 }} />
        </label>
        <FilePreviewField
          name="photo" accept="image/jpeg,image/png,image/webp" hint={t.photoHint} label={t.photo} kind="photo"
          currentUrl={photoUrl} currentLabel={t.currentPhoto} previewLabel={t.newPhotoPreview} t={t} onValidate={setPhotoError}
        />
        <FilePreviewField
          name="signature" accept="image/png" hint={t.signatureHint} label={t.signature} kind="signature"
          currentUrl={signatureUrl} currentLabel={t.currentSignature} previewLabel={t.newSignaturePreview} t={t} onValidate={setSignatureError}
        />
        {state && !state.ok && (
          <p role="alert" className="mono" style={{ fontSize: "0.74rem", color: "var(--accent-deep)", margin: 0 }}>{state.error}</p>
        )}
        <SubmitButton className="btn btn-ghost" style={{ justifySelf: "start" }} disabled={blocked}>{t.saveProfile}</SubmitButton>
      </form>
    </details>
  );
}
