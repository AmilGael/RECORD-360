/**
 * History bookkeeping for the side sheet: one pushed entry per open sheet, so
 * the phone back gesture closes it, and that entry is popped again when the
 * sheet closes any other way.
 *
 * `history.back()` is asynchronous, which is what makes the naive version
 * race: a cleanup that calls it, followed at once by a new push (React
 * StrictMode remount, or Escape then Enter on the opener), would have the
 * queued traversal land on the NEW listener and close the sheet just opened.
 * So `release()` defers its back by a tick and `push()` cancels it, reusing
 * the entry that still exists; and a back already in flight is recognised
 * when it lands (its popstate is ignored) and any push waits for it.
 */
export type SheetHistoryWindow = {
  history: { readonly state: unknown; pushState(state: unknown, unused: string): void; back(): void };
  addEventListener(type: "popstate", listener: () => void): void;
  removeEventListener(type: "popstate", listener: () => void): void;
};

export function createSheetHistory(win: SheetHistoryWindow, onPop: () => void) {
  let active = false; // between push() and release()
  let entry = false; // our entry is on the stack
  let ignoring = false; // our own back() is in flight
  let wantPush = false; // push() arrived while it was in flight
  let timer: ReturnType<typeof setTimeout> | null = null;
  let attached = false;

  const pushEntry = () => {
    const state = win.history.state;
    win.history.pushState({ ...(state && typeof state === "object" ? state : {}), sheet: true }, "");
    entry = true;
  };
  const attach = () => {
    if (!attached) win.addEventListener("popstate", listener);
    attached = true;
  };
  const detach = () => {
    if (attached) win.removeEventListener("popstate", listener);
    attached = false;
  };
  function listener() {
    if (ignoring) {
      ignoring = false;
      if (!active) detach();
      else if (wantPush) {
        wantPush = false;
        pushEntry();
      }
      return;
    }
    if (!active) return; // the user popped during the deferral; the timer copes
    entry = false;
    onPop();
  }

  return {
    push() {
      active = true;
      attach();
      if (timer) {
        clearTimeout(timer); // closed and reopened at once: the entry is still there
        timer = null;
      } else if (ignoring) wantPush = true;
      else if (!entry) pushEntry();
    },
    release() {
      active = false;
      wantPush = false;
      if (!entry) {
        if (!ignoring) detach();
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        entry = false;
        const mine = (win.history.state as { sheet?: boolean } | null)?.sheet;
        if (mine) {
          ignoring = true;
          win.history.back();
        } else if (!active) detach();
      }, 0);
    },
  };
}
