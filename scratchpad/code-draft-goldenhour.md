# Golden hour — code draft

Leaving Hex 2^ through either Falsedge link rolls a **1/8** chance of a golden hour. While one runs, **every task set pays 0.2 pts**. Setting a task at any other time pays nothing.

**One timestamp holds all three states.** `golden.end` is the only stored value, and the cooldown is derived from it rather than stored separately:

```
  now <  end            running
  end <= now < end + 1h  cooling down, cannot be rolled
  now >= end + 1h        rollable
```

It lives under its own localStorage key, outside `falsedge.data`, so the undo ring can never rewind a golden hour — or hand one back on redo. Same reasoning as `grass.count`.

**Hex rolls it, Falsedge only reads it.** The `.navaway` handler already writes on the way out, so the roll goes in beside it and Falsedge never has to work out where you came from.

## Open, decide while reading

1. **`(Sat)` needs its own day names.** The existing `DAY_ABBR` is two-letter caps — `SU MO TU WE TH FR SA` — used on the tier rows. Your copy says `(Sat)`, so this adds a second three-letter array. Say if the banner should use the existing `SA` style instead.
2. **Where the banner sits.** Put under the score boxes, beside the streak indicator, since it is the same kind of standing status line. Never specified.
3. **The 0.2 writes no ledger entry.** It moves `scr` and `pts` silently. Say if it should log.
4. **The glow is a `box-shadow` on `#app`**, which has no padding of its own, so it hugs the content column's edge. May want a wrapper or padding to sit further out.
5. **No particles**, as decided.
6. **Increment is `+0.1`** on the grounds that it is a new mechanic rather than a tweak. Say if it should be `+0.0.1`.

---

### Block 1: Add at [falsedge.js line 22](../falsedge.js#L22)

Just prior:

```js
  var STREAK_GRACE_MS = 12 * 60 * 60 * 1000;
```

Added:

```js
  // Golden hour: stored under its own key so undo can't affect it. 1h cooldown.
  // Grants 0.2 pts bonus on setting tasks for its duration. Random chance to 
  // trigger from navigating to Falsedge from hex2 game. 
  var GOLDEN_KEY = "golden.end";
  var GOLDEN_MS = 60 * 60 * 1000;
  var GOLDEN_SET_AWARD = 0.2;
  var GOLDEN_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
```

Just after:

```js
  var TIER_POINTS = [6, 3, 2, 1];
```

---

### Block 2: Replace [falsedge.js lines 1859-1863](../falsedge.js#L1859-L1863)

```js
  /**
   * Validates and commits the SET box. Every failure is a hard block with its
   * own toast; nothing is set and nothing silently defaults.
   */
  function submitSet() {
```

With:

```js
  /**
   * When the running golden hour ends. Hex 2^ stamps this; Falsedge reads it.
   * @returns {number} the end time in ms, or 0 when there has never been one.
   */
  function goldenEnd() {
    var raw = null;
    try {
      raw = localStorage.getItem(GOLDEN_KEY);
    } catch (e) {}
    if (!raw) return 0;
    var t = new Date(raw).getTime();
    if (isNaN(t)) return 0;
    return t;
  }

  /**
   * @param {Date} now - the reference moment.
   * @returns {boolean} true while a golden hour is running.
   */
  function goldenActive(now) {
    return now.getTime() < goldenEnd();
  }

  /**
   * The golden hour banner's text.
   * @param {Date} now - the reference moment.
   * @returns {string} the text, or "" when none is running.
   */
  function goldenLineText(now) {
    if (!goldenActive(now)) {
      return "";
    }
    var end = new Date(goldenEnd());
    return "golden hour : ends " + hhmm(end) +
      " (" + GOLDEN_DAYS[end.getDay()] + ")";
  }

  /**
   * Pays for creating a task during a golden hour, carrying `scr` into `pts`
   * at whole numbers the way a tier award does. Rides the caller's undo entry.
   * @param {Date} now - the reference moment.
   */
  function awardGoldenSet(now) {
    if (!goldenActive(now)) return;
    var before = Math.floor(state.scr);
    state.scr = state.scr + GOLDEN_SET_AWARD;
    state.pts = state.pts + (Math.floor(state.scr) - before);
  }

  /**
   * Validates and commits the SET box. Every failure is a hard block with its
   * own toast; nothing is set and nothing silently defaults.
   */
  function submitSet() {
```

---

### Block 3: Replace [falsedge.js lines 1889-1891](../falsedge.js#L1889-L1891)

```js
    if (!deadlineClear(deadline, now)) return;
    pushUndo("set task");
    state.activeTasks.push({
```

With:

```js
    if (!deadlineClear(deadline, now)) return;
    pushUndo("set task");
    awardGoldenSet(now);
    state.activeTasks.push({
```

---

### Block 4: Replace [falsedge.js lines 2134-2136](../falsedge.js#L2134-L2136)

```js
    var iso = deadline.toISOString();
    pushUndo("activate row");
    var task = {
```

With:

```js
    var iso = deadline.toISOString();
    pushUndo("activate row");
    awardGoldenSet(now);
    var task = {
```

---

### Block 5: Replace [falsedge.js lines 2548-2552](../falsedge.js#L2548-L2552)

```js
    var indicator = streakIndicatorText(getNow());
    if (indicator) {
      wrap.appendChild(el("div", "streak-indicator", indicator));
    }
    return wrap;
```

With:

```js
    var indicator = streakIndicatorText(getNow());
    if (indicator) {
      wrap.appendChild(el("div", "streak-indicator", indicator));
    }
    var golden = goldenLineText(getNow());
    if (golden) {
      wrap.appendChild(el("div", "golden-line", golden));
    }
    return wrap;
```

---

### Block 6: Replace [falsedge.js line 3419](../falsedge.js#L3419)

```js
    appEl.innerHTML = "";
```

With:

```js
    appEl.innerHTML = "";
    appEl.classList.toggle("golden", goldenActive(getNow()));
```

---

### Block 7: Add at [hex2-core.js line 30](../hex2-core.js#L30)

Just prior:

```js
  const GRASS_KEY = "grass.count";
```

Added:

```js
  // Falsedge's golden hour, rolled here because leaving the game is the only
  // way in. One key: while `now` is under it the hour runs, for an hour after
  // that it cannot be rolled again.
  const GOLDEN_KEY = "golden.end";
  const GOLDEN_MS = 60 * 60 * 1000;
  const GOLDEN_ODDS = 8;
```

Just after:

```js
  const UNDO_DEPTH = 6;
```

---

### Block 8: Replace [hex2-core.js lines 1710-1715](../hex2-core.js#L1710-L1715)

```js
    const exits = document.querySelectorAll(".navaway");
    for (const link of exits) {
      link.addEventListener("click", function () {
        store.set(BREAK_KEY, "0");
      });
    }
```

With:

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

---

### Block 9: Add at [style-falsedge.css line 479](../style-falsedge.css#L479)

Just prior:

```css
  .streak-indicator {
    grid-column: 1 / -1;
    margin-top: 4px;
    color: var(--c-red);
    font-size: 13px;
    letter-spacing: .02em;
  }
```

Added:

```css
  /* the golden hour banner, under the scores beside the streak indicator */
  .golden-line {
    grid-column: 1 / -1;
    margin-top: 4px;
    color: var(--c-yellow);
    font-size: 13px;
    letter-spacing: .02em;
  }
  /* the whole column glows while a golden hour runs, not one section */
  #app.golden {
    border-radius: var(--radius);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--c-yellow) 55%, transparent),
      0 0 26px -4px color-mix(in srgb, var(--c-yellow) 60%, transparent);
  }
```

Just after:

```css
  /* the streak-break announcement: the toast, red, and centred */
```

---

### Block 10: changelog

increment: +0.1

- Golden hour. Leaving Hex 2^ for Falsedge rolls a 1 in 24 chance of one starting. While it runs, every task you set is worth 0.2 pts, the app glows gold, and a line under the scores reads `golden hour : ends 08:47 (Sat)`.
- One hour long, and it cannot come back for an hour after it ends. That cooldown is invisible.
- Setting a task outside a golden hour is worth nothing, as before.
- also all days are (Sat) format now instead of (SA).