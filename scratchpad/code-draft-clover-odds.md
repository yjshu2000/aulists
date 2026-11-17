# Code draft: clover dial odds by ad length

Last updated: 2026-11-17 14:12

Written against the code *after* the golden → clover rename script (already run, uncommitted).

- Fake ad rolls whole seconds, 30–120.
- Ad length picks the dial's winning marks: 30–60s → {12} (1/12), 61–90s → {6, 12} (1/6), 91–120s → {4, 8, 12} (1/4).
- The landing hour is still a plain 1–12 roll; only which marks count as wins changes. No hint before it lands.

---

### Block 1: Replace [hex2-core.js lines 40-43](../hex2-core.js#L40-L43)

```js
  const FALSEDGE_KEY = "falsedge.data";
  // Lockout dial: 12-hour face, 1/12 odds for +2 grass.
  const GOLDEN_ODDS = 12;
  const CLOVER_SWEEP_MS = 1000;
```

With:

```js
  const FALSEDGE_KEY = "falsedge.data";
  // Lockout's clover dial: 12-hour face, +2 grass, every Nth mark wins.
  const CLOVER_MARKS = 12;
  const CLOVER_ODDS = [12, 6, 4];
  const CLOVER_SWEEP_MS = 1000;
```

---

### Block 2: Replace [hex2-core.js lines 65-68](../hex2-core.js#L65-L68)

```js
  const EARN_POP_MS = 380;
  const FAKE_AD_MIN_MS = 30 * 1000;
  const FAKE_AD_MAX_MS = 120 * 1000;
  const SWIPE_MIN = 22;      // px of travel before a drag counts as a swipe
```

With:

```js
  const EARN_POP_MS = 380;
  const FAKE_AD_MIN_S = 30;
  const FAKE_AD_MAX_S = 120;
  const SWIPE_MIN = 22;      // px of travel before a drag counts as a swipe
```

---

### Block 3: Replace [hex2-core.js lines 1460-1462](../hex2-core.js#L1460-L1462)

Header still said golden hour. (Line 1460's "absent on the standalone public build" comment looks like a stray copy of the one above `showLockout()`; left alone, flagging only.)

```js
  // absent on the standalone public build, which is never timed
  // ----------------------- golden hour pre-roll -----------------------
  const clvRing = document.getElementById("clv-ring");
```

With:

```js
  // absent on the standalone public build, which is never timed
  // ----------------------- clover dial pre-roll -----------------------
  const clvRing = document.getElementById("clv-ring");
```

---

### Block 4: Replace [hex2-core.js lines 1472-1474](../hex2-core.js#L1472-L1474)

```js
    }
    for (let h = 1; h <= GOLDEN_ODDS; h++) {
      const m = document.createElement("span");
```

With:

```js
    }
    for (let h = 1; h <= CLOVER_MARKS; h++) {
      const m = document.createElement("span");
```

---

### Block 5: Replace [hex2-core.js lines 1501-1504](../hex2-core.js#L1501-L1504)

`odds` comes in from `preRollClover` so the win check can use it.

```js
  // One lap to wind up, then a second that lights each mark as the hand
  // passes it. What it lights stays lit.
  function sweepClover(hour) {
    const marks = clvDial.querySelectorAll(".clv-mark");
```

With:

```js
  // One lap to wind up, then a second that lights each mark as the hand
  // passes it. What it lights stays lit.
  function sweepClover(hour, odds) {
    const marks = clvDial.querySelectorAll(".clv-mark");
```

---

### Block 6: Replace [hex2-core.js lines 1522-1524](../hex2-core.js#L1522-L1524)

`hour % odds === 0` means the hour is a multiple of odds: 12 → only 12; 6 → 6, 12; 4 → 4, 8, 12.

```js
      clvHand.style.transform = "rotate(" + end.toFixed(2) + "deg)";
      if (hour !== GOLDEN_ODDS) {
        marks[hour - 1].classList.add("lost");
```

With:

```js
      clvHand.style.transform = "rotate(" + end.toFixed(2) + "deg)";
      if (hour % odds !== 0) {
        marks[hour - 1].classList.add("lost");
```

---

### Block 7: Replace [hex2-core.js lines 1535-1549](../hex2-core.js#L1535-L1549)

New `cloverOdds()` above `preRollClover()`. It reads `fakeAdTotal`, which `showLockout()` sets (via `startFakeAd()`) just before calling `preRollClover()`.

```js
  }

  // Reset and roll the lockout dial animation
  function preRollClover() {
    clearClover();
    cloverPending = false;
    if (!clvRing) {
      return;
    }
    buildCloverDial();
    const face = CLOVER_FONTS[
      Math.floor(Math.random() * CLOVER_FONTS.length)];
    clvDial.style.setProperty("--clv-font", '"' + face + '"');
    sweepClover(1 + Math.floor(Math.random() * GOLDEN_ODDS));
  }
```

With:

```js
  }

  // 1-in-N win odds for this ad: 30-60s, 61-90s, 91-120s
  function cloverOdds() {
    const secs = fakeAdTotal / 1000;
    if (secs <= 60) {
      return CLOVER_ODDS[0];
    }
    if (secs <= 90) {
      return CLOVER_ODDS[1];
    }
    return CLOVER_ODDS[2];
  }

  // Reset and roll the lockout dial animation
  function preRollClover() {
    clearClover();
    cloverPending = false;
    if (!clvRing) {
      return;
    }
    buildCloverDial();
    const face = CLOVER_FONTS[
      Math.floor(Math.random() * CLOVER_FONTS.length)];
    clvDial.style.setProperty("--clv-font", '"' + face + '"');
    const hour = 1 + Math.floor(Math.random() * CLOVER_MARKS);
    sweepClover(hour, cloverOdds());
  }
```

---

### Block 8: Replace [hex2-core.js lines 1567-1570](../hex2-core.js#L1567-L1570)

Whole seconds now. `fakeAdTotal` stays in ms because the countdown maths (`Date.now()`) is in ms; it's just always a round number of seconds.

```js
    }
    const span = FAKE_AD_MAX_MS - FAKE_AD_MIN_MS;
    fakeAdTotal = FAKE_AD_MIN_MS + Math.floor(Math.random() * (span + 1));
    fakeAdReady = false;
```

With:

```js
    }
    const span = FAKE_AD_MAX_S - FAKE_AD_MIN_S;
    const secs = FAKE_AD_MIN_S + Math.floor(Math.random() * (span + 1));
    fakeAdTotal = secs * 1000;
    fakeAdReady = false;
```

---

### Block 9: changelog

increment: +0.0.1 (v2.26.2 → v2.26.3)

- Hex 2^: the fake ad lasts a whole number of seconds, 30–120 (stupid Claude made it RANDOM MILLISECONDS THE WHOLE TIME BEFORE. EUGH.)
- Longer fake ads give the lockout dial more winning marks: 30–60s wins on 12 (1/12), 61–90s on 6 and 12 (1/6), 91–120s on 4, 8 and 12 (1/4). No telling which until it lands.

---
