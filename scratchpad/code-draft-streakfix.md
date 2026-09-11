# The streak break survives a completion — code draft

Two bugs, one cause. The streak break is never recorded; it is re-derived every time from `lastDailyAt` / `lastOtherAt`, and it is re-derived at inconsistent moments.

- `resolveTask` writes the new completion stamp **before** it calls the streak check, so the window slides forward and the gap it was meant to judge is already gone. Finishing anything at all — including a 0-point `none (failed)` — un-breaks the streak.
- `streakIndicator` is a module variable caching a value that is a pure function of `state`. Undo restores the state and nothing recomputes the variable, so the red text is stale until the next load or tab switch.

The fix is the gap check plus a command/query split:

- **Judge the windows before the stamp moves**, with the completed task already out of the stack so it cannot cover its own gap. A completion that lands *inside* a lapsed window still clears it — that is what `completed before` is for.
- **The check stops answering questions.** `streakStatus(now, cover)` is pure and returns the answer; only the destructive half remains in the caller. `render()` calls the pure one, so `streakIndicator` is deleted and there is nothing left to keep in sync.

## The name shift

After the split each function does the job the *next* name already describes, so the names move down one slot rather than a new one being invented:

| what it does | called now | becomes |
| --- | --- | --- |
| answers "did a window lapse?" | — | `streakStatus` |
| decides, then triggers the streak break | `checkStreak` | `confirmStreakBreak` |
| banks, zeroes, 36h lockdown, red toast | `confirmStreakBreak` | `breakStreak` |
| builds the red indicator text | — | `streakIndicatorText` |

`streakBroke()`, the manual button's handler, keeps its name.

## Open, decide while reading

1. The streak check is added to undo/redo, so an undo can confirm a streak break on the spot — the same as returning to the tab does today. Say if undo should stay silent instead.
2. `resolveTask` runs the check twice: once before the stamp moves, once after. The second catches the case where a backdated completion clears the old window but leaves a newer gap behind it. Say if that should wait for the next event.
3. `streakBroke` and `breakStreak` are the same two words in either order and now sit in the same file. Say if the handler should be renamed too.
4. Not touched here: a completion worth 0 points still feeds the streak, because `resolveTask` branches on `kind` rather than on `award`. That is [i33]'s territory.

---

### Block 1: Replace [falsedge.js lines 654-655](../falsedge.js#L654-L655)

```js
    undoWriteWithRetry(writeUndoIndex);
    render();
```

With:

```js
    undoWriteWithRetry(writeUndoIndex);
    confirmStreakBreak();
    render();
```

---

### Block 2: Remove [falsedge.js lines 1108-1110](../falsedge.js#L1108-L1110)

```js

  // What the indicator text reads. Not saved to undo/storage.
  var streakIndicator = "";
```

---

### Block 3: Replace [falsedge.js lines 1249-1269](../falsedge.js#L1249-L1269)

```js
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
```

With:

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

---

### Block 4: Replace [falsedge.js lines 1271-1299](../falsedge.js#L1271-L1299)

```js
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
        type = "any";
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
```

With:

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

  /**
   * The red indicator's text, worked out fresh at every draw.
   * @param {Date} now - the reference moment.
   * @returns {string} the text, or "" when nothing is provisionally lapsed.
   */
  function streakIndicatorText(now) {
    var tentative = streakStatus(now).tentative;
    if (!tentative.length) {
      return "";
    }
    return "streak broke? (" + tentative.join(", ") + ")";
  }

  /**
   * Breaks the streak if a lapsed window is past covering.
   * No undo OBVIOUSLY because tIME ISN'T UNDOABLE. this line is only here 
   * bcuz claude is a fCKING IDIOT WHO THINKS UNDO CAN MEAN TIME TRAVELING. 
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

---

### Block 5: Replace [falsedge.js line 1329](../falsedge.js#L1329)

```js
    confirmStreakBreak(getNow(), []);
```

With:

```js
    breakStreak(getNow(), []);
```

---

### Block 6: Replace [falsedge.js lines 1517-1525](../falsedge.js#L1517-L1525)

```js
    if (kind === "complete") {
      recordCompletion(task, when);
    }
    var at = indexOfTask(id);
    if (at !== -1) {
      state.activeTasks.splice(at, 1);
    }
    save();
    checkStreak();
```

With:

```js
    var at = indexOfTask(id);
    if (at !== -1) {
      state.activeTasks.splice(at, 1);
    }
    if (kind === "complete") {
      confirmStreakBreak({ when: when, daily: task.daily === true });
      recordCompletion(task, when);
    }
    save();
    confirmStreakBreak();
```

---

### Block 7: Replace [falsedge.js lines 2421-2423](../falsedge.js#L2421-L2423)

```js
    if (streakIndicator) {
      wrap.appendChild(el("div", "streak-indicator", streakIndicator));
    }
```

With:

```js
    var indicator = streakIndicatorText(getNow());
    if (indicator) {
      wrap.appendChild(el("div", "streak-indicator", indicator));
    }
```

---

### Block 8: Replace [falsedge.js line 3359](../falsedge.js#L3359)

```js
    checkStreak();
```

With:

```js
    confirmStreakBreak();
```

---

### Block 9: Replace [falsedge.js line 3365](../falsedge.js#L3365)

```js
  checkStreak();
```

With:

```js
  confirmStreakBreak();
```

---

### Block 10: changelog

increment: +0.0.1

- Fixed: finishing a task used to un-break a streak that had already broken. The completion stamp was written before the streak was checked, so the missed window slid out of view and the streak came back. Completing something *inside* the missed window still clears it, as it always did.
- Fixed: `streak broke?` now redraws after undo and redo instead of showing whatever it last said.