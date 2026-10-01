import { AD_ID, AD_LABEL } from "./constants.js";
import { blocking } from "./config.js";
import { state } from "./state.js";

export function isAdId(id) {
  return blocking() && (AD_ID.test(String(id)) || state.adByLabel.get(id) === true);
}

// Classify a mounted cell by its text, once it has rendered enough to tell.
export function isAdCell(id, cell) {
  if (!blocking()) return false;
  if (isAdId(id)) return true;
  if (state.adByLabel.has(id) || !cell) return false;
  const lines = (cell.innerText || "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 4) return false; // skeleton: look again next frame
  const hit = lines.slice(0, 6).some((l) => AD_LABEL.test(l));
  state.adByLabel.set(id, hit);
  return hit;
}

// Heights we measure ourselves (X's lag behind image loads, which would let a
// card overflow its column for a moment), valid for one card width; and the
// ads: a mounted ad gets tagged here and hidden by the CSS, so it takes no
// space and is never seen. Shared by both layout modes.
export function measureCells(c, Wc) {
  const hc = c.hc;
  if (c.hcW !== Wc) {
    hc.clear();
    c.hcW = Wc;
  }
  for (const [id, comp] of c.S._cells) {
    const cell = comp && comp.getElement && comp.getElement();
    if (!cell) continue;
    if (isAdCell(id, cell)) {
      if (!cell.hasAttribute("data-xs-ad")) cell.setAttribute("data-xs-ad", "");
      continue;
    }
    if (cell.hasAttribute("data-xs-ad")) cell.removeAttribute("data-xs-ad"); // blocking was switched off
    const hh = cell.offsetHeight;
    if (hh > 0) hc.set(id, hh);
  }
}
