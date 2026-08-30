// Hex 2^ - jiggly mode.
//
// One interruptible animation loop instead of chained callbacks. Every move
// commits to the board synchronously, so the wobble is purely cosmetic and a
// fresh swipe can cut it off mid-flight without the game state ever being
// caught halfway. Nothing moves while the board is idle.

(function () {
  "use strict";

  const SAVE_KEY = "hex2.jiggly.save";
  const SLIDE_MS = 160;
  const POP_MS = 2600;        // long cosmetic slosh; never blocks input
  const BLOCK_MS = 520;
  const GROW_MS = 300;        // how long a spawned tile balloons in for
  const WOBBLE_FREQ = 15;     // oscillations across one wobble
  const WOBBLE_DECAY = 2.6;   // lower = quivers longer before it sets
  const WOBBLE_2ND_FREQ = 0.82;

  const SLIDE_OVERSHOOT = 1.5;
  const SLIDE_SMEAR = 0.34;

  const PUNCH_X = 0.52;
  const PUNCH_Y = 0.46;
  const PUNCH_ROT = 0.12;

  const GROW_OVERSHOOT = 4.0;
  const GROW_X = 0.42;
  const GROW_Y = 0.38;
  const GROW_ROT = 0.14;

  const BLOCK_AMP = 0.22;
  const BLOCK_FREQ = 1.8;
  const BLOCK_DECAY = 4.2;
  const BLOCK_WOBBLE_FREQ = 6;
  const BLOCK_WOBBLE_DECAY = 3.2;
  const BLOCK_SQUASH = 0.18;
  const BLOCK_ROT = 0.06;

  // rubber-band push direction for a swipe that hit a wall
  const COS30 = Math.sqrt(3) / 2;
  const DIR_VEC = {
    up: [0, -1],
    down: [0, 1],
    ur: [COS30, -0.5],
    dl: [-COS30, 0.5],
    ul: [-COS30, -0.5],
    dr: [COS30, 0.5],
  };

  let anim = null;           // { type, start, dur, ... } or null when idle
  let rafId = 0;

  function easeOutBack(t, s) {          // overshoot, then settle back
    let k = s;
    if (k === undefined) {
      k = SLIDE_OVERSHOOT;
    }
    const u = t - 1;
    return u * u * ((k + 1) * u + k) + 1;
  }

  function damped(t, freq, decay) {     // starts at 0, springs, rings out
    return Math.exp(-decay * t) * Math.sin(freq * Math.PI * t);
  }

  // sx/sy squash the hex about its own centre; rot adds a gooey twist. The
  // whole tile (number, any gradients) will squish together
  function drawTile(cx, cy, size, value, sxIn, syIn, rot) {
    let sx = sxIn;
    let sy = syIn;
    if (sx == null) {
      sx = 1;
    }
    if (sy == null) {
      sy = 1;
    }
    const ctx = Hex2.getCtx();
    ctx.save();
    ctx.translate(cx, cy);
    if (rot) {
      ctx.rotate(rot);
    }
    ctx.scale(sx, sy);
    Hex2.paintTile(0, 0, size * Hex2.TILE.radiusFrac, size, value);
    ctx.restore();
  }

  // ------------------------- the animation loop -----------------------
  function ensureLoop() {
    if (!rafId) {
      rafId = requestAnimationFrame(tick);
    }
  }

  // The board is already at rest, so dropping the in-flight cosmetics is always
  // safe - there is no state to unwind.
  function settleAnim() {
    anim = null;
  }

  function tick(now) {
    rafId = 0;
    if (!anim) {
      Hex2.drawStatic();
      return;
    }
    const t = Math.min(1, (now - anim.start) / anim.dur);
    renderAnim(anim, t);
    if (t < 1) {
      ensureLoop();
      return;
    }
    const done = anim;
    anim = null;
    if (done.type === "slide") {
      startPop(done.mergedDests, done.spawnKey);   // chain into the wobble
      return;
    }
    Hex2.drawStatic();
  }

  function startSlide(movers, mergedDests, spawnKey) {
    anim = {
      type: "slide",
      start: performance.now(),
      dur: SLIDE_MS,
      movers: movers,
      mergedDests: mergedDests,
      spawnKey: spawnKey,
    };
    ensureLoop();
  }

  function startPop(mergedDests, spawnKey) {
    let grow = new Set();
    if (spawnKey) {
      grow = new Set([spawnKey]);
    }
    anim = {
      type: "pop",
      start: performance.now(),
      dur: POP_MS,
      punch: new Set(mergedDests),
      grow: grow,
    };
    ensureLoop();
  }

  function startBlocked(dir) {
    anim = {
      type: "blocked",
      start: performance.now(),
      dur: BLOCK_MS,
      dir: dir,
    };
    ensureLoop();
  }

  // ---------------------------- the frames ----------------------------
  function renderSlide(a, t) {
    const layout = Hex2.getLayout();
    const e = easeOutBack(t, SLIDE_OVERSHOOT);
    const spd = Math.max(0, 1 - t);
    Hex2.drawBoardBase(0, 0);
    for (const m of a.movers) {
      const p0 = Hex2.posOf(m.fromKey);
      const p1 = Hex2.posOf(m.toKey);
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const st = SLIDE_SMEAR * spd;      // smear along the travel axis
      const sx = 1 + st * (Math.abs(ux) - Math.abs(uy));
      const sy = 1 + st * (Math.abs(uy) - Math.abs(ux));
      drawTile(
        p0.x + dx * e,
        p0.y + dy * e,
        layout.size,
        m.value,
        sx,
        sy
      );
    }
    Hex2.endFrame();
  }

  function renderPop(a, t) {
    const layout = Hex2.getLayout();
    const w = damped(t, WOBBLE_FREQ, WOBBLE_DECAY);
    const w2 = damped(t, WOBBLE_FREQ * WOBBLE_2ND_FREQ, WOBBLE_DECAY);
    Hex2.drawBoardBase(0, 0);
    for (const entry of Hex2.getBoard()) {
      const key = entry[0];
      const p = Hex2.posOf(key);
      let sx = 1;
      let sy = 1;
      let rot = 0;
      if (a.punch.has(key)) {
        sx = 1 + PUNCH_X * w;
        sy = 1 - PUNCH_Y * w;
        rot = PUNCH_ROT * w2;
      } else if (a.grow.has(key)) {
        const gt = Math.min(1, t * a.dur / GROW_MS);
        const o = easeOutBack(gt, GROW_OVERSHOOT);
        sx = o * (1 + GROW_X * w);
        sy = o * (1 - GROW_Y * w);
        rot = GROW_ROT * w2;
      }
      drawTile(
        p.x,
        p.y,
        layout.size,
        entry[1].value,
        Math.max(0, sx),
        Math.max(0, sy),
        rot
      );
    }
    Hex2.endFrame();
  }

  // The whole board leans into the wall and springs back, so a dead swipe reads
  // as "nothing moved" rather than as a dropped input.
  function renderBlocked(a, t) {
    const layout = Hex2.getLayout();
    let v = DIR_VEC[a.dir];
    if (!v) {
      v = [0, 0];
    }
    const amp = layout.size * BLOCK_AMP;
    const k = damped(t, BLOCK_FREQ, BLOCK_DECAY);
    const ox = v[0] * amp * k;
    const oy = v[1] * amp * k;
    const w = damped(t, BLOCK_WOBBLE_FREQ, BLOCK_WOBBLE_DECAY);
    const sx = 1 + BLOCK_SQUASH * w;
    const sy = 1 - BLOCK_SQUASH * w;
    const rot = BLOCK_ROT * w;
    Hex2.drawBoardBase(ox, oy);
    for (const entry of Hex2.getBoard()) {
      const p = Hex2.posOf(entry[0]);
      drawTile(
        p.x + ox,
        p.y + oy,
        layout.size,
        entry[1].value,
        sx,
        sy,
        rot
      );
    }
    Hex2.endFrame();
  }

  function renderAnim(a, t) {
    if (a.type === "slide") {
      renderSlide(a, t);
      return;
    }
    if (a.type === "pop") {
      renderPop(a, t);
      return;
    }
    renderBlocked(a, t);
  }

  // ---------------------------- move driver ---------------------------
  function move(dir) {
    if (Hex2.isOver()) {
      return;
    }
    const res = Hex2.applyMove(dir);
    settleAnim();               // snap whatever is wobbling back to rest
    if (!res.moved) {           // swiped into a wall
      startBlocked(dir);
      return;
    }

    Hex2.commit(res);
    const spawnKey = Hex2.spawn();   // spawn up front, so an interrupting
    Hex2.save();                     // swipe cannot lose the new tile
    startSlide(res.movers, res.mergedDests, spawnKey);
    Hex2.settle(res.mergedDests);
  }

  Hex2.boot({
    saveKey: SAVE_KEY,
    drawTile: drawTile,
    move: move,
    onUndo: settleAnim,
    onReset: settleAnim,
  });
})();
