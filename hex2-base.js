// Hex 2^ - normal mode.
//
// A short slide followed by a small pop, with input locked for the whole
// sequence. The board is committed up front but the animation owns the spawn,
// so the new tile only appears once everything has come to rest.

(function () {
  "use strict";

  const SAVE_KEY = "hex2.base.save";
  const SLIDE_MS = 110;
  const POP_MS = 90;
  const POP_SWELL = 0.16;

  let busy = false;          // input lock while an animation is playing

  function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function drawTile(cx, cy, size, value, scale) {
    let s = size * Hex2.TILE.radiusFrac;
    if (scale) {
      s = s * scale;
    }
    const ctx = Hex2.getCtx();
    const colours = Hex2.tileColours(value);
    Hex2.hexPath(cx, cy, s);
    ctx.fillStyle = colours.fill;
    ctx.fill();
    ctx.lineWidth = Math.max(1, size * Hex2.TILE.strokeFrac);
    ctx.strokeStyle = Hex2.TILE.strokeColour;
    ctx.stroke();

    const fs = Hex2.tileFontSize(value, size);
    ctx.fillStyle = colours.text;
    ctx.font = "800 " + fs + "px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(value), cx, cy + fs * Hex2.TILE.textNudgeFrac);
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

  function move(dir) {
    if (busy || Hex2.isOver()) {
      return;
    }
    const res = Hex2.applyMove(dir);
    if (!res.moved) {
      return;
    }

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
    },
  });
})();
