"use client";
import type { ComponentProps } from "react";
import { CambiosCreate } from "@/components/cambios-create";
import { CreateSheet } from "@/components/create-sheet";
import { ClipboardPlus } from "@/components/icons";

/** "Nueva solicitud": the request form in the side sheet, closed once the request exists. */
export function CambiosCreateSheet({
  closeLabel,
  ...form
}: Omit<ComponentProps<typeof CambiosCreate>, "onSuccess"> & { closeLabel: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <CreateSheet
        label={form.t.new}
        closeLabel={closeLabel}
        triggerIcon={<ClipboardPlus size={12} style={{ verticalAlign: -1, marginRight: 5 }} />}
      >
        {(close) => <CambiosCreate {...form} onSuccess={close} />}
      </CreateSheet>
    </div>
  );
}
