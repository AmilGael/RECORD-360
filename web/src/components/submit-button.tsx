"use client";
import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel,
  className = "btn btn-ink",
  style,
  disabled = false,
}: {
  children: React.ReactNode;
  pendingLabel?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Extra disable condition on top of the form's own pending state (e.g. a
   *  client-side validation error that should block submission). */
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} style={style} disabled={pending || disabled} aria-busy={pending}>
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
