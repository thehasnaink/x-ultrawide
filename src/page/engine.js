// The engine: attaching to X's list, and the per-frame orchestration.
//
// How X's list (loader.AbsolutePower) works, and what we rely on:
//  - props.list is the ordered list of every loaded item; _heights holds their
//    measured heights; _getHeight(item) gives measured-or-assumed height.
//  - It mounts only the items intersecting `_viewport.getRect()` (shifted by
//    -root.getBoundingClientRect().top), widened by min/preferredOffscreen-
//    ToViewportRatio. Mounted cells are position:absolute + translateY(t).
//  - When the rect nears the end of the list it asks for more posts.
//  - The list is keyed by cacheKey, so every timeline tab is a fresh instance.
//
// So instead of fighting native scrolling we hand the list a proxy viewport
// whose rect we compute ourselves (from a horizontal offset, or from the
// vertical scroll position), pin the list root as a fixed strip, and place
// every mounted cell with the CSS `translate` property.

import { GAP, OVERLAY_ROUTE, PAD } from "./constants.js";
import { modeOf, readCfg } from "./config.js";
import { stepHorizontal } from "./horizontal.js";
import { findLiveScroller } from "./scroller.js";
import { stableOrder } from "./order.js";
import { hideBar } from "./scrollbar.js";
import { clearAllPinned, markPinned, pinnedHeights, placePinned } from "./pinned.js";
import { state } from "./state.js";
import { isFeedRoute, root } from "./util.js";
import { stepVertical } from "./vertical.js";

// ---- page theme and geometry ----------------------------------------------

// The strip is the primary column below its sticky tab bar; the board inside
// it has PAD on every side.
function geometry(pc) {
  const pr = pc.getBoundingClientRect();
  const tl = pc.querySelector('[role="tablist"]');
  const T = Math.ceil(tl ? tl.getBoundingClientRect().bottom : 53);
  const VW = Math.floor(pr.width);
  const stripH = Math.max(300, window.innerHeight - T);
  const Hc = stripH - 2 * PAD;
  // Cards are exactly as wide as the setting says, so the slider is followed
  // pixel for pixel (rounding to a whole number of columns made the width jump
  // only when the column count changed, and sit still in between).
  const Wc = Math.round(Math.min(Math.max(state.cfg.cardWidth, 240), VW - 2 * PAD));
  const stride = Wc + GAP;
  // whole columns that fit; in horizontal mode the next one peeks in at the right
  const cols = Math.max(1, Math.floor((VW - 2 * PAD + GAP) / stride));
  // Left edge of the board inside the strip. Vertical mode has a fixed set of
  // columns, so the space left over is split evenly on both sides.
  const ox = modeOf(state.cfg) === "v" ? Math.max(PAD, Math.floor((VW - (cols * stride - GAP)) / 2)) : PAD;
  return { pr, T, VW, stripH, Hc, cols, Wc, stride, ox };
}

// The page's theme colours (background, text, divider), re-read at most every
// couple of seconds: getComputedStyle every frame forces a style recalc, and
// the theme can change at runtime (Display settings: light / dim / lights out).
function pageTheme() {
  const now = performance.now();
  if (now - state.themeAt > 2000 && document.body) {
    state.themeAt = now;
    const cs = getComputedStyle(document.body);
    const stroke = state.theme.stroke;
    state.theme = { bg: cs.backgroundColor, fg: cs.color, stroke };
    // X's own divider colour for this theme. The feed column's border is
    // removed by the CSS, but its colour is still there to read.
    const pc = document.querySelector('[data-testid="primaryColumn"]');
    if (pc) state.theme.stroke = getComputedStyle(pc).borderLeftColor;
  }
  return state.theme;
}

function applyVars(g) {
  const theme = pageTheme();
  const vars = {
    "--xs-l": Math.round(g.pr.left) + "px",
    "--xs-t": g.T + "px",
    "--xs-w": g.VW + "px",
    "--xs-h": g.stripH + "px",
    "--xs-colw": g.Wc + "px",
    "--xs-colh": g.Hc + "px",
    "--xs-pad": PAD + "px",
    "--xs-gap": GAP + "px",
    "--xs-bg": theme.bg,
    "--xs-fg": theme.fg,
    "--xs-stroke": theme.stroke,
  };
  const key = JSON.stringify(vars);
  if (key === state.lastVars) return;
  state.lastVars = key;
  for (const k in vars) root.style.setProperty(k, vars[k]);
}

// ---- attach / detach ------------------------------------------------------

function attach(S, el) {
  const vp = S._viewport;
  const Rect = vp.getRect().constructor;
  const key = String(S.props.cacheKey);
  const saved = state.savedPos.get(key);
  const st = {
    x: 0,
    tx: 0,
    top: 0,
    height: 1,
    key,
    pending: saved ? saved.anchorId : null, // restore this post's column once it exists
    pendingOffset: saved ? saved.offset || 0 : 0, // vertical mode: how far below the top it sat
    pendingFrames: 0,
    pendingStride: 0,
    pendingStable: 0,
    snapAt: 0,
    dir: 1, // direction of the last scroll input, for snapping
    placed: false,
  };

  // "Scroll to top" means "back to the first column" here. X asks for it from
  // two places: the list's own viewport (the "." shortcut -> scrollToNewest)
  // and, for the "N new posts" pill, the shared window viewport.
  const goHome = () => {
    st.pending = null;
    st.snapAt = 0;
    st.tx = 0; // horizontal mode: the first column (eased by the frame loop)
    // Vertical mode: the top, as an instant jump like X's own scroll-to-top.
    // A long smooth scroll gets interrupted while posts mount along the way.
    el.scrollTo({ top: 0 });
  };
  const proxy = Object.create(vp);
  // X asks for this rect to decide which posts to keep mounted. The answer is
  // worked out once a frame, in list coordinates. But X also asks the moment
  // its list changes (more posts loaded, and with them a reshuffle), which is
  // before our next frame: answered with the old numbers, it would unmount the
  // posts on screen and mount others for a frame, a visible blank. So when the
  // list is not the one the numbers were worked out for, find the same posts in
  // the new list first.
  const rebase = (list) => {
    st.winList = list;
    const at = new Map();
    for (let k = 0; k < list.length; k++) at.set(list[k].id, k);
    const ks = [];
    for (const id of st.winIds) if (at.has(id)) ks.push(at.get(id));
    // the first that is still ahead of the one after it (not one X sent to the end)
    let a = -1;
    for (let i = 0; i < ks.length && a < 0; i++) if (i === ks.length - 1 || ks[i] < ks[i + 1]) a = ks[i];
    if (a < 0) return;
    const b = Math.min(list.length - 1, a + st.winIds.length - 1);
    let top = 0;
    let height = 0;
    for (let k = 0; k <= b; k++) {
      const h = S._getHeight(list[k]);
      if (k < a) top += h;
      else height += h;
    }
    st.top = top + 1;
    st.height = Math.max(1, height - 2);
  };
  proxy.getRect = () => {
    const list = S.props.list;
    if (st.winIds && st.winList !== list) rebase(list);
    return new Rect(el.getBoundingClientRect().top + st.top, st.height);
  };
  proxy.scrollBy = () => {}; // X re-bases offsets itself; our rect is always in list coordinates
  proxy.scrollTo = (_x, y) => {
    if (!y) goHome();
  };
  proxy.scrollToTop = goHome;
  proxy.scrollY = () => st.top;
  S._viewport = proxy;

  // The new-posts pill calls scrollToTop() on the shared window viewport,
  // which would scroll a page that no longer scrolls. Hook it once, for good;
  // it passes straight through whenever the layout isn't driving a list.
  if (!vp.__xsHooked) {
    vp.__xsHooked = true;
    const orig = vp.scrollToTop;
    vp.scrollToTop = function (...args) {
      if (state.current && state.current.vp === vp) state.current.goHome();
      return orig.apply(this, args);
    };
  }

  // Mount exactly what's on screen (plus prefetch columns), not 2.5x more.
  const savedRatios = {
    min: S.props.minimumOffscreenToViewportRatio,
    pref: S.props.preferredOffscreenToViewportRatio,
  };
  const dp = S.constructor.defaultProps;
  const savedDefaults = dp && {
    min: dp.minimumOffscreenToViewportRatio,
    pref: dp.preferredOffscreenToViewportRatio,
  };
  try {
    S.props.minimumOffscreenToViewportRatio = 0;
    S.props.preferredOffscreenToViewportRatio = 0;
  } catch {}
  if (dp) {
    dp.minimumOffscreenToViewportRatio = 0;
    dp.preferredOffscreenToViewportRatio = 0;
  }

  // Lift X's fixed widths on the wrappers above the list.
  for (let e = el.parentElement; e && e.tagName !== "MAIN"; e = e.parentElement) {
    e.setAttribute("data-xs-wide", "");
  }
  el.setAttribute("data-xs-strip", "");

  // Posts keep the place they first had (see order.js).
  const restoreProps = stableOrder().install(S);

  state.current = { S, el, vp, st, savedRatios, savedDefaults, restoreProps, last: "", hc: new Map(), hcW: 0, mode: modeOf(state.cfg), goHome };
  S._scheduleCriticalUpdate();
}

// Detach from the live list only. The page-level layout (and the pinned
// elements) stay as they are so a tab switch doesn't flash X's native layout.
function detach() {
  const c = state.current;
  if (!c) return;
  state.current = null;
  const { S, el, vp, savedRatios, savedDefaults } = c;
  S._viewport = vp;
  try {
    c.restoreProps();
  } catch {}
  try {
    S.props.minimumOffscreenToViewportRatio = savedRatios.min;
    S.props.preferredOffscreenToViewportRatio = savedRatios.pref;
  } catch {}
  const dp = S.constructor.defaultProps;
  if (dp && savedDefaults) {
    dp.minimumOffscreenToViewportRatio = savedDefaults.min;
    dp.preferredOffscreenToViewportRatio = savedDefaults.pref;
  }
  hideBar();
  el.scrollLeft = 0;
  el.scrollTop = 0;
  el.removeAttribute("data-xs-strip");
  el.removeAttribute("data-xs-ready");
  for (const child of el.children) child.style.translate = "";
  try {
    S._scheduleCriticalUpdate();
  } catch {}
}

function tryAdopt() {
  if (state.attaching || state.current) return;
  const S = findLiveScroller();
  if (!S) return;
  const el = S._rootRef.current;
  state.attaching = true;
  try {
    attach(S, el);
  } finally {
    state.attaching = false;
  }
}

// Undo every page-level change (route left home, extension disabled, error).
function teardownPage() {
  clearAllPinned();
  for (const el of document.querySelectorAll("[data-xs-wide]")) el.removeAttribute("data-xs-wide");
  root.removeAttribute("data-xs-on");
  root.removeAttribute("data-xs-mode");
}

// ---- per frame --------------------------------------------------------------

// The whole modification is on only for the home feed (and only if enabled),
// plus the moments when a dialog is open over a home feed that is still
// mounted underneath it. Called every frame, but also straight from
// history.pushState/popstate, so the layout flips before X renders the new
// route, not a frame after.
export function syncPage() {
  let want = readCfg().enabled !== false && isFeedRoute(location.pathname);
  const current = state.current;
  if (!want && state.cfg.enabled !== false && current && current.el.isConnected) {
    // Not the home URL. Still ours only if it's a dialog over the feed we're
    // driving; a real page change unmounts the feed, which ends this at once.
    want = OVERLAY_ROUTE.test(location.pathname) || !!document.querySelector('[role="dialog"]');
  }
  if (want) {
    if (!root.hasAttribute("data-xs-on")) root.setAttribute("data-xs-on", "");
    const mode = modeOf(state.cfg);
    if (root.getAttribute("data-xs-mode") !== mode) root.setAttribute("data-xs-mode", mode);
    // Switching layout: let go of the list and pick it up again in the new mode.
    if (state.current && state.current.mode !== mode) detach();
  } else {
    if (state.current) detach();
    if (root.hasAttribute("data-xs-on")) teardownPage();
  }
  return want;
}

function step() {
  if (!syncPage()) return;
  markPinned();

  // The board's geometry and the pinned cards don't depend on the list, so
  // they are handled first: while a new list is loading (tab switch) the
  // composer and trends cards stay in place instead of vanishing.
  const pc = document.querySelector('[data-testid="primaryColumn"]');
  if (!pc) {
    if (state.current) detach();
    return;
  }
  const g = geometry(pc);
  applyVars(g);

  if (state.current) {
    // The list went away, or another one is mounted now (tab switch).
    const live = findLiveScroller();
    if (!state.current.el.isConnected || (live && live !== state.current.S)) detach();
  }
  if (!state.current) {
    tryAdopt();
    if (!state.current) {
      const hh = pinnedHeights();
      placePinned(g, state.lastX, hh.hC, hh.hT);
      return;
    }
  }

  if (state.current.mode === "v") return stepVertical(g);
  return stepHorizontal(g);
}

function frame() {
  requestAnimationFrame(frame);
  if (state.gaveUp) return;
  try {
    const t0 = __DEV__ ? performance.now() : 0;
    step();
    state.errors = 0;
    if (__DEV__) {
      const dt = performance.now() - t0;
      const d = window.__xsDbg;
      if (d) {
        d.cost = dt;
        d.costMax = Math.max(d.costMax || 0, dt);
      }
    }
  } catch (e) {
    if (__DEV__) window.__xsErr = e && e.stack;
    detach();
    teardownPage();
    if (++state.errors >= 3) state.gaveUp = true;
  }
}

export function start() {
  for (const m of ["pushState", "replaceState"]) {
    const orig = history[m];
    history[m] = function (...args) {
      const r = orig.apply(this, args);
      syncPage();
      return r;
    };
  }
  addEventListener("popstate", syncPage);

  // Switch the layout on synchronously, right now, at document_start: before
  // anything has rendered, so the old design never gets a first paint.
  syncPage();
  requestAnimationFrame(frame);
}
