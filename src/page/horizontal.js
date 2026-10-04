// Horizontal mode: posts are packed into columns as tall as the screen, and the
// board scrolls sideways. We own the scroll position (an eased offset moved by
// the wheel, keys and the scrollbar) and tell X which slice of its list is on
// screen.

import { GAP, LOOKAHEAD, MAX_EXTRA_GAP, PAD, PREFETCH_COLS, SNAP_TOL } from "./constants.js";
import { anchorShift, heightOf, isAdId, measureCells } from "./ads.js";
import { pinnedHeights, placePinned } from "./pinned.js";
import { updateBar } from "./scrollbar.js";
import { state } from "./state.js";
import { clamp, parseT, root } from "./util.js";

// Which column to settle on after scrolling. Always the one in the direction
// of travel: rounding to the *nearest* column pulls the view backwards
// whenever a wheel or trackpad gesture pauses early in a column (and a mouse
// wheel notch is ~100px against a ~490px column, so that is almost every
// notch). A tiny overshoot past a column edge just settles on that edge.
function snapTarget(tx, stride, dir) {
  const f = tx / stride;
  const lo = Math.floor(f);
  const frac = f - lo;
  let j;
  if (frac < SNAP_TOL) j = lo;
  else if (frac > 1 - SNAP_TOL) j = lo + 1;
  else j = dir < 0 ? lo : lo + 1;
  return j * stride;
}

// Pack items into columns of height Hc. A column starts with the earliest
// unplaced item, then takes the earliest of the next LOOKAHEAD unplaced items
// that still fits underneath; when none fits, the next column starts. Posts
// stay roughly in order, but columns don't end half empty.
// `reserved` is the height already taken at the top of column 0 by the
// pinned composer/trends cards. `hc` holds heights we measured ourselves,
// which are fresher than X's (X updates its own a beat later).
function pack(S, Hc, reserved, current) {
  const list = S.props.list;
  const n = list.length;
  const h = new Float64Array(n);
  const tpos = new Float64Array(n + 1);
  const colOf = new Int32Array(n);
  const y = new Float64Array(n);
  const placed = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    h[k] = Math.min(heightOf(S, list[k], current), Hc);
    tpos[k + 1] = tpos[k] + S._getHeight(list[k]); // X's own coordinates, for the render window
    if (isAdId(list[k].id)) {
      // Left out of the board: never placed in a column (X still sees it in
      // its own list, so its render window and "load more" are unaffected).
      placed[k] = 1;
      colOf[k] = -1;
      h[k] = 0;
    }
  }

  const colMin = [];
  const colMax = [];
  let next = 0;
  while (next < n && placed[next]) next++; // skip leading ads
  while (next < n || colMin.length === 0) {
    const col = colMin.length;
    const pinnedCol = col === 0 && reserved > 0;
    const members = [];
    let cursor = pinnedCol ? reserved : 0; // bottom of what's already in the column
    let hasContent = pinnedCol;
    let lo = n;
    let hi = -1;
    const put = (k) => {
      placed[k] = 1;
      colOf[k] = col;
      y[k] = hasContent ? cursor + GAP : 0;
      cursor = y[k] + h[k];
      hasContent = true;
      members.push(k);
      if (k < lo) lo = k;
      if (k > hi) hi = k;
    };
    // Plain columns always take their earliest unplaced item first.
    if (next < n && !pinnedCol) put(next);
    for (;;) {
      let pick = -1;
      for (let k = next, seen = 0; k < n && seen < LOOKAHEAD; k++) {
        if (placed[k]) continue;
        seen++;
        if ((hasContent ? cursor + GAP : 0) + h[k] <= Hc) {
          pick = k;
          break;
        }
      }
      if (pick < 0) break;
      put(pick);
    }
    // Spread leftover space between the cards of a full column.
    if (!pinnedCol && members.length > 1 && next + 1 < n) {
      const extra = Math.min((Hc - cursor) / (members.length - 1), MAX_EXTRA_GAP);
      if (extra > 0) members.forEach((k, i) => (y[k] += i * extra));
    }
    colMin.push(lo);
    colMax.push(hi);
    while (next < n && placed[next]) next++;
  }
  return { n, ncols: colMin.length, colOf, y, tpos, colMin, colMax };
}

export function stepHorizontal(g) {
  const current = state.current;
  const { S, el, st } = current;
  const { VW, Hc, Wc, stride } = g;

  measureCells(current, Wc);
  const hc = current.hc;

  // Column 0 starts with the pinned composer and trends cards.
  const { hC, hT } = pinnedHeights();
  const reserved = hC + (hC && hT ? GAP : 0) + hT;

  const L = pack(S, Hc, reserved, current);
  const list = S.props.list;
  const index = new Map();
  for (let k = 0; k < L.n; k++) index.set(list[k].id, k);
  const maxX = Math.max(0, 2 * PAD + L.ncols * stride - GAP - VW);
  // The board was re-packed under the view (X reordered its list, or posts
  // changed height): move the view by as many columns as its posts moved.
  if (!st.pending) {
    const shift = anchorShift(st.anchors, index, (k) => (L.colOf[k] < 0 ? null : L.colOf[k]));
    if (shift) {
      st.x += shift * (current.stride || stride);
      st.tx += shift * (current.stride || stride);
    }
  }

  // The card width changed: stay on the same column instead of the same pixel.
  if (current.stride && current.stride !== stride && !st.pending) {
    st.tx = Math.round(st.tx / current.stride) * stride;
    st.x = (st.x / current.stride) * stride;
  }
  current.stride = stride;
  current.maxX = maxX;

  // Restore the saved position: put the saved post's column at the left.
  // Right after navigating back the primary column can still be at X's native
  // width for a few frames, so the column stride is not final yet. Keep
  // re-applying until the stride has held steady, then let go.
  if (st.pending) {
    const k = index.get(st.pending);
    if (k !== undefined) {
      st.x = st.tx = clamp(L.colOf[k] * stride, 0, maxX);
      if (stride === st.pendingStride) st.pendingStable++;
      else {
        st.pendingStride = stride;
        st.pendingStable = 0;
      }
      if (st.pendingStable >= 20) st.pending = null;
    } else if (++st.pendingFrames > 300) {
      st.pending = null; // never showed up; give up and start at the left
    }
  }

  st.tx = clamp(st.tx, 0, maxX);
  if (st.snapAt && performance.now() >= st.snapAt) {
    st.snapAt = 0;
    st.tx = clamp(snapTarget(st.tx, stride, st.dir), 0, maxX);
  }
  // Ease x toward tx. Time-based, so slow frames (X mounting heavy media)
  // still settle on the column in the same wall-clock time.
  const now = performance.now();
  const dtMs = Math.min(100, now - (st.lastT || now));
  st.lastT = now;
  const d = st.tx - st.x;
  st.x = Math.abs(d) < 1 ? st.tx : st.x + d * (1 - Math.exp(-dtMs / 70));
  st.x = clamp(st.x, 0, maxX);

  // Remember where we are: the first post of the leftmost column.
  if (!st.pending && L.n) {
    const jl = clamp(Math.round(st.tx / stride), 0, L.ncols - 1);
    const k = L.colMin[jl];
    if (k < L.n) state.savedPos.set(st.key, { anchorId: list[k].id });
    // ...and, for the next frame, the posts at the left edge of the view with
    // the column each is in: every post of the leftmost column, then the first
    // post of the next two.
    const j0 = clamp(Math.floor(st.x / stride + 0.001), 0, L.ncols - 1);
    const anchors = [];
    for (let i = L.colMin[j0]; i <= L.colMax[j0] && anchors.length < 6; i++) if (L.colOf[i] === j0) anchors.push([list[i].id, j0]);
    for (let j = j0 + 1; j <= j0 + 2 && j < L.ncols; j++) if (L.colMin[j] < L.n) anchors.push([list[L.colMin[j]].id, j]);
    st.anchors = anchors;
  }

  state.lastX = st.x;
  placePinned(g, st.x, hC, hT);
  current.cols = g.cols;
  updateBar(g, st, maxX);

  // Move the view: the strip is an overflow:hidden box, so it can be scrolled
  // programmatically. Its ::after (see the CSS) reaches out to the end of the
  // board so the scroll range exists even where X hasn't mounted cards yet.
  const total = 2 * PAD + L.ncols * stride;
  if (total !== current.total) {
    current.total = total;
    root.style.setProperty("--xs-total", total + "px");
  }
  const sl = Math.round(st.x);
  if (el.scrollLeft !== sl) el.scrollLeft = sl;

  // Tell X which slice of the list is on screen (in its own list coordinates).
  if (L.n) {
    const j0 = clamp(Math.floor(st.x / stride) - PREFETCH_COLS, 0, L.ncols - 1);
    const j1 = clamp(Math.ceil((st.x + VW) / stride) + PREFETCH_COLS, 0, L.ncols - 1);
    let k0 = L.n;
    let k1 = 0;
    for (let j = j0; j <= j1; j++) {
      if (L.colMin[j] < k0) k0 = L.colMin[j];
      if (L.colMax[j] > k1) k1 = L.colMax[j];
    }
    if (k1 >= k0) {
      // Keep the proxy's rect current, but only ask X to re-evaluate (and
      // mount/unmount cards) when the set of posts in the window changes,
      // not each time a measured height nudges the pixel values.
      st.top = L.tpos[k0] + 1;
      st.height = Math.max(1, L.tpos[k1 + 1] - L.tpos[k0] - 2);
      // which posts those are, so the rect can be re-found if X changes its list
      // before the next frame (see getRect in engine.js)
      if (k0 !== st.k0 || k1 !== st.k1 || st.winList !== list) {
        st.winList = list;
        st.winIds = [];
        for (let k = k0; k <= k1; k++) st.winIds.push(list[k].id);
      }
      if (k0 !== st.k0 || k1 !== st.k1) {
        st.k0 = k0;
        st.k1 = k1;
        S._scheduleCriticalUpdate();
      }
    }
  }

  // Place every mounted cell.
  for (const [id, comp] of S._cells) {
    const cell = comp && comp.getElement && comp.getElement();
    const k = index.get(id);
    if (!cell || k === undefined) continue;
    if (cell.hasAttribute("data-xs-ad")) continue; // dropped from the board
    const t = parseT(cell);
    if (t === null) continue;
    // Board coordinates: the view is moved by scrolling the strip (above), so a
    // card's own translate only changes when the layout does, not on every
    // frame of a glide.
    const v = `${PAD + L.colOf[k] * stride}px ${PAD + L.y[k] - t}px`;
    if (cell.__xs !== v) {
      cell.__xs = v;
      cell.style.translate = v;
    }
    st.placed = true;
  }
  if (__DEV__) {
    window.__xsDbg = { mode: "h", x: st.x, tx: st.tx, stride, maxX, Wc, cols: g.cols, VW, ncols: L.ncols, snapAt: st.snapAt, key: st.key, pending: st.pending, pf: st.pendingFrames, n: L.n };
    window.__xsSaved = () => JSON.stringify([...state.savedPos]);
  }

  // Until the first placement the new list stays hidden (see the CSS), so a tab
  // switch never shows cells stacked at their native positions.
  if (st.placed && !el.hasAttribute("data-xs-ready")) el.setAttribute("data-xs-ready", "");
}
