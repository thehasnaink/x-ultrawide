// The elements outside the list that are part of the layout (see PINNED in
// constants.js): finding them, tagging them for the CSS, and placing the two
// that become cards in column 0.
//
// X re-renders these, so they are (re)discovered whenever the DOM changes and
// tagged with data-xs-*.

import { GAP, PAD, PINNED } from "./constants.js";
import { blocking } from "./config.js";
import { state } from "./state.js";
import { root } from "./util.js";

// X re-creates some of these on tab switches. Re-tag on the very next frame
// after any DOM change (not on a timer), or the new element paints untagged
// in X's native layout for a moment.
export function watchPinned() {
  new MutationObserver(() => {
    state.pinnedDirty = true;
  }).observe(root, { childList: true, subtree: true });
}

function findPinned() {
  const pc = document.querySelector('[data-testid="primaryColumn"]');
  const found = {};
  if (!pc) return found;
  const tl = pc.querySelector('[role="tablist"]');
  for (let e = tl; e && e !== pc; e = e.parentElement) {
    if (getComputedStyle(e).position === "sticky") {
      found.topbar = e;
      break;
    }
  }
  // The tab bar's row is the ancestor that carries the bottom stroke; the
  // child of it that holds the tablist is the tabs container.
  for (let e = tl, child = null; e && e !== pc; child = e, e = e.parentElement) {
    if (child && parseFloat(getComputedStyle(e).borderBottomWidth) > 0) {
      found.tabs = child;
      break;
    }
  }
  // The composer block is a sibling of the sticky tab bar: the first tall
  // child after it, before the list. Found by position, not by content: on a
  // fresh load X first renders it as a skeleton with no textarea or button
  // (for over a second), which a content-based lookup would miss, leaving
  // X's native composer visible.
  const wrap = found.topbar && found.topbar.parentElement;
  if (wrap) {
    let after = false;
    for (const k of wrap.children) {
      if (k === found.topbar) {
        after = true;
        continue;
      }
      if (!after) continue;
      if (k.querySelector('section[role="region"]')) break; // reached the list
      if (k.offsetHeight >= 40) {
        found.composer = k;
        break;
      }
    }
  }
  const side = document.querySelector('[data-testid="sidebarColumn"]');
  if (side) {
    found.search = side.querySelector('form[role="search"]');
    const trend = side.querySelector('[data-testid="trend"]');
    found.trends = trend && trend.closest("section");
  }
  return found;
}

export function markPinned() {
  const now = performance.now();
  if (!state.pinnedDirty && now - state.pinnedAt < 500) return;
  state.pinnedDirty = false;
  state.pinnedAt = now;
  const found = findPinned();
  const pinned = state.pinned;
  for (const name of PINNED) {
    const next = found[name] || null;
    const prev = pinned[name];
    if (prev === next) continue;
    if (prev) clearPinned(prev, name);
    if (next) next.setAttribute("data-xs-" + name, "");
    pinned[name] = next;
  }
  // The trends card carries a "Promoted by ..." entry too: same kind of ad.
  // Decided from the text nodes themselves, not innerText: innerText depends on
  // layout, and once the item is hidden it loses its line breaks ("...nowPromoted
  // by..."), which made the check flip on every pass and the card flicker.
  if (pinned.trends) {
    for (const item of pinned.trends.querySelectorAll('[data-testid="trend"]')) {
      const promo = blocking() && isPromotedTrend(item);
      if (promo !== item.hasAttribute("data-xs-ad")) item.toggleAttribute("data-xs-ad", promo);
    }
  }
}

function isPromotedTrend(item) {
  for (const span of item.querySelectorAll("span")) {
    if (span.childElementCount === 0 && /^Promoted\b/.test(span.textContent.trim())) return true;
  }
  return false;
}

function clearPinned(el, name) {
  el.removeAttribute("data-xs-" + name);
  el.removeAttribute("data-xs-placed");
  el.__xsT = "";
  el.style.removeProperty("--xs-off");
  el.style.transform = "";
  el.style.clipPath = "";
}

export function clearAllPinned() {
  for (const name of PINNED) {
    if (state.pinned[name]) clearPinned(state.pinned[name], name);
    state.pinned[name] = null;
  }
}

export function pinnedHeights() {
  const live = (n) => (n && n.isConnected ? n.offsetHeight : 0);
  return { hC: live(state.pinned.composer), hT: live(state.pinned.trends) };
}

// Horizontal mode: pin the composer and trends cards to the top of column 0;
// they scroll sideways with it and are clipped at the strip's left edge.
export function placePinned(g, x, hC, hT) {
  const { composer, trends } = state.pinned;
  clipSidebar(g);
  let py = 0;
  for (const [node, hh] of [[composer, hC], [trends, hT]]) {
    if (!node || !hh) continue;
    const left = Math.round(g.pr.left + PAD - x);
    node.__xsT = ""; // (vertical mode caches its transform; this mode sets it every frame)
    node.style.transform = `translate(${left}px, ${g.T + PAD + py}px)`;
    const clipL = Math.max(0, Math.round(g.pr.left - left));
    node.style.clipPath = clipL > 0 ? `inset(0 0 0 ${clipL}px)` : "";
    node.setAttribute("data-xs-placed", "");
    py += hh + GAP;
  }
}

// The trends card and the search box both live in X's right sidebar, which this
// layout lifts above the feed (z-index, see layout.css) so they can sit on top
// of it. That also puts the trends card above the tab bar, which belongs to the
// feed column: scrolled up, the card slid over the bar instead of under it. No
// z-index can fix that (it would need to be above the feed and below the bar,
// and those two are in the same layer), so the sidebar itself is clipped to
// the two places its contents are allowed: the board below the tab bar, and
// the search box's slot in the bar. The shape is fixed, so there is nothing to
// keep in step with scrolling.
function clipSidebar(g) {
  const side = state.pinned.trends && state.pinned.trends.closest('[data-testid="sidebarColumn"]');
  if (!side) return;
  const s = side.getBoundingClientRect();
  const search = state.pinned.search && state.pinned.search.isConnected ? state.pinned.search.getBoundingClientRect() : null;
  // in the sidebar's own coordinates
  const L = Math.round(g.pr.left - s.left);
  const R = Math.round(window.innerWidth - s.left);
  const T = Math.round(g.T - s.top);
  const B = Math.round(window.innerHeight - s.top);
  const top = Math.round(-s.top);
  const sx = search ? Math.round(search.left - 8 - s.left) : R;
  const v = `polygon(${L}px ${T}px, ${sx}px ${T}px, ${sx}px ${top}px, ${R}px ${top}px, ${R}px ${B}px, ${L}px ${B}px)`;
  if (v !== state.sideClip) {
    state.sideClip = v;
    root.style.setProperty("--xs-side-clip", v);
  }
}

// Can the browser tie an animation to another element's scroll position?
// (Chrome 116+: scroll-driven animations with a named timeline.)
const SCROLL_LINKED =
  typeof CSS !== "undefined" && CSS.supports("animation-timeline: scroll()") && CSS.supports("timeline-scope: --x");

// Vertical mode: the cards in column 0 scroll away with the content, and are
// clipped at the top edge of the strip.
//
// The strip scrolls natively, which the browser does on its compositor thread,
// ahead of any script. Moving these two cards from script each frame therefore
// trailed the posts beside them by a frame: they visibly lagged. Where the
// browser supports it, they are instead tied to the strip's scroll position in
// CSS (see pinned.css), so the browser moves them in the same step as the
// posts. Script then only sets where each card rests when the strip is at the
// top (`range` is how far the strip can scroll).
export function placePinnedV(g, y, hC, hT, range) {
  const { composer, trends } = state.pinned;
  clipSidebar(g);
  let py = 0;
  for (const [node, hh] of [[composer, hC], [trends, hT]]) {
    if (!node || !hh) continue;
    const rest = g.T + PAD + py; // its top with the strip scrolled to the top
    if (SCROLL_LINKED) {
      const v = `translate(${Math.round(g.pr.left + g.ox)}px, ${Math.round(rest)}px)`;
      if (node.__xsT !== v) {
        node.__xsT = v;
        node.style.transform = v;
        node.style.clipPath = "";
        node.style.setProperty("--xs-off", PAD + py + "px"); // how far below the strip's top edge it rests
      }
    } else {
      const topPx = rest - y;
      node.__xsT = "";
      node.style.transform = `translate(${Math.round(g.pr.left + g.ox)}px, ${Math.round(topPx)}px)`;
      const clipT = Math.max(0, Math.round(g.T - topPx));
      node.style.clipPath = clipT > 0 ? `inset(${Math.min(clipT, hh)}px 0 0 0)` : "";
    }
    node.setAttribute("data-xs-placed", "");
    py += hh + GAP;
  }
  if (SCROLL_LINKED && range !== state.vRange) {
    state.vRange = range;
    root.style.setProperty("--xs-range", range + "px");
  }
}
