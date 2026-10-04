// A stable order for the posts on the board.
//
// X does not only append to its list. When more posts load, the server sends
// again any post it does not count as seen, and X moves those to their new
// place: usually the end. In X's own single column that is rare, because every
// post you scroll past is rendered and counted. On this board, a fast scroll
// passes whole columns without rendering them, and the posts you have just
// arrived at have not been counted yet either; so a moment after you stop, X
// takes the very posts you are looking at and sends them to the end of the
// list. The board re-packs, everything on screen is replaced, and you have lost
// your place.
//
// So the list X's scroller works from is put back into the order the posts
// first arrived in. A post keeps its place for as long as it exists; a post
// that is new to us goes in after the post it follows in X's list (or at the
// front, which is where "show N new posts" puts them). The scroller is handed
// that list instead of X's, so its own bookkeeping (which posts to render,
// where the end is) and our layout agree on one order.

export function stableOrder() {
  let key = null; // the timeline these ids belong to (a tab switch starts over)
  let ids = []; // our order
  let lastIn = null; // the last list X gave us...
  let lastOut = null; // ...and what we made of it

  function arrange(list, cacheKey) {
    if (list === lastIn || list === lastOut) return lastOut;
    if (cacheKey !== key) {
      key = cacheKey;
      ids = [];
    }
    const place = new Map(); // id -> its place in our order
    for (let k = 0; k < ids.length; k++) place.set(ids[k], k);
    const byId = new Map();
    const front = []; // new posts ahead of every post we know
    const after = new Map(); // known id -> the new posts that follow it
    // A new post goes after the furthest-along post of ours that precedes it in
    // X's list. Not simply "the post before it": that may be one X has just
    // moved to the end, whose place with us is back in the middle of the board,
    // and the new posts would be dropped in there, pushing aside what is on screen.
    let anchor = null;
    let furthest = -1;
    for (const item of list) {
      byId.set(item.id, item);
      const at = place.get(item.id);
      if (at !== undefined) {
        if (at > furthest) {
          furthest = at;
          anchor = item.id;
        }
      } else if (anchor === null) {
        front.push(item.id);
      } else {
        let a = after.get(anchor);
        if (!a) after.set(anchor, (a = []));
        a.push(item.id);
      }
    }
    const next = front;
    for (const id of ids) {
      if (!byId.has(id)) continue; // X dropped it
      next.push(id);
      const a = after.get(id);
      if (a) for (const n of a) next.push(n);
    }
    ids = next;

    // Usually X's order is already ours: hand its own array back untouched.
    let same = next.length === list.length;
    for (let k = 0; same && k < next.length; k++) if (list[k].id !== next[k]) same = false;
    lastIn = list;
    lastOut = same ? list : next.map((id) => byId.get(id));
    return lastOut;
  }

  // React gives the scroller a new props object whenever its parent renders.
  // Take over the `props` slot on the instance so every one of them gets its
  // list arranged before the scroller reads it. (The same object is what React
  // later passes back as prevProps, so the scroller's own "did the list
  // change?" check compares like with like.)
  function install(S) {
    let props = S.props;
    const fix = (p) => {
      try {
        if (p && Array.isArray(p.list)) {
          const list = arrange(p.list, p.cacheKey);
          if (list !== p.list) p.list = list;
        }
      } catch {}
      return p;
    };
    fix(props);
    Object.defineProperty(S, "props", {
      configurable: true,
      enumerable: true,
      get: () => props,
      set: (v) => {
        props = fix(v);
      },
    });
    return () => Object.defineProperty(S, "props", { configurable: true, enumerable: true, writable: true, value: props });
  }

  return { install };
}
