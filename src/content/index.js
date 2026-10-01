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
chrome.storage.onChanged.addListener(load);
