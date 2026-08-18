// Hex 2^ - shared core.
//
// Owns everything the two modes agree on: the cube-coordinate board, the
// slide/merge rules, canvas layout, storage, undo, the overlay, and swipe
// input. A mode file (hex2-base.js / hex2-jiggly.js) supplies its own drawTile
// and move driver, then calls Hex2.boot().
//
// Only one mode is ever loaded per page load - hex2.html reads the stored mode
// and injects the matching script - so a mode may hold its own animation state
// freely without worrying about the other one.

window.Hex2 = (function () {
  "use strict";

  // ---------------------------- constants -----------------------------
  const R = 2;               // board radius -> side 3 -> 19 cells
  const WIN_EXP = 14;        // 2^14 = 16384
  const MAX_HUE = 300;       // red(0) -> magenta(300), never wraps to red
  const SQRT3 = Math.sqrt(3);
  const BEST_KEY = "hex2.best";
  const MODE_KEY = "hex2.mode";
  const BREAK_KEY = "hex2.break.start";
  const UNDO_DEPTH = 6;
  const START_HEARTS = 3;
  const MAX_HEARTS = 5;
  const HEART_TILE = 2048;
  const CHALLENGE_EDGE = "#ff0000";
  const OUTLINE_R = 0.1;     // gap off the board, as a share of a cell
  const OUTLINE_W = 0.1;    // stroke width, also as a share of a cell
  const BREAK_MS = 30 * 1000;
  const FAKE_AD_MIN_MS = 30 * 1000;
  const FAKE_AD_MAX_MS = 120 * 1000;
  const SWIPE_MIN = 22;      // px of travel before a drag counts as a swipe
  const PADS_KEY = "hex2.pads";
  const PAD_H = 60;          // slide-pad thickness, all of it grown outward
  const PAD_GAP = 6;         // board edge to a pad's inner edge
  const PAD_EDGE = 6;        // pad ring's outer edge to the stage edge
  const BARE_GAP = 24;       // board edge to stage edge with the pads hidden
  const BOARD_HALF_HEIGHT = SQRT3 * (R + 0.5);
  const PAD_LEN_UNITS = 3 * SQRT3;

  // both modes draw a tile the same way; only the transform around it differs
  const TILE = {
    radiusFrac: 0.9,
    strokeFrac: 0.03,
    strokeColour: "rgba(0,0,0,0.18)",
    textNudgeFrac: 0.04,
  };

  // ------------------- storage (no-op if blocked) ---------------------
  const store = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch (e) {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch (e) {
        // private mode or a full quota; the game just stops persisting
      }
    },
  };

  // Temporary. Copies each old key to its new name when the new one is empty,
  // and deletes nothing. Remove once the rename is confirmed live.
  (function migrateHexadecimalKeys() {
    const pairs = [
      ["hexadecimal.save.v1", "hex2.base.save"],
      ["hexadecimal.jiggly.save.v1", "hex2.jiggly.save"],
      ["hexadecimal.best.v1", BEST_KEY],
    ];
    for (const [from, to] of pairs) {
      if (store.get(to)) {
        continue;
      }
      const raw = store.get(from);
      if (raw) {
        store.set(to, raw);
      }
    }
  })();

  // ------------- board cells (cube coords, x + y + z = 0) --------------
  const cells = [];
  const cellIndex = new Map();
  for (let x = -R; x <= R; x++) {
    const yLo = Math.max(-R, -x - R);
    const yHi = Math.min(R, -x + R);
    for (let y = yLo; y <= yHi; y++) {
      const z = -x - y;
      const key = x + "," + y + "," + z;
      cellIndex.set(key, cells.length);
      cells.push({ x, y, z, key });
    }
  }

  // unit pixel position for a flat-top hex at size 1
  function unitPos(c) {
    return { px: 1.5 * c.x, py: SQRT3 * (c.z + c.x / 2) };
  }

  // ------------------------ the six directions ------------------------
  // group:   cells sharing this cube coordinate form one line
  // sortKey: orders a line so the destination end comes first
  const DIRS = {
    up: { group: "x", sortKey: "y", desc: true },
    down: { group: "x", sortKey: "y", desc: false },
    ur: { group: "y", sortKey: "x", desc: true },    // "/" upper-right
    dl: { group: "y", sortKey: "x", desc: false },   // "/" lower-left
    ul: { group: "z", sortKey: "x", desc: false },   // "\" upper-left
    dr: { group: "z", sortKey: "x", desc: true },    // "\" lower-right
  };

  // precompute each direction's lines as arrays of cell keys, front first
  const LINES = {};
  for (const dir in DIRS) {
    const cfg = DIRS[dir];
    const groups = new Map();
    for (const c of cells) {
      const g = c[cfg.group];
      if (!groups.has(g)) {
        groups.set(g, []);
      }
      groups.get(g).push(c);
    }
    const lines = [];
    for (const arr of groups.values()) {
      arr.sort(function (a, b) {
        if (cfg.desc) {
          return b[cfg.sortKey] - a[cfg.sortKey];
        }
        return a[cfg.sortKey] - b[cfg.sortKey];
      });
      lines.push(arr.map(function (c) {
        return c.key;
      }));
    }
    LINES[dir] = lines;
  }

  // ----------------------------- state --------------------------------
  let board = new Map();     // Map<cellKey, { value, id }>
  let score = 0;
  let best = parseInt(store.get(BEST_KEY) || "0", 10) || 0;
  let idCounter = 1;
  let over = false;
  let announcedWin = false;
  let history = [];          // undo snapshots, capped at UNDO_DEPTH
  let mode = null;           // the config object handed to boot()
  let saveKey = "";
  // challenge only, and outside the snapshot so undo cannot refund its cost
  let hearts = START_HEARTS;
  // switching modes reloads the page, so this is fixed for the session
  let isChallenge = false;

  // sfc32, seeded from real OS entropy. Math.random() would do the job except
  // that its state is hidden, so undo cannot rewind it and it would've enabled
  // savescumming.
  let rng = [0, 0, 0, 0];

  function seedRng() {
    const words = new Uint32Array(4);
    crypto.getRandomValues(words);
    rng = [words[0], words[1], words[2], words[3]];
  }

  function nextRandom() {
    let a = rng[0] >>> 0;
    let b = rng[1] >>> 0;
    let c = rng[2] >>> 0;
    let d = rng[3] >>> 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    rng = [a, b, c, d];
    return (t >>> 0) / 4294967296;
  }

  seedRng();

  function newId() {
    const id = idCounter;
    idCounter++;
    return id;
  }

  function emptyCells() {
    return cells.filter(function (c) {
      return !board.has(c.key);
    });
  }

  function spawn() {
    const empties = emptyCells();
    if (!empties.length) {
      return null;
    }
    const c = empties[(nextRandom() * empties.length) | 0];
    let value = 2;
    if (nextRandom() >= 0.9) {
      value = 4;
    }
    board.set(c.key, { value: value, id: newId() });
    return c.key;
  }

  // ---------------------------- the rules -----------------------------
  // Collapse every line for `dir`. The result carries enough detail for a mode
  // to animate it: which tile travelled from where to where, and which
  // destination cells were merges.
  function applyMove(dir) {
    const next = new Map();
    const movers = [];         // { id, value, fromKey, toKey }
    const mergedDests = [];
    let moved = false;
    let gained = 0;

    for (const line of LINES[dir]) {
      // walk front first, pairing equal neighbours at most once each
      const groups = [];
      let pending = null;
      for (const key of line) {
        const t = board.get(key);
        if (!t) {
          continue;
        }
        if (pending && !pending.merged && pending.value === t.value) {
          pending.value *= 2;
          pending.merged = true;
          pending.sources.push({ key: key, id: t.id, value: t.value });
          groups.push(pending);
          pending = null;
          continue;
        }
        if (pending) {
          groups.push(pending);
        }
        pending = {
          value: t.value,
          merged: false,
          sources: [{ key: key, id: t.id, value: t.value }],
        };
      }
      if (pending) {
        groups.push(pending);
      }

      // pack the groups against the front of the line
      for (let j = 0; j < groups.length; j++) {
        const g = groups[j];
        const destKey = line[j];
        next.set(destKey, { value: g.value, id: g.sources[0].id });
        for (const s of g.sources) {
          if (s.key !== destKey) {
            moved = true;
          }
          movers.push({
            id: s.id,
            value: s.value,
            fromKey: s.key,
            toKey: destKey,
          });
        }
        if (g.merged) {
          gained += g.value;
          mergedDests.push(destKey);
        }
      }
    }

    return {
      moved: moved,
      movers: movers,
      mergedDests: mergedDests,
      next: next,
      gained: gained,
    };
  }

  function anyMovePossible() {
    if (emptyCells().length) {
      return true;
    }
    // three axes cover all six directions as far as merging goes
    for (const dir of ["up", "ur", "ul"]) {
      if (applyMove(dir).moved) {
        return true;
      }
    }
    return false;
  }

  // Adopt an applyMove result. Spawning and saving deliberately stay with the
  // mode: base spawns once its slide has finished, jiggly spawns immediately so
  // an interrupting swipe cannot lose the new tile.
  function commit(res) {
    snapshot();
    board = res.next;
    score += res.gained;
    if (score > best) {
      best = score;
      store.set(BEST_KEY, String(best));
    }
    if (isChallenge) {
      for (const key of res.mergedDests) {
        const t = board.get(key);
        if (t && t.value === HEART_TILE) {
          grantHeart();
        }
      }
    }
    updateScores();
  }

  // --------------------------- canvas layout --------------------------
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  let dpr = 1;
  let layout = null;

  function computeLayout() {
    const stage = canvas.parentElement.getBoundingClientRect();
    const cssW = Math.max(160, stage.width);
    const cssH = Math.max(160, stage.height);
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    // unit-space bounds, counting each hex's own extent:
    // half-width 1, half-height sqrt3 / 2
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const c of cells) {
      const p = unitPos(c);
      minX = Math.min(minX, p.px - 1);
      maxX = Math.max(maxX, p.px + 1);
      minY = Math.min(minY, p.py - SQRT3 / 2);
      maxY = Math.max(maxY, p.py + SQRT3 / 2);
    }

    // With the pads hidden there is no ring to clear, so the board takes that
    // space back and keeps only a small breathing gap.
    let pad = BARE_GAP;
    if (!canvas.parentElement.classList.contains("pads-off")) {
      pad = PAD_GAP + PAD_H + PAD_EDGE;
    }
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const size = Math.min(
      (cssW - 2 * pad) / spanX,
      (cssH - 2 * pad) / spanY
    );
    const offX = (cssW - size * spanX) / 2 - size * minX;
    const offY = (cssH - size * spanY) / 2 - size * minY;

    const pos = new Map();
    for (const c of cells) {
      const p = unitPos(c);
      pos.set(c.key, {
        x: offX + size * p.px,
        y: offY + size * p.py,
      });
    }
    layout = { size: size, pos: pos, cssW: cssW, cssH: cssH };
    outlineRing = null;

    // The pad ring rides the board's own radius so a resize moves both.
    // --pad-inner is the ring's INNER edge, so thickening a pad only ever
    // pushes it further out.
    const host = canvas.parentElement;
    const inner = Math.round(size * BOARD_HALF_HEIGHT + PAD_GAP);
    const len = Math.round(size * PAD_LEN_UNITS);
    host.style.setProperty("--pad-inner", inner + "px");
    host.style.setProperty("--pad-h", PAD_H + "px");
    host.style.setProperty("--pad-len", len + "px");
  }

  function posOf(key) {
    return layout.pos.get(key);
  }

  // ----------------------------- painting -----------------------------
  function hexPath(cx, cy, size) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i);   // 0deg = flat-top
      const x = cx + size * Math.cos(a);
      const y = cy + size * Math.sin(a);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
  }

  function tileHue(value) {
    const e = Math.log2(value);            // 1 .. WIN_EXP, and beyond
    const f = Math.min(1, Math.max(0, (e - 1) / (WIN_EXP - 1)));
    return f * MAX_HUE;
  }

  function hslToRgb(h, s, l) {
    const hh = h / 360;
    const a = s * Math.min(l, 1 - l);
    function channel(n) {
      const k = (n + hh * 12) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    }
    return [channel(0), channel(8), channel(4)];
  }

  // Pick the number's colour off the fill's relative luminance so the digits
  // stay legible right across the hue sweep.
  function tileColours(value) {
    const hue = tileHue(value);
    const fill = "hsl(" + hue.toFixed(1) + ", 66%, 52%)";
    const rgb = hslToRgb(hue, 0.66, 0.52);
    const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    let text = "#ffffff";
    if (lum > 0.6) {
      text = "#171a1f";
    }
    return { fill: fill, text: text };
  }

  // shrink the number as its digit count grows
  function tileFontSize(value, size) {
    const len = String(value).length;
    if (len >= 5) {
      return size * 0.40;
    }
    if (len === 4) {
      return size * 0.48;
    }
    if (len === 3) {
      return size * 0.56;
    }
    return size * 0.64;
  }

  function drawEmpty(cx, cy, size) {
    hexPath(cx, cy, size * 0.9);
    ctx.fillStyle = "#1c2029";
    ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.02);
    ctx.strokeStyle = "#262b36";
    ctx.stroke();
  }

  // beginFrame / endFrame bracket one paint. The canvas is sized in device
  // pixels, so every frame re-establishes the CSS-unit transform.
  function beginFrame() {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, layout.cssW, layout.cssH);
  }

  function endFrame() {
    ctx.restore();
  }

  // neighbour across edge i, which runs from vertex 60i to vertex 60(i+1)
  const EDGE_NEIGHBOURS = [
    [1, -1, 0], [0, -1, 1], [-1, 0, 1],
    [-1, 1, 0], [0, 1, -1], [1, 0, -1],
  ];

  // The board's boundary as one closed ring of points, walked by chaining
  // each unbacked cell edge onto the next. Cached: it only moves on resize.
  let outlineRing = null;

  function buildOutlineRing() {
    const step = [];               // vertex key -> the vertex it leads to
    const at = new Map();
    function key(p) {
      return Math.round(p.x * 100) + "," + Math.round(p.y * 100);
    }
    for (const c of cells) {
      const p = layout.pos.get(c.key);
      for (let i = 0; i < 6; i++) {
        const n = EDGE_NEIGHBOURS[i];
        const nk = (c.x + n[0]) + "," + (c.y + n[1]) + "," + (c.z + n[2]);
        if (cellIndex.has(nk)) {
          continue;
        }
        const a1 = Math.PI / 180 * (60 * i);
        const a2 = Math.PI / 180 * (60 * (i + 1));
        const v1 = {
          x: p.x + layout.size * Math.cos(a1),
          y: p.y + layout.size * Math.sin(a1),
        };
        const v2 = {
          x: p.x + layout.size * Math.cos(a2),
          y: p.y + layout.size * Math.sin(a2),
        };
        at.set(key(v1), v1);
        step[key(v1)] = key(v2);
      }
    }
    const first = Object.keys(step)[0];
    const ring = [];
    let k = first;
    do {
      ring.push(at.get(k));
      k = step[k];
    } while (k !== first && ring.length < 64);
    // edgeNormal assumes one winding; flip if the walk came out the other way
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      area += a.x * b.y - b.x * a.y;
    }
    if (area < 0) {
      ring.reverse();
    }
    return ring;
  }

  // Slides every vertex along the bisector of its two edges, far enough that
  // both edges end up `gap` from where they were. Corners stay sharp.
  function offsetRing(ring, gap, dx, dy) {
    const out = [];
    for (let i = 0; i < ring.length; i++) {
      const prev = ring[(i - 1 + ring.length) % ring.length];
      const cur = ring[i];
      const next = ring[(i + 1) % ring.length];
      const n1 = edgeNormal(prev, cur);
      const n2 = edgeNormal(cur, next);
      let bx = n1.x + n2.x;
      let by = n1.y + n2.y;
      const len = Math.hypot(bx, by) || 1;
      bx = bx / len;
      by = by / len;
      const reach = gap / Math.max(0.2, bx * n1.x + by * n1.y);
      out.push({ x: cur.x + bx * reach + dx, y: cur.y + by * reach + dy });
    }
    return out;
  }

  // outward normal of a ring edge, given the ring runs clockwise on canvas
  function edgeNormal(a, b) {
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len = Math.hypot(ex, ey) || 1;
    return { x: ey / len, y: -ex / len };
  }

  function drawBoardOutline(dx, dy) {
    if (!outlineRing) {
      outlineRing = buildOutlineRing();
    }
    const pts = offsetRing(outlineRing, layout.size * OUTLINE_R, dx, dy);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    ctx.lineWidth = Math.max(2, layout.size * OUTLINE_W);
    ctx.strokeStyle = CHALLENGE_EDGE;
    ctx.lineJoin = "miter";
    ctx.miterLimit = 4;
    ctx.stroke();
  }

  // Empty cells only, optionally shoved by (ox, oy). Opens a frame that the
  // caller closes with endFrame() after painting its own tiles.
  function drawBoardBase(ox, oy) {
    const dx = ox || 0;
    const dy = oy || 0;
    beginFrame();
    for (const c of cells) {
      const p = layout.pos.get(c.key);
      drawEmpty(p.x + dx, p.y + dy, layout.size);
    }
    if (isChallenge) {
      drawBoardOutline(dx, dy);
    }
  }

  function drawStatic() {
    drawBoardBase(0, 0);
    for (const entry of board) {
      const p = layout.pos.get(entry[0]);
      mode.drawTile(p.x, p.y, layout.size, entry[1].value);
    }
    endFrame();
  }

  // ---------------------------- undo, 2 deep --------------------------
  function snapshot() {
    const tiles = [];
    for (const entry of board) {
      tiles.push([entry[0], entry[1].value, entry[1].id]);
    }
    history.push({
      tiles: tiles,
      score: score,
      announcedWin: announcedWin,
      idCounter: idCounter,
      rng: rng.slice(),
    });
    if (history.length > UNDO_DEPTH) {
      history.shift();
    }
    updateUndo();
  }

  // every tile to a random cell of all 19; seeded rng, so undo rewinds it
  function shuffleBoard() {
    const tiles = [];
    for (const entry of board) {
      tiles.push(entry[1]);
    }
    const keys = cells.map(function (c) {
      return c.key;
    });
    for (let i = keys.length - 1; i > 0; i--) {
      const j = Math.floor(nextRandom() * (i + 1));
      const swap = keys[i];
      keys[i] = keys[j];
      keys[j] = swap;
    }
    board = new Map();
    for (let i = 0; i < tiles.length; i++) {
      board.set(keys[i], tiles[i]);
    }
  }

  function undo() {
    if (!history.length) {
      return;
    }
    if (mode.canUndo && !mode.canUndo()) {
      return;
    }
    if (isChallenge && hearts === 0) {
      return;
    }
    if (mode.onUndo) {
      mode.onUndo();
    }
    spendHeart();
    const snap = history.pop();
    board = new Map();
    for (const row of snap.tiles) {
      board.set(row[0], { value: row[1], id: row[2] });
    }
    score = snap.score;
    announcedWin = snap.announcedWin;
    // rewinding these is what makes a repeated move replay its spawn
    if (snap.rng) {
      rng = snap.rng.slice();
    }
    if (snap.idCounter) {
      idCounter = snap.idCounter;
    }
    over = false;
    hideOverlay();
    updateScores();
    updateUndo();
    save();
    drawStatic();
  }

  // ------------------------- win / end of game ------------------------
  function checkWin(mergedDests) {
    if (announcedWin) {
      return;
    }
    for (const key of mergedDests) {
      const t = board.get(key);
      if (t && t.value >= Math.pow(2, WIN_EXP)) {
        announcedWin = true;
        showOverlay(
          "16384",
          "Reached the top tile. Keep sliding to push further.",
          "Keep going"
        );
        return;
      }
    }
  }

  function endGame() {
    over = true;
    showOverlay(
      "No moves left",
      "The board is full. Score: " + score + ".",
      "Play again"
    );
  }

  // A mode calls this once its move has landed on the board.
  function settle(mergedDests) {
    if (!anyMovePossible()) {
      endGame();
      return;
    }
    checkWin(mergedDests);
  }

  // ----------------------------- overlay ------------------------------
  const overlay = document.getElementById("overlay");
  const ovBig = document.getElementById("ov-big");
  const ovSub = document.getElementById("ov-sub");
  const ovBtn = document.getElementById("ov-btn");

  function showOverlay(big, sub, btn) {
    ovBig.textContent = big;
    ovSub.textContent = sub;
    ovBtn.textContent = btn;
    overlay.classList.add("show");
  }

  function hideOverlay() {
    overlay.classList.remove("show");
  }

  // -------------------------- scores + storage ------------------------
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const undoBtn = document.getElementById("undo");
  let heartsBox = document.getElementById("hearts");

  function updateScores() {
    scoreEl.textContent = score;
    bestEl.textContent = best;
  }

  function updateUndo() {
    undoBtn.disabled = history.length === 0 ||
      (isChallenge && hearts === 0);
  }

  // three base slots hollow out as they empty; earned hearts append
  function updateHearts() {
    if (!heartsBox) {
      return;
    }
    let out = "";
    for (let i = 0; i < Math.max(START_HEARTS, hearts); i++) {
      if (i < hearts) {
        out += "♥";
      } else {
        out += "♡";
      }
    }
    heartsBox.textContent = out;
  }

  function spendHeart() {
    if (!isChallenge) {
      return;
    }
    hearts = Math.max(0, hearts - 1);
    updateHearts();
    updateUndo();
  }

  function grantHeart() {
    hearts = Math.min(MAX_HEARTS, hearts + 1);
    updateHearts();
    updateUndo();
  }

  function save() {
    const tiles = [];
    for (const entry of board) {
      tiles.push([entry[0], entry[1].value, entry[1].id]);
    }
    store.set(saveKey, JSON.stringify({
      tiles: tiles,
      score: score,
      idCounter: idCounter,
      announcedWin: announcedWin,
      rng: rng,
      history: history,
      hearts: hearts,
    }));
  }

  function load() {
    const raw = store.get(saveKey);
    if (!raw) {
      return false;
    }
    try {
      const data = JSON.parse(raw);
      board = new Map();
      for (const row of data.tiles) {
        if (cellIndex.has(row[0])) {
          board.set(row[0], { value: row[1], id: row[2] });
        }
      }
      score = data.score || 0;
      idCounter = data.idCounter || 1;
      announcedWin = !!data.announcedWin;
      if (Array.isArray(data.rng) && data.rng.length === 4) {
        rng = data.rng.slice();
      }
      history = [];
      if (Array.isArray(data.history)) {
        history = data.history.slice(-UNDO_DEPTH);
      }
      hearts = START_HEARTS;
      if (typeof data.hearts === "number") {
        hearts = Math.min(MAX_HEARTS, Math.max(0, data.hearts));
      }
      return board.size > 0;
    } catch (e) {
      return false;
    }
  }

  function reset() {
    board = new Map();
    score = 0;
    over = false;
    announcedWin = false;
    history = [];
    idCounter = 1;
    hearts = START_HEARTS;
    seedRng();
    if (mode.onReset) {
      mode.onReset();
    }
    hideOverlay();
    spawn();
    spawn();
    updateScores();
    updateHearts();
    updateUndo();
    save();
    drawStatic();
  }

  // -------------- input: 6-way swipe on a flat-top board --------------
  let touchStart = null;

  function onSwipeEnd(x, y) {
    if (!touchStart) {
      return;
    }
    const dx = x - touchStart.x;
    const dy = y - touchStart.y;
    touchStart = null;
    if (Math.hypot(dx, dy) < SWIPE_MIN) {
      return;
    }
    let ang = Math.atan2(-dy, dx) * 180 / Math.PI;   // 0 = right, 90 = up
    if (ang < 0) {
      ang += 360;
    }
    let dir = "ur";                                  // the 0-60 wedge
    if (ang >= 60 && ang < 120) {
      dir = "up";
    } else if (ang >= 120 && ang < 180) {
      dir = "ul";
    } else if (ang >= 180 && ang < 240) {
      dir = "dl";
    } else if (ang >= 240 && ang < 300) {
      dir = "down";
    } else if (ang >= 300) {
      dir = "dr";
    }
    mode.move(dir);
  }

  // --------------------------- break timer ----------------------------
  // Falsedge stamps BREAK_KEY on its way here, so the break is timed only when
  // you arrived through that link. The stamp lives in storage rather than
  // memory because the mode switch reloads the page - otherwise flipping
  // Normal/Jiggly would restart the clock forever.
  const lockout = document.getElementById("lockout");

  const fakeAd = document.getElementById("fake-ad");
  const fakeAdLabel = document.getElementById("fake-ad-label");
  let fakeAdTotal = 0;
  let fakeAdEnd = 0;
  let fakeAdReady = false;
  let fakeAdRaf = 0;

  // absent on the standalone public build, which is never timed
  function showLockout() {
    if (!lockout) {
      return;
    }
    lockout.classList.add("show");
    startFakeAd();
  }

  function startFakeAd() {
    if (!fakeAd) {
      return;
    }
    const span = FAKE_AD_MAX_MS - FAKE_AD_MIN_MS;
    fakeAdTotal = FAKE_AD_MIN_MS + Math.floor(Math.random() * (span + 1));
    fakeAdReady = false;
    fakeAd.disabled = true;
    fakeAd.classList.remove("ready");
    restartFakeAd();
  }

  function restartFakeAd() {
    if (fakeAdRaf) {
      cancelAnimationFrame(fakeAdRaf);
      fakeAdRaf = 0;
    }
    fakeAdEnd = Date.now() + fakeAdTotal;
    tickFakeAd();
  }

  function tickFakeAd() {
    fakeAdRaf = 0;
    const left = fakeAdEnd - Date.now();
    if (left <= 0) {
      fakeAdReady = true;
      fakeAd.disabled = false;
      fakeAd.classList.add("ready");
      fakeAd.style.setProperty("--fake-ad-p", "1");
      fakeAdLabel.textContent = "×";
      return;
    }
    const done = 1 - left / fakeAdTotal;
    fakeAd.style.setProperty("--fake-ad-p", done.toFixed(4));
    fakeAdLabel.textContent = String(Math.ceil(left / 1000));
    fakeAdRaf = requestAnimationFrame(tickFakeAd);
  }

  function closeFakeAd() {
    if (!fakeAdReady) {
      return;
    }
    if (fakeAdRaf) {
      cancelAnimationFrame(fakeAdRaf);
      fakeAdRaf = 0;
    }
    lockout.classList.remove("show");
    store.set(BREAK_KEY, String(Date.now()));
    startBreakTimer();
  }

  function startBreakTimer() {
    const started = parseInt(store.get(BREAK_KEY) || "0", 10);
    if (!started) {
      return;
    }
    const left = started + BREAK_MS - Date.now();
    if (left <= 0) {
      showLockout();
      return;
    }
    setTimeout(showLockout, left);
  }

  // --------------------------- mode switch ----------------------------
  // Each mode is a whole self-booting script that grabs the DOM and binds its
  // own listeners, so there is no way to unload one at runtime - switching
  // reloads the page and lets the bootstrap pick the other file.
  function currentMode() {
    const m = store.get(MODE_KEY);
    if (m === "jiggly" || m === "challenge") {
      return m;
    }
    return "base";
  }

  const NEXT_MODE = {
    base: "challenge",
    challenge: "jiggly",
    jiggly: "base",
  };

  function switchMode() {
    store.set(MODE_KEY, NEXT_MODE[currentMode()]);
    location.reload();
  }

  // ------------------------------- boot -------------------------------
  function boot(cfg) {
    mode = cfg;
    saveKey = cfg.saveKey;

    const modeBtn = document.getElementById("mode");
    const modeName = document.getElementById("mode-name");
    const LABELS = {
      base: ["Go to Challenge", "normal mode"],
      challenge: ["Go to Jiggly", "challenge mode"],
      jiggly: ["Go to Normal", "jiggly mode"],
    };
    const here = currentMode();
    isChallenge = here === "challenge";
    modeBtn.textContent = LABELS[here][0];
    modeName.textContent = LABELS[here][1];
    modeBtn.addEventListener("click", switchMode);

    if (heartsBox && !isChallenge) {
      heartsBox.remove();
      heartsBox = null;
    }

    document.getElementById("newgame").addEventListener("click", reset);
    undoBtn.addEventListener("click", undo);
    ovBtn.addEventListener("click", function () {
      if (over) {
        reset();
        return;
      }
      hideOverlay();                  // "keep going" after a win
    });

    canvas.addEventListener("touchstart", function (e) {
      const t = e.changedTouches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    }, { passive: true });

    canvas.addEventListener("touchend", function (e) {
      const t = e.changedTouches[0];
      onSwipeEnd(t.clientX, t.clientY);
    }, { passive: true });

    function relayout() {
      computeLayout();
      drawStatic();
    }
    window.addEventListener("resize", relayout);
    if (window.ResizeObserver) {
      new ResizeObserver(relayout).observe(canvas.parentElement);
    }

    const pads = document.querySelectorAll(".pad");
    for (const p of pads) {
      p.addEventListener("click", function () {
        mode.move(p.dataset.dir);
      });
    }

    const padBtn = document.getElementById("padtoggle");
    let padsOn = store.get(PADS_KEY) === "1";

    // the label states what the pads are doing, not what tapping will do
    function applyPads() {
      if (padsOn) {
        canvas.parentElement.classList.remove("pads-off");
        padBtn.classList.remove("off");
        padBtn.textContent = "Click pads on";
        return;
      }
      canvas.parentElement.classList.add("pads-off");
      padBtn.classList.add("off");
      padBtn.textContent = "Click pads off";
    }

    padBtn.addEventListener("click", function () {
      padsOn = !padsOn;
      if (padsOn) {
        store.set(PADS_KEY, "1");
      } else {
        store.set(PADS_KEY, "0");
      }
      applyPads();
      // the board's margin depends on the pads, and toggling them doesn't
      // resize the stage, so nothing else would trigger a re-layout
      relayout();
    });
    applyPads();

    // Walking out of the page on purpose ends the break; the mode switch
    // reloads without touching the stamp, so it cannot be used to escape.
    const exits = document.querySelectorAll(".navaway");
    for (const link of exits) {
      link.addEventListener("click", function () {
        store.set(BREAK_KEY, "0");
      });
    }

    if (fakeAd) {
      fakeAd.addEventListener("click", closeFakeAd);
      document.addEventListener("visibilitychange", function () {
        if (fakeAdReady || !lockout.classList.contains("show")) {
          return;
        }
        if (document.hidden) {
          if (fakeAdRaf) {
            cancelAnimationFrame(fakeAdRaf);
            fakeAdRaf = 0;
          }
          return;
        }
        restartFakeAd();
      });
    }

    computeLayout();
    updateScores();
    if (!load()) {
      spawn();
      spawn();
      save();
    }
    updateHearts();
    updateUndo();
    drawStatic();
    startBreakTimer();
  }

  return {
    // board access
    getBoard() {
      return board;
    },
    isOver() {
      return over;
    },
    getLayout() {
      return layout;
    },
    getCtx() {
      return ctx;
    },
    posOf: posOf,

    // rules
    applyMove: applyMove,
    anyMovePossible: anyMovePossible,
    commit: commit,
    spawn: spawn,
    save: save,
    settle: settle,
    snapshot: snapshot,
    shuffleBoard: shuffleBoard,
    endGame: endGame,

    // painting helpers for a mode's drawTile
    beginFrame: beginFrame,
    endFrame: endFrame,
    drawBoardBase: drawBoardBase,
    drawStatic: drawStatic,
    hexPath: hexPath,
    tileColours: tileColours,
    tileFontSize: tileFontSize,
    TILE: TILE,

    boot: boot,
  };
})();
