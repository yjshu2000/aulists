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
  const WIN_TILE = Math.pow(2, WIN_EXP);
  // the special tiles; these two must stay in step with GRADIENT_TILES
  const GRADIENT_FIRST = 524288;
  const GRADIENT_LAST = 1048576;
  const WORDART_TEXT = "special tiles";
  const CONFETTI_COUNT = 240;
  const CONFETTI_REPLAY_MS = 12 * 1000;
  const SQRT3 = Math.sqrt(3);
  const BEST_KEY = "hex2.best";
  const MODE_KEY = "hex2.mode";
  const BREAK_KEY = "hex2.break.start";
  const GRASS_KEY = "grass.count";
  const UNDO_DEPTH = 6;
  const START_HEARTS = 3;
  const MAX_HEARTS = 5;
  const HEART_TILE = 2048;
  const CHALLENGE_EDGE = "#ff0000";
  const OUTLINE_R = 0.1;     // gap off the board, as a share of a cell
  const OUTLINE_W = 0.1;    // stroke width, also as a share of a cell
  const BREAK_MS = 30 * 1000;
  const EARN_POP_MS = 380;
  const FAKE_AD_MIN_MS = 30 * 1000;
  const FAKE_AD_MAX_MS = 120 * 1000;
  const SWIPE_MIN = 22;      // px of travel before a drag counts as a swipe
  const PADS_KEY = "hex2.pads";
  const DIM_KEY = "hex2.dim";
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
  let announcedTile = 0;   // highest tile already celebrated
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
  // an interrupting swipe cannot lose the new tile. `skipSnapshot` is for a
  // mode whose one gesture runs several passes and wants them to rewind
  // together as a single undo entry.
  function commit(res, skipSnapshot) {
    if (!skipSnapshot) {
      snapshot();
    }
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

  // Hand-picked, one entry per value, as [HSL]
  const TILE_HSL = {
    1: [0, 66, 84],
    2: [0, 66, 66],
    4: [0, 69, 55],
    8: [23, 78, 52],
    16: [41, 92, 49],
    32: [56, 88, 56],
    64: [80, 78, 52],
    128: [128, 88, 43],
    256: [152, 66, 60],
    512: [189, 66, 59],
    1024: [211, 80, 54],
    2048: [224, 79, 51],
    4096: [228, 92, 35],
    8192: [246, 66, 58],
    16384: [269, 66, 60],
    32768: [286, 68, 70],
    65536: [305, 66, 54],
    131072: [328, 81, 50],
    262144: [348, 55, 48],
  };

  // the last solid colour; 524288 and 1048576 are gradients
  const TOP_SOLID = 262144;

  function hslToRgb(h, s, l) {
    const hh = h / 360;
    const a = s * Math.min(l, 1 - l);
    function channel(n) {
      const k = (n + hh * 12) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    }
    return [channel(0), channel(8), channel(4)];
  }

  // Pick the number's colour off the fill's relative luminance
  function tileColours(value) {
    let hsl = TILE_HSL[value];
    if (!hsl) {
      hsl = TILE_HSL[TOP_SOLID];
    }
    const fill = "hsl(" + hsl[0] + ", " + hsl[1] + "%, " + hsl[2] + "%)";
    const rgb = hslToRgb(hsl[0], hsl[1] / 100, hsl[2] / 100);
    const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    let text = "#ffffff";
    if (lum > 0.45) {
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

  // ------------------------ the two gradient tiles --------------------------
  // 524288 and 1048576 are pretty gradients :3
  const BLOB_S = 72;
  const BLOB_L = 52;

  // 524288's blobs hand-placed
  const RAINBOW_BLOBS = [
    { hue: 0, cx: 0.30, cy: 0.20, r: 0.58 },
    { hue: 52, cx: 0.72, cy: 0.18, r: 0.54 },
    { hue: 116, cx: 0.86, cy: 0.60, r: 0.56 },
    { hue: 178, cx: 0.56, cy: 0.88, r: 0.58 },
    { hue: 238, cx: 0.16, cy: 0.72, r: 0.54 },
    { hue: 300, cx: 0.12, cy: 0.36, r: 0.52 },
  ];

  // 1048576's blobs
  const MILLION_BLOBS = [0, 52, 116, 178, 238, 300].map(function (hue, i) {
    const a = Math.PI * 2 * (i / 6) - Math.PI / 2;
    return {
      hue: hue,
      cx: 0.5 + Math.cos(a) * 0.3,
      cy: 0.5 + Math.sin(a) * 0.3,
      r: 0.54,
    };
  });

  // pretty shiny part for 1mil tile
  const MILLION_LAYERS = [
    { kind: "glow", cx: 0.34, cy: 0.22, r: 0.62, op: 0.5 },
    { kind: "star", cx: 0.32, cy: 0.24, r: 0.40, op: 0.95 },
    { kind: "glow", cx: 0.32, cy: 0.24, r: 0.10, op: 1 },
  ];

  const GRADIENT_TILES = {
    524288: { blobs: RAINBOW_BLOBS, layers: null, invert: false },
    1048576: { blobs: MILLION_BLOBS, layers: MILLION_LAYERS, invert: true },
  };

  function hslaStr(h, s, l, a) {
    return "hsla(" + h + ", " + s + "%, " + l + "%, " + a + ")";
  }

  // Built in unit-box coordinates. Cached. Gradient will squash and squish
  function blobGradient(hue, s, l, b) {
    if (b.grad) {
      return b.grad;
    }
    let peak = 1;
    if (b.op !== undefined) {
      peak = b.op;
    }
    const g = ctx.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, b.r);
    g.addColorStop(0, hslaStr(hue, s, l, peak));
    g.addColorStop(0.45, hslaStr(hue, s, l, peak * 0.72));
    g.addColorStop(1, hslaStr(hue, s, l, 0));
    b.grad = g;
    return g;
  }

  // One pool, drawn inside the unit-square transform set up by the caller.
  function paintBlob(hue, s, l, b) {
    ctx.fillStyle = blobGradient(hue, s, l, b);
    ctx.fillRect(0, 0, 1, 1);
  }

  // Places the tile's bounding box as a unit square
  function unitBox(cx, cy, radius) {
    ctx.translate(cx - radius, cy - SQRT3 * radius / 2);
    ctx.scale(2 * radius, SQRT3 * radius);
  }

  // A four-point star: thin spikes, the classic glint. Drawn in pixel space
  function paintStar(cx, cy, radius, ly) {
    const x = cx + (ly.cx - 0.5) * radius * 2;
    const y = cy + (ly.cy - 0.5) * radius * SQRT3;
    const rr = ly.r * radius;
    const w = rr * 0.14;
    ctx.beginPath();
    ctx.moveTo(x, y - rr);
    ctx.quadraticCurveTo(x, y, x + w, y);
    ctx.quadraticCurveTo(x, y, x, y + rr);
    ctx.quadraticCurveTo(x, y, x - w, y);
    ctx.quadraticCurveTo(x, y, x, y - rr);
    ctx.moveTo(x - rr, y);
    ctx.quadraticCurveTo(x, y, x, y - w);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.quadraticCurveTo(x, y, x, y + w);
    ctx.quadraticCurveTo(x, y, x - rr, y);
    ctx.closePath();
    ctx.fillStyle = "rgba(255, 255, 255, " + ly.op + ")";
    ctx.fill();
  }

  // Outline for number text on gradients
  function paintOutlinedNumber(cx, cy, size, value, invert) {
    let fill = "#ffffff";
    let stroke = "rgba(0, 0, 0, 0.65)";
    if (invert) {
      fill = "#171a1f";
      stroke = "rgba(255, 255, 255, 0.85)";
    }
    const fs = tileFontSize(value, size);
    const y = cy + fs * TILE.textNudgeFrac;
    // lineJoin is sticky, so it is scoped rather than left on the context
    ctx.save();
    ctx.font = "800 " + fs + "px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.lineJoin = "round";
    ctx.strokeStyle = stroke;
    ctx.strokeText(String(value), cx, y);
    ctx.fillStyle = fill;
    ctx.fillText(String(value), cx, y);
    ctx.restore();
  }

  function paintGradientTile(cx, cy, radius, size, value, spec) {
    ctx.save();
    hexPath(cx, cy, radius);
    ctx.clip();

    ctx.save();
    unitBox(cx, cy, radius);
    const first = spec.blobs[0];
    ctx.fillStyle = "hsl(" + first.hue + ", " + BLOB_S + "%, " +
      BLOB_L + "%)";
    ctx.fillRect(0, 0, 1, 1);
    for (const b of spec.blobs) {
      paintBlob(b.hue, BLOB_S, BLOB_L, b);
    }
    ctx.restore();

    let layers = spec.layers;
    if (!layers) {
      layers = [];
    }
    for (const ly of layers) {
      if (ly.kind === "star") {
        paintStar(cx, cy, radius, ly);
        continue;
      }
      ctx.save();
      unitBox(cx, cy, radius);
      paintBlob(0, 0, 100, ly);
      ctx.restore();
    }
    ctx.restore();

    hexPath(cx, cy, radius);
    ctx.lineWidth = Math.max(1, size * TILE.strokeFrac);
    ctx.strokeStyle = TILE.strokeColour;
    ctx.stroke();
    paintOutlinedNumber(cx, cy, size, value, spec.invert);
  }

  // Every mode paints a tile through here, so the palette and the two
  // gradient tiles exist once rather than once per mode file. `radius` is the
  // hex to draw; `size` is the cell, which sets the stroke and the font.
  function paintTile(cx, cy, radius, size, value) {
    const spec = GRADIENT_TILES[value];
    if (spec) {
      paintGradientTile(cx, cy, radius, size, value, spec);
      return;
    }
    const colours = tileColours(value);
    hexPath(cx, cy, radius);
    ctx.fillStyle = colours.fill;
    ctx.fill();
    ctx.lineWidth = Math.max(1, size * TILE.strokeFrac);
    ctx.strokeStyle = TILE.strokeColour;
    ctx.stroke();

    const fs = tileFontSize(value, size);
    ctx.fillStyle = colours.text;
    ctx.font = "800 " + fs + "px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(value), cx, cy + fs * TILE.textNudgeFrac);
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

  // A mode whose one gesture runs several passes marks the board busy while it
  // plays out, so the stylesheet can pull it back and grey it over.
  function setBoardBusy(on) {
    canvas.parentElement.classList.toggle("board-busy", on);
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
      announcedTile: announcedTile,
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
    announcedTile = snap.announcedTile || 0;
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
  // The highest merge at or above the win tile that has not been celebrated
  // yet, or 0 when there is nothing new to say. A pure predicate, so a mode
  // whose one gesture runs several passes can watch every pass and hold the
  // announcement until the last. One gesture announces at most one tile: a
  // cascade that crosses two thresholds at once shows only the higher. Nothing
  // above GRADIENT_LAST is reachable, so nothing is said about it.
  function reachedWin(mergedDests) {
    let top = 0;
    for (const key of mergedDests) {
      const t = board.get(key);
      if (t && t.value > top) {
        top = t.value;
      }
    }
    if (top < WIN_TILE || top <= announcedTile || top > GRADIENT_LAST) {
      return 0;
    }
    return top;
  }

  function announceWin(value) {
    announcedTile = value;
    showWin(value);
  }

  function checkWin(mergedDests) {
    const value = reachedWin(mergedDests);
    if (value) {
      announceWin(value);
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

  // Cosmetics only, and Math.random on purpose: the seeded rng is snapshotted
  // for undo, so drawing from it here would shift every later spawn.
  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  // Per-letter `color` animation rather than a clipped gradient. A gradient
  // parses everywhere and paints nowhere on some phones, and it fails to an
  // empty gap - the words simply vanish. Each <b> carries two delays: one for
  // the wave, one negative for the hue, so the rainbow travels along the line.
  function buildWordart() {
    const wrap = document.createElement("span");
    wrap.className = "wordart";
    const inner = document.createElement("span");
    inner.className = "wa-text";
    wrap.appendChild(inner);
    for (let i = 0; i < WORDART_TEXT.length; i++) {
      const b = document.createElement("b");
      const ch = WORDART_TEXT.charAt(i);
      if (ch === " ") {
        b.innerHTML = "&nbsp;";
      } else {
        b.textContent = ch;
      }
      b.style.setProperty("--d", (i * 0.07).toFixed(2) + "s");
      b.style.setProperty("--h", (-(i * 0.21)).toFixed(2) + "s");
      inner.appendChild(b);
    }
    for (let i = 0; i < 5; i++) {
      const s = document.createElement("span");
      s.className = "spark";
      s.style.left = (8 + i * 20 + rand(-6, 6)).toFixed(0) + "%";
      s.style.top = rand(-30, 70).toFixed(0) + "%";
      s.style.setProperty("--s", rand(5, 9).toFixed(1) + "px");
      s.style.setProperty("--sd", rand(1600, 2600).toFixed(0) + "ms");
      s.style.setProperty("--st", rand(0, 2000).toFixed(0) + "ms");
      wrap.appendChild(s);
    }
    return wrap;
  }

  // The two gradient tiles are the special ones, so their own screens say what
  // has been unlocked instead of pointing further ahead.
  function winSubParts(value) {
    if (value === GRADIENT_LAST) {
      return ["All ", " unlocked!"];
    }
    if (value === GRADIENT_FIRST) {
      return ["1/2 ", " unlocked!"];
    }
    return ["Keep going to unlock ", ""];
  }

  function buildWinSub(value) {
    const parts = winSubParts(value);
    ovSub.textContent = "";
    ovSub.appendChild(document.createTextNode(value + " reached"));
    ovSub.appendChild(document.createElement("br"));
    ovSub.appendChild(document.createTextNode(parts[0]));
    ovSub.appendChild(buildWordart());
    if (parts[1]) {
      ovSub.appendChild(document.createTextNode(parts[1]));
    }
  }

  // Two nested spans, so the spin and the hop run on separate elements and
  // never have to share a clock. `.bigpop` is what starts them.
  function buildWinBig() {
    const sp = document.createElement("span");
    sp.className = "sp";
    const sc = document.createElement("span");
    sc.className = "sc";
    sc.textContent = "YIPPEE";
    sp.appendChild(sc);
    ovBig.textContent = "";
    ovBig.appendChild(sp);
  }

  // The classes go on before the confetti starts: a display:none element
  // measures zero, and the canvas sizes itself off the overlay.
  function showWin(value) {
    buildWinBig();
    buildWinSub(value);
    ovBtn.textContent = "Keep going";
    overlay.classList.add("show", "win");
    startConfetti();
  }

  // The plain overlay - game over, and anything else that is not a win.
  function showOverlay(big, sub, btn) {
    stopConfetti();
    overlay.classList.remove("win");
    ovBig.classList.remove("bigpop");
    ovBig.textContent = big;
    ovSub.textContent = sub;
    ovBtn.textContent = btn;
    overlay.classList.add("show");
  }

  function hideOverlay() {
    stopConfetti();
    overlay.classList.remove("show", "win");
    ovBig.classList.remove("bigpop");
  }

  // ---------------------------- confetti ------------------------------
  // The DOM version of this motion, evaluated here instead of by the browser:
  // same keyframes, same easing curves, same numbers. What changed is who does
  // the arithmetic. One canvas is one compositor layer however many pieces are
  // in it, where one DOM node per piece was already costing frames at 160.
  const CONFETTI_COLOURS = [
    "#e05a5a", "#d5722e", "#f0c22a", "#9ed42a", "#2ec96a",
    "#2ab5a8", "#3cc3e2", "#4a6fe0", "#8a5ae0", "#d54ab0"
  ];

  // one off each side and one from the bottom; ox/oy are shares of the overlay
  const CANNONS = [
    { ox: -0.04, oy: 0.50, aim: 68, spread: 34, share: 0.3 },
    { ox: 1.04, oy: 0.50, aim: -68, spread: 34, share: 0.3 },
    { ox: 0.5, oy: 1.04, aim: 0, spread: 52, share: 0.4 }
  ];

  const CONFETTI_POWER = 400;
  const CONFETTI_DUR = 2000;
  const CONFETTI_APEX = 0.38;  // where the arc turns over, as in the keyframes

  const confettiCanvas = document.getElementById("confetti");
  const confettiCtx = confettiCanvas.getContext("2d");
  let confettiPieces = [];
  let confettiDpr = 1;
  let confettiW = 0;
  let confettiH = 0;
  let confettiStart = 0;
  let confettiNext = 0;
  let confettiRaf = 0;

  // A CSS cubic-bezier, sampled once into a table and read back by lerp.
  // Solving it per piece per frame would cost more than the drawing does.
  function makeEase(x1, y1, x2, y2) {
    const N = 256;
    const table = new Float32Array(N + 1);
    function cx(t) {
      return 3 * (1 - t) * (1 - t) * t * x1 +
             3 * (1 - t) * t * t * x2 + t * t * t;
    }
    function cy(t) {
      return 3 * (1 - t) * (1 - t) * t * y1 +
             3 * (1 - t) * t * t * y2 + t * t * t;
    }
    for (let i = 0; i <= N; i++) {
      const x = i / N;
      let lo = 0;
      let hi = 1;
      let t = x;
      for (let k = 0; k < 22; k++) {
        t = (lo + hi) / 2;
        if (cx(t) < x) {
          lo = t;
        } else {
          hi = t;
        }
      }
      table[i] = cy(t);
    }
    return function (x) {
      if (x <= 0) {
        return 0;
      }
      if (x >= 1) {
        return 1;
      }
      const f = x * N;
      const i0 = f | 0;
      return table[i0] + (table[i0 + 1] - table[i0]) * (f - i0);
    };
  }

  const easeRise = makeEase(0.15, 0.72, 0.4, 1);
  const easeFall = makeEase(0.55, 0, 0.85, 0.45);
  const easeTumble = makeEase(0.12, 0.72, 0.35, 1);

  function resizeConfetti() {
    const r = overlay.getBoundingClientRect();
    confettiW = r.width;
    confettiH = r.height;
    confettiDpr = Math.min(window.devicePixelRatio || 1, 3);
    confettiCanvas.width = Math.round(confettiW * confettiDpr);
    confettiCanvas.height = Math.round(confettiH * confettiDpr);
  }

  function fireConfetti() {
    confettiPieces = [];
    for (const c of CANNONS) {
      const n = Math.round(CONFETTI_COUNT * c.share);
      const half = c.spread / 2;
      for (let i = 0; i < n; i++) {
        const a = (c.aim + rand(-half, half)) * Math.PI / 180;
        const speed = CONFETTI_POWER * rand(0.55, 1.3);
        const w = rand(5, 11);
        confettiPieces.push({
          x0: c.ox * confettiW,
          y0: c.oy * confettiH,
          // exactly the three numbers the keyframes were handed
          dx: Math.sin(a) * speed,
          up: -Math.cos(a) * speed * 0.95 - rand(10, 40),
          down: speed * 2.9 + rand(60, 200),
          w: w,
          h: w * rand(0.5, 1.7),
          round: Math.random() < 0.22,
          col: CONFETTI_COLOURS[(Math.random() * CONFETTI_COLOURS.length) | 0],
          rx: rand(540, 1440),
          ry: rand(360, 1080),
          delay: rand(0, 130)
        });
      }
    }
    confettiStart = performance.now();
    ovBig.classList.remove("bigpop");
    // reflow, so a replay restarts the animation rather than ignoring it
    void ovBig.offsetWidth;
    ovBig.classList.add("bigpop");
    confettiNext = 0;
  }

  function drawConfetti(now) {
    confettiCtx.setTransform(confettiDpr, 0, 0, confettiDpr, 0, 0);
    confettiCtx.clearRect(0, 0, confettiW, confettiH);
    let live = 0;
    for (const p of confettiPieces) {
      const u = (now - confettiStart - p.delay) / CONFETTI_DUR;
      if (u < 0) {
        live++;
        continue;
      }
      if (u >= 1) {
        continue;
      }
      live++;

      const x = p.x0 + p.dx * u;
      let y = p.y0 + p.up * easeRise(u / CONFETTI_APEX);
      if (u >= CONFETTI_APEX) {
        y = p.y0 + p.up + (p.down - p.up) *
          easeFall((u - CONFETTI_APEX) / (1 - CONFETTI_APEX));
      }

      // in by 6% of the flight, out across the rest
      let alpha = u / 0.06;
      if (u >= 0.06) {
        alpha = 1 - (u - 0.06) / 0.94;
      }

      // A flat card turned about X and Y and viewed head-on keeps a silhouette
      // of width x cos(Y) by height x cos(X), so the tumble is two cosines -
      // which is what the browser was working out anyway.
      const e = easeTumble(u);
      const sx = Math.cos(p.ry * e * Math.PI / 180);
      const sy = Math.cos(p.rx * e * Math.PI / 180);

      confettiCtx.save();
      confettiCtx.globalAlpha = alpha;
      confettiCtx.translate(x, y);
      confettiCtx.scale(sx, sy);
      confettiCtx.fillStyle = p.col;
      if (p.round) {
        confettiCtx.beginPath();
        confettiCtx.ellipse(0, 0, p.w / 2, p.h / 2, 0, 0, Math.PI * 2);
        confettiCtx.fill();
      } else {
        confettiCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      confettiCtx.restore();
    }
    return live;
  }

  function loopConfetti(now) {
    confettiRaf = requestAnimationFrame(loopConfetti);
    if (drawConfetti(now)) {
      return;
    }
    if (!confettiNext) {
      confettiNext = now + CONFETTI_REPLAY_MS;
      return;
    }
    if (now >= confettiNext) {
      fireConfetti();
    }
  }

  function startConfetti() {
    if (confettiRaf) {
      return;
    }
    resizeConfetti();
    fireConfetti();
    confettiRaf = requestAnimationFrame(loopConfetti);
  }

  function stopConfetti() {
    if (!confettiRaf) {
      return;
    }
    cancelAnimationFrame(confettiRaf);
    confettiRaf = 0;
    confettiPieces = [];
    confettiCtx.setTransform(confettiDpr, 0, 0, confettiDpr, 0, 0);
    confettiCtx.clearRect(0, 0, confettiW, confettiH);
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
      announcedTile: announcedTile,
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
      announcedTile = 0;
      if (typeof data.announcedTile === "number") {
        announcedTile = data.announcedTile;
      }
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
    announcedTile = 0;
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
  const earn = document.getElementById("earn");
  const earnNum = document.getElementById("earnNum");
  let fakeAdTotal = 0;
  let fakeAdEnd = 0;
  let fakeAdReady = false;
  let fakeAdRaf = 0;

  // absent on the standalone public build, which is never timed
  function showLockout() {
    if (!lockout) {
      return;
    }
    // every wait opens on the promise again, not on the last payout's total
    if (earnNum) {
      earnNum.textContent = "+1";
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

  // One grass per wait actually sat through - closeFakeAd is already gated on
  // fakeAdReady, so there is no partial credit. It lives under its own key
  // rather than inside either app's save blob, so neither can rewind it.
  function payGrass() {
    let n = parseInt(store.get(GRASS_KEY) || "0", 10) || 0;
    n += 1;
    store.set(GRASS_KEY, String(n));
    if (!earn) {
      return;
    }
    earnNum.textContent = String(n);
    earn.classList.remove("pop");
    // reflow, so a second payout restarts the animation instead of ignoring it
    void earn.offsetWidth;
    earn.classList.add("pop");
  }

  function closeFakeAd() {
    if (!fakeAdReady) {
      return;
    }
    if (fakeAdRaf) {
      cancelAnimationFrame(fakeAdRaf);
      fakeAdRaf = 0;
    }
    payGrass();
    // the pop plays over the lockout, so the break's 30s starts after it
    setTimeout(function () {
      if (earn) {
        earn.classList.remove("pop");
      }
      lockout.classList.remove("show");
      store.set(BREAK_KEY, String(Date.now()));
      startBreakTimer();
    }, EARN_POP_MS);
  }

  // peekable
  function startPeek(e) {
    if (e.target.closest(".fake-ad, .lockout-card .hexbtn")) {
      return;
    }
    lockout.classList.add("peek");
  }

  function endPeek() {
    lockout.classList.remove("peek");
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
  // reloads the page and lets the bootstrap pick the other file. MODES lists
  // them in the order they were added, which is the order the dropdown shows:
  // `label` names the option, `name` is the subtitle under the brand, which
  // keeps its own lowercase wording. A new mode is one row here plus its own
  // hex2-<key>.js.
  const MODES = [
    { key: "base", label: "Normal", name: "normal mode" },
    { key: "jiggly", label: "Jiggly", name: "jiggly mode" },
    { key: "challenge", label: "Challenge", name: "challenge mode" },
    { key: "cascading", label: "Cascading", name: "cascading mode" },
  ];

  function modeSpec(key) {
    return MODES.find(function (m) {
      return m.key === key;
    });
  }

  function currentMode() {
    const m = store.get(MODE_KEY);
    if (modeSpec(m)) {
      return m;
    }
    return "base";
  }

  // Picking the mode already showing is a no-op rather than a reload.
  function pickMode(key) {
    if (key === currentMode()) {
      return;
    }
    store.set(MODE_KEY, key);
    location.reload();
  }

  // ------------------------------- boot -------------------------------
  function boot(cfg) {
    mode = cfg;
    saveKey = cfg.saveKey;

    const modeSel = document.getElementById("mode");
    const modeName = document.getElementById("mode-name");
    const here = currentMode();
    isChallenge = here === "challenge";
    for (const m of MODES) {
      const opt = document.createElement("option");
      opt.value = m.key;
      opt.textContent = m.label;
      modeSel.appendChild(opt);
    }
    modeSel.value = here;
    modeName.textContent = modeSpec(here).name;
    modeSel.addEventListener("change", function () {
      pickMode(modeSel.value);
    });

    if (heartsBox && !isChallenge) {
      heartsBox.remove();
      heartsBox = null;
    }

    // the dim only ever happens in Cascading, so its toggle is absent
    // everywhere else rather than sitting there inert
    let dimBtn = document.getElementById("dimtoggle");
    if (dimBtn && here !== "cascading") {
      dimBtn.remove();
      dimBtn = null;
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
      // the confetti canvas rides the overlay, which only has a size while it
      // is showing, so it is resized alongside rather than on its own
      if (confettiRaf) {
        resizeConfetti();
      }
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

    if (dimBtn) {
      let dimOn = store.get(DIM_KEY) === "1";

      // the label states what the dim is doing, not what tapping will do
      const applyDim = function () {
        if (dimOn) {
          canvas.parentElement.classList.add("dim");
          dimBtn.classList.remove("off");
          dimBtn.textContent = "Dim on";
          return;
        }
        canvas.parentElement.classList.remove("dim");
        dimBtn.classList.add("off");
        dimBtn.textContent = "Dim off";
      };

      dimBtn.addEventListener("click", function () {
        dimOn = !dimOn;
        if (dimOn) {
          store.set(DIM_KEY, "1");
        } else {
          store.set(DIM_KEY, "0");
        }
        applyDim();
      });
      applyDim();
    }

    // Walking out of the page on purpose ends the break; the mode switch
    // reloads without touching the stamp, so it cannot be used to escape.
    const exits = document.querySelectorAll(".navaway");
    for (const link of exits) {
      link.addEventListener("click", function () {
        store.set(BREAK_KEY, "0");
      });
    }

    if (lockout) {
      lockout.addEventListener("pointerdown", startPeek);
      lockout.addEventListener("pointerup", endPeek);
      lockout.addEventListener("pointercancel", endPeek);
      // a finger dragged off-screen would otherwise leave the board visible
      lockout.addEventListener("pointerleave", endPeek);
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
    reachedWin: reachedWin,
    announceWin: announceWin,

    // painting helpers for a mode's drawTile
    beginFrame: beginFrame,
    endFrame: endFrame,
    drawBoardBase: drawBoardBase,
    drawStatic: drawStatic,
    setBoardBusy: setBoardBusy,
    hexPath: hexPath,
    paintTile: paintTile,
    tileFontSize: tileFontSize,
    TILE: TILE,

    boot: boot,
  };
})();
