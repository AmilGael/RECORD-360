import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSheetHistory } from "@/lib/ui/sheet-history";

// A browser history in miniature: pushState adds an entry, back() is
// asynchronous (it lands on `settle()`), and a traversal fires popstate.

function fakeWindow() {
  const entries: Array<{ sheet?: boolean } | null> = [null];
  let index = 0;
  let pendingBacks = 0;
  const listeners = new Set<() => void>();
  const fire = () => [...listeners].forEach((l) => l());
  const win = {
    history: {
      get state() {
        return entries[index];
      },
      pushState(state: unknown) {
        entries.splice(index + 1);
        entries.push(state as { sheet?: boolean });
        index++;
      },
      back() {
        pendingBacks++;
      },
    },
    addEventListener(_type: "popstate", l: () => void) {
      listeners.add(l);
    },
    removeEventListener(_type: "popstate", l: () => void) {
      listeners.delete(l);
    },
  };
  return {
    win,
    /** The phone back gesture: lands at once. */
    userBack() {
      index--;
      fire();
    },
    /** Lets queued history.back() calls land. */
    settle() {
      while (pendingBacks > 0) {
        pendingBacks--;
        index = Math.max(0, index - 1);
        fire();
      }
    },
    get index() {
      return index;
    },
    get length() {
      return entries.length;
    },
    get listeners() {
      return listeners.size;
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createSheetHistory", () => {
  it("(a) a user pop calls onPop once and leaves no entry behind", () => {
    const h = fakeWindow();
    const onPop = vi.fn();
    const sheet = createSheetHistory(h.win, onPop);
    sheet.push();
    expect(h.index).toBe(1);
    h.userBack();
    expect(onPop).toHaveBeenCalledTimes(1);
    sheet.release(); // the sheet closing in response
    vi.runAllTimers();
    h.settle();
    expect(onPop).toHaveBeenCalledTimes(1);
    expect(h.index).toBe(0);
    expect(h.listeners).toBe(0);
  });

  it("(b) closing any other way pops the entry exactly once", () => {
    const h = fakeWindow();
    const onPop = vi.fn();
    const sheet = createSheetHistory(h.win, onPop);
    sheet.push();
    sheet.release();
    vi.runAllTimers();
    h.settle();
    expect(h.index).toBe(0);
    expect(onPop).not.toHaveBeenCalled();
    expect(h.listeners).toBe(0);
  });

  it("(c) StrictMode shape: push, release, push in one tick leaves one entry", () => {
    const h = fakeWindow();
    const onPop = vi.fn();
    const sheet = createSheetHistory(h.win, onPop);
    sheet.push();
    sheet.release();
    sheet.push();
    vi.runAllTimers();
    h.settle();
    expect(h.index).toBe(1);
    expect(h.length).toBe(2);
    expect(onPop).not.toHaveBeenCalled();
    // and the real close afterwards still pops it
    sheet.release();
    vi.runAllTimers();
    h.settle();
    expect(h.index).toBe(0);
    expect(onPop).not.toHaveBeenCalled();
  });

  it("(d) fast close-then-reopen before the deferred back fires keeps one entry", async () => {
    const h = fakeWindow();
    const onPop = vi.fn();
    const sheet = createSheetHistory(h.win, onPop);
    sheet.push();
    sheet.release(); // Escape
    await Promise.resolve();
    sheet.push(); // Enter on the opener
    vi.runAllTimers();
    h.settle();
    expect(h.index).toBe(1);
    expect(h.length).toBe(2);
    expect(onPop).not.toHaveBeenCalled();
  });

  it("(e) a popstate caused by the module's own back() does not call onPop", () => {
    const h = fakeWindow();
    const onPop = vi.fn();
    const sheet = createSheetHistory(h.win, onPop);
    sheet.push();
    sheet.release();
    vi.advanceTimersByTime(1); // back() is now in flight
    sheet.push(); // reopened before it landed
    h.settle(); // the traversal lands on the new listener
    expect(onPop).not.toHaveBeenCalled();
    expect(h.index).toBe(1); // exactly one entry for the reopened sheet
    sheet.release();
    vi.runAllTimers();
    h.settle();
    expect(h.index).toBe(0);
    expect(onPop).not.toHaveBeenCalled();
  });
});
