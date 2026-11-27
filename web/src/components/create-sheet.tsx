"use client";
import { useCallback, useState, type ReactNode } from "react";
import { Sheet } from "@/components/sheet";

/**
 * A button that opens a create form in the side sheet. The sheet is titled
 * with the button's label; `children` receives `close`, which the form calls
 * once the record exists. The form only mounts while the sheet is open, so
 * anything it starts on mount (the solicitud GPS fix) waits until asked for.
 */
export function CreateSheet({
  label,
  closeLabel,
  triggerClassName = "btn btn-accent",
  triggerIcon,
  children,
}: {
  label: string;
  closeLabel: string;
  triggerClassName?: string;
  triggerIcon?: ReactNode;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        {triggerIcon}
        {label}
      </button>
      <Sheet open={open} title={label} onClose={close} closeLabel={closeLabel}>
        {open && children(close)}
      </Sheet>
    </>
  );
}
