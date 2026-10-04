// Isolated-world half of the extension: bridges chrome.storage settings to the
// MAIN-world engine (page).
//
// chrome.storage is async, so the settings are also mirrored into localStorage
// (shared with the page, same origin). The page script reads that copy
// synchronously at document_start and can turn the layout on before the first
// paint.

const root = document.documentElement;
const DEFAULTS = { enabled: true, cardWidth: 520, blockAds: true, scrollMode: "horizontal" };

function publish(s) {
  root.dataset.xsCfg = JSON.stringify(s);
  try {
    localStorage.setItem("xsCfg", JSON.stringify(s));
  } catch {}
}

let initial = DEFAULTS;
try {
  initial = { ...DEFAULTS, ...JSON.parse(localStorage.getItem("xsCfg") || "{}") };
} catch {}
publish(initial);

const load = () =>
  chrome.storage.sync.get(DEFAULTS, (s) => publish({ ...DEFAULTS, ...s }));
load();
// Settings live in storage.sync, which only allows a couple of writes a second:
// too few for a slider being dragged. While it moves, the popup also writes the
// current values to storage.local ("xsLive"), which has no such limit; whichever
// changed last is what the page gets.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.xsLive && changes.xsLive.newValue) publish({ ...DEFAULTS, ...changes.xsLive.newValue });
  } else if (area === "sync") load();
});
