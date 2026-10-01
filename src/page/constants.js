export const GAP = 16; // between cards
export const PAD = 12; // around the whole board
export const PREFETCH_COLS = 1; // extra columns mounted on each side of the screen
export const MAX_EXTRA_GAP = 28; // justify leftover column space, up to this per gap
export const LOOKAHEAD = 6; // how many following posts may fill a column's gap
export const SNAP_DELAY = 150; // ms after the last wheel tick before settling on a column
export const SNAP_TOL = 0.08; // within this fraction of a column of one, settle there rather than hop

// Ads are dropped from the board. X ships promoted posts under ids like
// "promoted-tweet-<id>-<hash>", and some of them (big brands: NFL, MLB, ...)
// carry no visible "Ad" label at all, so the id is the reliable marker. As a
// backstop, a post whose first lines are a bare Ad / Promoted / Boosted label
// is treated the same (covers boosted posts delivered under a normal id).
export const AD_ID = /^promoted/i;
export const AD_LABEL = /^(Ad|Promoted|Boosted)$/;

// Routes X opens as a dialog on top of whatever page is underneath: compose
// (Post / reply / quote), flows, and the photo/video viewer. The URL changes
// but the page behind stays mounted.
export const OVERLAY_ROUTE = /^\/(compose\/|i\/|[^/]+\/status\/\d+\/(photo|video)\/\d+)/;

// Elements outside the list that are part of the layout:
//  composer - the "What's happening?" box; first card of column 0.
//  trends   - the trending card from the right sidebar; second card of col 0.
//  search   - the sidebar search form, lifted into the top bar.
//  tabs     - the container holding the For you / Following tabs, a fixed 600px.
export const PINNED = ["composer", "trends", "search", "tabs"];

// Where wheel input is ours: the board, the pinned cards, and the scrollbar.
export const ON_BOARD = "[data-xs-strip],[data-xs-composer],[data-xs-trends],#xs-hbar";
