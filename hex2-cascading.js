// Hex 2^ - cascading mode.
//
// Normal mode's slide-then-pop, repeated in the same direction until a pass
// moves nothing. Every pass is a whole swipe of its own - it animates and it
// spawns - but only the first one snapshots, so one gesture is one undo entry.
//
// The win announcement is held rather than fired per pass: a cascade can build
// 16384 three passes before it comes to rest, and an overlay opening over tiles
// that are still moving reads as a bug.

(function () {
  "use strict";

  const SAVE_KEY = "hex2.cascading.save";
  const SLIDE_MS = 110;
  const POP_MS = 90;
  const POP_SWELL = 0.16;

  let busy = false;          // input lock for the whole cascade, not one pass
  // the highest tile a pass built; announced once, at rest
  let wonTile = 0;

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

  // Tiles in flight are drawn from `movers`, not from the board, because the
  // board already holds the post-move arrangement.
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

  // The board has come to rest. This is the only place the cascade saves: one
  // real swipe is one save, matching the one undo entry it pushes. Game over
  // takes precedence over the win, the order settle() uses.
  function finish() {
    busy = false;
    Hex2.setBoardBusy(false);
    Hex2.save();
    Hex2.drawStatic();
    if (!Hex2.anyMovePossible()) {
      Hex2.endGame();
      return;
    }
    if (wonTile) {
      Hex2.announceWin(wonTile);
    }
  }

  // One pass of the cascade. It recurses from inside the pop callback, so the
  // chain rides requestAnimationFrame rather than growing the stack.
  function pass(dir, first) {
    const res = Hex2.applyMove(dir);
    if (!res.moved) {
      finish();
      return;
    }
    Hex2.commit(res, !first);
    const hit = Hex2.reachedWin(res.mergedDests);
    if (hit > wonTile) {
      wonTile = hit;
    }
    animateSlide(res.movers, function () {
      const spawnKey = Hex2.spawn();
      const popKeys = res.mergedDests.slice();
      if (spawnKey) {
        popKeys.push(spawnKey);
      }
      animatePop(popKeys, function () {
        pass(dir, false);
      });
    });
  }

  function move(dir) {
    if (busy || Hex2.isOver()) {
      return;
    }
    // A dead swipe is silent, exactly as in normal mode, so the lock is taken
    // only once something is actually going to happen.
    if (!Hex2.applyMove(dir).moved) {
      return;
    }
    busy = true;
    wonTile = 0;
    Hex2.setBoardBusy(true);
    pass(dir, true);
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
      wonTile = 0;
      Hex2.setBoardBusy(false);
    },
  });
})();
