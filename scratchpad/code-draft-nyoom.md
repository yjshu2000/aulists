# Code draft: dim toggle → nyoom toggle

Last updated: 2026-11-20 18:54

Written against the current files, including the uncommitted cascade-speed change (v2.27.2) already in `hex2-cascading.js` and `about.html`.

- Nyoom off (default, B2): every pass at the original 110 / 90.
- Nyoom on: the swipe at 80 / 80, every cascade pass after it at 50 / 50.
- Dim removed entirely (C1): CSS rule, `DIM_KEY`, toggle logic, and `setBoardBusy` (it existed only to drive the dim).
- Label states what it's doing: `Nyoom on` / `Nyoom off` (D).
- Saved as `hex2.nyoom`. The old `hex2.dim` value is just left in storage, unread.

---

### Block 1: Replace [hex2-core.js lines 70-72](../hex2-core.js#L70-L72)

```js
  const PADS_KEY = "hex2.pads";
  const DIM_KEY = "hex2.dim";
  const PAD_H = 60;          // slide-pad thickness, all of it grown outward
```

With:

```js
  const PADS_KEY = "hex2.pads";
  const NYOOM_KEY = "hex2.nyoom";
  const PAD_H = 60;          // slide-pad thickness, all of it grown outward
```

---

### Block 2: Replace [hex2-core.js lines 837-845](../hex2-core.js#L837-L845)

`setBoardBusy` goes (nothing reads `.board-busy` once the dim is gone); `isNyoom` takes its place. Read fresh each pass, so flipping the toggle mid-game applies from the next swipe without any handoff.

```js
  }

  // A mode whose one gesture runs several passes marks the board busy while it
  // plays out, so the stylesheet can pull it back and grey it over.
  function setBoardBusy(on) {
    canvas.parentElement.classList.toggle("board-busy", on);
  }

  // ---------------------------- undo, 2 deep --------------------------
```

With:

```js
  }

  // Cascading's speed toggle; the mode reads it once per pass
  function isNyoom() {
    return store.get(NYOOM_KEY) === "1";
  }

  // ---------------------------- undo, 2 deep --------------------------
```

---

### Block 3: Replace [hex2-core.js lines 1837-1843](../hex2-core.js#L1837-L1843)

```js
    // the dim only ever happens in Cascading, so its toggle is absent
    // everywhere else rather than sitting there inert
    let dimBtn = document.getElementById("dimtoggle");
    if (dimBtn && here !== "cascading") {
      dimBtn.remove();
      dimBtn = null;
    }
```

With:

```js
    // nyoom only ever does anything in Cascading, so its toggle is absent
    // everywhere else rather than sitting there inert
    let nyoomBtn = document.getElementById("nyoomtoggle");
    if (nyoomBtn && here !== "cascading") {
      nyoomBtn.remove();
      nyoomBtn = null;
    }
```

---

### Block 4: Replace [hex2-core.js lines 1920-1950](../hex2-core.js#L1920-L1950)

No local `dimOn` copy any more: `isNyoom()` is the one source, so the button and the mode can't disagree.

```js
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

    const exits = document.querySelectorAll(".navaway");
```

With:

```js
    applyPads();

    if (nyoomBtn) {
      // the label states what nyoom is doing, not what tapping will do
      const applyNyoom = function () {
        if (isNyoom()) {
          nyoomBtn.classList.remove("off");
          nyoomBtn.textContent = "Nyoom on";
          return;
        }
        nyoomBtn.classList.add("off");
        nyoomBtn.textContent = "Nyoom off";
      };

      nyoomBtn.addEventListener("click", function () {
        if (isNyoom()) {
          store.set(NYOOM_KEY, "0");
        } else {
          store.set(NYOOM_KEY, "1");
        }
        applyNyoom();
      });
      applyNyoom();
    }

    const exits = document.querySelectorAll(".navaway");
```

---

### Block 5: Replace [hex2-core.js lines 2031-2033](../hex2-core.js#L2031-L2033)

```js
    drawStatic: drawStatic,
    setBoardBusy: setBoardBusy,
    hexPath: hexPath,
```

With:

```js
    drawStatic: drawStatic,
    isNyoom: isNyoom,
    hexPath: hexPath,
```

---

### Block 6: Replace [hex2.html line 42](../hex2.html#L42)

Context lines 41 and 43 unchanged.

```html
  <div class="hearts" id="hearts"></div>
  <button class="hexbtn" id="dimtoggle">Dim off</button>
  <button class="hexbtn" id="undo" disabled>&#8630;&nbsp;Undo</button>
```

With:

```html
  <div class="hearts" id="hearts"></div>
  <button class="hexbtn" id="nyoomtoggle">Nyoom off</button>
  <button class="hexbtn" id="undo" disabled>&#8630;&nbsp;Undo</button>
```

---

### Block 7: Replace [style-hex2.css lines 142-156](../style-hex2.css#L142-L156)

Same look as before, just the new id.

```css
  }
  /* takes the slot the hearts box uses in Challenge; lit while the dim is on */
  #dimtoggle {
    margin-left: auto;
    border-color: var(--hex-accent);
    color: var(--hex-accent);
  }
  #dimtoggle + #undo {
    margin-left: 8px;
  }
  #dimtoggle.off {
    border-color: var(--hex-line);
    color: var(--hex-ink-dim);
  }
  /* A native <select>, so it takes the button's look by hand instead of
```

With:

```css
  }
  /* takes the slot the hearts box uses in Challenge; lit while nyoom is on */
  #nyoomtoggle {
    margin-left: auto;
    border-color: var(--hex-accent);
    color: var(--hex-accent);
  }
  #nyoomtoggle + #undo {
    margin-left: 8px;
  }
  #nyoomtoggle.off {
    border-color: var(--hex-line);
    color: var(--hex-ink-dim);
  }
  /* A native <select>, so it takes the button's look by hand instead of
```

---

### Block 8: Replace [style-hex2.css lines 193-201](../style-hex2.css#L193-L201)

The dim rule goes.

```css
  }
  /* The delay clears one pass, so an ordinary swipe ends before this shows.
     Instant on the way out - the snap back is what says input is yours. */
  .board-busy.dim canvas {
    transition: filter 140ms ease-out 210ms;
    filter: grayscale(0.45) brightness(0.64);
  }

  /* ------------------------------- slide pads --------------------------- */
```

With:

```css
  }

  /* ------------------------------- slide pads --------------------------- */
```

---

### Block 9: Replace [hex2-cascading.js lines 14-20](../hex2-cascading.js#L14-L20)

```js
  const SAVE_KEY = "hex2.cascading.save";
  const SLIDE_MS = 80;
  const POP_MS = 80;
  // cascades run faster than initial swipe
  const CASCADE_SLIDE_MS = 50;
  const CASCADE_POP_MS = 50;
  const POP_SWELL = 0.16;
```

With:

```js
  const SAVE_KEY = "hex2.cascading.save";
  const SLIDE_MS = 110;
  const POP_MS = 90;
  // nyoom: cascades run faster than initial swipe
  const NYOOM_SLIDE_MS = 80;
  const NYOOM_POP_MS = 80;
  const NYOOM_CASCADE_SLIDE_MS = 50;
  const NYOOM_CASCADE_POP_MS = 50;
  const POP_SWELL = 0.16;
```

---

### Block 10: Replace [hex2-cascading.js lines 93-95](../hex2-cascading.js#L93-L95)

```js
    busy = false;
    Hex2.setBoardBusy(false);
    Hex2.save();
```

With:

```js
    busy = false;
    Hex2.save();
```

---

### Block 11: Replace [hex2-cascading.js lines 118-125](../hex2-cascading.js#L118-L125)

```js
    }
    let slideMs = SLIDE_MS;
    let popMs = POP_MS;
    if (!first) {
      slideMs = CASCADE_SLIDE_MS;
      popMs = CASCADE_POP_MS;
    }
    animateSlide(res.movers, slideMs, function () {
```

With:

```js
    }
    let slideMs = SLIDE_MS;
    let popMs = POP_MS;
    if (Hex2.isNyoom()) {
      slideMs = NYOOM_SLIDE_MS;
      popMs = NYOOM_POP_MS;
      if (!first) {
        slideMs = NYOOM_CASCADE_SLIDE_MS;
        popMs = NYOOM_CASCADE_POP_MS;
      }
    }
    animateSlide(res.movers, slideMs, function () {
```

---

### Block 12: Replace [hex2-cascading.js lines 147-149](../hex2-cascading.js#L147-L149)

```js
    wonTile = 0;
    Hex2.setBoardBusy(true);
    pass(dir, true);
```

With:

```js
    wonTile = 0;
    pass(dir, true);
```

---

### Block 13: Replace [hex2-cascading.js lines 161-163](../hex2-cascading.js#L161-L163)

```js
      wonTile = 0;
      Hex2.setBoardBusy(false);
    },
```

With:

```js
      wonTile = 0;
    },
```

---

### Block 14: changelog

Replaces the uncommitted v2.27.2 entry already in `about.html` (same version, since neither has shipped).

increment: +0.0.1 (v2.27.1 → v2.27.2)

- Hex 2^ cascading: the Dim toggle is now a Nyoom toggle, off by default.
  - Nyoom off: every pass at the original pace (110 ms slide, 90 ms pop).
  - Nyoom on: the swipe at 80 / 80, then every cascade pass after it at 50 / 50.

---
