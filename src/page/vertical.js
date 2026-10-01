// Vertical mode: a classic masonry. Every post goes into whichever column is
// currently the shortest, and the strip scrolls natively (overflow-y: auto in
// the CSS). Cards sit at fixed board coordinates; we only read scrollTop to
// tell X which posts are on screen.

import { GAP, PAD } from "./constants.js";
import { isAdId, measureCells } from "./ads.js";
import { pinnedHeights, placePinnedV } from "./pinned.js";
import { hideBar } from "./scrollbar.js";
import { state } from "./state.js";
import { parseT, root } from "./util.js";

function packMasonry(S, cols, reserved, hc) {
  const list = S.props.list;
  const n = list.length;
  const colOf = new Int32Array(n).fill(-1); // -1: not on the board (an ad)
  const top = new Float64Array(n);
  const bottom = new Float64Array(n);
  const tpos = new Float64Array(n + 1);
  const colH = new Float64Array(cols);
  colH[0] = reserved; // composer + trends sit at the top of column 0
  for (let k = 0; k < n; k++) {
    const raw = S._getHeight(list[k]);
    tpos[k + 1] = tpos[k] + raw; // X's own coordinates, for the render window
    if (isAdId(list[k].id)) continue;
    const own = hc.get(list[k].id);
    const h = own === undefined ? raw : own;
    let c = 0;
    for (let i = 1; i < cols; i++) if (colH[i] < colH[c]) c = i;
    const t = colH[c] > 0 ? colH[c] + GAP : 0;
    colOf[k] = c;
    top[k] = t;
    bottom[k] = t + h;
    colH[c] = t + h;
  }
  let total = 0;
  for (let i = 0; i < cols; i++) if (colH[i] > total) total = colH[i];
  return { n, colOf, top, bottom, tpos, total };
}

export function stepVertical(g) {
  const current = state.current;
  const { S, el, st } = current;
  const { Hc, Wc, cols } = g;

  measureCells(current, Wc);
  const { hC, hT } = pinnedHeights();
  const reserved = hC + (hC && hT ? GAP : 0) + hT;
  const L = packMasonry(S, cols, reserved, current.hc);
  const list = S.props.list;
  const index = new Map();
  for (let k = 0; k < L.n; k++) index.set(list[k].id, k);
  current.cols = cols;

  // The scroll range: a marker at the bottom of the board (see the CSS).
  const total = L.total + 2 * PAD;
  if (total !== current.total) {
    current.total = total;
    root.style.setProperty("--xs-total-h", total + "px");
  }

  // Switching tabs gives the list a new cacheKey on the same element.
  if (S.props.cacheKey !== st.cacheKey) {
    st.cacheKey = S.props.cacheKey;
    st.key = String(st.cacheKey);
    el.scrollTop = 0;
  }

  // Restore the saved position (see the horizontal step for why it keeps
  // re-applying until the geometry has settled).
  if (st.pending) {
    const k = index.get(st.pending);
    if (k !== undefined && L.colOf[k] >= 0) {
      el.scrollTop = Math.max(0, L.top[k] - st.pendingOffset);
      if (Wc === st.pendingStride) st.pendingStable++;
      else {
        st.pendingStride = Wc;
        st.pendingStable = 0;
      }
      if (st.pendingStable >= 20) st.pending = null;
    } else if (++st.pendingFrames > 300) {
      st.pending = null;
    }
  }

  const y = el.scrollTop;
  st.y = y;

  // Remember where we are: the first post whose top is at or below the top of
  // the view, and how far below. (Anchoring on a post that is mostly scrolled
  // out above the view would restore to that post's top, a card-height off.)
  if (!st.pending && L.n) {
    for (let k = 0; k < L.n; k++) {
      if (L.colOf[k] >= 0 && L.top[k] >= y) {
        state.savedPos.set(st.key, { anchorId: list[k].id, offset: L.top[k] - y });
        break;
      }
    }
  }

  // Tell X which posts are on screen: those overlapping the visible range
  // plus a little either side, in X's own list coordinates.
  const pre = Hc * 0.6;
  const y0 = y - pre;
  const y1 = y + Hc + pre;
  let k0 = -1;
  let k1 = -1;
  for (let k = 0; k < L.n; k++) {
    if (L.colOf[k] < 0) continue;
    if (L.bottom[k] >= y0 && L.top[k] <= y1) {
      if (k0 < 0) k0 = k;
      k1 = k;
    }
  }
  if (k0 >= 0) {
    st.top = L.tpos[k0] + 1;
    st.height = Math.max(1, L.tpos[k1 + 1] - L.tpos[k0] - 2);
    if (k0 !== st.k0 || k1 !== st.k1) {
      st.k0 = k0;
      st.k1 = k1;
      S._scheduleCriticalUpdate();
    }
  }

  // Place every mounted cell at its board coordinates.
  for (const [id, comp] of S._cells) {
    const cell = comp && comp.getElement && comp.getElement();
    const k = index.get(id);
    if (!cell || k === undefined || L.colOf[k] < 0) continue;
    if (cell.hasAttribute("data-xs-ad")) continue;
    const t = parseT(cell);
    if (t === null) continue;
    const v = `${PAD + L.colOf[k] * g.stride}px ${PAD + L.top[k] - t}px`;
    if (cell.__xs !== v) {
      cell.__xs = v;
      cell.style.translate = v;
    }
    st.placed = true;
  }

  placePinnedV(g, y, hC, hT);
  hideBar();
  if (__DEV__) window.__xsDbg = { mode: "v", y, total, cols, Wc, n: L.n, key: st.key, pending: st.pending };
  if (st.placed && !el.hasAttribute("data-xs-ready")) el.setAttribute("data-xs-ready", "");
}
