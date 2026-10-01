// Entry point of the page-world script (manifest "world": "MAIN"), so it can
// reach X's virtualized timeline list, which X exposes as `window.scroller`.
// See engine.js for how the layout works.

import { start } from "./engine.js";
import { installInput } from "./input.js";
import { watchPinned } from "./pinned.js";
import { installScrollerHook } from "./scroller.js";

if (!window.__xsEngine) {
  window.__xsEngine = true;
  installScrollerHook();
  watchPinned();
  installInput();
  start();
}
