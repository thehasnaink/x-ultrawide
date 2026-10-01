// How we get hold of X's virtualized timeline list. X's code does
// `window.scroller = this` in its constructor, so we put a setter there and
// remember every instance it is given.

import { state } from "./state.js";

export function installScrollerHook() {
  Object.defineProperty(window, "scroller", {
    configurable: true,
    get: () => state.latest,
    set(v) {
      state.latest = v;
      if (v && !state.candidates.includes(v)) {
        state.candidates.push(v);
        if (state.candidates.length > 12) state.candidates.shift();
      }
    },
  });
}

// The newest known list instance that is actually mounted in the feed column.
export function findLiveScroller() {
  const candidates = state.candidates;
  for (let i = candidates.length - 1; i >= 0; i--) {
    const S = candidates[i];
    const el = S && S._rootRef && S._rootRef.current;
    if (!el || !el.isConnected) continue;
    if (!el.closest('[data-testid="primaryColumn"]')) continue;
    if (!S._viewport || !S.props || !S.props.list) continue;
    return S;
  }
  return null;
}
