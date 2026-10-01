export const root = document.documentElement;

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Only the home timeline for now: profiles, threads, search etc. have their
// own headers/structure and keep X's normal single column.
export const isFeedRoute = (p) => p.replace(/\/+$/, "") === "/home";

// A mounted cell's top in X's list coordinates: X positions cells with an inline
// translateY (or `top`, when its top-positioning switch is on).
export function parseT(el) {
  const s = el.style;
  if (s.top && s.top.endsWith("px")) return parseFloat(s.top) || 0;
  const m = /translateY\((-?[\d.]+)px\)/.exec(s.transform);
  return m ? parseFloat(m[1]) : null;
}
