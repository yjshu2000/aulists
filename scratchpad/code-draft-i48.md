# [i48] Golden hour pre-roll — code draft

last updated: 2026-09-15 03:09

The odds and the key do not change. What changes is that the roll becomes visible on the lockout **before** you decide whether to leave.

- A clock dial appears on the lockout, 24 marks, 24 at the top.
- A hand winds up for one lap, then paints each mark as it passes on the second. What it paints stays painted.
- It lands on a mark. **24 wins** — so the 1-in-24 is the dial itself.
- On a win the `Go to Falsedge` button glows gold. The win is a pending flag, not a write: tapping that button claims it, tapping the × throws it away.
- Nothing appears at all while an hour is running or inside its 1h cooldown.
- The numeral font is drawn at random from 36 faces on every lockout.
- The top-of-page `← Go to Falsedge ←` link keeps rolling silently on click, exactly as today.

Settled in the preview: Sweep, single ring, Arabic numerals, diameter 300, gap 40, numerals 16, slow-down 25, speed 100.

---

### Block 1: Add at [hex2.html line 10](../hex2.html#L10)

Just prior:

```html
<link rel="manifest" href="manifest.json">
```

Added:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Archivo+Black&family=Audiowide&family=Bodoni+Moda:wght@500;700&family=Bruno+Ace+SC&family=Cinzel+Decorative:wght@400;700&family=Della+Respira&family=Eagle+Lake&family=Gloock&family=Iceberg&family=Kings&family=Limelight&family=Marcellus&family=MedievalSharp&family=Metamorphous&family=Modern+Antiqua&family=Orbitron:wght@500;700&family=Philosopher:wght@400;700&family=Pinyon+Script&family=Prata&family=Rampart+One&family=Ribeye&family=Rozha+One&family=Rye&family=Share+Tech+Mono&family=Silkscreen&family=Special+Elite&family=Syncopate:wght@400;700&family=Tenor+Sans&family=Tourney:wght@500;700&family=Trade+Winds&family=Uncial+Antiqua&family=UnifrakturMaguntia&family=Vast+Shadow&family=Yeseva+One&family=Zen+Dots&display=swap" rel="stylesheet">
```

Just after:

```html
<meta name="theme-color" content="#12141a">
```

---

### Block 2: Replace [hex2.html lines 72-75](../hex2.html#L72-L75)

```html
  <div class="lockout-card">
    <a class="hexbtn navaway" href="index.html">Go to Falsedge</a>
    <a class="hexbtn navaway" href="aulists.html">Go to Aulists</a>
  </div>
```

With — the dial goes in ahead of the card so it sits behind it, and the Falsedge link gains an id, since it is the only one that can claim a win:

```html
  <div class="gh-ring" id="gh-ring">
    <div class="gh-face"></div>
    <div class="gh-dial" id="gh-dial"></div>
    <div class="gh-hand" id="gh-hand"></div>
    <div class="gh-hub"></div>
  </div>
  <div class="lockout-card">
    <a class="hexbtn navaway" id="go-falsedge" href="index.html">Go to Falsedge</a>
    <a class="hexbtn navaway" href="aulists.html">Go to Aulists</a>
  </div>
```

---

### Block 3: Add at [style-hex2.css line 12](../style-hex2.css#L12)

Just prior:

```css
    --hex-accent: #3cc3e2;
```

Added — Falsedge's `--c-yellow`, so the win wears the colour the golden hour already wears on the other page:

```css
    --gold: #ecc652;
```

Just after:

```css
  }
```

---

### Block 4: Replace [style-hex2.css lines 456-458](../style-hex2.css#L456-L458)

```css
  .lockout.peek .fake-ad,
  .lockout.peek .earn,
  .lockout.peek .lockout-card .hexbtn {
```

With — the dial belongs to the lockout, so peek fades it with everything else:

```css
  .lockout.peek .fake-ad,
  .lockout.peek .earn,
  .lockout.peek .gh-ring,
  .lockout.peek .lockout-card .hexbtn {
```

---

### Block 5: Add at [style-hex2.css line 546](../style-hex2.css#L546)

Just prior:

```css
  @keyframes earnpop {
    0% { transform: scale(1); }
    35% { transform: scale(1.45); }
    100% { transform: scale(1); }
  }
```

Added:

```css
  /* ---------------------------- golden hour ----------------------------- */
  .gh-ring {
    --gh-d: 300px;
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
    border: 1px solid color-mix(in srgb, var(--gold) 20%, transparent);
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
    color: color-mix(in srgb, var(--gold) 26%, transparent);
    transform:
      rotate(var(--a))
      translateY(-130px)
      rotate(calc(var(--a) * -1));
  }
  .gh-mark.lit {
    color: var(--gold);
    text-shadow: 0 0 12px color-mix(in srgb, var(--gold) 70%, transparent);
  }
  /* landed on 24 */
  .gh-mark.won {
    color: #fff6d8;
    text-shadow:
      0 0 6px var(--gold),
      0 0 22px color-mix(in srgb, var(--gold) 90%, transparent);
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
      color-mix(in srgb, var(--gold) 10%, transparent),
      var(--gold));
  }
  .gh-hub {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 7px;
    height: 7px;
    margin: -3.5px;
    border-radius: 50%;
    background: var(--gold);
  }
  .lockout-card .hexbtn.gh-won {
    border-color: var(--gold);
    color: #fff6d8;
    box-shadow:
      inset 0 0 22px -2px color-mix(in srgb, var(--gold) 80%, transparent),
      0 0 46px 6px color-mix(in srgb, var(--gold) 55%, transparent);
    transition:
      box-shadow 280ms ease-out,
      border-color 280ms ease-out,
      color 280ms ease-out;
  }
```

Just after:

```css
  /* ---------------------------------- footer ---------------------------- */
```

---

### Block 6: Add at [hex2-core.js line 36](../hex2-core.js#L36)

Just prior:

```js
  const GOLDEN_ODDS = 24;
```

Added:

```js
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

Just after:

```js
  const UNDO_DEPTH = 6;
```

---

### Block 7: Replace [hex2-core.js lines 1423-1433](../hex2-core.js#L1423-L1433)

```js
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
```

With:

```js
  // ----------------------- golden hour pre-roll -----------------------
  const ghRing = document.getElementById("gh-ring");
  const ghDial = document.getElementById("gh-dial");
  const ghHand = document.getElementById("gh-hand");
  let goldenPending = false;
  let ghRaf = 0;

  // an hour running, or still inside the invisible hour after it ended
  function goldenBlocked() {
    const raw = store.get(GOLDEN_KEY);
    let end = 0;
    if (raw) {
      end = new Date(raw).getTime();
      if (isNaN(end)) {
        end = 0;
      }
    }
    return Date.now() < end + GOLDEN_MS;
  }

  // 24 marks, 15 degrees apart, 24 at the top
  function buildGoldenDial() {
    if (!ghDial || ghDial.childElementCount) {
      return;
    }
    for (let h = 1; h <= GOLDEN_ODDS; h++) {
      const m = document.createElement("span");
      m.className = "gh-mark";
      m.style.setProperty("--a", (h * 15) + "deg");
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
    ghRing.classList.remove("show");
    ghDial.querySelectorAll(".gh-mark").forEach(function (m) {
      m.classList.remove("lit", "won", "lost");
    });
    const claim = document.getElementById("go-falsedge");
    if (claim) {
      claim.classList.remove("gh-won");
    }
  }

  // One lap to wind up, then a second that lights each mark as the hand
  // passes it. What it lights stays lit.
  function sweepGolden(hour) {
    const marks = ghDial.querySelectorAll(".gh-mark");
    const end = 360 + hour * 15;
    const start = performance.now();
    ghRing.classList.add("show");
    function frame(now) {
      const t = Math.min(1, (now - start) / GOLDEN_SWEEP_MS);
      const a = end * goldenEase(t);
      ghHand.style.transform = "rotate(" + a.toFixed(2) + "deg)";
      marks.forEach(function (m, i) {
        m.classList.toggle("lit", a >= 360 + (i + 1) * 15);
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
      goldenPending = true;
      const claim = document.getElementById("go-falsedge");
      if (claim) {
        claim.classList.add("gh-won");
      }
    }
    ghRaf = requestAnimationFrame(frame);
  }

  // Lockout looks normal while an hour is running or cooling down
  function preRollGolden() {
    clearGolden();
    goldenPending = false;
    if (!ghRing || goldenBlocked()) {
      return;
    }
    buildGoldenDial();
    const face = GOLDEN_FONTS[
      Math.floor(Math.random() * GOLDEN_FONTS.length)];
    ghDial.style.setProperty("--gh-font", '"' + face + '"');
    sweepGolden(1 + Math.floor(Math.random() * GOLDEN_ODDS));
  }

  // Cashes an unclaimed win. Only the lockout's Go to Falsedge does this.
  function claimGolden() {
    if (!goldenPending) {
      return;
    }
    goldenPending = false;
    store.set(GOLDEN_KEY, new Date(Date.now() + GOLDEN_MS).toISOString());
  }

  // absent on the standalone public build, which is never timed
  function showLockout() {
    if (!lockout) {
      return;
    }
    if (earnNum) {
      earnNum.textContent = "+1";
    }
    lockout.classList.add("show");
    startFakeAd();
    preRollGolden();
  }
```

---

### Block 8: Replace [hex2-core.js lines 1497-1498](../hex2-core.js#L1497-L1498)

```js
    }
    payGrass();
```

With:

```js
    }
    // staying in the game throws an unclaimed golden hour away
    goldenPending = false;
    clearGolden();
    payGrass();
```

---

### Block 9: Replace [hex2-core.js lines 1712-1737](../hex2-core.js#L1712-L1737)

```js
    function rollGolden() {
      const raw = store.get(GOLDEN_KEY);
      let end = 0;
      if (raw) {
        end = new Date(raw).getTime();
        if (isNaN(end)) {
          end = 0;
        }
      }
      if (Date.now() < end + GOLDEN_MS) {
        return;
      }
      if (Math.floor(Math.random() * GOLDEN_ODDS) !== 0) {
        return;
      }
      store.set(GOLDEN_KEY,
        new Date(Date.now() + GOLDEN_MS).toISOString());
    }

    const exits = document.querySelectorAll(".navaway");
    for (const link of exits) {
      link.addEventListener("click", function () {
        store.set(BREAK_KEY, "0");
        rollGolden();
      });
    }
```

With — the top-of-page link still rolls blind, because nothing is on screen to show it. The lockout's links do not roll: the pre-roll already happened, and Go to Falsedge cashes whatever it produced:

```js
    function rollGolden() {
      if (goldenBlocked()) {
        return;
      }
      if (Math.floor(Math.random() * GOLDEN_ODDS) !== 0) {
        return;
      }
      store.set(GOLDEN_KEY,
        new Date(Date.now() + GOLDEN_MS).toISOString());
    }

    const exits = document.querySelectorAll(".navaway");
    for (const link of exits) {
      link.addEventListener("click", function () {
        store.set(BREAK_KEY, "0");
        if (link.classList.contains("page-nav-top")) {
          rollGolden();
          return;
        }
        if (link.id === "go-falsedge") {
          claimGolden();
        }
      });
    }
```

---

### Block 10: changelog

increment: +0.1

- Added golden hour clock-roller: more gambling!
- Now the odds roll when the lockout appears, NOT on button press. Pre-rolled; discarded if exited via x. 
- Nothing appears while a golden hour is already running, or during the invisible hour after one ends.
- Clock numbers use a different font each time out of a preselected list of fonts.
- The `← Go to Falsedge ←` link at the top of the page still works the same.
- Also since chances are technically increased (more rolls happening) 0.2 reward changed to 0.1. 