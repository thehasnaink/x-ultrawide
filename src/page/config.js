import { root } from "./util.js";
import { state } from "./state.js";

// scrollMode: "horizontal" packs posts into screen-high columns that scroll
// sideways; "vertical" is a classic masonry that scrolls up and down.
export const DEFAULTS = { enabled: true, cardWidth: 520, blockAds: true, scrollMode: "horizontal" };

export const modeOf = (c) => (c.scrollMode === "vertical" ? "v" : "h");

// content.js mirrors the settings into localStorage, so they are known right
// here, before chrome.storage has answered (it is async).
function cachedCfg() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("xsCfg") || "{}") };
  } catch {
    return DEFAULTS;
  }
}

state.cfg = cachedCfg();

export function readCfg() {
  const raw = root.dataset.xsCfg || "";
  if (raw && raw !== state.cfgRaw) {
    state.cfgRaw = raw;
    try {
      state.cfg = { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      state.cfg = cachedCfg();
    }
  }
  return state.cfg;
}

// "Block ads" is a setting (popup); off means every post is shown as X sends it.
export const blocking = () => state.cfg.blockAds !== false;
