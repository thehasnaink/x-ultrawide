// Wheel and keyboard input. Horizontal mode turns the wheel into sideways
// movement; vertical mode scrolls natively and only needs the keyboard bridged.

import { ON_BOARD, SNAP_DELAY } from "./constants.js";
import { state } from "./state.js";
import { clamp } from "./util.js";

export function installInput() {
  addEventListener(
    "wheel",
    (e) => {
      const current = state.current;
      if (!current || e.ctrlKey || e.defaultPrevented) return;
      if (!e.target.closest || !e.target.closest(ON_BOARD)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (current.mode === "v") {
        current.st.pending = null; // vertical mode scrolls natively; just stop restoring
        return;
      }
      const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
      const dx = e.deltaMode === 1 ? e.deltaX * 40 : e.deltaX;
      // Let a tall card scroll itself first.
      const cell = e.target.closest('[data-testid="cellInnerDiv"]');
      if (cell && Math.abs(dy) >= Math.abs(dx)) {
        const room = dy > 0 ? cell.scrollTop + cell.clientHeight < cell.scrollHeight - 1 : cell.scrollTop > 0;
        if (room) return;
      }
      e.preventDefault();
      const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      current.st.pending = null; // the user took over; stop restoring
      current.st.dir = Math.sign(delta) || current.st.dir;
      current.st.tx = clamp(current.st.tx + delta, 0, current.maxX || 0);
      current.st.snapAt = performance.now() + SNAP_DELAY; // settle on a whole column
    },
    { passive: false, capture: true }
  );

  addEventListener(
    "keydown",
    (e) => {
      const current = state.current;
      if (!current || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return; // a dialog owns the keyboard
      if (current.mode === "v") {
        // The strip is a scroll box, but only scrolls from the keyboard when it
        // has focus; give the usual keys their usual effect.
        const box = current.el;
        const page = box.clientHeight * 0.9;
        const by = { PageDown: page, PageUp: -page, ArrowDown: 80, ArrowUp: -80, " ": e.shiftKey ? -page : page };
        if (e.key in by) box.scrollBy({ top: by[e.key], behavior: "smooth" });
        else if (e.key === "Home") box.scrollTo({ top: 0, behavior: "smooth" });
        else if (e.key === "End") box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
        else return;
        current.st.pending = null;
        e.preventDefault();
        return;
      }
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const stride = current.stride || 500;
      const st = current.st;
      st.pending = null;
      st.dir = dir;
      st.snapAt = 0;
      st.tx = clamp((Math.round(st.tx / stride) + dir) * stride, 0, current.maxX || 0);
    },
    true
  );
}
