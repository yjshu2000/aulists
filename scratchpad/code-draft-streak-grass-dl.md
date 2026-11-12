# Streak = combo, grass for edits & 2048s, DL — code draft

Last updated: 2026-11-10 21:13

Three features, one draft:

1. **Streak and combo merge.** The combo becomes the streak (renamed everywhere, label `SE:`). Setting a task adds +6h while under 24h left, +2h once 24h or over (overshoot allowed, same as today), capped at 36h from now. The +0.1/day bonus stays. The window running out breaks the streak: score banked and zeroed, 36h lockdown, streak cleared. No streak, no break. The old 48h completion window, the `x/48h` counter and the `streak broke?` warning are deleted.
2. **Grass.**
   - Editing an active task costs grass: 1, then 2, then 3… per task. Text is one edit. Time + date + mode in one editor session is one edit, committed when the editor closes. An invalid draft toasts and is thrown away for free. Overlays show the price; not enough grass toasts `need N grass` and blocks.
   - Falsedge never writes `grass.count`. It keeps `state.grassSpent`, and the balance is `grass.count − grassSpent`, so undo refunds edits without ever touching Hex earnings. Redo can push the balance negative.
   - Hex 2^: every merge that makes a 2048 pays +2, popping `+2 🌱` over the tile. Paid tile ids are kept outside undo, so undo-and-replay can't farm it. A one-off retroactive payout counts every tile ≥ 2048 on all four saved boards (an 8192 counts as 4), then toasts.
3. **DL** (double leniency): tiers at 0/20/60/120 min, same 6/3/2/1 pts. Button order `DL WL HL MT`; mode buttons trimmed from 16px to 12px side padding.

**Note (D7):** active tasks that exist before this lands have no `edits` field, so their price would read `NaN`. Cancel and re-set any still-active tasks after updating; no migration code.

---

### Block 1: Replace [falsedge.js lines 16–39](../falsedge.js#L16-L39)

```js
  // auto streak breakers + lockdown
  var STREAK_WINDOW_MS = 48 * 60 * 60 * 1000;
  var STREAK_LOCKDOWN_MS = 36 * 60 * 60 * 1000;
  var STREAK_GRACE_MS = 12 * 60 * 60 * 1000;
  // Combo: lives in `state`, so undo rewinds it with everything else. Setting
  // a task adds +4h to the combo window while under 16h remaining, +1h once
  // 16h or over, capping at +24h. Pays +0.1 pts per calendar day of active
  // combo, capping at +1.0 (day 10).
  var COMBO_STEP_MS = 4 * 60 * 60 * 1000;
  var COMBO_SLOW_STEP_MS = 1 * 60 * 60 * 1000;
  var COMBO_SLOW_THRESHOLD_MS = 16 * 60 * 60 * 1000;
  var COMBO_MAX_MS = 24 * 60 * 60 * 1000;
  var COMBO_DAY_AWARD = 0.1;
  var COMBO_MAX_AWARD = 1.0;
  var TIER_POINTS = [6, 3, 2, 1];
  // Leniency: minutes past the deadline that still score, one entry per tier.
  // WL = whole leniency
  // HL = half leniency
  // MT = micro task
  var WL_OFFSETS = [0, 10, 30, 60];
  var HL_OFFSETS = [0, 5, 15, 30];
  var MT_OFFSETS = [0, 60];
  var MT_POINTS = [2, 1];
  var MODES = ["WL", "HL", "MT"];
```

With:

```js
  // Streak: lives in `state`, so undo rewinds it with everything else. Setting
  // a task adds +6h to the streak window while under 24h remaining, +2h once
  // 24h or over, capping at +36h. Pays +0.1 pts per calendar day of active
  // streak, capping at +1.0 (day 10). Running out breaks the streak.
  var STREAK_STEP_MS = 6 * 60 * 60 * 1000;
  var STREAK_SLOW_STEP_MS = 2 * 60 * 60 * 1000;
  var STREAK_SLOW_THRESHOLD_MS = 24 * 60 * 60 * 1000;
  var STREAK_MAX_MS = 36 * 60 * 60 * 1000;
  var STREAK_DAY_AWARD = 0.1;
  var STREAK_MAX_AWARD = 1.0;
  // a broken streak locks task setting out this long
  var STREAK_LOCKDOWN_MS = 36 * 60 * 60 * 1000;
  // grass on hand is this stored count less `state.grassSpent`
  var GRASS_KEY = "grass.count";
  var TIER_POINTS = [6, 3, 2, 1];
  // Leniency: minutes past the deadline that still score, one entry per tier.
  // DL = double leniency
  // WL = whole leniency
  // HL = half leniency
  // MT = micro task
  var DL_OFFSETS = [0, 20, 60, 120];
  var WL_OFFSETS = [0, 10, 30, 60];
  var HL_OFFSETS = [0, 5, 15, 30];
  var MT_OFFSETS = [0, 60];
  var MT_POINTS = [2, 1];
  var MODES = ["DL", "WL", "HL", "MT"];
```

---

### Block 2: Replace [falsedge.js lines 70–71](../falsedge.js#L70-L71)

```js
  // id of the active task whose deadline/mode editor is open, if any
  var timeEditId = null;
```

With:

```js
  // id of the active task whose deadline/mode editor is open, if any, and the
  // unsaved {clock, date, heldDate, mode} it holds until it closes
  var timeEditId = null;
  var timeEditDraft = null;
```

---

### Block 3: Replace [falsedge.js lines 334–336](../falsedge.js#L334-L336)

```js
   * @param {*} m - a stored or proposed mode.
   * @returns {boolean} true for "WL", "HL" or "MT".
   */
```

With:

```js
   * @param {*} m - a stored or proposed mode.
   * @returns {boolean} true for "DL", "WL", "HL" or "MT".
   */
```

---

### Block 4: Replace [falsedge.js lines 363–364](../falsedge.js#L363-L364)

```js
   *
   * Three things about the shape that the fields themselves don't record:
```

With:

```js
   *
   * A few things about the shape that the fields themselves don't record:
```

---

### Block 5: Replace [falsedge.js lines 373–377](../falsedge.js#L373-L377)

```js
   * An active task is {id, text, deadline, mode, sourceRowId, hadDate}, and
   * `sourceRowId` points at the `others` row it was spawned from. Deleting that
   * row is deliberately never blocked, so the id may point at nothing; a miss
   * is the documented case, not a bug to guard against.
   *
```

With:

```js
   * An active task is {id, text, deadline, mode, edits, sourceRowId, hadDate},
   * and `sourceRowId` points at the `others` row it was spawned from. Deleting
   * that row is deliberately never blocked, so the id may point at nothing; a
   * miss is the documented case, not a bug to guard against.
   *
   * `edits` counts an active task's paid edits; the next one costs edits + 1
   * grass. `grassSpent` totals every such payment, inside `state` so that undo
   * refunds it.
   *
```

---

### Block 6: Replace [falsedge.js lines 395–397](../falsedge.js#L395-L397)

```js
      lastDoneAt: null,
      lockdownEnd: null,
      combo: null
```

With:

```js
      lockdownEnd: null,
      streak: null,
      grassSpent: 0
```

---

### Block 7: Replace [falsedge.js lines 479–489](../falsedge.js#L479-L489)

```js
    if (typeof raw.lastDoneAt === "string") {
      s.lastDoneAt = raw.lastDoneAt;
      if (typeof raw.lockdownEnd === "string") {
        s.lockdownEnd = raw.lockdownEnd;
      }
    }
    if (raw.combo && typeof raw.combo === "object" &&
      typeof raw.combo.startDay === "string" &&
      typeof raw.combo.end === "number") {
      s.combo = { startDay: raw.combo.startDay, end: raw.combo.end };
    }
```

With:

```js
    if (typeof raw.lockdownEnd === "string") {
      s.lockdownEnd = raw.lockdownEnd;
    }
    if (raw.streak && typeof raw.streak === "object" &&
      typeof raw.streak.startDay === "string" &&
      typeof raw.streak.end === "number") {
      s.streak = { startDay: raw.streak.startDay, end: raw.streak.end };
    }
    if (typeof raw.grassSpent === "number") {
      s.grassSpent = raw.grassSpent;
    }
```

---

### Block 8: Replace [falsedge.js lines 724–728](../falsedge.js#L724-L728)

```js
    state = JSON.parse(JSON.stringify(target));
    save();
    undoWriteWithRetry(writeUndoIndex);
    confirmStreakBreak();
    render();
```

With:

```js
    state = JSON.parse(JSON.stringify(target));
    save();
    undoWriteWithRetry(writeUndoIndex);
    // an open time editor's draft belongs to the state just left
    timeEditId = null;
    timeEditDraft = null;
    confirmStreakBreak();
    render();
```

---

### Block 9: Replace [falsedge.js lines 925–932](../falsedge.js#L925-L932)

```js
    var offsets = WL_OFFSETS;
    var points = TIER_POINTS;
    if (task.mode === "HL") {
      offsets = HL_OFFSETS;
    } else if (task.mode === "MT") {
      offsets = MT_OFFSETS;
      points = MT_POINTS;
    }
```

With:

```js
    var offsets = WL_OFFSETS;
    var points = TIER_POINTS;
    if (task.mode === "DL") {
      offsets = DL_OFFSETS;
    } else if (task.mode === "HL") {
      offsets = HL_OFFSETS;
    } else if (task.mode === "MT") {
      offsets = MT_OFFSETS;
      points = MT_POINTS;
    }
```

---

### Block 10: Replace [falsedge.js lines 969–973](../falsedge.js#L969-L973)

```js
  function refuseTimeEdit() {
    toast("too late >:p");
    timeEditId = null;
    render();
  }
```

With:

```js
  function refuseTimeEdit() {
    toast("too late >:p");
    timeEditId = null;
    timeEditDraft = null;
    render();
  }
```

---

### Block 11: Replace [falsedge.js lines 1194–1196](../falsedge.js#L1194-L1196)

```js
  // ---------------------------------- streak ---------------------------------
  /* Auto streak breaker. Minimum 1 task of any kind in the last 48h. Time
   * checks last completion or last lockdown end.
```

With:

```js
  // ---------------------------------- streak ---------------------------------
  /* Auto streak breaker. A streak window (see the streak window section) that
   * runs out breaks the streak and locks task setting for 36h.
```

Deletes `recordCompletion`, `stampTime` and `lastCompletionAt`. Completions no longer feed the streak.

---

### Block 12: Replace [falsedge.js lines 1205–1238](../falsedge.js#L1205-L1238)

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

  /**
   * Parses one stored completion stamp.
   * @param {string|null} raw - an ISO string, or null.
   * @returns {number} its time in ms, or 0 when absent or unparseable.
   */
  function stampTime(raw) {
    if (!raw) return 0;
    var t = new Date(raw).getTime();
    if (isNaN(t)) return 0;
    return t;
  }

  /**
   * When anything was last completed.
   * @returns {number} its time in ms, or 0 if there has never been one.
   */
  function lastCompletionAt() {
    return stampTime(state.lastDoneAt);
  }

  /**
   * Milliseconds left on the lockdown a streak break started.
```

With:

```js
  /**
   * Milliseconds left on the lockdown a streak break started.
```

Deletes the 48h window (`streakWindowStart`, `streakWindow`, `windowCoverable`, `streakStatus`) and the backdate-coverage logic. `lockdownLeft` and `lockdownClear` above stay untouched.

---

### Block 13: Replace [falsedge.js lines 1262–1389](../falsedge.js#L1262-L1389)

```js
  }

  /**
   * Where one streak window starts: its own last completion, or the end of a
   * lockdown plus its grace, whichever is later.
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

  /**
   * The red indicator's text, worked out fresh at every draw.
   * @param {Date} now - the reference moment.
   * @returns {string} the text, or "" when the streak is neither broken nor
   *   provisionally lapsed.
   */
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

  /**
   * Breaks the streak if a lapsed window is past covering.
   * No undo OBVIOUSLY because tIME ISN'T UNDOABLE. this line is only here
   * bcuz claude is a fCKING IDIOT WHO THINKS UNDO CAN MEAN TIME TRAVELING.
   * @param {{when: Date}} [cover] - a completion being recorded, whose stamp
   *   has not moved the window yet.
   */
  function confirmStreakBreak(cover) {
    var now = getNow();
    if (streakStatus(now, cover) === "confirmed") {
      breakStreak(now);
    }
  }

  // its own element and timer, so an ordinary toast cannot overwrite it
```

With:

```js
  }

  /**
   * Whether the streak window has run out. With no streak nothing can, so a
   * lockdown can never chain into another one on its own.
   * @param {Date} now - the reference moment.
   * @returns {boolean} true once a streak exists and its end has passed.
   */
  function streakLapsed(now) {
    if (!state.streak) return false;
    return now.getTime() >= state.streak.end;
  }

  /**
   * Breaks the streak: banks the run, zeroes `scr`, ends the streak, starts the
   * lockdown. Pushes no undo entry because that'd be stupid.
   * @param {Date} now - the moment it happens.
   */
  function breakStreak(now) {
    if (state.scr > 0) {
      insertHighScore(state.scr, dayKey(now));
    }
    state.scr = 0;
    state.streak = null;
    state.lockdownEnd =
      new Date(now.getTime() + STREAK_LOCKDOWN_MS).toISOString();
    save();
    redToast("streak broke");
  }

  /**
   * The red indicator's text, worked out fresh at every draw.
   * @param {Date} now - the reference moment.
   * @returns {string} the lockdown countdown, or "" when none is running.
   */
  function streakIndicatorText(now) {
    var left = lockdownLeft(now);
    if (left > 0) {
      return "streak broken. (" + Math.floor(left / (60 * 60 * 1000)) + "h)";
    }
    return "";
  }

  /**
   * Breaks the streak if its window has run out.
   * No undo OBVIOUSLY because tIME ISN'T UNDOABLE. this line is only here
   * bcuz claude is a fCKING IDIOT WHO THINKS UNDO CAN MEAN TIME TRAVELING.
   */
  function confirmStreakBreak() {
    var now = getNow();
    if (streakLapsed(now)) {
      breakStreak(now);
    }
  }

  // its own element and timer, so an ordinary toast cannot overwrite it
```

Completing no longer stamps the streak. `render()` breaks a lapsed streak itself now (block 28), so the second check here goes too.

---

### Block 14: Replace [falsedge.js lines 1619–1625](../falsedge.js#L1619-L1625)

```js
    if (kind === "complete") {
      confirmStreakBreak({ when: when });
      recordCompletion(when);
    }
    save();
    confirmStreakBreak();
    render();
```

With:

```js
    save();
    render();
```

---

### Block 15: Replace [falsedge.js lines 1704–1722](../falsedge.js#L1704-L1722)

```js
  /**
   * Renames an active task. An empty value cancels rather than saving an empty
   * name.
   * @param {string} id - the task id.
   * @param {string} raw - the proposed replacement text, untrimmed.
   */
  function editTaskText(id, raw) {
    var task = findTask(id);
    if (!task) return;
    var v = raw.trim();
    if (v === "") {
      render();
      return;
    }
    pushUndo("edit task text");
    task.text = v;
    save();
    render();
  }
```

With:

```js
  /**
   * Renames an active task, for grass. An empty or unchanged value cancels
   * rather than saving, and costs nothing.
   * @param {string} id - the task id.
   * @param {string} raw - the proposed replacement text, untrimmed.
   */
  function editTaskText(id, raw) {
    var task = findTask(id);
    if (!task) return;
    var v = raw.trim();
    if (v === "" || v === task.text) {
      render();
      return;
    }
    if (!canAffordEdit(task)) {
      render();
      return;
    }
    pushUndo("edit task text");
    chargeEdit(task);
    task.text = v;
    save();
    render();
  }
```

Replaces `editTaskDate`, `editTaskTime`, `commitTaskDeadline` and `editTaskMode`, which each saved instantly, with a draft that commits once, on close. `taskDateCeiling` above stays.

---

### Block 16: Replace [falsedge.js lines 1740–1852](../falsedge.js#L1740-L1852)

```js
  }

  /**
   * Moves an active task's deadline to a new day, keeping its clock time. An
   * empty date re-resolves to the clock time's next occurrence, which is how
   * a further task is pulled back inside 24h.
   * @param {string} id - the task id.
   * @param {string} date - a day key, "YYYY-MM-DD", or "" for none.
   */
  function editTaskDate(id, date) {
    var task = findTask(id);
    if (!task) return;
    var now = getNow();
    if (date && !dateInRange(date, now)) {
      toast("invalid date");
      render();
      return;
    }
    var clock = hhmm(new Date(task.deadline));
    commitTaskDeadline(id, resolveDeadline(clock, date, now), now,
      "edit task date", "invalid datetime");
  }

  /**
   * Moves an active task's deadline. Validated exactly as SET validates a new
   * one - resolved from `getNow()` at tap time, refused if it is not in the
   * future, and refused if another active task already holds that instant. The
   * task's own deadline is excluded from the overlap check, since a task can
   * hardly clash with itself.
   *
   * A further task keeps its day. The editor only offers clock times, so
   * re-resolving one against `now` would silently drag it back inside 24h and
   * strip the very thing that made it further.
   * @param {string} id - the task id.
   * @param {string} clock - the chosen clock time, "HH:MM".
   */
  function editTaskTime(id, clock) {
    var task = findTask(id);
    if (!task) return;
    var now = getNow();
    var deadline;
    if (isFurther(task.deadline, now)) {
      deadline = resolveDeadline(clock, dayKey(new Date(task.deadline)), now);
    } else {
      deadline = resolveClockTime(clock, now);
    }
    commitTaskDeadline(id, deadline, now, "edit task time", "refreshed");
  }

  /**
   * Refuses a proposed deadline that is not in the future, or that overlaps
   * another task, then commits it. The task's own deadline is excluded from the
   * overlap check, since a task can hardly clash with itself. Refused outright
   * once that deadline has passed.
   * @param {string} id - the task id.
   * @param {Date} deadline - the proposed replacement.
   * @param {Date} now - the reference moment.
   * @param {string} label - the undo label.
   * @param {string} tooSoon - toast for a deadline not in the future.
   */
  function commitTaskDeadline(id, deadline, now, label, tooSoon) {
    var task = findTask(id);
    if (!task) return;
    if (deadlinePassed(task, now)) {
      refuseTimeEdit();
      return;
    }
    if (deadline.getTime() <= now.getTime()) {
      toast(tooSoon);
      render();
      return;
    }
    var clash = state.activeTasks.some(function (t) {
      return t.id !== id &&
        new Date(t.deadline).getTime() === deadline.getTime();
    });
    if (clash) {
      toast(hhmm(deadline) + " overlaps");
      return;
    }
    var iso = deadline.toISOString();
    if (task.deadline === iso) return;
    pushUndo(label);
    task.deadline = iso;
    save();
    // re-sorting under an open editor would move the block mid-edit
    if (timeEditId === id) return;
    render();
  }

  /**
   * Switches an active task's leniency, which reshapes its tier rows. Unlike
   * SET's toggles this one can't clear back to unset - an active task always
   * has a mode, so tapping the lit one is a no-op. Refused once the deadline
   * has passed.
   * @param {string} id - the task id.
   * @param {string} mode - "WL", "HL" or "MT".
   */
  function editTaskMode(id, mode) {
    var task = findTask(id);
    if (!task) return;
    if (task.mode === mode) return;
    if (deadlinePassed(task, getNow())) {
      refuseTimeEdit();
      return;
    }
    pushUndo("edit task mode");
    task.mode = mode;
    save();
    render();
  }

  /**
```

With:

```js
  }

  /**
   * Opens a task's deadline/leniency editor, holding its current values as an
   * unsaved draft.
   * @param {Object} task - the active task.
   * @param {Date} now - the reference moment.
   */
  function openTimeEdit(task, now) {
    // an overdue deadline sits outside the picker's bounds, so it holds empty
    var held = dayKey(new Date(task.deadline));
    if (!dateInRange(held, now)) {
      held = "";
    }
    timeEditId = task.id;
    timeEditDraft = {
      clock: hhmm(new Date(task.deadline)),
      date: held,
      heldDate: held,
      mode: task.mode
    };
  }

  /**
   * Resolves the draft's clock and date into a deadline. An untouched date
   * keeps the task's own day if it's further, since re-resolving a clock time
   * against `now` would drag it back inside 24h. Otherwise the clock takes its
   * next occurrence, and a changed date pairs with it directly.
   * @param {Object} task - the active task.
   * @param {Object} draft - the editor's draft.
   * @param {Date} now - the reference moment.
   * @returns {Date} the proposed deadline.
   */
  function draftDeadline(task, draft, now) {
    if (draft.date !== draft.heldDate) {
      return resolveDeadline(draft.clock, draft.date, now);
    }
    if (isFurther(task.deadline, now)) {
      return resolveDeadline(draft.clock,
        dayKey(new Date(task.deadline)), now);
    }
    return resolveClockTime(draft.clock, now);
  }

  /**
   * Closes the time editor and commits its draft as one paid edit. A draft that
   * changes nothing closes for free; one that's invalid toasts why and is
   * thrown away, also for free.
   */
  function closeTimeEdit() {
    var task = findTask(timeEditId);
    var draft = timeEditDraft;
    timeEditId = null;
    timeEditDraft = null;
    if (!task || !draft) {
      render();
      return;
    }
    var now = getNow();
    var deadline = draftDeadline(task, draft, now);
    var iso = deadline.toISOString();
    if (iso === task.deadline && draft.mode === task.mode) {
      render();
      return;
    }
    if (deadlinePassed(task, now)) {
      refuseTimeEdit();
      return;
    }
    if (draft.date && !dateInRange(draft.date, now)) {
      toast("invalid date");
      render();
      return;
    }
    if (deadline.getTime() <= now.getTime()) {
      toast("invalid datetime");
      render();
      return;
    }
    // a task can hardly clash with itself, so its own deadline is skipped
    var clash = state.activeTasks.some(function (t) {
      return t.id !== task.id &&
        new Date(t.deadline).getTime() === deadline.getTime();
    });
    if (clash) {
      toast(hhmm(deadline) + " overlaps");
      render();
      return;
    }
    if (!canAffordEdit(task)) {
      render();
      return;
    }
    pushUndo("edit task time");
    chargeEdit(task);
    task.deadline = iso;
    task.mode = draft.mode;
    save();
    render();
  }

  /**
```

The combo section becomes the streak window section, renamed throughout, with the grass helpers added above it. The `ago` branch of the indicator goes: `render()` breaks and clears a lapsed streak before drawing (block 28), so the row only ever counts down.

---

### Block 17: Replace [falsedge.js lines 1892–1997](../falsedge.js#L1892-L1997)

```js
  // --------------------------------- combo -----------------------------------
  /**
   * Calendar day count of the active combo (1–10).
   * @param {Date} now - the reference moment.
   * @returns {number}
   */
  function comboDays(now) {
    var c = state.combo;
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
   * Advances the combo window on task set: +4h while under 16h remaining,
   * +1h once 16h or over, capped at +24h. Updates the calendar start day,
   * awards the bonus. Rides the caller's undo entry.
   * @param {Date} now - the reference moment.
   */
  function awardComboSet(now) {
    var c = state.combo;
    var award = COMBO_DAY_AWARD;
    if (c && now.getTime() < c.end) {
      award = comboAward(now);
      var remainingMs = c.end - now.getTime();
      var step = COMBO_STEP_MS;
      if (remainingMs >= COMBO_SLOW_THRESHOLD_MS) {
        step = COMBO_SLOW_STEP_MS;
      }
      state.combo = {
        startDay: c.startDay,
        end: Math.min(
          c.end + step,
          now.getTime() + COMBO_MAX_MS)
      };
    } else {
      state.combo = {
        startDay: dayKey(now),
        end: now.getTime() + COMBO_STEP_MS
      };
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
    var c = state.combo;
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

  /**
```

With:

```js
  // ---------------------------------- grass ----------------------------------
  /**
   * The grass on hand: Hex 2^'s stored count less what Falsedge has spent.
   * @returns {number} the balance, which a redo can leave negative.
   */
  function grassBalance() {
    var stored = 0;
    try {
      stored = parseInt(localStorage.getItem(GRASS_KEY) || "0", 10) || 0;
    } catch (e) {
      // storage blocked; nothing is on hand
    }
    return stored - state.grassSpent;
  }

  /**
   * What a task's next edit costs: one more than the edit before it.
   * @param {Object} task - the active task.
   * @returns {number} the price in grass.
   */
  function editCost(task) {
    return task.edits + 1;
  }

  /**
   * Refuses an edit the balance can't cover, toasting the price.
   * @param {Object} task - the active task.
   * @returns {boolean} true if the edit may go ahead.
   */
  function canAffordEdit(task) {
    var cost = editCost(task);
    if (grassBalance() < cost) {
      toast("need " + cost + " grass");
      return false;
    }
    return true;
  }

  /**
   * Pays for an edit. Both counters live in `state`, so the edit's own undo
   * entry refunds it.
   * @param {Object} task - the active task.
   */
  function chargeEdit(task) {
    state.grassSpent += editCost(task);
    task.edits += 1;
  }

  // ------------------------------ streak window ------------------------------
  /**
   * Calendar day count of the active streak (1–10).
   * @param {Date} now - the reference moment.
   * @returns {number}
   */
  function streakDays(now) {
    var c = state.streak;
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
  function streakAward(now) {
    return roundScr(
      Math.min(STREAK_MAX_AWARD,
        streakDays(now) * STREAK_DAY_AWARD));
  }

  /**
   * Advances the streak window on task set: +6h while under 24h remaining, +2h
   * once 24h or over, capped at +36h. Updates the calendar start day, awards
   * the bonus. Rides the caller's undo entry.
   * @param {Date} now - the reference moment.
   */
  function awardStreakSet(now) {
    var c = state.streak;
    var award = STREAK_DAY_AWARD;
    if (c && now.getTime() < c.end) {
      award = streakAward(now);
      var remainingMs = c.end - now.getTime();
      var step = STREAK_STEP_MS;
      if (remainingMs >= STREAK_SLOW_THRESHOLD_MS) {
        step = STREAK_SLOW_STEP_MS;
      }
      state.streak = {
        startDay: c.startDay,
        end: Math.min(
          c.end + step,
          now.getTime() + STREAK_MAX_MS)
      };
    } else {
      state.streak = {
        startDay: dayKey(now),
        end: now.getTime() + STREAK_STEP_MS
      };
    }
    var before = Math.floor(state.scr);
    state.scr = roundScr(state.scr + award);
    state.pts =
      state.pts + (Math.floor(state.scr) - before);
  }

  /**
   * Builds the streak indicator above the active tasks card, counting down to
   * the window's end.
   * @param {Date} now - the reference moment.
   * @returns {Element|null} null while there's no streak.
   */
  function buildStreakRow(now) {
    var c = state.streak;
    if (!c) return null;
    // render() breaks a lapsed streak before drawing, so time is always left
    var leftMs = c.end - now.getTime();
    var h = Math.floor(leftMs / (60 * 60 * 1000));
    var m = Math.floor(
      (leftMs % (60 * 60 * 1000)) / (60 * 1000));
    var row = el("div", "streak-row");
    var bar = el("div", "streak-bar");
    var p = Math.min(1, leftMs / STREAK_MAX_MS);
    bar.style.width = (p * 100).toFixed(1) + "%";
    row.appendChild(bar);
    row.appendChild(el("span", "streak-text", "SE: in " + h + "h" +
      pad2(m) + "m at " + hhmm(new Date(c.end))));
    return row;
  }

  /**
```

A streak can lapse while the page sits open, so setting checks first. Otherwise the set would quietly start a fresh streak over the one that should have broken.

---

### Block 18: Replace [falsedge.js lines 2001–2003](../falsedge.js#L2001-L2003)

```js
  function submitSet() {
    var now = getNow();
    if (!lockdownClear(now)) return;
```

With:

```js
  function submitSet() {
    var now = getNow();
    confirmStreakBreak();
    if (!lockdownClear(now)) return;
```

---

### Block 19: Replace [falsedge.js lines 2028–2035](../falsedge.js#L2028-L2035)

```js
    pushUndo("set task");
    awardComboSet(now);
    state.activeTasks.push({
      id: uid(),
      text: text,
      deadline: deadline.toISOString(),
      mode: mode
    });
```

With:

```js
    pushUndo("set task");
    awardStreakSet(now);
    state.activeTasks.push({
      id: uid(),
      text: text,
      deadline: deadline.toISOString(),
      mode: mode,
      edits: 0
    });
```

---

### Block 20: Replace [falsedge.js lines 2249–2257](../falsedge.js#L2249-L2257)

```js
    var now = getNow();
    if (!lockdownClear(now)) return;
    var text = String(row.text).trim();
    if (!text) {
      toast("Task needs text");
      return;
    }
    if (!isMode(row.mode)) {
      toast("Pick WL, HL or MT");
```

With:

```js
    var now = getNow();
    confirmStreakBreak();
    if (!lockdownClear(now)) return;
    var text = String(row.text).trim();
    if (!text) {
      toast("Task needs text");
      return;
    }
    if (!isMode(row.mode)) {
      toast("Pick DL, WL, HL or MT");
```

---

### Block 21: Replace [falsedge.js lines 2288–2295](../falsedge.js#L2288-L2295)

```js
    pushUndo("activate row");
    awardComboSet(now);
    var task = {
      id: uid(),
      text: text,
      deadline: iso,
      mode: row.mode
    };
```

With:

```js
    pushUndo("activate row");
    awardStreakSet(now);
    var task = {
      id: uid(),
      text: text,
      deadline: iso,
      mode: row.mode,
      edits: 0
    };
```

An optional fourth argument prices the overlay. The two ACTIVATE row callers pass nothing and stay free.

---

### Block 22: Replace [falsedge.js lines 2745–2769](../falsedge.js#L2745-L2769)

```js
  /**
   * Wires the `edit?` overlay onto a piece of text: tapping the text shows the
   * overlay, tapping the overlay swaps it for an inline editor, and tapping
   * anywhere else dismisses it.
   * @param {Element} host - the text's positioning parent, which the overlay
   *   is appended to.
   * @param {string} sel - selector for the text element inside `host`.
   * @param {Function} onCommit - called once with the raw edited value.
   */
  function attachTextEdit(host, sel, onCommit) {
    var textEl = host.querySelector(sel);
    textEl.addEventListener("click", function (e) {
      e.stopPropagation();
      closeEditOverlays();
      var overlay = el("button", "edit-overlay", "edit?");
      overlay.addEventListener("click", function (ev) {
        ev.stopPropagation();
        closeEditOverlays();
        var live = host.querySelector(sel);
        if (!live) return;
        inlineEdit(live, live.textContent, onCommit);
      });
      host.appendChild(overlay);
    });
  }
```

With:

```js
  /**
   * Wires the `edit?` overlay onto a piece of text: tapping the text shows the
   * overlay, tapping the overlay swaps it for an inline editor, and tapping
   * anywhere else dismisses it.
   * @param {Element} host - the text's positioning parent, which the overlay
   *   is appended to.
   * @param {string} sel - selector for the text element inside `host`.
   * @param {Function} onCommit - called once with the raw edited value.
   * @param {Function} [pricedTask] - returns the active task the edit is
   *   charged to, which puts its price on the overlay and gates the editor.
   */
  function attachTextEdit(host, sel, onCommit, pricedTask) {
    var textEl = host.querySelector(sel);
    textEl.addEventListener("click", function (e) {
      e.stopPropagation();
      closeEditOverlays();
      var label = "edit?";
      if (pricedTask && pricedTask()) {
        label = "edit? (" + editCost(pricedTask()) + " grass)";
      }
      var overlay = el("button", "edit-overlay", label);
      overlay.addEventListener("click", function (ev) {
        ev.stopPropagation();
        closeEditOverlays();
        if (pricedTask) {
          var task = pricedTask();
          if (!task || !canAffordEdit(task)) return;
        }
        var live = host.querySelector(sel);
        if (!live) return;
        inlineEdit(live, live.textContent, onCommit);
      });
      host.appendChild(overlay);
    });
  }
```

---

### Block 23: Replace [falsedge.js lines 2789–2855](../falsedge.js#L2789-L2855)

```js
  /**
   * Wires the `edit time?` overlay onto a task's tier rows, the same shape as
   * the `edit?` overlay on its text. Once the deadline has passed, tapping it
   * toasts instead of opening the editor.
   * @param {Element} wrap - the tier-row wrapper (the positioning parent).
   * @param {string} id - the task id.
   */
  function attachTimeEdit(wrap, id) {
    wrap.addEventListener("click", function (e) {
      e.stopPropagation();
      closeEditOverlays();
      var overlay = el("button", "edit-overlay", "edit time?");
      overlay.addEventListener("click", function (ev) {
        ev.stopPropagation();
        closeEditOverlays();
        var task = findTask(id);
        if (!task) return;
        if (deadlinePassed(task, getNow())) {
          refuseTimeEdit();
          return;
        }
        timeEditId = id;
        render();
      });
      wrap.appendChild(overlay);
    });
  }

  /**
   * Builds the deadline/leniency editor that replaces a task's tier rows
   * while it's open. Every control commits on change, and the editor stays
   * open across a commit so time, mode and date can be changed in one go.
   * @param {string} id - the task id.
   * @param {Date} now - the moment the dropdown is built against.
   * @returns {Element} the editor rows.
   */
  function buildTaskTimeEditor(id, now) {
    var task = findTask(id);
    var wrap = el("div", "task-edit-rows");
    var row = el("div", "task-time-edit");
    row.appendChild(buildTimeSelects(hhmm(new Date(task.deadline)),
      function (v) {
        if (!v) return;
        editTaskTime(id, v);
      }));
    row.appendChild(buildModeToggles(function () {
      var live = findTask(id);
      if (!live) return null;
      return live.mode;
    }, function (next) {
      if (!next) return;
      editTaskMode(id, next);
    }));
    wrap.appendChild(row);

    // an overdue deadline sits outside the picker's bounds, so show it empty
    var held = dayKey(new Date(task.deadline));
    if (!dateInRange(held, now)) {
      held = "";
    }
    var dateRow = el("div", "task-time-edit");
    dateRow.appendChild(buildDateInput(held, now, function (v) {
      editTaskDate(id, v);
    }, taskDateCeiling(task, now)));
    wrap.appendChild(dateRow);
    return wrap;
  }
```

With:

```js
  /**
   * Wires the `edit time? (N grass)` overlay onto a task's tier rows, the same
   * shape as the `edit?` overlay on its text. Once the deadline has passed,
   * tapping it toasts instead of opening the editor, and so does a balance
   * short of the price.
   * @param {Element} wrap - the tier-row wrapper (the positioning parent).
   * @param {string} id - the task id.
   */
  function attachTimeEdit(wrap, id) {
    wrap.addEventListener("click", function (e) {
      e.stopPropagation();
      closeEditOverlays();
      var shown = findTask(id);
      if (!shown) return;
      var overlay = el("button", "edit-overlay",
        "edit time? (" + editCost(shown) + " grass)");
      overlay.addEventListener("click", function (ev) {
        ev.stopPropagation();
        closeEditOverlays();
        // this tap never reaches the page handler, so another task's open
        // editor has to be closed (and its draft committed) here
        if (timeEditId) {
          closeTimeEdit();
        }
        var task = findTask(id);
        if (!task) return;
        if (deadlinePassed(task, getNow())) {
          refuseTimeEdit();
          return;
        }
        if (!canAffordEdit(task)) return;
        openTimeEdit(task, getNow());
        render();
      });
      wrap.appendChild(overlay);
    });
  }

  /**
   * Builds the deadline/leniency editor that replaces a task's tier rows while
   * it's open. Every control writes to the unsaved draft, which only commits as
   * one paid edit once the editor closes.
   * @param {string} id - the task id.
   * @param {Date} now - the moment the dropdown is built against.
   * @returns {Element} the editor rows.
   */
  function buildTaskTimeEditor(id, now) {
    var task = findTask(id);
    var draft = timeEditDraft;
    var wrap = el("div", "task-edit-rows");
    var row = el("div", "task-time-edit");
    row.appendChild(buildTimeSelects(draft.clock, function (v) {
      if (!v) return;
      draft.clock = v;
    }));
    row.appendChild(buildModeToggles(function () {
      return draft.mode;
    }, function (next) {
      // an active task always has a mode, so tapping the lit one does nothing
      if (!next) return;
      draft.mode = next;
      render();
    }));
    wrap.appendChild(row);

    var dateRow = el("div", "task-time-edit");
    dateRow.appendChild(buildDateInput(draft.date, now, function (v) {
      draft.date = v;
    }, taskDateCeiling(task, now)));
    wrap.appendChild(dateRow);
    return wrap;
  }
```

---

### Block 24: Replace [falsedge.js lines 2879–2881](../falsedge.js#L2879-L2881)

```js
    attachTextEdit(textRow, ".task-text", function (value) {
      editTaskText(id, value);
    });
```

With:

```js
    attachTextEdit(textRow, ".task-text", function (value) {
      editTaskText(id, value);
    }, function () {
      return findTask(id);
    });
```

Deletes the `x/48h` counter (`streakHoursLeft`, `buildStreakLeft`).

---

### Block 25: Replace [falsedge.js lines 2933–2957](../falsedge.js#L2933-L2957)

```js
  }

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

  /**
```

With:

```js
  }

  /**
```

---

### Block 26: Replace [falsedge.js lines 2969–2975](../falsedge.js#L2969-L2975)

```js
    var now = getNow();
    var section = buildSection("ACTIVE TASKS", "tasksCard", "sec-tasks",
      buildStreakLeft(now));
    var combo = buildComboRow(now);
    if (combo) {
      section.wrap.insertBefore(combo, section.card);
    }
```

With:

```js
    var now = getNow();
    var section = buildSection("ACTIVE TASKS", "tasksCard", "sec-tasks");
    var streak = buildStreakRow(now);
    if (streak) {
      section.wrap.insertBefore(streak, section.card);
    }
```

---

### Block 27: Replace [falsedge.js lines 3167–3168](../falsedge.js#L3167-L3168)

```js
  /**
   * Builds the WL/HL/MT toggle row. Tapping the lit one deselects it back to
```

With:

```js
  /**
   * Builds the DL/WL/HL/MT toggle row. Tapping the lit one deselects it back to
```

Every draw breaks a lapsed streak first, so nothing on screen can show a window that has already run out.

---

### Block 28: Replace [falsedge.js lines 3592–3593](../falsedge.js#L3592-L3593)

```js
  function render() {
    closeAllMenus();
```

With:

```js
  function render() {
    confirmStreakBreak();
    closeAllMenus();
```

---

### Block 29: Replace [falsedge.js lines 3614–3623](../falsedge.js#L3614-L3623)

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
```

With:

```js
    var st = appEl.querySelector(".streak-text");
    if (st) {
      var sr = st.closest(".streak-row");
      var sb = null;
      if (sr) {
        sb = sr.querySelector(".streak-bar");
      }
      if (sb) {
        var barR = sb.getBoundingClientRect().right;
        var stR = st.getBoundingClientRect();
        var covered = Math.max(0, barR - stR.left);
        var uncov = Math.max(0, stR.width - covered);
        st.style.setProperty("--streak-clip-r", uncov.toFixed(1) + "px");
```

Renames only, plus the old `? :` on the bar lookup expanded to an `if`.

---

### Block 30: Replace [falsedge.js lines 3690–3693](../falsedge.js#L3690-L3693)

```js
    if (timeEditId && !e.target.closest(".task-time-edit")) {
      timeEditId = null;
      render();
    }
```

With:

```js
    if (timeEditId && !e.target.closest(".task-time-edit")) {
      closeTimeEdit();
    }
```

Deletes `.streak-left` (the `x/48h` counter).

---

### Block 31: Replace [style-falsedge.css lines 163–170](../style-falsedge.css#L163-L170)

```css
  }
  .streak-left {
    font-size: 11px;
    letter-spacing: .04em;
    text-transform: none;
    font-variant-numeric: tabular-nums;
  }
  .fd-section .card {
```

With:

```css
  }
  .fd-section .card {
```

---

### Block 32: Replace [style-falsedge.css lines 467–515](../style-falsedge.css#L467-L515)

```css
  /* the tentative indicator, spanning both columns under the scores */
  .streak-indicator {
    grid-column: 1 / -1;
    margin-top: 4px;
    color: var(--c-red);
    font-size: 13px;
    letter-spacing: .02em;
  }
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

With:

```css
  /* the lockdown countdown, spanning both columns under the scores */
  .streak-indicator {
    grid-column: 1 / -1;
    margin-top: 4px;
    color: var(--c-red);
    font-size: 13px;
    letter-spacing: .02em;
  }
  /* streak indicator, sits under the active tasks label */
  .streak-row {
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
  .streak-bar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: var(--c-yellow);
    pointer-events: none;
  }
  .streak-text {
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
  .streak-text::after {
    content: "";
    position: absolute;
    inset: 0;
    box-shadow: inset 0 0 6px 1px var(--c-yellow);
    border-radius: inherit;
    clip-path: inset(0 var(--streak-clip-r, 0px) 0 0);
    pointer-events: none;
  }
```

---

### Block 33: Replace [style-falsedge.css lines 593–595](../style-falsedge.css#L593-L595)

```css
  .mode-btn {
    min-height: 40px;
    padding: 0 16px;
```

With:

```css
  .mode-btn {
    min-height: 40px;
    padding: 0 12px;
```

---

### Block 34: Replace [hex2-core.js lines 29–30](../hex2-core.js#L29-L30)

```js
  const GRASS_KEY = "grass.count";
  // Lockout dial: 12-hour face, 1/12 odds for +2 grass.
```

With:

```js
  const GRASS_KEY = "grass.count";
  // every merge that makes a 2048 pays this much grass, once per tile
  const GRASS_TILE = 2048;
  const GRASS_PER_TILE = 2;
  // set once the 2048s already on the boards have been paid for
  const RETRO_KEY = "grass.retro2048";
  const SAVE_KEYS = [
    "hex2.base.save", "hex2.jiggly.save",
    "hex2.challenge.save", "hex2.cascading.save"
  ];
  // Falsedge's spending is subtracted from GRASS_KEY, never written to it
  const FALSEDGE_KEY = "falsedge.data";
  // Lockout dial: 12-hour face, 1/12 odds for +2 grass.
```

---

### Block 35: Replace [hex2-core.js lines 161–162](../hex2-core.js#L161-L162)

```js
  // challenge only, and outside the snapshot so undo cannot refund its cost
  let hearts = START_HEARTS;
```

With:

```js
  // challenge only, and outside the snapshot so undo cannot refund its cost
  let hearts = START_HEARTS;
  // ids of tiles already paid grass for reaching 2048, outside the snapshot so
  // undoing and replaying a merge can't pay twice
  let paidTiles = new Set();
```

A merged tile keeps its first source tile's id, and a tile only ever grows, so an id can reach 2048 once per timeline. Only undo can replay it, and the set catches that.

---

### Block 36: Replace [hex2-core.js lines 328–330](../hex2-core.js#L328-L330)

```js
      }
    }
    updateScores();
```

With:

```js
      }
    }
    for (const key of res.mergedDests) {
      const t = board.get(key);
      if (t && t.value === GRASS_TILE && !paidTiles.has(t.id)) {
        paidTiles.add(t.id);
        addGrass(GRASS_PER_TILE);
        popTileGrass(key);
      }
    }
    updateScores();
```

---

### Block 37: Replace [hex2-core.js lines 1323–1325](../hex2-core.js#L1323-L1325)

```js
      history: history,
      hearts: hearts,
    }));
```

With:

```js
      history: history,
      hearts: hearts,
      paidTiles: Array.from(paidTiles),
    }));
```

---

### Block 38: Replace [hex2-core.js lines 1354–1357](../hex2-core.js#L1354-L1357)

```js
      hearts = START_HEARTS;
      if (typeof data.hearts === "number") {
        hearts = Math.min(MAX_HEARTS, Math.max(0, data.hearts));
      }
```

With:

```js
      hearts = START_HEARTS;
      if (typeof data.hearts === "number") {
        hearts = Math.min(MAX_HEARTS, Math.max(0, data.hearts));
      }
      paidTiles = new Set();
      if (Array.isArray(data.paidTiles)) {
        paidTiles = new Set(data.paidTiles);
      }
```

A new game restarts ids at 1, so the old paid list has to go with it.

---

### Block 39: Replace [hex2-core.js lines 1370–1371](../hex2-core.js#L1370-L1371)

```js
    idCounter = 1;
    hearts = START_HEARTS;
```

With:

```js
    idCounter = 1;
    hearts = START_HEARTS;
    paidTiles = new Set();
```

The lockout's total now shows the balance after Falsedge's spending, so it matches Grass Shop.

---

### Block 40: Replace [hex2-core.js lines 1574–1593](../hex2-core.js#L1574-L1593)

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
    if (!earn) {
      return;
    }
    earnNum.textContent = String(n);
    earn.classList.remove("pop");
    // reflow, so a second payout restarts the animation instead of ignoring it
    void earn.offsetWidth;
    earn.classList.add("pop");
  }
```

With:

```js
  // Grass on hand: the stored count less what Falsedge has spent on edits,
  // which Falsedge keeps in its own data so its undo can refund it.
  function grassBalance() {
    let spent = 0;
    try {
      const data = JSON.parse(store.get(FALSEDGE_KEY));
      if (data && typeof data.grassSpent === "number") {
        spent = data.grassSpent;
      }
    } catch (e) {
      // unreadable Falsedge data has spent nothing
    }
    return (parseInt(store.get(GRASS_KEY) || "0", 10) || 0) - spent;
  }

  function addGrass(award) {
    const n = parseInt(store.get(GRASS_KEY) || "0", 10) || 0;
    store.set(GRASS_KEY, String(n + award));
  }

  // Grass award per fake ad: normally 1, doubled to 2 when the dial landed on
  // 12. Has its own key so neither app can rewind it.
  function payGrass() {
    let award = 1;
    if (goldenPending) {
      award = 2;
    }
    addGrass(award);
    if (!earn) {
      return;
    }
    earnNum.textContent = String(grassBalance());
    earn.classList.remove("pop");
    // reflow, so a second payout restarts the animation instead of ignoring it
    void earn.offsetWidth;
    earn.classList.add("pop");
  }

  // Floats "+2 [grass]" up off a tile that just reached 2048. The board is one
  // canvas, so the tag is its own element laid over the tile's spot.
  function popTileGrass(key) {
    const p = posOf(key);
    if (!p) {
      return;
    }
    const tag = document.createElement("span");
    tag.className = "tile-earn";
    tag.style.left = p.x + "px";
    tag.style.top = p.y + "px";
    tag.innerHTML = "+" + GRASS_PER_TILE +
      ' <img src="assets/icon-grass.svg" alt="grass">';
    canvas.parentElement.appendChild(tag);
    tag.addEventListener("animationend", function () {
      tag.remove();
    });
  }

  const hexToastEl = document.getElementById("hex-toast");
  let hexToastTimer = 0;

  function hexToast(msg) {
    if (!hexToastEl) {
      return;
    }
    hexToastEl.textContent = msg;
    hexToastEl.classList.add("show");
    clearTimeout(hexToastTimer);
    hexToastTimer = setTimeout(function () {
      hexToastEl.classList.remove("show");
    }, 3200);
  }

  // One-off: pays for the 2048s already on every saved board, counting a bigger
  // tile as the 2048s it was built from, and marks those tiles paid so their
  // undo history can't pay for them again.
  function payRetroGrass() {
    if (store.get(RETRO_KEY)) {
      return;
    }
    store.set(RETRO_KEY, "1");
    let count = 0;
    for (const key of SAVE_KEYS) {
      let data = null;
      try {
        data = JSON.parse(store.get(key));
      } catch (e) {
        continue;
      }
      if (!data || !Array.isArray(data.tiles)) {
        continue;
      }
      const paid = [];
      for (const row of data.tiles) {
        if (row[1] >= GRASS_TILE) {
          count += row[1] / GRASS_TILE;
          paid.push(row[2]);
        }
      }
      data.paidTiles = paid;
      store.set(key, JSON.stringify(data));
    }
    if (!count) {
      return;
    }
    const award = count * GRASS_PER_TILE;
    addGrass(award);
    hexToast("+" + award + " grass for your 2048s 🌱");
  }
```

---

### Block 41: Replace [hex2-core.js lines 1852–1854](../hex2-core.js#L1852-L1854)

```js
    computeLayout();
    updateScores();
    if (!load()) {
```

With:

```js
    computeLayout();
    updateScores();
    // before load(), so this mode's board loads with its tiles marked paid
    payRetroGrass();
    if (!load()) {
```

---

### Block 42: Replace [hex2.html lines 70–72](../hex2.html#L70-L72)

```html
</footer>

<div class="lockout" id="lockout">
```

With:

```html
</footer>

<div class="hex-toast" id="hex-toast"></div>

<div class="lockout" id="lockout">
```

---

### Block 43: Replace [style-hex2.css lines 543–547](../style-hex2.css#L543-L547)

```css
  @keyframes earnpop {
    0% { transform: scale(1); }
    35% { transform: scale(1.45); }
    100% { transform: scale(1); }
  }
```

With:

```css
  @keyframes earnpop {
    0% { transform: scale(1); }
    35% { transform: scale(1.45); }
    100% { transform: scale(1); }
  }
  /* +2 grass floating up off a tile that just reached 2048 */
  .tile-earn {
    position: absolute;
    z-index: 5;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: #7ed534;
    font-size: 18px;
    font-weight: 800;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
    pointer-events: none;
    transform: translate(-50%, -50%);
    animation: tileearn 1.1s ease-out forwards;
  }
  .tile-earn img {
    display: block;
    width: 22px;
    height: 22px;
  }
  @keyframes tileearn {
    0% { opacity: 0; transform: translate(-50%, -50%) scale(.6); }
    20% { opacity: 1; transform: translate(-50%, -60%) scale(1.25); }
    100% { opacity: 0; transform: translate(-50%, -160%) scale(1); }
  }
  /* one-off notices, like the retroactive 2048 payout */
  .hex-toast {
    position: fixed;
    left: 50%;
    bottom: calc(24px + env(safe-area-inset-bottom));
    z-index: 110;
    max-width: calc(100vw - 32px);
    padding: 10px 16px;
    border: 1px solid var(--hex-line);
    border-radius: 12px;
    background: var(--hex-panel-2);
    color: #7ed534;
    font-size: 14px;
    font-weight: 700;
    opacity: 0;
    transform: translateX(-50%);
    transition: opacity .25s;
    pointer-events: none;
  }
  .hex-toast.show {
    opacity: 1;
  }
```

---

### Block 44: Replace [grass.html lines 30–43](../grass.html#L30-L43)

```html
<script>
// Grass lives under its own key rather than inside falsedge.data, so
// Falsedge's undo ring can never rewind grass earned in Hex 2^.
(function () {
  "use strict";
  var GRASS_KEY = "grass.count";
  var n = 0;
  try {
    n = parseInt(localStorage.getItem(GRASS_KEY) || "0", 10) || 0;
  } catch (e) {
    // storage blocked; the count falls back to zero
  }
  document.getElementById("grassCount").textContent = n;
})();
```

With:

```html
<script>
// Grass lives under its own key rather than inside falsedge.data, so
// Falsedge's undo ring can never rewind grass earned in Hex 2^. What Falsedge
// spends on edits is kept in falsedge.data instead, so its undo can refund it;
// the balance on hand is the one less the other.
(function () {
  "use strict";
  var GRASS_KEY = "grass.count";
  var n = 0;
  try {
    n = parseInt(localStorage.getItem(GRASS_KEY) || "0", 10) || 0;
    var data = JSON.parse(localStorage.getItem("falsedge.data"));
    if (data && typeof data.grassSpent === "number") {
      n -= data.grassSpent;
    }
  } catch (e) {
    // storage blocked or unreadable; the count stays at what was read
  }
  document.getElementById("grassCount").textContent = n;
})();
```

The Golden hour bullet was already stale (replaced by the combo in v2.25), so it goes.

---

### Block 45: Replace [about.md lines 35–38](../about.md#L35-L38)

> - A task is set with a deadline and a leniency tier: **WL** (whole leniency), **HL** (half leniency, tighter tolerance), **MT** (micro task — a newer, simpler class: flat 2 pts on time / 1 pt if up to an hour late, no ladder).
> - Completing on time or within a leniency tier pays a scaled point award that decays the later it's finished; completing very late (but within 24h of deadline) pays a flat 0.1 consolation; cancelling pays nothing.
> - A **streak** stays alive as long as *something* — any task, any tier, recurring or not — gets completed within a rolling 48-hour window. Breaking it locks the app out for a stretch.
> - **Golden hour**: a random 1-in-24 chance, rolled on leaving Hex 2^ back toward Falsedge, that makes every task pay extra for the following hour.

With:

> - A task is set with a deadline and a leniency tier: **DL** (double leniency, twice WL's tolerance), **WL** (whole leniency), **HL** (half leniency, tighter tolerance), **MT** (micro task — a newer, simpler class: flat 2 pts on time / 1 pt if up to an hour late, no ladder).
> - Completing on time or within a leniency tier pays a scaled point award that decays the later it's finished; completing very late (but within 24h of deadline) pays a flat 0.1 consolation; cancelling pays nothing.
> - A **streak** is a window that setting tasks extends: +6h while under 24h left, +2h once 24h or over, capped at 36h. Each set pays a small bonus that grows with each day of streak. When the window runs out the streak breaks: the score is banked and zeroed, and task setting locks for 36h. No streak means nothing can break.
> - Editing an active task costs grass: 1, then 2, then 3… per task. Text is one edit; time, date and mode in one editor session are one edit. Undo refunds it.

---

### Block 46: Replace [about.md lines 44–44](../about.md#L44-L44)

> - Sitting through that countdown earns **grass** (the secondary currency spent in Grass Shop).

With:

> - Sitting through that countdown earns **grass** (the secondary currency spent in Grass Shop and on Falsedge task edits), and so does every 2048 tile made: +2 each, once per tile.

---

### Block 47: changelog

Previous: v2.25.2 (2026-10-03 23H)

increment: +0.1 → **v2.26**

- Streak and combo are one thing now, called the streak. Setting a task extends it: +6h while under 24h left, +2h once 24h or over, capped at 36h. Still pays +0.1 pts per day of streak, up to +1.0.
- The streak breaks when its window runs out: score banked and zeroed, 36h lockout. No streak, no break, so after a lockout nothing can break again until you set a task.
- Removed the old 48h completion window, its `x/48h` counter and the `streak broke?` warning.
- The indicator reads `SE:` instead of `CE:`.
- Editing an active task now costs grass: 1 for the first edit, 2 for the next, and so on. The `edit?` and `edit time?` overlays show the price. Time, date and mode changes in one go count as one edit, saved when the editor closes. Undo refunds it.
- Hex 2^: every 2048 made pays +2 grass, popping up over the tile. Undo can't farm it. 2048s already sitting on saved boards pay out once, retroactively.
- New leniency mode: **DL**, double leniency (20/60/120 min tiers). Mode buttons are slimmer to fit four.
- Grass Shop shows the balance after edit spending.
