# Task setting combo & Hex 2^ green 12-dial — code draft

Last updated: 2026-09-27 01:47

Replaces Falsedge's Golden Hour with the Task Setting Combo feature:
- Streaks track completing tasks; Combos track setting tasks.
- Setting a task adds +4h to the combo window, capping at +12h.
- Each calendar day of active combo adds +0.1 bonus points on task set (Day 1: +0.1, Day 2: +0.2 ... Day 10: +1.0 max).
- When a combo breaks, setting the next task restarts Day 1 (+0.1) immediately.
- Displays an inset-glow combo indicator under the "Active Tasks" label with right-aligned green text `CE: in XhYYm at HH:MM`.

Reframes Hex 2^ lockout clock animation:
- Kept and restyled to green (`--hex-green: #2fad6a`, weighted average of grass SVG blade colours) instead of gold.
- 12-hour clock face instead of 24 (1/12 odds).
- Rolling 12 awards +2 grass on fake ad completion instead of +1.
- All golden hour read/write plumbing removed from hex2-core.js (`GOLDEN_KEY`, `GOLDEN_MS`, `goldenBlocked`, `rollGolden`, `claimGolden`, `.gh-won`).

---

## falsedge.js

### Block 1: Replace [falsedge.js ~lines 20-27](../falsedge.js#L20-L27)

```js
  var STREAK_GRACE_MS = 12 * 60 * 60 * 1000;
  // Golden hour: stored under its own key so undo can't affect it. 1h cooldown.
  // Grants 0.1 pts bonus on setting tasks for its duration. Random chance to
  // trigger from navigating to Falsedge from hex2 game.
  var GOLDEN_KEY = "golden.end";
  var GOLDEN_MS = 60 * 60 * 1000;
  var GOLDEN_SET_AWARD = 0.1;
  var TIER_POINTS = [6, 3, 2, 1];
```

With:

```js
  var STREAK_GRACE_MS = 12 * 60 * 60 * 1000;
  // Combo: stored under its own key so undo can't affect it.
  // Setting a task adds +4h to the combo window, capping at +12h.
  // Pays +0.1 pts per calendar day of active combo, capping at +1.0 (day 10).
  var COMBO_KEY = "falsedge.combo";
  var COMBO_STEP_MS = 4 * 60 * 60 * 1000;
  var COMBO_MAX_MS = 12 * 60 * 60 * 1000;
  var COMBO_DAY_AWARD = 0.1;
  var COMBO_MAX_AWARD = 1.0;
  var TIER_POINTS = [6, 3, 2, 1];
```

---

### Block 2: Replace [falsedge.js ~lines 1883-1930](../falsedge.js#L1883-L1930)

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
      " (" + DAY_ABBR[end.getDay()] + ")";
  }

  /**
   * Pays for creating a task during a golden hour, carrying `scr` into `pts`
   * at whole numbers the way a tier award does. Rides the caller's undo entry.
   * @param {Date} now - the reference moment.
   */
  function awardGoldenSet(now) {
    if (!goldenActive(now)) return;
    var before = Math.floor(state.scr);
    state.scr = roundScr(state.scr + GOLDEN_SET_AWARD);
    state.pts = state.pts + (Math.floor(state.scr) - before);
  }
```

With:

```js
  // --------------------------------- combo -----------------------------------
  /**
   * Loads the current combo state from localStorage.
   * @returns {{startDay: string, end: number}|null}
   */
  function loadCombo() {
    try {
      var raw = localStorage.getItem(COMBO_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (typeof obj.startDay === "string" &&
        typeof obj.end === "number") {
        return obj;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Persists combo state to localStorage.
   * @param {{startDay: string, end: number}} c
   */
  function saveCombo(c) {
    try {
      localStorage.setItem(COMBO_KEY, JSON.stringify(c));
    } catch (e) {}
  }

  /**
   * Tests whether a combo window is currently active.
   * @param {Date} now - the reference moment.
   * @returns {boolean}
   */
  function comboActive(now) {
    var c = loadCombo();
    if (!c) return false;
    return now.getTime() < c.end;
  }

  /**
   * Calendar day count of the active combo (1–10).
   * @param {Date} now - the reference moment.
   * @returns {number}
   */
  function comboDays(now) {
    var c = loadCombo();
    if (!c || now.getTime() >= c.end) return 1;
    var startD = new Date(c.startDay + "T00:00:00");
    var todayD = new Date(dayKey(now) + "T00:00:00");
    var diff = Math.round(
      (todayD.getTime() - startD.getTime()) / DAY_MS);
    if (diff < 0) diff = 0;
    return Math.min(10, Math.max(1, diff + 1));
  }

  /**
   * Bonus points for setting a task right now.
   * @param {Date} now - the reference moment.
   * @returns {number} 0.1 on day 1, up to 1.0 on day 10.
   */
  function comboAward(now) {
    return roundScr(
      Math.min(COMBO_MAX_AWARD,
        comboDays(now) * COMBO_DAY_AWARD));
  }

  /**
   * Advances the combo window on task set: +4h (capped at +12h), updates the 
   * calendar start day, awards the bonus.
   * @param {Date} now - the reference moment.
   */
  function awardComboSet(now) {
    var today = dayKey(now);
    var c = loadCombo();
    var award = 0.1;
    if (c && now.getTime() < c.end) {
      award = comboAward(now);
      var nextEnd = Math.min(
        c.end + COMBO_STEP_MS,
        now.getTime() + COMBO_MAX_MS);
      saveCombo({ startDay: c.startDay, end: nextEnd });
    } else {
      saveCombo({
        startDay: today,
        end: now.getTime() + COMBO_STEP_MS
      });
    }
    var before = Math.floor(state.scr);
    state.scr = roundScr(state.scr + award);
    state.pts =
      state.pts + (Math.floor(state.scr) - before);
  }

  /**
   * Builds the combo indicator above the active tasks card.
   * Shows countdown while active, elapsed time after expiry.
   * @param {Date} now - the reference moment.
   * @returns {Element|null} null if no combo has ever been set.
   */
  function buildComboRow(now) {
    var c = loadCombo();
    if (!c) return null;
    var leftMs = c.end - now.getTime();
    var endD = new Date(c.end);
    var text;
    if (leftMs > 0) {
      var h = Math.floor(leftMs / (60 * 60 * 1000));
      var m = Math.floor(
        (leftMs % (60 * 60 * 1000)) / (60 * 1000));
      text = "CE: in " + h + "h" + pad2(m) +
        "m at " + hhmm(endD);
    } else {
      var ago = -leftMs;
      var agoD = Math.floor(ago / (24 * 60 * 60 * 1000));
      if (agoD > 99) {
        text = "CE: very long ago";
      } else if (agoD >= 1) {
        var agoH = Math.floor((ago % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        text = "CE: " + agoD + "d" + pad2(agoH) + "h ago at " + hhmm(endD);
      } else {
        var aH = Math.floor(ago / (60 * 60 * 1000));
        var aM = Math.floor((ago % (60 * 60 * 1000)) / (60 * 1000));
        text = "CE: " + aH + "h" + pad2(aM) + "m ago at " + hhmm(endD);
      }
    }
    var row = el("div", "combo-row");
    if (leftMs > 0) {
      var bar = el("div", "combo-bar");
      var p = Math.min(1, leftMs / COMBO_MAX_MS);
      bar.style.width = (p * 100).toFixed(1) + "%";
      row.appendChild(bar);
    }
    row.appendChild(el("span", "combo-text", text));
    return row;
  }
```

---

### Block 3: Replace [falsedge.js ~lines 1963-1965](../falsedge.js#L1963-L1965)

```js
    pushUndo("set task");
    awardGoldenSet(now);
    state.activeTasks.push({
```

With:

```js
    pushUndo("set task");
    awardComboSet(now);
    state.activeTasks.push({
```

---

### Block 4: Replace [falsedge.js ~lines 2223-2225](../falsedge.js#L2223-L2225)

```js
    pushUndo("activate row");
    awardGoldenSet(now);
    var task = {
```

With:

```js
    pushUndo("activate row");
    awardComboSet(now);
    var task = {
```

---

### Block 5: Replace [falsedge.js ~lines 2636-2645](../falsedge.js#L2636-L2645)

```js
    wrap.appendChild(scrBox);
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

With:

```js
    wrap.appendChild(scrBox);
    var indicator = streakIndicatorText(getNow());
    if (indicator) {
      wrap.appendChild(
        el("div", "streak-indicator", indicator));
    }
    return wrap;
```

---

### Block 6: Replace [falsedge.js ~lines 2906-2911](../falsedge.js#L2906-L2911)

```js
  function buildTasks() {
    var now = getNow();
    var section = buildSection("ACTIVE TASKS", "tasksCard", "sec-tasks",
      buildStreakLeft(now));
    var wrap = el("div", "tasks");
    section.card.appendChild(wrap);
```

With:

```js
  function buildTasks() {
    var now = getNow();
    var section = buildSection("ACTIVE TASKS", "tasksCard", "sec-tasks",
      buildStreakLeft(now));
    var combo = buildComboRow(now);
    if (combo) {
      section.wrap.insertBefore(combo, section.card);
    }
    var wrap = el("div", "tasks");
    section.card.appendChild(wrap);
```

---

### Block 7: Replace [falsedge.js ~lines 3537-3539](../falsedge.js#L3537-L3539)

```js
    appEl.innerHTML = "";
    document.body.classList.toggle("golden", goldenActive(getNow()));
    appEl.appendChild(buildScores());
```

With:

```js
    appEl.innerHTML = "";
    appEl.appendChild(buildScores());
```

---

### Block 8: Insert after [falsedge.js ~line 3554](../falsedge.js#L3554)

After `appEl.querySelectorAll("textarea").forEach(autoGrow);`, add:

```js
    var ct = appEl.querySelector(".combo-text");
    if (ct) {
      var cr = ct.closest(".combo-row");
      var cb = cr ? cr.querySelector(".combo-bar") : null;
      if (cb) {
        var barR = cb.getBoundingClientRect().right;
        var ctR = ct.getBoundingClientRect();
        var covered = Math.max(0, barR - ctR.left);
        var uncov = Math.max(0, ctR.width - covered);
        ct.style.setProperty("--combo-clip-r", uncov.toFixed(1) + "px");
      }
    }
```

---

## style-falsedge.css

### Block 9: Replace [style-falsedge.css ~lines 475-493](../style-falsedge.css#L475-L493)

```css
  /* the golden hour banner, under the scores beside the streak indicator */
  .golden-line {
    grid-column: 1 / -1;
    margin-top: 4px;
    color: var(--c-yellow);
    font-size: 13px;
    letter-spacing: .02em;
  }
  /* gold vignette while a golden hour runs: glows inward from the screen
     edges, over everything, and never eats a tap */
  body.golden::after {
    content: "";
    position: fixed;
    inset: 0;
    z-index: 5;
    pointer-events: none;
    box-shadow:
      inset 0 0 26px -2px color-mix(in srgb, var(--c-yellow) 80%, transparent);
  }
```

With:

```css
  /* combo indicator, sits under the active tasks label */
  .combo-row {
    position: relative;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    margin: 0 2px 6px;
    min-height: 22px;
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--c-yellow) 30%, transparent);
  }
  .combo-bar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: var(--c-yellow);
    pointer-events: none;
  }
  .combo-text {
    position: relative;
    z-index: 2;
    color: var(--c-green);
    font-size: 11px;
    letter-spacing: .04em;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    padding: 3px 10px;
    background: var(--bg);
    border-radius: 4px;
  }
  .combo-text::after {
    content: "";
    position: absolute;
    inset: 0;
    box-shadow: inset 0 0 6px 1px var(--c-yellow);
    border-radius: inherit;
    clip-path: inset(0 var(--combo-clip-r, 0px) 0 0);
    pointer-events: none;
  }
```

---

## hex2-core.js

### Block 10: Replace [hex2-core.js ~lines 30-36](../hex2-core.js#L30-L36)

```js
  // Falsedge's golden hour, rolled here because leaving the game is the only
  // way in. One key: while `now` is under it the hour runs, for an hour after
  // that it cannot be rolled again.
  const GOLDEN_KEY = "golden.end";
  const GOLDEN_MS = 60 * 60 * 1000;
  const GOLDEN_ODDS = 24;
  const GOLDEN_SWEEP_MS = 1000;
```

With:

```js
  // Lockout dial: 12-hour face, 1/12 odds for +2 grass.
  const GOLDEN_ODDS = 12;
  const GOLDEN_SWEEP_MS = 1000;
```

---

### Block 11: Replace [hex2-core.js ~lines 1444-1455](../hex2-core.js#L1444-L1455)

Delete `goldenBlocked` entirely.

```js
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
```

With:

(nothing — delete the block)

---

### Block 12: Replace [hex2-core.js ~lines 1457-1468](../hex2-core.js#L1457-L1468)

```js
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
```

With:

```js
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
```

---

### Block 13: Replace [hex2-core.js ~lines 1488-1491](../hex2-core.js#L1488-L1491)

Remove `.gh-won` cleanup from `clearGolden`.

```js
    const claim = document.getElementById("go-falsedge");
    if (claim) {
      claim.classList.remove("gh-won");
    }
```

With:

(nothing — delete the block)

---

### Block 14: Replace [hex2-core.js ~lines 1497-1507](../hex2-core.js#L1497-L1507)

```js
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
```

With:

```js
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
```

---

### Block 15: Replace [hex2-core.js ~lines 1520-1524](../hex2-core.js#L1520-L1524)

```js
      const claim = document.getElementById("go-falsedge");
      if (claim) {
        claim.classList.add("gh-won");
      }
    }
```

With:

```js
      if (earnNum) {
        earnNum.textContent = "+2";
      }
    }
```

---

### Block 16: Replace [hex2-core.js ~lines 1528-1533](../hex2-core.js#L1528-L1533)

Remove `goldenBlocked` check from `preRollGolden`, fix stale comment.

```js
  // Lockout looks normal while an hour is running or cooling down
  function preRollGolden() {
    clearGolden();
    goldenPending = false;
    if (!ghRing || goldenBlocked()) {
      return;
```

With:

```js
  // Reset and roll the lockout dial animation
  function preRollGolden() {
    clearGolden();
    goldenPending = false;
    if (!ghRing) {
      return;
```

---

### Block 17: Replace [hex2-core.js ~lines 1543-1549](../hex2-core.js#L1543-L1549)

Delete `claimGolden` entirely.

```js
  // Cashes an unclaimed win. Only the lockout's Go to Falsedge does this.
  function claimGolden() {
    if (!goldenPending) {
      return;
    }
    goldenPending = false;
    store.set(GOLDEN_KEY, new Date(Date.now() + GOLDEN_MS).toISOString());
  }
```

With:

(nothing — delete the block)

---

### Block 18: Replace [hex2-core.js ~lines 1602-1608](../hex2-core.js#L1602-L1608)

Fix stale comment and add variable grass award.

```js
  // One grass per wait actually sat through - closeFakeAd is already gated on
  // fakeAdReady, so there is no partial credit. It lives under its own key
  // rather than inside either app's save blob, so neither can rewind it.
  function payGrass() {
    let n = parseInt(store.get(GRASS_KEY) || "0", 10) || 0;
    n += 1;
    store.set(GRASS_KEY, String(n));
```

With:

```js
  // Grass award per fake ad: normally 1, doubled to 2 when the dial landed on 
  // 12. Has its own key so neither app can rewind it.
  function payGrass() {
    let n = parseInt(
      store.get(GRASS_KEY) || "0", 10) || 0;
    let award = 1;
    if (goldenPending) {
      award = 2;
    }
    n += award;
    store.set(GRASS_KEY, String(n));
```

---

### Block 19: Replace [hex2-core.js ~lines 1627-1630](../hex2-core.js#L1627-L1630)

Fix ordering: `payGrass` must run BEFORE `goldenPending` is cleared, otherwise the +2 award never fires. Remove stale golden hour comment.

```js
    // staying in the game throws an unclaimed golden hour away
    goldenPending = false;
    clearGolden();
    payGrass();
```

With:

```js
    payGrass();
    goldenPending = false;
    clearGolden();
```

---

### Block 20: Replace [hex2-core.js ~lines 1844-1853](../hex2-core.js#L1844-L1853)

Delete `rollGolden` entirely.

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
```

With:

(nothing — delete the block)

---

### Block 21: Replace [hex2-core.js ~lines 1855-1866](../hex2-core.js#L1855-L1866)

Simplify exit link handlers: no more golden hour writes.

```js
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

With:

```js
    const exits = document.querySelectorAll(".navaway");
    for (const link of exits) {
      link.addEventListener("click", function () {
        store.set(BREAK_KEY, "0");
        goldenPending = false;
      });
    }
```

---

## style-hex2.css

### Block 22: Replace [style-hex2.css ~lines 11-12](../style-hex2.css#L11-L12)

Add `--hex-green` variable (weighted average of grass SVG blade colours) and remove dead `--gold` (all former uses replaced by `--hex-green` in blocks 23–27).

```css
    --hex-accent: #3cc3e2;
    --gold: #ecc652;
```

With:

```css
    --hex-accent: #3cc3e2;
    --hex-green: #2fad6a;
```

---

### Block 23: Replace [style-hex2.css ~lines 549-550](../style-hex2.css#L549-L550)

Fix stale section comment.

```css
  /* ---------------------------- golden hour ----------------------------- */
  .gh-ring {
```

With:

```css
  /* ----------------------------- dial clock ----------------------------- */
  .gh-ring {
```

---

### Block 24: Replace [style-hex2.css ~lines 570](../style-hex2.css#L570)

Ring border gold → green.

```css
    border: 1px solid color-mix(in srgb, var(--gold) 20%, transparent);
```

With:

```css
    border: 1px solid color-mix(in srgb, var(--hex-green) 20%, transparent);
```

---

### Block 25: Replace [style-hex2.css ~lines 592-608](../style-hex2.css#L592-L608)

Dial marks gold → green.

```css
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
```

With:

```css
    color: color-mix(in srgb, var(--hex-green) 26%, transparent);
    transform:
      rotate(var(--a))
      translateY(-130px)
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
```

---

### Block 26: Replace [style-hex2.css ~lines 627-641](../style-hex2.css#L627-L641)

Hand and hub gold → green.

```css
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
```

With:

```css
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

---

### Block 27: Replace [style-hex2.css ~lines 642-652](../style-hex2.css#L642-L652)

Delete `.gh-won` rule — nothing sets this class anymore.

```css
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

With:

(nothing — delete the rule)

---

## Changelog

### Block 28: changelog

increment: +0.1.0

- Replaced Golden Hour with Task Setting Combo: setting tasks extends combo by +4h (up to 12h), awarding +0.1 pts per active calendar day (caps at +1.0 at day 10).
- Added combo countdown indicator with inset yellow glow and green expiry text under the Active Tasks label.
- Reframed Hex 2^ lockout clock animation to green (`#2fad6a`) with a 12-hour face, offering a 1/12 chance of awarding +2 grass on ad completion.
- Removed all golden hour plumbing (`GOLDEN_KEY`, `GOLDEN_MS`, `goldenBlocked`, `rollGolden`, `claimGolden`, `.gh-won`).
