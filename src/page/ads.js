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

// The height to lay a post out with. Ours if we have measured it; else X's.
// For a post X has never rendered, X's figure is only its placeholder guess
// (assumedItemHeight, 250px), about half of what posts really come to. Laying
// out a stretch of unseen posts at 250px packs twice too many into each column,
// and they all move again once they render. Our own running average of the
// posts measured so far is a much closer guess.
export function heightOf(S, item, c) {
  const own = c.hc.get(item.id);
  if (own !== undefined) return own;
  const raw = S._getHeight(item);
  if (c.hcN >= 8) {
    const guess = S.props.assumedItemHeight;
    if (typeof guess === "function" && raw === guess(item)) return c.hcSum / c.hcN;
  }
  return raw;
}

// Which post the view should stay on. X does not only append to its list: when
// more loads it also moves posts that were scrolled past to the end, drops
// some, and inserts others, and a post's height changes as its media loads. Any
// of that re-packs the board under the view. So the view is tied to posts, not
// to a pixel offset: `anchors` is a few posts at the leading edge of the view,
// each with where it sat ([id, position]). After a re-pack, the first of them
// that is still in its place in the list says how far the board moved.
// `index` maps id -> list index, `posOf(k)` gives a post's position now, or
// null if it is not on the board. Returns the shift, or 0.
export function anchorShift(anchors, index, posOf) {
  if (!anchors) return 0;
  const live = [];
  for (const [id, pos] of anchors) {
    const k = index.get(id);
    if (k === undefined) continue;
    const now = posOf(k);
    if (now !== null) live.push({ k, d: now - pos });
  }
  for (let i = 0; i < live.length; i++) {
    // Still ahead of the next one in the list, as it was? Then it was not one
    // of the posts X sent to the end. (The last one has nothing to compare to.)
    if (i === live.length - 1 || live[i].k < live[i + 1].k) return live[i].d;
  }
  return 0;
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
  let sum = 0;
  let cnt = 0;
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
  // running average of every post measured so far (see heightOf)
  for (const v of hc.values()) {
    sum += v;
    cnt++;
  }
  c.hcSum = sum;
  c.hcN = cnt;
}
