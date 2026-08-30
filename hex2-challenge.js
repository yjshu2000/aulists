// Hex 2^ - challenge mode.
//
// Normal mode's slide-then-pop, plus the jostle: a swipe that moves nothing
// shakes the board, flashes white, and scatters every tile.

(function () {
  "use strict";

  const SAVE_KEY = "hex2.challenge.save";
  const SLIDE_MS = 110;
  const POP_MS = 90;
  const POP_SWELL = 0.16;

  const JOLT_MS = 250;
  const JOLT_AMP = 0.34;        // of a tile radius, at the first hit
  const JOLT_KICK = 0.28;       // the counter-swing, as a share of the hit
  const FLASH_MS = 1000;        // outlives the shake; input stays locked
  const FLASH_HOLD = 0.25;      // share of FLASH_MS held at full white
  const FLASH_ALPHA = 0.5;

  let busy = false;          // input lock while an animation is playing
  let armed = true;          // a jostle disarms until the next live swipe

  function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function drawTile(cx, cy, size, value, scale) {
    let s = size * Hex2.TILE.radiusFrac;
    if (scale) {
      s = s * scale;
    }
    Hex2.paintTile(cx, cy, s, size, value);
  }

  function animateSlide(movers, then) {
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / SLIDE_MS);
      const e = easeOut(t);
      const layout = Hex2.getLayout();
      Hex2.drawBoardBase(0, 0);
      for (const m of movers) {
        const a = Hex2.posOf(m.fromKey);
        const b = Hex2.posOf(m.toKey);
        const x = a.x + (b.x - a.x) * e;
        const y = a.y + (b.y - a.y) * e;
        drawTile(x, y, layout.size, m.value, 1);
      }
      Hex2.endFrame();
      if (t < 1) {
        requestAnimationFrame(frame);
        return;
      }
      then();
    }
    requestAnimationFrame(frame);
  }

  function animatePop(popKeys, then) {
    const popping = new Set(popKeys);
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / POP_MS);
      const layout = Hex2.getLayout();
      Hex2.drawBoardBase(0, 0);
      for (const entry of Hex2.getBoard()) {
        const p = Hex2.posOf(entry[0]);
        let scale = 1;
        if (popping.has(entry[0])) {
          scale = 1 + Math.sin(t * Math.PI) * POP_SWELL;
        }
        drawTile(p.x, p.y, layout.size, entry[1].value, scale);
      }
      Hex2.endFrame();
      if (t < 1) {
        requestAnimationFrame(frame);
        return;
      }
      then();
    }
    requestAnimationFrame(frame);
  }

  // one sine lobe, then its tail inverted and scaled down
  function joltOffset(t) {
    if (t < 0.4) {
      return Math.sin((t / 0.4) * Math.PI);
    }
    const u = (t - 0.4) / 0.6;
    return -Math.sin(u * Math.PI) * JOLT_KICK;
  }

  // The board is already shuffled by the time this runs; the flash and shake
  // are cosmetic, so an interrupting swipe can cut them off safely.
  function flashAlpha(t) {
    if (t <= FLASH_HOLD) {
      return FLASH_ALPHA;
    }
    return FLASH_ALPHA * (1 - (t - FLASH_HOLD) / (1 - FLASH_HOLD));
  }

  // separate clocks: the board settles in JOLT_MS, the white lasts FLASH_MS
  function animateJolt(then) {
    const start = performance.now();
    const angle = Math.random() * Math.PI * 2;
    function frame(now) {
      const el = now - start;
      const jt = Math.min(1, el / JOLT_MS);
      const ft = Math.min(1, el / FLASH_MS);
      const layout = Hex2.getLayout();
      const amp = layout.size * JOLT_AMP * joltOffset(jt);
      const ox = Math.cos(angle) * amp;
      const oy = Math.sin(angle) * amp;
      Hex2.drawBoardBase(ox, oy);
      for (const entry of Hex2.getBoard()) {
        const p = Hex2.posOf(entry[0]);
        drawTile(p.x + ox, p.y + oy, layout.size, entry[1].value, 1);
      }
      const ctx = Hex2.getCtx();
      ctx.fillStyle = "rgba(255,255,255," + flashAlpha(ft).toFixed(3) + ")";
      ctx.fillRect(0, 0, layout.cssW, layout.cssH);
      Hex2.endFrame();
      if (ft < 1) {
        requestAnimationFrame(frame);
        return;
      }
      then();
    }
    requestAnimationFrame(frame);
  }

  function jostle() {
    busy = true;
    armed = false;
    Hex2.snapshot();
    Hex2.shuffleBoard();
    Hex2.save();
    animateJolt(function () {
      busy = false;
      Hex2.drawStatic();
      // a shuffle can scramble a live board into a dead one
      if (!Hex2.anyMovePossible()) {
        Hex2.endGame();
      }
    });
  }

  function move(dir) {
    if (busy || Hex2.isOver()) {
      return;
    }
    const res = Hex2.applyMove(dir);
    if (!res.moved) {
      if (armed) {
        jostle();
      }
      return;
    }
    armed = true;

    busy = true;
    Hex2.commit(res);

    animateSlide(res.movers, function () {
      const spawnKey = Hex2.spawn();
      const popKeys = res.mergedDests.slice();
      if (spawnKey) {
        popKeys.push(spawnKey);
      }
      Hex2.save();
      animatePop(popKeys, function () {
        busy = false;
        Hex2.drawStatic();
        Hex2.settle(res.mergedDests);
      });
    });
  }

  Hex2.boot({
    saveKey: SAVE_KEY,
    drawTile: drawTile,
    move: move,
    canUndo() {
      return !busy;
    },
    onReset() {
      busy = false;
      armed = true;
    },
  });
})();
