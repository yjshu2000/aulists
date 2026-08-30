# [i34] Streak break condition — code draft

Settled: daily = came from an ACTIVATE (dailies) row, so SET and `others` tasks are both non-dailies. Two timestamps hold the streak windows, `lastDailyAt` and `lastOtherAt` — nothing accumulates. A streak break restarts both streak windows. The indicator names which streak window, as `streak broke? (24)`. A daily never feeds the 48h streak window. Vacation is out of scope entirely. The lockdown is 36h, blocks every route that creates an active task, and both streak windows start when it lifts. Only the manual button pushes an undo entry: one triggered by cancelling the last coverable task rides that cancel's entry, and one the app finds at load is not undoable at all, since time passing is not an edit.

"Break" alone already means the Hex 2^ break — `BREAK_KEY`, `BREAK_MS`, `startBreakTimer()`. Nothing here is ever called just a break: it is a **streak break**, and the thing it starts is a **lockdown**.

## Open, decide while reading

1. The manual `[streak broke]` button still only renders when the stack is empty. Left alone here, since the automatic path now covers the case it could not reach. Say if it should always show.
2. The announcement fades after 2.2s like any other toast. Say if it should sit until tapped instead.
3. A streak window with no completion of its type ever, and no lockdown behind it, never lapses. A fresh install is not immediately broken.

---

### Block 1: Add at [falsedge.js line 17](../falsedge.js#L17)

Just prior:

```js
  // cancelling a dated `others` activation locks that row out this long
  var COOLDOWN_MS = 36 * 60 * 60 * 1000;
```

Added:

```js
  // auto streak breakers + lockdown
  var DAILY_STREAK_WINDOW_MS = 24 * 60 * 60 * 1000;
  var OTHER_STREAK_WINDOW_MS = 48 * 60 * 60 * 1000;
  var STREAK_LOCKDOWN_MS = 36 * 60 * 60 * 1000;
  var STREAK_GRACE_MS = 12 * 60 * 60 * 1000;
```

Just after:

```js
  var TIER_POINTS = [6, 3, 2, 1];
```

---

### Block 2: Replace [falsedge.js line 344](../falsedge.js#L344)

```js
      ledgerCollapsed: true
```

With:

```js
      ledgerCollapsed: true,
      lastDailyAt: null,
      lastOtherAt: null,
      lockdownEnd: null
```

---

### Block 3: Add at [falsedge.js line 407](../falsedge.js#L407)

Just prior:

```js
    if (typeof raw.ledgerCollapsed === "boolean") {
      s.ledgerCollapsed = raw.ledgerCollapsed;
    }
```

Added:

```js
    if (typeof raw.lastDailyAt === "string") s.lastDailyAt = raw.lastDailyAt;
    if (typeof raw.lastOtherAt === "string") s.lastOtherAt = raw.lastOtherAt;
    if (typeof raw.lockdownEnd === "string") s.lockdownEnd = raw.lockdownEnd;
```

Just after:

```js
    return s;
```

---

### Block 4: Replace [falsedge.js lines 1075-1089](../falsedge.js#L1075-L1089)

```js
  /**
   * Pushes the current run into the high scores and zeroes `scr`. `pts` is
   * untouched. Refuses at zero, since there'd be nothing to record.
   */
  function streakBroke() {
    if (state.scr <= 0) {
      toast("nothing to break");
      return;
    }
    pushUndo("streak broke");
    insertHighScore(state.scr, dayKey(getNow()));
    state.scr = 0;
    save();
    render();
  }
```

With:

```js
  // ---------------------------------- streak ---------------------------------
  // Auto streak breaker. Minimum 1 daily in the last 24h, and min 1 non-daily
  // in the last 48h. Time checks last completion of each or last lockdown end.

  // What the indicator text reads. Not saved to undo/storage.
  var streakIndicator = "";

  /**
   * Stamps a completion onto whichever streak window the task belongs to.
   * @param {Object} task - the task being completed.
   * @param {Date} when - the effective completion time, which for a backdated
   *   "completed before" is that tier's clock time rather than now.
   */
  function recordCompletion(task, when) {
    var key = "lastOtherAt";
    if (task.daily) {
      key = "lastDailyAt";
    }
    var held = new Date(state[key] || 0).getTime();
    if (isNaN(held) || when.getTime() > held) {
      state[key] = when.toISOString();
    }
  }

  /**
   * When one type was last completed.
   * @param {string} type - "daily" or "other".
   * @returns {number} its time in ms, or 0 if there has never been one.
   */
  function lastCompletionOf(type) {
    var raw = state.lastOtherAt;
    if (type === "daily") {
      raw = state.lastDailyAt;
    }
    if (!raw) return 0;
    var t = new Date(raw).getTime();
    if (isNaN(t)) return 0;
    return t;
  }

  /**
   * Milliseconds left on the lockdown a streak break started.
   * @param {Date} now - the reference moment.
   * @returns {number} the remainder, or 0 if no lockdown is running.
   */
  function lockdownLeft(now) {
    if (!state.lockdownEnd) return 0;
    var until = new Date(state.lockdownEnd).getTime();
    if (isNaN(until)) return 0;
    return Math.max(0, until - now.getTime());
  }

  /**
   * Refuses task creation while a lockdown is running. Every route that makes
   * an active task calls this first.
   * @param {Date} now - the reference moment.
   * @returns {boolean} true if a task may be created right now.
   */
  function lockdownClear(now) {
    var left = lockdownLeft(now);
    if (left > 0) {
      toast("streak broke lockdown - " + fmtLeft(left) + " left");
      return false;
    }
    return true;
  }

  /**
   * Where one streak window starts: its own last completion, or the end of a
   * lockdown plus its grace, whichever is later.
   * @param {string} type - "daily" or "other".
   * @returns {number} that moment in ms, or 0 when there is nothing to start
   *   it from at all.
   */
  function streakWindowStart(type) {
    var from = lastCompletionOf(type);
    if (state.lockdownEnd) {
      var resume = new Date(state.lockdownEnd).getTime() + STREAK_GRACE_MS;
      if (!isNaN(resume) && resume > from) {
        from = resume;
      }
    }
    return from;
  }

  /**
   * A streak window as two absolute times, which is what decides whether a
   * backdated completion could still land inside it.
   * @param {string} type - "daily" or "other".
   * @returns {{from: number, to: number}|null} the window, or null when there
   *   is nothing to start it from.
   */
  function streakWindow(type) {
    var from = streakWindowStart(type);
    if (!from) return null;
    var len = OTHER_STREAK_WINDOW_MS;
    if (type === "daily") {
      len = DAILY_STREAK_WINDOW_MS;
    }
    return { from: from, to: from + len };
  }

  /**
   * Whether an unresolved task could still be backdated into a lapsed window:
   * matching type, deadline inside the window.
   * @param {string} type - "daily" or "other".
   * @param {{from: number, to: number}} win - the lapsed window.
   * @returns {boolean} true while the streak break is only provisional.
   */
  function windowCoverable(type, win) {
    return state.activeTasks.some(function (t) {
      var tType = "other";
      if (t.daily) {
        tType = "daily";
      }
      if (tType !== type) return false;
      var at = new Date(t.deadline).getTime();
      return at >= win.from && at <= win.to;
    });
  }

  /**
   * Which streak windows have run out, named by their length in hours.
   * @param {Date} now - the reference moment.
   * @returns {number[]} the lapsed windows, shortest first.
   */
  function lapsedStreakWindows(now) {
    var out = [];
    [["daily", 24], ["other", 48]].forEach(function (pair) {
      var win = streakWindow(pair[0]);
      if (!win) return;
      if (now.getTime() > win.to) {
        out.push(pair[1]);
      }
    });
    return out;
  }

  /**
   * Confirms a streak break: banks the run, zeroes `scr`, and starts the
   * lockdown. Pushes no undo entry because that'd be stupid.
   * @param {Date} now - the moment it is confirmed.
   * @param {number[]} hours - the windows that ran out, for the announcement.
   */
  function confirmStreakBreak(now, hours) {
    if (state.scr > 0) {
      insertHighScore(state.scr, dayKey(now));
    }
    state.scr = 0;
    state.lockdownEnd =
      new Date(now.getTime() + STREAK_LOCKDOWN_MS).toISOString();
    streakIndicator = "";
    save();
    var msg = "streak broke";
    if (hours.length) {
      msg = "streak broke (" + hours.join(", ") + ")";
    }
    redToast(msg);
  }

  /**
   * Re-evaluates both streak windows. Runs on every resolve.
   * No undo OBVIOUSLY because tIME ISN'T UNDOABLE. this line is only here 
   * bcuz claude is a fCKING IDIOT WHO THINKS UNDO MEANS TIME TRAVELING. 
   */
  function checkStreak() {
    var now = getNow();
    var confirmed = [];
    var tentative = [];
    lapsedStreakWindows(now).forEach(function (hours) {
      var type = "other";
      if (hours === 24) {
        type = "daily";
      }
      if (windowCoverable(type, streakWindow(type))) {
        tentative.push(hours);
      } else {
        confirmed.push(hours);
      }
    });
    if (confirmed.length) {
      confirmStreakBreak(now, confirmed);
      return;
    }
    streakIndicator = "";
    if (tentative.length) {
      streakIndicator = "streak broke? (" + tentative.join(", ") + ")";
    }
  }

  // its own element and timer, so an ordinary toast cannot overwrite it
  var redToastEl = document.getElementById("redToast");
  var redToastTimer = null;

  /**
   * The streak-break announcement red toast.
   * @param {string} msg - the message to show.
   */
  function redToast(msg) {
    redToastEl.textContent = msg;
    redToastEl.classList.add("show");
    if (redToastTimer) clearTimeout(redToastTimer);
    redToastTimer = setTimeout(function () {
      redToastEl.classList.remove("show");
    }, 2200);
  }

  /**
   * The manual streak break. Banks the run, zeroes `scr` and starts the same
   * lockdown the automatic path does. Refuses at zero, since there'd be
   * nothing to record.
   */
  function streakBroke() {
    if (state.scr <= 0) {
      toast("nothing to break");
      return;
    }
    pushUndo("streak broke");
    confirmStreakBreak(getNow(), []);
    render();
  }
```

---

### Block 5: Add at [falsedge.js line 1275](../falsedge.js#L1275)

Just prior:

```js
    } else if (row && task.hadDate) {
      row.cooldownUntil =
        new Date(getNow().getTime() + COOLDOWN_MS).toISOString();
    }
```

Added:

```js
    if (kind === "complete") {
      recordCompletion(task, when);
    }
```

Just after:

```js
    var at = indexOfTask(id);
```

---

### Block 6: Add at [falsedge.js line 1280](../falsedge.js#L1280)

Just prior:

```js
    save();
```

Added:

```js
    checkStreak();
```

Just after:

```js
    render();
  }
```

---

### Block 7: Add at [falsedge.js line 1537](../falsedge.js#L1537)

Just prior:

```js
    var now = getNow();
```

Added:

```js
    if (!lockdownClear(now)) return;
```

Just after:

```js
    var textEl = document.getElementById("setText");
```

---

### Block 8: Add at [falsedge.js line 1695](../falsedge.js#L1695)

Just prior:

```js
    var now = getNow();
```

Added:

```js
    if (!lockdownClear(now)) return;
```

Just after:

```js
    var text = String(row.text).trim();
```

---

### Block 9: Replace [falsedge.js line 1745](../falsedge.js#L1745)

```js
    }
```

With:

```js
    } else {
      task.daily = true;
    }
```

---

### Block 10: Add at [falsedge.js line 2132](../falsedge.js#L2132)

Just prior:

```js
    wrap.appendChild(scrBox);
```

Added:

```js
    if (streakIndicator) {
      wrap.appendChild(el("div", "streak-indicator", streakIndicator));
    }
```

Just after:

```js
    return wrap;
  }
```

---

### Block 11: Add at [index.html line 56](../index.html#L56)

Just prior:

```html
<div class="toast" id="toast" role="status" aria-live="polite"></div>
```

Added:

```html
<div class="red-toast" id="redToast" role="alert" aria-live="assertive"></div>
```

Just after:

```html

<script src="falsedge.js"></script>
```

---

### Block 12: Add at [falsedge.js line 3001](../falsedge.js#L3001)

Just prior:

```js
    if (document.hidden) {
      return;
    }
```

Added:

```js
    checkStreak();
```

Just after:

```js
    render();
    refreshUndoRedoButtons();
  });
```

---

### Block 13: Add at [falsedge.js line 3006](../falsedge.js#L3006)

Just prior:

```js
  loadUndoRing();
```

Added:

```js
  checkStreak();
```

Just after:

```js
  render();
  refreshUndoRedoButtons();
```

---

### Block 14: Add at [style-falsedge.css line 460](../style-falsedge.css#L460)

Just prior:

```css
  .streak-btn {
    margin-top: 8px;
    align-self: flex-start;
  }
```

Added:

```css
  /* the tentative indicator, spanning both columns under the scores */
  .streak-indicator {
    grid-column: 1 / -1;
    margin-top: 4px;
    color: var(--c-red);
    font-size: 13px;
    letter-spacing: .02em;
  }

  /* the streak-break announcement: the toast, red, and centred */
  .red-toast {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    max-width: 90%;
    padding: 10px 16px;
    background: var(--panel-2);
    border: 1px solid color-mix(in srgb, var(--c-red) 55%, var(--line));
    border-radius: 10px;
    color: var(--c-red);
    font-size: 13px;
    opacity: 0;
    pointer-events: none;
    transition: opacity .2s ease;
    z-index: 80;
  }
  .red-toast.show {
    opacity: 1;
  }
```

Just after:

```css
  .inline-edit {
    width: 100%;
  }
```
