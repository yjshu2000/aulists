# Hex 2^ ad lockout persistence & jackplock rename — code draft

Last updated: 2026-09-30 11:46

Covers two things touching the same code, merged into one draft since they'd otherwise step on each other's line numbers:

1. **Ad lockout persistence.** Persists only the ad lockout screen itself (not the 30s break countdown before it) across page reloads and direct URL visits — reloading always grants a fresh 30s break unless the ad is already up, in which case it stays up. Enforces the break timer on any entry when Falsedge data exists, ensures launching from Falsedge's "Go to Hex 2^" button always starts a fresh break, and pauses/resets the ad timer on desktop window blur.
2. **Jackplock rename.** Renames every "golden"/`gh-` identifier left over from the removed golden-hour feature to "jackplock", since the mechanic (spin the 12-hour dial, land on 12 for +2 grass) has nothing to do with gold anymore — `code-draft-combo.md` recoloured it green and dropped the "golden hour" name at the feature level, but never touched these internal identifiers. Pure rename, no behaviour change. Touches `hex2.html`, `hex2-core.js`, and `style-hex2.css`. Two-letter shorthand for DOM ids/CSS classes is `pl-`, not `jp-` (reads too much like a country code).

Summary of changes:

1. `index.html`: Clears `hex2.ad.active` on `#hexLink` click so launching from Falsedge always wipes any prior ad lockout and starts a fresh 30s.
2. `hex2.html`: Renames the `gh-ring`/`gh-dial`/`gh-hand` markup to `pl-ring`/`pl-dial`/`pl-hand`.
3. `hex2-core.js`: Adds `AD_KEY` ("hex2.ad.active"), `FALSEDGE_KEY` ("falsedge.data"), `store.remove()`. Renames `GOLDEN_*` constants to `JACKPLOCK_*`.
4. `hex2-core.js`: `showLockout` sets `AD_KEY` to `"1"`.
5. `hex2-core.js`: `closeFakeAd` removes `AD_KEY` when the fake ad is sat through and completed.
6. `hex2-core.js`: `startBreakTimer` gates break timing on `FALSEDGE_KEY`, restores the ad lockout immediately if `AD_KEY` is active, and always arms a fresh 30s timer otherwise.
7. `hex2-core.js`: Adds `window` `blur` and `focus` listeners alongside `visibilitychange` so clicking off-window on desktop also pauses/resets the ad timer.
8. `hex2-core.js`: Renames `ghRing`/`ghDial`/`ghHand`/`ghRaf`/`goldenPending` and every `golden*`/`Golden*` function to their `jackplock` equivalents (`plRing`/`plDial`/`plHand`/`plRaf` for DOM refs, `jackplockPending`/`buildJackplockDial`/`jackplockEase`/`clearJackplock`/`sweepJackplock`/`preRollJackplock` for the rest).
9. `style-hex2.css`: Renames `.gh-*` classes and `--gh-*` vars to `.pl-*`/`--pl-*`.

---

### Block 1: Replace [index.html lines 32-35](../index.html#L32-L35)

```html
  try {
    localStorage.setItem("hex2.break.start", String(Date.now()));
  } catch (e) {
```

With:

```html
  try {
    localStorage.setItem("hex2.break.start", String(Date.now()));
    localStorage.removeItem("hex2.ad.active");
  } catch (e) {
```

---

### Block 2: Replace [hex2.html lines 75-79](../hex2.html#L75-L79)

```html
  <div class="gh-ring" id="gh-ring">
    <div class="gh-face"></div>
    <div class="gh-dial" id="gh-dial"></div>
    <div class="gh-hand" id="gh-hand"></div>
    <div class="gh-hub"></div>
```

With:

```html
  <div class="pl-ring" id="pl-ring">
    <div class="pl-face"></div>
    <div class="pl-dial" id="pl-dial"></div>
    <div class="pl-hand" id="pl-hand"></div>
    <div class="pl-hub"></div>
```

---

### Block 3: Replace [hex2-core.js lines 28-44](../hex2-core.js#L28-L44)

```js
  const BREAK_KEY = "hex2.break.start";
  const GRASS_KEY = "grass.count";
  // Lockout dial: 12-hour face, 1/12 odds for +2 grass.
  const GOLDEN_ODDS = 12;
  const GOLDEN_SWEEP_MS = 1000;
  // linear ramp down for no stupid slowness grrr
  const GOLDEN_RAMP = 0.25;
  // random fonts wheee
  const GOLDEN_FONTS = [
    "Marcellus", "Cinzel Decorative", "Bodoni Moda", "Eagle Lake",
    "Uncial Antiqua", "MedievalSharp", "UnifrakturMaguntia", "Orbitron",
    "Audiowide", "Rye", "Silkscreen", "Della Respira", "Metamorphous",
    "Pinyon Script", "Iceberg", "Prata", "Abril Fatface", "Yeseva One",
    "Limelight", "Philosopher", "Special Elite", "Share Tech Mono",
    "Syncopate", "Gloock", "Rozha One", "Modern Antiqua", "Archivo Black",
    "Rampart One", "Bruno Ace SC", "Tourney", "Tenor Sans", "Kings",
    "Trade Winds", "Vast Shadow", "Zen Dots", "Ribeye"
  ];
```

With:

```js
  const BREAK_KEY = "hex2.break.start";
  const AD_KEY = "hex2.ad.active";
  const FALSEDGE_KEY = "falsedge.data";
  const GRASS_KEY = "grass.count";
  // Lockout dial: 12-hour face, 1/12 odds for +2 grass.
  const JACKPLOCK_ODDS = 12;
  const JACKPLOCK_SWEEP_MS = 1000;
  // linear ramp down for no stupid slowness grrr
  const JACKPLOCK_RAMP = 0.25;
  // random fonts wheee
  const JACKPLOCK_FONTS = [
    "Marcellus", "Cinzel Decorative", "Bodoni Moda", "Eagle Lake",
    "Uncial Antiqua", "MedievalSharp", "UnifrakturMaguntia", "Orbitron",
    "Audiowide", "Rye", "Silkscreen", "Della Respira", "Metamorphous",
    "Pinyon Script", "Iceberg", "Prata", "Abril Fatface", "Yeseva One",
    "Limelight", "Philosopher", "Special Elite", "Share Tech Mono",
    "Syncopate", "Gloock", "Rozha One", "Modern Antiqua", "Archivo Black",
    "Rampart One", "Bruno Ace SC", "Tourney", "Tenor Sans", "Kings",
    "Trade Winds", "Vast Shadow", "Zen Dots", "Ribeye"
  ];
```

---

### Block 4: Add at [hex2-core.js line 94](../hex2-core.js#L94)

Just prior:

```js
    set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch (e) {
        // private mode or a full quota; the game just stops persisting
      }
    },
```

Added:

```js
    remove(k) {
      try {
        localStorage.removeItem(k);
      } catch (e) {}
    },
```

---

### Block 5: Replace [hex2-core.js lines 1433-1521](../hex2-core.js#L1433-L1521)

```js
  // ----------------------- golden hour pre-roll -----------------------
  const ghRing = document.getElementById("gh-ring");
  const ghDial = document.getElementById("gh-dial");
  const ghHand = document.getElementById("gh-hand");
  let goldenPending = false;
  let ghRaf = 0;

  // 12 marks, 30 degrees apart, 12 at the top
  function buildGoldenDial() {
    if (!ghDial || ghDial.childElementCount) {
      return;
    }
    for (let h = 1; h <= GOLDEN_ODDS; h++) {
      const m = document.createElement("span");
      m.className = "gh-mark";
      m.style.setProperty("--a", (h * 30) + "deg");
      m.textContent = String(h);
      ghDial.appendChild(m);
    }
  }

  // Decelerates, but never below GOLDEN_RAMP of its average speed.
  function goldenEase(t) {
    return (1 - GOLDEN_RAMP) * (1 - Math.pow(1 - t, 3)) + GOLDEN_RAMP * t;
  }

  function clearGolden() {
    if (ghRaf) {
      cancelAnimationFrame(ghRaf);
      ghRaf = 0;
    }
    if (!ghRing) {
      return;
    }
    ghRing.classList.remove("show", "won");
    ghDial.querySelectorAll(".gh-mark").forEach(function (m) {
      m.classList.remove("lit", "won", "lost");
    });
  }

  // One lap to wind up, then a second that lights each mark as the hand
  // passes it. What it lights stays lit.
  function sweepGolden(hour) {
    const marks = ghDial.querySelectorAll(".gh-mark");
    const end = 360 + hour * 30;
    const start = performance.now();
    ghRing.classList.add("show");
    function frame(now) {
      const t = Math.min(1, (now - start) / GOLDEN_SWEEP_MS);
      const a = end * goldenEase(t);
      ghHand.style.transform =
        "rotate(" + a.toFixed(2) + "deg)";
      marks.forEach(function (m, i) {
        m.classList.toggle(
          "lit", a >= 360 + (i + 1) * 30);
      });
      if (t < 1 && end - a >= 0.4) {
        ghRaf = requestAnimationFrame(frame);
        return;
      }
      ghRaf = 0;
      ghHand.style.transform = "rotate(" + end.toFixed(2) + "deg)";
      if (hour !== GOLDEN_ODDS) {
        marks[hour - 1].classList.add("lost");
        return;
      }
      marks[hour - 1].classList.add("won");
      ghRing.classList.add("won");
      goldenPending = true;
      if (earnNum) {
        earnNum.textContent = "+2";
      }
    }
    ghRaf = requestAnimationFrame(frame);
  }

  // Reset and roll the lockout dial animation
  function preRollGolden() {
    clearGolden();
    goldenPending = false;
    if (!ghRing) {
      return;
    }
    buildGoldenDial();
    const face = GOLDEN_FONTS[
      Math.floor(Math.random() * GOLDEN_FONTS.length)];
    ghDial.style.setProperty("--gh-font", '"' + face + '"');
    sweepGolden(1 + Math.floor(Math.random() * GOLDEN_ODDS));
  }
```

With:

```js
  // ----------------------- jackplock pre-roll -----------------------
  const plRing = document.getElementById("pl-ring");
  const plDial = document.getElementById("pl-dial");
  const plHand = document.getElementById("pl-hand");
  let jackplockPending = false;
  let plRaf = 0;

  // 12 marks, 30 degrees apart, 12 at the top
  function buildJackplockDial() {
    if (!plDial || plDial.childElementCount) {
      return;
    }
    for (let h = 1; h <= JACKPLOCK_ODDS; h++) {
      const m = document.createElement("span");
      m.className = "pl-mark";
      m.style.setProperty("--a", (h * 30) + "deg");
      m.textContent = String(h);
      plDial.appendChild(m);
    }
  }

  // Decelerates, but never below JACKPLOCK_RAMP of its average speed.
  function jackplockEase(t) {
    return (1 - JACKPLOCK_RAMP) * (1 - Math.pow(1 - t, 3)) +
      JACKPLOCK_RAMP * t;
  }

  function clearJackplock() {
    if (plRaf) {
      cancelAnimationFrame(plRaf);
      plRaf = 0;
    }
    if (!plRing) {
      return;
    }
    plRing.classList.remove("show", "won");
    plDial.querySelectorAll(".pl-mark").forEach(function (m) {
      m.classList.remove("lit", "won", "lost");
    });
  }

  // One lap to wind up, then a second that lights each mark as the hand
  // passes it. What it lights stays lit.
  function sweepJackplock(hour) {
    const marks = plDial.querySelectorAll(".pl-mark");
    const end = 360 + hour * 30;
    const start = performance.now();
    plRing.classList.add("show");
    function frame(now) {
      const t = Math.min(1, (now - start) / JACKPLOCK_SWEEP_MS);
      const a = end * jackplockEase(t);
      plHand.style.transform =
        "rotate(" + a.toFixed(2) + "deg)";
      marks.forEach(function (m, i) {
        m.classList.toggle(
          "lit", a >= 360 + (i + 1) * 30);
      });
      if (t < 1 && end - a >= 0.4) {
        plRaf = requestAnimationFrame(frame);
        return;
      }
      plRaf = 0;
      plHand.style.transform = "rotate(" + end.toFixed(2) + "deg)";
      if (hour !== JACKPLOCK_ODDS) {
        marks[hour - 1].classList.add("lost");
        return;
      }
      marks[hour - 1].classList.add("won");
      plRing.classList.add("won");
      jackplockPending = true;
      if (earnNum) {
        earnNum.textContent = "+2";
      }
    }
    plRaf = requestAnimationFrame(frame);
  }

  // Reset and roll the lockout dial animation
  function preRollJackplock() {
    clearJackplock();
    jackplockPending = false;
    if (!plRing) {
      return;
    }
    buildJackplockDial();
    const face = JACKPLOCK_FONTS[
      Math.floor(Math.random() * JACKPLOCK_FONTS.length)];
    plDial.style.setProperty("--pl-font", '"' + face + '"');
    sweepJackplock(1 + Math.floor(Math.random() * JACKPLOCK_ODDS));
  }
```

---

### Block 6: Replace [hex2-core.js lines 1531-1534](../hex2-core.js#L1531-L1534)

```js
    lockout.classList.add("show");
    startFakeAd();
    preRollGolden();
  }
```

With:

```js
    lockout.classList.add("show");
    store.set(AD_KEY, "1");
    startFakeAd();
    preRollJackplock();
  }
```

---

### Block 7: Replace [hex2-core.js line 1580](../hex2-core.js#L1580)

```js
    if (goldenPending) {
```

With:

```js
    if (jackplockPending) {
```

---

### Block 8: Replace [hex2-core.js lines 1603-1606](../hex2-core.js#L1603-L1606)

```js
    payGrass();
    goldenPending = false;
    clearGolden();
    // the pop plays over the lockout, so the break's 30s starts after it
```

With:

```js
    payGrass();
    store.remove(AD_KEY);
    jackplockPending = false;
    clearJackplock();
    // the pop plays over the lockout, so the break's 30s starts after it
```

---

### Block 9: Replace [hex2-core.js lines 1629-1640](../hex2-core.js#L1629-L1640)

```js
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
```

With:

```js
  let breakTimer = 0;

  function startBreakTimer() {
    const hasFalsedge = Boolean(store.get(FALSEDGE_KEY));
    if (!hasFalsedge) {
      return;
    }
    if (store.get(AD_KEY) === "1") {
      showLockout();
      return;
    }
    store.set(BREAK_KEY, String(Date.now()));
    if (breakTimer) {
      clearTimeout(breakTimer);
      breakTimer = 0;
    }
    breakTimer = setTimeout(showLockout, BREAK_MS);
  }
```

Every call to `startBreakTimer()` — page load/reload (`hex2-core.js:1862`) or the re-arm after an ad finishes (`hex2-core.js:1613`) — now always grants a fresh full `BREAK_MS` window, unless `AD_KEY` says the ad is already up, in which case it skips straight to `showLockout()`. `BREAK_KEY` is written for bookkeeping only and never read back for timing, so a reload can no longer resume a stale countdown.

---

### Block 10: Replace [hex2-core.js line 1823](../hex2-core.js#L1823)

```js
        goldenPending = false;
```

With:

```js
        jackplockPending = false;
```

---

### Block 11: Add at [hex2-core.js line 1891](../hex2-core.js#L1891)

Just prior:

```js
        restartFakeAd();
      });
    }
```

Added:

```js
      window.addEventListener("blur", function () {
        if (fakeAdReady || !lockout.classList.contains("show")) {
          return;
        }
        if (fakeAdRaf) {
          cancelAnimationFrame(fakeAdRaf);
          fakeAdRaf = 0;
        }
      });
      window.addEventListener("focus", function () {
        if (fakeAdReady || !lockout.classList.contains("show")) {
          return;
        }
        restartFakeAd();
      });
```

---

### Block 12: Replace [style-hex2.css lines 457-460](../style-hex2.css#L457-L460)

```css
  .lockout.peek .fake-ad,
  .lockout.peek .earn,
  .lockout.peek .gh-ring,
  .lockout.peek .lockout-card .hexbtn {
```

With:

```css
  .lockout.peek .fake-ad,
  .lockout.peek .earn,
  .lockout.peek .pl-ring,
  .lockout.peek .lockout-card .hexbtn {
```

---

### Block 13: Replace [style-hex2.css lines 549-646](../style-hex2.css#L549-L646)

```css
  /* ----------------------------- dial clock ----------------------------- */
  .gh-ring {
    --gh-d: 320px;
    position: absolute;
    left: 50%;
    top: 50%;
    width: var(--gh-d);
    height: var(--gh-d);
    margin-left: calc(var(--gh-d) / -2);
    margin-top: calc(var(--gh-d) / -2);
    display: none;
    /* never eats a tap: both lockout buttons are live from the first frame */
    pointer-events: none;
  }
  .gh-ring.show {
    display: block;
  }
  .gh-face {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--hex-green) 20%, transparent);
  }
  .gh-ring.won .gh-face {
    box-shadow:
      0 0 6px var(--hex-green),
      0 0 22px color-mix(in srgb, var(--hex-green) 90%, transparent);
  }
  .gh-dial {
    position: absolute;
    inset: 0;
  }
  /* Each mark is centred, pushed out along the radius by its own angle,
     then counter-rotated so the numeral stays upright */
  .gh-mark {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 2.4em;
    height: 2.4em;
    margin: -1.2em;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--gh-font), serif;
    font-size: 16px;
    font-weight: 600;
    line-height: 1;
    color: color-mix(in srgb, var(--hex-green) 26%, transparent);
    transform:
      rotate(var(--a))
      translateY(-140px)
      rotate(calc(var(--a) * -1));
  }
  .gh-mark.lit {
    color: var(--hex-green);
    text-shadow: 0 0 12px color-mix(in srgb, var(--hex-green) 70%, transparent);
  }
  /* landed on 12 */
  .gh-mark.won {
    color: #e8fced;
    text-shadow:
      0 0 6px var(--hex-green),
      0 0 22px color-mix(in srgb, var(--hex-green) 90%, transparent);
  }
  /* landed on anything else */
  .gh-mark.lost {
    color: var(--c-red, #f44b47);
    text-shadow:
      0 0 8px color-mix(in srgb, #f44b47 70%, transparent),
      0 0 20px color-mix(in srgb, #f44b47 45%, transparent);
  }
  .gh-hand {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 2px;
    height: 110px;
    margin-left: -1px;
    margin-top: -110px;
    transform-origin: 50% 100%;
    transform: rotate(0deg);
    border-radius: 2px;
    background: linear-gradient(
      to top,
      color-mix(in srgb, var(--hex-green) 10%, transparent),
      var(--hex-green));
  }
  .gh-hub {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 7px;
    height: 7px;
    margin: -3.5px;
    border-radius: 50%;
    background: var(--hex-green);
  }
```

With:

```css
  /* ----------------------------- dial clock ----------------------------- */
  .pl-ring {
    --pl-d: 320px;
    position: absolute;
    left: 50%;
    top: 50%;
    width: var(--pl-d);
    height: var(--pl-d);
    margin-left: calc(var(--pl-d) / -2);
    margin-top: calc(var(--pl-d) / -2);
    display: none;
    /* never eats a tap: both lockout buttons are live from the first frame */
    pointer-events: none;
  }
  .pl-ring.show {
    display: block;
  }
  .pl-face {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--hex-green) 20%, transparent);
  }
  .pl-ring.won .pl-face {
    box-shadow:
      0 0 6px var(--hex-green),
      0 0 22px color-mix(in srgb, var(--hex-green) 90%, transparent);
  }
  .pl-dial {
    position: absolute;
    inset: 0;
  }
  /* Each mark is centred, pushed out along the radius by its own angle,
     then counter-rotated so the numeral stays upright */
  .pl-mark {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 2.4em;
    height: 2.4em;
    margin: -1.2em;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--pl-font), serif;
    font-size: 16px;
    font-weight: 600;
    line-height: 1;
    color: color-mix(in srgb, var(--hex-green) 26%, transparent);
    transform:
      rotate(var(--a))
      translateY(-140px)
      rotate(calc(var(--a) * -1));
  }
  .pl-mark.lit {
    color: var(--hex-green);
    text-shadow: 0 0 12px color-mix(in srgb, var(--hex-green) 70%, transparent);
  }
  /* landed on 12 */
  .pl-mark.won {
    color: #e8fced;
    text-shadow:
      0 0 6px var(--hex-green),
      0 0 22px color-mix(in srgb, var(--hex-green) 90%, transparent);
  }
  /* landed on anything else */
  .pl-mark.lost {
    color: var(--c-red, #f44b47);
    text-shadow:
      0 0 8px color-mix(in srgb, #f44b47 70%, transparent),
      0 0 20px color-mix(in srgb, #f44b47 45%, transparent);
  }
  .pl-hand {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 2px;
    height: 110px;
    margin-left: -1px;
    margin-top: -110px;
    transform-origin: 50% 100%;
    transform: rotate(0deg);
    border-radius: 2px;
    background: linear-gradient(
      to top,
      color-mix(in srgb, var(--hex-green) 10%, transparent),
      var(--hex-green));
  }
  .pl-hub {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 7px;
    height: 7px;
    margin: -3.5px;
    border-radius: 50%;
    background: var(--hex-green);
  }
```

---

### Block 14: changelog

increment: +0.02

- Ad lockout screen now persists across reload/direct visit while the ad is actually showing; the 30s break before it always restarts fresh on reload, gated on Falsedge data existing.
- Launching "Go to Hex 2^" from Falsedge always clears any prior ad lockout.
- Fake ad countdown pauses on desktop window blur, resumes on focus.
- Renamed every "golden"/`gh-` identifier left over from the removed golden-hour feature to "jackplock" (`JACKPLOCK_ODDS`, `plRing`/`plDial`/`plHand`, `jackplockPending`, `buildJackplockDial`, `jackplockEase`, `clearJackplock`, `sweepJackplock`, `preRollJackplock`, `.pl-*` CSS classes, `--pl-d`/`--pl-font`) across `hex2.html`, `hex2-core.js`, and `style-hex2.css`.
