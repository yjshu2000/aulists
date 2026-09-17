# One streak window — code draft

last updated: 2026-09-16 20:42

The 24h window goes. There is one window now: **anything completed inside 48 hours**, dailies included. The lockdown, the grace period, the backdating rule and the tentative/confirmed split all stay as they are — the only change is that there is one window instead of two, and no kind of task is excluded from it.

Falling out of that:

- `completionFeeds` has nothing left to decide and goes.
- `windowCoverable` stops refusing dailies — any unresolved task can now cover.
- `streakStatus` stops returning lists of hours and returns one of three states.
- `breakStreak` loses its `hours` argument; the toast is just `streak broke`.
- The counter on the ACTIVE TASKS label goes from `18/24h | 41/48h` to `41/48h`.

`lastDailyAt` and `lastOtherAt` are both deleted and replaced by one `lastDoneAt`. Their stored values are abandoned, which is deliberate: an absent `lastDoneAt` is what tells `normalise` this is the first load after the change, and it drops `lockdownEnd` on the floor at the same time.

## What happens on the first open after this ships

1. `normalise` finds no `lastDoneAt`, so it stays `null` — and because it is absent, `lockdownEnd` is not copied across either. **The running lockdown is gone.**
2. `confirmStreakBreak()` at boot: `lastCompletionAt()` is 0 and `lockdownEnd` is null, so `streakWindowStart()` is 0, `streakWindow()` is null, `streakLapsed` is false. **No break fires.**
3. `streakIndicatorText` returns `""` — **no red line**.
4. `buildStreakLeft` has no window, so the label reads **`-/48h`** until the first completion.
5. `lockdownClear` passes. **Tasks can be set immediately.**
6. `scr` stays at 0. It was zeroed when the streak broke and nothing here restores it; whatever it was is in the high-scores table.
7. The old `lastDailyAt` / `lastOtherAt` values sit in storage as dead bytes until the first save overwrites the blob.

**The undo ring still holds the lockdown.** Every snapshot taken before this change carries the old `lockdownEnd`, and undo replaces `state` wholesale — so undoing far enough brings the lockdown back. Redo gets out of it again.

---

### Block 1: Replace [falsedge.js lines 18-19](../falsedge.js#L18-L19)

```js
  var ANY_STREAK_WINDOW_MS = 24 * 60 * 60 * 1000;
  var OTHER_STREAK_WINDOW_MS = 48 * 60 * 60 * 1000;
```

With:

```js
  var STREAK_WINDOW_MS = 48 * 60 * 60 * 1000;
```

---

### Block 2: Replace [falsedge.js lines 372-373](../falsedge.js#L372-L373)

```js
      lastDailyAt: null,
      lastOtherAt: null,
```

With:

```js
      lastDoneAt: null,
```

---

### Block 3: Replace [falsedge.js lines 456-458](../falsedge.js#L456-L458)

```js
    if (typeof raw.lastDailyAt === "string") s.lastDailyAt = raw.lastDailyAt;
    if (typeof raw.lastOtherAt === "string") s.lastOtherAt = raw.lastOtherAt;
    if (typeof raw.lockdownEnd === "string") s.lockdownEnd = raw.lockdownEnd;
```

With — a lockdown is only meaningful against a stamp, so data with no `lastDoneAt` drops it:

```js
    if (typeof raw.lastDoneAt === "string") {
      s.lastDoneAt = raw.lastDoneAt;
      if (typeof raw.lockdownEnd === "string") {
        s.lockdownEnd = raw.lockdownEnd;
      }
    }
```

---

### Block 4: Replace [falsedge.js lines 1141-1143](../falsedge.js#L1141-L1143)

```js
  /* Auto streak breaker. Minimum 1 task of any kind in the last 24h, and min 1
   * non-daily in the last 48h. Time checks last completion or last lockdown
   * end. A daily resets only the 24h window; a non-daily resets both.
```

With:

```js
  /* Auto streak breaker. Minimum 1 task of any kind in the last 48h. Time
   * checks last completion or last lockdown end. 
```

---

### Block 5: Replace [falsedge.js lines 1152-1167](../falsedge.js#L1152-L1167)

```js
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
```

With:

```js
  /**
   * Stamps a completion onto the streak window.
   * @param {Date} when - the effective completion time, which for a backdated
   *   "completed before" is that tier's clock time rather than now.
   */
  function recordCompletion(when) {
    var held = new Date(state.lastDoneAt || 0).getTime();
    if (isNaN(held) || when.getTime() > held) {
      state.lastDoneAt = when.toISOString();
    }
  }
```

---

### Block 6: Replace [falsedge.js lines 1181-1193](../falsedge.js#L1181-L1193)

```js
  /**
   * When a window's kind of task was last completed. "any" is the later of the
   * two stamps, since a daily now counts toward the 24h window as well.
   * @param {string} type - "any" or "other".
   * @returns {number} its time in ms, or 0 if there has never been one.
   */
  function lastCompletionOf(type) {
    var other = stampTime(state.lastOtherAt);
    if (type !== "any") {
      return other;
    }
    return Math.max(other, stampTime(state.lastDailyAt));
  }
```

With:

```js
  /**
   * When anything was last completed.
   * @returns {number} its time in ms, or 0 if there has never been one.
   */
  function lastCompletionAt() {
    return stampTime(state.lastDoneAt);
  }
```

---

### Block 7: Replace [falsedge.js lines 1225-1255](../falsedge.js#L1225-L1255)

```js
   * @param {string} type - "any" or "other".
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
   * @param {string} type - "any" or "other".
   * @returns {{from: number, to: number}|null} the window, or null when there
   *   is nothing to start it from.
   */
  function streakWindow(type) {
    var from = streakWindowStart(type);
    if (!from) return null;
    var len = OTHER_STREAK_WINDOW_MS;
    if (type === "any") {
      len = ANY_STREAK_WINDOW_MS;
    }
    return { from: from, to: from + len };
  }
```

With:

```js
   * @returns {number} that moment in ms, or 0 when there is nothing to start
   *   it from at all.
   */
  function streakWindowStart() {
    var from = lastCompletionAt();
    if (state.lockdownEnd) {
      var resume = new Date(state.lockdownEnd).getTime() + STREAK_GRACE_MS;
      if (!isNaN(resume) && resume > from) {
        from = resume;
      }
    }
    return from;
  }

  /**
   * The streak window as two absolute times, which is what decides whether a
   * backdated completion could still land inside it.
   * @returns {{from: number, to: number}|null} the window, or null when there
   *   is nothing to start it from.
   */
  function streakWindow() {
    var from = streakWindowStart();
    if (!from) return null;
    return { from: from, to: from + STREAK_WINDOW_MS };
  }
```

---

### Block 8: Replace [falsedge.js lines 1257-1287](../falsedge.js#L1257-L1287)

```js
  /**
   * Whether an unresolved task could still be backdated into a lapsed window.
   * The 24h window takes any task; the 48h one takes non-dailies only.
   * @param {string} type - "any" or "other".
   * @param {{from: number, to: number}} win - the lapsed window.
   * @returns {boolean} true while the streak break is only provisional.
   */
  function windowCoverable(type, win) {
    return state.activeTasks.some(function (t) {
      if (type === "other" && t.daily) return false;
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
    [["any", 24], ["other", 48]].forEach(function (pair) {
      var win = streakWindow(pair[0]);
      if (!win) return;
      if (now.getTime() > win.to) {
        out.push(pair[1]);
      }
    });
    return out;
  }
```

With:

```js
  /**
   * Whether an unresolved task could still be backdated into the lapsed
   * window. Any task will do.
   * @param {{from: number, to: number}} win - the lapsed window.
   * @returns {boolean} true while the streak break is only provisional.
   */
  function windowCoverable(win) {
    return state.activeTasks.some(function (t) {
      var at = new Date(t.deadline).getTime();
      return at >= win.from && at <= win.to;
    });
  }

  /**
   * Whether the streak window has run out.
   * @param {Date} now - the reference moment.
   * @returns {boolean} true once nothing has been completed inside it.
   */
  function streakLapsed(now) {
    var win = streakWindow();
    if (!win) return false;
    return now.getTime() > win.to;
  }
```

---

### Block 9: Replace [falsedge.js lines 1289-1308](../falsedge.js#L1289-L1308)

```js
  /**
   * Breaks the streak: banks the run, zeroes `scr`, starts the lockdown.
   * Pushes no undo entry because that'd be stupid.
   * @param {Date} now - the moment it happens.
   * @param {number[]} hours - the windows that ran out, for the announcement.
   */
  function breakStreak(now, hours) {
    if (state.scr > 0) {
      insertHighScore(state.scr, dayKey(now));
    }
    state.scr = 0;
    state.lockdownEnd =
      new Date(now.getTime() + STREAK_LOCKDOWN_MS).toISOString();
    save();
    var msg = "streak broke";
    if (hours.length) {
      msg = "streak broke (" + hours.join(", ") + ")";
    }
    redToast(msg);
  }
```

With:

```js
  /**
   * Breaks the streak: banks the run, zeroes `scr`, starts the lockdown.
   * Pushes no undo entry because that'd be stupid.
   * @param {Date} now - the moment it happens.
   */
  function breakStreak(now) {
    if (state.scr > 0) {
      insertHighScore(state.scr, dayKey(now));
    }
    state.scr = 0;
    state.lockdownEnd =
      new Date(now.getTime() + STREAK_LOCKDOWN_MS).toISOString();
    save();
    redToast("streak broke");
  }
```

---

### Block 10: Replace [falsedge.js lines 1310-1353](../falsedge.js#L1310-L1353)

```js
  /**
   * Whether a completion feeds one streak window at all. A daily never feeds
   * the 48h window.
   * @param {string} type - "any" or "other".
   * @param {boolean} daily - whether the completed task was a daily.
   * @returns {boolean} true if the completion counts toward that window.
   */
  function completionFeeds(type, daily) {
    if (type === "other" && daily) {
      return false;
    }
    return true;
  }

  /**
   * Both streak windows' standing, pure so the renderer can ask freely.
   * @param {Date} now - the reference moment.
   * @param {{when: Date, daily: boolean}} [cover] - a completion being
   *   recorded; a window it lands inside is dropped.
   * @returns {{confirmed: number[], tentative: number[]}} the lapsed windows,
   *   split by whether an unresolved task could still cover them.
   */
  function streakStatus(now, cover) {
    var out = { confirmed: [], tentative: [] };
    lapsedStreakWindows(now).forEach(function (hours) {
      var type = "other";
      if (hours === 24) {
        type = "any";
      }
      var win = streakWindow(type);
      if (cover && completionFeeds(type, cover.daily)) {
        var t = cover.when.getTime();
        if (t >= win.from && t <= win.to) {
          return;
        }
      }
      if (windowCoverable(type, win)) {
        out.tentative.push(hours);
        return;
      }
      out.confirmed.push(hours);
    });
    return out;
  }
```

With:

```js
  /**
   * The streak window's standing, pure so the renderer can ask freely.
   * @param {Date} now - the reference moment.
   * @param {{when: Date}} [cover] - a completion being recorded; the window
   *   is dropped if that completion lands inside it.
   * @returns {string} "ok", "tentative" while an unresolved task could still
   *   cover the lapse, or "confirmed" once none can.
   */
  function streakStatus(now, cover) {
    if (!streakLapsed(now)) {
      return "ok";
    }
    var win = streakWindow();
    if (cover) {
      var t = cover.when.getTime();
      if (t >= win.from && t <= win.to) {
        return "ok";
      }
    }
    if (windowCoverable(win)) {
      return "tentative";
    }
    return "confirmed";
  }
```

---

### Block 11: Replace [falsedge.js lines 1361-1371](../falsedge.js#L1361-L1371)

```js
  function streakIndicatorText(now) {
    var left = lockdownLeft(now);
    if (left > 0) {
      return "streak broken. (" + Math.floor(left / (60 * 60 * 1000)) + "h)";
    }
    var tentative = streakStatus(now).tentative;
    if (!tentative.length) {
      return "";
    }
    return "streak broke? (" + tentative.join(", ") + ")";
  }
```

With:

```js
  function streakIndicatorText(now) {
    var left = lockdownLeft(now);
    if (left > 0) {
      return "streak broken. (" + Math.floor(left / (60 * 60 * 1000)) + "h)";
    }
    if (streakStatus(now) !== "tentative") {
      return "";
    }
    return "streak broke?";
  }
```

---

### Block 12: Replace [falsedge.js lines 1377-1386](../falsedge.js#L1377-L1386)

```js
   * @param {{when: Date, daily: boolean}} [cover] - a completion being
   *   recorded, whose stamp has not moved the windows yet.
   */
  function confirmStreakBreak(cover) {
    var now = getNow();
    var confirmed = streakStatus(now, cover).confirmed;
    if (confirmed.length) {
      breakStreak(now, confirmed);
    }
  }
```

With:

```js
   * @param {{when: Date}} [cover] - a completion being recorded, whose stamp
   *   has not moved the window yet.
   */
  function confirmStreakBreak(cover) {
    var now = getNow();
    if (streakStatus(now, cover) === "confirmed") {
      breakStreak(now);
    }
  }
```

---

### Block 13: Replace [falsedge.js lines 1618-1619](../falsedge.js#L1618-L1619)

```js
      confirmStreakBreak({ when: when, daily: task.daily === true });
      recordCompletion(task, when);
```

With:

```js
      confirmStreakBreak({ when: when });
      recordCompletion(when);
```

---

### Block 14: Replace [falsedge.js lines 2856-2880](../falsedge.js#L2856-L2880)

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

With:

```js
  /**
   * Hours left in the streak window, floored.
   * @param {Date} now - the reference moment.
   * @returns {string} the hours, or "-" when the window has no start.
   */
  function streakHoursLeft(now) {
    var win = streakWindow();
    if (!win) {
      return "-";
    }
    return String(Math.floor((win.to - now.getTime()) / (60 * 60 * 1000)));
  }

  /**
   * Builds the countdown riding the ACTIVE TASKS label.
   * @param {Date} now - the reference moment.
   * @returns {Element} the counter.
   */
  function buildStreakLeft(now) {
    return el("span", "streak-left", streakHoursLeft(now) + "/48h");
  }
```

---

### Block 15: changelog

increment: +0.0.1

- There is one streak window now, not two. Complete anything at all within 48 hours and the streak holds — dailies count the same as everything else.
- The 24-hour window is gone, and so is the rule that only non-dailies fed the 48-hour one.
- The counter on the ACTIVE TASKS label shows one figure instead of two, and the red warning reads `streak broke?` without a list of hours after it.
- Any lockdown running when this landed is cleared, and the window starts fresh from the next completion.
