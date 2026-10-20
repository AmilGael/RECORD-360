"use client";
import { useActionState } from "react";
import type { FormError } from "@/lib/errors/form-result";

/**
 * A form whose action returns a sentence instead of throwing. The children
 * stay server-rendered, so a SubmitButton inside still sees this form's pending state.
 */
export function InlineActionForm({
  action,
  children,
  className,
  style,
}: {
  action: (prev: FormError | null, formData: FormData) => Promise<FormError | null>;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className} style={style}>
      {state?.error && <p role="alert" className="form-error">{state.error}</p>}
      {children}
    </form>
  );
}
