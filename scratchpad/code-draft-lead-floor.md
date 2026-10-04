# Code draft: remove the 20-minute lead floor

Last updated: 2026-10-03 22:58

Target file: `falsedge.js` (unmodified since this draft was written).

Rule after the change: a deadline must be strictly in the future. Nothing else about timing is checked. A deadline that becomes past after being set is the normal overdue path, same as 5h later.

Untouched on purpose: the 10-minute dropdown steps, the +30/40/50/60 quick buttons, and the overlap and stale-task rules.

Note on Block 10: the "discard a held time under the floor" branch in `setChosenTime` was already dead code. `resolveClockTime` rolls any too-close time to tomorrow, so the lead it measured could never be under the floor. It goes away with the floor. The +20 minute default suggestion stays as a plain default.

---

### Block 1: Replace [falsedge.js line 12](../falsedge.js#L12)

```js
  var COPY_WINDOW_MS = 10 * 60 * 1000;
  var MIN_LEAD_MS = 20 * 60 * 1000;
  var DAY_MS = 24 * 60 * 60 * 1000;
```

With:

```js
  var COPY_WINDOW_MS = 10 * 60 * 1000;
  var DAY_MS = 24 * 60 * 60 * 1000;
```

---

### Block 2: Replace [falsedge.js line 185](../falsedge.js#L185)

```js
  /**
   * Resolves a bare "HH:MM" clock time to its next settable occurrence -
   * today's if it still clears the 20-minute lead, tomorrow's otherwise.
   * @param {string} t - a clock time, "HH:MM".
```

With:

```js
  /**
   * Resolves a bare "HH:MM" clock time to its next settable occurrence -
   * today's if it is still ahead of now, tomorrow's otherwise.
   * @param {string} t - a clock time, "HH:MM".
```

---

### Block 3: Replace [falsedge.js line 195](../falsedge.js#L195)

```js
    d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
    if (d.getTime() < now.getTime() + MIN_LEAD_MS) {
      d.setDate(d.getDate() + 1);
    }
```

With:

```js
    d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
    if (d.getTime() <= now.getTime()) {
      d.setDate(d.getDate() + 1);
    }
```

---

### Block 4: Replace [falsedge.js line 1765](../falsedge.js#L1765)

```js
   * Moves an active task's deadline. Validated exactly as SET validates a new
   * one - resolved from `getNow()` at tap time, held to the same 20-minute
   * floor, and refused if another active task already holds that instant. The
   * task's own deadline is excluded from the overlap check, since a task can
   * hardly clash with itself.
```

With:

```js
   * Moves an active task's deadline. Validated exactly as SET validates a new
   * one - resolved from `getNow()` at tap time, refused if it is not in the
   * future, and refused if another active task already holds that instant. The
   * task's own deadline is excluded from the overlap check, since a task can
   * hardly clash with itself.
```

---

### Block 5: Replace [falsedge.js line 1791](../falsedge.js#L1791)

```js
   * Holds a proposed deadline to the 20-minute floor and the overlap rule,
   * then commits it. The task's own deadline is excluded from the overlap
   * check, since a task can hardly clash with itself. Refused outright once
   * that deadline has passed.
```

With:

```js
   * Refuses a proposed deadline that is not in the future, or that overlaps
   * another task, then commits it. The task's own deadline is excluded from the
   * overlap check, since a task can hardly clash with itself. Refused outright
   * once that deadline has passed.
```

---

### Block 6: Replace [falsedge.js line 1799](../falsedge.js#L1799)

```js
   * @param {string} tooSoon - toast for a deadline under the floor.
```

With:

```js
   * @param {string} tooSoon - toast for a deadline not in the future.
```

---

### Block 7: Replace [falsedge.js line 1808](../falsedge.js#L1808)

```js
    if (deadline.getTime() - now.getTime() < MIN_LEAD_MS) {
      toast(tooSoon);
      render();
```

With:

```js
    if (deadline.getTime() <= now.getTime()) {
      toast(tooSoon);
      render();
```

---

### Block 8: Replace [falsedge.js line 2023](../falsedge.js#L2023)

```js
    if (deadline.getTime() - now.getTime() < MIN_LEAD_MS) {
      toast("refreshed");
      render();
```

With:

```js
    if (deadline.getTime() <= now.getTime()) {
      toast("refreshed");
      render();
```

---

### Block 9: Replace [falsedge.js line 2283](../falsedge.js#L2283)

```js
    if (deadline.getTime() - now.getTime() < MIN_LEAD_MS) {
      toast("invalid time");
      return;
```

With:

```js
    if (deadline.getTime() <= now.getTime()) {
      toast("invalid time");
      return;
```

---

### Block 10: Replace [falsedge.js lines 3125-3143](../falsedge.js#L3125-L3143)

```js
  /**
   * The clock time SET is working with: the draft's, or the next 10-minute mark
   * past the 20-minute floor. Both the dropdown and the submit read this.
   * @param {Date} now - the reference moment.
   * @returns {string} a clock time, "HH:MM".
   */
  function setChosenTime(now) {
    var held = state.setDraft.time;
    if (held) {
      if (state.setDraft.date) {
        return held;
      }
      var lead = resolveClockTime(held, now).getTime() - now.getTime();
      if (lead >= MIN_LEAD_MS) {
        return held;
      }
    }
    return hhmm(ceil10(addMinutes(now, 20)));
  }
```

With:

```js
  /**
   * The clock time SET is working with: the draft's, or the next 10-minute mark
   * 20 minutes out. Both the dropdown and the submit read this.
   * @param {Date} now - the reference moment.
   * @returns {string} a clock time, "HH:MM".
   */
  function setChosenTime(now) {
    var held = state.setDraft.time;
    if (held) {
      return held;
    }
    return hhmm(ceil10(addMinutes(now, 20)));
  }
```

---

### Block 11: changelog

increment: +0.0.1 (previous: v2.25.1, 2026-09-29 03H)

> **v2.25.2** `2026-10-03 23H`
> STUPID 20 MINUTE MINIMUM BUFFER ON DEADLINES IS REMOVED!!! SET DEADLINES FREELY!!! DUE IN 2 MINUTES! 6 MINUTES! WHATEVER! GO GO GO

---
