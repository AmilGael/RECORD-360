"use client";
import { useOptimistic, useState, type ReactNode } from "react";
import Link from "next/link";
import { resolveReminder } from "@/app/actions/reminders";
import { SubmitButton } from "@/components/submit-button";

export type PendingRow = {
  id: string;
  content: ReactNode;
  action: { kind: "resolve"; registroId: string } | { kind: "link"; href: string };
};

const rowButtonStyle = { fontSize: "0.76rem", padding: "0.3rem 0.65rem" } as const;

/**
 * The pending queue. Resolve hides its row at once (optimistic, urgent
 * priority) while the server action and the revalidated tree arrive in the
 * transition; if the action fails, the optimistic removal reverts and the row
 * comes back with the error under it.
 */
export function PendingList({
  rows,
  emptyLabel,
  labels,
}: {
  rows: PendingRow[];
  emptyLabel: string;
  labels: { resolve: string; viewRequest: string; resolveError: string };
}) {
  const [visible, hideRow] = useOptimistic(rows, (current, id: string) => current.filter((r) => r.id !== id));
  const [failedId, setFailedId] = useState<string | null>(null);

  async function resolve(id: string, formData: FormData) {
    setFailedId(null);
    hideRow(id);
    try {
      await resolveReminder(formData);
    } catch {
      setFailedId(id);
    }
  }

  if (visible.length === 0) return <p className="text-steel">{emptyLabel}</p>;

  return (
    <>
      {visible.map((row) => (
        <div key={row.id} className="row" style={{ gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            {row.content}
            {failedId === row.id && (
              <p role="alert" className="mono" style={{ fontSize: "0.74rem", color: "var(--accent-deep)", margin: "6px 0 0" }}>
                {labels.resolveError}
              </p>
            )}
          </div>
          {row.action.kind === "resolve" ? (
            <form action={resolve.bind(null, row.id)}>
              <input type="hidden" name="registroId" value={row.action.registroId} />
              <SubmitButton className="btn btn-ghost" style={rowButtonStyle}>
                {labels.resolve}
              </SubmitButton>
            </form>
          ) : (
            <Link href={row.action.href} className="btn btn-ghost" style={rowButtonStyle}>
              {labels.viewRequest}
            </Link>
          )}
        </div>
      ))}
    </>
  );
}
