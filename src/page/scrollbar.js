// Horizontal mode's scrollbar.
//
// The page itself no longer scrolls (the board is fixed and we move cards
// ourselves), so there is no native scrollbar to show where you are. This is a
// thin one along the bottom: drag the thumb, or click the track to page. It
// lives on <body>, outside X's React tree.

import { PAD, SNAP_DELAY } from "./constants.js";
import { state } from "./state.js";
import { clamp } from "./util.js";

function ensureBar() {
  if (state.bar && state.bar.isConnected) return;
  if (!document.body) return;
  const bar = document.createElement("div");
  bar.id = "xs-hbar";
  const thumb = document.createElement("div");
  thumb.className = "xs-hthumb";
  bar.appendChild(thumb);
  document.body.appendChild(bar);
  state.bar = bar;
  state.thumb = thumb;

  bar.addEventListener("pointerdown", (e) => {
    const current = state.current;
    if (!current) return;
    const st = current.st;
    st.pending = null;
    const track = bar.getBoundingClientRect();
    const th = thumb.getBoundingClientRect();
    if (e.target === thumb) {
      state.drag = {
        startX: e.clientX,
        startTx: st.tx,
        ratio: current.maxX / Math.max(1, track.width - th.width),
      };
      bar.setPointerCapture(e.pointerId);
      bar.classList.add("xs-drag");
    } else {
      // Click on the track: page toward the click, one screenful.
      const dir = e.clientX < th.left ? -1 : 1;
      st.dir = dir;
      st.tx = clamp(st.tx + dir * current.cols * current.stride, 0, current.maxX);
      st.snapAt = performance.now() + SNAP_DELAY;
    }
    e.preventDefault();
  });
  bar.addEventListener("pointermove", (e) => {
    const drag = state.drag;
    const current = state.current;
    if (!drag || !current) return;
    const st = current.st;
    st.tx = clamp(drag.startTx + (e.clientX - drag.startX) * drag.ratio, 0, current.maxX);
    st.x = st.tx; // follow the pointer exactly while dragging
    st.dir = Math.sign(e.movementX) || st.dir;
  });
  const end = () => {
    if (!state.drag) return;
    state.drag = null;
    bar.classList.remove("xs-drag");
    if (state.current) state.current.st.snapAt = performance.now() + 60; // settle on a column
  };
  bar.addEventListener("pointerup", end);
  bar.addEventListener("pointercancel", end);
}

export function updateBar(g, st, maxX) {
  ensureBar();
  const { bar, thumb } = state;
  if (!bar) return;
  const show = maxX > 1;
  bar.classList.toggle("xs-show", show);
  if (!show) return;
  const trackW = g.VW - 2 * PAD;
  const thumbW = clamp((trackW * trackW) / (maxX + trackW), 48, trackW);
  thumb.style.width = thumbW + "px";
  thumb.style.transform = `translateX(${(trackW - thumbW) * (st.x / maxX)}px)`;
}

export function hideBar() {
  if (state.bar) state.bar.classList.remove("xs-show");
  state.drag = null;
}
