# Streak countdown on the ACTIVE TASKS label — code draft

`19/24h | 43/48h`, right aligned on the ACTIVE TASKS label row. Hours remaining, floored, so `0` means under an hour left. Nothing clamped: `-3/24h` once lapsed, and `72/24h` while a lockdown's grace holds the window's start in the future. A window that never started shows `-/24h`. Recomputed on `render()` only — no timer.

`.fd-label` becomes a flex row, and `buildSection()` takes an optional trailing node so SET, dailies and others don't all grow one.

## Open, decide while reading

1. `text-transform: none` on the counter, or the label's `uppercase` turns `19/24h` into `19/24H`.
2. `11px`, the label's own colour, tabular numerals so the digits don't jitter as they tick.
3. Comments are four lines total across both new functions. Say if that's still too many.

---

### Block 1: Add at [falsedge.js line 2653](../falsedge.js#L2653)

Just prior:

```js
    block.appendChild(before);
    return block;
  }
```

Added:

```js
  /**
   * Hours left in one streak window, floored.
   * @param {string} type - "any" or "other".
   * @param {Date} now - the reference moment.
   * @returns {string} the hours, or "-" when the window has no start.
   */
  function streakHoursLeft(type, now) {
    var win = streakWindow(type);
    if (!win) {
      return "-";
    }
    return String(Math.floor((win.to - now.getTime()) / (60 * 60 * 1000)));
  }

  /**
   * Builds the countdown pair riding the ACTIVE TASKS label.
   * @param {Date} now - the reference moment.
   * @returns {Element} the counter.
   */
  function buildStreakLeft(now) {
    var text = [["any", 24], ["other", 48]].map(function (pair) {
      return streakHoursLeft(pair[0], now) + "/" + pair[1] + "h";
    }).join(" | ");
    return el("span", "streak-left", text);
  }

```

Just after:

```js
  /**
   * Builds the ACTIVE TASKS section: a labelled card wrapping the task stack,
```

---

### Block 2: Replace [falsedge.js lines 2664-2665](../falsedge.js#L2664-L2665)

```js
  function buildTasks() {
    var section = buildSection("ACTIVE TASKS", "tasksCard", "sec-tasks");
```

With:

```js
  function buildTasks() {
    var now = getNow();
    var section = buildSection("ACTIVE TASKS", "tasksCard", "sec-tasks",
      buildStreakLeft(now));
```

---

### Block 3: Remove [falsedge.js line 2675](../falsedge.js#L2675)

`now` is declared at the top of the function by Block 2, so this second declaration goes.

```js
    var now = getNow();
```

---

### Block 4: Replace [falsedge.js lines 2700-2702](../falsedge.js#L2700-L2702)

```js
  function buildSection(label, cardId, modifier) {
    var wrap = el("div", "fd-section " + modifier);
    wrap.appendChild(el("h2", "fd-label", label));
```

With:

```js
  function buildSection(label, cardId, modifier, extra) {
    var wrap = el("div", "fd-section " + modifier);
    var head = el("h2", "fd-label", label);
    if (extra) {
      head.appendChild(extra);
    }
    wrap.appendChild(head);
```

---

### Block 5: Replace [style-falsedge.css lines 152-160](../style-falsedge.css#L152-L160)

```css
  .fd-label {
    font-size: 13px;
    font-weight: 700;
    color: color-mix(in srgb, var(--glow) 62%, var(--muted));
    text-transform: uppercase;
    letter-spacing: .08em;
    margin: 0 0 6px 2px;
    text-shadow: 0 0 12px color-mix(in srgb, var(--glow) 35%, transparent);
  }
```

With:

```css
  .fd-label {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 700;
    color: color-mix(in srgb, var(--glow) 62%, var(--muted));
    text-transform: uppercase;
    letter-spacing: .08em;
    margin: 0 0 6px 2px;
    text-shadow: 0 0 12px color-mix(in srgb, var(--glow) 35%, transparent);
  }
  .streak-left {
    font-size: 11px;
    letter-spacing: .04em;
    text-transform: none;
    font-variant-numeric: tabular-nums;
  }
```

---

### Block 6: changelog

A version entry for `about.html`, drafted and approved before anything is pushed. The uncommitted `format*` rename would ride the same push.
