# [i44] New tile palette — code draft

`drawTile` is hoisted: `hex2-core.js` gains `paintTile()`, and all three mode files become thin wrappers around it. The palette and both gradient tiles are then written once instead of three times.

---

### Block 1: Remove [hex2-core.js line 18](../hex2-core.js#L18)

```js
  const MAX_HUE = 300;       // red(0) -> magenta(300), never wraps to red
```

---

### Block 2: Replace [hex2-core.js lines 408-412](../hex2-core.js#L408-L412)

```js
  function tileHue(value) {
    const e = Math.log2(value);            // 1 .. WIN_EXP, and beyond
    const f = Math.min(1, Math.max(0, (e - 1) / (WIN_EXP - 1)));
    return f * MAX_HUE;
  }
```

With:

```js
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
```

---

### Block 3: Replace [hex2-core.js lines 424-436](../hex2-core.js#L424-L436)

```js
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
```

With:

```js
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
```

---

### Block 4: Add at [hex2-core.js line 453](../hex2-core.js#L453)

Just prior:

```js
    if (len === 3) {
      return size * 0.56;
    }
    return size * 0.64;
  }

```

Added:

```js
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

```

Just after:

```js
  function drawEmpty(cx, cy, size) {
```

---

### Block 5: Replace [hex2-core.js line 1174](../hex2-core.js#L1174)

```js
    tileColours: tileColours,
```

With:

```js
    paintTile: paintTile,
```

---

### Block 6: Replace [hex2-base.js lines 26-40](../hex2-base.js#L26-L40)

```js
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
```

With:

```js
    Hex2.paintTile(cx, cy, s, size, value);
```

---

### Block 7: Replace [hex2-challenge.js lines 33-47](../hex2-challenge.js#L33-L47)

```js
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
```

With:

```js
    Hex2.paintTile(cx, cy, s, size, value);
```

---

### Block 8: Replace [hex2-jiggly.js lines 67-68](../hex2-jiggly.js#L67-L68)

```js
  // sx/sy squash the hex about its own centre; rot adds a gooey twist. The
  // number is drawn inside the same transform so it squishes too.
```

With:

```js
  // sx/sy squash the hex about its own centre; rot adds a gooey twist. The
  // whole tile (number, any gradients) will squish together
```

---

### Block 9: Remove [hex2-jiggly.js line 79](../hex2-jiggly.js#L79)

```js
    const colours = Hex2.tileColours(value);
```

---

### Block 10: Replace [hex2-jiggly.js lines 86-98](../hex2-jiggly.js#L86-L98)

```js
    Hex2.hexPath(0, 0, size * Hex2.TILE.radiusFrac);
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
    ctx.fillText(String(value), 0, fs * Hex2.TILE.textNudgeFrac);
```

With:

```js
    Hex2.paintTile(0, 0, size * Hex2.TILE.radiusFrac, size, value);
```
