# Code draft: cancel cooldowns on everything

last updated: 2026-09-28 01H

Cancelling any task now locks the row it came from. Dailies rows gain a cooldown for the first time, which means they also gain the `cooldownUntil` field and the task-to-row link that never existed.

| case | cooldown |
| --- | --- |
| dailies cancel | 18h |
| `others` cancel, dated | 36h |
| `others` cancel, undated | 24h |

A SET-box task still takes nothing — it has no row to stamp.

`nonRecurring` leaves the cooldown condition entirely. Its completion behaviour (completing deletes the row) is untouched.

Per D7 there is no migration: an old task carrying `daily: true` and no `sourceRowId` simply takes no cooldown, and a `templates` row with no `cooldownUntil` reads as off cooldown.

---

### Block 1: Replace [falsedge.js lines 15-16](../falsedge.js#L15-L16)

```js
  var WEEK_MS = 7 * DAY_MS;
  // cancelling a dated `others` activation locks that row out this long
  var COOLDOWN_MS = 36 * 60 * 60 * 1000;
  // auto streak breakers + lockdown
```

With:

```js
  var WEEK_MS = 7 * DAY_MS;
  // cancelling a task locks the row it came from out this long, picked by
  // where the task came from and whether its activation carried a date
  var COOLDOWN_DATED_MS = 36 * 60 * 60 * 1000;
  var COOLDOWN_UNDATED_MS = 24 * 60 * 60 * 1000;
  var COOLDOWN_DAILY_MS = 18 * 60 * 60 * 1000;
  // auto streak breakers + lockdown
```

---

### Block 2: Replace [falsedge.js lines 368-374](../falsedge.js#L368-L374)

```js
   * `others` holds the ACTIVATE (others) rows - persistent records where the
   * row *is* the item, {id, text, time, mode, date, lastDone, cooldownUntil}.
   *
   * An active task is {id, text, deadline, mode, sourceRowId, hadDate}, and
   * `sourceRowId` points at the `others` row it was spawned from. Deleting that
   * row is deliberately never blocked, so the id may point at nothing; a miss
   * is the documented case, not a bug to guard against.
```

With:

```js
   * `others` holds the ACTIVATE (others) rows - persistent records where the
   * row *is* the item, {id, text, time, mode, date, lastDone, cooldownUntil}.
   * A `templates` row carries `cooldownUntil` too, so a cancelled daily can
   * lock its row the same way.
   *
   * An active task is {id, text, deadline, mode, sourceRowId, sourceKind,
   * hadDate}. `sourceRowId` points at the row it was spawned from and
   * `sourceKind` says which list to look in. Deleting that row is deliberately
   * never blocked, so the id may point at nothing; a miss is the documented
   * case, not a bug to guard against. A task set through SET has neither field.
```

---

### Block 3: Replace [falsedge.js lines 871-894](../falsedge.js#L871-L894)

```js
  /**
   * Resolves a task's `sourceRowId` back to its `others` row. A miss is the
   * normal case rather than an error - deleting a row is never blocked, so a
   * live task routinely outlives the row it was spawned from.
   * @param {Object} task - the active task.
   * @returns {Object|undefined} the row, if there is one and it still exists.
   */
  function sourceRowOf(task) {
    if (!task.sourceRowId) return undefined;
    return findRow("others", task.sourceRowId);
  }

  /**
   * Milliseconds left on an `others` row's cancel cooldown.
   * @param {Object} row - the row.
   * @param {Date} now - the reference moment.
   * @returns {number} the remainder, or 0 if the row isn't on cooldown.
   */
  function cooldownLeft(row, now) {
    if (!row.cooldownUntil) return 0;
    var until = new Date(row.cooldownUntil).getTime();
    if (isNaN(until)) return 0;
    return Math.max(0, until - now.getTime());
  }
```

With:

```js
  /**
   * Resolves a task's `sourceRowId` back to its row, in whichever list
   * `sourceKind` names. A miss is the normal case rather than an error -
   * deleting a row is never blocked, so a live task routinely outlives the
   * row it was spawned from.
   * @param {Object} task - the active task.
   * @returns {Object|undefined} the row, if there is one and it still exists.
   */
  function sourceRowOf(task) {
    if (!task.sourceRowId) return undefined;
    return findRow(task.sourceKind, task.sourceRowId);
  }

  /**
   * How long a cancel locks the row the task came from.
   * @param {Object} task - the task being cancelled.
   * @returns {number} the cooldown length in ms.
   */
  function cancelCooldownMs(task) {
    if (task.sourceKind === "dailies") {
      return COOLDOWN_DAILY_MS;
    }
    if (task.hadDate) {
      return COOLDOWN_DATED_MS;
    }
    return COOLDOWN_UNDATED_MS;
  }

  /**
   * Milliseconds left on a row's cancel cooldown.
   * @param {Object} row - the row.
   * @param {Date} now - the reference moment.
   * @returns {number} the remainder, or 0 if the row isn't on cooldown.
   */
  function cooldownLeft(row, now) {
    if (!row.cooldownUntil) return 0;
    var until = new Date(row.cooldownUntil).getTime();
    if (isNaN(until)) return 0;
    return Math.max(0, until - now.getTime());
  }
```

---

### Block 4: Replace [falsedge.js lines 1570-1580](../falsedge.js#L1570-L1580)

```js
  /**
   * Resolves an active task: awards points, writes its ledger entry, drops it
   * from `activeTasks`, and stamps whatever its source `others` row is owed -
   * `lastDone` on any completion, on time or late, and a 36h cancel cooldown
   * on a cancel that was activated with a date. A cancel never stamps
   * `lastDone`, and a source row that has since been deleted takes neither
   * stamp.
   *
   * A non-recurring row is the exception: completing it deletes the row
   * outright, and cancelling it takes the cooldown whether it carried a date
   * or not.
```

With:

```js
  /**
   * Resolves an active task: awards points, writes its ledger entry, drops it
   * from `activeTasks`, and stamps whatever its source row is owed. Every
   * cancel stamps a cooldown, whose length `cancelCooldownMs` picks. A
   * completion stamps `lastDone` instead, and only on an `others` row - a
   * daily's row is left alone, since nothing displays a daily's last done.
   * A source row that has since been deleted takes no stamp at all.
   *
   * A non-recurring row is the exception on the completion path only:
   * completing it deletes the row outright rather than stamping it.
```

---

### Block 5: Replace [falsedge.js lines 1601-1612](../falsedge.js#L1601-L1612)

```js
    var row = sourceRowOf(task);
    if (row && kind === "complete" && row.nonRecurring) {
      var rowAt = indexOfRow("others", row.id);
      if (rowAt !== -1) {
        state.others.splice(rowAt, 1);
      }
    } else if (row && kind === "complete") {
      row.lastDone = when.toISOString();
    } else if (row && (task.hadDate || row.nonRecurring)) {
      row.cooldownUntil =
        new Date(getNow().getTime() + COOLDOWN_MS).toISOString();
    }
```

With:

```js
    var row = sourceRowOf(task);
    if (row && kind === "cancel") {
      row.cooldownUntil = new Date(
        getNow().getTime() + cancelCooldownMs(task)).toISOString();
    } else if (row && task.sourceKind === "others") {
      if (row.nonRecurring) {
        var rowAt = indexOfRow("others", row.id);
        if (rowAt !== -1) {
          state.others.splice(rowAt, 1);
        }
      } else {
        row.lastDone = when.toISOString();
      }
    }
```

---

### Block 6: Replace [falsedge.js lines 1692-1697](../falsedge.js#L1692-L1697)

```js
  /**
   * Cancels a task: no points, a "none (cancelled)" ledger entry, no
   * `lastDone`, and - only if it was activated with a date set - a 36h
   * cooldown on the `others` row it came from.
   * @param {string} id - the task id.
   */
```

With:

```js
  /**
   * Cancels a task: no points, a "none (cancelled)" ledger entry, no
   * `lastDone`, and a cooldown on the row it came from - 36h dated, 24h
   * undated, 18h for a daily.
   * @param {string} id - the task id.
   */
```

---

### Block 7: Replace [falsedge.js lines 2058-2063](../falsedge.js#L2058-L2063)

```js
      state.templates.push({
        id: uid(),
        text: text,
        time: draft.time,
        mode: draft.mode
      });
```

With:

```js
      state.templates.push({
        id: uid(),
        text: text,
        time: draft.time,
        mode: draft.mode,
        cooldownUntil: null
      });
```

---

### Block 8: Replace [falsedge.js lines 2231-2234](../falsedge.js#L2231-L2234)

```js
   * Creates an active task straight from a row, bypassing SET entirely. Text,
   * WL/HL and a time are all required in both sections; the date is optional
   * and only exists on `others` rows. An `others` row additionally has to be
   * off cooldown and have no live task of its own already out.
```

With:

```js
   * Creates an active task straight from a row, bypassing SET entirely. Text,
   * WL/HL and a time are all required in both sections, and a row on cooldown
   * is refused in both. The date is optional and only exists on `others`
   * rows, which additionally must have no live task of their own already out.
```

---

### Block 9: Replace [falsedge.js lines 2256-2296](../falsedge.js#L2256-L2296)

```js
    var date = "";
    if (kind === "others") {
      var left = cooldownLeft(row, now);
      if (left > 0) {
        toast("on cooldown - " + formatLeft(left) + " left");
        return;
      }
      if (rowIsOut(id)) {
        toast("already out as a task");
        return;
      }
      date = row.date || "";
      if (date && !dateInRange(date, now)) {
        toast("invalid date");
        return;
      }
    }
    var deadline = resolveDeadline(row.time, date, now);
    if (deadline.getTime() - now.getTime() < MIN_LEAD_MS) {
      toast("invalid time");
      return;
    }
    if (!deadlineClear(deadline, now)) return;
    var iso = deadline.toISOString();
    pushUndo("activate row");
    awardComboSet(now);
    var task = {
      id: uid(),
      text: text,
      deadline: iso,
      mode: row.mode
    };
    if (kind === "others") {
      task.sourceRowId = id;
      // the cancel cooldown keys off this, not off the deadline: a dated
      // activation may still land inside 24h and so never look "further"
      task.hadDate = date !== "";
      row.date = "";
    } else {
      task.daily = true;
    }
```

With:

```js
    var left = cooldownLeft(row, now);
    if (left > 0) {
      toast("on cooldown - " + formatLeft(left) + " left");
      return;
    }
    var date = "";
    if (kind === "others") {
      if (rowIsOut(id)) {
        toast("already out as a task");
        return;
      }
      date = row.date || "";
      if (date && !dateInRange(date, now)) {
        toast("invalid date");
        return;
      }
    }
    var deadline = resolveDeadline(row.time, date, now);
    if (deadline.getTime() - now.getTime() < MIN_LEAD_MS) {
      toast("invalid time");
      return;
    }
    if (!deadlineClear(deadline, now)) return;
    var iso = deadline.toISOString();
    pushUndo("activate row");
    awardComboSet(now);
    var task = {
      id: uid(),
      text: text,
      deadline: iso,
      mode: row.mode,
      sourceRowId: id,
      sourceKind: kind
    };
    if (kind === "others") {
      // the cancel cooldown keys off this, not off the deadline: a dated
      // activation may still land inside 24h and so never look "further"
      task.hadDate = date !== "";
      row.date = "";
    }
```

---

### Block 10: Replace [falsedge.js lines 3418-3425](../falsedge.js#L3418-L3425)

```js
    if (kind === "others") {
      var left = cooldownLeft(r, now);
      if (left > 0) {
        row.classList.add("row-oncooldown");
        row.appendChild(el("div", "row-oncooldown-note",
          "on cooldown - " + formatLeft(left) + " left"));
      }
    }
```

With:

```js
    var left = cooldownLeft(r, now);
    if (left > 0) {
      row.classList.add("row-oncooldown");
      row.appendChild(el("div", "row-oncooldown-note",
        "on cooldown - " + formatLeft(left) + " left"));
    }
```

---

### Block 11: changelog

increment: +0.01

- Cancelling a task now always locks the row it came from. A dated `others` row takes 36h, an undated one 24h, and a dailies row 18h.
- Dailies rows can go on cooldown for the first time, showing the same dimmed `on cooldown - Xh left` note as `others` rows and refusing to activate while it runs.
- Marking a row non-recurring no longer affects its cancel cooldown, since every cancel now takes one. Completing a non-recurring row still deletes it.
