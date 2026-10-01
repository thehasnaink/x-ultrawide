// Everything the engine shares between modules. One mutable object instead of
// a dozen module-level `let`s, because ES modules can't reassign each other's
// bindings.
export const state = {
  // settings (see config.js)
  cfg: null,
  cfgRaw: "",

  // the list instance we are driving, and how we found it (see scroller.js)
  current: null, // engine attached to the live list, if any
  latest: null, // most recent window.scroller assignment
  attaching: false,
  // Every list instance X has assigned to window.scroller, newest last. The
  // most recent assignment is NOT reliably the live list: React can construct
  // instances that never mount (or construct one after the live one), so after
  // e.g. closing a photo viewer window.scroller may point at a dead instance
  // while the real list sits in the page. Adopt whichever one is mounted.
  candidates: [],

  // Elements outside the list that are part of the layout. They outlive list
  // swaps (tab switches), so they are tracked here and not per engine.
  pinned: {},
  pinnedAt: 0,
  pinnedDirty: true,

  // cacheKey -> { anchorId, offset }: where each timeline was, so coming back
  // from a post (or another tab) restores the view.
  savedPos: new Map(),

  lastX: 0, // last horizontal offset, so pinned cards hold their place between lists
  lastVars: "",

  // If step() keeps throwing, fall back to X's own layout for good (until the
  // page is reloaded) instead of tearing down and rebuilding every frame.
  errors: 0,
  gaveUp: false,

  // the page's theme colours, re-read now and then (see engine.js)
  themeAt: -1e9,
  theme: { bg: "rgb(0, 0, 0)", fg: "rgb(231, 233, 234)", stroke: "rgb(47, 51, 54)" },

  // the horizontal scrollbar (see scrollbar.js)
  bar: null,
  thumb: null,
  drag: null,

  // post id -> true/false, once its text has rendered (see ads.js)
  adByLabel: new Map(),
};
